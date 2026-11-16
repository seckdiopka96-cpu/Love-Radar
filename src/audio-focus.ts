/** Single-device audio focus for Love Radar.
 * Live WebRTC calls take priority over voice recording; recording blocks
 * message playback. A new message player pauses any other audio/video.
 * No microphone or audio data leaves this module. */
export type ExclusiveAudioMode="idle"|"recording"|"call";
export type AudioInterrupt={source:"recording"|"call"|"playback";owner?:string};
let mode:ExclusiveAudioMode="idle";
const interrupt=(detail:AudioInterrupt)=>{
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent<AudioInterrupt>("lr-audio-interrupt",{detail}));
};
function pauseOtherMedia(except?:HTMLMediaElement){
 if(typeof document==="undefined")return;
 document.querySelectorAll("audio,video").forEach(element=>{
  if(element!==except&&element instanceof HTMLMediaElement&&
    !element.paused){try{element.pause()}catch{/* Embedded player may own its controls. */}}
 });
}
export function audioMode(){return mode}
export function isCallAudioActive(){return mode==="call"}
export function isRecordingAudioActive(){return mode==="recording"}
export function hasExclusiveAudioCapture(){return mode==="call"||mode==="recording"}
export function claimRecordingAudio():boolean{
 if(mode==="call")return false;
 if(mode==="recording")return false;
 mode="recording";
 pauseOtherMedia();interrupt({source:"recording"});
 return true;
}
export function releaseRecordingAudio(){
 if(mode==="recording"){mode="idle";if(typeof window!=="undefined")window.dispatchEvent(new Event("lr-audio-focus-released"))}
}
export function claimCallAudio(){
 if(mode!=="call"){mode="call";pauseOtherMedia();interrupt({source:"call"})}
}
export function releaseCallAudio(){
 if(mode==="call"){mode="idle";if(typeof window!=="undefined")window.dispatchEvent(new Event("lr-audio-focus-released"))}
}
export function claimMessagePlayback(owner:string,except?:HTMLMediaElement):boolean{
 if(hasExclusiveAudioCapture())return false;
 pauseOtherMedia(except);interrupt({source:"playback",owner});
 return true;
}
/** Handles native HTML controls, including the voice-note fallback and push preview.
 * Add once to the document; remote WebRTC is exempt only during a real call. */
export function installAudioPlaybackGuard(){
 if(typeof document==="undefined")return ()=>{};
 const onPlay=(event:Event)=>{
  const target=event.target;
  if(!(target instanceof HTMLMediaElement))return;
  if(target.dataset.lrCallAudio==="true"){
   if(mode!=="call")target.pause();
   return;
  }
  if(hasExclusiveAudioCapture()){target.pause();return}
  pauseOtherMedia(target);
  interrupt({source:"playback",owner:target.dataset.lrAudioOwner||undefined});
 };
 document.addEventListener("play",onPlay,true);
 return()=>document.removeEventListener("play",onPlay,true);
}
