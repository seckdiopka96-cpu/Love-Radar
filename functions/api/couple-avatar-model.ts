import type {D1Database,R2Bucket} from "@cloudflare/workers-types";
/** Authenticated, private GLB export storage. Never accepts arbitrary remote URLs.
 * A member may ONLY replace or read models belonging to their couple room.
 */
type Context={request:Request;env:{DB?:D1Database;STORAGE?:R2Bucket}};
type Member={id:string;room_id:string};
type Stored={member_id:string;object_key:string;updated_at:number};
const MAX_BYTES=12_000_000;
const respond=(payload:Record<string,unknown>,status=200)=>Response.json({ok:status<400,...payload},
 {status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const fail=(error:string,status=400)=>respond({error},status);
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=(async()=>{
  await db.exec("CREATE TABLE IF NOT EXISTS couple_avatar_models ("+
   "room_id TEXT NOT NULL,member_id TEXT NOT NULL,object_key TEXT NOT NULL,"+
   "updated_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS couple_avatar_rooms ("+
   "room_id TEXT PRIMARY KEY,pose TEXT NOT NULL DEFAULT 'main',version INTEGER NOT NULL DEFAULT 0)");
 })().catch(error=>{ready=null;throw error});
 await ready;
}
async function member(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(bearer))return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)))))
  .map(byte=>byte.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function membersModels(db:D1Database,roomId:string){
 const rows=await db.prepare("SELECT member_id,object_key,updated_at FROM couple_avatar_models WHERE room_id=?")
  .bind(roomId).all<Stored>();
 return rows.results||[];
}
function validGlb(data:ArrayBuffer):boolean{
 if(data.byteLength<24||data.byteLength>MAX_BYTES)return false;
 const view=new DataView(data);
 if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||
  view.getUint32(8,true)!==data.byteLength)return false;
 const jsonLength=view.getUint32(12,true);
 if(jsonLength<2||jsonLength>Math.min(data.byteLength-20,1_000_000)||
  view.getUint32(16,true)!==0x4e4f534a)return false;
 try{
  const raw=new TextDecoder().decode(new Uint8Array(data,20,jsonLength)).trim();
  const gltf=JSON.parse(raw) as Record<string,unknown>;
  if(!gltf.asset||typeof gltf.asset!=="object")return false;
  // Embedded GLB is the only supported format. No external textures, scripts
  // or network-sourced assets are loaded by our 3D renderer.
  for(const type of ["buffers","images","shaders"]){
   const list=gltf[type];
   if(!list)continue;
   if(!Array.isArray(list))return false;
   for(const item of list){
    if(!item||typeof item!=="object")return false;
    const url=(item as Record<string,unknown>).uri;
    if(url!==undefined&&(typeof url!=="string"||!url.startsWith("data:")))return false;
   }
  }
  return true;
 }catch{return false}
}
async function findOwner(db:D1Database,room:Member,owner:string):Promise<string|null>{
 if(owner==="mine")return room.id;
 if(owner!=="partner")return null;
 const other=await db.prepare("SELECT id FROM members WHERE room_id=? AND id<>? LIMIT 1")
  .bind(room.room_id,room.id).first<{id:string}>();
 return other?.id||null;
}
export async function onRequestGet({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB||!env.STORAGE)return fail("Stockage 3D indisponible.",503);
  const user=await member(request,env.DB);if(!user)return fail("Reconnecte-toi.",401);
  await ensure(env.DB);
  const owner=new URL(request.url).searchParams.get("owner");
  if(owner==="meta"){
   const rows=await membersModels(env.DB,user.room_id);
   return respond({mine:rows.some(x=>x.member_id===user.id),
    partner:rows.some(x=>x.member_id!==user.id)});
  }
  const target=await findOwner(env.DB,user,owner||"");
  if(!target)return fail("Avatar introuvable.",404);
  const row=await env.DB.prepare("SELECT object_key FROM couple_avatar_models WHERE room_id=? AND member_id=?")
   .bind(user.room_id,target).first<{object_key:string}>();
  if(!row)return fail("Avatar 3D non créé.",404);
  const object=await env.STORAGE.get(row.object_key);
  if(!object)return fail("Fichier 3D indisponible.",404);
  return new Response(object.body as unknown as BodyInit,{headers:{
   "Content-Type":"model/gltf-binary","Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin",
   "Content-Disposition":"inline","Referrer-Policy":"no-referrer"
  }});
 }catch(error){console.error("avatar 3D read",error);return fail("Erreur de lecture 3D.",503)}
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB||!env.STORAGE)return fail("Stockage 3D indisponible.",503);
  const user=await member(request,env.DB);if(!user)return fail("Reconnecte-toi.",401);
  if(request.headers.get("Content-Type")?.split(";")[0].trim()!=="model/gltf-binary")
   return fail("Un modèle GLB est nécessaire.",415);
  if(Number(request.headers.get("Content-Length")||0)>MAX_BYTES)return fail("Modèle 3D trop volumineux (12 Mo maximum).",413);
  const data=await request.arrayBuffer();
  if(!validGlb(data))return fail("Fichier GLB invalide ou contient des ressources externes.",400);
  await ensure(env.DB);
  const previous=await env.DB.prepare("SELECT object_key FROM couple_avatar_models WHERE room_id=? AND member_id=?")
   .bind(user.room_id,user.id).first<{object_key:string}>();
  const key="avatars3d/"+user.room_id+"/"+user.id+"/"+crypto.randomUUID()+".glb";
  await env.STORAGE.put(key,data,{httpMetadata:{contentType:"model/gltf-binary"}});
  try{
   await env.DB.prepare("INSERT INTO couple_avatar_models(room_id,member_id,object_key,updated_at) VALUES(?,?,?,?)"+
    " ON CONFLICT(room_id,member_id) DO UPDATE SET object_key=excluded.object_key,updated_at=excluded.updated_at")
    .bind(user.room_id,user.id,key,Date.now()).run();
   await env.DB.prepare("INSERT INTO couple_avatar_rooms(room_id,pose,version) VALUES(?,'main',1)"+
    " ON CONFLICT(room_id) DO UPDATE SET version=couple_avatar_rooms.version+1")
    .bind(user.room_id).run();
  }catch(error){await env.STORAGE.delete(key);throw error}
  if(previous?.object_key&&previous.object_key!==key){
   // Replaced private models should never accumulate in private R2.
   try{await env.STORAGE.delete(previous.object_key)}
   catch(error){console.error("avatar 3D old object cleanup",error)}
  }
  return respond({stored:true,size:data.byteLength});
 }catch(error){console.error("avatar 3D upload",error);return fail("Impossible d'enregistrer ce modèle 3D.",503)}
}
export async function onRequestDelete({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB||!env.STORAGE)return fail("Stockage 3D indisponible.",503);
  const user=await member(request,env.DB);if(!user)return fail("Reconnecte-toi.",401);
  await ensure(env.DB);
  const row=await env.DB.prepare("SELECT object_key FROM couple_avatar_models WHERE room_id=? AND member_id=?")
   .bind(user.room_id,user.id).first<{object_key:string}>();
  if(row){await env.STORAGE.delete(row.object_key);
   await env.DB.prepare("DELETE FROM couple_avatar_models WHERE room_id=? AND member_id=?")
    .bind(user.room_id,user.id).run();
   await env.DB.prepare("UPDATE couple_avatar_rooms SET version=version+1 WHERE room_id=?")
    .bind(user.room_id).run();
  }
  return respond({deleted:true});
 }catch(error){console.error("avatar 3D deletion",error);return fail("Impossible de supprimer le modèle.",503)}
}
