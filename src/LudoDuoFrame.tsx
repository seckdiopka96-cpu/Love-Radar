import {useCallback,useEffect,useRef,useState} from "react";
import "./ludo-duo-frame.css";

type DuoColor="blue"|"red"|"green"|"yellow";
type DuoGameSnapshot={
 id:string;version:number;turn:number;dice:number|null;
 positions:number[][];status:"playing"|"won";winner:number|null;
 lastAction:string;deadlineAt:number|null;
};
type Motion={seat:number;pawn:number;progress:number;from:number;to:number};
type CapturedMotion={seat:number;pawn:number;from:number;returning:boolean;progress:number};
type DuoReaction={id?:string;seat:number;emoji:string;at:number};
type Props={
 game:DuoGameSnapshot;
 palette:{colors:[DuoColor,DuoColor];chosenBy:number|null};
 lastRoll:{seat:number;face:number;at:number}|null;
 mySeat:number;myName:string;partnerName:string|null;
 remaining:number|null;rolling:boolean;rollingFace:number;
 busy:boolean;animationBusy:boolean;
 motion:Motion|null;capturedMotions:CapturedMotion[];reactions:DuoReaction[];
 error:string;
 onAction:(action:"roll"|"move"|"restart"|"exit"|"react"|"gift"|"menu",pawn?:number,emoji?:string)=>void;
};
/** Shared appearance of the pure-HTML Solo; multiplayer turns and dice remain
 * entirely managed and authenticated by the existing React + D1 backend.
 * Only safe display data cross this same-origin boundary; never auth tokens.
 */
export default function LudoDuoFrame(props:Props){
 const ref=useRef<HTMLIFrameElement|null>(null);
 const [ready,setReady]=useState(false);
 const send=useCallback(()=>{
  const frame=ref.current?.contentWindow;
  if(!frame)return;
  frame.postMessage({
   source:"love-radar-ludo-duo-parent",type:"state",
   game:props.game,palette:props.palette,lastRoll:props.lastRoll,mySeat:props.mySeat,
   myName:props.myName,partnerName:props.partnerName,
   remaining:props.remaining,rolling:props.rolling,rollingFace:props.rollingFace,
   busy:props.busy,animationBusy:props.animationBusy,
   motion:props.motion,capturedMotions:props.capturedMotions,reactions:props.reactions,error:props.error
  },window.location.origin);
 },[props.game,props.palette,props.lastRoll,props.mySeat,props.myName,props.partnerName,
    props.remaining,props.rolling,props.rollingFace,props.busy,props.animationBusy,
    props.motion,props.capturedMotions,props.reactions,props.error]);
 useEffect(()=>{if(ready)send()},[ready,send]);
 useEffect(()=>{
  const message=(event:MessageEvent)=>{
   const frame=ref.current?.contentWindow;
   if(!frame||event.source!==frame||event.origin!==window.location.origin)return;
   const data=event.data;
   if(!data||data.source!=="love-radar-ludo-duo")return;
   if(data.type==="ready"){setReady(true);send();return}
   if(data.type!=="action")return;
   switch(data.action){
    case "roll":case "restart":case "exit":case "gift":case "menu":
     props.onAction(data.action);break;
    case "move":
     if(Number.isInteger(data.pawn)&&data.pawn>=0&&data.pawn<4)props.onAction("move",data.pawn);
     break;
    case "react":
     if(typeof data.emoji==="string"&&["❤️","😂","🤣","😝","🤪","😭","🔥","👏","😍","💋","😱","🤯","😤","😘","😎","🥹","😮","😡"].includes(data.emoji))
      props.onAction("react",undefined,data.emoji);
     break;
   }
  };
  window.addEventListener("message",message);
  return()=>window.removeEventListener("message",message);
 },[props.onAction,send]);
 return <section className="ludo-duo-shared-frame" aria-label="Plateau Ludo Duo identique au Ludo Solo">
  <iframe ref={ref} className="ludo-duo-shared-iframe"
   src="/ludo-duo/index.html?v=ludo-room-20261117-v3" title="Ludo Duo : plateau et dé synchronisés avec ton partenaire"
   referrerPolicy="same-origin" loading="eager" onLoad={()=>setReady(true)}/>
 </section>;
}
