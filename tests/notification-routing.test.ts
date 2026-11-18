import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const app=readFileSync("src/App.tsx","utf8");
const worker=readFileSync("public/sw.js","utf8");
const duo=readFileSync("src/Ludo.tsx","utf8");
const agreementCSS=readFileSync("src/ludo-duo-color.css","utf8");

test("all real notification kinds open the correct Love Radar content",()=>{
 const clients=new Map<string,(event:any)=>void>();
 const self={location:{origin:"https://love-radar.example"},
  addEventListener:(key:string,handler:(event:any)=>void)=>clients.set(key,handler)};
 const route=new Script(worker+"\nnotificationTarget",{filename:"public/sw.js"})
  .runInNewContext({self,URL,URLSearchParams,Date,Promise,Response,Request,setTimeout,clearTimeout}) as
  (input:{tab:string;kind:string;id:string})=>{tab:string;kind:string|null;id:string|null;url:string};
 const id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const expected:Record<string,string>={
  "message":"chat","photo":"chat","audio":"chat","call":"chat",
  "ludo-challenge":"ludo","memory-challenge":"memory","rps-challenge":"rps",
  "daily-question":"moment","love-signal":"together",
  "love-letter":"memories","album-memory":"memories",
  "couple-date":"life","couple-mood":"life","couple-dream":"life",
  "couple-hug":"life","couple-challenge":"life","couple-gift":"life"
 };
 for(const [kind,tab] of Object.entries(expected)){
  const result=route({tab:"home",kind,id});
  assert.equal(result.tab,tab,kind+" screen");
  assert.equal(result.kind,kind,kind+" kind retained");
  assert.equal(result.id,id,kind+" item retained");
  const query=new URL(result.url,"https://love-radar.example").searchParams;
  assert.equal(query.get("kind"),kind);
  assert.equal(query.get("id"),id);
  assert.equal(query.get("tab"),tab);
 }
 const question=route({tab:"home",kind:"daily-question",id:"2026-11-18"});
 assert.equal(question.tab,"moment");
 assert.equal(question.id,"2026-11-18");
 const malformed=route({tab:"home",kind:"message",id:"../../private"});
 assert.equal(malformed.kind,null);
 assert.equal(malformed.tab,"home");
});

test("iPhone notification routing is confirmed after restoring the private room",()=>{
 assert.ok(app.includes("setPendingNoticeRouteId(routeId)"));
 assert.ok(app.includes("if(!routeId||!token||!room||!noticeTarget||tab!==noticeTarget.tab)return"));
 assert.ok(app.includes('type:"love-radar-ack-notification",routeId'));
 const handlerStart=app.indexOf('if(data?.type==="love-radar-open-notification")');
 const handlerEnd=app.indexOf("const onRoute=()=>",handlerStart);
 assert.ok(handlerStart>=0&&handlerEnd>handlerStart);
 assert.ok(!app.slice(handlerStart,handlerEnd).includes("love-radar-ack-notification"),
  "do not acknowledge during an iPhone splash before route is visible");
 assert.ok(app.includes('navigator.serviceWorker?.addEventListener("controllerchange",requestPendingNotification)'));
 assert.ok(app.includes('window.addEventListener("focus",requestPendingNotification)'));
 assert.ok(app.includes('document.addEventListener("visibilitychange",requestPendingNotification)'));
 assert.ok(app.includes("lastMessageJump.current=\"\""));
 assert.ok(app.includes("setNoticeTap(n=>n+1)"));
 assert.ok(app.includes('focusCallId={noticeTarget?.kind==="call"?noticeTarget.id:null}'));
 assert.ok(app.includes('id={"lr-chat-call-"+entry.call.id}'));
 const calls=readFileSync("src/VoiceCall.tsx","utf8");
 assert.ok(calls.includes("focusCallId&&active?.id===focusCallId"));
 assert.ok(calls.includes("setMinimized(false)"));
 assert.ok(app.includes('focusKind={noticeTarget?.kind} focusId={noticeTarget?.id}'));
 assert.ok(app.includes('tab==="moment"?<DailyMoment'),"Question du jour renders the real page");
 assert.ok(app.includes('focusDay={noticeTarget?.kind==="daily-question"?noticeTarget.id:null}'));
});

test("foreground notification toast opens its exact clicked message",()=>{
 assert.ok(worker.includes('tab:destination.tab,kind:destination.kind,id:destination.id'),
  "service worker must send the real message id to the foreground app");
 assert.ok(app.includes('setPushToastTarget(dest)'),"banner stores the notification route");
 assert.ok(app.includes('const target=pushToastTarget'));
 assert.ok(app.includes('window.history.replaceState(null,"",noticeUrl(target))'));
 assert.ok(app.includes('setNoticeTarget(target);setTab(target.tab)'));
 assert.ok(app.includes('setNoticeTap(n=>n+1)'),"repeated taps on the same message must focus again");
});

