import type { D1Database } from "@cloudflare/workers-types";
import { notifyPartner } from "../lib/push";
import {notifyIncomingVoip,type VoipEnv} from "../lib/apns-voip";
import {consumeMemberLimit,MEMBER_LIMITS,throttled} from "../lib/abuse-limits";

type Env = VoipEnv;
type Context = {request:Request;env:Env;waitUntil:(task:Promise<unknown>)=>void};
type Member = {id:string;room_id:string;name:string};
type VoiceCall = {id:string;room_id:string;caller_id:string;callee_id:string;status:string;created_at:number;updated_at:number;expires_at:number};
const response=(data:Record<string,unknown>,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>response({ok:false,error},status);
const now=()=>Date.now();
async function authenticate(request:Request,db:D1Database):Promise<Member|null>{
 const raw=request.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(raw))return null;
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw.slice(7)));
 const hashed=Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?").bind(hashed).first<Member>();
}
// Tables are initialized automatically; one migration per isolate.
let ready:Promise<void>|null=null;
async function ensureTables(db:D1Database){
 if(!ready){
  const initializing=db.exec(
   "CREATE TABLE IF NOT EXISTS voice_calls (id TEXT PRIMARY KEY,room_id TEXT NOT NULL,caller_id TEXT NOT NULL,callee_id TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);"+
   "CREATE INDEX IF NOT EXISTS idx_voice_calls_room ON voice_calls(room_id,expires_at);"+
   "CREATE TABLE IF NOT EXISTS voice_signals (id INTEGER PRIMARY KEY AUTOINCREMENT,call_id TEXT NOT NULL,room_id TEXT NOT NULL,from_member TEXT NOT NULL,to_member TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);"+
   "CREATE INDEX IF NOT EXISTS idx_voice_signals_next ON voice_signals(call_id,to_member,id);"+
   "CREATE TABLE IF NOT EXISTS voice_call_history ("+
   "call_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,connected_at INTEGER,ended_at INTEGER,outcome TEXT);"+
   "CREATE INDEX IF NOT EXISTS idx_voice_call_history_room ON voice_call_history(room_id);"
  ).then(()=>{}).catch(err=>{ready=null;throw err});
  ready=initializing;
 }
 await ready;
}
async function activeCall(db:D1Database,roomId:string):Promise<VoiceCall|null>{
 return db.prepare("SELECT id,room_id,caller_id,callee_id,status,created_at,updated_at,expires_at FROM voice_calls WHERE room_id=? AND status IN ('ringing','active') AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(roomId,now()).first<VoiceCall>();
}
function view(call:VoiceCall|null,u:Member){
 if(!call)return null;
 return {id:call.id,status:call.status,direction:call.caller_id===u.id?"outgoing":"incoming",createdAt:call.created_at,updatedAt:call.updated_at,expiresAt:call.expires_at};
}
export async function onRequestGet({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB)return fail("Service vocal indisponible.",503);
  const u=await authenticate(request,env.DB);
  if(!u)return fail("Session expirée.",401);
  await ensureTables(env.DB);
  const query=new URL(request.url).searchParams;
  if(query.get("history")==="1"){
   const result=await env.DB.prepare(
    "SELECT v.id,v.caller_id,v.callee_id,v.status,v.created_at,v.updated_at,v.expires_at,"+
    "h.connected_at,h.ended_at,h.outcome FROM voice_calls v "+
    "JOIN voice_call_history h ON h.call_id=v.id AND h.room_id=v.room_id "+
    "WHERE v.room_id=? ORDER BY v.created_at DESC LIMIT 80"
   ).bind(u.room_id).all<VoiceCall & {connected_at:number|null;ended_at:number|null;outcome:string|null}>();
   const t=now();
   const calls=(result.results||[]).map(row=>{
    const connectedAt=Number(row.connected_at||0);
    const expired=row.expires_at<=t&&row.status!=="ended";
    const status=row.status==="ended"?connectedAt?"completed":row.outcome||"missed":
     expired?connectedAt?"interrupted":"missed":row.status;
    const endedAt=row.status==="ended"?Number(row.ended_at||row.updated_at):
     expired?row.updated_at:0;
    // Time begins when the recipient accepts; never count unanswered ringing.
    const durationSeconds=connectedAt?Math.max(0,Math.floor(((endedAt||t)-connectedAt)/1000)):0;
    return {id:row.id,callerId:row.caller_id,createdAt:row.created_at,
     connectedAt,endedAt,status,durationSeconds};
   }).reverse();
   return response({ok:true,calls,serverNow:t});
  }
  const call=await activeCall(env.DB,u.room_id);
  let signals:{id:number;kind:string;payload:string}[]=[];
  if(call){
   const after=Math.max(0,Math.floor(Number(new URL(request.url).searchParams.get("after")||0)))||0;
   const rows=await env.DB.prepare("SELECT id,kind,payload FROM voice_signals WHERE call_id=? AND to_member=? AND id>? ORDER BY id ASC LIMIT 40")
    .bind(call.id,u.id,after).all<{id:number;kind:string;payload:string}>();
   signals=rows.results||[];
  }
  return response({ok:true,call:view(call,u),signals});
 }catch(e){console.error("Love Radar call GET",e);return fail("Appel momentanément indisponible.",503)}
}
export async function onRequestPost({request,env,waitUntil}:Context):Promise<Response>{
 try{
  if(!env.DB)return fail("Service vocal indisponible.",503);
  const u=await authenticate(request,env.DB);
  if(!u)return fail("Session expirée.",401);
  const length=Number(request.headers.get("content-length")||0);
  if(length>35000)return fail("Données trop volumineuses.",413);
  const text=await request.text();if(text.length>35000)return fail("Données trop volumineuses.",413);
  let body:Record<string,unknown>;
  try{body=JSON.parse(text)}catch{return fail("Format incorrect.")}
  await ensureTables(env.DB);
  const action=String(body.action||"");
  const db=env.DB,t=now();
  if(action==="start"){
   const partner=await db.prepare("SELECT id FROM members WHERE room_id=? AND id<>? LIMIT 1").bind(u.room_id,u.id).first<{id:string}>();
   if(!partner)return fail("L’autre personne doit rejoindre votre espace.",409);
   const existing=await activeCall(db,u.room_id);
   if(existing)return response({ok:true,call:view(existing,u),already:true});
   if(!await consumeMemberLimit(db,u.id,MEMBER_LIMITS.call))return throttled(MEMBER_LIMITS.call);
   const id=crypto.randomUUID();
   const created=await db.prepare("INSERT INTO voice_calls(id,room_id,caller_id,callee_id,status,created_at,updated_at,expires_at) SELECT ?,?,?,?,'ringing',?,?,? WHERE NOT EXISTS (SELECT 1 FROM voice_calls WHERE room_id=? AND status IN ('ringing','active') AND expires_at>?)")
    .bind(id,u.room_id,u.id,partner.id,t,t,t+60000,u.room_id,t).run();
   const call=await activeCall(db,u.room_id);
   if(!call)return fail("Impossible de démarrer l’appel.",503);
   if(created.meta.changes){
    await db.prepare("INSERT OR IGNORE INTO voice_call_history(call_id,room_id) VALUES(?,?)")
     .bind(call.id,u.room_id).run();
    waitUntil(Promise.all([
     notifyPartner(env,u.room_id,u.id,"📞 Appel entrant",u.name+" t’appelle. Appuie pour répondre.","chat",{kind:"call",id:call.id}),
     notifyIncomingVoip(env,u.room_id,partner.id,call.id,u.name,call.expires_at)
    ]).then(()=>{}));
   }
   return response({ok:true,call:view(call,u),already:!created.meta.changes});
  }
  const id=typeof body.id==="string"?body.id:"";
  if(!/^[0-9a-f-]{36}$/.test(id))return fail("Appel invalide.",400);
  const call=await db.prepare("SELECT id,room_id,caller_id,callee_id,status,created_at,updated_at,expires_at FROM voice_calls WHERE id=? AND room_id=?")
    .bind(id,u.room_id).first<VoiceCall>();
  if(!call||!["ringing","active"].includes(call.status)||call.expires_at<t)return fail("Cet appel est terminé.",409);
  if(action==="accept"){
   if(call.callee_id!==u.id)return fail("Seul le destinataire peut répondre.",403);
   if(call.status==="ringing"){
    const accepted=await db.prepare("UPDATE voice_calls SET status='active',updated_at=?,expires_at=? WHERE id=? AND status='ringing' AND expires_at>?")
     .bind(t,t+90000,call.id,t).run();
    if(accepted.meta.changes===1){
     await db.prepare("INSERT OR IGNORE INTO voice_call_history(call_id,room_id) VALUES(?,?)").bind(call.id,u.room_id).run();
     await db.prepare("UPDATE voice_call_history SET connected_at=COALESCE(connected_at,?) WHERE call_id=? AND room_id=?")
      .bind(t,call.id,u.room_id).run();
    }
   }
   return response({ok:true,accepted:true});
  }
  if(action==="heartbeat"){
   if(call.status!=="active")return fail("Appel non accepté.",409);
   await db.prepare("UPDATE voice_calls SET expires_at=?,updated_at=? WHERE id=? AND room_id=? AND status='active'")
    .bind(t+90000,t,call.id,u.room_id).run();
   return response({ok:true,alive:true});
  }
  if(action==="decline"||action==="end"){
   if(action==="decline"&&call.callee_id!==u.id)return fail("Seul le destinataire peut refuser.",403);
   const ended=await db.prepare("UPDATE voice_calls SET status='ended',updated_at=? WHERE id=? AND room_id=? AND status IN ('ringing','active')")
    .bind(t,call.id,u.room_id).run();
   if(ended.meta.changes===1){
    const outcome=call.status==="active"?"completed":action==="decline"?"declined":"cancelled";
    await db.prepare("INSERT OR IGNORE INTO voice_call_history(call_id,room_id) VALUES(?,?)").bind(call.id,u.room_id).run();
    await db.prepare("UPDATE voice_call_history SET ended_at=COALESCE(ended_at,?),outcome=COALESCE(outcome,?) WHERE call_id=? AND room_id=?")
     .bind(t,outcome,call.id,u.room_id).run();
   }
   await db.prepare("DELETE FROM voice_signals WHERE call_id=? AND room_id=?").bind(call.id,u.room_id).run();
   return response({ok:true,ended:true});
  }
  if(action==="signal"){
   if(call.status!=="active")return fail("L’appel doit d’abord être accepté.",409);
   const kind=body.kind;
   if(kind!=="offer"&&kind!=="answer"&&kind!=="candidate")return fail("Signal invalide.");
   if(kind==="offer"&&call.caller_id!==u.id)return fail("Signal invalide.",403);
   if(kind==="answer"&&call.callee_id!==u.id)return fail("Signal invalide.",403);
   const remote=call.caller_id===u.id?call.callee_id:call.caller_id;
   let payload:string;
   if(kind==="candidate"){
    // Trickle ICE: transmit candidates as they arrive, never wait 14 seconds for
    // ICE gathering to finish. Validate every fragment before storing it.
    const candidate=body.candidate;
    if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return fail("Candidat réseau invalide.");
    const ice=candidate as Record<string,unknown>;
    if(typeof ice.candidate!=="string"||!ice.candidate.startsWith("candidate:")||ice.candidate.length>2600)
     return fail("Candidat réseau invalide.");
    const mid=ice.sdpMid;
    const index=ice.sdpMLineIndex;
    if(mid!==undefined&&mid!==null&&(typeof mid!=="string"||mid.length>30))return fail("Média invalide.");
    if(index!==undefined&&index!==null&&(!Number.isInteger(index)||Number(index)<0||Number(index)>4))return fail("Média invalide.");
    const fragment=ice.usernameFragment;
    if(fragment!==undefined&&fragment!==null&&(typeof fragment!=="string"||fragment.length>128))return fail("Identifiant réseau invalide.");
    payload=JSON.stringify({candidate:ice.candidate,sdpMid:mid??null,sdpMLineIndex:index??null,
     ...(typeof fragment==="string"?{usernameFragment:fragment}:{})});
    // Cap short-lived signal records so the endpoint cannot be flooded.
    const count=await db.prepare("SELECT COUNT(*) AS n FROM voice_signals WHERE call_id=? AND from_member=? AND kind='candidate'")
     .bind(call.id,u.id).first<{n:number}>();
    if(Number(count?.n||0)>=64)return fail("Nombre maximum de chemins réseau atteint.",429);
   }else{
    const sdp=body.sdp;
    if(typeof sdp!=="string"||!sdp.startsWith("v=0")||sdp.length>30000||sdp.length<50)return fail("Signal incorrect.");
    payload=sdp;
    const previous=await db.prepare("SELECT id FROM voice_signals WHERE call_id=? AND from_member=? AND kind=? LIMIT 1")
     .bind(call.id,u.id,kind).first();
    if(previous)return response({ok:true,duplicate:true});
   }
   await db.prepare("INSERT INTO voice_signals(call_id,room_id,from_member,to_member,kind,payload,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(call.id,u.room_id,u.id,remote,kind,payload,t).run();
   return response({ok:true,sent:true});
  }
  return fail("Action inconnue.",404);
 }catch(e){console.error("Love Radar call POST",e);return fail("Impossible de gérer l’appel.",503)}
}
