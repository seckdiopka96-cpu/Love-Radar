import type {D1Database} from "@cloudflare/workers-types";
type Env={DB?:D1Database;TURN_KEY_ID?:string;TURN_KEY_API_TOKEN?:string};
type Context={request:Request;env:Env};
const STUN=[{urls:"stun:stun.cloudflare.com:3478"},{urls:"stun:stun.l.google.com:19302"}];
const json=(data:object,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
export async function onRequestGet({request,env}:Context):Promise<Response>{
 try{
  if(!env.DB)return json({ok:false,error:"Service indisponible."},503);
  const auth=request.headers.get("Authorization")||"";
  if(!/^Bearer [a-f0-9]{64}$/.test(auth))return json({ok:false,error:"Session expirée."},401);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(auth.slice(7)));
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
  const member=await env.DB.prepare("SELECT id FROM members WHERE token_hash=?").bind(hash).first<{id:string}>();
  if(!member)return json({ok:false,error:"Session expirée."},401);
  if(!env.TURN_KEY_ID||!env.TURN_KEY_API_TOKEN)return json({ok:true,relay:false,iceServers:STUN});
  // Mint short-lived credentials only for authenticated members, never expose TURN key secrets.
  const response=await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/"+encodeURIComponent(env.TURN_KEY_ID)+"/credentials/generate-ice-servers",{
   method:"POST",headers:{"Authorization":"Bearer "+env.TURN_KEY_API_TOKEN,"Content-Type":"application/json"},
   body:JSON.stringify({ttl:7200})
  });
  if(!response.ok){console.error("TURN generation status",response.status);return json({ok:true,relay:false,iceServers:STUN,warning:"Le relais audio n'est pas disponible pour le moment."})}
  const payload=await response.json() as {iceServers?:{urls:string|string[];username?:string;credential?:string}[]};
  const iceServers=payload.iceServers?.filter(s=>{
    const urls=Array.isArray(s.urls)?s.urls:[s.urls];
    return urls.some(u=>typeof u==="string"&&(u.startsWith("stun:")||u.startsWith("turn:")||u.startsWith("turns:")));
  });
  if(!iceServers?.length)return json({ok:true,relay:false,iceServers:STUN});
  return json({ok:true,relay:true,iceServers});
 }catch(err){console.error("Love Radar TURN configuration",err);return json({ok:true,relay:false,iceServers:STUN,warning:"Le relais audio est momentanément indisponible."})}
}
