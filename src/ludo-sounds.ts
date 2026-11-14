import {useCallback,useEffect,useRef,useState} from "react";

type SoundKind="roll"|"step"|"capture"|"win";
// Short original WebAudio effects: no external audio or copyrighted melody.
export function useLudoSounds(){
 const [enabled,setEnabled]=useState(true);
 const audio=useRef<AudioContext|null>(null);
 const unlock=useCallback(()=>{
  try{
   if(!window.AudioContext)return;
   if(!audio.current)audio.current=new AudioContext();
   if(audio.current.state==="suspended")void audio.current.resume().catch(()=>{});
  }catch{/* Audio unavailable; gameplay must still work. */}
 },[]);
 const play=useCallback((kind:SoundKind)=>{
  if(!enabled||!audio.current||audio.current.state==="closed")return;
  const context=audio.current;
  const now=context.currentTime;
  const notes=kind==="roll"?
   [320,400,500,620].map((hz,i)=>({hz,time:i*.059,dur:.047,volume:.025,type:"triangle" as OscillatorType})):
   kind==="step"?[{hz:680,time:0,dur:.057,volume:.014,type:"sine" as OscillatorType}]:
   kind==="capture"?[
    {hz:730,time:0,dur:.14,volume:.042,type:"triangle" as OscillatorType},
    {hz:480,time:.125,dur:.19,volume:.046,type:"triangle" as OscillatorType}
   ]:
   [523,659,784,1047].map((hz,i)=>({hz,time:i*.12,dur:.22,volume:.038,type:"sine" as OscillatorType}));
  for(const note of notes)try{
   const start=now+note.time;
   const oscillator=context.createOscillator(),gain=context.createGain();
   oscillator.type=note.type;
   oscillator.frequency.setValueAtTime(note.hz,start);
   gain.gain.setValueAtTime(.0001,start);
   gain.gain.exponentialRampToValueAtTime(note.volume,start+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,start+note.dur);
   oscillator.connect(gain);gain.connect(context.destination);
   oscillator.start(start);oscillator.stop(start+note.dur+.02);
  }catch{/* Some audio contexts may be unavailable. */}
 },[enabled]);
 const toggle=useCallback(()=>{
  if(!enabled)unlock();
  setEnabled(value=>!value);
 },[enabled,unlock]);
 useEffect(()=>()=>{const ctx=audio.current;audio.current=null;if(ctx&&ctx.state!=="closed")void ctx.close().catch(()=>{});},[]);
 return {enabled,unlock,play,toggle};
}
