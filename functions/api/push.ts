import type { D1Database } from "@cloudflare/workers-types";
import {validPushEndpoint,sendTestPush,type PushEnv} from "../lib/push";

type Env = PushEnv;
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
  if(op==="status"){
    const endpoint=String(data.endpoint||"");
    if(!validPushEndpoint(endpoint))return yes({registered:false});
    const row=await db.prepare("SELECT 1 AS found FROM push_subscriptions WHERE room_id=? AND member_id=? AND endpoint=? LIMIT 1")
     .bind(member.room_id,member.id,endpoint).first();
    return yes({registered:Boolean(row)});
  }
  if(op==="test"){
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return no("La configuration des notifications manque sur Cloudflare.",503);
    await db.exec("CREATE TABLE IF NOT EXISTS push_test_throttle(member_id TEXT PRIMARY KEY,last_test_at INTEGER NOT NULL)");
    const now=Date.now();
    const allowed=await db.prepare("INSERT INTO push_test_throttle(member_id,last_test_at) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET last_test_at=excluded.last_test_at WHERE push_test_throttle.last_test_at<?")
     .bind(member.id,now,now-60000).run();
    if(allowed.meta.changes!==1)return no("Attends une minute avant de renvoyer un test.",429);
    const report=await sendTestPush(env,member.room_id,member.id);
    if(!report.registered)return no("Aucun téléphone n'est enregistré. Appuie sur Réparer les notifications.",409);
    if(!report.accepted)return no("Le service de notifications a refusé l'envoi. Essaie de réparer l'abonnement.",502);
    return yes({testSent:true,accepted:report.accepted,failed:report.failed});
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
