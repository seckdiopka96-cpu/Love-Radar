import type {D1Database} from "@cloudflare/workers-types";
import {authorizedMember,ensurePlus,getPlus,plusActive,PLUS_CENTS,PLUS_CURRENCY,
 stripeFetch,isSafeStripeCheckoutUrl,type StripeEnv} from "../lib/plus-plan";

type Context={request:Request;env:StripeEnv};
const json=(data:Record<string,unknown>,status=200)=>Response.json(data,
 {status,headers:{"Cache-Control":"private, no-store"}});
const fail=(error:string,status=400)=>json({ok:false,error},status);
const ORIGIN="https://love-radar-acd.pages.dev";

async function authenticated(request:Request,env:StripeEnv){
 if(!env.DB)return null;
 return authorizedMember(request,env.DB);
}

export async function onRequestGet({request,env}:Context):Promise<Response>{
 try{
  const u=await authenticated(request,env);
  if(!u)return fail("Reconnecte-toi pour consulter Love Radar Plus.",401);
  const row=await getPlus(env.DB,u.room_id);
  return json({ok:true,active:plusActive(row),status:row?.status||"free",
   cancelAtPeriodEnd:row?.cancel_at_period_end===1,periodEnd:row?.period_end||0,
   monthlyCents:PLUS_CENTS,currency:PLUS_CURRENCY,
   available:Boolean(env.STRIPE_SECRET_KEY&&env.STRIPE_PRICE_ID&&env.STRIPE_WEBHOOK_SECRET)});
 }catch(e){console.error("Plus status",e);return fail("Statut Plus momentanément indisponible.",503)}
}

export async function onRequestPost({request,env}:Context):Promise<Response>{
 try{
  const u=await authenticated(request,env);
  if(!u)return fail("Reconnecte-toi.",401);
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_PRICE_ID||!env.STRIPE_WEBHOOK_SECRET)
   return fail("L'abonnement n'est pas encore disponible. Aucun paiement n'a été effectué.",503);
  const raw=await request.text();
  if(raw.length>300)return fail("Demande trop volumineuse.",413);
  let action="";
  try{action=String((JSON.parse(raw) as {action?:unknown}).action||"")}catch{return fail("Requête invalide.")}
  if(action!=="checkout"&&action!=="portal")return fail("Action inconnue.",400);
  const current=await getPlus(env.DB,u.room_id);
  if(action==="portal"){
   if(!current?.customer_id)return fail("Aucun abonnement à gérer pour ce couple.",404);
   const form=new URLSearchParams({customer:current.customer_id,return_url:ORIGIN+"/?tab=plus"});
   const result=await stripeFetch(env,"POST","billing_portal/sessions",form);
   if(!isSafeStripeCheckoutUrl(result.url)&&
      !(typeof result.url==="string"&&result.url.startsWith("https://billing.stripe.com/")))
    return fail("Lien du portail de facturation invalide.",503);
   return json({ok:true,url:result.url});
  }
  if(plusActive(current))return fail("Votre couple profite déjà de Love Radar Plus.",409);
  // A canceled subscription still has a Stripe owner; guard against duplicate paid plans.
  if(current?.subscription_id&&current.status!=="canceled"&&current.status!=="incomplete_expired")
   return fail("Un abonnement existe déjà. Ouvre « Gérer l’abonnement » pour le vérifier.",409);

  // Reject accidentally misconfigured prices, even if Stripe accepts the ID.
  const price=await stripeFetch(env,"GET","prices/"+encodeURIComponent(env.STRIPE_PRICE_ID));
  if(price.active!==true||price.currency!==PLUS_CURRENCY||
     price.unit_amount!==PLUS_CENTS||price.recurring?.interval!=="month")
   return fail("Le tarif Stripe ne correspond pas à 3,99 $ par mois. Aucun paiement effectué.",503);

  const form=new URLSearchParams({
   mode:"subscription",
   "line_items[0][price]":env.STRIPE_PRICE_ID,
   "line_items[0][quantity]":"1",
   client_reference_id:u.room_id,
   "metadata[room_id]":u.room_id,
   "subscription_data[metadata][room_id]":u.room_id,
   success_url:ORIGIN+"/?tab=plus&plus=success",
   cancel_url:ORIGIN+"/?tab=plus&plus=cancel",
   allow_promotion_codes:"true"
  });
  if(current?.customer_id)form.set("customer",current.customer_id);
  const result=await stripeFetch(env,"POST","checkout/sessions",form);
  if(!isSafeStripeCheckoutUrl(result.url))return fail("Session de paiement invalide.",503);
  return json({ok:true,url:result.url});
 }catch(e){console.error("Plus billing",e);return fail("Paiement momentanément indisponible. Rien n'a été débité.",503)}
}
