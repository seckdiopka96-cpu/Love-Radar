import type {D1Database} from "@cloudflare/workers-types";
import type {PushEnv} from "../lib/push";

type Ctx={request:Request;env:PushEnv};
type Member={id:string;room_id:string;name:string;seat:number};
type WatchRow={room_id:string;video_id:string;playing:number;position:number;synced_at:number;updated_at:number;updated_by:string|null;version:number};
type WatchState={videoId:string;playing:boolean;position:number;syncedAt:number;updatedAt:number;updatedBy:string|null;version:number};
const ok=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_watch_sessions (room_id TEXT PRIMARY KEY,video_id TEXT NOT NULL,playing INTEGER NOT NULL,position REAL NOT NULL,synced_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,updated_by TEXT,version INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS couple_watch_presence (room_id TEXT NOT NULL,member_id TEXT NOT NULL,seen_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id));"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 return ready;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return await db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function init(db:D1Database,room:string){
 const now=Date.now();
 await db.prepare("INSERT OR IGNORE INTO couple_watch_sessions(room_id,video_id,playing,position,synced_at,updated_at,updated_by,version) VALUES(?,'',0,0,?,?,NULL,1)")
  .bind(room,now,now).run();
}
async function session(db:D1Database,room:string):Promise<WatchRow>{
 const row=await db.prepare("SELECT * FROM couple_watch_sessions WHERE room_id=?").bind(room).first<WatchRow>();
 if(!row)throw Error("Watch session missing");
 return row;
}
const publicState=(s:WatchRow):WatchState=>({
 videoId:s.video_id,playing:s.playing===1,position:s.position,syncedAt:s.synced_at,
 updatedAt:s.updated_at,updatedBy:s.updated_by,version:s.version
});
const videoIdValid=(s:unknown):s is string=>typeof s==="string"&&/^[a-zA-Z0-9_-]{11}$/.test(s);
const positionValid=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=86400;
const positionAt=(s:WatchRow,now:number)=>Math.max(0,Math.min(86400,s.position+(s.playing===1?Math.max(0,now-s.synced_at)/1000:0)));
async function view(db:D1Database,user:Member,s:WatchRow){
 const now=Date.now();
 const [count,presence]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS total FROM members WHERE room_id=?").bind(user.room_id).first<{total:number}>(),
  db.prepare("SELECT seen_at FROM couple_watch_presence WHERE room_id=? AND member_id<>? AND seen_at>? ORDER BY seen_at DESC LIMIT 1")
   .bind(user.room_id,user.id,now-16000).first<{seen_at:number}>()
 ]);
 return {state:publicState(s),members:Number(count?.total||0),partnerWatching:Boolean(presence),serverNow:now};
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return fail("Service temporairement indisponible.",503);
  const user=await auth(ctx.request,db);if(!user)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  await init(db,user.room_id);
  let current=await session(db,user.room_id);
  if(method==="GET")return ok(await view(db,user,current));
  const body=await ctx.request.text();
  if(body.length>1024)return fail("Requête trop volumineuse.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(body) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(data.action==="heartbeat"){
   await db.prepare("INSERT INTO couple_watch_presence(room_id,member_id,seen_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET seen_at=excluded.seen_at")
    .bind(user.room_id,user.id,Date.now()).run();
   return ok(await view(db,user,current));
  }
  if(!["set-video","play","pause","seek"].includes(String(data.action)))return fail("Action inconnue.");
  if(!Number.isInteger(data.version)||data.version!==current.version)return fail("La vidéo a changé. Réessaie.",409);
  if(data.action==="set-video"&&!videoIdValid(data.videoId))return fail("Lien YouTube invalide.");
  if(data.action!=="set-video"&&!current.video_id)return fail("Choisis d'abord une vidéo.");
  if(data.action!=="set-video"&&!positionValid(data.position))return fail("Position de lecture invalide.");
  const now=Date.now();
  const videoId=data.action==="set-video"?String(data.videoId):current.video_id;
  const playing=data.action==="set-video"||data.action==="pause"?0:data.action==="play"?1:current.playing;
  const position=data.action==="set-video"?0:Number(data.position);
  // Optimistic version check prevents stale devices from overwriting each other.
  const updated=await db.prepare(
   "UPDATE couple_watch_sessions SET video_id=?,playing=?,position=?,synced_at=?,updated_at=?,updated_by=?,version=version+1 WHERE room_id=? AND version=?"
  ).bind(videoId,playing,position,now,now,user.name.slice(0,60),user.room_id,current.version).run();
  if(updated.meta.changes!==1)return fail("L'autre appareil vient de modifier la lecture.",409);
  current=await session(db,user.room_id);
  return ok(await view(db,user,current));
 }catch(error){console.error("Love Radar Watch Together",error);return fail("La salle vidéo est momentanément indisponible.",500);}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");
