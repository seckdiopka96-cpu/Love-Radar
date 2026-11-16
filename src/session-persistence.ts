/** Session persistence on this same device and origin.
 * Keep the existing localStorage token and a best-effort IndexedDB fallback,
 * since on iOS a storage backend may occasionally be cleared independently.
 * This cannot restore sessions from a different browser or installation. */
const TOKEN_KEY="love-radar-token";
const SEEN_KEY="love-radar-had-session";
const DATABASE="love-radar-session-v1";
const STORE="tokens";
const RECORD="active";
const TOKEN=/^[a-f0-9]{64}$/;
function getLocal():string{
 try{const value=localStorage.getItem(TOKEN_KEY)||"";return TOKEN.test(value)?value:""}
 catch{return ""}
}
function openDatabase():Promise<IDBDatabase|null>{
 if(typeof indexedDB==="undefined")return Promise.resolve(null);
 return new Promise(resolve=>{
  try{
   const request=indexedDB.open(DATABASE,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(STORE))
     request.result.createObjectStore(STORE);
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>resolve(null);
   request.onblocked=()=>resolve(null);
  }catch{resolve(null)}
 });
}
async function fromDatabase():Promise<string>{
 const db=await openDatabase();
 if(!db)return "";
 return new Promise(resolve=>{
  try{
   const tx=db.transaction(STORE,"readonly");
   const request=tx.objectStore(STORE).get(RECORD);
   let value="";
   request.onsuccess=()=>{
    if(typeof request.result==="string"&&TOKEN.test(request.result))value=request.result;
   };
   tx.oncomplete=()=>{db.close();resolve(value)};
   tx.onabort=()=>{db.close();resolve("")};
   tx.onerror=()=>{db.close();resolve("")};
  }catch{db.close();resolve("")}
 });
}
async function writeDatabase(value:string|null):Promise<void>{
 const db=await openDatabase();
 if(!db)return;
 await new Promise<void>(resolve=>{
  try{
   const tx=db.transaction(STORE,"readwrite");
   if(value)tx.objectStore(STORE).put(value,RECORD);
   else tx.objectStore(STORE).delete(RECORD);
   tx.oncomplete=()=>{db.close();resolve()};
   tx.onabort=()=>{db.close();resolve()};
   tx.onerror=()=>{db.close();resolve()};
  }catch{db.close();resolve()}
 });
}
export function hadPreviousSession():boolean{
 try{return localStorage.getItem(SEEN_KEY)==="1"||Boolean(getLocal())}
 catch{return false}
}
export async function recoverSavedSession():Promise<string>{
 const local=getLocal();
 if(local)return local;
 // Avoid an endless spinner if WebKit is waiting for an IndexedDB lock.
 const fromDb=await Promise.race([
  fromDatabase(),new Promise<string>(resolve=>setTimeout(()=>resolve(""),2500))
 ]);
 if(fromDb){
  try{localStorage.setItem(TOKEN_KEY,fromDb);localStorage.setItem(SEEN_KEY,"1")}catch{}
 }
 return fromDb;
}
export function persistSessionToken(token:string):void{
 if(!TOKEN.test(token))return;
 try{localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(SEEN_KEY,"1")}catch{}
 void writeDatabase(token).catch(()=>{});
}
export function clearSessionToken():void{
 try{localStorage.removeItem(TOKEN_KEY)}catch{}
 void writeDatabase(null).catch(()=>{});
}
