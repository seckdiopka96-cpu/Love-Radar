import type {D1Database} from "@cloudflare/workers-types";
import {ensureVoipDeviceTable,type VoipEnv} from "../lib/apns-voip";

/** Authentication is by the existing private couple session, never by the
 * APNs device token. PushKit credentials are registered per device and member. */
type Ctx={request:Request;env:VoipEnv};
const result=(data:Record<string,unknown>,status=200)=>
 Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(message:string,status=400)=>result({ok:false,error:message},status);
async function authenticate(req:Request,db:D1Database){
 const raw=req.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(raw))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw.slice(7)));
 const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?")
  .bind(hash).first<{id:string;room_id:string}>();
}
const validDevice=(x:unknown):x is string=>
 typeof x==="string"&&/^[0-9a-f-]{36}$/i.test(x)&&x.length===36;
const validToken=(x:unknown):x is string=>
 typeof x==="string"&&/^[a-f0-9]{64,512}$/i.test(x)&&x.length%2===0;
export async function onRequestPost({request,env}:Ctx):Promise<Response>{
 try{
  if(!env.DB)return fail("Service indisponible.",503);
  const member=await authenticate(request,env.DB);
  if(!member)return fail("Session expirée.",401);
  const raw=await request.text();
  if(raw.length>1400)return fail("Requête trop longue.",413);
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw) as Record<string,unknown>}
  catch{return fail("Données invalides.")}
  if(!validDevice(body.deviceId))return fail("Appareil invalide.");
  if(body.action==="register"){
   if(!validToken(body.voipToken))return fail("Jeton PushKit invalide.");
   await ensureVoipDeviceTable(env.DB);
   const now=Date.now();
   // Device association must change when someone logs into a different couple
   // on the same installed iPhone. A stale membership can never receive calls.
   await env.DB.prepare("DELETE FROM native_voip_devices WHERE device_id=?")
    .bind(body.deviceId).run();
   await env.DB.prepare("DELETE FROM native_voip_devices WHERE voip_token=?")
    .bind(body.voipToken).run();
   await env.DB.prepare("INSERT INTO native_voip_devices(member_id,room_id,device_id,voip_token,updated_at) VALUES(?,?,?,?,?)")
    .bind(member.id,member.room_id,body.deviceId,(body.voipToken as string).toLowerCase(),now).run();
   return result({ok:true,registered:true});
  }
  if(body.action==="unregister"){
   await ensureVoipDeviceTable(env.DB);
   await env.DB.prepare("DELETE FROM native_voip_devices WHERE member_id=? AND device_id=?")
    .bind(member.id,body.deviceId).run();
   return result({ok:true,registered:false});
  }
  return fail("Action inconnue.",404);
 }catch(e){console.error("Love Radar VoIP device registration error",e);
  return fail("Enregistrement iPhone indisponible.",503)}
}
