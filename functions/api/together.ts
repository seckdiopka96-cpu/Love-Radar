import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Two private, two-person activities: an affectionate ping and a shared sketchbook. */
type Ctx={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string;seat:number};
type SignalRow={id:string;sender_id:string;kind:string;reply_to:string|null;created_at:number;seat:number};
type CanvasRow={seq:number;id:string;seat:number;kind:string;payload:string;created_at:number};
type PresenceRow={seat:number;drawing:number;payload:string;updated_at:number};
const HEART_RESPONSES=new Set(["heart","kiss","love"]);
const COLORS=new Set(["#ef7ca7","#7b4ac2","#3e8fa7","#e7a549","#4b3b55","#ffffff"]);
const RETENTION=45*24*60*60*1000;
const success=(value:Record<string,unknown>)=>Response.json({ok:true,...value},{headers:{"Cache-Control":"no-store"}});
const failure=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"no-store"}});
let dbReady:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!dbReady)dbReady=db.exec(
  "CREATE TABLE IF NOT EXISTS affection_signals(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,kind TEXT NOT NULL,reply_to TEXT,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_affection_room_time ON affection_signals(room_id,created_at);"+
  "CREATE TABLE IF NOT EXISTS couple_canvas_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_canvas_room_seq ON couple_canvas_events(room_id,seq);"+
  "CREATE TABLE IF NOT EXISTS couple_canvas_presence(room_id TEXT NOT NULL,member_id TEXT NOT NULL,drawing INTEGER NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id));"+
  "CREATE TABLE IF NOT EXISTS couple_canvas_invites(room_id TEXT PRIMARY KEY,id TEXT NOT NULL,sender_id TEXT NOT NULL,sent_at INTEGER NOT NULL)"
 ).then(()=>{}).catch(e=>{dbReady=null;throw e});
 await dbReady;
}
async function authorize(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function signalState(db:D1Database,u:Member,focusId:string|null){
 const rows=await db.prepare("SELECT s.id,s.sender_id,s.kind,s.reply_to,s.created_at,m.seat FROM affection_signals s JOIN members m ON m.id=s.sender_id WHERE s.room_id=? ORDER BY s.created_at DESC LIMIT 36")
 .bind(u.room_id).all<SignalRow>();
 let focus:SignalRow|null=null;
 if(focusId&&/^[0-9a-f-]{36}$/i.test(focusId)){
  focus=await db.prepare("SELECT s.id,s.sender_id,s.kind,s.reply_to,s.created_at,m.seat FROM affection_signals s JOIN members m ON m.id=s.sender_id WHERE s.room_id=? AND s.id=?")
   .bind(u.room_id,focusId).first<SignalRow>();
 }
 return {signals:(rows.results||[]).reverse(),focus};
}
async function canvasState(db:D1Database,u:Member){
 const rows=await db.prepare("SELECT e.seq,e.id,e.kind,e.payload,e.created_at,m.seat FROM couple_canvas_events e JOIN members m ON m.id=e.sender_id WHERE e.room_id=? ORDER BY e.seq DESC LIMIT 180")
  .bind(u.room_id).all<CanvasRow>();
 const events=(rows.results||[]).reverse().map(e=>({seq:e.seq,id:e.id,seat:e.seat,kind:e.kind,content:JSON.parse(e.payload),createdAt:e.created_at}));
 const clear=events.map(e=>e.kind).lastIndexOf("clear");
 const now=Date.now();
 const presence=await db.prepare("SELECT m.seat,p.drawing,p.payload,p.updated_at FROM couple_canvas_presence p JOIN members m ON m.id=p.member_id WHERE p.room_id=? AND p.member_id<>? AND p.updated_at>? ORDER BY p.updated_at DESC LIMIT 1")
 .bind(u.room_id,u.id,now-18000).first<PresenceRow>();
 let liveStroke:null|{seat:number;points:number[][];color:string;width:number}=null;
 if(presence?.drawing&&presence.updated_at>now-4000){
  try{
   const payload=JSON.parse(presence.payload) as {points:number[][];color:string;width:number};
   if(Array.isArray(payload.points)&&typeof payload.color==="string")
    liveStroke={seat:presence.seat,points:payload.points,color:payload.color,width:payload.width};
  }catch{/* Malformed ephemeral preview is ignored. */}
 }
 return {events:clear>=0?events.slice(clear+1):events,revision:events.at(-1)?.seq||0,
  partnerOnBoard:Boolean(presence),liveStroke,serverNow:now};
}
async function sendSignal(db:D1Database,u:Member,ctx:Ctx,kind:string,replyTo:string|null){
 const now=Date.now();
 if(kind==="miss"){
  const last=await db.prepare("SELECT created_at AS at FROM affection_signals WHERE room_id=? AND sender_id=? AND kind='miss' ORDER BY created_at DESC LIMIT 1")
   .bind(u.room_id,u.id).first<{at:number}>();
  if(last&&now-last.at<45000)return failure("Un cœur a déjà été envoyé. Patiente quelques instants. 💗",429);
 }else{
  if(!HEART_RESPONSES.has(kind)||!replyTo||!/^[0-9a-f-]{36}$/i.test(replyTo))return failure("Réponse inconnue.",400);
  const original=await db.prepare("SELECT sender_id FROM affection_signals WHERE room_id=? AND id=? AND kind='miss'")
   .bind(u.room_id,replyTo).first<{sender_id:string}>();
  if(!original||original.sender_id===u.id)return failure("Cette déclaration n'est pas disponible.",403);
  const already=await db.prepare("SELECT id FROM affection_signals WHERE room_id=? AND sender_id=? AND reply_to=? LIMIT 1")
   .bind(u.room_id,u.id,replyTo).first();
  if(already)return failure("Tu as déjà répondu à ce cœur. ❤️",409);
 }
 const id=crypto.randomUUID();
 await db.prepare("INSERT INTO affection_signals(id,room_id,sender_id,kind,reply_to,created_at) VALUES(?,?,?,?,?,?)")
 .bind(id,u.room_id,u.id,kind,replyTo,now).run();
 const title=kind==="miss"?"💗 Tu me manques !":"💌 Une réponse pleine d’amour";
 const body=kind==="miss"?u.name+" pense à toi ❤️ Appuie pour lui répondre.":u.name+" a répondu à ton cœur "+(kind==="kiss"?"😘":kind==="heart"?"❤️":"💖");
 ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,title,body,"together",{kind:"love-signal",id}));
 return success({id,...await signalState(db,u,id)});
}
function isCoord(n:unknown):n is number{return typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1000}
function parseStroke(input:Record<string,unknown>){
 if(input.kind==="grid")return {kind:"grid",data:{}};
 if(input.kind==="stroke"){
  if(!Array.isArray(input.points)||input.points.length<2||input.points.length>170)return null;
  const points=input.points.map(p=>{
   if(!Array.isArray(p)||p.length!==2||!isCoord(p[0])||!isCoord(p[1]))return null;
   return [Math.round(p[0]),Math.round(p[1])];
  });
  if(points.some(p=>!p))return null;
  if(typeof input.color!=="string"||!COLORS.has(input.color)||typeof input.width!=="number"||![3,6,10,16].includes(input.width))return null;
  return {kind:"stroke",data:{points,color:input.color,width:input.width}};
 }
 if(input.kind==="heart"){
  if(!isCoord(input.x)||!isCoord(input.y))return null;
  return {kind:"heart",data:{x:Math.round(input.x),y:Math.round(input.y)}};
 }
 if(input.kind==="text"){
  if(!isCoord(input.x)||!isCoord(input.y)||typeof input.text!=="string")return null;
  const msg=input.text.trim();
  if(msg.length<1||msg.length>52||/[\u0000-\u001f<>]/.test(msg))return null;
  return {kind:"text",data:{x:Math.round(input.x),y:Math.round(input.y),text:msg}};
 }
 return null;
}
async function canvasPresence(db:D1Database,u:Member,input:Record<string,unknown>){
 if(typeof input.drawing!=="boolean")return failure("État de dessin invalide.",400);
 let serialized="{}";
 if(input.drawing){
  const stroke=parseStroke({...input,kind:"stroke"});
  if(!stroke||stroke.kind!=="stroke")return failure("Aperçu de dessin non valide.",400);
  serialized=JSON.stringify(stroke.data);
 }
 await db.prepare("INSERT INTO couple_canvas_presence(room_id,member_id,drawing,payload,updated_at) VALUES(?,?,?,?,?) "+
 "ON CONFLICT(room_id,member_id) DO UPDATE SET drawing=excluded.drawing,payload=excluded.payload,updated_at=excluded.updated_at")
 .bind(u.room_id,u.id,input.drawing?1:0,serialized,Date.now()).run();
 return success({online:true});
}
async function addCanvas(db:D1Database,u:Member,input:Record<string,unknown>){
 let kind:string,data:object;
 if(input.action==="clear"){kind="clear";data={}}
 else{
  const item=parseStroke(input);
  if(!item)return failure("Dessin non valide.",400);
  kind=item.kind;data=item.data;
 }
 const now=Date.now();
 const flood=await db.prepare("SELECT COUNT(*) AS n FROM couple_canvas_events WHERE room_id=? AND sender_id=? AND created_at>?")
  .bind(u.room_id,u.id,now-5000).first<{n:number}>();
 if(Number(flood?.n)>19)return failure("Trop de traits à la fois. Réessaie dans quelques secondes.",429);
 const id=crypto.randomUUID();
 await db.prepare("INSERT INTO couple_canvas_events(id,room_id,sender_id,kind,payload,created_at) VALUES(?,?,?,?,?,?)")
  .bind(id,u.room_id,u.id,kind,JSON.stringify(data),now).run();
 // Bound storage and polling to the most recent 180 operations in the private room.
 await db.prepare("DELETE FROM couple_canvas_events WHERE room_id=? AND seq NOT IN (SELECT seq FROM couple_canvas_events WHERE room_id=? ORDER BY seq DESC LIMIT 180)")
  .bind(u.room_id,u.room_id).run();
 return success({id,...await canvasState(db,u)});
}
async function undoCanvas(db:D1Database,u:Member){
 const latestClear=await db.prepare("SELECT COALESCE(MAX(seq),0) AS n FROM couple_canvas_events WHERE room_id=? AND kind='clear'")
  .bind(u.room_id).first<{n:number}>();
 const row=await db.prepare("SELECT seq FROM couple_canvas_events WHERE room_id=? AND sender_id=? AND seq>? AND kind<>'clear' ORDER BY seq DESC LIMIT 1")
  .bind(u.room_id,u.id,Number(latestClear?.n||0)).first<{seq:number}>();
 if(!row)return failure("Tu n'as pas encore de dessin à annuler.",409);
 await db.prepare("DELETE FROM couple_canvas_events WHERE room_id=? AND seq=? AND sender_id=?").bind(u.room_id,row.seq,u.id).run();
 return success(await canvasState(db,u));
}
async function inviteDraw(db:D1Database,u:Member,ctx:Ctx){
 const now=Date.now(),id=crypto.randomUUID();
 const sent=await db.prepare("INSERT INTO couple_canvas_invites(room_id,id,sender_id,sent_at) VALUES(?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET id=excluded.id,sender_id=excluded.sender_id,sent_at=excluded.sent_at WHERE couple_canvas_invites.sent_at<?")
 .bind(u.room_id,id,u.id,now,now-60000).run();
 if(sent.meta.changes!==1)return failure("Invitation déjà envoyée. Réessaie dans une minute.",429);
 ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"🎨 Dessin à deux",u.name+" t’invite à dessiner ensemble. Appuie pour ouvrir votre tableau.","together",{kind:"draw-invite",id}));
 return success({invited:true,id});
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return failure("Service indisponible.",503);
  const u=await authorize(ctx.request,db);if(!u)return failure("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  const q=new URL(ctx.request.url).searchParams;
  if(method==="GET"){
   if(q.get("mode")==="draw")return success({mode:"draw",...await canvasState(db,u)});
   const focus=q.get("focus");
   return success({mode:"miss",...await signalState(db,u,focus),serverNow:Date.now()});
  }
  const raw=await ctx.request.text();
  if(raw.length>4600)return failure("Contenu trop volumineux.",413);
  let input:Record<string,unknown>;
  try{input=JSON.parse(raw) as Record<string,unknown>}catch{return failure("Requête non valide.",400)}
  if(input.action==="miss")return sendSignal(db,u,ctx,"miss",null);
  if(input.action==="reply")return sendSignal(db,u,ctx,typeof input.kind==="string"?input.kind:"",typeof input.replyTo==="string"?input.replyTo:null);
  if(input.action==="presence")return canvasPresence(db,u,input);
  if(input.action==="leave_draw"){
   await db.prepare("DELETE FROM couple_canvas_presence WHERE room_id=? AND member_id=?").bind(u.room_id,u.id).run();
   return success({online:false});
  }
  if(input.action==="draw"||input.action==="clear")return addCanvas(db,u,input);
  if(input.action==="undo")return undoCanvas(db,u);
  if(input.action==="invite_draw")return inviteDraw(db,u,ctx);
  return failure("Action inconnue.",404);
 }catch(e){console.error("Love Radar Together",e);return failure("Une erreur temporaire s'est produite.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");
