import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestPost} from "../functions/api/voip";
import {ensureVoipDeviceTable,notifyIncomingVoip,type VoipEnv} from "../functions/lib/apns-voip";

const login=(c:string)=>c.repeat(64);
function database(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,token_hash TEXT NOT NULL)");
 for(const [id,room,letter] of [["p1","couple1","a"],["p2","couple1","b"],["p3","couple2","c"]]){
  sqlite.prepare("INSERT INTO members VALUES(?,?,?)").run(id,room,createHash("sha256").update(login(letter)).digest("hex"));
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
 const env:VoipEnv={DB:db};
 async function request(member:string,body:Record<string,unknown>){
  const res=await onRequestPost({env,request:new Request("https://app.example/api/voip",{
   method:"POST",headers:{Authorization:"Bearer "+login(member),"Content-Type":"application/json"},
   body:JSON.stringify(body)
  })});
  return {status:res.status,data:await res.json() as Record<string,unknown>};
 }
 return {sqlite,db,env,request};
}
const deviceId="11111111-2222-4333-8444-555555555555";
const deviceToken="a".repeat(128);
const callId="123e4567-e89b-42d3-a456-426614174000";
test("PushKit token registration is authenticated and isolated per couple",async()=>{
 const {sqlite,request}=database();
 const invalid=await request("a",{action:"register",deviceId,voipToken:"not-a-token"});
 assert.equal(invalid.status,400);
 const first=await request("a",{action:"register",deviceId,voipToken:deviceToken});
 assert.equal(first.status,200);
 assert.equal(first.data.registered,true);
 const rows=sqlite.prepare("SELECT member_id,room_id FROM native_voip_devices").all();
 assert.deepEqual(rows.map(row=>({member_id:row.member_id,room_id:row.room_id})),[{member_id:"p1",room_id:"couple1"}]);
 const outsider=await request("c",{action:"unregister",deviceId});
 assert.equal(outsider.status,200);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM native_voip_devices").get()?.n,1);
 const switched=await request("b",{action:"register",deviceId,voipToken:deviceToken});
 assert.equal(switched.status,200);
 assert.equal(sqlite.prepare("SELECT member_id FROM native_voip_devices").get()?.member_id,"p2");
 const loggedOut=await request("b",{action:"unregister",deviceId});
 assert.equal(loggedOut.status,200);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM native_voip_devices").get()?.n,0);
 sqlite.close();
});
test("APNs sends CallKit VoIP push only to the called room member with correct topic",async()=>{
 const {sqlite,db,env}=database();
 await ensureVoipDeviceTable(db);
 sqlite.prepare("INSERT INTO native_voip_devices VALUES(?,?,?,?,?)").run("p2","couple1",deviceId,deviceToken,Date.now());
 const secondId="22222222-3333-4444-8555-666666666666";
 sqlite.prepare("INSERT INTO native_voip_devices VALUES(?,?,?,?,?)").run("p3","couple2",secondId,"b".repeat(128),Date.now());
 const pair=await webcrypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const key=Buffer.from(await webcrypto.subtle.exportKey("pkcs8",pair.privateKey)).toString("base64");
 env.APNS_TEAM_ID="ABCDEFGHIJ";
 env.APNS_KEY_ID="KLMNOPQRST";
 env.APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n"+key+"\n-----END PRIVATE KEY-----";
 env.APNS_BUNDLE_ID="com.diaotech.loveradar";
 env.APNS_ENVIRONMENT="sandbox";
 const prior=globalThis.fetch;
 const captures:{url:string;headers:Headers;body:any}[]=[];
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const headers=new Headers(init?.headers),body=JSON.parse(String(init?.body));
  captures.push({url:String(input),headers,body});
  return new Response("",{status:200});
 };
 try{
  await notifyIncomingVoip(env,"couple1","p2",callId,"Anna",Date.now()+60000);
  assert.equal(captures.length,1);
  assert.equal(captures[0].url,"https://api.sandbox.push.apple.com/3/device/"+deviceToken);
  assert.equal(captures[0].headers.get("apns-push-type"),"voip");
  assert.equal(captures[0].headers.get("apns-topic"),"com.diaotech.loveradar.voip");
  assert.equal(captures[0].headers.get("apns-expiration"),"0");
  assert.match(captures[0].headers.get("authorization")||"",/^bearer eyJ/);
  assert.equal(captures[0].body.callId,callId);
  assert.equal(captures[0].body.callerName,"Anna");
  assert.equal(captures[0].body.type,"incoming_call");
 }finally{globalThis.fetch=prior;sqlite.close()}
});
test("PWA never registers PushKit; native iOS generator starts CallKit before WebView",()=>{
 const native=readFileSync("src/native-voip.ts","utf8");
 const bridge=readFileSync("native/call-session/ios-voip.swift.txt","utf8");
 const generator=readFileSync("scripts/configure-native.mjs","utf8");
 const app=readFileSync("src/VoiceCall.tsx","utf8");
 const api=readFileSync("functions/api/call.ts","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(native.includes('Capacitor.getPlatform()==="ios"'));
 assert.ok(native.includes('registerPlugin<Bridge>("NativeVoip")'));
 assert.ok(native.includes('await bridge.getPendingAction()'));
 assert.ok(native.includes('action==="register"?{voipToken:device.voipToken}'));
 assert.ok(bridge.includes("PKPushRegistryDelegate"));
 assert.ok(bridge.includes("CXProviderDelegate"));
 assert.ok(bridge.includes("provider.reportNewIncomingCall"));
 assert.ok(bridge.includes("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly"));
 assert.ok(generator.includes('swift.slice(launch,launchReturn)'));
 assert.ok(generator.includes('"voip","remote-notification"'));
 assert.ok(generator.includes("APS_ENVIRONMENT"));
 assert.ok(app.includes("pendingSystemAnswer.current=action.callId"));
 assert.ok(api.includes("notifyIncomingVoip(env,u.room_id,partner.id,call.id,u.name,call.expires_at)"));
 assert.ok(deletion.includes('"native_voip_devices"'));
});
