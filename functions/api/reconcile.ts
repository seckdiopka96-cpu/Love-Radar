import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {readReconciliationTexts,hasReconciliationMessage,canRevealReconciliation} from "../../src/reconcile-rules";

type Ctx={request:Request;env:PushEnv;waitUntil:(promise:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string;seat:number};
type SessionRow={id:string;room_id:string;initiated_by:string;status:string;created_at:number;updated_at:number};
type EntryRow={member_id:string;pain:string;needs:string;message:string;submitted:number;updated_at:number;submitted_at:number|null};
const ok=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"private, no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"private, no-store"}});
let tables:Promise<void>|null=null;
function ensure(db:D1Database):Promise<void>{
 if(!tables)tables=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_reconciliations (room_id TEXT PRIMARY KEY,id TEXT NOT NULL,initiated_by TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS couple_reconciliation_entries (session_id TEXT NOT NULL,member_id TEXT NOT NULL,pain TEXT NOT NULL DEFAULT '',needs TEXT NOT NULL DEFAULT '',message TEXT NOT NULL DEFAULT '',submitted INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,submitted_at INTEGER,PRIMARY KEY(session_id,member_id));"+
  "CREATE INDEX IF NOT EXISTS idx_reconciliation_entries_session ON couple_reconciliation_entries(session_id);"
 ).then(()=>{}).catch(error=>{tables=null;throw error});
 return tables;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function load(db:D1Database,roomId:string):Promise<SessionRow|null>{
 return db.prepare("SELECT * FROM couple_reconciliations WHERE room_id=?").bind(roomId).first<SessionRow>();
}
async function getEntry(db:D1Database,session:string,id:string):Promise<EntryRow|null>{
 return db.prepare("SELECT member_id,pain,needs,message,submitted,updated_at,submitted_at FROM couple_reconciliation_entries WHERE session_id=? AND member_id=?")
  .bind(session,id).first<EntryRow>();
}
async function view(db:D1Database,user:Member,session:SessionRow|null){
 if(!session||session.status==="closed")return {session:null};
 const people=await db.prepare("SELECT id,name FROM members WHERE room_id=? ORDER BY seat ASC").bind(user.room_id)
  .all<{id:string;name:string}>();
 const members=people.results||[];
 const [myEntry,otherEntry]=await Promise.all([
  getEntry(db,session.id,user.id),
  db.prepare("SELECT e.member_id,e.pain,e.needs,e.message,e.submitted,e.updated_at,e.submitted_at FROM couple_reconciliation_entries e JOIN members m ON m.id=e.member_id WHERE e.session_id=? AND m.room_id=? AND e.member_id<>? LIMIT 1")
   .bind(session.id,user.room_id,user.id).first<EntryRow>()
 ]);
 const ready=canRevealReconciliation(session.status,myEntry?.submitted===1,otherEntry?.submitted===1);
 return {
  session:{
   id:session.id,status:session.status,createdAt:session.created_at,
   initiatedByMe:session.initiated_by===user.id,
   mySubmitted:Boolean(myEntry?.submitted),
   partnerSubmitted:Boolean(otherEntry?.submitted),
   myDraft:{pain:myEntry?.pain||"",needs:myEntry?.needs||"",message:myEntry?.message||""},
   // Critical privacy boundary: do not return partner text until both have explicitly submitted.
   partnerText:ready?{pain:otherEntry?.pain||"",needs:otherEntry?.needs||"",message:otherEntry?.message||""}:null,
   partnerName:members.find(m=>m.id!==user.id)?.name||null,
   bothReady:ready
  }
 };
}
async function run(ctx:Ctx,method:"GET"|"POST"):Promise<Response>{
 try{
  const db=ctx.env.DB;if(!db)return fail("Cet espace n’est pas disponible pour le moment.",503);
  const member=await auth(ctx.request,db);
  if(!member)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  let session=await load(db,member.room_id);
  if(method==="GET")return ok(await view(db,member,session));
  const raw=await ctx.request.text();
  if(raw.length>85000)return fail("Texte trop long. Essaie de le raccourcir légèrement.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  const action=data.action;
  const now=Date.now();
  if(action==="start"){
   if(session&&session.status!=="closed")return ok(await view(db,member,session));
   const id=crypto.randomUUID();
   if(!session){
    await db.prepare("INSERT OR IGNORE INTO couple_reconciliations(room_id,id,initiated_by,status,created_at,updated_at) VALUES(?,?,?,'writing',?,?)")
     .bind(member.room_id,id,member.id,now,now).run();
   }else{
    // Clear previous private disclosures before starting the next round.
    await db.prepare("DELETE FROM couple_reconciliation_entries WHERE session_id=?").bind(session.id).run();
    await db.prepare("UPDATE couple_reconciliations SET id=?,initiated_by=?,status='writing',created_at=?,updated_at=? WHERE room_id=? AND status='closed'")
     .bind(id,member.id,now,now,member.room_id).run();
   }
   session=await load(db,member.room_id);
   if(session?.id===id){
    ctx.waitUntil(notifyPartner(ctx.env,member.room_id,member.id,
     "🕊️ Une invitation à se comprendre",
     member.name.slice(0,30)+" aimerait que vous puissiez vous exprimer calmement. Réponds uniquement si tu en as envie.","reconcile"));
   }
   return ok(await view(db,member,session));
  }
  if(!session||session.status==="closed")return fail("Commence d’abord une nouvelle démarche.",409);
  if(typeof data.sessionId!=="string"||data.sessionId!==session.id)return fail("Cette démarche a changé. Recharge la page.",409);
  if(action==="close"){
   await db.prepare("UPDATE couple_reconciliations SET status='closed',updated_at=? WHERE room_id=? AND id=?")
    .bind(now,member.room_id,session.id).run();
   await db.prepare("DELETE FROM couple_reconciliation_entries WHERE session_id=?").bind(session.id).run();
   return ok({session:null});
  }
  if(action!=="save"&&action!=="submit")return fail("Action inconnue.");
  if(session.status!=="writing")return fail("Les textes ont déjà été dévoilés. Termine cette démarche pour en ouvrir une autre.",409);
  const texts=readReconciliationTexts(data);
  if(!texts)return fail("Chaque texte doit respecter la limite de taille.",400);
  if(action==="submit"&&!hasReconciliationMessage(texts))
   return fail("Écris d’abord ce que tu ressens, avec tes propres mots.");
  // One participant never has database access to another participant's drafts.
  // Save cannot overwrite a final submitted text, even during concurrent requests.
  const result=await db.prepare(
   "INSERT INTO couple_reconciliation_entries(session_id,member_id,pain,needs,message,submitted,updated_at,submitted_at) VALUES(?,?,?,?,?,?,?,?)"+
   " ON CONFLICT(session_id,member_id) DO UPDATE SET pain=excluded.pain,needs=excluded.needs,message=excluded.message,submitted=excluded.submitted,updated_at=excluded.updated_at,submitted_at=excluded.submitted_at WHERE couple_reconciliation_entries.submitted=0"
  ).bind(session.id,member.id,texts.pain,texts.needs,texts.message,action==="submit"?1:0,
   now,action==="submit"?now:null).run();
  if(result.meta.changes!==1)return fail("Ton texte est déjà envoyé. Tu ne peux plus le modifier.",409);
  if(action==="submit"){
   const entries=await db.prepare(
    "SELECT COUNT(*) AS n FROM couple_reconciliation_entries e JOIN members m ON m.id=e.member_id WHERE e.session_id=? AND m.room_id=? AND e.submitted=1"
   ).bind(session.id,member.room_id).first<{n:number}>();
   const members=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?")
    .bind(member.room_id).first<{n:number}>();
   if(Number(entries?.n||0)>=2&&Number(members?.n||0)>=2){
    const revealed=await db.prepare("UPDATE couple_reconciliations SET status='revealed',updated_at=? WHERE room_id=? AND id=? AND status='writing'")
     .bind(now,member.room_id,session.id).run();
    if(revealed.meta.changes===1){
     ctx.waitUntil(notifyPartner(ctx.env,member.room_id,member.id,
      "💌 Vos deux messages sont prêts",
      "Vos mots sont maintenant accessibles à vous deux dans Mode Réconciliation.","reconcile"));
    }
   }else{
    ctx.waitUntil(notifyPartner(ctx.env,member.room_id,member.id,
     "💗 Ton amour s’est exprimé",
     member.name.slice(0,30)+" a terminé son texte. Tu peux écrire le tien à ton rythme, sans pression.","reconcile"));
   }
  }
  return ok(await view(db,member,await load(db,member.room_id)));
 }catch(e){
  console.error("Love Radar reconciliation API",e);
  return fail("Impossible d’enregistrer pour le moment. Ton texte reste visible sur ton écran.",500);
 }
}
export const onRequestGet=(ctx:Ctx)=>run(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>run(ctx,"POST");
