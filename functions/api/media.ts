import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { notifyPartner, type PushEnv } from "../lib/push";

type Env = PushEnv & {STORAGE?: R2Bucket};
type Context = { request: Request; env: Env; waitUntil:(task:Promise<unknown>)=>void };

function createHandlers(env: Env, waitUntil:(task:Promise<unknown>)=>void) {
  const bindings = () => env;

type User={id:string,room_id:string};
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
async function getUser(request:Request,db:D1Database):Promise<User|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(header))return null;
 const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(buf)).map(n=>n.toString(16).padStart(2,"0")).join("");
 return await db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<User>();
}
/* Legacy rooms migrate lazily; all requests check the same private flags. */
let privateMediaReady:Promise<void>|null=null;
async function ensurePrivateMedia(db:D1Database){
 if(!privateMediaReady)privateMediaReady=(async()=>{
  await db.exec("CREATE TABLE IF NOT EXISTS message_hidden (room_id TEXT NOT NULL, message_id TEXT NOT NULL, member_id TEXT NOT NULL, hidden_at INTEGER NOT NULL, PRIMARY KEY(room_id,message_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS message_one_time (room_id TEXT NOT NULL, message_id TEXT PRIMARY KEY, opened_by TEXT, opened_at INTEGER NOT NULL DEFAULT 0)");
 })().catch(error=>{privateMediaReady=null;throw error});
 await privateMediaReady;
}
function sniff(bytes:Uint8Array,mime:string){
 if(mime==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/png")return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 if(mime==="image/webp")return new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
 if(mime==="image/gif")return new TextDecoder().decode(bytes.slice(0,3))==="GIF";
 if(mime==="audio/webm"||mime==="video/webm")return bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
 if(mime==="audio/ogg")return new TextDecoder().decode(bytes.slice(0,4))==="OggS";
 if(mime==="audio/mpeg")return bytes[0]===255||(new TextDecoder().decode(bytes.slice(0,3))==="ID3");
 if(mime==="audio/mp4"||mime==="audio/x-m4a"||mime==="audio/aac")return new TextDecoder().decode(bytes.slice(4,8))==="ftyp"||bytes[0]===255;
 return false;
}

  const handlers: Record<"GET"|"POST",(args:{request:Request})=>Promise<Response>> = {
  GET:async({request})=>{
   try{
    const db=bindings().DB,bucket=bindings().STORAGE;if(!db||!bucket)return no("Service indisponible.",503);
    const u=await getUser(request,db);if(!u)return no("Accès refusé.",401);
    const key=new URL(request.url).searchParams.get("id")||"";
    if(!/^[a-f0-9-]{36}$/.test(key))return no("Média inconnu.",404);
    await ensurePrivateMedia(db);
    const record=await db.prepare(
     "SELECT m.object_key,m.mime,m.sender_id,COALESCE(ot.opened_at,0) AS opened_at,"+
     " CASE WHEN ot.message_id IS NULL THEN 0 ELSE 1 END AS view_once"+
     " FROM messages m LEFT JOIN message_one_time ot ON ot.room_id=m.room_id AND ot.message_id=m.id"+
     " WHERE m.room_id=? AND m.object_key=? AND NOT EXISTS"+
     " (SELECT 1 FROM message_hidden h WHERE h.room_id=m.room_id AND h.message_id=m.id AND h.member_id=?)"
    ).bind(u.room_id,key,u.id).first<{object_key:string;mime:string;sender_id:string;view_once:number;opened_at:number}>();
    if(!record)return no("Média introuvable.",404);
    if(record.view_once&&(record.sender_id===u.id||record.opened_at>0))
     return no(record.sender_id===u.id?"Vue unique : seul le destinataire peut ouvrir ce média.":"Ce média à vue unique a déjà été ouvert.",410);
    const asset=await bucket.get(record.object_key);if(!asset)return no("Média supprimé.",404);
    if(record.view_once){
     // An atomic compare-and-set prevents reopening on another device or in parallel.
     const claimed=await db.prepare("UPDATE message_one_time SET opened_at=?,opened_by=? WHERE room_id=? AND message_id=? AND opened_at=0")
      .bind(Date.now(),u.id,u.room_id,key).run();
     if(!claimed.meta.changes)return no("Ce média à vue unique a déjà été ouvert.",410);
    }
    return new Response(asset.body as unknown as BodyInit,{headers:{"Content-Type":record.mime,"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Referrer-Policy":"no-referrer","Content-Disposition":"inline"}});
   }catch(e){console.error("media get",e);return no("Erreur de lecture.",500)}
  },
  POST:async({request})=>{
   try{
    const db=bindings().DB,bucket=bindings().STORAGE;if(!db||!bucket)return no("Service indisponible.",503);
    const u=await getUser(request,db);if(!u)return no("Accès refusé.",401);
    const len=Number(request.headers.get("content-length")||0);if(len>8_000_000)return no("Fichier trop lourd.",413);
    const form=await request.formData(),file=form.get("file"),kind=form.get("kind");
    const viewOnce=form.get("viewOnce")==="true";
    await ensurePrivateMedia(db);
    if(!(file instanceof File)||!["image","audio"].includes(String(kind)))return no("Fichier invalide.");
    const mime=file.type.split(";")[0].toLowerCase();
    const imageTypes=["image/jpeg","image/png","image/webp","image/gif"];
    const audioTypes=["audio/webm","video/webm","audio/ogg","audio/mpeg","audio/mp4","audio/x-m4a","audio/aac"];
    if(kind==="image"&&!imageTypes.includes(mime)||kind==="audio"&&!audioTypes.includes(mime))return no("Format non accepté.");
    const size=kind==="image"?6_000_000:5_000_000;
    if(file.size===0||file.size>size)return no("Fichier trop volumineux.",413);
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!sniff(bytes,mime))return no("Fichier non reconnu.");
    // The client may preassign a v4 UUID to show the voice message before
    // the upload finishes. Retrying the same UUID must not create duplicates.
    const requestedId=form.get("messageId");
    if(requestedId!==null&&(typeof requestedId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestedId)))return no("Identifiant de message invalide.",400);
    const id=typeof requestedId==="string"?requestedId:crypto.randomUUID();
    const existing=await db.prepare("SELECT id,room_id,sender_id,kind,mime,created_at FROM messages WHERE id=?").bind(id).first<{id:string;room_id:string;sender_id:string;kind:string;mime:string;created_at:number}>();
    if(existing){
     if(existing.room_id!==u.room_id||existing.sender_id!==u.id||existing.kind!==kind||existing.mime!==mime)
      return no("Identifiant déjà utilisé.",409);
     return Response.json({ok:true,id,created_at:existing.created_at,duplicate:true},{headers:{"Cache-Control":"no-store"}});
    }
    const now=Date.now();
    await bucket.put(id,bytes,{httpMetadata:{contentType:mime}});
    try{
     const insert=db.prepare((viewOnce?"INSERT":"INSERT OR IGNORE")+" INTO messages(id,room_id,sender_id,kind,object_key,mime,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id,u.room_id,u.id,kind,id,mime,now);
     const inserted=viewOnce?
      (await db.batch([
       insert,
       db.prepare("INSERT INTO message_one_time(room_id,message_id,opened_at) VALUES(?,?,0)").bind(u.room_id,id)
      ]))[0]:
      await insert.run();
     if(!inserted.meta.changes){
      const same=await db.prepare("SELECT room_id,sender_id,kind,mime,created_at FROM messages WHERE id=?")
       .bind(id).first<{room_id:string;sender_id:string;kind:string;mime:string;created_at:number}>();
      if(same&&same.room_id===u.room_id&&same.sender_id===u.id&&same.kind===kind&&same.mime===mime)
       return Response.json({ok:true,id,created_at:same.created_at,duplicate:true},{headers:{"Cache-Control":"no-store"}});
      return no("Identifiant déjà utilisé.",409);
     }
    }catch(e){
     // Only delete an orphan if no concurrent retry has already committed it.
     const committed=await db.prepare("SELECT id FROM messages WHERE id=?").bind(id).first();
     if(!committed)await bucket.delete(id);
     throw e;
    }
    waitUntil(notifyPartner(env,u.room_id,u.id,"Love Radar 💌",kind==="image"?(viewOnce?"Ton partenaire t’a envoyé une photo à vue unique.":"Ton partenaire t’a envoyé une photo."):(viewOnce?"Ton partenaire t’a envoyé un vocal à écoute unique.":"Ton partenaire t’a envoyé un message vocal."),"chat",{kind:kind==="image"?"photo":"audio",id}));
    return Response.json({ok:true,id,created_at:now},{headers:{"Cache-Control":"no-store"}});
   }catch(e){console.error("media upload",e);return no("Envoi impossible. Réessaie.",500)}
  }

  };
  return handlers;
}

export const onRequestGet = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).GET({request:ctx.request});
export const onRequestPost = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).POST({request:ctx.request});
