import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { notifyPartner, type PushEnv } from "../lib/push";
import { ensureProfilePhotos } from "./profile";
import {roomRevision,markRoomChanged} from "../lib/room-revision";
import {roomPublicKeys,encryptedText,validPublicKey,ENCRYPTED_TEXT_PREFIX} from "../lib/e2ee";
import {deleteCoupleRoom} from "../lib/delete-room";
import {generateRecoveryCode,ensureRecoveryCodes,recoveryHash} from "../lib/account-recovery";
import {consumePublicLimit,consumeMemberLimit,PUBLIC_LIMITS,MEMBER_LIMITS,throttled} from "../lib/abuse-limits";

// Automatic and idempotent migration for both existing and new D1 rooms.
let presenceReady: Promise<void> | null = null;
async function ensureChatPresence(db:D1Database){
 if(!presenceReady){
  presenceReady=(async()=>{
   await db.exec("CREATE TABLE IF NOT EXISTS chat_presence (room_id TEXT NOT NULL, member_id TEXT NOT NULL, last_read_at INTEGER NOT NULL DEFAULT 0, typing_until INTEGER NOT NULL DEFAULT 0, recording_until INTEGER NOT NULL DEFAULT 0, last_seen_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room_id,member_id))");
   const columns=await db.prepare("PRAGMA table_info(chat_presence)").all<{name:string}>();
   for(const field of ["last_seen_at","recording_until","last_reaction_read_at"] as const){
    if(columns.results.some(col=>col.name===field))continue;
    try{await db.exec("ALTER TABLE chat_presence ADD COLUMN "+field+" INTEGER NOT NULL DEFAULT 0")}
    catch(err){
     const updated=await db.prepare("PRAGMA table_info(chat_presence)").all<{name:string}>();
     if(!updated.results.some(col=>col.name===field))throw err;
    }
   }
  })().catch(err=>{presenceReady=null;throw err});
 }
 await presenceReady;
}

/* Separate metadata table keeps all existing couples/messages intact.
   The reply link is always validated against the authenticated room. */
let repliesReady:Promise<void>|null=null;
async function ensureMessageReplies(db:D1Database){
 if(!repliesReady){
  repliesReady=db.exec("CREATE TABLE IF NOT EXISTS message_replies (room_id TEXT NOT NULL, message_id TEXT NOT NULL PRIMARY KEY, target_id TEXT NOT NULL, created_at INTEGER NOT NULL)").then(()=>{}).catch(err=>{repliesReady=null;throw err});
 }
 await repliesReady;
}

/* Action metadata lives in separate tables so existing messages need no schema
   rewrite. Every lookup and mutation is scoped to the authenticated room. */
let actionsReady:Promise<void>|null=null;
async function ensureMessageActions(db:D1Database){
 if(!actionsReady)actionsReady=(async()=>{
  await db.exec("CREATE TABLE IF NOT EXISTS message_edits (room_id TEXT NOT NULL, message_id TEXT PRIMARY KEY, edited_at INTEGER NOT NULL)");
  await db.exec("CREATE TABLE IF NOT EXISTS message_reactions (room_id TEXT NOT NULL, message_id TEXT NOT NULL, member_id TEXT NOT NULL, emoji TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(room_id,message_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS message_hidden (room_id TEXT NOT NULL, message_id TEXT NOT NULL, member_id TEXT NOT NULL, hidden_at INTEGER NOT NULL, PRIMARY KEY(room_id,message_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS message_one_time (room_id TEXT NOT NULL, message_id TEXT PRIMARY KEY, opened_by TEXT, opened_at INTEGER NOT NULL DEFAULT 0)");
 })().catch(err=>{actionsReady=null;throw err});
 await actionsReady;
}
const MESSAGE_REACTIONS=new Set(["👍","❤️","😂","😮","😢","🙏","👏"]);
const validMessageId=(id:unknown):id is string=>typeof id==="string"&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);


type Env = PushEnv & {STORAGE?: R2Bucket};
type Context = { request: Request; env: Env; waitUntil:(task:Promise<unknown>)=>void };

