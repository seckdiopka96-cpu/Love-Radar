import type { D1Database } from "@cloudflare/workers-types";
import { validPushEndpoint } from "../lib/push";

type Env = {DB?:D1Database; VAPID_PUBLIC_KEY?:string;VAPID_PRIVATE_KEY?:string};
type Context = {request:Request; env:Env};
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const yes=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});

async function memberFromRequest(request:Request, db:D1Database) {
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<{id:string,room_id:string}>();
}

export const onRequestGet=({env}:Context)=>
 yes({enabled:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),publicKey:env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY?env.VAPID_PUBLIC_KEY:null});

export async function onRequestPost({request,env}:Context) {
 try {
  const db=env.DB;
  if(!db)return no("La base de données est indisponible.",503);
  const member=await memberFromRequest(request,db);
  if(!member)return no("Connecte-toi d’abord à ton espace.",401);
  const raw=await request.text();
  if(raw.length>5500)return no("Demande trop volumineuse.",413);
  const data=JSON.parse(raw) as Record<string,unknown>;
  const op=data.action;
  if(op==="subscribe") {
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return no("Les notifications ne sont pas encore configurées sur Cloudflare.",503);
    const s=data.subscription as Record<string,unknown>|undefined;
    const keys=s?.keys as Record<string,unknown>|undefined;
    const endpoint=String(s?.endpoint||""),p256dh=String(keys?.p256dh||""),auth=String(keys?.auth||"");
    if(!validPushEndpoint(endpoint)||!/^[A-Za-z0-9_-]{80,120}$/.test(p256dh)||!/^[A-Za-z0-9_-]{16,48}$/.test(auth))
      return no("Abonnement de notification invalide.");
    await db.prepare(
     "INSERT INTO push_subscriptions(id,room_id,member_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET room_id=excluded.room_id,member_id=excluded.member_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=excluded.created_at"
    ).bind(crypto.randomUUID(),member.room_id,member.id,endpoint,p256dh,auth,Date.now()).run();
    return yes({subscribed:true});
  }
  if(op==="unsubscribe") {
    const endpoint=String(data.endpoint||"");
    if(!validPushEndpoint(endpoint))return no("Abonnement invalide.");
    await db.prepare("DELETE FROM push_subscriptions WHERE member_id=? AND endpoint=?").bind(member.id,endpoint).run();
    return yes({subscribed:false});
  }
  return no("Action inconnue.",404);
 }catch(e){console.error("Love Radar push subscription",e);return no("Impossible d’enregistrer les notifications. Vérifie la table push_subscriptions.",500)}
}
