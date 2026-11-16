import {useEffect,useMemo,useRef,useState} from "react";
import {audioDuration,formatVoiceTime,voiceBars} from "./voice-waveform";
import {claimMessagePlayback,hasExclusiveAudioCapture,type AudioInterrupt} from "./audio-focus";
import "./voice-message.css";

type Props={src:string;id:string;mine:boolean;time:string;delivery?:"read"|"sent";onOpenActions?:()=>void};
type PlayEvent=CustomEvent<string>;

/** Functional audio note: actual playback, scrub, duration and one-at-a-time listening. */
export default function VoiceMessage({src,id,mine,time,delivery,onOpenActions}:Props){
 const audio=useRef<HTMLAudioElement|null>(null);
 const fallbackAudio=useRef<HTMLAudioElement|null>(null);
 const [playing,setPlaying]=useState(false);
 const [duration,setDuration]=useState(0);
 const [position,setPosition]=useState(0);
 const [error,setError]=useState("");
 const [fallback,setFallback]=useState(false);
 const bars=useMemo(()=>voiceBars(id),[id]);
 const progress=duration>0?Math.min(1,Math.max(0,position/duration)):0;
 useEffect(()=>{
  const stopOther=(event:Event)=>{
   if((event as PlayEvent).detail===id)return;
   audio.current?.pause();
   setPlaying(false);
  };
  const stopOnAudioFocus=(event:Event)=>{
   const detail=(event as CustomEvent<AudioInterrupt>).detail;
   if(detail?.source==="playback"&&detail.owner===id)return;
   audio.current?.pause();fallbackAudio.current?.pause();setPlaying(false);
  };
  window.addEventListener("lr-voice-playing",stopOther);
  window.addEventListener("lr-audio-interrupt",stopOnAudioFocus);
  return()=>{
   window.removeEventListener("lr-voice-playing",stopOther);
   window.removeEventListener("lr-audio-interrupt",stopOnAudioFocus);
   audio.current?.pause();fallbackAudio.current?.pause();
  };
 },[id]);
 useEffect(()=>{
  setPlaying(false);setDuration(0);setPosition(0);setError("");setFallback(false);
 },[src]);
 function updateDuration(){
  const element=audio.current;
  if(!element)return;
  const d=audioDuration(element.duration);
  if(d>0)setDuration(d);
  else if(element.seekable.length){
   const end=element.seekable.end(element.seekable.length-1);
   if(audioDuration(end)>0)setDuration(end);
  }
 }
 function updatePosition(){
  const current=audio.current;
  if(!current)return;
  const value=Number.isFinite(current.currentTime)?current.currentTime:0;
  setPosition(value);
  if(duration===0)updateDuration();
 }
 async function toggle(){
  const element=audio.current;
  if(!element)return;
  if(!element.paused){element.pause();setPlaying(false);return}
  setError("");
  if(hasExclusiveAudioCapture()){
   setError("Termine l'appel ou l'enregistrement en cours avant d'écouter ce vocal.");
   return;
  }
  try{
   if(!claimMessagePlayback(id,element)){setError("Une autre activité utilise le son.");return}
   window.dispatchEvent(new CustomEvent<string>("lr-voice-playing",{detail:id}));
   // The call begins within the original user gesture, as required by iOS.
   await element.play();
   setPlaying(true);
   updateDuration();
  }catch{
   setPlaying(false);setError("Lecture impossible. Utilise le lecteur classique.");
   setFallback(true);
  }
 }
 function seek(value:number){
  const element=audio.current;
  if(!element||duration<=0)return;
  const time=Math.max(0,Math.min(duration,value));
  try{element.currentTime=time;setPosition(time)}catch{/* Some iOS media cannot seek until buffered. */}
 }
 const progressText=formatVoiceTime(position);
 const totalText=formatVoiceTime(duration);
 return <div className={"lr-voice-note"+(mine?" is-own":" is-partner")}>
  <audio ref={audio} data-lr-audio-owner={id} src={src} preload="metadata" playsInline
   onLoadedMetadata={updateDuration} onDurationChange={updateDuration}
   onTimeUpdate={updatePosition}
   onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
   onEnded={()=>{setPlaying(false);setPosition(0);if(audio.current)audio.current.currentTime=0}}
   onError={()=>{setPlaying(false);setError("Ce vocal ne peut pas être lu.");setFallback(true)}}/>
  <div className="lr-voice-note-main">
   <button type="button" className="lr-voice-note-play" onClick={()=>void toggle()}
    aria-label={(playing?"Mettre en pause":"Lire")+" le message vocal"} aria-pressed={playing}>
    {playing?<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.4"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.4"/></svg>:
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.4c0-.9 1-1.5 1.8-1l12 7.1c.8.5.8 1.5 0 2l-12 7.1c-.8.5-1.8 0-1.8-1V4.4z"/></svg>}
   </button>
   <div className="lr-voice-note-content">
    <div className="lr-voice-note-wave-wrap">
     <div className="lr-voice-note-wave" aria-hidden="true">
      {bars.map((height,i)=><span key={i} className={i/bars.length<=progress?"played":""}
       style={{height:height+"%"}}/>)}
     </div>
     {duration>0?<span className={"lr-voice-note-playhead"+(playing?" is-playing":"")} style={{left:(progress*100)+"%"}} aria-hidden="true"/>:null}
     <input className="lr-voice-note-seek" type="range" min="0" max={duration>0?duration:1}
      step="0.01" value={position} disabled={duration===0}
      aria-label="Déplacer la lecture du message vocal"
      onChange={event=>seek(Number(event.target.value))}/>
    </div>
    <div className="lr-voice-note-meta">
     <span className="lr-voice-note-duration" aria-label={"Progression "+progressText+" sur "+totalText}>
      {playing||position>0?progressText:totalText}
     </span>
     <span className="lr-voice-note-time">{time}{mine&&delivery?<span className="lr-voice-note-check" aria-label={delivery==="read"?"Lu":"Envoyé"}> {delivery==="read"?"✓✓":"✓"}</span>:null}</span>
    </div>
   </div>
   {onOpenActions?<button type="button" className="lr-voice-note-actions" aria-label="Réagir ou afficher les options du message vocal"
    title="Réactions et options du vocal" onPointerDown={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}
    onClick={e=>{e.stopPropagation();onOpenActions()}}>
    <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
   </button>:null}
  </div>
  {error?<div className="lr-voice-note-error" role="alert">{error}</div>:null}
  {fallback?<audio ref={fallbackAudio} data-lr-audio-owner={id} className="lr-voice-note-fallback" src={src} controls preload="metadata" aria-label="Lecteur vocal classique"/>:null}
 </div>;
}
