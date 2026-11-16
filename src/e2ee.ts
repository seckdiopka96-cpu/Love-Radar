/**
 * Love Radar E2EE pilot v1.
 * Private ECDH keys live only in this device's IndexedDB, never in Cloudflare.
 * The server distributes public keys, but cannot authenticate the first exchange:
 * users MUST compare the fingerprints out of band before trusting a partner.
 *
 * The protocol is an initial interoperable pilot, NOT an independently audited
 * Signal/Double-Ratchet implementation. No forward secrecy, multi-device sync,
 * offline backup, or automatic identity-key rotation is provided.
 */
export const TEXT_PREFIX="lre1.";
export const E2EE_MEDIA_MIME="application/x-love-radar-e2ee";
const VERSION="love-radar-e2ee-v1";
const encoder=new TextEncoder(),decoder=new TextDecoder("utf-8",{fatal:true});
const MIME_ALLOWED={
 image:new Set(["image/jpeg","image/png","image/webp","image/gif"]),
 audio:new Set(["audio/webm","video/webm","audio/ogg","audio/mpeg","audio/mp4","audio/x-m4a","audio/aac"])
} as const;
export type MediaKind="image"|"audio";
export type Identity={publicKey:string;privateKey:CryptoKey};
export type CryptoContext={roomId:string;mineId:string;partnerId:string;partnerPublicKey:string;key:CryptoKey};

const bytes=(s:string)=>encoder.encode(s);
function b64url(input:Uint8Array):string{
 let binary="";
 for(let i=0;i<input.length;i+=8192)binary+=String.fromCharCode(...input.subarray(i,i+8192));
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function unb64(value:string):Uint8Array{
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error("Encodage chiffré invalide.");
 const s=value.replace(/-/g,"+").replace(/_/g,"/");
 const bin=atob(s+"=".repeat((4-s.length%4)%4));
 return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
function buffer(b:Uint8Array):ArrayBuffer{return new Uint8Array(b).buffer}
export function isEncryptedText(s:string|null|undefined):boolean{return Boolean(s?.startsWith(TEXT_PREFIX))}
export function isEncryptedMedia(mime:string|null|undefined):boolean{return mime===E2EE_MEDIA_MIME}
export function validPublicKey(value:unknown):value is string{
 return typeof value==="string"&&/^[A-Za-z0-9_-]{87}$/.test(value)&&value.startsWith("B");
}
export async function generateIdentity():Promise<Identity>{
 const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]) as CryptoKeyPair;
 const publicKey=b64url(new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey)));
 return {publicKey,privateKey:pair.privateKey};
}

