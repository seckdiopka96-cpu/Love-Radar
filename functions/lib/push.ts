import {buildPushPayload} from "@block65/webcrypto-web-push";
import type {D1Database} from "@cloudflare/workers-types";

export type PushEnv={
 DB?:D1Database;
 VAPID_PUBLIC_KEY?:string;
 VAPID_PRIVATE_KEY?:string;
 VAPID_SUBJECT?:string;
};
export type PushDelivery={registered:number;accepted:number;failed:number};

export function validPushEndpoint(raw:string):boolean{
 try{
  const u=new URL(raw),host=u.hostname.toLowerCase();
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&raw.length<2048&&(
   host==="fcm.googleapis.com"||host==="fcm-xm.googleapis.com"||
   host==="updates.push.services.mozilla.com"||
   host==="notify.windows.com"||host.endsWith(".notify.windows.com")||
   host==="push.apple.com"||host.endsWith(".push.apple.com")
  );
 }catch{return false}
}

type StoredSub={endpoint:string;p256dh:string;auth:string};
export type PushTarget={kind:"message"|"photo"|"audio"|"call"|"ludo-challenge"|"memory-challenge"|"rps-challenge"|"daily-question"|"love-signal";id:string};
type Tab="chat"|"home"|"ludo"|"memory"|"rps"|"rapid"|"truth"|"memories"|"moment"|"together"|"puzzle"|"watch"|"watch-tiktok"|"reconcile"|"care";
function notificationRoute(tab:Tab,target?:PushTarget){
 const route=new URLSearchParams({tab});
 if(target&&(/^[a-f0-9-]{36}$/i.test(target.id)||(target.kind==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(target.id)))){
  route.set("kind",target.kind);route.set("id",target.id);
 }
 return "/?"+route.toString();
}
async function deliver(env:PushEnv,records:StoredSub[],title:string,body:string,tab:Tab,target?:PushTarget,senderId?:string):Promise<PushDelivery>{
 if(!env.DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return {registered:records.length,accepted:0,failed:records.length};
 const vapid={subject:env.VAPID_SUBJECT||"https://love-radar-acd.pages.dev/",publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY};
 const data=JSON.stringify({title,body,tab,url:notificationRoute(tab,target),kind:target?.kind||(tab==="chat"?"message":"notice"),id:target?.id||null,...(senderId?{senderId}:{})});
 let accepted=0,failed=0;
 await Promise.all(records.map(async sub=>{
  if(!validPushEndpoint(sub.endpoint)){failed++;return;}
  try{
   const payload=await buildPushPayload({data,options:{ttl:7200,urgency:"high"}},
    {endpoint:sub.endpoint,expirationTime:null,keys:{p256dh:sub.p256dh,auth:sub.auth}},vapid);
   const response=await fetch(sub.endpoint,{...payload,signal:AbortSignal.timeout(9000)});
   if(response.ok){accepted++;return}
   failed++;
   if(response.status===404||response.status===410)
    await env.DB!.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(sub.endpoint).run();
   console.error("Love Radar push rejected",response.status,sub.endpoint.split("/")[2]);
  }catch(e){failed++;console.error("Love Radar push delivery error",e)}
 }));
 return {registered:records.length,accepted,failed};
}
export async function notifyPartner(
 env:PushEnv,roomId:string,fromId:string,title:string,body:string,tab:Tab="chat",target?:PushTarget
):Promise<void>{
 if(!env.DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return;
 try{
  const rows=await env.DB.prepare("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE room_id=? AND member_id<>? LIMIT 12")
   .bind(roomId,fromId).all<StoredSub>();
  // Put the partner's name in the lock-screen title. The actual profile image
  // never leaves authenticated, private device storage (Web Push stays encrypted).
  const privateChat=tab==="chat"&&Boolean(target&&["message","photo","audio"].includes(target.kind));
  let notificationTitle=title,notificationBody=body;
  if(privateChat){
   const sender=await env.DB.prepare("SELECT name FROM members WHERE room_id=? AND id=? LIMIT 1")
    .bind(roomId,fromId).first<{name:string}>();
   notificationTitle=String(sender?.name||"Ton partenaire").replace(/[\r\n\t]/g," ").trim().slice(0,60)||"Ton partenaire";
   notificationBody=target!.kind==="photo"?"📷 Photo reçue":
    target!.kind==="audio"?"🎤 Message vocal reçu":
    body.includes("sticker")?"💗 Sticker reçu":body.includes("GIF")?"🎞️ GIF animé reçu":"💌 Nouveau message";
  }
  await deliver(env,rows.results||[],notificationTitle,notificationBody,tab,target,privateChat?fromId:undefined);
 }catch(e){console.error("Love Radar push lookup failed",e)}
}
export async function sendTestPush(env:PushEnv,roomId:string,memberId:string):Promise<PushDelivery>{
 if(!env.DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return {registered:0,accepted:0,failed:0};
 const rows=await env.DB.prepare("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE room_id=? AND member_id=? LIMIT 12")
  .bind(roomId,memberId).all<StoredSub>();
 return deliver(env,rows.results||[],"❤️ Notification de test","Tes notifications fonctionnent si tu vois ce message sur ton téléphone.","home");
}
