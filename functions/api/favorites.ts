import type {D1Database} from "@cloudflare/workers-types";

/** Per-member bookmarks. Never store message plaintext: ciphertext stays in messages. */
type Ctx={request:Request;env:{DB?:D1Database}};
type Member={id:string;room_id:string};
type Favorite={id:string;sender_id:string;kind:"text"|"audio"|"image";content:string|null;object_key:string|null;mime:string|null;created_at:number;saved_at:number};
const MAX_FAVORITES=150;
const validId=(value:unknown):value is string=>typeof value==="string"&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:object)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS message_favorites(room_id TEXT NOT NULL,member_id TEXT NOT NULL,message_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id,message_id));"+
  "CREATE INDEX IF NOT EXISTS idx_message_favorites_member ON message_favorites(room_id,member_id,created_at DESC);"+
  "CREATE TABLE IF NOT EXISTS message_hidden(room_id TEXT NOT NULL,message_id TEXT NOT NULL,member_id TEXT NOT NULL,hidden_at INTEGER NOT NULL,PRIMARY KEY(room_id,message_id,member_id));"+
  "CREATE TABLE IF NOT EXISTS message_one_time(room_id TEXT NOT NULL,message_id TEXT PRIMARY KEY,opened_by TEXT,opened_at INTEGER NOT NULL DEFAULT 0)"
 ).then(()=>{}).catch(error=>{ready=null;throw error});
 await ready;
}
async function authenticate(req:Request,db:D1Database):Promise<Member|null>{
 const bearer=req.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(bearer))return null;
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function state(db:D1Database,u:Member){
 // Prune orphaned, hidden and ephemeral pins before counting or presenting them.
 await db.prepare(
  "DELETE FROM message_favorites WHERE room_id=? AND member_id=? AND NOT EXISTS ("+
  "SELECT 1 FROM messages m WHERE m.id=message_favorites.message_id AND m.room_id=message_favorites.room_id"+
  " AND m.kind IN ('text','audio','image')"+
  " AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.room_id=m.room_id AND h.member_id=message_favorites.member_id AND h.message_id=m.id)"+
  " AND NOT EXISTS (SELECT 1 FROM message_one_time o WHERE o.room_id=m.room_id AND o.message_id=m.id))"
 ).bind(u.room_id,u.id).run();
 const rows=await db.prepare(
  "SELECT m.id,m.sender_id,m.kind,m.content,m.object_key,m.mime,m.created_at,f.created_at AS saved_at"+
  " FROM message_favorites f JOIN messages m ON m.id=f.message_id AND m.room_id=f.room_id"+
  " WHERE f.room_id=? AND f.member_id=?"+
  " ORDER BY f.created_at DESC,m.id DESC LIMIT ?"
 ).bind(u.room_id,u.id,MAX_FAVORITES).all<Favorite>();
 return {favorites:(rows.results||[]).map(item=>({...item,savedAt:item.saved_at})),serverNow:Date.now()};
}
async function handler(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Les favoris sont momentanément indisponibles.",503);
  const user=await authenticate(ctx.request,db);
  if(!user)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  if(method==="GET")return ok(await state(db,user));
  const raw=await ctx.request.text();
  if(raw.length>400)return fail("Demande trop longue.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Demande invalide.")}
  if((data.action!=="add"&&data.action!=="remove")||!validId(data.id))return fail("Message ou action invalide.",400);
  if(data.action==="remove"){
   await db.prepare("DELETE FROM message_favorites WHERE room_id=? AND member_id=? AND message_id=?")
    .bind(user.room_id,user.id,data.id).run();
   return ok(await state(db,user));
  }
  const eligible=await db.prepare(
   "SELECT m.id FROM messages m WHERE m.room_id=? AND m.id=? AND m.kind IN ('text','image','audio')"+
   " AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.room_id=m.room_id AND h.message_id=m.id AND h.member_id=?)"+
   " AND NOT EXISTS (SELECT 1 FROM message_one_time o WHERE o.room_id=m.room_id AND o.message_id=m.id)"
  ).bind(user.room_id,data.id,user.id).first<{id:string}>();
  if(!eligible)return fail("Message introuvable ou temporaire.",404);
  const existed=await db.prepare("SELECT message_id FROM message_favorites WHERE room_id=? AND member_id=? AND message_id=?")
   .bind(user.room_id,user.id,data.id).first();
  if(!existed){
   const r=await db.prepare(
    "INSERT INTO message_favorites(room_id,member_id,message_id,created_at) SELECT ?,?,?,?"+
    " WHERE (SELECT COUNT(*) FROM message_favorites WHERE room_id=? AND member_id=?)<?"
   ).bind(user.room_id,user.id,data.id,Date.now(),user.room_id,user.id,MAX_FAVORITES).run();
   if(r.meta.changes!==1)return fail("Tu peux enregistrer jusqu'à 150 messages favoris.",409);
  }
  return ok(await state(db,user));
 }catch(error){console.error("Love Radar favorite messages",error);return fail("Impossible d'ouvrir tes favoris pour le moment.",503)}
}
export const onRequestGet=(ctx:Ctx)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handler(ctx,"POST");
