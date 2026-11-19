/* Love Radar progressive web app: cache the shell, never cache private API traffic. */
// Refresh the installed PWA shell after the Cloudflare Pages GIPHY build variable was configured.
const CACHE="love-radar-static-v148";
const PRIVATE_AVATAR_CACHE="love-radar-private-notification-avatar-v1";
const SHELL=["/","/manifest.webmanifest","/favicon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-512-maskable.png","/ludo-mark.svg","/ludo-solo/index.html","/ludo-solo/style.css","/ludo-solo/script.js","/ludo-duo/index.html","/ludo-duo/style.css","/ludo-duo/script.js","/ludo-effects.css","/ludo-unified-stage.css","/ludo-sfx.js"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith("love-radar-static-")).map(key=>caches.delete(key)))),self.clients.claim()]));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 // The solo game is a real static page inside Love Radar. Never store it
 // as the root app shell: that could replace the app when offline.
 if(url.pathname==="/ludo-unified-stage.css"){
  event.respondWith(fetch(request).catch(()=>caches.match("/ludo-unified-stage.css")
   .then(response=>response||Response.error())));
  return;
 }
 if(url.pathname==="/ludo-effects.css"){
  event.respondWith(fetch(request).catch(()=>caches.match("/ludo-effects.css")
   .then(response=>response||Response.error())));
  return;
 }
 if(url.pathname==="/ludo-sfx.js"){
  event.respondWith(fetch(request).catch(()=>caches.match("/ludo-sfx.js")
   .then(response=>response||Response.error())));
  return;
 }
 if(url.pathname.startsWith("/ludo-solo/")||url.pathname.startsWith("/ludo-duo/")){
  event.respondWith(fetch(request).catch(()=>caches.match(url.pathname)
   .then(response=>response||Response.error())));
  return;
 }
 if(request.mode==="navigate"){
  // Only the main SPA entry may populate the offline root cache.
  if(url.pathname!=="/"&&url.pathname!=="/index.html")return;
  event.respondWith(fetch(request).then(async response=>{
    if(response.ok){const cache=await caches.open(CACHE);await cache.put("/",response.clone())}
    return response;
   }).catch(()=>caches.match("/").then(res=>res||Response.error())));
  return;
 }
 if(!url.pathname.startsWith("/assets/")&&!url.pathname.startsWith("/icons/")&&!["/manifest.webmanifest","/favicon.svg"].includes(url.pathname))return;
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(async response=>{
  if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}
  return response;
 })));
});

/* Offline-safe, same-device avatar only; profile photos never become public.
   The authenticated app sends a small thumbnail directly to its own service worker.
   iOS PWA currently ignores custom notification icons, using the app icon instead. */
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function avatarRequest(memberId){
 return new Request(self.location.origin+"/__lr_private_push_avatar__/"+memberId);
}
self.addEventListener("message",event=>{
 const data=event.data||{};
 if(data.type==="love-radar-avatar-icon"){
  if(!UUID.test(data.memberId)||typeof data.iconData!=="string"||
   !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.iconData)||
   data.iconData.length>16000)return;
  event.waitUntil((async()=>{
   const cache=await caches.open(PRIVATE_AVATAR_CACHE);
   const keys=await cache.keys();
   await Promise.all(keys.map(key=>cache.delete(key)));
   await cache.put(avatarRequest(data.memberId),new Response(data.iconData,{
    headers:{"Content-Type":"text/plain","X-Private-Cached-At":String(Date.now())}
   }));
  })());
 }else if(data.type==="love-radar-avatar-clear"){
  event.waitUntil(caches.delete(PRIVATE_AVATAR_CACHE));
 }
});
async function notificationAvatar(memberId){
 if(typeof memberId!=="string"||!UUID.test(memberId))return "/icons/icon-192.png";
 try{
  const cache=await caches.open(PRIVATE_AVATAR_CACHE);
  const stored=await cache.match(avatarRequest(memberId));
  if(!stored)return "/icons/icon-192.png";
  const stamp=Number(stored.headers.get("X-Private-Cached-At")||"0");
  if(!stamp||Date.now()-stamp>30*24*60*60*1000)return "/icons/icon-192.png";
  const iconData=await stored.text();
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(iconData)&&iconData.length<=16000?
   iconData:"/icons/icon-192.png";
 }catch{return "/icons/icon-192.png"}
}

