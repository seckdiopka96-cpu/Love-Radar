import {registerPlugin} from "@capacitor/core";
import {isNativeApp} from "./api";

/** Calls into our generated Capacitor bridge, only for native installed apps.
 * The PWA cannot promise background microphone access on iOS. */
type CallBridge={
 beginCall(options:{id:string;token:string}):Promise<{active?:boolean}|void>;
 endCall():Promise<void>;
};
const bridge=registerPlugin<CallBridge>("NativeCall");
let desired:string|null=null;
let running:string|null=null;
let operations:Promise<unknown>=Promise.resolve();

function serialize<T>(run:()=>Promise<T>):Promise<T>{
 const result=operations.catch(()=>{}).then(run);
 operations=result.catch(()=>{});
 return result;
}
export async function beginNativeCallSession(id:string,token:string):Promise<boolean>{
 if(!isNativeApp)return false;
 if(desired===id&&running===id)return true;
 desired=id;
 return serialize(async()=>{
  if(desired!==id)return false;
  if(running&&running!==id){
   try{await bridge.endCall()}finally{running=null}
  }
  await bridge.beginCall({id,token});
  running=id;
  // The user might have hung up while Android service was starting.
  if(desired!==id){
   await bridge.endCall();
   running=null;
   return false;
  }
  return true;
 });
}
export async function endNativeCallSession():Promise<void>{
 if(!isNativeApp)return;
 desired=null;
 return serialize(async()=>{
  // End is idempotent, including when the first native start failed.
  if(running){
   try{await bridge.endCall()}finally{running=null}
  }
 });
}
export function nativeCallSessionRunning(id:string):boolean{
 return isNativeApp&&running===id;
}
