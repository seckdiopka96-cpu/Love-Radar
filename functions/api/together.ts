import type {D1Database} from "@cloudflare/workers-types";
import {purgeRetiredLocation} from "../lib/retired-location";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Romantic heart messages only. Drawing has been retired in favour of the puzzle. */
type Ctx={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string;seat:number};
type SignalRow={id:string;sender_id:string;kind:string;reply_to:string|null;created_at:number;seat:number};
const RESPONSES=new Set(["heart","kiss","love"]);
const success=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
let setup:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!setup)setup=db.exec(
  "CREATE TABLE IF NOT EXISTS affection_signals(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,kind TEXT NOT NULL,reply_to TEXT,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_affection_room_time ON affection_signals(room_id,created_at);"
 ).then(()=>{}).catch(error=>{setup=null;throw error});
 return setup;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function signals(db:D1Database,user:Member,focusId:string|null){
 const res=await db.prepare("SELECT s.id,s.sender_id,s.kind,s.reply_to,s.created_at,m.seat FROM affection_signals s JOIN members m ON m.id=s.sender_id WHERE s.room_id=? ORDER BY s.created_at DESC LIMIT 36")
  .bind(user.room_id).all<SignalRow>();
 let focus:SignalRow|null=null;
 if(focusId&&/^[0-9a-f-]{36}$/i.test(focusId))
  focus=await db.prepare("SELECT s.id,s.sender_id,s.kind,s.reply_to,s.created_at,m.seat FROM affection_signals s JOIN members m ON m.id=s.sender_id WHERE s.room_id=? AND s.id=?")
   .bind(user.room_id,focusId).first<SignalRow>();
 return {signals:(res.results||[]).reverse(),focus};
}
async function handler(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return fail("Service momentanément indisponible.",503);
  const user=await auth(ctx.request,db);if(!user)return fail("Session expirée. Reconnecte-toi.",401);
  await purgeRetiredLocation(db,user.room_id);
  await ensure(db);
  if(method==="GET")return success({...await signals(db,user,new URL(ctx.request.url).searchParams.get("focus")),serverNow:Date.now()});
  const raw=await ctx.request.text();
  if(raw.length>850)return fail("Message trop long.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Requête invalide.",400)}
  const action=data.action;
  if(action!=="miss"&&action!=="reply")return fail("Cette activité a été supprimée. Ouvre Puzzle à deux.",410);
  const now=Date.now();
  let kind:string;
  let replyTo:string|null=null;
  if(action==="miss"){
   kind="miss";
   const last=await db.prepare("SELECT created_at AS at FROM affection_signals WHERE room_id=? AND sender_id=? AND kind='miss' ORDER BY created_at DESC LIMIT 1")
    .bind(user.room_id,user.id).first<{at:number}>();
   if(last&&now-last.at<45000)return fail("Un cœur a déjà été envoyé. Patiente un instant. 💗",429);
  }else{
   kind=typeof data.kind==="string"?data.kind:"";
   replyTo=typeof data.replyTo==="string"?data.replyTo:null;
   if(!RESPONSES.has(kind)||!replyTo||!/^[0-9a-f-]{36}$/i.test(replyTo))return fail("Réponse inconnue.",400);
   const original=await db.prepare("SELECT sender_id FROM affection_signals WHERE room_id=? AND id=? AND kind='miss'")
    .bind(user.room_id,replyTo).first<{sender_id:string}>();
   if(!original||original.sender_id===user.id)return fail("Ce cœur n'est plus disponible.",403);
   const prev=await db.prepare("SELECT id FROM affection_signals WHERE room_id=? AND sender_id=? AND reply_to=? LIMIT 1")
    .bind(user.room_id,user.id,replyTo).first();
   if(prev)return fail("Tu as déjà répondu à ce cœur. ❤️",409);
  }
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO affection_signals(id,room_id,sender_id,kind,reply_to,created_at) VALUES(?,?,?,?,?,?)")
   .bind(id,user.room_id,user.id,kind,replyTo,now).run();
  const title=kind==="miss"?"💗 Tu me manques !":"💌 Une réponse pleine d'amour";
  const body=kind==="miss"?user.name+" pense à toi ❤️ Appuie pour lui répondre.":
   user.name+" a répondu à ton cœur "+(kind==="kiss"?"😘":kind==="heart"?"❤️":"💖");
  ctx.waitUntil(notifyPartner(ctx.env,user.room_id,user.id,title,body,"together",{kind:"love-signal",id}));
  return success({id,...await signals(db,user,id)});
 }catch(error){console.error("Love Radar Together",error);return fail("Une erreur temporaire s'est produite.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handler(ctx,"POST");
