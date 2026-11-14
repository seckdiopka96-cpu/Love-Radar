import {Capacitor} from "@capacitor/core";

/** Local native UI calls Cloudflare over HTTPS; the PWA keeps same-origin /api. */
export const isNativeApp=Capacitor.isNativePlatform();
export const API_ORIGIN="https://love-radar-acd.pages.dev";

export function apiFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 if(isNativeApp&&typeof input==="string"&&input.startsWith("/api/")){
  const endpoint=new URL(input,API_ORIGIN).toString();
  return fetch(endpoint,{credentials:"omit",...init});
 }
 return fetch(input,init);
}
export function publicInviteUrl(code:string){
 const base=isNativeApp?API_ORIGIN:window.location.origin;
 const url=new URL("/",base);
 url.searchParams.set("join",code);
 return url.toString();
}
