/* Love Radar progressive web app: cache the shell, never cache private API traffic. */
const CACHE="love-radar-static-v18";
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

/* Notifications open their exact content, not just the app's welcome page. */
const SUPPORTED_TABS=new Set(["home","chat","ludo","memories"]);
const TARGET_KINDS=new Set(["message","photo","audio","call","ludo-challenge"]);
function notificationTarget(info){
 const kind=typeof info?.kind==="string"&&TARGET_KINDS.has(info.kind)?info.kind:null;
 const id=typeof info?.id==="string"&&/^[0-9a-f-]{36}$/i.test(info.id)?info.id:null;
 let tab=SUPPORTED_TABS.has(info?.tab)?info.tab:"home";
 if(kind==="ludo-challenge")tab="ludo";
 if(kind&&kind!=="ludo-challenge")tab="chat";
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
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",
  tag:destination.id?"love-radar-"+destination.kind+"-"+destination.id:destination.tab==="chat"?"love-radar-message":"love-radar-notice",
  data:destination,
  renotify:false
 }));
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
