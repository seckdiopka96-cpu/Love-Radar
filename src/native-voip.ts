import {Capacitor,registerPlugin,type PluginListenerHandle} from "@capacitor/core";
import {apiFetch,isNativeApp} from "./api";

/** Native iOS CallKit / PushKit bridge. Never available in the web/PWA build. */
export type NativeVoipAction={action:"answer"|"end";callId:string;timestamp?:number};
type Device={deviceId:string;voipToken:string};
type Bridge={
 setSession(options:{token:string}):Promise<{ready:boolean}>;
 clearSession():Promise<void>;
 getDevice():Promise<Device>;
 getPendingAction():Promise<Partial<NativeVoipAction>>;
 ackAction(options:{callId:string}):Promise<void>;
 markAnswered(options:{callId:string}):Promise<void>;
 finishCall(options:{callId:string}):Promise<void>;
 addListener(name:"callAction",handler:(value:NativeVoipAction)=>void):Promise<PluginListenerHandle>;
 addListener(name:"tokenChanged",handler:(value:Device)=>void):Promise<PluginListenerHandle>;
};
const bridge=registerPlugin<Bridge>("NativeVoip");
const deviceRx=/^[0-9a-f-]{36}$/i;
const voipRx=/^[a-f0-9]{64,512}$/i;
export const hasNativeVoip=():boolean=>isNativeApp&&Capacitor.getPlatform()==="ios";
async function updateDevice(token:string,action:"register"|"unregister",device:Device):Promise<boolean>{
 if(!deviceRx.test(device.deviceId))return false;
 if(action==="register"&&(!voipRx.test(device.voipToken)||device.voipToken.length%2))return false;
 const response=await apiFetch("/api/voip",{
  method:"POST",cache:"no-store",
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({action,deviceId:device.deviceId,
   ...(action==="register"?{voipToken:device.voipToken}:{})})
 });
 return response.ok;
}
export async function activateNativeVoip(
 token:string,onCall:(action:NativeVoipAction)=>void
):Promise<()=>void>{
 if(!hasNativeVoip())return ()=>{};
 if(!/^[a-f0-9]{64}$/.test(token))return ()=>{};
 let active=true;
 // Register listeners BEFORE reading pending actions to avoid losing an answer
 // issued on the lock screen while the WebView was not yet running.
 const received=new Set<string>();
 const consume=async(action:Partial<NativeVoipAction>)=>{
  if(!active||!action.callId||!deviceRx.test(action.callId)||
   (action.action!=="answer"&&action.action!=="end"))return;
  const stamp=typeof action.timestamp==="number"?action.timestamp:0;
  if(stamp>0&&Math.abs(Date.now()/1000-stamp)>150)return;
  const signature=action.action+":"+action.callId+":"+stamp;
  if(received.has(signature))return;
  received.add(signature);
  onCall(action as NativeVoipAction);
  await bridge.ackAction({callId:action.callId}).catch(()=>{});
 };
 const calls=await bridge.addListener("callAction",value=>void consume(value));
 const changed=await bridge.addListener("tokenChanged",device=>{
  if(active)void updateDevice(token,"register",device).catch(()=>{});
 });
 try{
  await bridge.setSession({token});
  const device=await bridge.getDevice();
  if(active)void updateDevice(token,"register",device).catch(()=>{});
  await consume(await bridge.getPendingAction());
 }catch(error){
  calls.remove();changed.remove();
  throw error;
 }
 return ()=>{
  active=false;
  void calls.remove();
  void changed.remove();
  // Prevent a previous member receiving calls after logout or switching rooms.
  void bridge.getDevice().then(device=>updateDevice(token,"unregister",device)).catch(()=>{});
  void bridge.clearSession().catch(()=>{});
 };
}
export function nativeVoipAnswered(callId:string):void{
 if(hasNativeVoip())void bridge.markAnswered({callId}).catch(()=>{});
}
export function nativeVoipEnd(callId:string):void{
 if(hasNativeVoip())void bridge.finishCall({callId}).catch(()=>{});
}
