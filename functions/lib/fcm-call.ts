import type {D1Database} from "@cloudflare/workers-types";
import type {VoipEnv} from "./apns-voip";

/** Android FCM is transport only; no Firebase Auth, Realtime Database or chat data. */
export type AndroidVoipEnv=VoipEnv & {
 FCM_PROJECT_ID?:string;
 FCM_CLIENT_EMAIL?:string;
 FCM_PRIVATE_KEY?:string;
};
type Device={fcm_token:string};
const tokenPattern=/^[A-Za-z0-9:_.\-]{60,1024}$/;
export const validAndroidFcmToken=(token:unknown):token is string=>
 typeof token==="string"&&tokenPattern.test(token);

export async function ensureAndroidDeviceTable(db:D1Database){
 await db.exec(
  "CREATE TABLE IF NOT EXISTS native_android_devices ("+
  "member_id TEXT NOT NULL,room_id TEXT NOT NULL,device_id TEXT NOT NULL,"+
  "fcm_token TEXT NOT NULL UNIQUE,updated_at INTEGER NOT NULL,"+
  "PRIMARY KEY(member_id,device_id));"+
  "CREATE INDEX IF NOT EXISTS idx_android_voip_room ON native_android_devices(room_id,member_id);"
 );
}

let cache:{key:string;token:string;expires:number}|null=null;
const base64url=(value:Uint8Array|string)=>{
 const bytes=typeof value==="string"?new TextEncoder().encode(value):value;
 let binary="";for(const x of bytes)binary+=String.fromCharCode(x);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
function validConfig(env:AndroidVoipEnv){
 const project=env.FCM_PROJECT_ID||"",email=env.FCM_CLIENT_EMAIL||"";
 const pem=(env.FCM_PRIVATE_KEY||"").replace(/\\n/g,"\n");
 if(!/^[a-z0-9][a-z0-9-]{3,48}$/.test(project)||
  !/^[A-Za-z0-9_.+\-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(email)||
  !pem.includes("-----BEGIN PRIVATE KEY-----"))return null;
 return {project,email,pem};
}
async function accessToken(env:AndroidVoipEnv):Promise<string|null>{
 const config=validConfig(env);if(!config)return null;
 const key=config.project+":"+config.email+":"+config.pem;
 if(cache?.key===key&&cache.expires>Date.now())return cache.token;
 const iat=Math.floor(Date.now()/1000);
 const unsigned=base64url(JSON.stringify({alg:"RS256",typ:"JWT"}))+"."+
  base64url(JSON.stringify({iss:config.email,
   scope:"https://www.googleapis.com/auth/firebase.messaging",
   aud:"https://oauth2.googleapis.com/token",iat,exp:iat+3500}));
 const decoded=atob(config.pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,""));
 const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 const cryptoKey=await crypto.subtle.importKey("pkcs8",bytes.buffer as ArrayBuffer,
  {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",cryptoKey,new TextEncoder().encode(unsigned)));
 const jwt=unsigned+"."+base64url(signature);
 const response=await fetch("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt}),
  signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error("FCM OAuth rejected: "+response.status);
 const data=await response.json() as {access_token?:string;expires_in?:number};
 if(!data.access_token)return null;
 cache={key,token:data.access_token,expires:Date.now()+Math.max(30,Math.min(3000,(data.expires_in||3600)-120))*1000};
 return data.access_token;
}
export async function notifyIncomingAndroid(
 env:AndroidVoipEnv,roomId:string,memberId:string,callId:string,
 callerName:string,expiresAt:number,mode:"audio"|"video"="audio"
):Promise<void>{
 if(!env.DB||!/^[0-9a-f-]{36}$/i.test(callId))return;
 const config=validConfig(env);
 if(!config){console.info("Love Radar Android FCM is not configured");return}
 try{
  await ensureAndroidDeviceTable(env.DB);
  const rows=await env.DB.prepare(
   "SELECT fcm_token FROM native_android_devices WHERE member_id=? AND room_id=? ORDER BY updated_at DESC LIMIT 6"
  ).bind(memberId,roomId).all<Device>();
  const devices=rows.results||[];
  if(!devices.length)return;
  const bearer=await accessToken(env);
  if(!bearer)return;
  const display=callerName.replace(/[\r\n\t]/g," ").trim().slice(0,60)||"Ton partenaire";
  const name=display.replace(/[<>]/g,"");
  await Promise.all(devices.map(async device=>{
   try{
    const response=await fetch("https://fcm.googleapis.com/v1/projects/"+config.project+"/messages:send",{
     method:"POST",
     headers:{"Authorization":"Bearer "+bearer,"Content-Type":"application/json"},
     body:JSON.stringify({message:{
      token:device.fcm_token,
      data:{type:"incoming_call",callId,callerName:name,expiresAt:String(expiresAt),mode},
      android:{priority:"HIGH",ttl:"60s",restricted_package_name:"com.diaotech.loveradar"}
     }}),
     signal:AbortSignal.timeout(8500)
    });
    if(response.ok)return;
    const body=await response.text().catch(()=>"");
    if(response.status===404||response.status===410||
       (response.status===400&&/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(body))){
     await env.DB!.prepare("DELETE FROM native_android_devices WHERE fcm_token=? AND member_id=?")
      .bind(device.fcm_token,memberId).run();
    }
    console.warn("Love Radar Android FCM rejected a call",response.status);
   }catch(err){console.error("Love Radar Android FCM transport error",err)}
  }));
 }catch(err){console.error("Love Radar Android call notification error",err)}
}
