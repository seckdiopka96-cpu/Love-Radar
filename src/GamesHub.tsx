import "./games-hub.css";
type Props={onOpenGame:(game:"ludo"|"memory")=>void;partnerName:string|null};
export default function GamesHub({onOpenGame,partnerName}:Props){
 return <section className="lr-games-hub" aria-label="Nos jeux à deux">
  <header className="lr-games-hero">
   <span className="lr-games-kicker">♥ NOS JEUX À DEUX</span>
   <h1>Jouons <em>ensemble.</em></h1>
   <p>{partnerName?"Défie "+partnerName+" et partagez un moment complice.":"Invite ton amour à rejoindre votre espace pour jouer ensemble."}</p>
  </header>
  <div className="lr-games-grid">
   <button type="button" className="lr-games-choice lr-games-ludo" onClick={()=>onOpenGame("ludo")}>
    <span className="lr-games-symbol" aria-hidden="true">🎲</span>
    <span className="lr-games-copy"><small>JEU DE PLATEAU</small><strong>Ludo Duo</strong><span>Une partie à deux, même à distance.</span><b>Jouer à Ludo →</b></span>
   </button>
   <button type="button" className="lr-games-choice lr-games-memory" onClick={()=>onOpenGame("memory")}>
    <span className="lr-games-symbol" aria-hidden="true">🃏</span>
    <span className="lr-games-copy"><small>JEU DE MÉMOIRE</small><strong>Memory Love</strong><span>Retrouvez les paires et relevez le défi.</span><b>Jouer à Memory →</b></span>
   </button>
  </div>
  <p className="lr-games-note">Choisissez votre jeu préféré. Vos invitations et notifications ouvrent directement la bonne partie. 💞</p>
 </section>;
}
