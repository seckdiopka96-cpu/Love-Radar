import type {D1Database} from "@cloudflare/workers-types";

/** D1-backed atomic limits, shared by all Cloudflare isolates and couples.
 * Remote IPs are never stored: a random D1 salt hashes them to an opaque actor.
 */
export type LimitRule={scope:string;max:number;windowMs:number};
export const PUBLIC_LIMITS={
 create:{scope:"create-room",max:8,windowMs:60*60*1000},
 join:{scope:"join-room",max:20,windowMs:15*60*1000},
 recover:{scope:"recover-account",max:8,windowMs:15*60*1000}
} as const satisfies Record<string,LimitRule>;
export const MEMBER_LIMITS={
 message:{scope:"text-message",max:65,windowMs:60*1000},
 reaction:{scope:"message-reaction",max:90,windowMs:60*1000},
 media:{scope:"upload-media",max:20,windowMs:10*60*1000},
 call:{scope:"new-call",max:8,windowMs:5*60*1000},
 challenge:{scope:"game-challenge",max:30,windowMs:5*60*1000}
} as const satisfies Record<string,LimitRule>;

let ready:Promise<void>|null=null;
async function ensureLimits(db:D1Database){
 if(!ready)ready=(async()=>{
  await db.exec(
   "CREATE TABLE IF NOT EXISTS abuse_salt (id INTEGER PRIMARY KEY CHECK(id=1),secret TEXT NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS abuse_counters ("+
   "scope TEXT NOT NULL,actor TEXT NOT NULL,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL,"+
   "PRIMARY KEY(scope,actor))"
  );
  const salt=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,"0")).join("");
  await db.prepare("INSERT OR IGNORE INTO abuse_salt(id,secret) VALUES(1,?)").bind(salt).run();
 })().catch(error=>{ready=null;throw error});
 await ready;
}
async function opaqueActor(db:D1Database,request:Request){
 const salt=await db.prepare("SELECT secret FROM abuse_salt WHERE id=1").first<{secret:string}>();
 if(!salt)throw Error("Abuse salt unavailable");
 // Cloudflare supplies CF-Connecting-IP; do not trust a user-set X-Forwarded-For.
 const ip=request.headers.get("CF-Connecting-IP")||"missing-ip:"+request.headers.get("User-Agent")?.slice(0,130);
 const content=new TextEncoder().encode(salt.secret+":"+ip);
 const bytes=await crypto.subtle.digest("SHA-256",content);
 return "ip:"+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
}
export async function consumeLimit(db:D1Database,actor:string,rule:LimitRule,now=Date.now()){
 await ensureLimits(db);
 const expiry=now+rule.windowMs;
 const result=await db.prepare(
  "INSERT INTO abuse_counters(scope,actor,hits,expires_at) VALUES(?,?,1,?)"+
  " ON CONFLICT(scope,actor) DO UPDATE SET"+
  " hits=CASE WHEN abuse_counters.expires_at<=? THEN 1 ELSE abuse_counters.hits+1 END,"+
  " expires_at=CASE WHEN abuse_counters.expires_at<=? THEN ? ELSE abuse_counters.expires_at END"+
  " WHERE abuse_counters.expires_at<=? OR abuse_counters.hits<?"
 ).bind(rule.scope,actor,expiry,now,now,expiry,now,rule.max).run();
 // A capped counter has no update; legitimate clients receive HTTP 429.
 return result.meta.changes===1;
}
export async function consumePublicLimit(db:D1Database,request:Request,rule:LimitRule){
 await ensureLimits(db);
 return consumeLimit(db,await opaqueActor(db,request),rule);
}
export async function consumeMemberLimit(db:D1Database,memberId:string,rule:LimitRule){
 return consumeLimit(db,"member:"+memberId,rule);
}
export function throttled(rule:LimitRule){
 return Response.json({ok:false,error:"Trop de tentatives. Réessaie dans quelques minutes."},
  {status:429,headers:{"Cache-Control":"no-store","Retry-After":String(Math.ceil(rule.windowMs/1000))}});
}
