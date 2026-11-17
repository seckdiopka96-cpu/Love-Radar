import "./ludo-room.css";

export type LudoMode="ludo"|"ludo-solo"|"ludo-senegal"|"ludo-senegal-solo";

const MODES=[
 {id:"ludo-solo",tag:"CLASSIQUE",title:"Ludo Solo",meta:"Toi contre l’ordinateur",description:"Le vrai Ludo traditionnel, à ton rythme.",icon:"🎲",number:"01",kind:"classic-solo"},
 {id:"ludo",tag:"EN COUPLE",title:"Ludo Duo",meta:"Deux joueurs · En direct",description:"Une partie partagée avec défis et pions animés.",icon:"♥",number:"02",kind:"classic-duo"},
 {id:"ludo-senegal-solo",tag:"🇸🇳 SÉNÉGAL",title:"Sunu Ludo Solo",meta:"Toi contre l’ordinateur",description:"Tours supplémentaires et stratégie sénégalaise.",icon:"★",number:"03",kind:"senegal-solo"},
 {id:"ludo-senegal",tag:"🇸🇳 SÉNÉGAL",title:"Sunu Ludo Duo",meta:"Deux joueurs · En direct",description:"Entre dans la cage adverse et tente ta chance.",icon:"⚔",number:"04",kind:"senegal-duo"},
] as const;

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

type Props={onExit:()=>void;onOpenMode:(mode:LudoMode)=>void;partnerName:string|null};
export default function LudoRoom({onExit,onOpenMode,partnerName}:Props){
 return <section className="lr-ludo-room" aria-label="Salle des quatre Ludos">
  <header className="lr-ludo-room-top">
   <button type="button" className="lr-ludo-room-back" onClick={onExit}>‹ Jeux</button>
   <span className="lr-ludo-room-top-title">SALLE LUDO</span>
   <span className="lr-ludo-room-top-icon" aria-hidden="true">★</span>
  </header>
  <div className="lr-ludo-room-hero">
   <div className="lr-ludo-room-logo"><LudoMark/></div>
   <div className="lr-ludo-room-intro">
    <span className="lr-ludo-room-kicker">LOVE RADAR · QUATRE FAÇONS DE JOUER</span>
    <h1>LA SALLE <span>LUDO</span></h1>
    <p>Un seul espace pour les quatre jeux. Choisis ton plateau et défie {partnerName||"ton partenaire"} ou l’ordinateur.</p>
   </div>
  </div>
  <div className="lr-ludo-room-mode-grid">
   {MODES.map(mode=><button type="button" key={mode.id} onClick={()=>onOpenMode(mode.id)}
    className={"lr-ludo-room-mode lr-ludo-room-"+mode.kind} aria-label={"Ouvrir "+mode.title}>
    <span className="lr-ludo-room-mode-top"><small>{mode.tag}</small><span>{mode.number}</span></span>
    <span className="lr-ludo-room-mode-emblem" aria-hidden="true"><span>{mode.icon}</span><i/><i/><i/><i/></span>
    <span className="lr-ludo-room-mode-copy"><strong>{mode.title}</strong><small>{mode.meta}</small><span>{mode.description}</span></span>
    <span className="lr-ludo-room-mode-action">ENTRER <span aria-hidden="true">›</span></span>
   </button>)}
  </div>
  <p className="lr-ludo-room-note">Chaque mode conserve sa partie et ses règles. Les parties à deux restent synchronisées entre les deux téléphones.</p>
 </section>;
}
