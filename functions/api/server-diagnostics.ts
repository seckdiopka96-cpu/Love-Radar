import type {D1Database,R2Bucket} from "@cloudflare/workers-types";
import {consumeMemberLimit,throttled,type LimitRule} from "../lib/abuse-limits";

/**
 * On-demand, authenticated server storage check.
 * Uses a random, private R2 object; never accesses users' media or messages.
 * It is deliberately NOT an automated health poll or load generator.
 */
type Env={DB?:D1Database;STORAGE?:R2Bucket};
type Context={request:Request;env:Env};
const RULE:LimitRule={scope:"storage-diagnostic",max:3,windowMs:60*60*1000};
const json=(body:Record<string,unknown>,status=200)=>Response.json(body,{
 status,headers:{"Cache-Control":"no-store","Pragma":"no-cache","X-Content-Type-Options":"nosniff"}
});
async function authenticate(request:Request,db:D1Database):Promise<string|null>{
 const authorization=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return null;
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(authorization.slice(7)));
 const digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
 const member=await db.prepare("SELECT id FROM members WHERE token_hash=?")
  .bind(digest).first<{id:string}>();
 return member?.id||null;
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 const started=performance.now();
 if(!env.DB||!env.STORAGE)return json({ok:false,database:env.DB?"available":"missing",
  storage:env.STORAGE?"available":"missing",error:"Bindings D1 ou R2 indisponibles."},503);
 let memberId:string|null;
 try{memberId=await authenticate(request,env.DB)}
 catch(error){console.error("Server diagnostics D1 auth failed",error);return json({
  ok:false,database:"error",storage:"not-tested",error:"Base D1 indisponible."},503)}
 if(!memberId)return json({ok:false,error:"Session requise."},401);
 try{
  if(!await consumeMemberLimit(env.DB,memberId,RULE))return throttled(RULE);
 }catch(error){console.error("Server diagnostics rate limit",error);return json({
  ok:false,database:"error",storage:"not-tested",error:"Base D1 indisponible."},503)}

 const key="_love_radar_server_checks/"+crypto.randomUUID();
 const expected=crypto.getRandomValues(new Uint8Array(48));
 let attempted=false;
 let storage:"ok"|"error"="error",cleanup:"ok"|"error"="error";
 try{
  attempted=true;
  await env.STORAGE.put(key,expected,{httpMetadata:{contentType:"application/octet-stream"}});
  const object=await env.STORAGE.get(key);
  if(!object)throw Error("Temporary object was not found");
  const received=new Uint8Array(await object.arrayBuffer());
  let difference=received.length^expected.length;
  for(let i=0;i<expected.length;i++)difference|=expected[i]^(received[i]??0);
  if(difference!==0)throw Error("Temporary object differs from written bytes");
  storage="ok";
 }catch(error){
  console.error("Server diagnostics R2 probe failed",error);
 }finally{
  if(attempted){
   try{await env.STORAGE.delete(key);cleanup="ok"}
   catch(error){console.error("Server diagnostics R2 cleanup failed",error)}
  }
 }
 const ok=storage==="ok"&&cleanup==="ok";
 return json({ok,database:"ok",storage,cleanup,latencyMs:Math.round(performance.now()-started),
  ...(ok?{}:{error:"Test du stockage R2 incomplet ou impossible."})},ok?200:503);
}
