import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {webcrypto,createHash} from "node:crypto";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestPost} from "../functions/api/android-voip";
import {ensureAndroidDeviceTable,notifyIncomingAndroid,validAndroidFcmToken,type AndroidVoipEnv} from "../functions/lib/fcm-call";

const session=(c:string)=>c.repeat(64);
const device="11111111-2222-4333-8444-555555555555";
const fcmToken="fcm:"+("AbC123_-.".repeat(20));
function fixture(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,token_hash TEXT NOT NULL)");
 for(const [id,room,letter] of [["p1","room1","a"],["p2","room1","b"],["p3","room2","c"]]){
  sqlite.prepare("INSERT INTO members VALUES(?,?,?)").run(id,room,createHash("sha256").update(session(letter)).digest("hex"));
 }
 const command=(sql:string,args:unknown[])=>({
  async first(){return sqlite.prepare(sql).get(...args as [])||null},
  async all(){return {results:sqlite.prepare(sql).all(...args as [])}},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args as []).changes)}}}
 });
 const db={
  async exec(sql:string){sqlite.exec(sql)},
  prepare(sql:string){return {...command(sql,[]),bind(...args:unknown[]){return command(sql,args)}}}
 } as unknown as D1Database;
 const env:AndroidVoipEnv={DB:db};
 const request=async(member:string,body:Record<string,unknown>)=>{
  const response=await onRequestPost({env,request:new Request("https://example.test/api/android-voip",{
   method:"POST",headers:{Authorization:"Bearer "+session(member),"Content-Type":"application/json"},
   body:JSON.stringify(body)
  })});
  return {status:response.status,data:await response.json() as Record<string,unknown>};
 };
 return {sqlite,env,request,db};
}
test("Android FCM tokens are validated and isolated to authenticated couple members",async()=>{
 const {sqlite,request}=fixture();
 assert.equal(validAndroidFcmToken(fcmToken),true);
 assert.equal(validAndroidFcmToken("unexpected short token"),false);
 assert.equal((await request("a",{action:"register",deviceId:device,voipToken:"bad"})).status,400);
 const registered=await request("a",{action:"register",deviceId:device,voipToken:fcmToken});
 assert.equal(registered.status,200);
 assert.equal(registered.data.registered,true);
 assert.equal(sqlite.prepare("SELECT member_id FROM native_android_devices").get()?.member_id,"p1");
 assert.equal((await request("c",{action:"unregister",deviceId:device})).status,200);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM native_android_devices").get()?.n,1);
 const switched=await request("b",{action:"register",deviceId:device,voipToken:fcmToken});
 assert.equal(switched.status,200);
 assert.equal(sqlite.prepare("SELECT member_id FROM native_android_devices").get()?.member_id,"p2");
 const removed=await request("b",{action:"unregister",deviceId:device});
 assert.equal(removed.status,200);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM native_android_devices").get()?.n,0);
 sqlite.close();
});
test("Android native invitation uses a scoped high-priority FCM data push, never conversation content",async()=>{
 const {sqlite,env,db}=fixture();
 await ensureAndroidDeviceTable(db);
 sqlite.prepare("INSERT INTO native_android_devices VALUES(?,?,?,?,?)")
  .run("p2","room1",device,fcmToken,Date.now());
 const anotherDevice="22222222-3333-4444-8555-666666666666";
 sqlite.prepare("INSERT INTO native_android_devices VALUES(?,?,?,?,?)")
  .run("p3","room2",anotherDevice,"z".repeat(90),Date.now());
 const keys=await webcrypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const key=Buffer.from(await webcrypto.subtle.exportKey("pkcs8",keys.privateKey)).toString("base64");
 env.FCM_PROJECT_ID="love-radar-test";
 env.FCM_CLIENT_EMAIL="firebase-adminsdk-test@love-radar-test.iam.gserviceaccount.com";
 env.FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n"+key+"\n-----END PRIVATE KEY-----";
 const originalFetch=globalThis.fetch;
 const seen:{url:string;body:string;auth:string}[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  seen.push({url,body:String(init?.body||""),auth:String(new Headers(init?.headers).get("Authorization")||"")});
  if(url==="https://oauth2.googleapis.com/token")return Response.json({access_token:"oauth-test-token",expires_in:3600});
  return Response.json({name:"projects/love-radar-test/messages/1"});
 };
 try{
  const callId="123e4567-e89b-42d3-a456-426614174000",expiresAt=Date.now()+60000;
  await notifyIncomingAndroid(env,"room1","p2",callId,"Tendre <Partenaire>",expiresAt,"video");
  const sent=seen.find(item=>item.url.includes("fcm.googleapis.com/v1/projects/"));
  assert.ok(sent,"FCM HTTP v1 endpoint must receive a call invitation");
  assert.equal(sent!.auth,"Bearer oauth-test-token");
  const payload=JSON.parse(sent!.body);
  assert.equal(payload.message.android.priority,"HIGH");
  assert.equal(payload.message.android.restricted_package_name,"com.diaotech.loveradar");
  assert.equal(payload.message.data.mode,"video");
  assert.equal(payload.message.data.callId,callId);
  assert.equal(payload.message.data.expiresAt,String(expiresAt));
  assert.equal(payload.message.token,fcmToken);
  assert.equal(payload.message.data.callerName,"Tendre Partenaire");
  assert.equal(seen.filter(x=>x.url.includes("/messages:send")).length,1,"No cross-couple device delivery");
  assert.ok(!sent!.body.includes("messageText")&&!sent!.body.includes("conversation"));
 }finally{globalThis.fetch=originalFetch;sqlite.close();}
});
test("No Android invite is dispatched if Firebase service credentials are not configured",async()=>{
 const {sqlite,env,db}=fixture();
 await ensureAndroidDeviceTable(db);
 sqlite.prepare("INSERT INTO native_android_devices VALUES(?,?,?,?,?)")
  .run("p2","room1",device,fcmToken,Date.now());
 const oldFetch=globalThis.fetch;
 let network=0;
 globalThis.fetch=async()=>{network++;return Response.json({})};
 try{
  await notifyIncomingAndroid(env,"room1","p2","123e4567-e89b-42d3-a456-426614174000","A",Date.now()+60000);
  assert.equal(network,0);
 }finally{globalThis.fetch=oldFetch;sqlite.close();}
});
