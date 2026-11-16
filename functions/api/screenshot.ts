import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Native screenshot metadata, never screenshots themselves.
 * A screenshot event can only be reported by a logged-in member, and the
 * event is always visibly attributed to that member within the same room.
 */
type Context={request:Request;env:PushEnv;waitUntil?:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type ScreenshotRow={id:string;member_id:string;created_at:number};
const response=(values:Record<string,unknown>,status=200)=>Response.json({ok:status<400,...values},
 {status,headers:{"Cache-Control":"private, no-store"}});
const fail=(error:string,status=400)=>response({error},status);
const THROTTLE_MS=12000;
const RETENTION_MS=30*86400000;
async function authenticated(req:Request,db:D1Database):Promise<Member|null>{
 const auth=req.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(auth))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(auth.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?")
  .bind(hash).first<Member>();
}
async function ensure(db:D1Database){
 await db.exec(
  "CREATE TABLE IF NOT EXISTS screenshot_events("+
  "id TEXT PRIMARY KEY,room_id TEXT NOT NULL,member_id TEXT NOT NULL,"+
  "created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_screenshot_room_created ON screenshot_events(room_id,created_at DESC);"+
  "CREATE TABLE IF NOT EXISTS screenshot_throttle("+
  "member_id TEXT PRIMARY KEY,last_at INTEGER NOT NULL);"
 );
}
async function clean(db:D1Database,now:number){
 await db.prepare("DELETE FROM screenshot_events WHERE created_at<?")
  .bind(now-RETENTION_MS).run();
}
export async function onRequestGet({request,env}:Context):Promise<Response>{
 try{
  const db=env.DB;if(!db)return fail("Service indisponible.",503);
  const user=await authenticated(request,db);if(!user)return fail("Session expirée.",401);
  await ensure(db);
  const result=await db.prepare("SELECT id,member_id,created_at FROM screenshot_events"+
   " WHERE room_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 80")
   .bind(user.room_id,Date.now()-RETENTION_MS).all<ScreenshotRow>();
  return response({events:(result.results||[]).reverse()});
 }catch(error){console.error("Screenshot GET",error);return fail("Historique temporairement indisponible.",503)}
}
export async function onRequestPost({request,env,waitUntil}:Context):Promise<Response>{
 try{
  const db=env.DB;if(!db)return fail("Service indisponible.",503);
  const user=await authenticated(request,db);if(!user)return fail("Session expirée.",401);
  const raw=await request.text();
  if(raw.length>250)return fail("Données trop longues.",413);
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Données invalides.")}
  if(body.action!=="taken"||typeof body.id!=="string"||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
   return fail("Événement invalide.");
  await ensure(db);
  const partner=await db.prepare("SELECT id FROM members WHERE room_id=? AND id<>? LIMIT 1")
   .bind(user.room_id,user.id).first<{id:string}>();
  if(!partner)return fail("Ton partenaire n'a pas encore rejoint l'espace.",409);
  const now=Date.now();
  // Deduplicate by event ID, and cap deliberate repeated screenshot reports.
  // Claim this member's 12-second window atomically before recording the event.
  const already=await db.prepare("SELECT id FROM screenshot_events WHERE id=? AND room_id=?")
   .bind(body.id,user.room_id).first<{id:string}>();
  if(already)return response({saved:true,duplicate:true});
  const claimed=await db.prepare("INSERT INTO screenshot_throttle(member_id,last_at) VALUES(?,?)"+
   " ON CONFLICT(member_id) DO UPDATE SET last_at=excluded.last_at"+
   " WHERE screenshot_throttle.last_at<?")
   .bind(user.id,now,now-THROTTLE_MS).run();
  if(claimed.meta.changes!==1)return response({saved:false,throttled:true},429);
  const result=await db.prepare("INSERT OR IGNORE INTO screenshot_events(id,room_id,member_id,created_at)"+
   " VALUES(?,?,?,?)").bind(body.id,user.room_id,user.id,now).run();
  if(result.meta.changes!==1)return response({saved:true,duplicate:true});
  // No screenshot pixels or chat text leave the device in this event.
  const title="📸 Capture d’écran dans Love-Radar";
  const push=notifyPartner(env,user.room_id,user.id,title,
   "Ton partenaire a fait une capture d’écran dans Love-Radar.","chat");
  if(waitUntil)waitUntil(push);else void push;
  // Expired metadata is also pruned when future notifications are sent.
  await clean(db,now);
  return response({saved:true,event:{id:body.id,member_id:user.id,created_at:now}});
 }catch(error){console.error("Screenshot POST",error);return fail("Notification momentanément indisponible.",503)}
}