/** Encrypted export: backed up only to a user-selected file, not Cloudflare. */
export type IdentityBackup={identity:Identity;encryptedBackup:string};
type BackupV1={version:"love-radar-key-backup-v1";publicKey:string;salt:string;iv:string;cipher:string;iterations:number};
const BACKUP_ITERATIONS=600_000;
async function backupKey(passphrase:string,salt:Uint8Array):Promise<CryptoKey>{
 if(passphrase.length<12||passphrase.length>256)throw Error("Choisis une phrase secrète d’au moins 12 caractères.");
 const material=await crypto.subtle.importKey("raw",buffer(bytes(passphrase)),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt:buffer(salt),iterations:BACKUP_ITERATIONS,hash:"SHA-256"},
  material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function generateIdentityWithBackup(passphrase:string):Promise<IdentityBackup>{
 // Generation key is extractable only in this temporary function, while
 // wrapping its PKCS#8 private bytes. IndexedDB receives nonextractable copy.
 const temp=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]) as CryptoKeyPair;
 const publicKey=b64url(new Uint8Array(await crypto.subtle.exportKey("raw",temp.publicKey)));
 const pkcs8=new Uint8Array(await crypto.subtle.exportKey("pkcs8",temp.privateKey));
 try{
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await backupKey(passphrase,salt);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt(
   {name:"AES-GCM",iv,additionalData:bytes(VERSION+"|backup|"+publicKey)},key,buffer(pkcs8)));
  const privateKey=await crypto.subtle.importKey("pkcs8",buffer(pkcs8),
   {name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
  const backup:BackupV1={version:"love-radar-key-backup-v1",publicKey,
   salt:b64url(salt),iv:b64url(iv),cipher:b64url(ciphertext),iterations:BACKUP_ITERATIONS};
  return {identity:{publicKey,privateKey},encryptedBackup:JSON.stringify(backup)};
 }finally{pkcs8.fill(0)}
}
export async function decryptIdentityBackup(encryptedBackup:string,passphrase:string,expectedPublicKey:string):Promise<Identity>{
 if(encryptedBackup.length>4000)throw Error("Sauvegarde de clé trop volumineuse.");
 let parsed:Partial<BackupV1>;
 try{parsed=JSON.parse(encryptedBackup) as Partial<BackupV1>}
 catch{throw Error("Fichier de sauvegarde invalide.")}
 if(parsed.version!=="love-radar-key-backup-v1"||parsed.publicKey!==expectedPublicKey||!validPublicKey(expectedPublicKey)||
  parsed.iterations!==BACKUP_ITERATIONS||!parsed.salt||!parsed.iv||!parsed.cipher)
  throw Error("Cette sauvegarde ne correspond pas à ton identité Love Radar.");
 const salt=unb64(parsed.salt),iv=unb64(parsed.iv),cipher=unb64(parsed.cipher);
 if(salt.length!==16||iv.length!==12||cipher.length<80||cipher.length>1000)
  throw Error("Sauvegarde de clé corrompue.");
 const key=await backupKey(passphrase,salt);
 let pkcs8:Uint8Array;
 try{
  pkcs8=new Uint8Array(await crypto.subtle.decrypt(
   {name:"AES-GCM",iv:buffer(iv),additionalData:bytes(VERSION+"|backup|"+expectedPublicKey)},key,buffer(cipher)));
 }catch{throw Error("Phrase secrète incorrecte ou sauvegarde corrompue.")}
 try{
  const privateKey=await crypto.subtle.importKey("pkcs8",buffer(pkcs8),
   {name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
  // Verify the backup's private key actually matches the advertised public key.
  const remote=await crypto.subtle.importKey("raw",buffer(unb64(expectedPublicKey)),{name:"ECDH",namedCurve:"P-256"},false,[]);
  const challenge=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]) as CryptoKeyPair;
  const fromPrivate=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:challenge.publicKey},privateKey,256));
  const fromAdvertisedPublic=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:remote},challenge.privateKey,256));
  let difference=0;
  for(let i=0;i<fromPrivate.length;i++)difference|=fromPrivate[i]^fromAdvertisedPublic[i];
  if(difference!==0)throw Error("La clé privée ne correspond pas à la clé publique enregistrée.");
  return {publicKey:expectedPublicKey,privateKey};
 }finally{pkcs8.fill(0)}
}

export async function fingerprint(publicKey:string):Promise<string>{
 if(!validPublicKey(publicKey))throw Error("Clé publique invalide.");
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",buffer(unb64(publicKey))));
 return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase().match(/.{1,4}/g)!.join(" ");
}

function identityDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined")return reject(Error("Ce téléphone ne permet pas le stockage sécurisé requis."));
  const req=indexedDB.open("love-radar-e2ee-v1",1);
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains("identities"))req.result.createObjectStore("identities");
  };
  req.onerror=()=>reject(req.error||Error("Stockage chiffré indisponible."));
  req.onsuccess=()=>resolve(req.result);
 });
}
export async function loadIdentity(memberId:string):Promise<Identity|null>{
 const db=await identityDb();
 try{
  return await new Promise((resolve,reject)=>{
   const tr=db.transaction("identities","readonly"),req=tr.objectStore("identities").get(memberId);
   req.onsuccess=()=>resolve(req.result||null);
   req.onerror=()=>reject(req.error);
  });
 }finally{db.close()}
}
type StoredIdentity=Identity&{encryptedBackup?:string};
async function saveIdentity(memberId:string,identity:StoredIdentity):Promise<void>{
 const db=await identityDb();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tr=db.transaction("identities","readwrite");
   tr.objectStore("identities").put(identity,memberId);
   tr.oncomplete=()=>resolve();tr.onerror=()=>reject(tr.error);tr.onabort=()=>reject(tr.error);
  });
 }finally{db.close()}
}
export async function encryptedBackupFor(memberId:string):Promise<string|null>{
 return ((await loadIdentity(memberId)) as StoredIdentity|null)?.encryptedBackup||null;
}
/** Create private key and encrypted backup BEFORE registering the public key server-side. */
export async function ensureIdentity(memberId:string,passphrase:string):Promise<IdentityBackup>{
 const existing=await loadIdentity(memberId) as StoredIdentity|null;
 if(existing){
  if(!existing.encryptedBackup)throw Error("Cette identité n’a aucune sauvegarde récupérable. Ne réinitialise pas sa clé.");
  // If generation was interrupted, never silently accept a different phrase.
  await decryptIdentityBackup(existing.encryptedBackup,passphrase,existing.publicKey);
  return {identity:existing,encryptedBackup:existing.encryptedBackup};
 }
 const created=await generateIdentityWithBackup(passphrase);
 await saveIdentity(memberId,{...created.identity,encryptedBackup:created.encryptedBackup});
 return created;
}
/** Restore on another device only after signed-in account recovery, matching server public key. */
export async function restoreIdentityBackup(memberId:string,backup:string,passphrase:string,expectedPublicKey:string):Promise<void>{
 const identity=await decryptIdentityBackup(backup,passphrase,expectedPublicKey);
 const old=await loadIdentity(memberId);
 if(old&&old.publicKey!==identity.publicKey)throw Error("Une autre clé privée existe déjà sur cet appareil.");
 await saveIdentity(memberId,{...identity,encryptedBackup:backup});
}
function trustStorageKey(roomId:string,partnerId:string){return "lr-e2ee-verified-v1:"+roomId+":"+partnerId}
export function isPartnerVerified(roomId:string,partnerId:string,fingerprintCode:string):boolean{
 try{return localStorage.getItem(trustStorageKey(roomId,partnerId))===fingerprintCode}catch{return false}
}
export function verifyPartner(roomId:string,partnerId:string,fingerprintCode:string):void{
 // Only called by the UI after the user confirms the comparison by a separate channel.
 localStorage.setItem(trustStorageKey(roomId,partnerId),fingerprintCode);
}
export async function makeContext(args:{roomId:string;mineId:string;partnerId:string;minePublicKey:string;partnerPublicKey:string}):Promise<CryptoContext>{
 const {roomId,mineId,partnerId,minePublicKey,partnerPublicKey}=args;
 if(!validPublicKey(minePublicKey)||!validPublicKey(partnerPublicKey)||mineId===partnerId)
  throw Error("Clés de chiffrement invalides.");
 const identity=await loadIdentity(mineId);
 if(!identity||identity.publicKey!==minePublicKey)
  throw Error("La clé privée de ce téléphone est absente ou différente. Ne recrée pas la clé : tes messages chiffrés pourraient devenir illisibles.");
 const code=await fingerprint(partnerPublicKey);
 if(!isPartnerVerified(roomId,partnerId,code))
  throw Error("Vérifie d’abord l’empreinte de la clé de ton partenaire dans les paramètres.");
 return deriveContext(identity,args);
}
/** Cryptographic primitive used only after the trust-on-first-use check in makeContext. */
export async function deriveContext(identity:Identity,args:{roomId:string;mineId:string;partnerId:string;minePublicKey:string;partnerPublicKey:string}):Promise<CryptoContext>{
 const {roomId,mineId,partnerId,minePublicKey,partnerPublicKey}=args;
 if(!validPublicKey(minePublicKey)||!validPublicKey(partnerPublicKey)||mineId===partnerId||identity.publicKey!==minePublicKey)
  throw Error("Clés de chiffrement invalides.");
 const remote=await crypto.subtle.importKey("raw",buffer(unb64(partnerPublicKey)),{name:"ECDH",namedCurve:"P-256"},false,[]);
 const secret=await crypto.subtle.deriveBits({name:"ECDH",public:remote},identity.privateKey,256);
 const kdf=await crypto.subtle.importKey("raw",secret,"HKDF",false,["deriveKey"]);
 const ids=[mineId,partnerId].sort().join(":");
 const salt=await crypto.subtle.digest("SHA-256",bytes(VERSION+"|"+roomId+"|"+ids));
 const key=await crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt,info:bytes(VERSION+"|AES-256-GCM")},
  kdf,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 return {roomId,mineId,partnerId,partnerPublicKey,key};
}
function additionalData(ctx:CryptoContext,senderId:string,messageId:string,kind:string){
 if(senderId!==ctx.mineId&&senderId!==ctx.partnerId)throw Error("Expéditeur inconnu.");
 if(!/^[0-9a-f-]{36}$/i.test(messageId))throw Error("Identifiant de message invalide.");
 return bytes([VERSION,ctx.roomId,senderId,messageId,kind].join("|"));
}
export async function encryptText(ctx:CryptoContext,plain:string,messageId:string):Promise<string>{
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:additionalData(ctx,ctx.mineId,messageId,"text")},
  ctx.key,bytes(plain)));
 return TEXT_PREFIX+b64url(nonce)+"."+b64url(cipher);
}
export async function decryptText(ctx:CryptoContext,cipherText:string,messageId:string,senderId:string):Promise<string>{
 if(!isEncryptedText(cipherText))return cipherText; // old legacy plaintext stays readable
 const parts=cipherText.slice(TEXT_PREFIX.length).split(".");
 if(parts.length!==2)throw Error("Message chiffré corrompu.");
 const nonce=unb64(parts[0]),body=unb64(parts[1]);
 if(nonce.length!==12||body.length<16)throw Error("Message chiffré corrompu.");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:buffer(nonce),additionalData:additionalData(ctx,senderId,messageId,"text")},
  ctx.key,buffer(body));
 return decoder.decode(plain);
}
export async function encryptMedia(ctx:CryptoContext,file:File,kind:MediaKind,messageId:string):Promise<File>{
 const mime=file.type.split(";")[0].toLowerCase();
 if(!MIME_ALLOWED[kind].has(mime as never))throw Error("Format de média non pris en charge.");
 const plain=new Uint8Array(await file.arrayBuffer());
 const mimeBytes=bytes(mime);
 const payload=new Uint8Array(1+mimeBytes.length+plain.length);
 payload[0]=mimeBytes.length;payload.set(mimeBytes,1);payload.set(plain,1+mimeBytes.length);
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt(
  {name:"AES-GCM",iv:nonce,additionalData:additionalData(ctx,ctx.mineId,messageId,kind)},ctx.key,buffer(payload)));
 const body=new Uint8Array(4+12+ciphertext.length);
 body.set(bytes("LRE1"));body.set(nonce,4);body.set(ciphertext,16);
 return new File([buffer(body)],"love-radar-chiffre.bin",{type:E2EE_MEDIA_MIME});
}
export async function decryptMedia(ctx:CryptoContext,body:Blob,kind:MediaKind,messageId:string,senderId:string):Promise<Blob>{
 if(body.size>8_000_000)throw Error("Média chiffré trop volumineux.");
 const bin=new Uint8Array(await body.arrayBuffer());
 if(bin.length<34||decoder.decode(bin.slice(0,4))!=="LRE1")throw Error("Format du média chiffré invalide.");
 const decrypted=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:buffer(bin.slice(4,16)),
  additionalData:additionalData(ctx,senderId,messageId,kind)},ctx.key,buffer(bin.slice(16))));
 const size=decrypted[0];
 if(!size||size>80||1+size>=decrypted.length)throw Error("Type de média chiffré invalide.");
 const mime=decoder.decode(decrypted.slice(1,1+size));
 if(!MIME_ALLOWED[kind].has(mime as never))throw Error("Type de média non autorisé.");
 return new Blob([buffer(decrypted.slice(1+size))],{type:mime});
}
