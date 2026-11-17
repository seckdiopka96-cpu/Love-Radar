import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const app=readFileSync("src/App.tsx","utf8");
const worker=readFileSync("public/sw.js","utf8");
const duo=readFileSync("src/Ludo.tsx","utf8");
const agreementCSS=readFileSync("src/ludo-duo-color.css","utf8");

test("notification targets survive an iPhone cold start and open their precise screen",()=>{
 assert.ok(worker.includes('PENDING_ROUTE_CACHE="love-radar-notification-route-v1"'));
 assert.ok(worker.includes("rememberNotificationRoute(destination)"));
 assert.ok(worker.includes('type:"love-radar-request-pending-notification"'));
 assert.ok(worker.includes("deliverPendingRoute(event.source)"));
 assert.ok(worker.includes("await self.clients.openWindow(url)"));
 assert.ok(worker.includes('focused.postMessage({type:"love-radar-open-notification",...destination})'));
 assert.ok(!worker.includes("await focused.navigate(url)"),"do not reload an existing chat on notification tap");
 assert.ok(app.includes('window.addEventListener("pageshow",onPageShow)'));
 assert.ok(app.includes('navigator.serviceWorker?.ready.then(reg=>'));
 assert.ok(app.includes('type:"love-radar-request-pending-notification"'));
 assert.ok(app.includes('setTab(dest.tab)'),"go directly to the chosen page");
 assert.ok(app.includes('challengeId={noticeTarget?.kind==="ludo-challenge"?noticeTarget.id:null}'),"Ludo challenge reaches game agreement");
});

test("message notifications jump to their actual chat bubble",()=>{
 assert.ok(app.includes('target.scrollIntoView({block:"center",behavior:"auto"})'));
 assert.ok(app.includes('noticeTarget?.id===m.id&&tab==="chat"?" lr-notified-bubble"'));
 assert.ok(app.includes('!room.messages.some(m=>m.id===noticeTarget.id)'),"show fallback only if message is older than loaded chat");
 assert.ok(app.includes('const notified=noticeTarget?.id&&["message","photo","audio"].includes'));
 assert.ok(readFileSync("src/delivery-status-ui.css","utf8").includes(".lr-notified-bubble"));
});

test("Ludo Duo agreement is one step after color selection, without mandatory gifts",()=>{
 assert.ok(duo.includes('ludo-agreement-dialog ludo-ready-dialog'));
 assert.ok(duo.includes('J’accepte et je joue'));
 assert.ok(duo.includes('giftConsent:false'));
 assert.ok(duo.includes('aria-label="Accord pour jouer au Ludo Duo"'));
 assert.ok(duo.includes('agreement?.signed[seat]'));
 assert.ok(duo.includes('palette?.chosenBy==null'));
 assert.ok(!duo.includes('giftPreference'));
 assert.ok(!duo.includes('rulesAccepted'));
 assert.ok(agreementCSS.includes(".ludo-agreement-dialog.ludo-ready-dialog"));
 assert.ok(agreementCSS.includes(".ludo-ready-dialog .ludo-ready-rules"));
});

test("push worker routes a warm notification directly without reloading the app",async()=>{
 const listeners=new Map<string,(ev:any)=>void>();
 const messages:any[]=[];
 let navigated=false;
 const client={url:"https://love-radar-acd.pages.dev/",focus:async()=>client,
  postMessage:(v:any)=>messages.push(v),navigate:async()=>{navigated=true;return client}};
 const self={
  location:{origin:"https://love-radar-acd.pages.dev"},
  clients:{matchAll:async()=>[client],openWindow:async()=>{throw Error("should reuse the active app")}},
  addEventListener:(name:string,fn:(ev:any)=>void)=>listeners.set(name,fn)
 };
 new Script(worker,{filename:"public/sw.js"}).runInNewContext({self,URL,URLSearchParams,Date,Promise,Response,Request,caches:{}});
 let job=Promise.resolve();
 listeners.get("notificationclick")!({notification:{
  close(){},data:{tab:"chat",kind:"message",id:"11111111-1111-4111-8111-111111111111"}
 },waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.equal(navigated,false);
 assert.equal(messages[0].tab,"chat");
 assert.equal(messages[0].kind,"message");
 assert.equal(messages[0].id,"11111111-1111-4111-8111-111111111111");
});

test("push worker remembers an exact route on cold iPhone launch",async()=>{
 const listeners=new Map<string,(ev:any)=>void>();
 const stored=new Map<string,Response>();
 let opened="";
 const caches={open:async()=>({
  put:async(k:string,v:Response)=>{stored.set(k,v)},
  match:async(k:string)=>stored.get(k)?.clone(),
  delete:async(k:string)=>stored.delete(k)
 })};
 const self={
  location:{origin:"https://love-radar-acd.pages.dev"},
  clients:{matchAll:async()=>[],openWindow:async(url:string)=>{opened=url;return null}},
  addEventListener:(name:string,fn:(ev:any)=>void)=>listeners.set(name,fn)
 };
 new Script(worker,{filename:"public/sw.js"}).runInNewContext({self,URL,URLSearchParams,Date,Promise,Response,Request,caches});
 let job=Promise.resolve();
 listeners.get("notificationclick")!({notification:{
  close(){},data:{tab:"ludo",kind:"ludo-challenge",id:"22222222-2222-4222-8222-222222222222"}
 },waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.match(opened,/\?tab=ludo&kind=ludo-challenge&id=22222222/);
 const messages:any[]=[];
 listeners.get("message")!({data:{type:"love-radar-request-pending-notification"},
  source:{postMessage:(v:any)=>messages.push(v)},
  waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.equal(messages[0].tab,"ludo");
 assert.equal(messages[0].kind,"ludo-challenge");
 assert.equal(stored.size,0,"a notification destination must be consumed once");
});
