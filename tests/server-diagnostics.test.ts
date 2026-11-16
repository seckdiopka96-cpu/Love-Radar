import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import type {D1Database,R2Bucket} from "@cloudflare/workers-types";
import {onRequestPost} from "../functions/api/server-diagnostics";

Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
const token="b".repeat(64),tokenHash=createHash("sha256").update(token).digest("hex");
const endpoint="https://love-radar-acd.pages.dev/api/server-diagnostics";
const request=(bearer=token)=>new Request(endpoint,{
 method:"POST",headers:{Authorization:"Bearer "+bearer}
});

function fakeBindings(opts:{missingRead?:boolean;corruptRead?:boolean;deleteError?:boolean;limited?:boolean}={}){
 const store=new Map<string,Uint8Array>();
 let writes=0,reads=0,deletes=0,dbReads=0;
 const db={
  async exec(_sql:string){},
  prepare(sql:string){
   return {bind(...args:unknown[]){
    return {
     async first(){
      dbReads++;
      if(sql.includes("SELECT id FROM members"))return args[0]===tokenHash?{id:"member-test"}:null;
      return null;
     },
     async run(){
      if(sql.includes("INSERT INTO abuse_counters"))
       return {meta:{changes:opts.limited?0:1}};
      return {meta:{changes:1}};
     }
    };
   }};
  }
 } as unknown as D1Database;
 const bucket={
  async put(key:string,value:Uint8Array){
   writes++;store.set(key,new Uint8Array(value));
   return {};
  },
  async get(key:string){
   reads++;
   if(opts.missingRead)return null;
   const data=store.get(key);
   if(!data)return null;
   const copy=new Uint8Array(data);
   if(opts.corruptRead)copy[0]^=0x80;
   return {arrayBuffer:async()=>copy.buffer};
  },
  async delete(key:string){
   deletes++;
   if(opts.deleteError)throw Error("Simulated R2 delete error");
   store.delete(key);
  }
 } as unknown as R2Bucket;
 return {db,bucket,store,counters:()=>({writes,reads,deletes,dbReads})};
}
function context(bindings:ReturnType<typeof fakeBindings>,req=request()){
 return {request:req,env:{DB:bindings.db,STORAGE:bindings.bucket}};
}

test("authenticated R2 smoke check writes, reads, compares and deletes a temporary random object",async()=>{
 const b=fakeBindings();
 const response=await onRequestPost(context(b));
 const payload=await response.json() as Record<string,unknown>;
 assert.equal(response.status,200);
 assert.equal(response.headers.get("Cache-Control"),"no-store");
 assert.deepEqual({db:payload.database,r2:payload.storage,clean:payload.cleanup},
  {db:"ok",r2:"ok",clean:"ok"});
 assert.equal(payload.ok,true);
 assert.ok(Number(payload.latencyMs)>=0);
 assert.deepEqual(b.counters().writes,1);
 assert.deepEqual(b.counters().reads,1);
 assert.deepEqual(b.counters().deletes,1);
 assert.equal(b.store.size,0,"no R2 diagnostics keys remain");
});

test("invalid or absent sessions cannot read or mutate R2",async()=>{
 const b=fakeBindings();
 for(const candidate of ["bad","a".repeat(64)]){
  const response=await onRequestPost(context(b,request(candidate)));
  assert.equal(response.status,401);
 }
 assert.equal(b.counters().writes,0);
 assert.equal(b.counters().reads,0);
 assert.equal(b.counters().deletes,0);
});

test("missing D1 or R2 bindings produces 503 without private user data",async()=>{
 const b=fakeBindings();
 assert.equal((await onRequestPost({request:request(),env:{DB:b.db}})).status,503);
 assert.equal((await onRequestPost({request:request(),env:{STORAGE:b.bucket}})).status,503);
 assert.equal(b.counters().writes,0);
});

test("R2 read failure and mismatched bytes fail closed and clean up the probe",async()=>{
 for(const opts of [{missingRead:true},{corruptRead:true}]){
  const b=fakeBindings(opts);
  const response=await onRequestPost(context(b));
  const result=await response.json() as Record<string,unknown>;
  assert.equal(response.status,503);
  assert.equal(result.ok,false);
  assert.equal(result.storage,"error");
  assert.equal(result.cleanup,"ok");
  assert.equal(b.store.size,0);
 }
});

test("R2 deletion failure is reported, never counted as a successful storage test",async()=>{
 const b=fakeBindings({deleteError:true});
 const response=await onRequestPost(context(b));
 assert.equal(response.status,503);
 const data=await response.json() as Record<string,unknown>;
 assert.equal(data.storage,"ok");
 assert.equal(data.cleanup,"error");
});

test("diagnostic rate limit refuses excessive R2 probes",async()=>{
 const b=fakeBindings({limited:true});
 const response=await onRequestPost(context(b));
 assert.equal(response.status,429);
 assert.equal(b.counters().writes,0);
});

test("server diagnostics do not access existing messages, user media, or unrelated features",()=>{
 const api=readFileSync("functions/api/server-diagnostics.ts","utf8");
 const ui=readFileSync("src/ConnectionDiagnostics.tsx","utf8");
 assert.ok(api.includes('"_love_radar_server_checks/"'));
 assert.ok(api.includes('SELECT id FROM members WHERE token_hash=?'));
 assert.ok(api.includes("consumeMemberLimit"));
 assert.ok(!api.includes("FROM messages"));
 assert.ok(!api.includes("push_subscriptions"));
 assert.ok(ui.includes("Tester le stockage R2"));
});
