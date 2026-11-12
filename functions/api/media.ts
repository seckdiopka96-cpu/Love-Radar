import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

type Env = {DB?: D1Database; STORAGE?: R2Bucket};
type Context = { request: Request; env: Env };

function createHandlers(env: Env) {
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
    const record=await db.prepare("SELECT object_key,mime FROM messages WHERE room_id=? AND object_key=?").bind(u.room_id,key).first<{object_key:string,mime:string}>();
    if(!record)return no("Média introuvable.",404);
    const asset=await bucket.get(record.object_key);if(!asset)return no("Média supprimé.",404);
    return new Response(await asset.arrayBuffer(),{headers:{"Content-Type":record.mime,"Cache-Control":"private, max-age=120","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}});
   }catch(e){console.error("media get",e);return no("Erreur de lecture.",500)}
  },
  POST:async({request})=>{
   try{
    const db=bindings().DB,bucket=bindings().STORAGE;if(!db||!bucket)return no("Service indisponible.",503);
    const u=await getUser(request,db);if(!u)return no("Accès refusé.",401);
    const len=Number(request.headers.get("content-length")||0);if(len>8_000_000)return no("Fichier trop lourd.",413);
    const form=await request.formData(),file=form.get("file"),kind=form.get("kind");
    if(!(file instanceof File)||!["image","audio"].includes(String(kind)))return no("Fichier invalide.");
    const mime=file.type.split(";")[0].toLowerCase();
    const imageTypes=["image/jpeg","image/png","image/webp","image/gif"];
    const audioTypes=["audio/webm","video/webm","audio/ogg","audio/mpeg","audio/mp4","audio/x-m4a","audio/aac"];
    if(kind==="image"&&!imageTypes.includes(mime)||kind==="audio"&&!audioTypes.includes(mime))return no("Format non accepté.");
    const size=kind==="image"?6_000_000:5_000_000;
    if(file.size===0||file.size>size)return no("Fichier trop volumineux.",413);
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!sniff(bytes,mime))return no("Fichier non reconnu.");
    const id=crypto.randomUUID(),now=Date.now();
    await bucket.put(id,bytes,{httpMetadata:{contentType:mime}});
    try{await db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,object_key,mime,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,u.room_id,u.id,kind,id,mime,now).run()}
    catch(e){await bucket.delete(id);throw e}
    return Response.json({ok:true,id},{headers:{"Cache-Control":"no-store"}});
   }catch(e){console.error("media upload",e);return no("Envoi impossible. Réessaie.",500)}
  }

  };
  return handlers;
}

export const onRequestGet = (ctx: Context) => createHandlers(ctx.env).GET({request:ctx.request});
export const onRequestPost = (ctx: Context) => createHandlers(ctx.env).POST({request:ctx.request});
