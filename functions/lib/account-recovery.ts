import type {D1Database} from "@cloudflare/workers-types";

/** Recovery secrets are 128 random bits, shown once and stored only as hashes. */
export function generateRecoveryCode():string{
 const bytes=new Uint8Array(16);
 crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
export function normalizeRecoveryCode(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const code=value.trim().replace(/[\s-]/g,"").toUpperCase();
 return /^[0-9A-F]{32}$/.test(code)?code:null;
}
export function formatRecoveryCode(code:string):string{
 return (code.match(/.{1,8}/g)||[]).join("-");
}
export async function recoveryHash(code:string):Promise<string>{
 const input=new TextEncoder().encode("love-radar-recovery-v1:"+code);
 const hash=await crypto.subtle.digest("SHA-256",input);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
let ready:Promise<void>|null=null;
export async function ensureRecoveryCodes(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS member_recovery ("+
  "member_id TEXT PRIMARY KEY,code_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL)"
 ).then(()=>{}).catch(error=>{ready=null;throw error});
 await ready;
}
export async function saveRecoveryCode(db:D1Database,memberId:string,code:string){
 await ensureRecoveryCodes(db);
 const hash=await recoveryHash(code);
 await db.prepare("INSERT INTO member_recovery(member_id,code_hash,created_at) VALUES(?,?,?)"+
  " ON CONFLICT(member_id) DO UPDATE SET code_hash=excluded.code_hash,created_at=excluded.created_at")
  .bind(memberId,hash,Date.now()).run();
}
export function generateSessionToken():string{
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
export async function sessionHash(secret:string):Promise<string>{
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
/** One transaction: both the session and the recovery secret rotate, or neither does. */
export async function redeemRecoveryCode(db:D1Database,code:string){
 await ensureRecoveryCodes(db);
 const prior=await recoveryHash(code);
 const found=await db.prepare("SELECT member_id FROM member_recovery WHERE code_hash=?")
  .bind(prior).first<{member_id:string}>();
 if(!found)return null;
 const nextCode=generateRecoveryCode(),newCodeHash=await recoveryHash(nextCode);
 const nextToken=generateSessionToken(),tokenHash=await sessionHash(nextToken);
 const results=await db.batch([
  db.prepare("UPDATE members SET token_hash=? WHERE id=? AND EXISTS"+
   " (SELECT 1 FROM member_recovery WHERE member_id=? AND code_hash=?)")
   .bind(tokenHash,found.member_id,found.member_id,prior),
  db.prepare("UPDATE member_recovery SET code_hash=?,created_at=? WHERE member_id=? AND code_hash=?")
   .bind(newCodeHash,Date.now(),found.member_id,prior)
 ]);
 if(results[0].meta.changes!==1||results[1].meta.changes!==1)return null;
 return {memberId:found.member_id,token:nextToken,recoveryCode:nextCode};
}
