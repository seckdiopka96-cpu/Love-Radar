import "./games-hub.css";
type Props={onOpenGame:(game:"ludo"|"ludo-solo"|"memory")=>void;partnerName:string|null};
export default function GamesHub({onOpenGame,partnerName}:Props){
 return <section className="lr-games-hub" aria-label="Jeux à deux et en solo">
  <header className="lr-games-hero">
   <span className="lr-games-kicker">♥ À DEUX OU EN SOLO</span>
   <h1>À deux <em>ou en solo.</em></h1>
   <p>{partnerName?"Défie "+partnerName+" ou affronte l’ordinateur quand tu veux.":"Joue contre l’ordinateur dès maintenant, même sans partenaire."}</p>
  </header>
  <div className="lr-games-grid">
   <button type="button" className="lr-games-choice lr-games-ludo" onClick={()=>onOpenGame("ludo")}>
    <span className="lr-games-symbol" aria-hidden="true">🎲</span>
    <span className="lr-games-copy"><small>JEU DE PLATEAU</small><strong>Ludo Duo</strong><span>Une partie à deux, même à distance.</span><b>Jouer à Ludo →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-solo" onClick={()=>onOpenGame("ludo-solo")}>
    <span className="lr-games-symbol" aria-hidden="true">🤖</span>
    <span className="lr-games-copy"><small>MODE SOLO · AUCUN PARTENAIRE</small><strong>Ludo contre l’ordinateur</strong><span>Un vrai adversaire automatique, à tout moment.</span><b>Jouer en solo →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-memory" onClick={()=>onOpenGame("memory")}>
    <span className="lr-games-symbol" aria-hidden="true">🃏</span>
    <span className="lr-games-copy"><small>JEU DE MÉMOIRE</small><strong>Memory Love</strong><span>Retrouvez les paires et relevez le défi.</span><b>Jouer à Memory →</b></span>
   </button>
  </div>
  <p className="lr-games-note">Choisis ton jeu : contre l’ordinateur tout de suite, ou à deux avec ton partenaire. 💞</p>
 </section>;
}
