import {useEffect,useState,type CSSProperties} from "react";
import {ACTIVITY_FRAMES,typingDotFrame,microphoneFrame,voiceWaveFrame} from "./activity-frames";

/** Real state-driven animation instead of CSS keyframes alone: iOS standalone
 * and "Reduce Motion" may neutralize stylesheet animations. Each frame updates
 * size/opacity/height visibly, even if the PWA's motion styles are overridden. */
type Props={kind:"typing"|"recording"};
export default function ChatActivity({kind}:Props){
 const [frame,setFrame]=useState(0);
 useEffect(()=>{
  setFrame(0);
  const timer=window.setInterval(()=>setFrame(v=>(v+1)%ACTIVITY_FRAMES),145);
  return()=>window.clearInterval(timer);
 },[kind]);
 return <div className={"lr-activity-bubble lr-activity-"+kind} role="status" data-activity-frame={frame}
  aria-label={kind==="typing"?"Ton partenaire est en train d’écrire":"Ton partenaire enregistre un message vocal"}>
  {kind==="typing"?
   <span className="lr-activity-dots" aria-hidden="true">
    {[0,1,2].map(i=>{
     const {opacity,transform,color}=typingDotFrame(frame,i);
     const active=opacity===1;
     return <i key={i} className={active?"is-pulsing":""} style={{
      "--lr-js-opacity":String(opacity),
      "--lr-js-transform":transform,
      backgroundColor:color,
      boxShadow:active?"0 0 7px #ffffff70":"none"
     } as CSSProperties}/>;
    })}
   </span>:
   <span className="lr-activity-recording-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
     strokeLinecap="round" strokeLinejoin="round" focusable="false"
     style={{"--lr-js-opacity":String(microphoneFrame(frame).opacity),
      "--lr-js-transform":microphoneFrame(frame).transform} as CSSProperties}>
     <rect x="9" y="3" width="6" height="12" rx="3"/>
     <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>
    </svg>
    <span className="lr-activity-wave">
     {[0,1,2,3].map(i=><i key={i} style={{
      "--lr-js-height":voiceWaveFrame(frame,i).height,
      "--lr-js-opacity":String(voiceWaveFrame(frame,i).opacity)
     } as CSSProperties}/>)}
    </span>
   </span>}
 </div>;
}
