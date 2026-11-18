import type {D1Database,R2Bucket} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/** Private surprise box: a note, optional image and optional audio, revealed by the recipient. */
type Env=PushEnv&{STORAGE?:R2Bucket};
type Ctx={request:Request;env:Env;waitUntil:(promise:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type Gift={id:string;sender_id:string;title:string;body:string;image_key:string|null;image_mime:string|null;audio_key:string|null;audio_mime:string|null;opened_at:number|null;created_at:number};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:object)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!ready)ready=db.exec("CREATE TABLE IF NOT EXISTS couple_surprises(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,image_key TEXT,image_mime TEXT,audio_key TEXT,audio_mime TEXT,opened_at INTEGER,created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_surprises_room ON couple_surprises(room_id,created_at DESC)").then(()=>{}).catch(e=>{ready=null;throw e});
 return ready;
}
async function authenticate(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
function clean(v:unknown,max:number):string|null{
 if(typeof v!=="string")return null;
 const t=v.trim();
 return t.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(t)?t:null;
}
async function state(db:D1Database,u:Member){
 const rows=await db.prepare("SELECT id,sender_id,title,body,image_key,image_mime,audio_key,audio_mime,opened_at,created_at FROM couple_surprises WHERE room_id=? ORDER BY created_at DESC LIMIT 50").bind(u.room_id).all<Gift>();
 return {serverNow:Date.now(),gifts:(rows.results||[]).map(g=>({
  id:g.id,senderId:g.sender_id,title:g.title,body:g.sender_id===u.id||g.opened_at?g.body:null,
  hasImage:Boolean(g.image_key),hasAudio:Boolean(g.audio_key),openedAt:g.opened_at,createdAt:g.created_at
 }))};
}
function sniff(bytes:Uint8Array,mime:string):boolean{
 const ascii=(start:number,count:number)=>new TextDecoder().decode(bytes.subarray(start,start+count));
 if(mime==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/png")return bytes[0]===137&&ascii(1,3)==="PNG";
 if(mime==="image/webp")return ascii(0,4)==="RIFF"&&ascii(8,4)==="WEBP";
 if(["audio/mp4","audio/x-m4a","audio/aac"].includes(mime))return ascii(4,4)==="ftyp"||mime==="audio/aac"&&bytes[0]===255;
 if(mime==="audio/mpeg")return ascii(0,3)==="ID3"||bytes[0]===255;
 if(mime==="audio/ogg")return ascii(0,4)==="OggS";
 if(mime==="audio/webm")return bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
 if(mime==="audio/wav"||mime==="audio/x-wav")return ascii(0,4)==="RIFF"&&ascii(8,4)==="WAVE";
 return false;
}
const IMAGES=new Set(["image/jpeg","image/png","image/webp"]);
const AUDIO=new Set(["audio/mp4","audio/x-m4a","audio/aac","audio/mpeg","audio/ogg","audio/webm","audio/wav","audio/x-wav"]);
async function handler(ctx:Ctx,method:"GET"|"POST"|"DELETE"):Promise<Response>{
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Les coffres surprises sont indisponibles.",503);
  const u=await authenticate(ctx.request,db);
  if(!u)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  const url=new URL(ctx.request.url),id=url.searchParams.get("id");
  if(method==="GET"){
   const media=url.searchParams.get("media");
   if(!media)return ok(await state(db,u));
   if(!uuid(id)||!["image","audio"].includes(media))return fail("Cadeau introuvable.",404);
   const gift=await db.prepare("SELECT id,sender_id,title,body,image_key,image_mime,audio_key,audio_mime,opened_at,created_at FROM couple_surprises WHERE room_id=? AND id=?").bind(u.room_id,id).first<Gift>();
   if(!gift)return fail("Cadeau introuvable.",404);
   if(gift.sender_id!==u.id&&!gift.opened_at)return fail("Ce coffre n'a pas encore été ouvert.",403);
   const key=media==="image"?gift.image_key:gift.audio_key,mime=media==="image"?gift.image_mime:gift.audio_mime;
   if(!key||!mime)return fail("Ce fichier n'existe pas.",404);
   const file=await ctx.env.STORAGE?.get(key);
   if(!file)return fail("Fichier indisponible.",404);
   return new Response(await file.arrayBuffer(),{headers:{
    "Content-Type":mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    "Content-Disposition":"inline","Content-Security-Policy":"default-src 'none'; sandbox"
   }});
  }
  if(method==="DELETE"){
   if(!uuid(id))return fail("Coffre introuvable.",404);
   const gift=await db.prepare("SELECT id,sender_id,title,body,image_key,image_mime,audio_key,audio_mime,opened_at,created_at FROM couple_surprises WHERE room_id=? AND id=?").bind(u.room_id,id).first<Gift>();
   if(!gift||gift.sender_id!==u.id)return fail("Seul l'expéditeur peut supprimer ce coffre.",403);
   const keys=[gift.image_key,gift.audio_key].filter((x):x is string=>Boolean(x));
   if(keys.length&&!ctx.env.STORAGE)return fail("Le stockage est indisponible.",503);
   if(keys.length)await ctx.env.STORAGE!.delete(keys);
   await db.prepare("DELETE FROM couple_surprises WHERE id=? AND room_id=? AND sender_id=?").bind(id,u.room_id,u.id).run();
   return ok(await state(db,u));
  }
  const contentType=ctx.request.headers.get("Content-Type")||"";
  if(contentType.includes("application/json")){
   const raw=await ctx.request.text();
   if(raw.length>250)return fail("Demande trop longue.",413);
   let data:Record<string,unknown>;
   try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Demande invalide.")}
   if(data.action!=="open"||!uuid(data.id))return fail("Coffre introuvable.",404);
   const found=await db.prepare("SELECT sender_id,opened_at FROM couple_surprises WHERE id=? AND room_id=?").bind(data.id,u.room_id).first<{sender_id:string;opened_at:number|null}>();
   if(!found)return fail("Coffre introuvable.",404);
   if(found.sender_id===u.id)return fail("C'est ton cadeau : ton partenaire doit l'ouvrir.",403);
   const now=Date.now();
   const r=await db.prepare("UPDATE couple_surprises SET opened_at=? WHERE room_id=? AND id=? AND sender_id<>? AND opened_at IS NULL")
    .bind(now,u.room_id,data.id,u.id).run();
   if(r.meta.changes===1)
    ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"🎁 Ton cadeau est ouvert",u.name+" a découvert ta surprise !","life",{kind:"couple-gift",id:data.id}));
   return ok(await state(db,u));
  }
  if(Number(ctx.request.headers.get("content-length")||0)>13_000_000)return fail("Ton coffre est trop volumineux.",413);
  const form=await ctx.request.formData();
  const title=clean(form.get("title"),75),body=clean(form.get("body"),2500);
  if(!title||!body||body.length<3)return fail("Ajoute un titre et un petit mot (3 à 2 500 caractères).");
  const image=form.get("image"),audio=form.get("audio");
  const photo=image instanceof File&&image.size>0?image:null;
  const voice=audio instanceof File&&audio.size>0?audio:null;
  if(photo&&(!IMAGES.has(photo.type)||photo.size>4_500_000||photo.size<100))return fail("Photo invalide ou supérieure à 4,5 Mo.");
  if(voice&&(!AUDIO.has(voice.type)||voice.size>7_000_000||voice.size<100))return fail("Vocal invalide ou supérieur à 7 Mo.");
  if(photo&&voice&&photo.size+voice.size>11_500_000)return fail("Les deux fichiers dépassent 11,5 Mo.",413);
  const bucket=ctx.env.STORAGE;
  if((photo||voice)&&!bucket)return fail("Le stockage privé n'est pas configuré.",503);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>();
  if(Number(count?.n)!==2)return fail("Invite ton partenaire avant d'envoyer un coffre.",409);
  const idNew=crypto.randomUUID(),written:string[]=[];
  let imgKey:string|null=null,audKey:string|null=null;
  try{
   if(photo){
    const bytes=new Uint8Array(await photo.arrayBuffer());
    if(!sniff(bytes,photo.type))return fail("La photo ne correspond pas à son format.");
    imgKey="couple-gifts/"+u.room_id+"/"+idNew+"/image";
    await bucket!.put(imgKey,bytes,{httpMetadata:{contentType:photo.type}});written.push(imgKey);
   }
   if(voice){
    const bytes=new Uint8Array(await voice.arrayBuffer());
    if(!sniff(bytes,voice.type))return fail("Le vocal ne correspond pas à son format.");
    audKey="couple-gifts/"+u.room_id+"/"+idNew+"/audio";
    await bucket!.put(audKey,bytes,{httpMetadata:{contentType:voice.type}});written.push(audKey);
   }
   const insert=await db.prepare("INSERT INTO couple_surprises(id,room_id,sender_id,title,body,image_key,image_mime,audio_key,audio_mime,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM couple_surprises WHERE room_id=?)<50")
    .bind(idNew,u.room_id,u.id,title,body,imgKey,photo?.type||null,audKey,voice?.type||null,Date.now(),u.room_id).run();
   if(insert.meta.changes!==1){if(written.length)await bucket!.delete(written);return fail("Vous avez atteint 50 surprises. Supprime une ancienne surprise.",409)}
  }catch(e){if(written.length&&bucket)await bucket.delete(written).catch(()=>{});throw e}
  ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"🎁 Une surprise t'attend",u.name+" t'a préparé un coffre. Ouvre-le pour découvrir son contenu !","life",{kind:"couple-gift",id:idNew}));
  return ok(await state(db,u));
 }catch(e){console.error("Love Radar surprise boxes",e);return fail("Le coffre n'a pas pu être enregistré.",503)}
}
export const onRequestGet=(ctx:Ctx)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handler(ctx,"POST");
export const onRequestDelete=(ctx:Ctx)=>handler(ctx,"DELETE");
