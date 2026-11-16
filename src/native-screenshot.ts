import {Capacitor,registerPlugin,type PluginListenerHandle} from "@capacitor/core";
import {isNativeApp} from "./api";

type NativeEvent={capturedAt:number};
type NativeCaptureBridge={
 availability():Promise<{detectsAfterCapture:boolean;preventsCapture:boolean}>;
 addListener(eventName:"screenshotTaken",
  listener:(event:NativeEvent)=>void):Promise<PluginListenerHandle>;
};
const nativeCapture=registerPlugin<NativeCaptureBridge>("NativeCapture");

export function screenshotDetectionAvailable():boolean{
 // There is no browser/PWA API to detect ordinary iOS screenshots.
 return isNativeApp&&Capacitor.getPlatform()==="ios";
}
export async function watchNativeScreenshots(onTaken:()=>void):Promise<()=>void>{
 if(!screenshotDetectionAvailable())return()=>{};
 const plugin=await nativeCapture.addListener("screenshotTaken",()=>{
  if(document.visibilityState==="visible")onTaken();
 });
 return()=>{void plugin.remove()};
}
