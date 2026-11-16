import type {D1Database} from "@cloudflare/workers-types";
import {sessionHash,generateSessionToken} from "../lib/account-recovery";
import {roomPublicKeys,validateP256PublicKey} from "../lib/e2ee";
import {consumePublicLimit,consumeMemberLimit,throttled} from "../lib/abuse-limits";
import {markRoomChanged} from "../lib/room-revision";

type Env={DB?:D1Database};
type Context={request:Request;env:Env};
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:object)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
const AUTH=/^Bearer [a-f0-9]{64}$/;
const ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SECRET=/^[0-9A-F]{32}$/;
const TOKEN_HASH=/^[a-f0-9]{64}$/;
const TTL=15*60_000;
const STATUS_LIMIT={scope:"partner-recovery-poll",max:320,windowMs:15*60_000};
const CLAIM_LIMIT={scope:"partner-recovery-claim",max:8,windowMs:15*60_000};
const START_LIMIT={scope:"partner-recovery-create",max:5,windowMs:60*60_000};
const APPROVAL_LIMIT={scope:"partner-recovery-approve",max:10,windowMs:60*60_000};
type Member={id:string;room_id:string;name:string;seat:number};
type Grant={id:string;room_id:string;sponsor_id:string;target_id:string;grant_hash:string;claim_hash:string|null;
 candidate_hash:string|null;ephemeral_public:string|null;check_code:string|null;status:string;envelope:string|null;created_at:number;expires_at:number};
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS partner_recovery ("+
  "id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sponsor_id TEXT NOT NULL,target_id TEXT NOT NULL,"+
  "grant_hash TEXT NOT NULL UNIQUE,claim_hash TEXT,candidate_hash TEXT,ephemeral_public TEXT,"+
  "check_code TEXT,status TEXT NOT NULL,envelope TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_partner_recovery_sponsor ON partner_recovery(sponsor_id,status,expires_at)"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 await ready;
}
async function member(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!AUTH.test(header))return null;
 return db.prepare("SELECT id,room_id,name,seat FROM members WHERE token_hash=?")
  .bind(await sessionHash(header.slice(7))).first<Member>();
}
async function getGrant(db:D1Database,id:string):Promise<Grant|null>{
 return db.prepare("SELECT * FROM partner_recovery WHERE id=?").bind(id).first<Grant>();
}
function code32():string{return generateSessionToken().slice(0,32).toUpperCase()}
function checkCode():string{
 const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
 return String(bytes[0]%1_000_000).padStart(6,"0");
}
function normalized(value:unknown):string{
 return typeof value==="string"?value.trim().replace(/[\s-]/g,"").toUpperCase():"";
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 try{
  const db=env.DB;
  if(!db)return fail("Service indisponible.",503);
  if(Number(request.headers.get("content-length")||0)>2500)return fail("Demande trop volumineuse.",413);
  const raw=await request.text();
  if(raw.length>2500)return fail("Demande trop volumineuse.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw)}catch{return fail("Demande incorrecte.")}
  await ensure(db);
  const action=data.action;
  const now=Date.now();
  if(action==="start"){
   const user=await member(request,db);
   if(!user)return fail("Connexion nécessaire.",401);
   if(!await consumeMemberLimit(db,user.id,START_LIMIT))return throttled(START_LIMIT);
   const partner=await db.prepare("SELECT id,name FROM members WHERE room_id=? AND id<>? LIMIT 1")
    .bind(user.room_id,user.id).first<{id:string;name:string}>();
   if(!partner)return fail("Ton partenaire doit déjà avoir un compte dans cet espace.",409);
   const keys=await roomPublicKeys(db,user.room_id);
   const required=keys.length===2;
   if(required&&!keys.find(k=>k.member_id===user.id))return fail("Identité de chiffrement indisponible.",409);
   const id=crypto.randomUUID(),secret=code32(),digest=await sessionHash(secret),expires=now+TTL;
   await db.batch([
    db.prepare("UPDATE partner_recovery SET status='cancelled',envelope=NULL WHERE sponsor_id=? AND status IN ('issued','claimed')")
     .bind(user.id),
    db.prepare("INSERT INTO partner_recovery(id,room_id,sponsor_id,target_id,grant_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,'issued',?,?)")
     .bind(id,user.room_id,user.id,partner.id,digest,now,expires)
   ]);
   return ok({id,code:secret,partner:partner.name,expiresAt:expires,required});
  }
  if(action==="claim"){
   if(!await consumePublicLimit(db,request,CLAIM_LIMIT))return throttled(CLAIM_LIMIT);
   const secret=normalized(data.code);
   if(!SECRET.test(secret)||!TOKEN_HASH.test(String(data.candidateHash||""))||
    !await validateP256PublicKey(data.ephemeralPublic))return fail("Demande de récupération invalide.");
   const digest=await sessionHash(secret);
   const grant=await db.prepare("SELECT * FROM partner_recovery WHERE grant_hash=?")
    .bind(digest).first<Grant>();
   if(!grant||grant.status!=="issued"||grant.expires_at<now)return fail("Code expiré ou déjà utilisé.",410);
   const claimSecret=code32(),claimHash=await sessionHash(claimSecret),verify=checkCode();
   const result=await db.prepare(
    "UPDATE partner_recovery SET status='claimed',claim_hash=?,candidate_hash=?,ephemeral_public=?,check_code=?"+
    " WHERE id=? AND status='issued' AND expires_at>?"
   ).bind(claimHash,String(data.candidateHash),String(data.ephemeralPublic),verify,grant.id,now).run();
   if(result.meta.changes!==1)return fail("Ce code vient d'être utilisé.",409);
   return ok({id:grant.id,claimSecret,verifyCode:verify,expiresAt:grant.expires_at});
  }
  if(action==="status"){
   if(!await consumePublicLimit(db,request,STATUS_LIMIT))return throttled(STATUS_LIMIT);
   const id=String(data.id||""),claimSecret=normalized(data.claimSecret);
   if(!ID.test(id)||!SECRET.test(claimSecret))return fail("Demande de récupération invalide.",400);
   const grant=await getGrant(db,id);
   if(!grant||!grant.claim_hash||!grant.expires_at||grant.expires_at<now||
    grant.claim_hash!==await sessionHash(claimSecret))
    return fail("Demande expirée ou introuvable.",410);
   if(grant.status==="approved"){
    const sponsor=await db.prepare("SELECT k.public_key,m.name FROM members m LEFT JOIN e2ee_keys k ON k.member_id=m.id WHERE m.id=? AND m.room_id=?")
     .bind(grant.sponsor_id,grant.room_id).first<{public_key:string|null;name:string}>();
    const mine=await db.prepare("SELECT public_key FROM e2ee_keys WHERE member_id=? AND room_id=?")
     .bind(grant.target_id,grant.room_id).first<{public_key:string}>();
    return ok({status:"approved",roomId:grant.room_id,memberId:grant.target_id,
     sponsorId:grant.sponsor_id,sponsorPublic:sponsor?.public_key||null,
     minePublic:mine?.public_key||null,envelope:grant.envelope});
   }
   return ok({status:grant.status,verifyCode:grant.check_code,expiresAt:grant.expires_at});
  }
  if(action==="pending"){
   const user=await member(request,db);
   if(!user)return fail("Connexion nécessaire.",401);
   const grant=await db.prepare("SELECT * FROM partner_recovery WHERE sponsor_id=? AND room_id=? AND status IN ('issued','claimed') AND expires_at>? ORDER BY created_at DESC LIMIT 1")
    .bind(user.id,user.room_id,now).first<Grant>();
   if(!grant)return ok({status:"none"});
   const target=await db.prepare("SELECT name FROM members WHERE id=? AND room_id=?")
    .bind(grant.target_id,user.room_id).first<{name:string}>();
   return ok({status:grant.status,id:grant.id,partner:target?.name||"Ton partenaire",
    verifyCode:grant.status==="claimed"?grant.check_code:null,ephemeralPublic:grant.status==="claimed"?grant.ephemeral_public:null,
    expiresAt:grant.expires_at,required:(await roomPublicKeys(db,user.room_id)).length===2});
  }
  if(action==="approve"||action==="cancel"){
   const user=await member(request,db);
   if(!user)return fail("Connexion nécessaire.",401);
   if(!await consumeMemberLimit(db,user.id,APPROVAL_LIMIT))return throttled(APPROVAL_LIMIT);
   const id=String(data.id||"");
   if(!ID.test(id))return fail("Demande incorrecte.",400);
   const grant=await getGrant(db,id);
   if(!grant||grant.sponsor_id!==user.id||grant.room_id!==user.room_id||
    grant.expires_at<now||!["issued","claimed"].includes(grant.status))
    return fail("Demande expirée ou non autorisée.",410);
   if(action==="cancel"){
    await db.prepare("UPDATE partner_recovery SET status='cancelled',envelope=NULL WHERE id=? AND sponsor_id=? AND status IN ('issued','claimed')")
     .bind(id,user.id).run();
    return ok({cancelled:true});
   }
   if(grant.status!=="claimed"||!grant.candidate_hash||!grant.claim_hash||!grant.ephemeral_public)
    return fail("Attends que ton partenaire demande sa récupération.",409);
   if(data.verifyCode!==grant.check_code)return fail("Vérifie le code à six chiffres avec ton partenaire.",403);
   const keys=await roomPublicKeys(db,grant.room_id);
   const required=keys.length===2;
   const envelope=required?String(data.envelope||""):null;
   if(required&&(!envelope||envelope.length>1600||
     !/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,1500}$/.test(envelope)))
    return fail("Transfert chiffré des anciens messages obligatoire.",400);
   // A single D1 transaction: the existing member's token hash is swapped,
   // and the one-time request is consumed. Never create a new member/room.
   const hasPush=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='push_subscriptions'")
    .first<{name:string}>();
   const transaction=[
    db.prepare("UPDATE members SET token_hash=? WHERE id=? AND room_id=? AND EXISTS "+
     "(SELECT 1 FROM partner_recovery WHERE id=? AND sponsor_id=? AND target_id=? AND status='claimed' AND expires_at>?)")
      .bind(grant.candidate_hash,grant.target_id,grant.room_id,id,user.id,grant.target_id,now),
    db.prepare("UPDATE partner_recovery SET status='approved',envelope=? WHERE id=? AND sponsor_id=? AND status='claimed' AND expires_at>?")
      .bind(envelope,id,user.id,now)
   ];
   // Old-device push previews must be revoked in the SAME transaction.
   // Historical installations may not yet have enabled push subscriptions.
   if(hasPush)transaction.push(db.prepare("DELETE FROM push_subscriptions WHERE member_id=?")
    .bind(grant.target_id));
   const changes=await db.batch(transaction);
   if(changes[0].meta.changes!==1||changes[1].meta.changes!==1)
    return fail("Demande déjà utilisée ou expirée.",409);
   await markRoomChanged(db,grant.room_id);
   return ok({approved:true});
  }
  return fail("Action inconnue.",404);
 }catch(error){
  console.error("Partner recovery error",error);
  return fail("Récupération indisponible. Réessaie.",503);
 }
}
