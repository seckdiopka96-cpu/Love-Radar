import {useEffect,useRef,useState} from "react";

type LudoGuideMode="solo"|"duo";
type Props={mode:LudoGuideMode;onClose:()=>void};
const LESSONS=[
 {label:"LE PLATEAU",title:"Prêt à jouer ?",description:"Tes quatre pions attendent dans ta maison colorée. Le but : les amener tous au centre.",target:"board"},
 {label:"LE DÉ",title:"Lance le dé 🎲",description:"Appuie sur le dé en bas. Un 6 te permet de sortir un pion de la maison.",target:"dice"},
 {label:"TES PIONS",title:"Choisis ton pion",description:"Les pions qui brillent sont jouables. Touche l’un d’eux pour le voir avancer case après case.",target:"pawn"},
 {label:"GAGNER",title:"Direction le centre !",description:"Les étoiles sont des refuges. Capture les pions adverses et amène les tiens au centre pour gagner.",target:"center"}
] as const;
const KEY="love-radar-ludo-arena-guide-v1-";
export function ludoGuideWasSeen(mode:LudoGuideMode):boolean{
 try{return localStorage.getItem(KEY+mode)==="done"}catch{return false}
}
export function saveLudoGuideSeen(mode:LudoGuideMode):void{
 try{localStorage.setItem(KEY+mode,"done")}catch{/* Still playable in private browsing. */}
}

/** In-game illustration only; the board, dice, pawn and game rules remain real. */
export default function LudoTutorial({mode,onClose}:Props){
 const [step,setStep]=useState(0);
 const skip=useRef<HTMLButtonElement|null>(null);
 const lesson=LESSONS[step];
 useEffect(()=>{
  skip.current?.focus();
  const esc=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();finish()}};
  document.addEventListener("keydown",esc);
  return()=>document.removeEventListener("keydown",esc);
 },[]);
 function finish(){saveLudoGuideSeen(mode);onClose()}
 return <div className={"ludo-arena-tutorial ludo-guide-"+lesson.target}
  role="dialog" aria-modal="true" aria-label="Tutoriel Ludo" aria-describedby="ludo-arena-guide-detail">
  <div className="ludo-arena-guide-shade" aria-hidden="true"/>
  <button ref={skip} type="button" className="ludo-guide-skip" onClick={finish}>Passer le tutoriel <span aria-hidden="true">›</span></button>
  <div className="ludo-guide-target" aria-hidden="true"><span>☝</span></div>
  <div className="ludo-guide-panel">
   <small>{step+1} / {LESSONS.length} · {lesson.label}</small>
   <strong>{lesson.title}</strong>
   <p id="ludo-arena-guide-detail">{lesson.description}</p>
   <div className="ludo-guide-actions">
    <div className="ludo-guide-dots" aria-hidden="true">{LESSONS.map((_,i)=><i key={i} className={i===step?"is-active":""}/>)}</div>
    <button type="button" onClick={()=>step===LESSONS.length-1?finish():setStep(step+1)}>{step===LESSONS.length-1?"Jouer !":"Suivant"} <span aria-hidden="true">›</span></button>
   </div>
  </div>
 </div>;
}
