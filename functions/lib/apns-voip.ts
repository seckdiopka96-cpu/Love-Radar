import type {D1Database} from "@cloudflare/workers-types";
import type {PushEnv} from "./push";

/** APNs VoIP delivery is separate from VAPID Web Push. Apple credentials must
 * exist only in Cloudflare secrets; never put a .p8 file in GitHub or the app. */
export type VoipEnv=PushEnv & {
 APNS_TEAM_ID?:string;
 APNS_KEY_ID?:string;
 APNS_PRIVATE_KEY?:string;
 APNS_BUNDLE_ID?:string;
 APNS_ENVIRONMENT?:string;
};
type VoipDevice={voip_token:string};
let tokenCache:{key:string;value:string;validUntil:number}|null=null;
const b64url=(data:Uint8Array|string)=>{
 const bytes=typeof data==="string"?new TextEncoder().encode(data):data;
 let binary="";for(const n of bytes)binary+=String.fromCharCode(n);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const keyData=(key:string):Uint8Array=>{
 const base64=key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const bytes=atob(base64);
 return Uint8Array.from(bytes,c=>c.charCodeAt(0));
};
function config(env:VoipEnv){
 const team=env.APNS_TEAM_ID||"",kid=env.APNS_KEY_ID||"",pem=env.APNS_PRIVATE_KEY||"";
 const bundle=env.APNS_BUNDLE_ID||"com.diaotech.loveradar";
 if(!/^[A-Z0-9]{10}$/.test(team)||!/^[A-Z0-9]{10}$/.test(kid)||!pem.includes("BEGIN PRIVATE KEY")||
  !/^com\.[a-z0-9.-]+$/.test(bundle))return null;
 return {team,kid,pem,bundle,host:env.APNS_ENVIRONMENT==="sandbox"?
  "api.sandbox.push.apple.com":"api.push.apple.com"};
}
async function authToken(env:VoipEnv):Promise<string|null>{
 const c=config(env);if(!c)return null;
 const key=c.team+":"+c.kid+":"+c.pem;
 const time=Math.floor(Date.now()/1000);
 if(tokenCache?.key===key&&tokenCache.validUntil>time)return tokenCache.value;
 const encoded=b64url(JSON.stringify({alg:"ES256",kid:c.kid,typ:"JWT"}))+"."+
  b64url(JSON.stringify({iss:c.team,iat:time}));
 const privateKey=await crypto.subtle.importKey("pkcs8",keyData(c.pem).buffer as ArrayBuffer,
  {name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const raw=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
  privateKey,new TextEncoder().encode(encoded)));
 const jwt=encoded+"."+b64url(raw);
 tokenCache={key,value:jwt,validUntil:time+40*60};
 return jwt;
}
export async function ensureVoipDeviceTable(db:D1Database):Promise<void>{
 await db.exec(
  "CREATE TABLE IF NOT EXISTS native_voip_devices ("+
  "member_id TEXT NOT NULL,room_id TEXT NOT NULL,device_id TEXT NOT NULL,"+
  "voip_token TEXT NOT NULL UNIQUE,updated_at INTEGER NOT NULL,"+
  "PRIMARY KEY(member_id,device_id));"+
  "CREATE INDEX IF NOT EXISTS idx_native_voip_room ON native_voip_devices(room_id,member_id);"
 );
}
export async function notifyIncomingVoip(env:VoipEnv,roomId:string,memberId:string,
 callId:string,callerName:string,expiresAt:number,mode:"audio"|"video"="audio"):Promise<void>{
 if(!env.DB)return;
 const c=config(env);
 if(!c){console.info("Love Radar APNs VoIP is not configured for this environment");return}
 if(!/^[0-9a-f-]{36}$/i.test(callId))return;
 try{
  await ensureVoipDeviceTable(env.DB);
  const rows=await env.DB.prepare(
   "SELECT voip_token FROM native_voip_devices WHERE room_id=? AND member_id=? "+
   "ORDER BY updated_at DESC LIMIT 6"
  ).bind(roomId,memberId).all<VoipDevice>();
  const devices=rows.results||[];
  if(!devices.length)return;
  const jwt=await authToken(env);
  if(!jwt)return;
  const payload=JSON.stringify({
   type:"incoming_call",callId,callerName:callerName.replace(/[\r\n\t]/g," ").trim().slice(0,60)||"Ton amour",
   expiresAt,mode
  });
  await Promise.all(devices.map(async device=>{
   try{
    const res=await fetch("https://"+c.host+"/3/device/"+device.voip_token,{
     method:"POST",
     headers:{
      "authorization":"bearer "+jwt,
      "apns-topic":c.bundle+".voip",
      "apns-push-type":"voip",
      "apns-priority":"10",
      "apns-expiration":"0",
      "content-type":"application/json"
     },
     body:payload,signal:AbortSignal.timeout(8500)
    });
    if(res.status===410||res.status===400){
     const data=await res.json().catch(()=>({})) as {reason?:string};
     if(res.status===410||["BadDeviceToken","Unregistered","DeviceTokenNotForTopic"].includes(data.reason||"")){
      await env.DB!.prepare("DELETE FROM native_voip_devices WHERE voip_token=? AND room_id=?")
       .bind(device.voip_token,roomId).run();
     }
    }
    if(!res.ok)console.error("Love Radar APNs VoIP delivery failed",res.status);
   }catch(error){console.error("Love Radar APNs VoIP transport error",error)}
  }));
 }catch(e){console.error("Love Radar native VoIP notification failed",e)}
}
