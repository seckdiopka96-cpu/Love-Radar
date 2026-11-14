import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Private, shared couple history, calendar and next reunion. No public profile. */
type Context={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type Profile={met_on:string|null;reunion_on:string|null;reunion_place:string;photo_key:string|null;photo_mime:string|null;updated_at:number};
type EventRow={id:string;event_date:string;title:string;note:string;annual:number;created_at:number};
const MAX_EVENTS=40;
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const yes=(body:Record<string,unknown>)=>Response.json({ok:true,...body},{headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_stories(room_id TEXT PRIMARY KEY,met_on TEXT,reunion_on TEXT,reunion_place TEXT NOT NULL DEFAULT '',photo_key TEXT,photo_mime TEXT,updated_at INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS couple_story_events(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,event_date TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',annual INTEGER NOT NULL DEFAULT 0,author_id TEXT NOT NULL,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_story_events_room_date ON couple_story_events(room_id,event_date)"
 ).then(()=>{}).catch(err=>{ready=null;throw err});
 await ready;
}
async function auth(req:Request,db:D1Database):Promise<Member|null>{
 const bearer=req.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
function validDate(value:unknown,min=1900,max=2100):value is string{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const year=Number(value.slice(0,4)),stamp=Date.parse(value+"T00:00:00Z");
 return year>=min&&year<=max&&Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}
function clean(value:unknown,max:number){
 if(typeof value!=="string")return null;
 const text=value.trim();
 return text.length<=max&&!/[\u0000-\u001f<>]/.test(text)?text:null;
}
async function state(db:D1Database,u:Member){
 const p=await db.prepare("SELECT met_on,reunion_on,reunion_place,photo_key,photo_mime,updated_at FROM couple_stories WHERE room_id=?")
 .bind(u.room_id).first<Profile>();
 const e=await db.prepare("SELECT id,event_date,title,note,annual,created_at FROM couple_story_events WHERE room_id=? ORDER BY event_date DESC,created_at DESC LIMIT 40")
 .bind(u.room_id).all<EventRow>();
 return {profile:{meetingDate:p?.met_on||null,reunionDate:p?.reunion_on||null,reunionPlace:p?.reunion_place||"",
   hasPhoto:Boolean(p?.photo_key),photoVersion:p?.photo_key||null,updatedAt:p?.updated_at||0},
  events:(e.results||[]).map(x=>({id:x.id,date:x.event_date,title:x.title,note:x.note,annual:Boolean(x.annual),createdAt:x.created_at})),
  serverNow:Date.now()};
}
async function handler(ctx:Context,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return no("L’espace histoire est indisponible.",503);
  const u=await auth(ctx.request,db);
  if(!u)return no("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  if(method==="GET")return yes(await state(db,u));
  const raw=await ctx.request.text();
  if(raw.length>2000)return no("Demande trop volumineuse.",413);
  let input:Record<string,unknown>;
  try{input=JSON.parse(raw) as Record<string,unknown>}catch{return no("Demande invalide.",400)}
  const action=input.action,now=Date.now();
  if(action==="set_meeting"){
   const value=input.date;
   if(value!==null&&!validDate(value))return no("Choisis une vraie date de rencontre.",400);
   if(value&&Date.parse(value+"T00:00:00Z")>Date.now()+86400000)return no("La rencontre ne peut pas être dans le futur.",400);
   await db.prepare("INSERT INTO couple_stories(room_id,met_on,updated_at) VALUES(?,?,?) ON CONFLICT(room_id) DO UPDATE SET met_on=excluded.met_on,updated_at=excluded.updated_at")
    .bind(u.room_id,value,now).run();
   return yes(await state(db,u));
  }
  if(action==="set_reunion"){
   const date=input.date;
   const place=clean(input.place,90);
   if(date!==null&&!validDate(date,2020,2100))return no("Choisis une date valide pour vos retrouvailles.",400);
   if(place===null)return no("Le lieu ou petit mot ne doit pas dépasser 90 caractères.",400);
   const current=await db.prepare("SELECT reunion_on FROM couple_stories WHERE room_id=?").bind(u.room_id).first<{reunion_on:string|null}>();
   await db.prepare("INSERT INTO couple_stories(room_id,reunion_on,reunion_place,updated_at) VALUES(?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET reunion_on=excluded.reunion_on,reunion_place=excluded.reunion_place,updated_at=excluded.updated_at")
    .bind(u.room_id,date,place,now).run();
   if(date&&date!==current?.reunion_on)ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"📅 Nos retrouvailles",u.name+" a ajouté une date pour vos prochaines retrouvailles ❤️","home"));
   return yes(await state(db,u));
  }
  if(action==="add_event"){
   if(!validDate(input.date))return no("Choisis une date valide.",400);
   const title=clean(input.title,65),note=clean(input.note,300);
   if(!title||note===null||![true,false].includes(input.annual as boolean))return no("Ajoute un titre (65 caractères maximum) et un petit mot facultatif.",400);
   const count=await db.prepare("SELECT COUNT(*) AS n FROM couple_story_events WHERE room_id=?").bind(u.room_id).first<{n:number}>();
   if(Number(count?.n)>=MAX_EVENTS)return no("Vous avez atteint la limite de 40 souvenirs et dates importantes.",409);
   // Atomic limit protects against simultaneous inserts by both partners.
   const r=await db.prepare("INSERT INTO couple_story_events(id,room_id,event_date,title,note,annual,author_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM couple_story_events WHERE room_id=?)<?")
    .bind(crypto.randomUUID(),u.room_id,input.date,title,note,input.annual?1:0,u.id,now,u.room_id,MAX_EVENTS).run();
   if(r.meta.changes!==1)return no("La liste est complète. Supprime un ancien événement.",409);
   return yes(await state(db,u));
  }
  if(action==="delete_event"){
   if(typeof input.id!=="string"||!/^[a-f0-9-]{36}$/i.test(input.id))return no("Événement introuvable.",404);
   const r=await db.prepare("DELETE FROM couple_story_events WHERE id=? AND room_id=?").bind(input.id,u.room_id).run();
   if(r.meta.changes!==1)return no("Événement déjà supprimé.",404);
   return yes(await state(db,u));
  }
  return no("Action inconnue.",404);
 }catch(err){console.error("Love Radar couple story",err);return no("Impossible de charger votre histoire pour le moment.",503)}
}
export const onRequestGet=(ctx:Context)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Context)=>handler(ctx,"POST");
