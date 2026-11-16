import {useEffect,useState} from "react";
import "./call-history.css";

export type CallHistoryEvent={
 id:string;callerId:string;createdAt:number;connectedAt:number;endedAt:number;
 status:"ringing"|"active"|"completed"|"cancelled"|"declined"|"missed"|"interrupted";
 durationSeconds:number;
};
export function formatCallDuration(seconds:number):string{
 const total=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
 const hours=Math.floor(total/3600);
 const minutes=Math.floor(total%3600/60);
 const secs=total%60;
 if(hours)return hours+" h "+String(minutes).padStart(2,"0")+" min "+String(secs).padStart(2,"0")+" s";
 if(minutes)return minutes+" min "+String(secs).padStart(2,"0")+" s";
 return secs+" s";
}
type Props={call:CallHistoryEvent;mine:boolean;partner:string;serverOffset?:number};
export default function CallHistoryBubble({call,mine,partner,serverOffset=0}:Props){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
  if(call.status!=="active")return;
  setNow(Date.now());
  const interval=window.setInterval(()=>setNow(Date.now()),1000);
  return()=>window.clearInterval(interval);
 },[call.id,call.status]);
 const ongoing=call.status==="active";
 const ringing=call.status==="ringing";
 const duration=ongoing?Math.max(0,Math.floor((now+serverOffset-call.connectedAt)/1000)):call.durationSeconds;
 const title=ongoing?"Appel en cours":ringing?mine?"Appel sortant…":"Appel entrant…":
  call.status==="completed"?"Appel vocal":
  call.status==="declined"?"Appel refusé":
  call.status==="cancelled"?"Appel annulé":
  call.status==="missed"?"Appel manqué":"Appel interrompu";
 const detail=ongoing?"Durée · "+formatCallDuration(duration):
  call.status==="completed"||call.status==="interrupted"?"Durée de l’appel · "+formatCallDuration(duration):
  ringing?"En attente de réponse…":"Appel non établi";
 const time=new Date(call.createdAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 return <article className={"lr-call-chat-row "+(mine?"mine":"other")} aria-label={title+" avec "+partner+". "+detail}>
  <div className={"lr-call-chat-card "+(ongoing?"is-live":"")}>
   <span className="lr-call-chat-symbol" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
     <path d="M5 3.5 8.2 3c.6-.1 1.2.3 1.4.9l1.4 3.8a1.6 1.6 0 0 1-.5 1.8L8.8 11a16 16 0 0 0 4.3 4.3l1.5-1.7c.4-.5 1.1-.7 1.8-.5l3.8 1.4c.6.2 1 .8.9 1.4L20.5 19c-.2 1-1 1.7-2 1.6C10.4 20.1 3.9 13.6 3.4 5.5c-.1-1 .6-1.8 1.6-2Z"/>
     {mine?<path d="m16 4 4 4m0-4v4h-4"/>:<path d="m20 4-4 4m4 0h-4V4"/>}
    </svg>
   </span>
   <span className="lr-call-chat-copy"><strong>{title}{ongoing?<i className="lr-call-chat-live-dot" aria-hidden="true"/>:null}</strong>
    <small>{detail}</small></span>
   <time className="lr-call-chat-time" dateTime={new Date(call.createdAt).toISOString()}>{time}</time>
  </div>
 </article>;
}
