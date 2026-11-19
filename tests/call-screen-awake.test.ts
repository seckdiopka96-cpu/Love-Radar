import test from "node:test";
import assert from "node:assert/strict";
import {keepCallScreenAwake} from "../src/call-screen-awake";

function fakePage(){
 const listeners=new Set<()=>void>();
 const page={
  visibilityState:"visible" as DocumentVisibilityState,
  addEventListener:(_type:string,fn:EventListenerOrEventListenerObject)=>{listeners.add(fn as ()=>void)},
  removeEventListener:(_type:string,fn:EventListenerOrEventListenerObject)=>{listeners.delete(fn as ()=>void)}
 };
 return {page:page as unknown as Document,
  hide:()=>{page.visibilityState="hidden";listeners.forEach(fn=>fn())},
  show:()=>{page.visibilityState="visible";listeners.forEach(fn=>fn())},
  listeners};
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

test("wake lock acquired during call and released at hangup",async()=>{
 const {page,listeners}=fakePage();
 let count=0,released=0;
 const stop=keepCallScreenAwake(page,{wakeLock:{request:async()=>{count++;return {release:async()=>{released++}}}}});
 await flush();
 assert.equal(count,1);
 stop();
 await flush();
 assert.equal(released,1);
 assert.equal(listeners.size,0);
});

test("a pending wake lock gets released when the call ends",async()=>{
 const {page}=fakePage();
 let resolveRequest!:(value:{release():Promise<void>})=>void;
 const pending=new Promise<{release():Promise<void>}>(resolve=>{resolveRequest=resolve});
 let released=0;
 const stop=keepCallScreenAwake(page,{wakeLock:{request:()=>pending}});
 stop();
 resolveRequest({release:async()=>{released++}});
 await flush();
 assert.equal(released,1);
});

test("a system-released lock is requested again when returning to foreground",async()=>{
 const {page,hide,show}=fakePage();
 let requested=0,releaseEvent:(()=>void)|null=null;
 const stop=keepCallScreenAwake(page,{wakeLock:{request:async()=>{
  requested++;
  return {release:async()=>{},addEventListener:(_type:"release",fn:()=>void)=>{releaseEvent=fn}};
 }}});
 await flush();
 assert.equal(requested,1);
 hide();
 if(releaseEvent)releaseEvent();
 show();
 await flush();
 assert.equal(requested,2);
 stop();
});
