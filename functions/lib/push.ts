import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { D1Database } from "@cloudflare/workers-types";

export type PushEnv = {
  DB?: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

export function validPushEndpoint(raw:string): boolean {
  try {
    const u=new URL(raw);
    const host=u.hostname.toLowerCase();
    return u.protocol==="https:" && !u.username && !u.password && !u.port && raw.length<2048 && (
      host==="fcm.googleapis.com" || host==="fcm-xm.googleapis.com" ||
      host==="updates.push.services.mozilla.com" ||
      host==="notify.windows.com" || host.endsWith(".notify.windows.com") ||
      host==="push.apple.com" || host.endsWith(".push.apple.com")
    );
  } catch {return false;}
}

type StoredSub={endpoint:string,p256dh:string,auth:string};

export async function notifyPartner(
  env:PushEnv,
  roomId:string,
  fromId:string,
  title:string,
  body:string,
  tab:"chat"|"home"="chat"
): Promise<void> {
  if(!env.DB || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)return;
  try {
    const result=await env.DB.prepare(
      "SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE room_id=? AND member_id<>? LIMIT 12"
    ).bind(roomId,fromId).all<StoredSub>();
    if(!result.results?.length)return;
    const vapid={
      subject:env.VAPID_SUBJECT||"https://love-radar-acd.pages.dev/",
      publicKey:env.VAPID_PUBLIC_KEY,
      privateKey:env.VAPID_PRIVATE_KEY
    };
    const data=JSON.stringify({title,body,tab,url:"/?tab="+tab,kind:tab==="chat"?"message":"notice"});
    await Promise.allSettled(result.results.filter(s=>validPushEndpoint(s.endpoint)).map(async sub=>{
      try{
        const payload=await buildPushPayload(
          {data,options:{ttl:7200,urgency:"normal"}},
          {endpoint:sub.endpoint,expirationTime:null,keys:{p256dh:sub.p256dh,auth:sub.auth}},
          vapid
        );
        const response=await fetch(sub.endpoint,{...payload,signal:AbortSignal.timeout(8000)});
        if(response.status===404||response.status===410)
          await env.DB!.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").bind(sub.endpoint).run();
        if(!response.ok)console.error("Love Radar push endpoint response",response.status);
      }catch(e){console.error("Love Radar push error",e);}
    }));
  }catch(e){console.error("Love Radar push delivery failed",e);}
}
