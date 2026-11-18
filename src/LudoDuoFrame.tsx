import {useCallback,useEffect,useRef,useState} from "react";
import "./ludo-duo-frame.css";

type DuoColor="blue"|"red"|"green"|"yellow";
type DuoGameSnapshot={
 id:string;version:number;turn:number;dice:number|null;
 positions:number[][];status:"playing"|"won";winner:number|null;autoCounts:[number,number];
 lastAction:string;deadlineAt:number|null;
};
type Motion={seat:number;pawn:number;progress:number;from:number;to:number};
type CapturedMotion={seat:number;pawn:number;from:number;returning:boolean;progress:number};
type Props={
 game:DuoGameSnapshot;
 palette:{colors:[DuoColor,DuoColor];chosenBy:number|null};
 lastRoll:{seat:number;face:number;at:number}|null;
 mySeat:number;myName:string;partnerName:string|null;
 myAvatar?:string;partnerAvatar?:string;
 remaining:number|null;rolling:boolean;rollingFace:number;
 busy:boolean;animationBusy:boolean;
 motion:Motion|null;capturedMotions:CapturedMotion[];
 error:string;overlayOpen:boolean;
 onAction:(action:"roll"|"move"|"restart"|"exit"|"leave"|"gift"|"menu",pawn?:number)=>void;
};
/** Shared appearance of the pure-HTML Solo; multiplayer turns and dice remain
 * entirely managed and authenticated by the existing React + D1 backend.
 * Only safe display data cross this same-origin boundary; never auth tokens.
 */
export default function LudoDuoFrame(props:Props){
 const ref=useRef<HTMLIFrameElement|null>(null);
 const [ready,setReady]=useState(false);
 const [failed,setFailed]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(ready){setFailed(false);return}
  const id=window.setTimeout(()=>setFailed(true),8000);
  return()=>window.clearTimeout(id);
 },[ready,retry]);
 const send=useCallback(()=>{
  const frame=ref.current?.contentWindow;
  if(!frame)return;
  frame.postMessage({
   source:"love-radar-ludo-duo-parent",type:"state",
   game:props.game,palette:props.palette,lastRoll:props.lastRoll,mySeat:props.mySeat,
   myName:props.myName,partnerName:props.partnerName,
   myAvatar:props.myAvatar||"",partnerAvatar:props.partnerAvatar||"",
   remaining:props.remaining,rolling:props.rolling,rollingFace:props.rollingFace,
   busy:props.busy,animationBusy:props.animationBusy,
   motion:props.motion,capturedMotions:props.capturedMotions,error:props.error,
   overlayOpen:props.overlayOpen
  },window.location.origin);
 },[props.game,props.palette,props.lastRoll,props.mySeat,props.myName,props.partnerName,props.myAvatar,props.partnerAvatar,
    props.remaining,props.rolling,props.rollingFace,props.busy,props.animationBusy,
    props.motion,props.capturedMotions,props.error,props.overlayOpen]);
 useEffect(()=>{if(ready)send()},[ready,send]);
 // Keep the handshake reliable even when a locally cached iframe executes
 // before React's message listener is installed (common on iOS WebKit).
 useEffect(()=>{
  if(ready)return;
  const ping=()=>ref.current?.contentWindow?.postMessage({
   source:"love-radar-ludo-duo-parent",type:"ping"
  },window.location.origin);
  ping();
  const id=window.setInterval(ping,900);
  return()=>window.clearInterval(id);
 },[ready,retry]);
 useEffect(()=>{
  const message=(event:MessageEvent)=>{
   const frame=ref.current?.contentWindow;
   if(!frame||event.source!==frame||event.origin!==window.location.origin)return;
   const data=event.data;
   if(!data||data.source!=="love-radar-ludo-duo")return;
   if(data.type==="ready"){setReady(true);setFailed(false);send();return}
   if(data.type!=="action")return;
   switch(data.action){
    case "roll":case "restart":case "exit":case "leave":case "gift":case "menu":
     props.onAction(data.action);break;
    case "move":
     if(Number.isInteger(data.pawn)&&data.pawn>=0&&data.pawn<4)props.onAction("move",data.pawn);
     break;

   }
  };
  window.addEventListener("message",message);
  return()=>window.removeEventListener("message",message);
 },[props.onAction,send]);
 return <section className="ludo-duo-shared-frame" aria-label="Plateau Ludo Duo identique au Ludo Solo">
  <iframe key={retry} ref={ref} className="ludo-duo-shared-iframe"
   src="/ludo-duo/index.html?v=ludo-room-20261118-v10" title="Ludo Duo : plateau et dé synchronisés avec ton partenaire"
   referrerPolicy="same-origin" loading="eager" onError={()=>setFailed(true)}/>
  {failed&&!ready?<div className="ludo-duo-frame-error" role="alert">
   <strong>Impossible de charger le nouveau plateau Duo.</strong>
   <span>Vérifie ta connexion ou la version publiée de Love Radar.</span>
   <button type="button" onClick={()=>{setFailed(false);setReady(false);setRetry(n=>n+1)}}>Réessayer</button>
  </div>:null}
 </section>;
}
