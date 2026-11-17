/**
 * Love Radar's original, generated call tones.
 * Outgoing: familiar paired ringback notes. Incoming: distinctive chime.
 * Never downloads/plays an external sound; no personal or call data is stored.
 *
 * iOS permits Web Audio only after interaction. primeCallTone() should run on
 * a button tap; if an incoming call arrives in a suspended audio context,
 * a visible "Activer la sonnerie" control can unlock it.
 */
export type CallToneKind="incoming"|"outgoing";

let context:AudioContext|null=null;
let activeKind:CallToneKind|null=null;
let repeating:number|null=null;
const sounding=new Set<OscillatorNode>();
let generation=0;

function getContext():AudioContext|null{
 if(typeof window==="undefined")return null;
 if(context&&context.state!=="closed")return context;
 const audioWindow=window as Window & {webkitAudioContext?:typeof AudioContext};
 const Ctor=window.AudioContext||audioWindow.webkitAudioContext;
 if(!Ctor)return null;
 try{
  context=new Ctor();
  return context;
 }catch{return null}
}

function pulse(frequencies:number[],offset:number,duration:number){
 const ctx=context;
 if(!ctx||ctx.state!=="running")return;
 const start=ctx.currentTime+offset;
 const end=start+duration;
 for(const frequency of frequencies){
  const oscillator=ctx.createOscillator();
  const envelope=ctx.createGain();
  oscillator.type="sine";
  oscillator.frequency.setValueAtTime(frequency,start);
  envelope.gain.setValueAtTime(0.0001,start);
  envelope.gain.exponentialRampToValueAtTime(0.085,start+0.032);
  envelope.gain.setValueAtTime(0.085,Math.max(start+0.033,end-0.07));
  envelope.gain.exponentialRampToValueAtTime(0.0001,end);
  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.onended=()=>{
   sounding.delete(oscillator);
   oscillator.disconnect();
   envelope.disconnect();
  };
  sounding.add(oscillator);
  oscillator.start(start);
  oscillator.stop(end+0.012);
 }
}

function ringOnce(kind:CallToneKind){
 if(!context||context.state!=="running")return;
 if(kind==="outgoing"){
  // Two soft ringback bursts and a pause; different from an answered call.
  pulse([440,480],0,0.72);
  pulse([440,480],0.88,0.72);
 }else{
  // A warmer double chime for an incoming call.
  pulse([587.33,783.99],0,0.37);
  pulse([698.46,880],0.5,0.37);
  pulse([587.33,783.99],1.0,0.37);
 }
}

export function stopCallTone():void{
 generation++;
 activeKind=null;
 if(repeating!==null){window.clearInterval(repeating);repeating=null}
 for(const tone of sounding){
  tone.onended=null;
  try{tone.stop()}catch{/* Already stopped */ }
  try{tone.disconnect()}catch{/* Audio context is closing */ }
 }
 sounding.clear();
}

export async function primeCallTone():Promise<boolean>{
 const ctx=getContext();
 if(!ctx)return false;
 try{
  if(ctx.state!=="running")await ctx.resume();
  return ctx.state==="running";
 }catch{return false}
}

export function startCallTone(kind:CallToneKind,onAvailability?:(available:boolean)=>void):void{
 stopCallTone();
 const token=generation;
 const ctx=getContext();
 if(!ctx){onAvailability?.(false);return}
 const begin=()=>{
  if(generation!==token||activeKind!==kind)return;
  if(ctx.state!=="running"){onAvailability?.(false);return}
  onAvailability?.(true);
  ringOnce(kind);
  repeating=window.setInterval(()=>{
   if(generation!==token||activeKind!==kind)return;
   if(document.visibilityState==="hidden")return;
   if(ctx.state==="running")ringOnce(kind);
  },kind==="outgoing"?3800:2900);
 };
 activeKind=kind;
 if(ctx.state==="running")begin();
 else{
  onAvailability?.(false);
  void ctx.resume().then(begin).catch(()=>onAvailability?.(false));
 }
}
