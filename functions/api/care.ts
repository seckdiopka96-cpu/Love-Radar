import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {ensureCareTables,loadDayTimings,localClock,roundLocation,
 validLocation,validTimezone,validMethod,type PrayerSettings} from "../lib/care-prayer";

type Ctx={request:Request;env:PushEnv;waitUntil?:(promise:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type Notice={id:string;sender_id:string;kind:string;label:string|null;created_at:number;expires_at:number;read_at:number|null};
const send=(body:Record<string,unknown>,status=200)=>Response.json({ok:status<400,...body},
 {status,headers:{"Cache-Control":"private, no-store"}});
const fail=(error:string,status=400)=>send({error},status);
async function member(req:Request,db:D1Database):Promise<Member|null>{
 const header=req.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?")
  .bind(hash).first<Member>();
}
async function getState(db:D1Database,u:Member){
 const me=await db.prepare("SELECT latitude,longitude,timezone,method,enabled FROM care_prayer_settings"+
  " WHERE room_id=? AND member_id=?").bind(u.room_id,u.id)
  .first<{latitude:number;longitude:number;timezone:string;method:number;enabled:number}>();
 const partner=await db.prepare("SELECT enabled FROM care_prayer_settings WHERE room_id=? AND member_id<>? LIMIT 1")
  .bind(u.room_id,u.id).first<{enabled:number}>();
 const inbox=await db.prepare("SELECT id,sender_id,kind,label,created_at,expires_at,read_at"+
  " FROM care_notices WHERE room_id=? AND recipient_id=? AND expires_at>?"+
  " ORDER BY created_at DESC LIMIT 15")
  .bind(u.room_id,u.id,Date.now()).all<Notice>();
 const ownPeriod=await db.prepare("SELECT id FROM care_notices WHERE room_id=? AND sender_id=?"+
  " AND kind='period' AND expires_at>? ORDER BY created_at DESC LIMIT 1")
  .bind(u.room_id,u.id,Date.now()).first<{id:string}>();
 return {prayer:me?{enabled:Boolean(me.enabled),latitude:me.latitude,longitude:me.longitude,
  timezone:me.timezone,method:me.method}:null,partnerPrayerEnabled:Boolean(partner?.enabled),
  notices:inbox.results||[],ownPeriodId:ownPeriod?.id||null};
}
export async function onRequestGet({request,env}:Ctx):Promise<Response>{
 try{
  if(!env.DB)return fail("Service indisponible.",503);
  const u=await member(request,env.DB);
  if(!u)return fail("Reconnecte-toi.",401);
  await ensureCareTables(env.DB);
  await env.DB.prepare("DELETE FROM care_notices WHERE expires_at<?").bind(Date.now()).run();
  return send(await getState(env.DB,u));
 }catch(e){console.error("Care GET",e);return fail("Impossible de charger vos attentions.",503)}
}
export async function onRequestPost({request,env,waitUntil}:Ctx):Promise<Response>{
 try{
  const db=env.DB;
  if(!db)return fail("Service indisponible.",503);
  const u=await member(request,db);
  if(!u)return fail("Reconnecte-toi.",401);
  const raw=await request.text();
  if(raw.length>1300)return fail("Données trop volumineuses.",413);
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Données invalides.")}
  await ensureCareTables(db);
  await db.prepare("DELETE FROM care_notices WHERE expires_at<?").bind(Date.now()).run();
  const action=body.action;
  const now=Date.now();
  if(action==="period"){
   // Never infer or automatically disclose menstruation. Only the user's
   // explicit POST creates this short-lived, revocable private notice.
   if(body.confirmed!==true)return fail("Confirme explicitement le partage.",400);
   const others=await db.prepare("SELECT id FROM members WHERE room_id=? AND id<>? LIMIT 1")
    .bind(u.room_id,u.id).first<{id:string}>();
   if(!others)return fail("Ton partenaire doit d'abord rejoindre votre espace.",409);
   const last=await db.prepare("INSERT INTO care_share_throttle(member_id,kind,last_at)"+
    " VALUES(?,'period',?) ON CONFLICT(member_id,kind) DO UPDATE SET last_at=excluded.last_at"+
    " WHERE care_share_throttle.last_at<?")
    .bind(u.id,now,now-12*3600000).run();
   if(last.meta.changes!==1)return fail("Une attention a déjà été envoyée récemment.",429);
   const noticeId=crypto.randomUUID();
   const label=body.supplies===true?"supplies":"kindness";
   await db.prepare("INSERT INTO care_notices(id,room_id,sender_id,recipient_id,kind,label,created_at,expires_at)"+
    " VALUES(?,?,?,?,'period',?,?,?)")
    .bind(noticeId,u.room_id,u.id,others.id,label,now,now+48*3600000).run();
   const task=notifyPartner(env,u.room_id,u.id,"💗 Petite attention",
    "Ton amour aimerait une petite attention. Ouvre votre espace privé.","care");
   if(waitUntil)waitUntil(task);else void task;
   return send({sent:true,...await getState(db,u)});
  }
  if(action==="revoke-period"){
   if(typeof body.id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.id))return fail("Message introuvable.");
   await db.prepare("DELETE FROM care_notices WHERE id=? AND sender_id=? AND room_id=? AND kind='period'")
    .bind(body.id,u.id,u.room_id).run();
   // A previously displayed system push cannot be recalled.
   return send({revoked:true,...await getState(db,u)});
  }
  if(action==="dismiss"){
   if(typeof body.id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.id))return fail("Message introuvable.");
   await db.prepare("UPDATE care_notices SET read_at=? WHERE id=? AND room_id=? AND recipient_id=?")
    .bind(now,body.id,u.room_id,u.id).run();
   return send(await getState(db,u));
  }
  if(action==="disable-prayer"){
   await db.batch([
    db.prepare("DELETE FROM care_prayer_settings WHERE room_id=? AND member_id=?").bind(u.room_id,u.id),
    db.prepare("DELETE FROM care_prayer_cache WHERE room_id=? AND member_id=?").bind(u.room_id,u.id),
    db.prepare("DELETE FROM care_prayer_sent WHERE room_id=? AND member_id=?").bind(u.room_id,u.id)
   ]);
   return send({disabled:true,...await getState(db,u)});
  }
  if(action==="enable-prayer"){
   if(body.confirmed!==true)return fail("Active le partage volontaire de tes horaires.",400);
   if(typeof body.longitude!=="number"||!validTimezone(body.timezone)||
    !validLocation(body.latitude,body.longitude)||!validMethod(body.method))
    return fail("Vérifie ta position, ton fuseau horaire et la méthode de calcul.");
   const settings:PrayerSettings={member_id:u.id,room_id:u.room_id,
    latitude:roundLocation(body.latitude),longitude:roundLocation(body.longitude),
    timezone:body.timezone,method:body.method,enabled:1,updated_at:now};
   const date=localClock(now,settings.timezone).day;
   // Never turn notifications on without validated timings.
   const timings=await loadDayTimings(db,settings,date,true);
   if(!timings)return fail("Horaires non disponibles ou fuseau différent. Réessaie avec une zone correcte.",503);
   await db.prepare("INSERT INTO care_prayer_settings"+
    "(member_id,room_id,latitude,longitude,timezone,method,enabled,updated_at)"+
    " VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(member_id) DO UPDATE SET"+
    " room_id=excluded.room_id,latitude=excluded.latitude,longitude=excluded.longitude,"+
    " timezone=excluded.timezone,method=excluded.method,enabled=1,updated_at=excluded.updated_at")
    .bind(u.id,u.room_id,settings.latitude,settings.longitude,settings.timezone,settings.method,now).run();
   // Cached timings must be invalidated if the user changed their location/method.
   await db.prepare("DELETE FROM care_prayer_cache WHERE room_id=? AND member_id=? AND"+
    " (day<>? OR updated_at<?)").bind(u.room_id,u.id,date,now-3600000).run();
   return send({enabled:true,timings,...await getState(db,u)});
  }
  return fail("Action inconnue.",404);
 }catch(e){console.error("Care POST",e);return fail("Impossible d'enregistrer cette attention.",503)}
}
