import {useCallback,useEffect,useRef,useState} from "react";

type SoundKind="roll"|"step"|"capture"|"win"|"reaction";

// Short, original WebAudio effects, including physical die rattles and a soft
// per-square pawn tap. Generated on device without streaming or sound files.
export function useLudoSounds(){
 const [enabled,setEnabled]=useState(true);
 const audio=useRef<AudioContext|null>(null);
 const noise=useRef<AudioBuffer|null>(null);
 const lastStep=useRef(-1);
 const unlock=useCallback(()=>{
  try{
   if(!window.AudioContext)return;
   if(!audio.current||audio.current.state==="closed"){
    audio.current=new AudioContext();
    noise.current=null;
   }
   if(audio.current.state==="suspended")void audio.current.resume().catch(()=>{});
  }catch{/* Audio unavailable; gameplay must still work. */}
 },[]);
 const play=useCallback((kind:SoundKind)=>{
  if(!enabled||!audio.current||audio.current.state!=="running"||document.hidden)return;
  const context=audio.current;
  const now=context.currentTime+.007;
  if(kind==="roll"||kind==="step"){
   try{
    if(!noise.current||noise.current.sampleRate!==context.sampleRate){
     const length=Math.floor(context.sampleRate*.052);
     const buffer=context.createBuffer(1,length,context.sampleRate);
     const channel=buffer.getChannelData(0);
     for(let i=0;i<length;i++){
      channel[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.1);
     }
     noise.current=buffer;
    }
    const clack=(time:number,pitch:number,volume:number)=>{
     const src=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
     src.buffer=noise.current;
     filter.type="bandpass";
     filter.frequency.setValueAtTime(pitch,time);
     filter.Q.value=.75;
     gain.gain.setValueAtTime(volume,time);
     gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
     src.connect(filter);filter.connect(gain);gain.connect(context.destination);
     src.start(time);src.stop(time+.052);
    };
    if(kind==="roll"){
     // Plastic die clattering on the board, ending in a tabletop clack.
     for(const [delay,pitch,volume] of [
      [0,1820,.20],[.029,2250,.19],[.061,1460,.23],
      [.096,2050,.23],[.137,1560,.27],[.186,1050,.35],[.226,1300,.40]
     ]){
      clack(now+delay,pitch,volume);
     }
    }else if(now-lastStep.current>=.075){
     lastStep.current=now;
     clack(now,1270,.16);
    }
   }catch{/* Do not block movement if sound is unavailable. */}
   return;
  }
  const notes=kind==="capture"?[
   {hz:730,time:0,dur:.14,volume:.042,type:"triangle" as OscillatorType},
   {hz:480,time:.125,dur:.19,volume:.046,type:"triangle" as OscillatorType}
  ]:kind==="reaction"?[
   {hz:640,time:0,dur:.085,volume:.022,type:"sine" as OscillatorType},
   {hz:890,time:.073,dur:.095,volume:.027,type:"sine" as OscillatorType}
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
