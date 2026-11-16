import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateRecoveryCode,normalizeRecoveryCode,formatRecoveryCode,recoveryHash,sessionHash,redeemRecoveryCode,saveRecoveryCode} from "../functions/lib/account-recovery";
import {consumeLimit,PUBLIC_LIMITS,MEMBER_LIMITS} from "../functions/lib/abuse-limits";

test("recovery uses 128-bit secrets shown once, not inviting partner via a room code",async()=>{
 const seen=new Set<string>();
 for(let i=0;i<200;i++){
  const code=generateRecoveryCode();
  assert.match(code,/^[0-9A-F]{32}$/);
  assert.equal(normalizeRecoveryCode(formatRecoveryCode(code)),code);
  assert.ok(!seen.has(code),"Backup codes must not repeat");
  seen.add(code);
  const hashed=await recoveryHash(code);
  assert.match(hashed,/^[a-f0-9]{64}$/);
  assert.ok(!hashed.includes(code));
  assert.notEqual(hashed,await sessionHash(code));
 }
 assert.equal(normalizeRecoveryCode("1234"),null);
 assert.equal(normalizeRecoveryCode("invalid!"),null);
 assert.equal(normalizeRecoveryCode(null),null);
});

test("one-time code rotates user session and itself atomically",async()=>{
 const recovery=new Map<string,string>();
 const sessions=new Map<string,string>();
 const member="member-123";
 const prepared=(sql:string,params:unknown[])=>({
  sql,params,
  async first(){
   if(sql.includes("SELECT member_id FROM member_recovery WHERE code_hash=?")){
    const found=[...recovery.entries()].find(([,hash])=>hash===params[0]);
    return found?{member_id:found[0]}:null;
   }
   return null;
  },
  async run(){
   if(sql.startsWith("INSERT INTO member_recovery(")){
    recovery.set(String(params[0]),String(params[1]));
    return {meta:{changes:1}};
   }
   return {meta:{changes:0}};
  }
 });
 const db={
  async exec(_sql:string){},
  prepare(sql:string){return {bind(...params:unknown[]){return prepared(sql,params)}}},
  async batch(operations:ReturnType<typeof prepared>[]){
   const [setSession,replaceCode]=operations;
   assert.ok(setSession.sql.includes("AND EXISTS"));
   assert.ok(replaceCode.sql.includes("WHERE member_id=? AND code_hash=?"));
   const [newHash,memberId,checkMemberId,oldHash]=setSession.params;
   const [newCodeHash,,replaceMemberId,replaceOldHash]=replaceCode.params;
   if(memberId===member&&checkMemberId===member&&replaceMemberId===member&&
    oldHash===replaceOldHash&&recovery.get(member)===oldHash){
    sessions.set(member,String(newHash));
    recovery.set(member,String(newCodeHash));
    return [{meta:{changes:1}},{meta:{changes:1}}];
   }
   return [{meta:{changes:0}},{meta:{changes:0}}];
  }
 } as unknown as Parameters<typeof saveRecoveryCode>[0];
 const first=generateRecoveryCode();
 await saveRecoveryCode(db,member,first);
 const result=await redeemRecoveryCode(db,first);
 assert.ok(result);
 assert.equal(result.memberId,member);
 assert.match(result.token,/^[a-f0-9]{64}$/);
 assert.match(result.recoveryCode,/^[0-9A-F]{32}$/);
 assert.notEqual(result.recoveryCode,first);
 assert.equal(sessions.get(member),await sessionHash(result.token));
 assert.equal(await redeemRecoveryCode(db,first),null,"Used recovery code is invalid");
 const second=await redeemRecoveryCode(db,result.recoveryCode);
 assert.ok(second);
 assert.notEqual(second.token,result.token,"Each recovery invalidates the previous session");
});

test("abuse counters cap attempts without allowing requests to increment beyond the limit",async()=>{
 const hits=new Map<string,{count:number;expiresAt:number}>();
 const db={
  async exec(_sql:string){},
  prepare(sql:string){
   return {bind(...params:unknown[]){
    return {
     async run(){
      if(sql.includes("INSERT OR IGNORE INTO abuse_salt"))return {meta:{changes:1}};
      if(!sql.includes("INSERT INTO abuse_counters"))throw Error("Unexpected SQL");
      const [scope,actor,expiresAt,now,,,,limit]=params;
      const id=String(scope)+":"+String(actor);
      const previous=hits.get(id);
      if(previous&&previous.expiresAt>Number(now)&&previous.count>=Number(limit))
       return {meta:{changes:0}};
      const count=previous&&previous.expiresAt>Number(now)?previous.count+1:1;
      hits.set(id,{count,expiresAt:previous&&previous.expiresAt>Number(now)?previous.expiresAt:Number(expiresAt)});
      return {meta:{changes:1}};
     }
    };
   }};
  }
 } as unknown as Parameters<typeof consumeLimit>[0];
 const rule={scope:"test-recovery",max:3,windowMs:1000};
 for(let i=0;i<3;i++)assert.equal(await consumeLimit(db,"actor-a",rule,10000),true);
 assert.equal(await consumeLimit(db,"actor-a",rule,10000),false);
 assert.equal(await consumeLimit(db,"actor-b",rule,10000),true,"Other users keep their limits");
 assert.equal(await consumeLimit(db,"actor-a",rule,11001),true,"Window resets at expiry");
 assert.equal(PUBLIC_LIMITS.recover.max<=8,true);
 assert.ok(MEMBER_LIMITS.message.max>=25,"Normal chat use remains possible");
});

test("all external security boundaries are enforced on the server",()=>{
 const love=readFileSync("functions/api/love.ts","utf8");
 const media=readFileSync("functions/api/media.ts","utf8");
 const calls=readFileSync("functions/api/call.ts","utf8");
 const api=readFileSync("functions/api/recovery.ts","utf8");
 const limits=readFileSync("functions/lib/abuse-limits.ts","utf8");
 const ui=readFileSync("src/App.tsx","utf8");
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.ok(limits.includes("ON CONFLICT(scope,actor)"));
 assert.ok(limits.includes("abuse_counters.hits<?"));
 assert.ok(limits.includes('request.headers.get("CF-Connecting-IP")'));
 assert.ok(!limits.includes('request.headers.get("X-Forwarded-For")'));
 assert.ok(love.includes("PUBLIC_LIMITS.create"));
 assert.ok(love.includes("PUBLIC_LIMITS.join"));
 assert.ok(love.includes("MEMBER_LIMITS.message"));
 assert.ok(love.includes("MEMBER_LIMITS.reaction"));
 assert.ok(media.includes("MEMBER_LIMITS.media"));
 assert.ok(calls.includes("MEMBER_LIMITS.call"));
 assert.ok(api.includes('if(action==="recover")'));
 assert.ok(api.includes("PUBLIC_LIMITS.recover"));
 assert.ok(api.includes("MEMBER_LIMITS.recoveryIssue"));
 assert.ok(api.includes('DELETE FROM push_subscriptions WHERE member_id=?'));
 assert.ok(love.includes('import {deleteCoupleRoom} from "../lib/delete-room"'));
 assert.ok(readFileSync("functions/lib/delete-room.ts","utf8").includes('MEMBER_DATA_TABLES=["member_recovery","push_test_throttle","care_share_throttle"]'));
 assert.ok(ui.includes('J’ai perdu mon accès'));
 assert.ok(ui.includes("<RecoveryCodeDialog"));
 assert.ok(settings.includes("onGenerateRecovery"));
 assert.ok(!ui.includes("localStorage.setItem(\"recoveryCode\""),"Never store codes in localStorage");
});
