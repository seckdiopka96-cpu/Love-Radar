import "./games-hub.css";

type Game="ludo"|"ludo-solo"|"ludo-senegal"|"ludo-senegal-solo"|"memory";
type Props={onOpenGame:(game:Game)=>void;partnerName:string|null};

/** Original, consistent vector artwork — no robot or emoji graphics. */
function GameArtwork({game}:{game:Game}){
 const senegal=game==="ludo-senegal"||game==="ludo-senegal-solo";
 const solo=game==="ludo-solo"||game==="ludo-senegal-solo";
 const memory=game==="memory";
 return <span className={"lr-games-symbol lr-games-art lr-games-art-"+game} aria-hidden="true">
  <svg className="lr-games-art-svg" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
   {memory?<>
    <rect x="12" y="10" width="35" height="47" rx="7" transform="rotate(-10 12 10)" fill="#284D5B" stroke="#9FC7C8" strokeWidth="2"/>
    <rect x="28" y="16" width="35" height="47" rx="7" fill="#345564" stroke="#C5DDDA" strokeWidth="2.2"/>
    <path d="M45.5 48.5 35 38c-5-5 2.3-13 8-6.7l2.5 2.7 2.5-2.7c5.7-6.3 13 1.7 8 6.7L45.5 48.5Z" fill="#FF8FAB"/>
    <path d="M18 20h14M17 28h12" stroke="#9FC7C8" strokeWidth="2.1" strokeLinecap="round"/>
   </>:<>
    {senegal?<g>
     <rect x="7" y="7" width="34" height="23" rx="4" fill="#FFF5E8"/>
     <path d="M7 11a4 4 0 0 1 4-4h7v23h-7a4 4 0 0 1-4-4V11Z" fill="#15965B"/>
     <path d="M18 7h12v23H18Z" fill="#F5CD40"/>
     <path d="M30 7h7a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4h-7V7Z" fill="#E34B4E"/>
     <path d="m24 11 1.5 4.6h4.8l-3.9 2.8 1.5 4.7-3.9-2.9-3.9 2.9 1.5-4.7-3.9-2.8h4.8L24 11Z" fill="#15965B"/>
    </g>:<g>
     <rect x="8" y="8" width="26" height="26" rx="7" fill="#314E5E" stroke="#99C5C8" strokeWidth="2"/>
     <circle cx="16" cy="16" r="2.3" fill="#FFF1DF"/>
     <circle cx="26" cy="26" r="2.3" fill="#FFF1DF"/>
     <circle cx="21" cy="21" r="2.3" fill="#FFADC0"/>
    </g>}
    {solo?<g>
     <path d="M46 30c7.3 0 12.5 5.3 12.5 12 0 3.7-1.3 6-3.6 8l4.6 7.5H36.5l4.6-7.5a11.7 11.7 0 0 1-3.6-8c0-6.7 5.2-12 12.5-12Z" fill="#FF9DB2" stroke="#FFD0C3" strokeWidth="2"/>
     <path d="M35 60h30" stroke="#FFE5D2" strokeWidth="4.3" strokeLinecap="round"/>
     <circle cx="50" cy="38" r="3.4" fill="#FFF4EA"/>
    </g>:<g>
     <path d="M29 33c5.5 0 9 4.1 9 9.4 0 2.8-.9 5-2.6 6.6l3.4 6H19.2l3.4-6A9 9 0 0 1 20 42.4c0-5.3 3.5-9.4 9-9.4Z" fill="#FF98B4" stroke="#FFD2D6" strokeWidth="2"/>
     <path d="M18 58h22" stroke="#FFE1D4" strokeWidth="3.6" strokeLinecap="round"/>
     <path d="M48 33c5.5 0 9 4.1 9 9.4 0 2.8-.9 5-2.6 6.6l3.4 6H38.2l3.4-6A9 9 0 0 1 39 42.4c0-5.3 3.5-9.4 9-9.4Z" fill="#7DBFC3" stroke="#CAEEEA" strokeWidth="2"/>
     <path d="M37 58h22" stroke="#D7F4EE" strokeWidth="3.6" strokeLinecap="round"/>
    </g>}
   </>}
  </svg>
  <span className="lr-games-art-label">{solo?"SOLO":memory?"MEMORY":"DUO"}</span>
 </span>;
}

export default function GamesHub({onOpenGame,partnerName}:Props){
 return <section className="lr-games-hub" aria-label="Jeux à deux et en solo">
  <header className="lr-games-hero">
   <span className="lr-games-kicker">♥ À DEUX OU EN SOLO</span>
   <h1>À deux <em>ou en solo.</em></h1>
   <p>{partnerName?"Défie "+partnerName+" ou affronte l’ordinateur quand tu veux.":"Joue contre l’ordinateur dès maintenant, même sans partenaire."}</p>
  </header>
  <div className="lr-games-grid">
   <button type="button" className="lr-games-choice lr-games-ludo" onClick={()=>onOpenGame("ludo")}>
    <GameArtwork game="ludo"/>
    <span className="lr-games-copy"><small>JEU DE PLATEAU · À DEUX</small><strong>Ludo Duo</strong><span>Une partie à deux, même à distance.</span><b>Jouer à Ludo →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-solo" onClick={()=>onOpenGame("ludo-solo")}>
    <GameArtwork game="ludo-solo"/>
    <span className="lr-games-copy"><small>MODE SOLO · AUCUN PARTENAIRE</small><strong>Ludo contre l’ordinateur</strong><span>Un vrai adversaire automatique, à tout moment.</span><b>Jouer en solo →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-senegal" onClick={()=>onOpenGame("ludo-senegal")}>
    <GameArtwork game="ludo-senegal"/>
    <span className="lr-games-copy"><small>RÈGLES SÉNÉGALAISES · À DEUX</small><strong>Ludo Sénégal · Duo</strong><span>Plusieurs tours, attaque dans la cage adverse et demi-tour avec un 6.</span><b>Défier mon partenaire →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-senegal-solo" onClick={()=>onOpenGame("ludo-senegal-solo")}>
    <GameArtwork game="ludo-senegal-solo"/>
    <span className="lr-games-copy"><small>RÈGLES SÉNÉGALAISES · SOLO</small><strong>Ludo Sénégal · Ordinateur</strong><span>La même stratégie sénégalaise face à l’ordinateur.</span><b>Jouer en solo →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-memory" onClick={()=>onOpenGame("memory")}>
    <GameArtwork game="memory"/>
    <span className="lr-games-copy"><small>JEU DE MÉMOIRE</small><strong>Memory Love</strong><span>Retrouvez les paires et relevez le défi.</span><b>Jouer à Memory →</b></span>
   </button>
  </div>
  <p className="lr-games-note">Ludo classique ou Sénégal : choisis une partie solo ou un défi à deux.</p>
 </section>;
}