test("notification targets survive an iPhone cold start and open their precise screen",()=>{
 assert.ok(worker.includes('PENDING_ROUTE_CACHE="love-radar-notification-route-v1"'));
 assert.ok(worker.includes("rememberNotificationRoute(destination)"));
 assert.ok(worker.includes('event.data?.type==="love-radar-request-pending-notification"'));
 assert.ok(worker.includes('event.data?.type==="love-radar-ack-notification"'));
 assert.ok(worker.includes("deliverPendingRoute(event.source)"));
 assert.ok(worker.includes("await self.clients.openWindow(url)"));
 assert.ok(worker.includes('focused.postMessage({type:"love-radar-open-notification",...destination,routeId})'));
 assert.ok(worker.includes('["ludo-challenge","memory-challenge","rps-challenge"].includes(destination.kind)'),"game invitations must force an exact URL navigation on iPhone");
 assert.ok(app.includes('window.addEventListener("pageshow",onPageShow)'));
 assert.ok(app.includes('navigator.serviceWorker?.ready.then(reg=>'));
 assert.ok(app.includes('type:"love-radar-request-pending-notification"'));
 assert.ok(app.includes('setTab(dest.tab)'),"go directly to the chosen page");
 assert.ok(app.includes('type:"love-radar-ack-notification",routeId'),"SPA must acknowledge a handled notification");
 assert.ok(!app.includes('if(lastHandledNotice.current===routeId)return'),
  "a repeated notification must recover from a failed iPhone resume, never be silently ignored");
 assert.ok(app.includes('challengeId={noticeTarget?.kind==="ludo-challenge"?noticeTarget.id:null}'),"Ludo challenge reaches game agreement");
});

test("message notifications jump to their actual chat bubble",()=>{
 assert.ok(app.includes('target.scrollIntoView({block:"center",behavior:"auto"})'));
 assert.ok(app.includes('if(lastMessageJump.current===id)return'),"do not force-scroll after every new message");
 assert.ok(app.includes('noticeTarget?.id===m.id&&tab==="chat"?" lr-notified-bubble"'));
 assert.ok(app.includes('!room.messages.some(m=>m.id===noticeTarget.id)'),"show fallback only if message is older than loaded chat");
 assert.ok(app.includes('const notified=noticeTarget?.id&&["message","photo","audio","call"].includes'));
 assert.ok(readFileSync("src/delivery-status-ui.css","utf8").includes(".lr-notified-bubble"));
});

test("Ludo invitation is not acknowledged until its real agreement loads",()=>{
 assert.ok(app.includes('if(noticeTarget.kind==="ludo-challenge"&&readyLudoNotice!==noticeTarget.id)return'));
 assert.ok(app.includes("onNotificationReady={markLudoNoticeReady}"));
 assert.ok(duo.includes("onNotificationReady?.(challengeId)"));
 assert.ok(duo.includes("if(challengeId&&game&&palette&&!loading)"));
 assert.ok(app.includes('!room.messages.some(message=>message.id===id)'),"messages wait for server content");
 assert.ok(app.includes("focusMessage?.id!==id&&!focusError"),"old messages wait for the precise fetch or an error");
});

test("stalled WebKit focus cannot swallow a clicked Ludo invitation",async()=>{
 const listeners=new Map<string,(event:any)=>void>();
 const stored=new Map<string,Response>(),messages:any[]=[];
 let opened="";
 const background={
  url:"https://love-radar-acd.pages.dev/",visibilityState:"hidden",
  postMessage:(data:any)=>messages.push(data),
  // iOS may leave focus permanently pending while the PWA is suspended.
  focus:()=>new Promise(()=>{}),
  navigate:async()=>{throw Error("focus was not acquired")}
 };
 const cache={open:async()=>({
  put:async(key:string,response:Response)=>{stored.set(key,response)},
  match:async(key:string)=>stored.get(key)?.clone(),
  delete:async(key:string)=>stored.delete(key)
 })};
 const context={
  self:{location:{origin:"https://love-radar-acd.pages.dev"},
   clients:{matchAll:async()=>[background],openWindow:async(url:string)=>{opened=url}},
   addEventListener:(key:string,fn:(event:any)=>void)=>listeners.set(key,fn)},
  caches:cache,URL,URLSearchParams,Date,Promise,Response,Request,
  setTimeout:(fn:()=>void)=>{queueMicrotask(fn);return 1},clearTimeout:()=>{}
 };
 new Script(worker).runInNewContext(context);
 let pending=Promise.resolve();
 listeners.get("notificationclick")!({
  notification:{close(){},data:{tab:"ludo",kind:"ludo-challenge",
   id:"55555555-5555-4555-8555-555555555555"}},
  waitUntil(value:Promise<any>){pending=value}
 });
 await pending;
 assert.equal(messages[0].kind,"ludo-challenge","post the route before the stalled focus");
 assert.match(opened,/tab=ludo&kind=ludo-challenge&id=55555555/);
 assert.equal(stored.size,1,"retain the clicked invitation if iOS only opens Home");
});

