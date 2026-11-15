import type {D1Database} from "@cloudflare/workers-types";
import type {PushEnv} from "../lib/push";
import {parseTelepartyInvite} from "../../src/netflix-party-utils";

type Ctx={request:Request;env:PushEnv};
type Member={id:string;room_id:string;name:string;seat:number};
type Party={room_id:string;invite_url:string;version:number;updated_at:number;updated_by:string|null};
type PublicParty={inviteUrl:string;version:number;updatedAt:number;updatedBy:string|null};
const ok=(value:object)=>Response.json({ok:true,...value},{headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
let ready:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_netflix_parties(room_id TEXT PRIMARY KEY,invite_url TEXT NOT NULL,version INTEGER NOT NULL,updated_at INTEGER NOT NULL,updated_by TEXT)"
 ).then(()=>{}).catch(error=>{ready=null;throw error});
 return ready;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function read(db:D1Database,room:string):Promise<Party>{
 const data=await db.prepare("SELECT * FROM couple_netflix_parties WHERE room_id=?").bind(room).first<Party>();
 if(!data)throw Error("Session Netflix absente");
 return data;
}
const view=(party:Party):PublicParty=>({inviteUrl:party.invite_url,version:party.version,updatedAt:party.updated_at,updatedBy:party.updated_by});
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Serveur temporairement indisponible.",503);
  const user=await auth(ctx.request,db);
  if(!user)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  await db.prepare("INSERT OR IGNORE INTO couple_netflix_parties(room_id,invite_url,version,updated_at,updated_by) VALUES(?,'',1,0,NULL)")
   .bind(user.room_id).run();
  const current=await read(db,user.room_id);
  if(method==="GET")return ok({party:view(current)});
  const body=await ctx.request.text();
  if(body.length>2000)return fail("Requête trop volumineuse.",413);
  let payload:Record<string,unknown>;
  try{payload=JSON.parse(body) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(!Number.isInteger(payload.version)||payload.version!==current.version)return fail("La séance a été modifiée par ton partenaire. Actualise.",409);
  if(payload.action!=="share"&&payload.action!=="clear")return fail("Action non autorisée.",400);
  const invite=payload.action==="clear"?"":parseTelepartyInvite(String(payload.inviteUrl||""));
  if(invite===null)return fail("Colle le lien d'invitation Teleparty, pas un simple lien Netflix.",400);
  const now=Date.now();
  const saved=await db.prepare(
   "UPDATE couple_netflix_parties SET invite_url=?,version=version+1,updated_at=?,updated_by=? WHERE room_id=? AND version=?"
  ).bind(invite,now,user.name.slice(0,60),user.room_id,current.version).run();
  if(saved.meta.changes!==1)return fail("La séance vient de changer. Recharge la page.",409);
  return ok({party:view(await read(db,user.room_id))});
 }catch(error){console.error("Love Radar Netflix-party",error);return fail("Impossible d'accéder à la séance Netflix.",500);}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");
