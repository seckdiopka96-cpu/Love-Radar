import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { notifyPartner, type PushEnv } from "../lib/push";

// Automatic and idempotent migration for both existing and new D1 rooms.
let presenceReady: Promise<void> | null = null;
async function ensureChatPresence(db:D1Database){
 if(!presenceReady){
  presenceReady=(async()=>{
   await db.exec("CREATE TABLE IF NOT EXISTS chat_presence (room_id TEXT NOT NULL, member_id TEXT NOT NULL, last_read_at INTEGER NOT NULL DEFAULT 0, typing_until INTEGER NOT NULL DEFAULT 0, last_seen_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room_id,member_id))");
   const columns=await db.prepare("PRAGMA table_info(chat_presence)").all<{name:string}>();
   if(!columns.results.some(col=>col.name==="last_seen_at")){
    try{await db.exec("ALTER TABLE chat_presence ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0")}
    catch(err){
     // Another invocation may have migrated the table concurrently.
     const updated=await db.prepare("PRAGMA table_info(chat_presence)").all<{name:string}>();
     if(!updated.results.some(col=>col.name==="last_seen_at"))throw err;
    }
   }
  })().catch(err=>{presenceReady=null;throw err});
 }
 await presenceReady;
}


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
 const partners=await db.prepare("SELECT id,name,seat FROM members WHERE room_id=? ORDER BY seat").bind(u.room_id).all<{id:string,name:string,seat:number}>();
 const messages=await db.prepare("SELECT id,sender_id,kind,content,object_key,mime,created_at FROM messages WHERE room_id=? AND kind IN ('text','image','audio') ORDER BY created_at DESC,id DESC LIMIT 90").bind(u.room_id).all();
 const otherStatus=await db.prepare("SELECT last_read_at,typing_until,last_seen_at FROM chat_presence WHERE room_id=? AND member_id<>? LIMIT 1").bind(u.room_id,u.id).first<{last_read_at:number,typing_until:number,last_seen_at:number}>();


 return {user:{id:u.id,name:u.name,seat:u.seat,owner:u.owner_id===u.id},code:u.invite,roomId:u.room_id,
  partner:partners.results.find(a=>a.id!==u.id)?.name||null,members:partners.results.length,
  messages:messages.results.reverse(),partnerReadAt:otherStatus?.last_read_at??0,partnerTypingUntil:otherStatus?.typing_until??0,partnerLastSeenAt:otherStatus?.last_seen_at??0};
}

  const handlers: Record<"GET"|"POST",(args:{request:Request})=>Promise<Response>> = {
  GET:async({request})=>{
   try{const session=await auth(request);if(!session)return fail("Session expirée ou invalide.",401);await ensureChatPresence(session.db);return ok(await snapshot(session.db,session.user))}
   catch(err){console.error("Love Radar snapshot",err);return fail("Erreur temporaire du service.",500)}
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
     const name=String(body.name||"").trim().slice(0,30);
     if(name.length<2||/[<>\u0000-\u001f]/.test(name))return fail("Choisis un prénom entre 2 et 30 caractères.");
     const secret=token(),id=crypto.randomUUID(),now=Date.now(),digest=await hash(secret);
     if(op==="create"){
      const room=crypto.randomUUID();const code=inviteCode();
      try{
       await db.batch([
        db.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?)").bind(room,code,id,now),
        db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) VALUES(?,?,?,?,?,?)").bind(id,room,name,0,digest,now)
       ]);
      }catch{return fail("Impossible de créer l’espace. Réessaie.",503)}
      return ok({token:secret,code});
     }
     const code=String(body.code||"").trim().toUpperCase().replace(/[\s-]+/g,"");
     if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code))return fail("Code d’invitation invalide.");
     const room=await db.prepare("SELECT id FROM rooms WHERE invite=?").bind(code).first<{id:string}>();
     if(!room)return fail("Code inconnu. Vérifie avec ton partenaire.",404);
     try{
      const inserted=await db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) SELECT ?,?, ?,1,?,? WHERE (SELECT COUNT(*) FROM members WHERE room_id=?)=1").bind(id,room.id,name,digest,now,room.id).run();
      if(!inserted.meta.changes)return fail("Cet espace est déjà complet.",409);
     }catch{return fail("Cet espace est déjà complet.",409)}
     waitUntil(notifyPartner(env,room.id,id,"Love Radar ❤️","Ton partenaire vient de rejoindre votre espace !","home"));
     return ok({token:secret,code});
    }
    const session=await auth(request);if(!session)return fail("Session expirée. Rejoins ton espace.",401);
    const {user:u}=session;
    if(op==="presence"){
     await ensureChatPresence(db);
     await db.prepare("INSERT INTO chat_presence(room_id,member_id,last_seen_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET last_seen_at=excluded.last_seen_at").bind(u.room_id,u.id,Date.now()).run();
     return ok({online:true});
    }
    if(op==="typing"){
     await ensureChatPresence(db);
     const until=body.active===true?Date.now()+6500:0;
     await db.prepare("INSERT INTO chat_presence(room_id,member_id,typing_until) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET typing_until=excluded.typing_until").bind(u.room_id,u.id,until).run();
     return ok({typing:true});
    }
    if(op==="read"){
     await ensureChatPresence(db);
     const last=await db.prepare("SELECT MAX(created_at) AS stamp FROM messages WHERE room_id=? AND sender_id<>? AND kind IN ('text','image','audio')").bind(u.room_id,u.id).first<{stamp:number|null}>();
     if(last?.stamp){
      await db.prepare("INSERT INTO chat_presence(room_id,member_id,last_read_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET last_read_at=MAX(last_read_at,excluded.last_read_at)").bind(u.room_id,u.id,last.stamp).run();
     }
     return ok({read:true});
    }
    if(op==="message"){
     const message=String(body.text||"").trim();
     if(!message||message.length>1600)return fail("Écris un message de 1 à 1 600 caractères.");
     await db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,'text',?,?)").bind(crypto.randomUUID(),u.room_id,u.id,message,Date.now()).run();
     await ensureChatPresence(db);
     await db.prepare("UPDATE chat_presence SET typing_until=0 WHERE room_id=? AND member_id=?").bind(u.room_id,u.id).run();
     waitUntil(notifyPartner(env,u.room_id,u.id,"Love Radar 💌",u.name+" t’a envoyé un message.","chat"));
     return ok({sent:true});
    }
    if(op==="delete"){
     if(u.owner_id!==u.id)return fail("Seul le créateur de l’espace peut le supprimer.",403);
     const objects=await db.prepare("SELECT object_key FROM messages WHERE room_id=? AND object_key IS NOT NULL").bind(u.room_id).all<{object_key:string}>();
     const bucket=bindings().STORAGE;
     if(bucket)for(const row of objects.results)try{await bucket.delete(row.object_key)}catch(e){console.error("delete media",e);return fail("Suppression des médias impossible. Réessaie.",503)}
     try{await db.prepare("DELETE FROM push_subscriptions WHERE room_id=?").bind(u.room_id).run()}catch(e){console.error("push cleanup",e)}
     await ensureChatPresence(db);
     await db.prepare("DELETE FROM chat_presence WHERE room_id=?").bind(u.room_id).run();
     // If voice calling was used, remove its signaling records with the room.
     try{
      await db.prepare("DELETE FROM voice_signals WHERE room_id=?").bind(u.room_id).run();
      await db.prepare("DELETE FROM voice_calls WHERE room_id=?").bind(u.room_id).run();
     }catch(err){console.error("Optional voice call cleanup",err)}
     for(const table of ["memory_challenges","memory_gifts","memory_agreements","memory_games"]){
      try{await db.prepare("DELETE FROM "+table+" WHERE room_id=?").bind(u.room_id).run()}
      catch(err){console.error("Optional Memory Love cleanup",table,err)}
     }
     try{await db.prepare("DELETE FROM ludo_challenges WHERE room_id=?").bind(u.room_id).run()}
     catch(err){console.error("Optional Ludo challenge cleanup",err)}
     try{await db.prepare("DELETE FROM ludo_agreements WHERE room_id=?").bind(u.room_id).run()}
     catch(err){console.error("Optional Ludo rules agreement cleanup",err)}
     try{await db.prepare("DELETE FROM ludo_gifts WHERE room_id=?").bind(u.room_id).run()}
     catch(err){console.error("Optional Ludo gifts cleanup",err)}
     try{await db.prepare("DELETE FROM ludo_reactions WHERE room_id=?").bind(u.room_id).run()}
     catch(err){console.error("Optional Ludo reactions cleanup",err)}
     // Existing couples may have a live Ludo match; erase it with the room.
     try{await db.prepare("DELETE FROM ludo_games WHERE room_id=?").bind(u.room_id).run()}
     catch(err){console.error("Optional Ludo cleanup",err)}
     await db.batch([
      db.prepare("DELETE FROM messages WHERE room_id=?").bind(u.room_id),
      db.prepare("DELETE FROM members WHERE room_id=?").bind(u.room_id),
      db.prepare("DELETE FROM rooms WHERE id=?").bind(u.room_id)
     ]);
     return ok({deleted:true});
    }
    return fail("Action inconnue.",404);
   }catch(err){console.error("Love Radar API",err);return fail("Impossible de traiter la demande.",500)}
  }

  };
  return handlers;
}

export const onRequestGet = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).GET({request:ctx.request});
export const onRequestPost = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).POST({request:ctx.request});
