import type {D1Database} from "@cloudflare/workers-types";

/** One Stripe subscription belongs to a private room, so both partners share Plus. */
export type PlusRow={
 room_id:string;customer_id:string|null;subscription_id:string|null;
 status:string;period_end:number;cancel_at_period_end:number;event_created:number;
};
export const PLUS_CENTS=399;
export const PLUS_CURRENCY="usd";
export function plusActive(row:PlusRow|null|undefined,now=Math.floor(Date.now()/1000)){
 return Boolean(row&&["active","trialing"].includes(row.status)&&row.period_end>now);
}
export async function ensurePlus(db:D1Database){
 await db.exec("CREATE TABLE IF NOT EXISTS room_plus ("+
  "room_id TEXT PRIMARY KEY, customer_id TEXT, subscription_id TEXT,"+
  "status TEXT NOT NULL DEFAULT 'inactive',period_end INTEGER NOT NULL DEFAULT 0,"+
  "cancel_at_period_end INTEGER NOT NULL DEFAULT 0,event_created INTEGER NOT NULL DEFAULT 0)");
}
export async function getPlus(db:D1Database,roomId:string):Promise<PlusRow|null>{
 await ensurePlus(db);
 return db.prepare("SELECT room_id,customer_id,subscription_id,status,period_end,cancel_at_period_end,event_created"+
  " FROM room_plus WHERE room_id=?").bind(roomId).first<PlusRow>();
}
export async function authorizedMember(req:Request,db:D1Database):Promise<{id:string;room_id:string}|null>{
 const header=req.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<{id:string;room_id:string}>();
}
export type StripeEnv={DB:D1Database;STRIPE_SECRET_KEY?:string;STRIPE_PRICE_ID?:string;STRIPE_WEBHOOK_SECRET?:string};
export async function stripeFetch(env:StripeEnv,method:"GET"|"POST",path:string,form?:URLSearchParams){
 if(!env.STRIPE_SECRET_KEY)throw Error("Stripe isn't configured");
 const response=await fetch("https://api.stripe.com/v1/"+path,{
  method,headers:{"Authorization":"Bearer "+env.STRIPE_SECRET_KEY,
   ...(form?{"Content-Type":"application/x-www-form-urlencoded"}:{})},
  ...(form?{body:form.toString()}:{})
 });
 const body=await response.json() as {id?:string;url?:string;object?:string;
  unit_amount?:number;currency?:string;active?:boolean;recurring?:{interval?:string};
  error?:{message?:string};[key:string]:unknown};
 if(!response.ok)throw Error("Stripe API unavailable ("+response.status+")");
 return body;
}
export function subscriptionEnd(sub:Record<string,unknown>){
 const direct=Number(sub.current_period_end)||0;
 if(direct>0)return direct;
 const items=sub.items as {data?:Array<{current_period_end?:number}>}|undefined;
 return Number(items?.data?.[0]?.current_period_end)||0;
}
export function isSafeStripeCheckoutUrl(value:unknown){
 if(typeof value!=="string")return false;
 try{
  const url=new URL(value);
  return url.protocol==="https:"&&(url.hostname==="checkout.stripe.com"||url.hostname.endsWith(".checkout.stripe.com"));
 }catch{return false}
}
/** Stripe webhooks must be verified on the raw request bytes, never parsed JSON. */
export async function verifyStripeSignature(payload:string,header:string|null,secret:string,now=Math.floor(Date.now()/1000)){
 if(!header||!secret)return false;
 const timestamp=Number(header.split(",").find(part=>part.trim().startsWith("t="))?.trim().slice(2));
 if(!Number.isInteger(timestamp)||Math.abs(now-timestamp)>300)return false;
 const candidates=header.split(",").map(part=>part.trim())
  .filter(part=>/^v1=[0-9a-f]{64}$/i.test(part)).map(part=>part.slice(3).toLowerCase());
 if(!candidates.length)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const hmac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+payload));
 const actual=[...new Uint8Array(hmac)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
 let valid=0;
 for(const candidate of candidates){
  let diff=0;
  for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^candidate.charCodeAt(i);
  valid|=Number(diff===0);
 }
 return valid===1;
}