function createHandlers(env: Env, waitUntil:(task:Promise<unknown>)=>void) {
  const bindings = () => env;


type Member = {id:string,room_id:string,name:string,seat:number,invite:string,owner_id:string};
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function inviteCode(){let s="";const random=new Uint8Array(10);crypto.getRandomValues(random);for(const x of random)s+=alphabet[x%alphabet.length];return s}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hash(str:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")}
const fail=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:unknown)=>Response.json({ok:true,...(data as object)},{headers:{"Cache-Control":"no-store"}});
async function auth(request:Request):Promise<{db:D1Database,user:Member}|null>{
 const db=bindings().DB as D1Database|undefined;
 if(!db)return null;
 const raw=request.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(raw))return null;
 const identity=await hash(raw.slice(7));
 const user=await db.prepare("SELECT m.id,m.room_id,m.name,m.seat,r.invite,r.owner_id FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.token_hash=?").bind(identity).first<Member>();
 return user?{db,user}:null;
}
async function snapshot(db:D1Database,u:Member){
 await ensureProfilePhotos(db);
 const partners=await db.prepare("SELECT id,name,seat FROM members WHERE room_id=? ORDER BY seat").bind(u.room_id).all<{id:string,name:string,seat:number}>();
 const avatars=await db.prepare("SELECT member_id,updated_at FROM profile_photos WHERE room_id=?")
  .bind(u.room_id).all<{member_id:string;updated_at:number}>();
 const avatarMap=new Map(avatars.results.map(photo=>[photo.member_id,photo.updated_at]));
 const partnerMember=partners.results.find(person=>person.id!==u.id);
 await ensureMessageReplies(db);
 await ensureMessageActions(db);
 const messages=await db.prepare(
  "SELECT m.id,m.sender_id,m.kind,m.content,m.object_key,m.mime,m.created_at,"+
  " r.target_id AS reply_to_id,p.kind AS reply_kind,p.content AS reply_content,p.sender_id AS reply_sender_id,COALESCE(ed.edited_at,0) AS edited_at,"+
  " CASE WHEN ot.message_id IS NULL THEN 0 ELSE 1 END AS view_once,COALESCE(ot.opened_at,0) AS once_opened_at"+
  " FROM messages m LEFT JOIN message_replies r ON r.room_id=m.room_id AND r.message_id=m.id"+
  " LEFT JOIN message_edits ed ON ed.room_id=m.room_id AND ed.message_id=m.id"+
  " LEFT JOIN messages p ON p.id=r.target_id AND p.room_id=m.room_id"+
  " LEFT JOIN message_one_time ot ON ot.room_id=m.room_id AND ot.message_id=m.id"+
  " WHERE m.room_id=? AND m.kind IN ('text','image','audio') AND NOT EXISTS"+
  " (SELECT 1 FROM message_hidden h WHERE h.room_id=m.room_id AND h.message_id=m.id AND h.member_id=?)"+
  " ORDER BY m.created_at DESC,m.id DESC LIMIT 90"
 ).bind(u.room_id,u.id).all();
 const reactions=await db.prepare(
  "SELECT message_id,member_id,emoji FROM message_reactions WHERE room_id=? AND message_id IN"+
  " (SELECT id FROM messages WHERE room_id=? AND NOT EXISTS"+
  " (SELECT 1 FROM message_hidden h WHERE h.room_id=messages.room_id AND h.message_id=messages.id AND h.member_id=?)"+
  " ORDER BY created_at DESC,id DESC LIMIT 90)"
 ).bind(u.room_id,u.room_id,u.id).all<{message_id:string;member_id:string;emoji:string}>();
 const reactionsById=new Map<string,{member_id:string;emoji:string}[]>();
 for(const reaction of reactions.results){
  const previous=reactionsById.get(reaction.message_id)||[];
  previous.push({member_id:reaction.member_id,emoji:reaction.emoji});
  reactionsById.set(reaction.message_id,previous);
 }
 const recentReaction=await db.prepare(
  "SELECT mr.message_id,mr.member_id,mr.emoji,mr.updated_at,m.kind,m.content"+
  " FROM message_reactions mr JOIN messages m ON m.id=mr.message_id AND m.room_id=mr.room_id"+
  " WHERE mr.room_id=? AND NOT EXISTS"+
  " (SELECT 1 FROM message_hidden h WHERE h.room_id=mr.room_id AND h.message_id=mr.message_id AND h.member_id=?)"+
  " ORDER BY mr.updated_at DESC,mr.message_id DESC LIMIT 1"
 ).bind(u.room_id,u.id).first<{message_id:string;member_id:string;emoji:string;updated_at:number;kind:"text"|"image"|"audio";content:string|null}>();
 const revision=await roomRevision(db,u.room_id);
 const otherStatus=await db.prepare("SELECT last_read_at,typing_until,recording_until,last_seen_at FROM chat_presence WHERE room_id=? AND member_id<>? LIMIT 1").bind(u.room_id,u.id).first<{last_read_at:number,typing_until:number,recording_until:number,last_seen_at:number}>();
 const publicKeys=await roomPublicKeys(db,u.room_id);
 const ownPublicKey=publicKeys.find(k=>k.member_id===u.id)?.public_key||null;
 const partnerPublicKey=partnerMember?publicKeys.find(k=>k.member_id===partnerMember.id)?.public_key||null:null;
 const unread=await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE room_id=? AND sender_id<>? AND kind IN ('text','image','audio') AND created_at>COALESCE((SELECT last_read_at FROM chat_presence WHERE room_id=? AND member_id=?),0) AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.room_id=messages.room_id AND h.message_id=messages.id AND h.member_id=?)")
  .bind(u.room_id,u.id,u.room_id,u.id,u.id).first<{n:number}>();


 const unreadReactions=await db.prepare("SELECT COUNT(*) AS n FROM message_reactions WHERE room_id=? AND member_id<>? AND updated_at>COALESCE((SELECT last_reaction_read_at FROM chat_presence WHERE room_id=? AND member_id=?),0) AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.room_id=message_reactions.room_id AND h.message_id=message_reactions.message_id AND h.member_id=?)")
  .bind(u.room_id,u.id,u.room_id,u.id,u.id).first<{n:number}>();
 return {revision,user:{id:u.id,name:u.name,seat:u.seat,owner:u.owner_id===u.id,avatarVersion:avatarMap.get(u.id)||0},code:u.invite,roomId:u.room_id,
  partner:partnerMember?.name||null,partnerId:partnerMember?.id||null,partnerAvatarVersion:partnerMember?avatarMap.get(partnerMember.id)||0:0,members:partners.results.length,
  e2ee:{mine:ownPublicKey,partner:partnerPublicKey,required:Boolean(ownPublicKey&&partnerPublicKey)},
  messages:messages.results.reverse().map(row=>({...row,reactions:reactionsById.get(String(row.id))||[]})),recentReaction:recentReaction||null,unreadCount:Number(unread?.n||0)+Number(unreadReactions?.n||0),partnerReadAt:otherStatus?.last_read_at??0,partnerTypingUntil:otherStatus?.typing_until??0,partnerRecordingUntil:otherStatus?.recording_until??0,partnerLastSeenAt:otherStatus?.last_seen_at??0};
}

  const handlers: Record<"GET"|"POST",(args:{request:Request})=>Promise<Response>> = {
  GET:async({request})=>{
   try{
    const session=await auth(request);
    if(!session)return fail("Session expirée ou invalide.",401);
    await ensureChatPresence(session.db);
    if(new URL(request.url).searchParams.get("status")==="1"){
     const presence=await session.db.prepare("SELECT typing_until,recording_until,last_seen_at FROM chat_presence WHERE room_id=? AND member_id<>? LIMIT 1")
      .bind(session.user.room_id,session.user.id).first<{typing_until:number,recording_until:number,last_seen_at:number}>();
     const revision=await roomRevision(session.db,session.user.room_id);
     return ok({revision,partnerTypingUntil:presence?.typing_until??0,partnerRecordingUntil:presence?.recording_until??0,partnerLastSeenAt:presence?.last_seen_at??0});
    }
    const overview=await snapshot(session.db,session.user);
    const id=new URL(request.url).searchParams.get("messageId");
    if(id){
     if(!/^[a-f0-9-]{36}$/i.test(id))return fail("Identifiant de message invalide.",400);
     const focus=await session.db.prepare(
      "SELECT m.id,m.sender_id,m.kind,m.content,m.object_key,m.mime,m.created_at,"+
      " r.target_id AS reply_to_id,p.kind AS reply_kind,p.content AS reply_content,p.sender_id AS reply_sender_id,COALESCE(ed.edited_at,0) AS edited_at,"+
      " CASE WHEN ot.message_id IS NULL THEN 0 ELSE 1 END AS view_once,COALESCE(ot.opened_at,0) AS once_opened_at"+
      " FROM messages m LEFT JOIN message_replies r ON r.room_id=m.room_id AND r.message_id=m.id"+
      " LEFT JOIN message_edits ed ON ed.room_id=m.room_id AND ed.message_id=m.id"+
      " LEFT JOIN messages p ON p.id=r.target_id AND p.room_id=m.room_id"+
      " LEFT JOIN message_one_time ot ON ot.room_id=m.room_id AND ot.message_id=m.id"+
      " WHERE m.room_id=? AND m.id=? AND m.kind IN ('text','image','audio') AND NOT EXISTS"+
      " (SELECT 1 FROM message_hidden h WHERE h.room_id=m.room_id AND h.message_id=m.id AND h.member_id=?) LIMIT 1"
     ).bind(session.user.room_id,id,session.user.id).first();
     return ok({...overview,focusMessage:focus||null});
    }
    return ok(overview);
   }catch(err){console.error("Love Radar snapshot",err);return fail("Erreur temporaire du service.",500)}
  },
  POST:async({request})=>{
   try{
    const len=Number(request.headers.get("content-length")||0);
    if(len>8192)return fail("Demande trop volumineuse.",413);
    const txt=await request.text();if(txt.length>8192)return fail("Demande trop volumineuse.",413);
    const body=JSON.parse(txt) as Record<string,unknown>;
    const op=body?.action;
    const db=bindings().DB as D1Database|undefined;
    if(!db)return fail("Stockage non disponible.",503);
    if(op==="create"||op==="join"){
     const publicLimit=op==="create"?PUBLIC_LIMITS.create:PUBLIC_LIMITS.join;
     if(!await consumePublicLimit(db,request,publicLimit))return throttled(publicLimit);
     await ensureRecoveryCodes(db);
     const name=String(body.name||"").trim().slice(0,30);
     if(name.length<2||/[<>\u0000-\u001f]/.test(name))return fail("Choisis un prénom entre 2 et 30 caractères.");
     const secret=token(),id=crypto.randomUUID(),now=Date.now(),digest=await hash(secret);
     if(op==="create"){
      const room=crypto.randomUUID(),code=inviteCode();
      const recoveryCode=generateRecoveryCode(),recoveryDigest=await recoveryHash(recoveryCode);
      // A room without a recovery method must never be committed on a partial failure.
      try{
       await db.batch([
        db.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?)").bind(room,code,id,now),
        db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) VALUES(?,?,?,?,?,?)").bind(id,room,name,0,digest,now),
        db.prepare("INSERT INTO member_recovery(member_id,code_hash,created_at) VALUES(?,?,?)").bind(id,recoveryDigest,now)
       ]);
      }catch{return fail("Impossible de créer l’espace. Réessaie.",503)}
      return ok({token:secret,code,recoveryCode});
     }
     const code=String(body.code||"").trim().toUpperCase().replace(/[\s-]+/g,"");
     if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code))return fail("Code d’invitation invalide.");
     const room=await db.prepare("SELECT id FROM rooms WHERE invite=?").bind(code).first<{id:string}>();
     if(!room)return fail("Code inconnu. Vérifie avec ton partenaire.",404);
     const recoveryCode=generateRecoveryCode(),recoveryDigest=await recoveryHash(recoveryCode);
     // Both statements are committed or rolled back together; a full room
     // must not create an orphan backup code, nor a member without a backup.
     try{
      const inserted=await db.batch([
       db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) SELECT ?,?, ?,1,?,? WHERE (SELECT COUNT(*) FROM members WHERE room_id=?)=1")
        .bind(id,room.id,name,digest,now,room.id),
       db.prepare("INSERT INTO member_recovery(member_id,code_hash,created_at) SELECT id,?,? FROM members WHERE id=?")
        .bind(recoveryDigest,now,id)
      ]);
      if(inserted[0].meta.changes!==1||inserted[1].meta.changes!==1)return fail("Cet espace est déjà complet.",409);
     }catch{return fail("Cet espace est déjà complet.",409)}
     await markRoomChanged(db,room.id);
     waitUntil(notifyPartner(env,room.id,id,"Votre espace ❤️","Ton partenaire vient de rejoindre votre espace !","home"));
     return ok({token:secret,code,recoveryCode});
    }
    const session=await auth(request);if(!session)return fail("Session expirée. Rejoins ton espace.",401);
    const {user:u}=session;
    if(op==="enable-e2ee"){
     if(!validPublicKey(body.publicKey))return fail("Clé publique invalide.",400);
     const current=await roomPublicKeys(db,u.room_id);
     const prior=current.find(row=>row.member_id===u.id);
     if(prior&&prior.public_key!==body.publicKey)return fail("Cette identité est déjà activée. La clé privée ne peut pas être remplacée silencieusement.",409);
     if(prior)return ok({enabled:true,duplicate:true});
     await db.prepare("INSERT INTO e2ee_keys(member_id,room_id,public_key,created_at) VALUES(?,?,?,?) ON CONFLICT(member_id) DO NOTHING")
      .bind(u.id,u.room_id,body.publicKey,Date.now()).run();
     const saved=await roomPublicKeys(db,u.room_id);
     if(saved.find(row=>row.member_id===u.id)?.public_key!==body.publicKey)return fail("Identité de chiffrement différente.",409);
     await markRoomChanged(db,u.room_id);
     return ok({enabled:true});
    }
    if(op==="presence"){
     await ensureChatPresence(db);
     await db.prepare("INSERT INTO chat_presence(room_id,member_id,last_seen_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET last_seen_at=excluded.last_seen_at").bind(u.room_id,u.id,Date.now()).run();
     return ok({online:true});
    }
    if(op==="typing"||op==="recording"){
      await ensureChatPresence(db);
      const now=Date.now(),until=body.active===true?now+8500:0;
      if(op==="typing"){
       await db.prepare("INSERT INTO chat_presence(room_id,member_id,typing_until,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET typing_until=excluded.typing_until,last_seen_at=excluded.last_seen_at")
        .bind(u.room_id,u.id,until,now).run();
      }else{
       await db.prepare("INSERT INTO chat_presence(room_id,member_id,recording_until,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET recording_until=excluded.recording_until,last_seen_at=excluded.last_seen_at")
        .bind(u.room_id,u.id,until,now).run();
      }
      return ok({activity:op,until});
    }
    if(op==="read"){
     await ensureChatPresence(db);
     const last=await db.prepare("SELECT MAX(created_at) AS stamp FROM messages WHERE room_id=? AND sender_id<>? AND kind IN ('text','image','audio')").bind(u.room_id,u.id).first<{stamp:number|null}>();
     await ensureMessageActions(db);
     const lastReaction=await db.prepare("SELECT MAX(updated_at) AS stamp FROM message_reactions WHERE room_id=? AND member_id<>?")
      .bind(u.room_id,u.id).first<{stamp:number|null}>();
     if(last?.stamp||lastReaction?.stamp){
      const previous=await db.prepare("SELECT last_read_at,last_reaction_read_at FROM chat_presence WHERE room_id=? AND member_id=?")
       .bind(u.room_id,u.id).first<{last_read_at:number;last_reaction_read_at:number}>();
      const isNew=Number(last?.stamp||0)>Number(previous?.last_read_at||0)||Number(lastReaction?.stamp||0)>Number(previous?.last_reaction_read_at||0);
      if(isNew){
       await db.prepare("INSERT INTO chat_presence(room_id,member_id,last_read_at,last_reaction_read_at) VALUES(?,?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET last_read_at=MAX(last_read_at,excluded.last_read_at),last_reaction_read_at=MAX(last_reaction_read_at,excluded.last_reaction_read_at)")
        .bind(u.room_id,u.id,last?.stamp||0,lastReaction?.stamp||0).run();
       await markRoomChanged(db,u.room_id);
      }
     }
     return ok({read:true});
    }
    if(op==="message"){
     const message=String(body.text||"").trim();
     if(!message||message.length>12000)return fail("Message trop volumineux.",413);
     const keys=await roomPublicKeys(db,u.room_id);
     const ownKey=keys.some(row=>row.member_id===u.id);
     if(ownKey&&keys.length!==2)return fail("Ton partenaire doit d’abord activer le chiffrement avant tout nouvel envoi.",409);
     if(keys.length===2&&!encryptedText(message))return fail("Ce couple exige désormais un message chiffré.",409);
     if(keys.length!==2&&message.startsWith(ENCRYPTED_TEXT_PREFIX))return fail("Les deux partenaires doivent activer le chiffrement.",409);
     if(keys.length!==2&&message.length>1600)return fail("Écris un message de 1 à 1 600 caractères.");
     const replyTo=body.replyTo==null?"":String(body.replyTo);
     if(replyTo&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(replyTo))return fail("Référence de réponse invalide.",400);
     if(replyTo){
      await ensureMessageReplies(db);
      const quoted=await db.prepare("SELECT id FROM messages WHERE room_id=? AND id=? AND kind IN ('text','image','audio') LIMIT 1")
       .bind(u.room_id,replyTo).first<{id:string}>();
      if(!quoted)return fail("Ce message n’appartient pas à votre conversation.",404);
     }
     // Client-supplied UUID makes rapid sends and retries idempotent.
     const requestedId=body.messageId;
     if(requestedId!=null&&!validMessageId(requestedId))return fail("Identifiant de message invalide.",400);
     const messageId=requestedId||crypto.randomUUID(),now=Date.now();
     const existing=await db.prepare(
      "SELECT m.id,m.room_id,m.sender_id,m.kind,m.content,r.target_id AS reply_to_id"+
      " FROM messages m LEFT JOIN message_replies r ON r.room_id=m.room_id AND r.message_id=m.id WHERE m.id=?"
     ).bind(messageId).first<{id:string;room_id:string;sender_id:string;kind:string;content:string|null;reply_to_id:string|null}>();
     if(existing){
      if(existing.room_id!==u.room_id||existing.sender_id!==u.id||existing.kind!=="text"||existing.content!==message||(existing.reply_to_id||"")!==replyTo)
       return fail("Identifiant déjà utilisé.",409);
      return ok({sent:true,id:messageId,duplicate:true});
     }
     if(!await consumeMemberLimit(db,u.id,MEMBER_LIMITS.message))return throttled(MEMBER_LIMITS.message);
     if(replyTo){
      // Both rows commit together: never deliver an uncited reply when a
      // server write fails partway through.
      await db.batch([
       db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,'text',?,?)")
        .bind(messageId,u.room_id,u.id,message,now),
       db.prepare("INSERT INTO message_replies(room_id,message_id,target_id,created_at) VALUES(?,?,?,?)")
        .bind(u.room_id,messageId,replyTo,now)
      ]);
     }else{
      await db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,'text',?,?)")
       .bind(messageId,u.room_id,u.id,message,now).run();
     }
     await markRoomChanged(db,u.room_id);
     await ensureChatPresence(db);
     await db.prepare("UPDATE chat_presence SET typing_until=0 WHERE room_id=? AND member_id=?").bind(u.room_id,u.id).run();
     waitUntil(notifyPartner(env,u.room_id,u.id,"Nouveau message 💌",u.name+(message.startsWith("[sticker:v1:")&&/^\[sticker:v1:[a-z0-9-]{1,36}\]$/.test(message)?" t’a envoyé un sticker.":" t’a envoyé un message."),"chat",{kind:"message",id:messageId}));
     return ok({sent:true,id:messageId});
    }
    if(op==="edit-message"){
     if(!validMessageId(body.id))return fail("Message invalide.",400);
     if(typeof body.text!=="string")return fail("Écris un texte valide.",400);
     const updated=body.text.trim();
     if(!updated||updated.length>12000)return fail("Le texte est trop volumineux.",413);
     const keys=await roomPublicKeys(db,u.room_id);
     if(keys.length===2&&!encryptedText(updated))return fail("Modification chiffrée requise.",409);
     if(keys.length!==2&&updated.startsWith(ENCRYPTED_TEXT_PREFIX))return fail("Le chiffrement n’est pas encore actif.",409);
     if(keys.length!==2&&updated.length>1600)return fail("Le texte doit contenir entre 1 et 1 600 caractères.",400);
     const own=await db.prepare("SELECT content FROM messages WHERE id=? AND room_id=? AND sender_id=? AND kind='text'")
      .bind(body.id,u.room_id,u.id).first<{content:string|null}>();
     if(!own)return fail("Tu peux modifier uniquement tes propres textes.",403);
     if(own.content===updated)return ok({edited:true,unchanged:true});
     await ensureMessageActions(db);
     const now=Date.now();
     await db.batch([
      db.prepare("UPDATE messages SET content=? WHERE id=? AND room_id=? AND sender_id=? AND kind='text'")
       .bind(updated,body.id,u.room_id,u.id),
      db.prepare("INSERT INTO message_edits(room_id,message_id,edited_at) VALUES(?,?,?) ON CONFLICT(message_id) DO UPDATE SET edited_at=excluded.edited_at WHERE message_edits.room_id=excluded.room_id")
       .bind(u.room_id,body.id,now)
     ]);
     await markRoomChanged(db,u.room_id);
     return ok({edited:true,edited_at:now});
    }
    if(op==="react-message"){
     if(!validMessageId(body.id))return fail("Message invalide.",400);
     if(typeof body.emoji!=="string"||!MESSAGE_REACTIONS.has(body.emoji))return fail("Réaction inconnue.",400);
     const target=await db.prepare("SELECT kind,content FROM messages WHERE id=? AND room_id=? AND kind IN ('text','image','audio') AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.room_id=messages.room_id AND h.message_id=messages.id AND h.member_id=?)")
      .bind(body.id,u.room_id,u.id).first<{kind:"text"|"image"|"audio";content:string|null}>();
     if(!target)return fail("Message introuvable.",404);
     await ensureMessageActions(db);
     if(!await consumeMemberLimit(db,u.id,MEMBER_LIMITS.reaction))return throttled(MEMBER_LIMITS.reaction);
     const existing=await db.prepare("SELECT emoji FROM message_reactions WHERE room_id=? AND message_id=? AND member_id=?")
      .bind(u.room_id,body.id,u.id).first<{emoji:string}>();
     if(existing?.emoji===body.emoji){
      await db.prepare("DELETE FROM message_reactions WHERE room_id=? AND message_id=? AND member_id=?")
       .bind(u.room_id,body.id,u.id).run();
      await markRoomChanged(db,u.room_id);
      return ok({reaction:null});
     }
     const now=Date.now();
     await db.prepare("INSERT INTO message_reactions(room_id,message_id,member_id,emoji,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id,message_id,member_id) DO UPDATE SET emoji=excluded.emoji,updated_at=excluded.updated_at")
      .bind(u.room_id,body.id,u.id,body.emoji,now).run();
     await markRoomChanged(db,u.room_id);
     const raw=target.kind==="image"?"une photo":target.kind==="audio"?"un message vocal":(target.content||"").startsWith(ENCRYPTED_TEXT_PREFIX)?"un message chiffré":/^\[sticker:v1:[a-z0-9-]{1,36}\]$/.test(target.content||"")?"un sticker":(target.content||"").replace(/\s+/g," ").trim();
     const excerpt=raw.length>65?raw.slice(0,64).trimEnd()+"…":raw||"un message";
     waitUntil(notifyPartner(env,u.room_id,u.id,"Réaction à ton message ❤️",u.name+" a réagi "+body.emoji+" à «"+excerpt+"»","chat",{kind:"message",id:body.id}));
     return ok({reaction:body.emoji});
    }
    if(op==="delete-for-me"){
     if(!validMessageId(body.id))return fail("Message invalide.",400);
     await ensureMessageActions(db);
     const exists=await db.prepare("SELECT id FROM messages WHERE room_id=? AND id=? AND kind IN ('text','image','audio')")
      .bind(u.room_id,body.id).first<{id:string}>();
     if(!exists)return fail("Message introuvable.",404);
     await db.prepare("INSERT OR IGNORE INTO message_hidden(room_id,message_id,member_id,hidden_at) VALUES(?,?,?,?)")
      .bind(u.room_id,body.id,u.id,Date.now()).run();
     await markRoomChanged(db,u.room_id);
     return ok({deletedForMe:true});
    }
    if(op==="delete-message"){
     if(!validMessageId(body.id))return fail("Message invalide.",400);
     const mine=await db.prepare("SELECT object_key FROM messages WHERE id=? AND room_id=? AND sender_id=? AND kind IN ('text','image','audio')")
      .bind(body.id,u.room_id,u.id).first<{object_key:string|null}>();
     if(!mine)return fail("Tu peux supprimer uniquement tes propres messages.",403);
     await ensureMessageActions(db);
     await ensureMessageReplies(db);
     await db.batch([
      db.prepare("DELETE FROM message_reactions WHERE room_id=? AND message_id=?").bind(u.room_id,body.id),
      db.prepare("DELETE FROM message_hidden WHERE room_id=? AND message_id=?").bind(u.room_id,body.id),
      db.prepare("DELETE FROM message_one_time WHERE room_id=? AND message_id=?").bind(u.room_id,body.id),
      db.prepare("DELETE FROM message_edits WHERE room_id=? AND message_id=?").bind(u.room_id,body.id),
      db.prepare("DELETE FROM message_replies WHERE room_id=? AND message_id=?").bind(u.room_id,body.id),
      db.prepare("DELETE FROM messages WHERE id=? AND room_id=? AND sender_id=?").bind(body.id,u.room_id,u.id)
     ]);
     // The quoted preview is deliberately unavailable once the author deletes
     // the original. A deletion never grants access across rooms.
     if(mine.object_key&&bindings().STORAGE)try{await bindings().STORAGE!.delete(mine.object_key)}
     catch(err){console.error("Orphaned media cleanup",err)}
     await markRoomChanged(db,u.room_id);
     return ok({deletedMessage:true});
    }
    if(op==="delete"){
     if(u.owner_id!==u.id)return fail("Seul le créateur de l’espace peut le supprimer.",403);
     // Delete every room-scoped feature, one-time recovery, push subscriptions,
     // reconciliation texts, media and portraits; D1 cleanup is transactional.
     // Keep the owner's session when R2 fails, so deletion remains retryable.
     try{
      const result=await deleteCoupleRoom(db,bindings().STORAGE,u.room_id);
      if(!result.deleted)return fail("Cet espace n’existe plus.",404);
      return ok({deleted:true});
     }catch(err){
      console.error("Private room deletion incomplete",err);
      return fail("La suppression n’a pas pu être terminée. Réessaie.",503);
     }
    }
    return fail("Action inconnue.",404);
   }catch(err){console.error("Love Radar API",err);return fail("Impossible de traiter la demande.",500)}
  }

  };
  return handlers;
}

export const onRequestGet = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).GET({request:ctx.request});
export const onRequestPost = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).POST({request:ctx.request});
