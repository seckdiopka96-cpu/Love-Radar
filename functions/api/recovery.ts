import type {D1Database} from "@cloudflare/workers-types";
import {consumePublicLimit,consumeMemberLimit,PUBLIC_LIMITS,MEMBER_LIMITS,throttled} from "../lib/abuse-limits";
import {ensureRecoveryCodes,generateRecoveryCode,saveRecoveryCode,normalizeRecoveryCode,
 redeemRecoveryCode,sessionHash} from "../lib/account-recovery";

type Env={DB?:D1Database};
type Context={request:Request;env:Env};
const no=(error:string,status=400)=>Response.json({ok:false,error},
 {status,headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
const yes=(data:object)=>Response.json({ok:true,...data},
 {headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
async function getMember(request:Request,db:D1Database){
 const raw=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(raw))return null;
 const digest=await sessionHash(raw.slice(7));
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?")
  .bind(digest).first<{id:string;room_id:string}>();
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 try{
  const db=env.DB;
  if(!db)return no("Service indisponible.",503);
  if(Number(request.headers.get("content-length")||0)>1000)return no("Demande trop volumineuse.",413);
  const raw=await request.text();
  if(raw.length>1000)return no("Demande trop volumineuse.",413);
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw)}catch{return no("Demande incorrecte.")}
  const action=body.action;
  if(action==="issue"){
   const member=await getMember(request,db);
   if(!member)return no("Session expirée.",401);
   if(!await consumeMemberLimit(db,member.id,MEMBER_LIMITS.recoveryIssue))return throttled(MEMBER_LIMITS.recoveryIssue);
   const code=generateRecoveryCode();
   await saveRecoveryCode(db,member.id,code);
   return yes({recoveryCode:code});
  }
  if(action==="recover"){
   if(!await consumePublicLimit(db,request,PUBLIC_LIMITS.recover))return throttled(PUBLIC_LIMITS.recover);
   const code=normalizeRecoveryCode(body.code);
   if(!code)return no("Code de secours incorrect ou déjà utilisé.",400);
   const restored=await redeemRecoveryCode(db,code);
   if(!restored)return no("Code de secours incorrect ou déjà utilisé.",400);
   // Revoke all old device pushes: old phones must not keep receiving previews.
   // Older deployments without push configured may not have this optional table.
   try{await db.prepare("DELETE FROM push_subscriptions WHERE member_id=?")
    .bind(restored.memberId).run()}
   catch(error){console.error("Recovery push cleanup",error)}
   return yes({token:restored.token,recoveryCode:restored.recoveryCode});
  }
  return no("Action inconnue.",404);
 }catch(error){console.error("Love Radar recovery",error);return no("Récupération indisponible. Réessaie.",503)}
}
