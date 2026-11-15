import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {parseTikTokId,isTikTokShortLink,TIKTOK_VIDEO_ID,type TikTokSnapshot} from "../../src/tiktok-utils";

type Ctx={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string;seat:number};
type WatchRow={room_id:string;video_id:string;playing:number;position:number;synced_at:number;updated_at:number;updated_by:string|null;version:number};
const ok=(payload:object)=>Response.json({ok:true,...payload},{headers:{"Cache-Control":"private, no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"private, no-store"}});
let setup:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!setup)setup=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_tiktok_watch (room_id TEXT PRIMARY KEY,video_id TEXT NOT NULL,playing INTEGER NOT NULL,position REAL NOT NULL,synced_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,updated_by TEXT,version INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS couple_tiktok_presence (room_id TEXT NOT NULL,member_id TEXT NOT NULL,seen_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id));"
 ).then(()=>{}).catch(e=>{setup=null;throw e});
 return setup;
}
async function member(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function load(db:D1Database,room:string):Promise<WatchRow>{
 const row=await db.prepare("SELECT * FROM couple_tiktok_watch WHERE room_id=?").bind(room).first<WatchRow>();
 if(!row)throw Error("TikTok session missing");
 return row;
}
const publicState=(row:WatchRow):TikTokSnapshot=>({
 videoId:row.video_id,playing:row.playing===1,position:row.position,
 syncedAt:row.synced_at,updatedAt:row.updated_at,
 updatedBy:row.updated_by,version:row.version
});
async function view(db:D1Database,user:Member,row:WatchRow){
 const now=Date.now();
 const [count,other]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS total FROM members WHERE room_id=?").bind(user.room_id).first<{total:number}>(),
  db.prepare("SELECT seen_at FROM couple_tiktok_presence WHERE room_id=? AND member_id<>? AND seen_at>? ORDER BY seen_at DESC LIMIT 1")
   .bind(user.room_id,user.id,now-18000).first<{seen_at:number}>()
 ]);
 return {state:publicState(row),partnerWatching:Boolean(other),members:Number(count?.total||0),serverNow:now};
}
function trustedTikTokUrl(value:string):URL|null{
 try{
  const u=new URL(value);
  const host=u.hostname.toLowerCase();
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
   (host==="tiktok.com"||host.endsWith(".tiktok.com"))?u:null;
 }catch{return null}
}
async function resolveShortLink(value:string):Promise<string|null>{
 if(!isTikTokShortLink(value))return null;
 const urlText=value.match(/https?:\/\/[^\s<>]+/i)?.[0].replace(/[),.!?]+$/,"")||value.trim();
 let url=trustedTikTokUrl(urlText);if(!url)return null;
 for(let i=0;i<6;i++){
  const found=parseTikTokId(url.href);
  if(found)return found;
  // Follow only TikTok HTTPS redirects; never fetch arbitrary redirect targets.
  const res=await fetch(url.href,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(6500)});
  const location=res.headers.get("location");
  if(!location)return parseTikTokId(res.url);
  url=trustedTikTokUrl(new URL(location,url).href);
  if(!url)return null;
 }
 return null;
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Le service TikTok est momentanément indisponible.",503);
  const user=await member(ctx.request,db);
  if(!user)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  const now=Date.now();
  await db.prepare("INSERT OR IGNORE INTO couple_tiktok_watch(room_id,video_id,playing,position,synced_at,updated_at,updated_by,version) VALUES(?,'',0,0,?,?,NULL,1)")
   .bind(user.room_id,now,now).run();
  let current=await load(db,user.room_id);
  if(method==="GET")return ok(await view(db,user,current));
  const body=await ctx.request.text();
  if(body.length>1600)return fail("Requête trop grande.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(body) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(data.action==="heartbeat"){
   await db.prepare("INSERT INTO couple_tiktok_presence(room_id,member_id,seen_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET seen_at=excluded.seen_at")
    .bind(user.room_id,user.id,Date.now()).run();
   return ok(await view(db,user,current));
  }
  if(data.action==="resolve"){
   if(typeof data.url!=="string"||data.url.length>400||!isTikTokShortLink(data.url))return fail("Lien TikTok court invalide.",400);
   let id:string|null=null;
   try{id=await resolveShortLink(data.url)}catch{return fail("Le lien TikTok court ne répond pas. Essaie un lien complet tiktok.com/@…/video/…",422)}
   return id?ok({videoId:id}):fail("Impossible d'ouvrir ce lien court. Copie le lien complet de la vidéo TikTok.",422);
  }
  if(!["set-video","play","pause","seek"].includes(String(data.action)))return fail("Action inconnue.",400);
  if(!Number.isInteger(data.version)||data.version!==current.version)return fail("La vidéo vient de changer. Réessaie.",409);
  if(data.action==="set-video"&&(typeof data.videoId!=="string"||!TIKTOK_VIDEO_ID.test(data.videoId)))return fail("Identifiant TikTok invalide.",400);
  if(data.action!=="set-video"&&!current.video_id)return fail("Choisis d'abord une vidéo.",409);
  if(data.action!=="set-video"&&(typeof data.position!=="number"||!Number.isFinite(data.position)||data.position<0||data.position>86400))
   return fail("Position invalide.",400);
  const id=data.action==="set-video"?String(data.videoId):current.video_id;
  const wasPaused=current.playing===0;
  const playing=data.action==="set-video"||data.action==="pause"?0:data.action==="play"?1:current.playing;
  const position=data.action==="set-video"?0:Number(data.position);
  const stamp=Date.now();
  const updated=await db.prepare(
   "UPDATE couple_tiktok_watch SET video_id=?,playing=?,position=?,synced_at=?,updated_at=?,updated_by=?,version=version+1 WHERE room_id=? AND version=?"
  ).bind(id,playing,position,stamp,stamp,user.name.slice(0,60),user.room_id,current.version).run();
  if(updated.meta.changes!==1)return fail("Ton partenaire vient de changer la vidéo. Réessaie.",409);
  current=await load(db,user.room_id);
  if(data.action==="play"&&playing===1&&wasPaused){
   ctx.waitUntil(notifyPartner(ctx.env,user.room_id,user.id,
    "🎬 "+user.name.slice(0,28)+" t’invite à regarder TikTok",
    user.name.slice(0,28)+" a lancé un TikTok ! Appuie pour regarder la même vidéo ensemble ❤️",
    "watch-tiktok"));
  }
  return ok(await view(db,user,current));
 }catch(error){console.error("TikTok Together API",error);return fail("Impossible de synchroniser TikTok pour le moment.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");
