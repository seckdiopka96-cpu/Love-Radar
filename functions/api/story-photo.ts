import type {D1Database,R2Bucket} from "@cloudflare/workers-types";
import type {PushEnv} from "../lib/push";

/** Private couple-photo endpoint. The R2 object is never publicly exposed. */
type Env=PushEnv&{STORAGE?:R2Bucket};
type Context={request:Request;env:Env};
type User={id:string;room_id:string};
type PhotoRow={photo_key:string|null;photo_mime:string|null};
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:object)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_stories(room_id TEXT PRIMARY KEY,met_on TEXT,reunion_on TEXT,reunion_place TEXT NOT NULL DEFAULT '',photo_key TEXT,photo_mime TEXT,updated_at INTEGER NOT NULL)"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 await ready;
}
async function authorize(request:Request,db:D1Database):Promise<User|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(bearer))return null;
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<User>();
}
async function handle(ctx:Context,method:"GET"|"POST"|"DELETE"){
 try{
  const db=ctx.env.DB,bucket=ctx.env.STORAGE;
  if(!db||!bucket)return no("Le stockage des photos n’est pas configuré.",503);
  const user=await authorize(ctx.request,db);
  if(!user)return no("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  const old=await db.prepare("SELECT photo_key,photo_mime FROM couple_stories WHERE room_id=?")
   .bind(user.room_id).first<PhotoRow>();
  if(method==="GET"){
   if(!old?.photo_key||!old.photo_mime)return no("Aucune photo de couple enregistrée.",404);
   const object=await bucket.get(old.photo_key);
   if(!object)return no("La photo n’est plus disponible.",404);
   return new Response(await object.arrayBuffer(),{headers:{
    "Content-Type":old.photo_mime,"Cache-Control":"private, no-store,max-age=0",
    "X-Content-Type-Options":"nosniff","Content-Disposition":"inline",
    "Content-Security-Policy":"default-src 'none'; sandbox"
   }});
  }
  if(method==="DELETE"){
   await db.prepare("UPDATE couple_stories SET photo_key=NULL,photo_mime=NULL,updated_at=? WHERE room_id=?")
    .bind(Date.now(),user.room_id).run();
   if(old?.photo_key){try{await bucket.delete(old.photo_key)}catch(e){console.error("photo delete",e)}}
   return ok({removed:true});
  }
  if(Number(ctx.request.headers.get("content-length")||0)>6_500_000)return no("Photo trop volumineuse.",413);
  const form=await ctx.request.formData(),file=form.get("file");
  if(!(file instanceof File))return no("Choisis une photo.",400);
  const mime=file.type.split(";")[0].toLowerCase();
  if(!["image/jpeg","image/png","image/webp"].includes(mime))return no("Utilise une photo JPEG, PNG ou WebP.",400);
  if(file.size<100||file.size>5_000_000)return no("La photo ne doit pas dépasser 5 Mo.",413);
  const buffer=new Uint8Array(await file.arrayBuffer());
  const header=new TextDecoder().decode(buffer.subarray(0,12));
  const valid=mime==="image/jpeg"?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:
   mime==="image/png"?buffer[0]===137&&header.slice(1,4)==="PNG":
   header.startsWith("RIFF")&&header.slice(8,12)==="WEBP";
  if(!valid)return no("Le fichier ne ressemble pas à une vraie image.",400);
  const key="couple-story/"+user.room_id+"/"+crypto.randomUUID();
  await bucket.put(key,buffer,{httpMetadata:{contentType:mime}});
  try{
   await db.prepare("INSERT INTO couple_stories(room_id,photo_key,photo_mime,updated_at) VALUES(?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET photo_key=excluded.photo_key,photo_mime=excluded.photo_mime,updated_at=excluded.updated_at")
    .bind(user.room_id,key,mime,Date.now()).run();
  }catch(err){await bucket.delete(key);throw err}
  if(old?.photo_key&&old.photo_key!==key){try{await bucket.delete(old.photo_key)}catch(e){console.error("previous photo cleanup",e)}}
  return ok({uploaded:true});
 }catch(e){console.error("Love Radar story photo",e);return no("Impossible de traiter cette photo pour le moment.",503)}
}
export const onRequestGet=(ctx:Context)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Context)=>handle(ctx,"POST");
export const onRequestDelete=(ctx:Context)=>handle(ctx,"DELETE");
