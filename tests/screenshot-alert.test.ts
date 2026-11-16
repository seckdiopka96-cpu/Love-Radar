import test from "node:test";
import assert from "node:assert/strict";
import {createHash,webcrypto} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestGet,onRequestPost} from "../functions/api/screenshot";

const token=(c:string)=>c.repeat(64);
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const uuid="123e4567-e89b-42d3-a456-426614174000";
function harness(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sql=new DatabaseSync(":memory:");
 sql.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL)");
 for(const [id,room,name,key] of [
  ["a","room-one","Lina","a"],["b","room-one","Malo","b"],
  ["c","room-two","Inès","c"],["d","room-two","Sam","d"]
 ])sql.prepare("INSERT INTO members VALUES(?,?,?,?)").run(id,room,name,hash(token(key)));
 const prepare=(q:string,vars:unknown[])=>({
  async first(){return sql.prepare(q).get(...vars as [])||null},
  async all(){return {results:sql.prepare(q).all(...vars as [])}},
  async run(){return {meta:{changes:Number(sql.prepare(q).run(...vars as []).changes)}}}
 });
 const db={
  async exec(q:string){sql.exec(q)},
  prepare(q:string){return {...prepare(q,[]),bind(...vars:unknown[]){return prepare(q,vars)}}}
 } as unknown as D1Database;
 async function get(who:string){
  const res=await onRequestGet({env:{DB:db},request:new Request("https://example.test/api/screenshot",{
   headers:{Authorization:"Bearer "+token(who)}
  })});
  return {status:res.status,body:await res.json() as any};
 }
 async function post(who:string,id:string,action="taken"){
  const jobs:Promise<unknown>[]=[];
  const res=await onRequestPost({env:{DB:db},waitUntil:p=>jobs.push(p),
   request:new Request("https://example.test/api/screenshot",{
    method:"POST",headers:{Authorization:"Bearer "+token(who),"Content-Type":"application/json"},
    body:JSON.stringify({action,id})
   })});
  await Promise.all(jobs);
  return {status:res.status,body:await res.json() as any};
 }
 return {sql,db,get,post};
}
test("only authenticated members share real screenshot events with their own partner",async()=>{
 const h=harness();
 const created=await h.post("a",uuid);
 assert.equal(created.status,200);
 assert.equal(created.body.saved,true);
 assert.equal(created.body.event.member_id,"a");
 const own=await h.get("a"),partner=await h.get("b"),other=await h.get("c");
 assert.equal(own.body.events.length,1);
 assert.equal(partner.body.events.length,1);
 assert.equal(partner.body.events[0].member_id,"a");
 assert.equal(other.body.events.length,0);
 const row=h.sql.prepare("SELECT * FROM screenshot_events WHERE id=?").get(uuid) as Record<string,unknown>;
 assert.deepEqual(Object.keys(row).sort(),["created_at","id","member_id","room_id"].sort());
 assert.equal(row.room_id,"room-one");
 assert.equal((await h.post("a",uuid)).body.duplicate,true);
 assert.equal((await h.post("b","not-a-uuid")).status,400);
 assert.equal((await h.post("b",crypto.randomUUID(),"pretend")).status,400);
 h.sql.close();
});
test("server throttle prevents screenshot notification spam but allows future events",async()=>{
 const h=harness();
 assert.equal((await h.post("b",uuid)).status,200);
 const next="87654321-9876-4abc-8def-123456789012";
 assert.equal((await h.post("b",next)).status,429);
 assert.equal((await h.get("a")).body.events.length,1);
 h.sql.prepare("UPDATE screenshot_throttle SET last_at=? WHERE member_id='b'")
  .run(Date.now()-16000);
 assert.equal((await h.post("b",next)).status,200);
 assert.equal((await h.get("a")).body.events.length,2);
 h.sql.close();
});
test("metadata stays private for 30 days, never stores screenshots and supports deletion",async()=>{
 const h=harness();
 assert.equal((await h.post("a",uuid)).status,200);
 h.sql.prepare("UPDATE screenshot_events SET created_at=? WHERE id=?")
  .run(Date.now()-32*86400000,uuid);
 assert.equal((await h.get("b")).body.events.length,0);
 const schema=readFileSync("schema.sql","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS screenshot_events"));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS screenshot_throttle"));
 assert.ok(deletion.includes('"screenshot_events"'));
 assert.ok(deletion.includes('"screenshot_throttle"'));
 const api=readFileSync("functions/api/screenshot.ts","utf8");
 assert.ok(!api.includes("imageBase64"));
 assert.ok(!api.includes("screenshotData"));
 assert.ok(api.includes("WHERE room_id=?"));
 h.sql.close();
});
test("iOS reports screenshot only after capture; Android blocks and PWA has no fake detector",()=>{
 const native=readFileSync("native/call-session/ios-screenshot.swift.txt","utf8");
 const watch=readFileSync("src/native-screenshot.ts","utf8");
 const privacy=readFileSync("src/native-privacy.ts","utf8");
 const generator=readFileSync("scripts/configure-native.mjs","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.ok(native.includes("UIApplication.userDidTakeScreenshotNotification"));
 assert.ok(native.includes('notifyListeners("screenshotTaken"'));
 assert.ok(native.includes("No photo data"));
 assert.ok(native.includes("preventsCapture"));
 assert.ok(watch.includes('Capacitor.getPlatform()==="ios"'));
 assert.ok(watch.includes('if(!screenshotDetectionAvailable())return()=>{}'));
 assert.ok(privacy.includes('Capacitor.getPlatform()==="android"||enabled'));
 assert.ok(generator.includes('ios-screenshot.swift.txt'));
 assert.ok(generator.includes('bridge?.registerPluginInstance(LoveRadarCapturePlugin())'));
 assert.ok(app.includes('watchNativeScreenshots(onTaken)'));
 assert.ok(app.includes('entry.type==="screenshot"'));
 assert.ok(app.includes('setScreenshotHistory'));
 assert.ok(settings.includes("Version web / PWA"));
 assert.ok(settings.includes("iOS ne permet pas de la bloquer officiellement"));
});
