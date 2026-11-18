import type {D1Database} from "@cloudflare/workers-types";
import {ensurePlus,stripeFetch,subscriptionEnd,verifyStripeSignature,type StripeEnv} from "../lib/plus-plan";

type Ctx={request:Request;env:StripeEnv};
type StripeSub={
 id?:string;status?:string;customer?:string|{id?:string};
 metadata?:{room_id?:string};current_period_end?:number;
 cancel_at_period_end?:boolean;items?:{data?:Array<{current_period_end?:number}>};
};
type StripeEvent={id?:string;type?:string;created?:number;data?:{object?:StripeSub&{subscription?:string;client_reference_id?:string}}};
const reply=(ok:boolean,status=200)=>Response.json({ok},{status,headers:{"Cache-Control":"no-store"}});
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

async function updateSubscription(db:D1Database,sub:StripeSub,eventCreated:number){
 const roomId=sub.metadata?.room_id;
 if(!roomId||!UUID.test(roomId)||!sub.id||!/^sub_[a-zA-Z0-9]+$/.test(sub.id))return;
 const room=await db.prepare("SELECT id FROM rooms WHERE id=?").bind(roomId).first<{id:string}>();
 if(!room)return; // Deleted rooms must never regain a subscription record.
 const customer=typeof sub.customer==="string"?sub.customer:sub.customer?.id;
 if(!customer||!/^cus_[a-zA-Z0-9]+$/.test(customer))return;
 const status=String(sub.status||"incomplete");
 const periodEnd=subscriptionEnd(sub as Record<string,unknown>);
 const cancel=sub.cancel_at_period_end===true?1:0;
 await db.prepare(
  "INSERT INTO room_plus(room_id,customer_id,subscription_id,status,period_end,cancel_at_period_end,event_created)"+
  " VALUES(?,?,?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET"+
  " customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,"+
  " status=excluded.status,period_end=excluded.period_end,"+
  " cancel_at_period_end=excluded.cancel_at_period_end,event_created=excluded.event_created"+
  " WHERE excluded.event_created>=room_plus.event_created"
 ).bind(roomId,customer,sub.id,status,periodEnd,cancel,eventCreated).run();
}

/** Access is unlocked only here, after a verified Stripe event. No client action can grant Plus. */
export async function onRequestPost({request,env}:Ctx):Promise<Response>{
 try{
  if(!env.DB||!env.STRIPE_WEBHOOK_SECRET)return reply(false,503);
  const raw=await request.text();
  if(raw.length>200000)return reply(false,413);
  const signed=await verifyStripeSignature(raw,request.headers.get("Stripe-Signature"),env.STRIPE_WEBHOOK_SECRET);
  if(!signed)return reply(false,400);
  const event=JSON.parse(raw) as StripeEvent;
  if(!event.id||!event.type||!event.data?.object||!Number.isInteger(event.created))return reply(false,400);
  await ensurePlus(env.DB);
  const obj=event.data.object;
  if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
   // Signed events contain the room ID from Checkout's subscription_data.metadata.
   // Fetch current Stripe state to avoid late out-of-order webhook reactivation.
   if(!obj.id||!env.STRIPE_SECRET_KEY)return reply(false,503);
   let latest:StripeSub;
   if(event.type==="customer.subscription.deleted")latest={...obj,status:"canceled"};
   else latest=await stripeFetch(env,"GET","subscriptions/"+encodeURIComponent(obj.id)) as StripeSub;
   await updateSubscription(env.DB,latest,Math.floor(Date.now()/1000));
  }
  if(event.type==="checkout.session.completed"){
   const roomId=obj.client_reference_id||obj.metadata?.room_id;
   if(roomId&&UUID.test(roomId)&&typeof obj.subscription==="string"&&env.STRIPE_SECRET_KEY){
    const latest=await stripeFetch(env,"GET","subscriptions/"+encodeURIComponent(obj.subscription)) as StripeSub;
    if(latest.metadata?.room_id===roomId)
     await updateSubscription(env.DB,latest,Math.floor(Date.now()/1000));
   }
  }
  return reply(true);
 }catch(error){console.error("Stripe webhook rejected or deferred",error);return reply(false,503)}
}
