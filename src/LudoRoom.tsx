import "./ludo-room.css";

export type LudoMode="ludo"|"ludo-solo"|"ludo-senegal"|"ludo-senegal-solo";

/** One visible board, four modes. The same 15×15 preview is never duplicated. */
const MODES=[
 {id:"ludo",title:"Classique · Duo",subtitle:"Avec ton partenaire",kind:"classic-duo",icon:"♥"},
 {id:"ludo-senegal",title:"Sénégal · Duo",subtitle:"Avec ton partenaire",kind:"senegal-duo",icon:"🇸🇳"},
 {id:"ludo-solo",title:"Classique · Solo",subtitle:"Contre l’ordinateur",kind:"classic-solo",icon:"🎲"},
 {id:"ludo-senegal-solo",title:"Sénégal · Solo",subtitle:"Contre l’ordinateur",kind:"senegal-solo",icon:"★"},
] as const;

/** Exact same board artwork, from the shared SVG, in the lobby and in play. */
function SingleLudoBoard(){
 return <div className="lr-ludo-unified-board-wrap">
  <div className="lr-ludo-unified-board-frame">
   <div className="lr-ludo-unified-board" role="img"
    aria-label="Plateau Ludo unique à 15 colonnes, quatre zones foncées et huit étoiles"/>
  </div>
 </div>;
}

/** Original scalable Ludo house symbol: four quarters, four safe stars, dice. */
export function LudoMark({compact=false}:{compact?:boolean}){
 return <svg className={"lr-ludo-mark"+(compact?" is-compact":"")} viewBox="0 0 100 100" role="img" aria-label="Logo Ludo, plateau quatre couleurs et dé" xmlns="http://www.w3.org/2000/svg">
  <defs>
   <linearGradient id="lr-ludo-mark-dice" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#fff9e3"/><stop offset="1" stopColor="#e4ecfb"/></linearGradient>
  </defs>
  <rect x="3" y="3" width="94" height="94" rx="22" fill="#0d2149" stroke="#f7d995" strokeWidth="3"/>
  <path d="M18 18H50V50H18Z" fill="#f14761"/><path d="M50 18H82V50H50Z" fill="#21b57c"/>
  <path d="M18 50H50V82H18Z" fill="#1d9ce7"/><path d="M50 50H82V82H50Z" fill="#f6be3c"/>
  <path d="M18 18H82V82H18Z" fill="none" stroke="#f9edd9" strokeWidth="1.5"/>
  <g fill="#fff9e8"><circle cx="32" cy="32" r="5"/><circle cx="68" cy="32" r="5"/><circle cx="32" cy="68" r="5"/><circle cx="68" cy="68" r="5"/></g>
  <rect x="37" y="37" width="26" height="26" rx="7" fill="url(#lr-ludo-mark-dice)" stroke="#283d5a" strokeWidth="2.5"/>
  <g fill="#214a82"><circle cx="44" cy="44" r="2.7"/><circle cx="56" cy="44" r="2.7"/><circle cx="50" cy="50" r="2.7"/><circle cx="44" cy="56" r="2.7"/><circle cx="56" cy="56" r="2.7"/></g>
 </svg>;
}

type Props={onExit:()=>void;onOpenMode:(mode:LudoMode)=>void;onOpenTeam:()=>void;partnerName:string|null};
export default function LudoRoom({onExit,onOpenMode,onOpenTeam,partnerName}:Props){
 return <section className="lr-ludo-room lr-ludo-room-unified" aria-label="Un plateau Ludo et quatre modes">
  <header className="lr-ludo-room-top">
   <button type="button" className="lr-ludo-room-back" onClick={onExit}>‹ Jeux</button>
   <span className="lr-ludo-room-top-title"><LudoMark compact/> LUDO</span>
   <span className="lr-ludo-room-top-icon" aria-hidden="true">✦</span>
  </header>
  <div className="lr-ludo-room-unified-title">
   <span>UN SEUL PLATEAU</span>
   <h1>Choisis ton <em>mode.</em></h1>
   <p>Classique ou Sénégal, en solo ou à deux.</p>
  </div>
  <SingleLudoBoard/>
  <div className="lr-ludo-room-mode-grid lr-ludo-room-unified-options" aria-label="Choisir les règles et l'adversaire">
   {MODES.map(mode=><button type="button" key={mode.id} onClick={()=>onOpenMode(mode.id)}
    className={"lr-ludo-room-mode lr-ludo-room-unified-option lr-ludo-room-"+mode.kind}
    aria-label={"Jouer au Ludo "+mode.title}>
    <span className="lr-ludo-room-unified-icon" aria-hidden="true">{mode.icon}</span>
    <span className="lr-ludo-room-unified-label"><strong>{mode.title}</strong><small>{mode.subtitle}</small></span>
    <span className="lr-ludo-room-unified-arrow" aria-hidden="true">›</span>
   </button>)}
  </div>
  <button type="button" className="lr-ludo-room-back" onClick={onOpenTeam}>
   ❤️ VS 💙 · 2 couples, 4 joueurs · Ludo Classique / Sénégal
  </button>
  <p className="lr-ludo-room-note">Les règles et parties restent indépendantes pour chaque mode{partnerName?". Invite "+partnerName+" pour le Duo.":"."}</p>
 </section>;
}
