import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/* Explicit, mutually visible, time-limited, foreground-only location sharing. */
type Context={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string;seat:number};
type LocationRow={room_id:string;id:string;requester_id:string;target_id:string;requester_name:string;target_name:string;status:string;lat:number|null;lng:number|null;accuracy:number|null;created_at:number;approved_at:number|null;updated_at:number;expires_at:number};
const SHARE_MS=15*60*1000,REQUEST_MS=3*60*1000,FRESH_MS=85*1000,COOLDOWN_MS=60*1000;
const ok=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_location_requests("+
  "room_id TEXT PRIMARY KEY,id TEXT NOT NULL,requester_id TEXT NOT NULL,target_id TEXT NOT NULL,"+
  "requester_name TEXT NOT NULL,target_name TEXT NOT NULL,status TEXT NOT NULL,"+
  "lat REAL,lng REAL,accuracy REAL,created_at INTEGER NOT NULL,"+
  "approved_at INTEGER,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)"
 ).then(()=>{}).catch(err=>{ready=null;throw err});
 await ready;
}
async function auth(req:Request,db:D1Database):Promise<Member|null>{
 const raw=req.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(raw))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw.slice(7)));
 const hashed=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hashed).first<Member>();
}
async function lookup(db:D1Database,u:Member){
 const now=Date.now();
 // Stop sharing if a user has not returned before the agreed expiry.
 await db.prepare("UPDATE couple_location_requests SET status='expired',lat=NULL,lng=NULL,accuracy=NULL,updated_at=? WHERE room_id=? AND status IN ('pending','active') AND expires_at<=?")
  .bind(now,u.room_id,now).run();
 return db.prepare("SELECT * FROM couple_location_requests WHERE room_id=?").bind(u.room_id).first<LocationRow>();
}
function coords(body:Record<string,unknown>){
 const lat=body.lat,lng=body.lng,accuracy=body.accuracy;
 if(typeof lat!=="number"||!Number.isFinite(lat)||lat< -90||lat>90||
    typeof lng!=="number"||!Number.isFinite(lng)||lng< -180||lng>180||
    typeof accuracy!=="number"||!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)return null;
 return {lat:Math.round(lat*1000000)/1000000,lng:Math.round(lng*1000000)/1000000,accuracy:Math.round(accuracy)};
}
async function view(db:D1Database,u:Member){
 const row=await lookup(db,u);
 if(!row)return {request:null,serverNow:Date.now()};
 const requester=row.requester_id===u.id,target=row.target_id===u.id;
 if(!requester&&!target)return {request:null,serverNow:Date.now()};
 const now=Date.now();
 const fresh=row.status==="active"&&row.lat!==null&&row.lng!==null&&row.updated_at>=now-FRESH_MS&&row.expires_at>now;
 return {
  request:{id:row.id,status:row.status,role:requester?"requester":"sharer",
   requesterName:row.requester_name,targetName:row.target_name,
   createdAt:row.created_at,approvedAt:row.approved_at,expiresAt:row.expires_at,
   // Only the person who sent the request can view precise coordinates, after voluntary approval.
   location:requester&&fresh?{lat:row.lat,lng:row.lng,accuracy:row.accuracy,updatedAt:row.updated_at}:null,
   isFresh:requester&&fresh},
  serverNow:now
 };
}
async function handler(ctx:Context,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return fail("Service de localisation indisponible.",503);
  const u=await auth(ctx.request,db);if(!u)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  if(method==="GET")return ok(await view(db,u));
  const raw=await ctx.request.text();if(raw.length>650)return fail("Demande trop grande.",413);
  let input:Record<string,unknown>;
  try{input=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Données invalides.",400)}
  const action=input.action,now=Date.now();
  const previous=await lookup(db,u);
  if(action==="request"){
   const partner=await db.prepare("SELECT id,name FROM members WHERE room_id=? AND id<>? LIMIT 1")
    .bind(u.room_id,u.id).first<{id:string;name:string}>();
   if(!partner)return fail("Ton partenaire doit d'abord rejoindre votre espace.",409);
   if(previous&&["pending","active"].includes(previous.status))return fail("Une demande est déjà en cours. Vous pouvez l'annuler ou l'arrêter.",409);
   if(previous&&now-previous.created_at<COOLDOWN_MS)return fail("Attends une minute avant de refaire une demande.",429);
   const id=crypto.randomUUID();
   await db.prepare("INSERT INTO couple_location_requests(room_id,id,requester_id,target_id,requester_name,target_name,status,lat,lng,accuracy,created_at,approved_at,updated_at,expires_at) "+
    "VALUES(?,?,?,?,?,?,'pending',NULL,NULL,NULL,?,NULL,?,?) ON CONFLICT(room_id) DO UPDATE SET id=excluded.id,requester_id=excluded.requester_id,target_id=excluded.target_id,requester_name=excluded.requester_name,target_name=excluded.target_name,status='pending',lat=NULL,lng=NULL,accuracy=NULL,created_at=excluded.created_at,approved_at=NULL,updated_at=excluded.updated_at,expires_at=excluded.expires_at")
    .bind(u.room_id,id,u.id,partner.id,u.name,partner.name,now,now,now+REQUEST_MS).run();
   ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"📍 Demande de position",u.name+" souhaite voir ta position pendant 15 minutes. Tu peux accepter ou refuser.","location",{kind:"location-request",id}));
   return ok(await view(db,u));
  }
  const id=input.id;
  if(!previous||typeof id!=="string"||id!==previous.id||!/^[0-9a-f-]{36}$/i.test(id))return fail("Cette demande n'est plus active.",409);
  if(action==="decline"){
   if(previous.target_id!==u.id||previous.status!=="pending")return fail("Tu ne peux pas refuser cette demande.",403);
   await db.prepare("UPDATE couple_location_requests SET status='declined',lat=NULL,lng=NULL,accuracy=NULL,updated_at=? WHERE room_id=? AND id=? AND status='pending'")
    .bind(now,u.room_id,id).run();
   return ok(await view(db,u));
  }
  if(action==="cancel"){
   if(previous.requester_id!==u.id||previous.status!=="pending")return fail("Cette demande ne peut plus être annulée.",403);
   await db.prepare("UPDATE couple_location_requests SET status='cancelled',lat=NULL,lng=NULL,accuracy=NULL,updated_at=? WHERE room_id=? AND id=? AND status='pending'")
    .bind(now,u.room_id,id).run();
   return ok(await view(db,u));
  }
  if(action==="accept"){
   if(previous.target_id!==u.id||previous.status!=="pending")return fail("Seul le destinataire peut accepter.",403);
   const position=coords(input);if(!position)return fail("La localisation du téléphone n'est pas disponible.",400);
   const updated=await db.prepare("UPDATE couple_location_requests SET status='active',lat=?,lng=?,accuracy=?,approved_at=?,updated_at=?,expires_at=? WHERE room_id=? AND id=? AND target_id=? AND status='pending' AND expires_at>?")
    .bind(position.lat,position.lng,position.accuracy,now,now,now+SHARE_MS,u.room_id,id,u.id,now).run();
   if(updated.meta.changes!==1)return fail("Cette demande a expiré. Demande une nouvelle autorisation.",409);
   ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"📍 Partage accepté",u.name+" partage sa position avec toi pendant 15 minutes.","location",{kind:"location-request",id}));
   return ok(await view(db,u));
  }
  if(action==="update"){
   if(previous.target_id!==u.id||previous.status!=="active"||previous.expires_at<=now)return fail("Le partage n'est plus actif.",403);
   const position=coords(input);if(!position)return fail("Coordonnées incorrectes.",400);
   if(now-previous.updated_at<5000)return ok(await view(db,u));
   await db.prepare("UPDATE couple_location_requests SET lat=?,lng=?,accuracy=?,updated_at=? WHERE room_id=? AND id=? AND target_id=? AND status='active' AND expires_at>?")
    .bind(position.lat,position.lng,position.accuracy,now,u.room_id,id,u.id,now).run();
   return ok(await view(db,u));
  }
  if(action==="stop"){
   if(previous.target_id!==u.id||previous.status!=="active")return fail("Tu ne partages pas ta position.",403);
   await db.prepare("UPDATE couple_location_requests SET status='stopped',lat=NULL,lng=NULL,accuracy=NULL,updated_at=? WHERE room_id=? AND id=? AND target_id=? AND status='active'")
    .bind(now,u.room_id,id,u.id).run();
   return ok(await view(db,u));
  }
  return fail("Action inconnue.",404);
 }catch(e){console.error("Love Radar location-sharing",e);return fail("La localisation est momentanément indisponible.",503)}
}
export const onRequestGet=(ctx:Context)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Context)=>handler(ctx,"POST");
