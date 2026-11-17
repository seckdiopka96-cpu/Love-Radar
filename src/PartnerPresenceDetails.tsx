import {useEffect,useRef} from "react";
import {formatPartnerLastSeen} from "./last-seen";
import "./partner-presence-details.css";

type Props={
 partner:string;
 lastSeenAt:number;
 online:boolean;
 now:number;
 onClose:()=>void;
 returnFocusTo?:{current:HTMLButtonElement|null};
};

/** A private, read-only detail view of the most recent server presence signal. */
export default function PartnerPresenceDetails({partner,lastSeenAt,online,now,onClose,returnFocusTo}:Props){
 const closeRef=useRef<HTMLButtonElement|null>(null);
 const valid=Number.isFinite(lastSeenAt)&&lastSeenAt>0&&Number.isFinite(new Date(lastSeenAt).getTime());
 const date=valid?new Date(lastSeenAt):null;
 useEffect(()=>{
  closeRef.current?.focus();
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();onClose()}
  };
  document.addEventListener("keydown",onKey);
  return()=>{
   document.removeEventListener("keydown",onKey);
   returnFocusTo?.current?.focus();
  };
 },[onClose,returnFocusTo]);
 return <div className="lr-presence-overlay" onClick={onClose} role="presentation">
  <section className="lr-presence-sheet" role="dialog" aria-modal="true" aria-labelledby="lr-presence-title"
   aria-describedby="lr-presence-explain" onClick={event=>event.stopPropagation()}>
   <div className="lr-presence-sheet-top">
    <span className="lr-presence-caption">STATUT DU PARTENAIRE</span>
    <button ref={closeRef} type="button" className="lr-presence-close" aria-label="Fermer le statut"
     onClick={onClose}>×</button>
   </div>
   <h2 id="lr-presence-title">{partner}</h2>
   <p className="lr-presence-current"><span className={"lr-presence-dot"+(online?" is-online":"")} aria-hidden="true"/>
    {online?"En ligne maintenant":formatPartnerLastSeen(lastSeenAt,now)}
   </p>
   <div className="lr-presence-details">
    <span>Dernière activité connue</span>
    {date?
     <time dateTime={date.toISOString()}>
      {date.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
      <strong> à {date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</strong>
     </time>:
     <strong>Non disponible pour le moment</strong>}
   </div>
   <p id="lr-presence-explain" className="lr-presence-explain">
    Il s’agit du dernier signal d’activité reçu par Love Radar. Ce statut peut être légèrement décalé et ne signifie pas que tes messages ont été lus.
   </p>
  </section>
 </div>;
}
