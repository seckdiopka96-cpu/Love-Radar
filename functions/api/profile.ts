import type {D1Database,R2Bucket} from "@cloudflare/workers-types";

/** Authenticated, private couple profile pictures. Never expose R2 URLs or
 * accept a member ID outside the caller's room. */
type Env={DB:D1Database;STORAGE:R2Bucket};
type Ctx={request:Request;env:Env};
type Member={id:string;room_id:string};
type Picture={room_id:string;member_id:string;object_key:string;updated_at:number};
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const ok=(result:Record<string,unknown>)=>Response.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
let initialized:Promise<void>|null=null;
export async function ensureProfilePhotos(db:D1Database){
 if(!initialized)initialized=db.exec(
  "CREATE TABLE IF NOT EXISTS profile_photos("+
  "room_id TEXT NOT NULL,member_id TEXT NOT NULL,object_key TEXT NOT NULL,"+
  "updated_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id))"
 ).then(()=>{}).catch(err=>{initialized=null;throw err});
 await initialized;
}
async function currentUser(request:Request,db:D1Database):Promise<Member|null>{
 const authorization=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(authorization))return null;
 const hashed=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(authorization.slice(7)));
 const digest=Array.from(new Uint8Array(hashed),byte=>byte.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(digest).first<Member>();
}
async function getPicture(db:D1Database,room:string,member:string){
 return db.prepare("SELECT room_id,member_id,object_key,updated_at FROM profile_photos WHERE room_id=? AND member_id=?")
  .bind(room,member).first<Picture>();
}
function validMember(id:string){return /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)}
async function handler(ctx:Ctx,method:"GET"|"POST"|"DELETE"){
 try{
  const {DB:db,STORAGE:bucket}=ctx.env;
  if(!db||!bucket)return no("Stockage de profil indisponible.",503);
  const user=await currentUser(ctx.request,db);
  if(!user)return no("Session expirée.",401);
  await ensureProfilePhotos(db);
  if(method==="GET"){
   const id=new URL(ctx.request.url).searchParams.get("member")||"";
   if(!validMember(id))return no("Identifiant de profil invalide.",400);
   const partner=await db.prepare("SELECT id FROM members WHERE room_id=? AND id=?")
    .bind(user.room_id,id).first<{id:string}>();
   if(!partner)return no("Profil introuvable.",404);
   const saved=await getPicture(db,user.room_id,id);
   if(!saved)return no("Pas encore de photo.",404);
   const file=await bucket.get(saved.object_key);
   if(!file)return no("Photo indisponible.",404);
   return new Response(file.body as unknown as BodyInit,{
    status:200,headers:{"Content-Type":"image/jpeg","Content-Disposition":"inline","Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}
   });
  }
  if(method==="DELETE"){
   const saved=await getPicture(db,user.room_id,user.id);
   if(!saved)return ok({deleted:true,version:0});
   await db.prepare("DELETE FROM profile_photos WHERE room_id=? AND member_id=?")
    .bind(user.room_id,user.id).run();
   try{await bucket.delete(saved.object_key)}catch(err){console.error("Profile photo cleanup",err)}
   return ok({deleted:true,version:0});
  }
  const bytesHeader=Number(ctx.request.headers.get("content-length")||0);
  if(bytesHeader>2_000_000)return no("Photo trop volumineuse.",413);
  const form=await ctx.request.formData();
  const photo=form.get("photo");
  if(!(photo instanceof File))return no("Sélectionne une photo.",400);
  if(photo.type!=="image/jpeg")return no("Format invalide. Recadre la photo dans l’application.",415);
  if(photo.size<150||photo.size>1_500_000)return no("La photo doit faire moins de 1,5 Mo.",413);
  const bytes=new Uint8Array(await photo.arrayBuffer());
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return no("Cette photo ne semble pas être un JPEG valide.",415);
  const prior=await getPicture(db,user.room_id,user.id);
  const key="profile/"+user.room_id+"/"+user.id+"/"+crypto.randomUUID()+".jpg";
  await bucket.put(key,bytes,{httpMetadata:{contentType:"image/jpeg"}});
  const version=Math.max(Date.now(),(prior?.updated_at||0)+1);
  try{
   await db.prepare("INSERT INTO profile_photos(room_id,member_id,object_key,updated_at) VALUES(?,?,?,?)"+
    " ON CONFLICT(room_id,member_id) DO UPDATE SET object_key=excluded.object_key,updated_at=excluded.updated_at")
    .bind(user.room_id,user.id,key,version).run();
  }catch(err){
   try{await bucket.delete(key)}catch{}
   throw err;
  }
  if(prior?.object_key&&prior.object_key!==key){
   try{await bucket.delete(prior.object_key)}catch(err){console.error("Old profile photo cleanup",err)}
  }
  return ok({saved:true,version});
 }catch(err){
  console.error("Profile photo API",err);
  return no("Impossible de traiter la photo de profil.",500);
 }
}
export const onRequestGet=(ctx:Ctx)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handler(ctx,"POST");
export const onRequestDelete=(ctx:Ctx)=>handler(ctx,"DELETE");
