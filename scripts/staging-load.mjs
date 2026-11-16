#!/usr/bin/env node
// Safety-first load probe for a separate, disposable staging deployment.
// It NEVER creates accounts and refuses the known production address.
// Run with --synthetic in CI; actual traffic requires explicit opt-in.
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";

const args=new Set(process.argv.slice(2));
const synthetic=args.has("--synthetic");
const url=process.env.LOVE_RADAR_STAGING_URL||"";
const destination=process.env.LOVE_RADAR_LOAD_ROSTER||"";
const accepted=process.env.LOVE_RADAR_LOAD_CONFIRM==="STAGING_ONLY";
const maxUsers=Number(process.env.LOVE_RADAR_LOAD_USERS||24);
const iterations=Number(process.env.LOVE_RADAR_LOAD_ITERATIONS||12);
const concurrency=Number(process.env.LOVE_RADAR_LOAD_CONCURRENCY||8);
const production="https://love-radar-acd.pages.dev";

function percentile(values,p){
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return Number(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)].toFixed(1));
}
function summarize(samples){
 const ok=samples.filter(s=>s.status>=200&&s.status<300);
 const failed=samples.filter(s=>s.status===0||s.status>=400);
 const latencies=samples.map(s=>s.ms);
 return {
  requests:samples.length,success:ok.length,failed:failed.length,
  rateLimited:samples.filter(s=>s.status===429).length,
  serverErrors:samples.filter(s=>s.status>=500).length,
  isolationFailures:samples.filter(s=>s.isolationFailed).length,
  p50Ms:percentile(latencies,.50),p95Ms:percentile(latencies,.95),
  maximumMs:latencies.length?Math.round(Math.max(...latencies)):null
 };
}
if(!Number.isInteger(maxUsers)||maxUsers<2||maxUsers>2000||
 !Number.isInteger(iterations)||iterations<1||iterations>90||
 !Number.isInteger(concurrency)||concurrency<1||concurrency>80){
 console.error("Unsafe load parameters: users 2–2000, iterations 1–90, concurrency 1–80.");
 process.exit(2);
}

const tasks=[];
if(synthetic){
 // Exercises only measurement logic and guardrails; NO network requests.
 for(let i=0;i<maxUsers*iterations;i++)
  tasks.push({kind:i%10===0?"message":i%5===0?"snapshot":"status",roomId:"synthetic-"+Math.floor(i/2)});
 const samples=tasks.map((t,i)=>({
  status:200,ms:15+(i%19)*3,isolationFailed:false,kind:t.kind
 }));
 console.log(JSON.stringify({mode:"SYNTHETIC ONLY — no Cloudflare capacity measured",users:maxUsers,
  ...summarize(samples)},null,2));
 process.exit(0);
}

if(!accepted||!url||!destination){
 console.error("Live probe requires LOVE_RADAR_STAGING_URL, LOVE_RADAR_LOAD_ROSTER and LOVE_RADAR_LOAD_CONFIRM=STAGING_ONLY.");
 process.exit(2);
}
let origin;
try{
 const parsed=new URL(url);
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||
    parsed.pathname!=="/"&&parsed.pathname!==""||
    parsed.origin===production||
    !(parsed.hostname.includes("staging")||parsed.hostname.includes("preview")||parsed.hostname.includes("localhost"))){
  throw Error("Not a separate, explicitly named HTTPS staging or preview origin.");
 }
 origin=parsed.origin;
}catch(error){console.error("Unsafe staging URL:",error.message);process.exit(2)}
let roster;
try{
 roster=JSON.parse(readFileSync(destination,"utf8"));
 if(!Array.isArray(roster)||roster.length<2)throw Error("Expected at least 2 staging users");
 roster=roster.slice(0,maxUsers);
 if(roster.some(x=>typeof x.token!=="string"||!/^[0-9a-f]{64}$/.test(x.token)||
    typeof x.roomId!=="string"||!x.roomId))throw Error("Each staging user needs a token and roomId");
 if(new Set(roster.map(x=>x.token)).size!==roster.length)throw Error("Duplicate staging tokens");
 if(new Set(roster.map(x=>x.roomId)).size<2)throw Error("Isolation test requires multiple separate couples");
}catch(error){console.error("Unsafe roster:",error.message);process.exit(2)}
// Spread requests over time and cap active requests. Reuse only synthetic
// staging users that the operator has already created; do not log their tokens.
for(let step=0;step<iterations;step++){
 for(let userIndex=0;userIndex<roster.length;userIndex++){
  const user=roster[userIndex];
  tasks.push({user,kind:step%10===0?"message":step%4===0?"snapshot":"status",step});
 }
}
const samples=[];
let cursor=0;
async function worker(){
 while(cursor<tasks.length){
  const task=tasks[cursor++];
  const start=performance.now();
  let status=0,isolationFailed=false;
  const controller=new AbortController();
  const deadline=setTimeout(()=>controller.abort(),10000);
  try{
   const target=task.kind==="status"?"/api/love?status=1":"/api/love";
   const method=task.kind==="message"?"POST":"GET";
   const response=await fetch(origin+target,{
    method,headers:{
     Authorization:"Bearer "+task.user.token,
     ...(method==="POST"?{"Content-Type":"application/json"}:{})
    },
    ...(method==="POST"?{body:JSON.stringify({action:"message",text:"Staging load probe "+task.step,messageId:randomUUID()})}:{}),
    signal:controller.signal,cache:"no-store"
   });
   status=response.status;
   const body=await response.json().catch(()=>null);
   if(response.ok&&task.kind==="snapshot"){
    if(!body?.ok||body.roomId!==task.user.roomId)isolationFailed=true;
    const messages=Array.isArray(body?.messages)?body.messages:[];
    if(messages.some(m=>m.room_id&&m.room_id!==task.user.roomId))isolationFailed=true;
   }
   if(response.ok&&task.kind==="status"&&typeof body?.revision!=="number")isolationFailed=true;
  }catch{status=0}
  finally{clearTimeout(deadline)}
  samples.push({status,ms:performance.now()-start,isolationFailed,kind:task.kind});
  // Avoid an instantaneous request stampede even at maximum concurrency.
  await new Promise(resolve=>setTimeout(resolve,120));
 }
}
const started=performance.now();
await Promise.all(Array.from({length:Math.min(concurrency,roster.length)},()=>worker()));
const result={mode:"STAGING NETWORK PROBE",users:roster.length,
 couples:new Set(roster.map(x=>x.roomId)).size,
 seconds:Number(((performance.now()-started)/1000).toFixed(2)),
 ...summarize(samples)};
console.log(JSON.stringify(result,null,2));
if(result.isolationFailures>0||result.serverErrors>0||result.failed>result.requests*.05)process.exitCode=1;
