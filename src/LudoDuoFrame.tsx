import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./ludo-duo-frame.css";

type DuoColor="blue"|"red"|"green"|"yellow";
type BoardPoint=[number,number];
export type SharedBoardMotion={seat:number;pawn:number;progress:number;from:number;to:number;point?:BoardPoint;index?:number;length?:number};
export type SharedBoardCapture={seat:number;pawn:number;from:number;returning:boolean;progress:number;point?:BoardPoint};
type DuoGameSnapshot={
 id:string;version:number;turn:number;dice:number|null;
 positions:number[][];status:"playing"|"won"|"ended";winner:number|null;autoCounts:[number,number];
 lastAction:string;deadlineAt:number|null;
};

type Props={
 game:DuoGameSnapshot;
 palette:{colors:[DuoColor,DuoColor];chosenBy:number|null};
 lastRoll:{seat:number;face:number;at:number}|null;
 mySeat:number;myName:string;partnerName:string|null;
 myAvatar?:string;partnerAvatar?:string;
 remaining:number|null;rolling:boolean;rollingFace:number;
 busy:boolean;animationBusy:boolean;
 motion:SharedBoardMotion|null;capturedMotions:SharedBoardCapture[];
 /** The same board renderer serves Classic and Senegal rules; only the state adapter differs. */
 variant?:"classic"|"senegal";opponent?:"duo"|"solo";
 boardPoints?:(BoardPoint|null)[][];legalPawns?:number[];
 statusText?:string;canRoll?:boolean;
 error:string;overlayOpen:boolean;
 onAction:(action:"roll"|"move"|"restart"|"exit"|"leave"|"gift"|"menu",pawn?:number)=>void;
 onReady?:()=>void;
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
 const [quitSlot,setQuitSlot]=useState<HTMLElement|null>(null);
 const actionRef=useRef(props.onAction);
 actionRef.current=props.onAction;
 const readyRef=useRef(props.onReady);
 readyRef.current=props.onReady;
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
   overlayOpen:props.overlayOpen,variant:props.variant||"classic",opponent:props.opponent||"duo",
   boardPoints:props.boardPoints,legalPawns:props.legalPawns,
   statusText:props.statusText,canRoll:props.canRoll
  },window.location.origin);
 },[props.game,props.palette,props.lastRoll,props.mySeat,props.myName,props.partnerName,props.myAvatar,props.partnerAvatar,
    props.remaining,props.rolling,props.rollingFace,props.busy,props.animationBusy,
    props.motion,props.capturedMotions,props.error,props.overlayOpen,
    props.variant,props.opponent,props.boardPoints,props.legalPawns,props.statusText,props.canRoll]);
 const sendRef=useRef(send);
 sendRef.current=send;
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
   if(data.type==="ready"){setReady(true);setFailed(false);sendRef.current();readyRef.current?.();return}
   if(data.type!=="action")return;
   switch(data.action){
    case "roll":case "restart":case "exit":case "leave":case "gift":case "menu":
     actionRef.current(data.action);break;
    case "move":
     if(Number.isInteger(data.pawn)&&data.pawn>=0&&data.pawn<4)actionRef.current("move",data.pawn);
     break;

   }
  };
  window.addEventListener("message",message);
  return()=>window.removeEventListener("message",message);
 },[]);
 // A same-origin React portal makes "Quitter" a real parent-app action.
 // In iOS WKWebView, relying only on an iframe postMessage may silently fail.
 // Keep the original iframe button as a fallback when direct DOM access is unavailable.
 useEffect(()=>{
  if(!ready||props.variant!=="senegal")return;
  let original:HTMLElement|null=null;
  let placeholder:HTMLSpanElement|null=null;
  try{
   const documentInFrame=ref.current?.contentDocument;
   original=documentInFrame?.querySelector<HTMLElement>(".duo-quit-match")||null;
   if(!original)return;
   placeholder=documentInFrame!.createElement("span");
   placeholder.className="duo-quit-slot";
   original.replaceWith(placeholder);
   setQuitSlot(placeholder);
  }catch{
   // Non-standard embedded origins still use the original postMessage button.
   return;
  }
  return()=>{
   if(placeholder?.isConnected&&original)placeholder.replaceWith(original);
  };
 },[ready,retry,props.variant]);
 return <section className="ludo-duo-shared-frame" aria-label={"Plateau Ludo "+(props.variant==="senegal"?"Sénégal ":"Classique ")+(props.opponent==="solo"?"Solo":"Duo")+" partagé"}>
  {quitSlot?createPortal(
   <button type="button" className="duo-quit-match" aria-label="Quitter le Ludo Sénégal"
    onClick={()=>actionRef.current("exit")}>↩ Quitter</button>,quitSlot):null}
  <iframe key={retry} ref={ref} className="ludo-duo-shared-iframe"
   src="/ludo-duo/index.html?v=ludo-room-20261119-v31" title={"Ludo "+(props.variant==="senegal"?"Sénégal ":"Classique ")+(props.opponent==="solo"?"Solo":"Duo")+" : même plateau, mêmes animations"}
   referrerPolicy="same-origin" loading="eager" onError={()=>setFailed(true)}/>
  {failed&&!ready?<div className="ludo-duo-frame-error" role="alert">
   <strong>Impossible de charger le nouveau plateau Duo.</strong>
   <span>Vérifie ta connexion ou la version publiée de Love Radar.</span>
   <button type="button" onClick={()=>{setFailed(false);setReady(false);setRetry(n=>n+1)}}>Réessayer</button>
  </div>:null}
 </section>;
}