/* Notifications open their exact content, not just the app's welcome page. */
const SUPPORTED_TABS=new Set(["home","settings","chat","games","ludo-room","ludo","memory","rps","draw","escape","rapid","truth","memories","moment","together","life","watch","watch-tiktok","puzzle","reconcile","story","reunion","care"]);
/* Every kind sent by Cloudflare has an explicit landing page. */
const KIND_TABS={
 "message":"chat","photo":"chat","audio":"chat","call":"chat",
 "ludo-challenge":"ludo","ludo-joined":"ludo","memory-challenge":"memory","rps-challenge":"rps",
 "daily-question":"moment","love-signal":"together",
 "love-letter":"memories","album-memory":"memories",
 "couple-date":"life","couple-mood":"life","couple-dream":"life",
 "couple-hug":"life","couple-challenge":"life","couple-gift":"life"
};
const TARGET_KINDS=new Set(Object.keys(KIND_TABS));
function notificationTarget(info,title=""){
 // A previous iPhone notification may still contain chat metadata.
 // Respect the actual Ludo invitation visible on the lock screen.
 const isLudoInvite=typeof title==="string"&&/défi\s+ludo\s+duo/i.test(title);
 let kind=typeof info?.kind==="string"&&TARGET_KINDS.has(info.kind)?info.kind:null;
 let id=typeof info?.id==="string"&&(
  /^[0-9a-f-]{36}$/i.test(info.id)||
  (kind==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(info.id))
 )?info.id:null;
 let deepTab=null,deepKind=null,deepId=null;
 if(typeof info?.url==="string"){
  try{
   const link=new URL(info.url,self.location.origin);
   if(link.origin===self.location.origin&&(link.pathname==="/"||link.pathname==="/index.html")){
    deepTab=SUPPORTED_TABS.has(link.searchParams.get("tab"))?link.searchParams.get("tab"):null;
    const k=link.searchParams.get("kind"),i=link.searchParams.get("id");
    if(TARGET_KINDS.has(k)&&typeof i==="string"&&(
     /^[0-9a-f-]{36}$/i.test(i)||(k==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(i))
    )){deepKind=k;deepId=i}
   }
  }catch{/* Ignore invalid legacy URLs. */}
 }
 if(isLudoInvite){
  // Never mistake an old chat message ID for the Ludo match ID.
  if(kind!=="ludo-challenge"||!id){
   kind=deepKind==="ludo-challenge"?deepKind:null;
   id=deepKind==="ludo-challenge"?deepId:null;
  }
 }else if((!kind||!id)&&deepKind&&deepId){kind=deepKind;id=deepId}
 const valid=Boolean(kind&&id);
 const tab=isLudoInvite?"ludo":valid?KIND_TABS[kind]:
  SUPPORTED_TABS.has(info?.tab)?info.tab:deepTab||"home";
 const query=new URLSearchParams({tab});
 if(valid){query.set("kind",kind);query.set("id",id)}
 return {tab,kind:valid?kind:null,id:valid?id:null,url:"/?"+query.toString()};
}
self.addEventListener("push",event=>{
 let payload={};
 try{payload=event.data?event.data.json():{}}catch{payload={}}
 const title=typeof payload.title==="string"?payload.title.slice(0,100):"Love Radar ❤️";
 const destination=notificationTarget(payload,title);
 const body=typeof payload.body==="string"?payload.body.slice(0,240):"Ton partenaire t’attend ❤️";
 event.waitUntil((async()=>{
  // Each text message has a distinct ID, so new alerts no longer replace older ones.
  const avatarIcon=await notificationAvatar(payload.senderId);
  await self.registration.showNotification(title,{
   body,icon:avatarIcon,badge:"/icons/icon-192.png",
   tag:destination.id?"love-radar-"+destination.kind+"-"+destination.id:destination.tab==="chat"?"love-radar-message-"+Date.now():"love-radar-notice-"+Date.now(),
   data:destination,
   renotify:false
  });
  // When the app is open, also signal it to refresh the conversation badge.
  const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of windows)client.postMessage({type:"love-radar-push-received",tab:destination.tab,kind:destination.kind,id:destination.id});
 })());
});
// iOS may reopen an installed PWA at its manifest start_url rather than the
// tapped notification URL. Keep ONLY its destination (never message content).
// The SPA consumes it once it has installed its event listeners.
const PENDING_ROUTE_CACHE="love-radar-notification-route-v1";
const PENDING_ROUTE_URL="/__lr_pending_notification_route__";
async function rememberNotificationRoute(destination){
 const routeId=String(Date.now())+"-"+Math.random().toString(36).slice(2);
 const cache=await caches.open(PENDING_ROUTE_CACHE);
 await cache.put(PENDING_ROUTE_URL,new Response(JSON.stringify({destination,at:Date.now(),routeId}),{
  headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
 }));
 return routeId;
}
async function pendingRoute(){
 const cache=await caches.open(PENDING_ROUTE_CACHE);
 const stored=await cache.match(PENDING_ROUTE_URL);
 if(!stored)return null;
 try{
  const record=await stored.json();
  if(!record||!Number.isFinite(record.at)||Date.now()-record.at>600000||
    typeof record.routeId!=="string"){
   await cache.delete(PENDING_ROUTE_URL);
   return null;
  }
  return {routeId:record.routeId,...notificationTarget(record.destination)};
 }catch{
  await cache.delete(PENDING_ROUTE_URL);
  return null;
 }
}
async function deliverPendingRoute(client){
 const destination=await pendingRoute();
 if(destination)client.postMessage({type:"love-radar-open-notification",...destination});
}
async function acknowledgePendingRoute(routeId){
 if(typeof routeId!=="string"||routeId.length>96)return;
 const destination=await pendingRoute();
 if(!destination||destination.routeId!==routeId)return;
 const cache=await caches.open(PENDING_ROUTE_CACHE);
 await cache.delete(PENDING_ROUTE_URL);
}
self.addEventListener("message",event=>{
 if(event.data?.type==="love-radar-request-pending-notification"){
  if(!event.source||!event.source.postMessage)return;
  event.waitUntil(deliverPendingRoute(event.source));
 }else if(event.data?.type==="love-radar-ack-notification"){
  event.waitUntil(acknowledgePendingRoute(event.data.routeId));
 }
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const destination=notificationTarget(event.notification.data||{},event.notification.title||"");
 const url=new URL(destination.url,self.location.origin).href;
 event.waitUntil((async()=>{
  // Persist BEFORE focusing the existing PWA: iOS may recreate its page
  // before React installs the message handler, losing a one-shot postMessage.
  const routeId=await rememberNotificationRoute(destination);
  const clientsList=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  const owned=clientsList.filter(client=>{
   try{return new URL(client.url).origin===self.location.origin}catch{return false}
  });
  // Prefer a visible tab instead of a stale background browser client.
  owned.sort((a,b)=>Number(b.visibilityState==="visible")-Number(a.visibilityState==="visible"));
  const routeMessage={type:"love-radar-open-notification",...destination,routeId};
  // A WebKit WindowClient.focus()/navigate() promise may stall when an iPhone
  // restores a suspended standalone app. Never wait indefinitely while the
  // tapped notification is already dismissed.
  const settled=async(promise,timeoutMs=1200)=>{
   let timer;
   try{
    return await Promise.race([
     Promise.resolve(promise).then(value=>({ok:true,value}),()=>({ok:false})),
     new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false}),timeoutMs)})
    ]);
   }finally{if(timer!==undefined)clearTimeout(timer)}
  };
  for(const client of owned){
   try{
    // The message must be posted BEFORE awaiting focus. An iOS resume can
    // time out while the already-running React app is still listening.
    client.postMessage(routeMessage);
    const focusResult=await settled(client.focus());
    if(!focusResult.ok)continue;
    const focused=focusResult.value||client;
    // Game invitations additionally update the real URL. This makes a cold
    // PWA boot read ?tab=ludo&kind=ludo-challenge&id=... directly.
    if(["ludo-challenge","ludo-joined","memory-challenge","rps-challenge"].includes(destination.kind)){
     const navigation=await settled(focused.navigate(url));
     if(navigation.ok){
      (navigation.value||focused).postMessage(routeMessage);
      return;
     }
     // A failed WebKit navigate must NOT discard the queued route. The SPA
     // already received postMessage; it can also request the pending route.
    }
    focused.postMessage(routeMessage);
    return;
   }catch{/* Try another live window or open the PWA below. */}
  }
  // No window could be resumed; preserve the route in Cache Storage even if
  // WebKit starts at the manifest's "/" URL instead of the supplied path.
  await self.clients.openWindow(url);
 })());
});

/* The browser may rotate or drop a push subscription while the app is installed.
   Tokens remain in the page, never in the service worker. Prompt an authenticated
   page to reconcile its own subscription on the next foreground visit. */
self.addEventListener("pushsubscriptionchange",event=>{
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of windows)client.postMessage({type:"love-radar-push-needs-repair"});
 })());
});
