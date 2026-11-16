/* Love Radar progressive web app: cache the shell, never cache private API traffic. */
const CACHE="love-radar-static-v69";
const PRIVATE_AVATAR_CACHE="love-radar-private-notification-avatar-v1";
const SHELL=["/","/manifest.webmanifest","/favicon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-512-maskable.png"];
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
 if(request.mode==="navigate"){
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
const SUPPORTED_TABS=new Set(["home","chat","games","ludo","memory","rps","rapid","truth","memories","moment","together","watch","watch-tiktok","puzzle","reconcile","story","reunion","care"]);
const TARGET_KINDS=new Set(["message","photo","audio","call","ludo-challenge","memory-challenge","rps-challenge","daily-question","love-signal"]);
function notificationTarget(info){
 const kind=typeof info?.kind==="string"&&TARGET_KINDS.has(info.kind)?info.kind:null;
 const id=typeof info?.id==="string"&&(/^[0-9a-f-]{36}$/i.test(info.id)||(kind==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(info.id)))?info.id:null;
 let tab=SUPPORTED_TABS.has(info?.tab)?info.tab:"home";
 if(kind==="ludo-challenge")tab="ludo";
 if(kind==="memory-challenge")tab="memory";
 if(kind==="rps-challenge")tab="rps";
 if(kind==="daily-question")tab="moment";
 if(kind==="love-signal")tab="together";
 if(kind&&kind!=="ludo-challenge"&&kind!=="memory-challenge"&&kind!=="rps-challenge"&&kind!=="daily-question"&&kind!=="love-signal")tab="chat";
 const query=new URLSearchParams({tab});
 if(kind&&id){query.set("kind",kind);query.set("id",id)}
 return {tab,kind:kind&&id?kind:null,id:kind&&id?id:null,url:"/?"+query.toString()};
}
self.addEventListener("push",event=>{
 let payload={};
 try{payload=event.data?event.data.json():{}}catch{payload={}}
 const destination=notificationTarget(payload);
 const title=typeof payload.title==="string"?payload.title.slice(0,100):"Love Radar ❤️";
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
  for(const client of windows)client.postMessage({type:"love-radar-push-received",tab:destination.tab,kind:destination.kind});
 })());
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const destination=notificationTarget(event.notification.data||{});
 const url=new URL(destination.url,self.location.origin).href;
 event.waitUntil((async()=>{
  const clientsList=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of clientsList){
   if(new URL(client.url).origin!==self.location.origin)continue;
   try{
    // Focus first so iOS uses the already-installed PWA window.
    const focused="focus" in client?await client.focus():client;
    // Message is also consumed by the open SPA if navigation does not reload.
    (focused||client).postMessage({type:"love-radar-open-notification",...destination});
    if("navigate" in focused){
     const navigated=await focused.navigate(url);
     if(navigated)return;
    }
    return;
   }catch{/* Fall back to opening the exact deep link below. */}
  }
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
