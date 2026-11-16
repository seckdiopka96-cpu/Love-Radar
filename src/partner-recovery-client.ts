import {apiFetch} from "./api";
import {loadRecoveredRoomKey,saveRecoveredRoomKey,unwrapRoomKeyFromPartner,validPublicKey,fingerprint,verifyPartner,
 type RecoveryWrapInfo,type RoomKeyBinding} from "./e2ee";
import {persistSessionToken} from "./session-persistence";

type Pending={
 id:string;claimSecret:string;verifyCode:string;candidateToken:string;
 ephemeralPrivate:CryptoKey;ephemeralPublic:string;expiresAt:number;
};
type ResponseData={ok:boolean;error?:string;id?:string;claimSecret?:string;verifyCode?:string;expiresAt?:number;
 status?:string;roomId?:string;memberId?:string;sponsorId?:string;sponsorPublic?:string|null;
 minePublic?:string|null;envelope?:string|null;required?:boolean;ephemeralPublic?:string;partner?:string;code?:string};
const DB="love-radar-partner-recovery-v1";
const STORE="private-pending";
const KEY="pending";
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SECRET=/^[0-9A-F]{32}$/;
const token=()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return [...bytes].map(c=>c.toString(16).padStart(2,"0")).join("");
};
function base64url(bytes:Uint8Array){
 let string="";for(const b of bytes)string+=String.fromCharCode(b);
 return btoa(string).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function dbOpen():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error("Stockage de récupération indisponible."));
 });
}
async function dbWrite(value:Pending|null){
 const db=await dbOpen();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite");
   if(value)tx.objectStore(STORE).put(value,KEY);else tx.objectStore(STORE).delete(KEY);
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close()}
}
export async function getPartnerClaim():Promise<Pending|null>{
 const db=await dbOpen();
 try{
  return await new Promise((resolve,reject)=>{
   const req=db.transaction(STORE,"readonly").objectStore(STORE).get(KEY);
   req.onsuccess=()=>{
    const result=req.result as Pending|null;
    resolve(result&&UUID.test(result.id)&&SECRET.test(result.claimSecret)&&
     result.expiresAt>Date.now()&&validPublicKey(result.ephemeralPublic)?result:null);
   };
   req.onerror=()=>reject(req.error);
  });
 }finally{db.close()}
}
async function post(action:string,body:object={},bearer?:string):Promise<ResponseData>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await apiFetch("/api/partner-recovery",{method:"POST",headers:{"Content-Type":"application/json",
   ...(bearer?{Authorization:"Bearer "+bearer}:{})},body:JSON.stringify({action,...body}),signal:controller.signal,cache:"no-store"});
  const response=await res.json() as ResponseData;
  if(!res.ok||!response.ok)throw Error(response.error||"La récupération est indisponible.");
  return response;
 }finally{clearTimeout(timeout)}
}
export async function createPartnerGrant(bearer:string){
 const result=await post("start",{},bearer);
 if(!result.id||!result.code||!result.partner||!result.expiresAt)throw Error("Réponse de récupération incomplète.");
 return {id:result.id,code:result.code,partner:result.partner,expiresAt:result.expiresAt,required:!!result.required};
}
export async function pendingPartnerGrant(bearer:string){return post("pending",{},bearer)}
export async function cancelPartnerGrant(bearer:string,id:string){return post("cancel",{id},bearer)}
export async function approvePartnerGrant(bearer:string,id:string,verifyCode:string,envelope:string|null){
 return post("approve",{id,verifyCode,envelope},bearer);
}
export async function beginPartnerClaim(grantCode:string):Promise<Pending>{
 const clean=grantCode.replace(/[\s-]/g,"").trim().toUpperCase();
 if(!SECRET.test(clean))throw Error("Demande un code temporaire à ton partenaire connecté.");
 const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]) as CryptoKeyPair;
 const ephemeralPublic=base64url(new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey)));
 const candidateToken=token();
 const bytes=new TextEncoder().encode(candidateToken);
 const candidateHash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
  .map(v=>v.toString(16).padStart(2,"0")).join("");
 const data=await post("claim",{code:clean,candidateHash,ephemeralPublic});
 if(!data.id||!data.claimSecret||!data.verifyCode||!data.expiresAt)
  throw Error("Demande de récupération incomplète.");
 const pending:Pending={id:data.id,claimSecret:data.claimSecret,verifyCode:data.verifyCode,
  candidateToken,ephemeralPrivate:pair.privateKey,ephemeralPublic,expiresAt:data.expiresAt};
 await dbWrite(pending);
 return pending;
}
export async function finishPartnerClaim(pending:Pending):Promise<{status:string;token?:string;restoredHistory?:boolean}>{
 if(pending.expiresAt<Date.now())throw Error("La demande a expiré. Demande un nouveau code.");
 const response=await post("status",{id:pending.id,claimSecret:pending.claimSecret});
 if(response.status!=="approved")return {status:response.status||"claimed"};
 if(!response.roomId||!response.memberId||!response.sponsorId)
  throw Error("Compte récupéré incomplet.");
 if(response.envelope){
  if(!response.sponsorPublic||!response.minePublic||
   !validPublicKey(response.sponsorPublic)||!validPublicKey(response.minePublic))
   throw Error("Clés de la conversation manquantes.");
  const info:RecoveryWrapInfo={id:pending.id,roomId:response.roomId,
   sponsorId:response.sponsorId,targetId:response.memberId,ephemeralPublic:pending.ephemeralPublic};
  const raw=await unwrapRoomKeyFromPartner(pending.ephemeralPrivate,response.sponsorPublic,info,response.envelope);
  const binding:RoomKeyBinding={roomId:response.roomId,mineId:response.memberId,partnerId:response.sponsorId,
   minePublicKey:response.minePublic,partnerPublicKey:response.sponsorPublic};
  try{await saveRecoveredRoomKey(binding,raw)}finally{raw.fill(0)}
  const trust=await fingerprint(response.sponsorPublic);
  verifyPartner(response.roomId,response.sponsorId,trust);
  if(!await loadRecoveredRoomKey(binding))throw Error("Impossible de conserver la clé récupérée.");
 }
 persistSessionToken(pending.candidateToken);
 // Retain pending in case the app is killed before first successful refresh.
 return {status:"approved",token:pending.candidateToken,restoredHistory:!!response.envelope};
}
export async function clearPartnerClaim(){await dbWrite(null)}
