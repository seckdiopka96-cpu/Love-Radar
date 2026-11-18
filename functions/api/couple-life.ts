import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Six couple experiences, backed by room-isolated D1 data. */
type Ctx={request:Request;env:PushEnv;waitUntil:(promise:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type Mood={id:string;member_id:string;mood:string;note:string;created_at:number};
type Dream={id:string;author_id:string;title:string;detail:string;done_at:number|null;created_at:number};
type Hug={id:string;sender_id:string;reply_to:string|null;created_at:number};
type Challenge={id:string;member_id:string;challenge_key:string;created_at:number};
type DateRow={id:string;author_id:string;activity:string;planned_at:number;accepted_by:string|null;created_at:number};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const moods=["happy","love","tired","sad","stressed","calm"] as const;
const activities=["movie","games","talk"] as const;
export const WEEKLY_CHALLENGES=[
 {key:"compliment",title:"Un compliment sincère",emoji:"💗"},
 {key:"laugh",title:"Faire rire l'autre",emoji:"😂"},
 {key:"memory",title:"Partager un souvenir",emoji:"📸"},
 {key:"question",title:"Répondre à la question du jour",emoji:"💬"},
 {key:"kindness",title:"Une petite attention",emoji:"🌷"},
 {key:"date",title:"Préparer un rendez-vous",emoji:"🎬"},
 {key:"gratitude",title:"Dire merci pour quelque chose",emoji:"✨"},
 {key:"game",title:"Jouer ensemble",emoji:"🎲"}
] as const;
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:object)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
const sanitize=(v:unknown,max:number):string|null=>{
 if(typeof v!=="string")return null;
 const s=v.trim();
 return s.length<=max&&!/[\u0000-\u001f<>]/.test(s)?s:null;
};
function weekMonday(now:number){
 const d=new Date(now),weekday=(d.getUTCDay()+6)%7;
 return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-weekday)).toISOString().slice(0,10);
}
let ready:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_moods(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,member_id TEXT NOT NULL,day TEXT NOT NULL,mood TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,UNIQUE(room_id,member_id,day));"+
  "CREATE INDEX IF NOT EXISTS idx_couple_moods_room_day ON couple_moods(room_id,day);"+
  "CREATE TABLE IF NOT EXISTS couple_dreams(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,author_id TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',done_at INTEGER,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_couple_dreams_room ON couple_dreams(room_id,created_at DESC);"+
  "CREATE TABLE IF NOT EXISTS couple_hugs(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,reply_to TEXT,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_couple_hugs_room ON couple_hugs(room_id,created_at DESC);"+
  "CREATE TABLE IF NOT EXISTS couple_weekly_challenges(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,member_id TEXT NOT NULL,week TEXT NOT NULL,challenge_key TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(room_id,member_id,week,challenge_key));"+
  "CREATE INDEX IF NOT EXISTS idx_couple_challenges_room_week ON couple_weekly_challenges(room_id,week);"+
  "CREATE TABLE IF NOT EXISTS couple_date_nights(room_id TEXT PRIMARY KEY,id TEXT NOT NULL,author_id TEXT NOT NULL,activity TEXT NOT NULL,planned_at INTEGER NOT NULL,accepted_by TEXT,created_at INTEGER NOT NULL);"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 return ready;
}
async function authenticate(request:Request,db:D1Database):Promise<Member|null>{
 const raw=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(raw))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function snapshot(db:D1Database,u:Member){
 const now=Date.now(),day=new Date(now).toISOString().slice(0,10),week=weekMonday(now);
 const [m,d,h,c,date,members]=await Promise.all([
  db.prepare("SELECT id,member_id,mood,note,created_at FROM couple_moods WHERE room_id=? AND day=?").bind(u.room_id,day).all<Mood>(),
  db.prepare("SELECT id,author_id,title,detail,done_at,created_at FROM couple_dreams WHERE room_id=? ORDER BY created_at DESC LIMIT 40").bind(u.room_id).all<Dream>(),
  db.prepare("SELECT id,sender_id,reply_to,created_at FROM couple_hugs WHERE room_id=? ORDER BY created_at DESC LIMIT 30").bind(u.room_id).all<Hug>(),
  db.prepare("SELECT id,member_id,challenge_key,created_at FROM couple_weekly_challenges WHERE room_id=? AND week=?").bind(u.room_id,week).all<Challenge>(),
  db.prepare("SELECT id,author_id,activity,planned_at,accepted_by,created_at FROM couple_date_nights WHERE room_id=?").bind(u.room_id).first<DateRow>(),
  db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>()
 ]);
 return {day,week,serverNow:now,memberCount:Number(members?.n||0),
  moods:(m.results||[]).map(x=>({id:x.id,memberId:x.member_id,mood:x.mood,note:x.note,createdAt:x.created_at})),
  dreams:(d.results||[]).map(x=>({id:x.id,authorId:x.author_id,title:x.title,detail:x.detail,doneAt:x.done_at,createdAt:x.created_at})),
  hugs:(h.results||[]).map(x=>({id:x.id,senderId:x.sender_id,replyTo:x.reply_to,createdAt:x.created_at})),
  challenges:WEEKLY_CHALLENGES,
  completions:(c.results||[]).map(x=>({id:x.id,memberId:x.member_id,key:x.challenge_key,createdAt:x.created_at})),
  date:date?{id:date.id,authorId:date.author_id,activity:date.activity,plannedAt:date.planned_at,acceptedBy:date.accepted_by,createdAt:date.created_at}:null};
}
async function handler(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Le quotidien à deux est indisponible.",503);
  const u=await authenticate(ctx.request,db);
  if(!u)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  if(method==="GET")return ok(await snapshot(db,u));
  const raw=await ctx.request.text();
  if(raw.length>2400)return fail("Demande trop longue.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Demande invalide.")}
  const action=data.action,now=Date.now(),day=new Date(now).toISOString().slice(0,10),week=weekMonday(now);
  const memberCount=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>();
  if(Number(memberCount?.n)!==2)return fail("Invitez votre partenaire pour profiter de cet espace ensemble.",409);
  let notice:{title:string;body:string;kind:"couple-date"|"couple-mood"|"couple-dream"|"couple-hug"|"couple-challenge";id:string}|null=null;
  if(action==="mood_set"){
   if(typeof data.mood!=="string"||!moods.includes(data.mood as typeof moods[number]))return fail("Cette humeur est inconnue.");
   const note=sanitize(data.note??"",180);
   if(note===null)return fail("Ton petit mot est trop long.");
   const previous=await db.prepare("SELECT id,mood,created_at FROM couple_moods WHERE room_id=? AND member_id=? AND day=?").bind(u.room_id,u.id,day).first<Mood>();
   const id=previous?.id||crypto.randomUUID();
   await db.prepare("INSERT INTO couple_moods(id,room_id,member_id,day,mood,note,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(room_id,member_id,day) DO UPDATE SET mood=excluded.mood,note=excluded.note,created_at=excluded.created_at")
    .bind(id,u.room_id,u.id,day,data.mood,note,now).run();
   if(!previous||previous.mood!==data.mood)
    notice={title:"💗 Un petit signe de ton amour",body:u.name+" a partagé son humeur du jour.",kind:"couple-mood",id};
  }else if(action==="mood_clear"){
   await db.prepare("DELETE FROM couple_moods WHERE room_id=? AND member_id=? AND day=?").bind(u.room_id,u.id,day).run();
  }else if(action==="dream_add"){
   const title=sanitize(data.title,95),detail=sanitize(data.detail??"",350);
   if(!title||detail===null)return fail("Ajoute un rêve et une description courte.");
   const id=crypto.randomUUID();
   const r=await db.prepare("INSERT INTO couple_dreams(id,room_id,author_id,title,detail,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM couple_dreams WHERE room_id=?)<40")
    .bind(id,u.room_id,u.id,title,detail,now,u.room_id).run();
   if(r.meta.changes!==1)return fail("Votre liste contient déjà 40 rêves.",409);
   notice={title:"✨ Un nouveau rêve à deux",body:u.name+" a ajouté un projet dans votre liste.",kind:"couple-dream",id};
  }else if(action==="dream_toggle"||action==="dream_delete"){
   if(!uuid(data.id))return fail("Rêve introuvable.",404);
   const r=action==="dream_toggle"?
    await db.prepare("UPDATE couple_dreams SET done_at=CASE WHEN done_at IS NULL THEN ? ELSE NULL END WHERE id=? AND room_id=?").bind(now,data.id,u.room_id).run():
    await db.prepare("DELETE FROM couple_dreams WHERE id=? AND room_id=?").bind(data.id,u.room_id).run();
   if(r.meta.changes!==1)return fail("Ce rêve n'existe plus.",404);
  }else if(action==="hug_send"||action==="hug_reply"){
   let replyTo:string|null=null;
   if(action==="hug_reply"){
    if(!uuid(data.id))return fail("Câlin introuvable.",404);
    replyTo=data.id;
    const original=await db.prepare("SELECT sender_id,reply_to FROM couple_hugs WHERE id=? AND room_id=?").bind(replyTo,u.room_id).first<Hug>();
    if(!original||original.sender_id===u.id||original.reply_to)return fail("Ce câlin ne peut plus recevoir de réponse.",403);
   }
   const recent=await db.prepare("SELECT created_at FROM couple_hugs WHERE room_id=? AND sender_id=? ORDER BY created_at DESC LIMIT 1").bind(u.room_id,u.id).first<{created_at:number}>();
   if(recent&&now-recent.created_at<30000)return fail("Un câlin vient d'être envoyé. Réessaie dans un instant.",429);
   const id=crypto.randomUUID();
   const result=await db.prepare("INSERT INTO couple_hugs(id,room_id,sender_id,reply_to,created_at) SELECT ?,?,?,?,? WHERE ? IS NULL OR NOT EXISTS(SELECT 1 FROM couple_hugs WHERE room_id=? AND sender_id=? AND reply_to=?)")
    .bind(id,u.room_id,u.id,replyTo,now,replyTo,u.room_id,u.id,replyTo).run();
   if(result.meta.changes!==1)return fail("Tu as déjà répondu à ce câlin.",409);
   notice={title:replyTo?"🫂 Un câlin en retour !":"🫂 Un câlin pour toi",body:u.name+" t'envoie beaucoup de tendresse ❤️",kind:"couple-hug",id};
  }else if(action==="challenge_toggle"){
   const key=data.key;
   if(typeof key!=="string"||!WEEKLY_CHALLENGES.some(x=>x.key===key))return fail("Défi inconnu.");
   const existing=await db.prepare("SELECT id FROM couple_weekly_challenges WHERE room_id=? AND member_id=? AND week=? AND challenge_key=?").bind(u.room_id,u.id,week,key).first<{id:string}>();
   if(existing){
    await db.prepare("DELETE FROM couple_weekly_challenges WHERE room_id=? AND member_id=? AND week=? AND challenge_key=?").bind(u.room_id,u.id,week,key).run();
   }else{
    const id=crypto.randomUUID();
    const r=await db.prepare("INSERT OR IGNORE INTO couple_weekly_challenges(id,room_id,member_id,week,challenge_key,created_at) VALUES(?,?,?,?,?,?)").bind(id,u.room_id,u.id,week,key,now).run();
    if(r.meta.changes===1)notice={title:"🏆 Un défi accompli !",body:u.name+" a validé un défi de votre semaine.",kind:"couple-challenge",id};
   }
  }else if(action==="date_invite"){
   const at=data.plannedAt,activity=data.activity;
   if(typeof at!=="number"||!Number.isSafeInteger(at)||at<now+60000||at>now+90*86400000)return fail("Choisis une date entre demain et les 90 prochains jours (au moins une minute à l'avance).");
   if(typeof activity!=="string"||!activities.includes(activity as typeof activities[number]))return fail("Activité inconnue.");
   const last=await db.prepare("SELECT created_at FROM couple_date_nights WHERE room_id=?").bind(u.room_id).first<{created_at:number}>();
   if(last&&now-last.created_at<60000)return fail("Une invitation vient d'être envoyée. Patiente une minute.",429);
   const id=crypto.randomUUID();
   await db.prepare("INSERT INTO couple_date_nights(room_id,id,author_id,activity,planned_at,accepted_by,created_at) VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(room_id) DO UPDATE SET id=excluded.id,author_id=excluded.author_id,activity=excluded.activity,planned_at=excluded.planned_at,accepted_by=NULL,created_at=excluded.created_at").bind(u.room_id,id,u.id,activity,at,now).run();
   notice={title:"🌙 Invitation à notre soirée",body:u.name+" t'invite à une soirée à deux. Viens accepter !",kind:"couple-date",id};
  }else if(action==="date_accept"){
   if(!uuid(data.id))return fail("Invitation introuvable.",404);
   const result=await db.prepare("UPDATE couple_date_nights SET accepted_by=? WHERE room_id=? AND id=? AND author_id<>? AND accepted_by IS NULL").bind(u.id,u.room_id,data.id,u.id).run();
   if(result.meta.changes!==1)return fail("Cette invitation est déjà traitée ou expirée.",409);
   notice={title:"💕 Votre soirée est confirmée",body:u.name+" a accepté votre rendez-vous !",kind:"couple-date",id:data.id};
  }else if(action==="date_cancel"){
   if(!uuid(data.id))return fail("Invitation introuvable.",404);
   const result=await db.prepare("DELETE FROM couple_date_nights WHERE room_id=? AND id=?").bind(u.room_id,data.id).run();
   if(result.meta.changes!==1)return fail("Cette invitation a déjà été retirée.",404);
  }else return fail("Action inconnue.",404);
  if(notice)ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,notice.title,notice.body,"life",{kind:notice.kind,id:notice.id}));
  return ok(await snapshot(db,u));
 }catch(e){console.error("Love Radar couple life",e);return fail("Ce moment n'a pas pu être enregistré.",503)}
}
export const onRequestGet=(ctx:Ctx)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handler(ctx,"POST");
