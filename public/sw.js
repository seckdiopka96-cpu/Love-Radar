/* Love Radar progressive web app: cache the shell, never cache private API traffic. */
const CACHE="love-radar-static-v2";
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

/* Show visible, user-consented notifications even while the PWA is closed. */
self.addEventListener("push",event=>{
 let notice={};
 try{notice=event.data?event.data.json():{}}catch{notice={}}
 const validTab=["home","chat","radar"].includes(notice.tab)?notice.tab:"home";
 const title=typeof notice.title==="string"?notice.title:"Love Radar ❤️";
 const body=typeof notice.body==="string"?notice.body:"Ton partenaire a une surprise pour toi ❤️";
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",
  tag:validTab==="chat"?"love-radar-message":"love-radar-game",
  data:{url:"/?tab="+validTab,tab:validTab},renotify:false
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const tab=event.notification.data?.tab||"home";
 const destination=new URL("/?tab="+tab,self.location.origin).href;
 event.waitUntil((async()=>{
  const clientsList=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of clientsList){
   if(new URL(client.url).origin===self.location.origin){
    if("navigate" in client)await client.navigate(destination);
    if("focus" in client)return client.focus();
   }
  }
  return self.clients.openWindow(destination);
 })());
});
