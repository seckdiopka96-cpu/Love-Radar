import {useEffect,useState,type CSSProperties} from "react";

/** Real state-driven animation instead of CSS keyframes alone: iOS standalone
 * and "Reduce Motion" may neutralize stylesheet animations. Each frame updates
 * size/opacity/height visibly, even if the PWA's motion styles are overridden. */
type Props={kind:"typing"|"recording"};
export default function ChatActivity({kind}:Props){
 const [frame,setFrame]=useState(0);
 useEffect(()=>{
  setFrame(0);
  const timer=window.setInterval(()=>setFrame(v=>(v+1)%12),145);
  return()=>window.clearInterval(timer);
 },[kind]);
 const dot=frame%9;
 return <div className={"lr-activity-bubble lr-activity-"+kind} role="status" data-activity-frame={frame}
  aria-label={kind==="typing"?"Ton partenaire est en train d’écrire":"Ton partenaire enregistre un message vocal"}>
  {kind==="typing"?
   <span className="lr-activity-dots" aria-hidden="true">
    {[0,1,2].map(i=>{
     const phase=Math.floor(dot/3);
     const active=phase===i;
     return <i key={i} className={active?"is-pulsing":""} style={{
      "--lr-js-opacity":String(active?1:.32),
      "--lr-js-transform":active?"translateY(-5px) scale(1.35)":"translateY(2px) scale(.78)",
      backgroundColor:active?"#ffffff":"#a5bac7",
      boxShadow:active?"0 0 7px #ffffff70":"none"
     } as CSSProperties}/>;
    })}
   </span>:
   <span className="lr-activity-recording-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
     strokeLinecap="round" strokeLinejoin="round" focusable="false"
     style={{"--lr-js-opacity":String(frame%4<2?1:.62),
      "--lr-js-transform":frame%4<2?"scale(1.12)":"scale(.96)"} as CSSProperties}>
     <rect x="9" y="3" width="6" height="12" rx="3"/>
     <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>
    </svg>
    <span className="lr-activity-wave">
     {[0,1,2,3].map(i=><i key={i} style={{
      "--lr-js-height":(6+Math.abs(Math.sin((frame+i*2)*.78))*15)+"px",
      "--lr-js-opacity":String(((frame+i)%5<3)?1:.55)
     } as CSSProperties}/>)}
    </span>
   </span>}
 </div>;
}