test("Ludo Duo agreement is one step after color selection, without mandatory gifts",()=>{
 assert.ok(duo.includes('ludo-agreement-dialog ludo-ready-dialog'));
 assert.ok(duo.includes('J’accepte et je joue'));
 assert.ok(duo.includes('giftConsent:giftOptIn'));
 assert.ok(duo.includes('checked={giftOptIn}'),"gift opt-in must remain optional");
 assert.ok(duo.includes('setGiftOptIn(false)'),"new match begins with no gift obligation");
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
 const stored=new Map<string,Response>();
 const caches={open:async()=>({
  put:async(k:string,v:Response)=>{stored.set(k,v)},
  match:async(k:string)=>stored.get(k)?.clone(),
  delete:async(k:string)=>stored.delete(k)
 })};
 const self={
  location:{origin:"https://love-radar-acd.pages.dev"},
  clients:{matchAll:async()=>[client],openWindow:async()=>{throw Error("should reuse the active app")}},
  addEventListener:(name:string,fn:(ev:any)=>void)=>listeners.set(name,fn)
 };
 new Script(worker,{filename:"public/sw.js"}).runInNewContext({self,URL,URLSearchParams,Date,Promise,Response,Request,caches,setTimeout,clearTimeout});
 let job=Promise.resolve();
 listeners.get("notificationclick")!({notification:{
  close(){},data:{tab:"chat",kind:"message",id:"11111111-1111-4111-8111-111111111111"}
 },waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.equal(navigated,false);
 assert.equal(messages[0].tab,"chat");
 assert.equal(messages[0].kind,"message");
 assert.equal(messages[0].id,"11111111-1111-4111-8111-111111111111");
 assert.equal(stored.size,1,"even a warm focus retains the route until the SPA acknowledges it");
 const replay:any[]=[];
 listeners.get("message")!({data:{type:"love-radar-request-pending-notification"},
  source:{postMessage:(v:any)=>replay.push(v)},
  waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.equal(replay[0].id,messages[0].id,"an iOS reload can recover a lost warm message");
 listeners.get("message")!({data:{type:"love-radar-ack-notification",routeId:replay[0].routeId},
  source:{postMessage:()=>{}},waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.equal(stored.size,0,"remove only when handled by the app");
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
 new Script(worker,{filename:"public/sw.js"}).runInNewContext({self,URL,URLSearchParams,Date,Promise,Response,Request,caches,setTimeout,clearTimeout});
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
 assert.equal(stored.size,1,"pending notification must persist until acknowledged");
 listeners.get("message")!({data:{type:"love-radar-ack-notification",routeId:messages[0].routeId},
  source:{postMessage:()=>{}},
  waitUntil(p:Promise<unknown>){job=p as Promise<void>}});
 await job;
 assert.equal(stored.size,0,"clear route only after the app confirms navigation");
});

test("tap on Ludo invitation navigates the existing iPhone PWA to its exact game",async()=>{
 const listeners=new Map<string,(ev:any)=>void>();
 const stored=new Map<string,Response>();
 const events:any[]=[];
 let navigated="";
 const client:any={
  url:"https://love-radar-acd.pages.dev/?tab=home",
  visibilityState:"visible",
  focus:async()=>client,
  navigate:async(url:string)=>{navigated=url;return client},
  postMessage:(data:any)=>events.push(data)
 };
 const caches={open:async()=>({
  put:async(k:string,v:Response)=>{stored.set(k,v)},
  match:async(k:string)=>stored.get(k)?.clone(),
  delete:async(k:string)=>stored.delete(k)
 })};
 const self={
  location:{origin:"https://love-radar-acd.pages.dev"},
  clients:{matchAll:async()=>[client],openWindow:async()=>{throw Error("should reuse installed PWA")}},
  addEventListener:(name:string,fn:(event:any)=>void)=>listeners.set(name,fn)
 };
 new Script(worker,{filename:"public/sw.js"}).runInNewContext({self,URL,URLSearchParams,Date,Promise,Response,Request,caches,setTimeout,clearTimeout});
 let task=Promise.resolve();
 listeners.get("notificationclick")!({
  notification:{close(){},data:{tab:"ludo",kind:"ludo-challenge",id:"44444444-4444-4444-8444-444444444444"}},
  waitUntil(p:Promise<unknown>){task=p as Promise<void>}
 });
 await task;
 assert.match(navigated,/\?tab=ludo&kind=ludo-challenge&id=44444444/);
 assert.equal(events[0].tab,"ludo");
 assert.equal(events[0].kind,"ludo-challenge");
 assert.equal(events[0].id,"44444444-4444-4444-8444-444444444444");
 assert.equal(stored.size,1,"iOS still has a persistent fallback if navigation fails to mount");
});
