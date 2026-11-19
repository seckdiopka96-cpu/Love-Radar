/** Best-effort web/PWA screen wake lock. Native apps also use OS idle timers.
 * Only prevents automatic sleep; never overrides the physical lock button.
 */
type WakeHandle={released?:boolean;release():Promise<void>;addEventListener?(type:"release",handler:()=>void):void};
type WakeDevice={wakeLock?:{request(type:"screen"):Promise<WakeHandle>}};
type WakePage=Pick<Document,"visibilityState"|"addEventListener"|"removeEventListener">;

export function keepCallScreenAwake(
 page:WakePage=document,
 device:WakeDevice=navigator as unknown as WakeDevice
):()=>void{
 const wakeLock=device.wakeLock;
 if(!wakeLock)return()=>{};
 let ended=false;
 let held:WakeHandle|null=null;
 let requesting=false;
 let retryWhenReady=false;
 const acquire=async()=>{
  if(ended||page.visibilityState!=="visible"||held)return;
  if(requesting){retryWhenReady=true;return}
  requesting=true;
  try{
   const next=await wakeLock.request("screen");
   if(ended||page.visibilityState!=="visible"){
    await next.release().catch(()=>{});
    return;
   }
   held=next;
   next.addEventListener?.("release",()=>{if(held===next)held=null});
  }catch{/* The browser or OS may deny a wake lock. */}
  finally{
   requesting=false;
   if(retryWhenReady){
    retryWhenReady=false;
    if(!ended&&page.visibilityState==="visible"&&!held)void acquire();
   }
  }
 };
 const onVisibility=()=>{if(page.visibilityState==="visible")void acquire()};
 page.addEventListener("visibilitychange",onVisibility);
 void acquire();
 return()=>{
  ended=true;
  page.removeEventListener("visibilitychange",onVisibility);
  const previous=held;held=null;
  if(previous&&!previous.released)void previous.release().catch(()=>{});
 };
}
