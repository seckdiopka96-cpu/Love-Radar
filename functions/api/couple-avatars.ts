import type {D1Database} from "@cloudflare/workers-types";
import {validAvatar3DLook,type Avatar3DLook} from "../../src/avatar-3d-look";
import {validAvatarStyle,validCouplePose,DEFAULT_COUPLE_AVATARS,type AvatarStyle,type CouplePose} from "../../src/couple-avatar-model";

type Context={request:Request;env:{DB?:D1Database}};
type Member={id:string;room_id:string};
type SavedStyle={member_id:string;skin:string;hair:string;hair_color:string;outfit:string;accessory:string};
type RoomPose={pose:string;version:number};
type Saved3DLook={member_id:string;outfit_color:string;hair_color:string;shoes_color:string};
const reply=(data:Record<string,unknown>,status=200)=>Response.json({ok:status<400,...data},{
 status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
const fail=(error:string,status=400)=>reply({error},status);
let setup:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!setup)setup=(async()=>{
  await db.exec("CREATE TABLE IF NOT EXISTS couple_avatar_styles("+
   "room_id TEXT NOT NULL,member_id TEXT NOT NULL,skin TEXT NOT NULL,"+
   "hair TEXT NOT NULL,hair_color TEXT NOT NULL,outfit TEXT NOT NULL,"+
   "accessory TEXT NOT NULL,updated_at INTEGER NOT NULL,"+
   "PRIMARY KEY(room_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS couple_avatar_looks("+
   "room_id TEXT NOT NULL,member_id TEXT NOT NULL,"+
   "outfit_color TEXT NOT NULL,hair_color TEXT NOT NULL,shoes_color TEXT NOT NULL,"+
   "updated_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS couple_avatar_models("+
   "room_id TEXT NOT NULL,member_id TEXT NOT NULL,object_key TEXT NOT NULL,"+
   "updated_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id))");
  await db.exec("CREATE TABLE IF NOT EXISTS couple_avatar_rooms("+
   "room_id TEXT PRIMARY KEY,pose TEXT NOT NULL DEFAULT 'main',"+
   "version INTEGER NOT NULL DEFAULT 0)");
 })().catch(err=>{setup=null;throw err});
 await setup;
}
async function authorize(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(bearer))return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)))))
  .map(n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
function style(row:SavedStyle|undefined):AvatarStyle|null{
 if(!row)return null;
 const candidate={skin:row.skin,hair:row.hair,hairColor:row.hair_color,
  outfit:row.outfit,accessory:row.accessory};
 return validAvatarStyle(candidate)?candidate:null;
}
function look(row:Saved3DLook|undefined):Avatar3DLook|null{
 if(!row)return null;
 const candidate={outfit:row.outfit_color,hair:row.hair_color,shoes:row.shoes_color};
 return validAvatar3DLook(candidate)?candidate:null;
}
async function state(db:D1Database,member:Member){
 const [styles,scene,models,looks]=await Promise.all([
  db.prepare("SELECT member_id,skin,hair,hair_color,outfit,accessory FROM couple_avatar_styles WHERE room_id=?")
   .bind(member.room_id).all<SavedStyle>(),
  db.prepare("SELECT pose,version FROM couple_avatar_rooms WHERE room_id=?")
   .bind(member.room_id).first<RoomPose>(),
  db.prepare("SELECT member_id FROM couple_avatar_models WHERE room_id=?")
   .bind(member.room_id).all<{member_id:string}>(),
  db.prepare("SELECT member_id,outfit_color,hair_color,shoes_color FROM couple_avatar_looks WHERE room_id=?")
   .bind(member.room_id).all<Saved3DLook>()
 ]);
 const mine=styles.results.find(row=>row.member_id===member.id);
 const partner=styles.results.find(row=>row.member_id!==member.id);
 return {mine:style(mine),partner:style(partner),
  mineLook3d:look(looks.results.find(row=>row.member_id===member.id)),
  partnerLook3d:look(looks.results.find(row=>row.member_id!==member.id)),
  mine3d:models.results.some(row=>row.member_id===member.id),
  partner3d:models.results.some(row=>row.member_id!==member.id),
  pose:scene&&validCouplePose(scene.pose)?scene.pose:DEFAULT_COUPLE_AVATARS.pose,
  version:Number(scene?.version||0)};
}
export async function onRequestGet({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB)return fail("Service indisponible.",503);
  const member=await authorize(request,env.DB);
  if(!member)return fail("Session invalide.",401);
  await ensure(env.DB);
  return reply({avatars:await state(env.DB,member)});
 }catch(error){console.error("avatars GET",error);return fail("Impossible de charger vos avatars.",503)}
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB)return fail("Service indisponible.",503);
  const member=await authorize(request,env.DB);
  if(!member)return fail("Session invalide.",401);
  if(request.headers.get("Content-Type")?.split(";")[0].trim()!=="application/json")
   return fail("Format JSON attendu.",415);
  const body=await request.text();
  if(body.length>400)return fail("Personnage trop volumineux.",413);
  let raw:unknown;
  try{raw=JSON.parse(body)}catch{return fail("Données invalides.",400)}
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return fail("Données invalides.");
  const input=raw as Record<string,unknown>;
  if(input.kind!=="style"&&input.kind!=="pose"&&input.kind!=="look3d")return fail("Action inconnue.");
  if(input.kind==="style"&&!validAvatarStyle(input.style))return fail("Personnage non reconnu.");
  if(input.kind==="pose"&&!validCouplePose(input.pose))return fail("Pose non reconnue.");
  if(input.kind==="look3d"&&!validAvatar3DLook(input.look))return fail("Style 3D non reconnu.");
  await ensure(env.DB);
  if(input.kind==="style"){
   const saved=input.style as AvatarStyle;
   await env.DB.prepare(
    "INSERT INTO couple_avatar_styles(room_id,member_id,skin,hair,hair_color,outfit,accessory,updated_at)"+
    " VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET"+
    " skin=excluded.skin,hair=excluded.hair,hair_color=excluded.hair_color,"+
    " outfit=excluded.outfit,accessory=excluded.accessory,updated_at=excluded.updated_at"
   ).bind(member.room_id,member.id,saved.skin,saved.hair,saved.hairColor,saved.outfit,saved.accessory,Date.now()).run();
  }else if(input.kind==="look3d"){
   const saved=input.look as Avatar3DLook;
   // Only the authenticated member can change their OWN appearance.
   // The partner always sees the saved result read from the shared room.
   await env.DB.prepare(
    "INSERT INTO couple_avatar_looks(room_id,member_id,outfit_color,hair_color,shoes_color,updated_at)"+
    " VALUES(?,?,?,?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET"+
    " outfit_color=excluded.outfit_color,hair_color=excluded.hair_color,"+
    " shoes_color=excluded.shoes_color,updated_at=excluded.updated_at"
   ).bind(member.room_id,member.id,saved.outfit,saved.hair,saved.shoes,Date.now()).run();
  }else{
   // Pose is a shared couple preference; either authenticated partner may update it.
   await env.DB.prepare("INSERT INTO couple_avatar_rooms(room_id,pose,version) VALUES(?,?,1)"+
    " ON CONFLICT(room_id) DO UPDATE SET pose=excluded.pose,version=couple_avatar_rooms.version+1")
    .bind(member.room_id,input.pose as CouplePose).run();
   return reply({avatars:await state(env.DB,member)});
  }
  await env.DB.prepare("INSERT INTO couple_avatar_rooms(room_id,pose,version) VALUES(?,'main',1)"+
   " ON CONFLICT(room_id) DO UPDATE SET version=couple_avatar_rooms.version+1")
    .bind(member.room_id).run();
  return reply({avatars:await state(env.DB,member)});
 }catch(error){console.error("avatars POST",error);return fail("Impossible de sauvegarder les avatars.",503)}
}
