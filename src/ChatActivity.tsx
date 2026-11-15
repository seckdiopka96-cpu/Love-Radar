/** Compact WhatsApp-like presence bubble: visible icon only, accessible label. */
type Props={kind:"typing"|"recording"};
export default function ChatActivity({kind}:Props){
 return <div className={"lr-activity-bubble lr-activity-"+kind} role="status"
  aria-label={kind==="typing"?"Ton partenaire est en train d’écrire":"Ton partenaire enregistre un message vocal"}>
  {kind==="typing"?
   <span className="lr-activity-dots" aria-hidden="true"><i/><i/><i/></span>:
   <span className="lr-activity-recording-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
     strokeLinecap="round" strokeLinejoin="round" focusable="false">
     <rect x="9" y="3" width="6" height="12" rx="3"/>
     <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>
    </svg>
    <span className="lr-activity-wave"><i/><i/><i/><i/></span>
   </span>}
 </div>;
}
