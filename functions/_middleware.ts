/**
 * Allow only Love Radar's bundled native WebViews to call the Cloudflare API.
 * Existing web/PWA requests remain same-origin; no cookies or wildcard CORS.
 */
type Context={request:Request;next:()=>Promise<Response>};
const MOBILE_ORIGINS=new Set([
 "capacitor://localhost",
 "https://localhost",
 "http://localhost"
]);
export async function onRequest(ctx:Context):Promise<Response>{
 const requestUrl=new URL(ctx.request.url),origin=ctx.request.headers.get("Origin");
 if(!requestUrl.pathname.startsWith("/api/"))return ctx.next();
 // Same-origin web clients require no CORS headers.
 if(!origin||origin===requestUrl.origin)return ctx.next();
 if(!MOBILE_ORIGINS.has(origin))
  return new Response("Origine non autorisée.",{status:403,headers:{"Cache-Control":"no-store"}});
 const cors=new Headers({
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":"Authorization,Content-Type",
  "Access-Control-Max-Age":"600",
  "Vary":"Origin"
 });
 if(ctx.request.method==="OPTIONS")
  return new Response(null,{status:204,headers:cors});
 const response=await ctx.next();
 const headers=new Headers(response.headers);
 for(const [key,value] of cors)headers.set(key,value);
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
