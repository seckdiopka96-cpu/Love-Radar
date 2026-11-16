import type {D1Database} from "@cloudflare/workers-types";

/** Public-only directory. The server never receives private ECDH keys. */
let ready:Promise<void>|null=null;
export async function ensureE2EEKeys(db:D1Database):Promise<void>{
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS e2ee_keys ("+
  "member_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, public_key TEXT NOT NULL, created_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_e2ee_room ON e2ee_keys(room_id)"
 ).then(()=>{}).catch(err=>{ready=null;throw err});
 await ready;
}
export type PublicKeyRow={member_id:string;public_key:string};
export async function roomPublicKeys(db:D1Database,roomId:string):Promise<PublicKeyRow[]>{
 await ensureE2EEKeys(db);
 const results=await db.prepare("SELECT k.member_id,k.public_key FROM e2ee_keys k JOIN members m ON m.id=k.member_id WHERE k.room_id=? AND m.room_id=?")
  .bind(roomId,roomId).all<PublicKeyRow>();
 return results.results||[];
}
export async function requiresE2EE(db:D1Database,roomId:string):Promise<boolean>{
 const keys=await roomPublicKeys(db,roomId);
 return keys.length===2;
}
export const ENCRYPTED_TEXT_PREFIX="lre1.";
export const ENCRYPTED_MEDIA_MIME="application/x-love-radar-e2ee";
export function encryptedText(value:string):boolean{
 return /^lre1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,12000}$/.test(value);
}
export function validPublicKey(key:unknown):key is string{
 return typeof key==="string"&&/^[A-Za-z0-9_-]{87}$/.test(key)&&key.startsWith("B");
}
