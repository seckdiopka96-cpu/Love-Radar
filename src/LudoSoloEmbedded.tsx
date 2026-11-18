import "./ludo-solo-embedded.css";

type Props={
 scope:string;
 onExit:()=>void;
};

/** Host the original pure HTML/CSS/JS game inside Love Radar.
 * The existing two-player and Senegalese Ludo components are untouched.
 * Each signed-in member gets a separate local save by passing a scoped key.
 */
export default function LudoSoloEmbedded({scope,onExit}:Props){
 const src="/ludo-solo/index.html?scope="+encodeURIComponent(scope)+"&v=ludo-room-20261118-v6";
 return <section className="lr-ludo-embedded" aria-label="Ludo Solo dans Love Radar">
  <header className="lr-ludo-embedded-header">
   <button type="button" onClick={onExit} aria-label="Retourner à la liste des jeux">
    <span aria-hidden="true">‹</span> Jeux
   </button>
   <span className="lr-ludo-embedded-title"><img className="lr-ludo-embedded-logo" src="/ludo-mark.svg" alt="Logo Ludo"/> LUDO SOLO <small>TOI CONTRE L’ORDINATEUR</small></span>
   <span className="lr-ludo-embedded-heart" aria-hidden="true">♥</span>
  </header>
  <iframe
   className="lr-ludo-embedded-frame"
   title="Ludo Solo : choisir une couleur et jouer contre l’ordinateur"
   src={src}
   loading="eager"
   referrerPolicy="same-origin"
  />
 </section>;
}
