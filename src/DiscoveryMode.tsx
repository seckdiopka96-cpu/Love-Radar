import {useState} from "react";
import LudoSoloEmbedded from "./LudoSoloEmbedded";
import "./discovery-mode.css";

type Page="home"|"messages"|"games"|"ludo"|"quiz";
type Props={onClose:()=>void;onCreate:()=>void;onJoin:()=>void};
const DEMO_QUIZ=[
 {q:"Quel moment est parfait pour une soirée à deux ?",options:["Un film ensemble","Une surprise","Une longue discussion"],answer:"Il n'y a pas de mauvaise réponse ❤️"},
 {q:"Que choisirais-tu pour surprendre ton amour ?",options:["Un câlin virtuel","Un petit mot doux","Un jeu en duo"],answer:"Chaque attention compte 💗"},
 {q:"Quelle activité tester aujourd'hui ?",options:["Jouer au Ludo","Se poser une question","Partager un souvenir"],answer:"L’essentiel, c’est de partager ✨"}
];
export default function DiscoveryMode({onClose,onCreate,onJoin}:Props){
 const [page,setPage]=useState<Page>("home");
 const [selected,setSelected]=useState<number|null>(null);
 const [question,setQuestion]=useState(0);
 function choose(page:Page){setPage(page);setSelected(null)}
 const quiz=DEMO_QUIZ[question%DEMO_QUIZ.length];
 return <main className="lr-discovery" aria-label="Découverte gratuite de Love Radar">
  <div className="lr-discovery-head">
   <div><small>APERÇU GRATUIT · SANS COMPTE</small><h1>Découvre <em>Love Radar</em> ♡</h1>
    <p>Explore l'application avant d'inviter ton partenaire. Rien n'est envoyé ni enregistré sur nos serveurs.</p></div>
   <button type="button" className="lr-discovery-close" onClick={onClose} aria-label="Fermer le mode découverte">×</button>
  </div>
  <nav className="lr-discovery-tabs" aria-label="Découverte des fonctionnalités">
   {([{id:"home",label:"Accueil"},{id:"messages",label:"Messages"},{id:"games",label:"Jeux"}] as const).map(item=>
    <button type="button" key={item.id} aria-current={page===item.id?"page":undefined}
     className={page===item.id?"active":""} onClick={()=>choose(item.id)}>{item.label}</button>)}
  </nav>
  {page==="home"?<section className="lr-discovery-stage" aria-label="Exemple de tableau de bord">
   <span className="lr-discovery-kicker">VOTRE FUTUR ESPACE</span>
   <div className="lr-discovery-couple"><span className="lr-discovery-face">♡</span><span>♥</span><span className="lr-discovery-face">♡</span></div>
   <h2>Un petit univers, juste à deux.</h2>
   <p>Une messagerie privée, des appels, des jeux, des souvenirs et des défis à partager.</p>
   <div className="lr-discovery-cards">
    <button type="button" onClick={()=>choose("messages")}><span>💌</span><strong>Notre conversation</strong><small>Voir un exemple</small></button>
    <button type="button" onClick={()=>choose("games")}><span>🎲</span><strong>Jouer ensemble</strong><small>Essayer sans compte</small></button>
    <button type="button" onClick={onCreate}><span>🎨</span><strong>Thèmes à deux</strong><small>Gratuits, dans la conversation</small></button>
   </div>
  </section>:null}
  {page==="messages"?<section className="lr-discovery-stage" aria-label="Simulation de messagerie">
   <div className="lr-discovery-demo-label">SIMULATION · AUCUN VRAI MESSAGE</div>
   <div className="lr-discovery-chat-head"><span>💕</span><strong>Ton amour</strong><small>Conversation de démonstration</small></div>
   <div className="lr-discovery-chat">
    <p className="partner">Tu me manques ❤️</p>
    <p className="mine">On se fait une soirée ce soir ? 🌙</p>
    <p className="partner">Oui ! Et une partie de Ludo ? 🎲</p>
    <p className="mine">Avec plaisir 😂💕</p>
   </div>
   <p className="lr-discovery-explainer">Les véritables messages et appels s'activent dans votre espace privé après l'invitation. Aucun faux message n'est envoyé.</p>
   <button className="lr-discovery-primary" type="button" onClick={onCreate}>Créer notre vraie conversation →</button>
  </section>:null}
  {page==="games"?<section className="lr-discovery-stage" aria-label="Jeux disponibles">
   <h2>Essaie les jeux avant l'inscription</h2>
   <p>Deux activités jouables immédiatement, sans partenaire et sans compte.</p>
   <div className="lr-discovery-cards">
    <button type="button" onClick={()=>choose("ludo")}><span>🎲</span><strong>Ludo Solo</strong><small>Un vrai plateau contre l'ordinateur</small></button>
    <button type="button" onClick={()=>choose("quiz")}><span>💗</span><strong>Questions d'amour</strong><small>Mini-démo interactive</small></button>
   </div>
   <p className="lr-discovery-explainer">Les parties Duo et les défis partagés demandent deux comptes reliés.</p>
  </section>:null}
  {page==="ludo"?<section className="lr-discovery-play">
   <LudoSoloEmbedded scope="guest-discovery-v1" onExit={()=>choose("games")}/>
  </section>:null}
  {page==="quiz"?<section className="lr-discovery-stage" aria-label="Mini-jeu d'essai">
   <button className="lr-discovery-back" type="button" onClick={()=>choose("games")}>‹ Retour aux jeux</button>
   <span className="lr-discovery-kicker">PETIT JEU D'ESSAI · {question%DEMO_QUIZ.length+1} / {DEMO_QUIZ.length}</span>
   <h2>{quiz.q}</h2>
   <div className="lr-discovery-answers">{quiz.options.map((option,index)=>
    <button type="button" className={selected===index?"selected":""} key={option}
     onClick={()=>setSelected(index)}>{option}</button>)}</div>
   {selected!==null?<><p className="lr-discovery-feedback">{quiz.answer}</p>
    <button type="button" className="lr-discovery-primary" onClick={()=>{setSelected(null);setQuestion(q=>q+1)}}>Question suivante →</button></>:null}
  </section>:null}
  <footer className="lr-discovery-cta">
   <button type="button" className="lr-discovery-primary" onClick={onCreate}>Créer mon espace gratuit →</button>
   <button type="button" className="lr-discovery-secondary" onClick={onJoin}>J'ai déjà un code</button>
   <span>Créé par Diao-Tech.com · Démonstration indépendante</span>
  </footer>
 </main>;
}
