import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestGet,onRequestPost} from "../functions/api/care";
import {localClock,isPrayerDue,roundLocation,validTimezone,parseTimings} from "../functions/lib/care-prayer";
import {deliverPrayerReminders} from "../workers/care-scheduler";

const creds=(letter:string)=>letter.repeat(64);
function harness(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT,name TEXT,token_hash TEXT)");
 for(const [id,room,name,key] of [
  ["a","one","Awa","a"],["b","one","Malick","b"],
  ["c","two","Other","c"],["d","two","Partner","d"]
 ])sqlite.prepare("INSERT INTO members VALUES(?,?,?,?)")
  .run(id,room,name,createHash("sha256").update(creds(key)).digest("hex"));
 const prepare=(query:string,args:unknown[])=>({
  async first(){return sqlite.prepare(query).get(...args as [])??null},
  async all(){return {results:sqlite.prepare(query).all(...args as [])}},
  async run(){return {meta:{changes:Number(sqlite.prepare(query).run(...args as []).changes)}}}
 });
 const DB={
  async exec(query:string){sqlite.exec(query)},
  prepare(query:string){return {...prepare(query,[]),bind(...args:unknown[]){return prepare(query,args)}}},
  async batch(list:{run:()=>Promise<unknown>}[]){
   sqlite.exec("BEGIN");
   try{let r=[];for(const s of list)r.push(await s.run());sqlite.exec("COMMIT");return r}
   catch(e){sqlite.exec("ROLLBACK");throw e}
  }
 } as unknown as D1Database;
 const env={DB};
 async function request(member:string,action?:string,fields:Record<string,unknown>={}){
  const req=new Request("https://love-radar.example/api/care",{
   method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+creds(member),...(action?{"Content-Type":"application/json"}:{})},
   ...(action?{body:JSON.stringify({action,...fields})}:{})
  });
  const res=await(action?onRequestPost({request:req,env}):onRequestGet({request:req,env}));
  return {status:res.status,json:await res.json() as any};
 }
 return {request,DB,env,sqlite};
}
test("care period notice requires explicit consent, remains private to couple and may be revoked",async()=>{
 const h=harness();
 const defaultA=await h.request("a");
 const defaultB=await h.request("b");
 assert.equal(defaultA.json.periodEnabled,false,"no gender is inferred from the account name");
 assert.equal(defaultB.json.periodEnabled,false,"personal preferences are not inferred from couple membership");
 const no=await h.request("a","period",{supplies:true});
 assert.equal(no.status,400);
 const blocked=await h.request("a","period",{confirmed:true,supplies:true});
 assert.equal(blocked.status,403,"period notices cannot be sent until the member opts in");
 assert.equal((await h.request("b")).json.notices.length,0);
 const enabled=await h.request("a","set-period-preference",{enabled:true});
 assert.equal(enabled.status,200);
 assert.equal(enabled.json.periodEnabled,true);
 assert.equal((await h.request("b")).json.periodEnabled,false,"partner's own preference is unchanged");
 const period=await h.request("a","period",{confirmed:true,supplies:true});
 assert.equal(period.status,200);
 assert.equal(period.json.sent,true);
 assert.ok(period.json.ownPeriodId);
 assert.equal((await h.request("c")).json.notices.length,0,"unrelated couples cannot see sensitive notices");
 assert.equal((await h.request("a")).json.notices.length,0,"only receiving partner sees note");
 const receive=(await h.request("b")).json.notices;
 assert.equal(receive.length,1);
 assert.equal(receive[0].kind,"period");
 assert.equal(receive[0].label,"supplies");
 const repeat=await h.request("a","period",{confirmed:true});
 assert.equal(repeat.status,429);
 const denied=await h.request("c","revoke-period",{id:receive[0].id});
 assert.equal(denied.status,200);
 assert.equal((await h.request("b")).json.notices.length,1);
 const revoke=await h.request("a","revoke-period",{id:receive[0].id});
 assert.equal(revoke.status,200);
 assert.equal((await h.request("b")).json.notices.length,0);
 const disabled=await h.request("a","set-period-preference",{enabled:false});
 assert.equal(disabled.status,200);
 assert.equal(disabled.json.periodEnabled,false);
 assert.equal((await h.request("b")).json.periodEnabled,false);
 assert.equal((await h.request("a","period",{confirmed:true})).status,403);
 h.sqlite.close();
});
test("each prayer schedule is voluntary and only coarse coordinates are saved",async()=>{
 const h=harness();
 const forbidden=await h.request("a","enable-prayer",{latitude:14.71,longitude:-17.44,timezone:"Africa/Dakar",method:3});
 assert.equal(forbidden.status,400);
 assert.equal((await h.request("a")).json.prayer,null);
 const previous=globalThis.fetch;
 const clock=localClock(Date.now(),"Africa/Dakar");
 globalThis.fetch=async()=>new Response(JSON.stringify({code:200,data:{
  meta:{timezone:"Africa/Dakar"},timings:{Fajr:"05:45",Dhuhr:"13:10",Asr:"16:20",Maghrib:"19:20",Isha:"20:25"}
 }}),{status:200,headers:{"Content-Type":"application/json"}});
 try{
  const active=await h.request("a","enable-prayer",{
   confirmed:true,latitude:14.713,longitude:-17.441,timezone:"Africa/Dakar",method:3
  });
  assert.equal(active.status,200);
  assert.equal(active.json.prayer.enabled,true);
  assert.equal(active.json.prayer.latitude,14.7);
  assert.equal(active.json.prayer.longitude,-17.4);
  assert.equal(active.json.timings.Fajr,"05:45");
  assert.equal((await h.request("b")).json.partnerPrayerEnabled,true);
  assert.equal((await h.request("c")).json.partnerPrayerEnabled,false);
  const disabled=await h.request("a","disable-prayer");
  assert.equal(disabled.status,200);
  assert.equal(disabled.json.prayer,null);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) n FROM care_prayer_settings").get()?.n,0);
  assert.match(clock.day,/^\d{4}-\d{2}-\d{2}$/);
 }finally{globalThis.fetch=previous;h.sqlite.close()}
});
test("scheduled daily prayer notification is once per member/day/prayer and never crosses couples",async()=>{
 const h=harness();
 const now=Date.now(),clock=localClock(now,"Africa/Dakar");
 const clockTime=clock.time;
 await h.request("a"); // Initialize schema.
 const stamp=Date.now();
 h.sqlite.prepare("INSERT INTO care_prayer_settings VALUES(?,?,?,?,?,?,?,?)")
  .run("a","one",14.7,-17.4,"Africa/Dakar",3,1,stamp);
 const prior=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({code:200,data:{
  meta:{timezone:"Africa/Dakar"},
  timings:{Fajr:clockTime,Dhuhr:"11:11",Asr:"14:14",Maghrib:"19:19",Isha:"21:21"}
 }}),{status:200,headers:{"Content-Type":"application/json"}});
 try{
  assert.equal(await deliverPrayerReminders(h.DB,h.env,now),1);
  assert.equal(await deliverPrayerReminders(h.DB,h.env,now),0);
  assert.equal((await h.request("b")).json.notices.length,1);
  assert.equal((await h.request("c")).json.notices.length,0);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) n FROM care_prayer_sent").get()?.n,1);
 }finally{globalThis.fetch=prior;h.sqlite.close()}
});
test("prayer timings validate timezone, due windows and method; no silent geolocation",()=>{
 assert.equal(roundLocation(14.742),14.7);
 assert.equal(roundLocation(-17.487),-17.5);
 assert.equal(validTimezone("Africa/Dakar"),true);
 assert.equal(validTimezone("fake/not-real"),false);
 const date={day:"2026-11-16",time:"13:03"};
 assert.equal(isPrayerDue("2026-11-16",date,"13:00"),true);
 assert.equal(isPrayerDue("2026-11-15",date,"13:00"),false);
 assert.equal(isPrayerDue("2026-11-16",date,"12:59"),false);
 assert.equal(parseTimings({Fajr:"5am",Dhuhr:"13:00",Asr:"17:00",Maghrib:"19:00",Isha:"21:00"}),null);
 const component=readFileSync("src/CoupleCare.tsx","utf8");
 assert.ok(component.includes("navigator.geolocation.getCurrentPosition"));
 assert.ok(component.includes('enableHighAccuracy:false'));
 assert.ok(component.includes('window.confirm("Envoyer'));
 assert.ok(component.includes("confirmed:true,supplies"));
 assert.ok(component.includes('state?.periodEnabled===true?<section className="lr-care-card lr-care-period">'));
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.ok(settings.includes("updatePeriodPreference(event.target.checked)"));
 assert.ok(settings.includes("set-period-preference"));
 assert.ok(settings.includes("La fonction « J’ai mes règles » me concerne"),"profile explains the optional preference");
 const api=readFileSync("functions/api/care.ts","utf8");
 assert.ok(api.includes('body.confirmed!==true'));
 assert.ok(api.includes('expires_at>?'));
 assert.ok(api.includes('kind=\'period\''));
 const sched=readFileSync("wrangler.care.toml.example","utf8");
 assert.ok(sched.includes('crons = ["* * * * *"]'));
});
