import {useEffect,useMemo,useRef,useState} from "react";
import {audioDuration,formatVoiceTime,voiceBars} from "./voice-waveform";
import {claimMessagePlayback,hasExclusiveAudioCapture,type AudioInterrupt} from "./audio-focus";
import {nextVoiceSpeed,type VoiceSpeed} from "./voice-sequence";
import {receiptGlyph,receiptAccessibleLabel,type DeliveryReceipt} from "./message-delivery";
import "./voice-message.css";

type Props={
 src:string;id:string;mine:boolean;time:string;delivery?:DeliveryReceipt;
 avatarSrc?:string;avatarName:string;onOpenProfile?:()=>void;
 speed:VoiceSpeed;onSpeedChange:(speed:VoiceSpeed)=>void;
 autoPlay?:boolean;onFinished?:()=>void;onManualPlay?:()=>void;onAutoPlayConsumed?:()=>void
};
type PlayEvent=CustomEvent<string>;

/** Functional audio note: actual playback, scrub, duration and one-at-a-time listening. */
export default function VoiceMessage({src,id,mine,time,delivery,avatarSrc,avatarName,onOpenProfile,speed,onSpeedChange,autoPlay=false,onFinished,onManualPlay,onAutoPlayConsumed}:Props){
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
   audio.current?.pause();fallbackAudio.current?.pause();
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
 useEffect(()=>{
  if(audio.current)audio.current.playbackRate=speed;
  if(fallbackAudio.current)fallbackAudio.current.playbackRate=speed;
 },[src,speed]);
 useEffect(()=>{
  if(!autoPlay)return;
  // A queued note can mount later when its encrypted media finishes loading.
  // Safari can reject play() without another tap; then show a clear prompt.
  void playVoice(true);
 },[autoPlay,src]);

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
 async function playVoice(automatic=false){
  const element=audio.current;
  if(!element)return;
  if(!automatic)onManualPlay?.();
  setError("");
  if(hasExclusiveAudioCapture()){
   if(automatic)onAutoPlayConsumed?.();
   setError("Termine l'appel ou l'enregistrement en cours avant d'écouter ce vocal.");
   return;
  }
  try{
   if(!claimMessagePlayback(id,element)){
    if(automatic)onAutoPlayConsumed?.();
    setError("Une autre activité utilise le son.");return;
   }
   window.dispatchEvent(new CustomEvent<string>("lr-voice-playing",{detail:id}));
   element.playbackRate=speed;
   // On a tap the call occurs synchronously, as required by iOS audio policies.
   await element.play();
   setPlaying(!element.paused);
   updateDuration();
   if(automatic)onAutoPlayConsumed?.();
  }catch{
   setPlaying(false);
   if(automatic){
    onAutoPlayConsumed?.();
    setError("Lecture automatique bloquée par le téléphone. Appuie sur ▶ pour continuer.");
   }else{
    setError("Lecture impossible. Utilise le lecteur classique.");
    setFallback(true);
   }
  }
 }
 function toggle(){
  const element=audio.current;
  if(!element)return;
  if(!element.paused){
   element.pause();setPlaying(false);onAutoPlayConsumed?.();
   return;
  }
  void playVoice(false);
 }
 function changeSpeed(){
  const next=nextVoiceSpeed(speed);
  if(audio.current)audio.current.playbackRate=next;
  if(fallbackAudio.current)fallbackAudio.current.playbackRate=next;
  onSpeedChange(next);
 }
 function seek(value:number){
  const element=audio.current;
  if(!element||duration<=0)return;
  const time=Math.max(0,Math.min(duration,value));
  try{element.currentTime=time;setPosition(time)}catch{/* Some iOS media cannot seek until buffered. */}
 }
 const progressText=formatVoiceTime(position);
 const totalText=formatVoiceTime(duration);
 const avatarControl=<div className={"lr-voice-note-identity"+(playing?" is-active":"")}>
  {playing?<button type="button" className="lr-voice-note-speed"
    onClick={event=>{event.stopPropagation();changeSpeed()}}
    onPointerDown={event=>event.stopPropagation()}
    aria-label={"Vitesse de lecture : "+speed+" fois. Appuyer pour accélérer"}
    title={"Vitesse de lecture "+speed+"×"}>{speed}×</button>:
   <button type="button" className="lr-voice-note-avatar" disabled={!onOpenProfile}
    onClick={event=>{event.stopPropagation();onOpenProfile?.()}}
    onPointerDown={event=>event.stopPropagation()}
    aria-label={"Voir la photo de profil de "+avatarName}
    title={"Profil de "+avatarName}>
    {avatarSrc?<img src={avatarSrc} alt="" loading="lazy" />:
     <span className="lr-voice-note-avatar-initial" aria-hidden="true">{avatarName.trim().charAt(0).toUpperCase()||"♥"}</span>}
    <span className="lr-voice-note-mic" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none">
     <rect x="5.2" y="1.4" width="5.6" height="9.2" rx="2.8" fill="currentColor"/>
     <path d="M3.4 7.8a4.6 4.6 0 0 0 9.2 0M8 12.3v2.3m-2.5 0h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg></span>
   </button>}
 </div>;
 return <div className={"lr-voice-note"+(mine?" is-own":" is-partner")}>
  <audio ref={audio} data-lr-audio-owner={id} src={src} preload="metadata" playsInline
   onLoadedMetadata={updateDuration} onDurationChange={updateDuration}
   onTimeUpdate={updatePosition}
   onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
   onEnded={()=>{setPlaying(false);setPosition(0);if(audio.current)audio.current.currentTime=0;onFinished?.()}}
   onError={()=>{setPlaying(false);setError("Ce vocal ne peut pas être lu.");setFallback(true)}}/>
  <div className="lr-voice-note-main">
   {mine?avatarControl:null}
   <button type="button" className="lr-voice-note-play" onClick={toggle}
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
     <span className="lr-voice-note-time">{time}{mine&&delivery?<span className={"lr-voice-note-check "+(delivery==="read"?"is-read":"")} aria-label={receiptAccessibleLabel(delivery)}> {receiptGlyph(delivery)}</span>:null}</span>
    </div>
   </div>
   {!mine?avatarControl:null}
  </div>
  {error?<div className="lr-voice-note-error" role="alert">{error}</div>:null}
  {fallback?<audio ref={fallbackAudio} data-lr-audio-owner={id} className="lr-voice-note-fallback"
  src={src} controls preload="metadata" aria-label="Lecteur vocal classique"
  onLoadedMetadata={e=>{e.currentTarget.playbackRate=speed}}
  onEnded={()=>onFinished?.()}/>:null}
 </div>;
}
