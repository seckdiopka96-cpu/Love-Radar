import type {D1Database,R2Bucket} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Two-person keepsakes: room-scoped R2 media and dated letters. */
type Env=PushEnv&{STORAGE?:R2Bucket};
type Context={request:Request;env:Env;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type AlbumRow={id:string;author_id:string;caption:string;mime:string;created_at:number};
type LetterRow={id:string;author_id:string;title:string;body:string;unlock_at:number;created_at:number};
const error=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"no-store"}});
const ok=(payload:object)=>Response.json({ok:true,...payload},{headers:{"Cache-Control":"no-store"}});
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const clean=(value:unknown,max:number)=>typeof value==="string"&&value.trim().length<=max&&!/[\u0000-\u001f<>]/.test(value)?value.trim():null;
let initializing:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!initializing)initializing=db.exec(
  "CREATE TABLE IF NOT EXISTS keepsake_album(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,author_id TEXT NOT NULL,object_key TEXT NOT NULL,mime TEXT NOT NULL,caption TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_keepsake_album_room ON keepsake_album(room_id,created_at DESC);"+
  "CREATE TABLE IF NOT EXISTS keepsake_letters(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,author_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,unlock_at INTEGER NOT NULL,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_keepsake_letters_room ON keepsake_letters(room_id,created_at DESC);"
 ).then(()=>{}).catch(e=>{initializing=null;throw e});
 return initializing;
}
async function authenticate(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function list(db:D1Database,user:Member,type:string){
 if(type==="album"){
  const rows=await db.prepare("SELECT id,author_id,caption,mime,created_at FROM keepsake_album WHERE room_id=? ORDER BY created_at DESC LIMIT 120").bind(user.room_id).all<AlbumRow>();
  return ok({items:(rows.results||[]).map(r=>({id:r.id,authorId:r.author_id,caption:r.caption,mime:r.mime,createdAt:r.created_at})),serverNow:Date.now()});
 }
 const now=Date.now();
 const rows=await db.prepare("SELECT id,author_id,title,body,unlock_at,created_at FROM keepsake_letters WHERE room_id=? ORDER BY created_at DESC LIMIT 60").bind(user.room_id).all<LetterRow>();
 // The letter body never crosses the network until the server clock reaches unlockAt.
 return ok({items:(rows.results||[]).map(r=>({id:r.id,authorId:r.author_id,title:r.title,unlockAt:r.unlock_at,createdAt:r.created_at,opened:now>=r.unlock_at,body:now>=r.unlock_at?r.body:null})),serverNow:now});
}
function sniff(bytes:Uint8Array,mime:string){
 const ascii=(start:number,length:number)=>new TextDecoder().decode(bytes.subarray(start,start+length));
 if(mime==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/png")return bytes[0]===137&&ascii(1,3)==="PNG";
 if(mime==="image/webp")return ascii(0,4)==="RIFF"&&ascii(8,4)==="WEBP";
 if(mime==="video/mp4")return ascii(4,4)==="ftyp";
 if(mime==="video/webm")return bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
 return false;
}
async function handler(ctx:Context,method:"GET"|"POST"|"DELETE"):Promise<Response>{
 try{
  const db=ctx.env.DB;
  if(!db)return error("L'espace souvenirs est momentanément indisponible.",503);
  const user=await authenticate(ctx.request,db);
  if(!user)return error("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  const url=new URL(ctx.request.url),type=url.searchParams.get("type");
  if(type!=="album"&&type!=="letters")return error("Activité inconnue.",404);
  if(method==="GET"){
   if(type==="album"&&url.searchParams.get("media")==="1"){
    const id=url.searchParams.get("id");
    if(!uuid(id))return error("Souvenir introuvable.",404);
    const row=await db.prepare("SELECT object_key,mime FROM keepsake_album WHERE room_id=? AND id=?").bind(user.room_id,id).first<{object_key:string;mime:string}>();
    if(!row)return error("Souvenir introuvable.",404);
    const obj=await ctx.env.STORAGE?.get(row.object_key);
    if(!obj)return error("Ce souvenir n'est plus disponible.",404);
    return new Response(await obj.arrayBuffer(),{headers:{"Content-Type":row.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Accept-Ranges":"none"}});
   }
   return list(db,user,type);
  }
  if(method==="DELETE"){
   const id=url.searchParams.get("id");
   if(!uuid(id))return error("Élément introuvable.",404);
   if(type==="letters"){
    const result=await db.prepare("DELETE FROM keepsake_letters WHERE id=? AND room_id=? AND author_id=?").bind(id,user.room_id,user.id).run();
    if(result.meta.changes!==1)return error("Seul l'auteur peut supprimer cette lettre.",403);
   }else{
    const row=await db.prepare("SELECT object_key FROM keepsake_album WHERE id=? AND room_id=?").bind(id,user.room_id).first<{object_key:string}>();
    if(!row)return error("Photo déjà supprimée.",404);
    // Remove private object first so an unavailable bucket never leaves untracked photos.
    if(!ctx.env.STORAGE)return error("Le stockage n'est pas configuré.",503);
    await ctx.env.STORAGE.delete(row.object_key);
    await db.prepare("DELETE FROM keepsake_album WHERE id=? AND room_id=?").bind(id,user.room_id).run();
   }
   return list(db,user,type);
  }
  const now=Date.now();
  if(type==="letters"){
   const raw=await ctx.request.text();
   if(raw.length>5000)return error("Lettre trop longue.",413);
   let data:Record<string,unknown>;
   try{data=JSON.parse(raw) as Record<string,unknown>}catch{return error("Lettre invalide.")}
   const title=clean(data.title,70),body=typeof data.body==="string"?data.body.trim():null;
   const unlockAt=data.unlockAt;
   if(!title||!body||body.length<3||body.length>3500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body))return error("Ajoute un titre et un texte de 3 à 3 500 caractères.");
   if(typeof unlockAt!=="number"||!Number.isSafeInteger(unlockAt)||unlockAt<now+60000||unlockAt>now+366*86400000)return error("Choisis une ouverture dans plus d'une minute et moins d'un an.");
   const id=crypto.randomUUID();
   const result=await db.prepare("INSERT INTO keepsake_letters(id,room_id,author_id,title,body,unlock_at,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM keepsake_letters WHERE room_id=?)<60")
    .bind(id,user.room_id,user.id,title,body,unlockAt,now,user.room_id).run();
   if(result.meta.changes!==1)return error("La boîte contient déjà 60 lettres. Supprime une ancienne lettre.",409);
   ctx.waitUntil(notifyPartner(ctx.env,user.room_id,user.id,"💌 Une lettre surprise",user.name+" a préparé une lettre à découvrir plus tard.","memories",{kind:"love-letter",id}));
   return list(db,user,type);
  }
  const bucket=ctx.env.STORAGE;
  if(!bucket)return error("Le stockage privé n'est pas configuré.",503);
  if(Number(ctx.request.headers.get("content-length")||0)>16_000_000)return error("Fichier trop volumineux.",413);
  const form=await ctx.request.formData();
  const file=form.get("file"),caption=clean(form.get("caption"),180);
  if(!(file instanceof File)||caption===null)return error("Choisis un fichier et une légende courte.");
  const mime=file.type.split(";")[0].toLowerCase(),video=mime.startsWith("video/");
  if(!["image/jpeg","image/png","image/webp","video/mp4","video/webm"].includes(mime))return error("Formats autorisés : JPEG, PNG, WebP, MP4 et WebM.");
  if(file.size<100||file.size>(video?15_000_000:5_000_000))return error(video?"Vidéo limitée à 15 Mo.":"Photo limitée à 5 Mo.",413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!sniff(bytes,mime))return error("Le fichier ne correspond pas à son format.");
  const id=crypto.randomUUID(),key="keepsake-album/"+user.room_id+"/"+id;
  await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
  try{
   const inserted=await db.prepare("INSERT INTO keepsake_album(id,room_id,author_id,object_key,mime,caption,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM keepsake_album WHERE room_id=?)<120")
    .bind(id,user.room_id,user.id,key,mime,caption,now,user.room_id).run();
   if(inserted.meta.changes!==1){await bucket.delete(key);return error("L'album a atteint sa limite de 120 souvenirs.",409)}
  }catch(e){await bucket.delete(key);throw e}
  ctx.waitUntil(notifyPartner(ctx.env,user.room_id,user.id,"📸 Nouveau souvenir",user.name+" a ajouté un souvenir à votre album.","memories",{kind:"album-memory",id}));
  return list(db,user,type);
 }catch(e){console.error("Love Radar keepsakes",e);return error("Impossible d'enregistrer ce souvenir pour le moment.",503)}
}
export const onRequestGet=(ctx:Context)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Context)=>handler(ctx,"POST");
export const onRequestDelete=(ctx:Context)=>handler(ctx,"DELETE");
