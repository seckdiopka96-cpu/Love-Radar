import {useCallback,useEffect,useRef,useState} from "react";
import "./memory-love.css";
type GiftChoice="credit"|"internet"|"wave2000";
type Agreement={signed:[boolean,boolean];names:[string|null,string|null];signedAt:[number|null,number|null];giftChoices:[boolean|null,boolean|null];startedAt:number|null};
type Game={id:string;version:number;turn:number;cards:(string|null)[];matched:number[];revealed:number[];scores:[number,number];status:"playing"|"won";winner:number|null;pendingUntil:number|null;deadlineAt:number|null;lastAction:string;updatedAt:number};
type Gift={choice:GiftChoice|null;chosenBy:number|null;given:boolean};
type Challenge={gameId:string;fromId:string;fromName:string;fromSeat:number;sentAt:number};
type Data={ok:boolean;error?:string;members?:number;seat?:number;game?:Game|null;agreement?:Agreement|null;gift?:Gift;challenge?:Challenge|null;serverNow?:number};
type Props={token:string;mySeat:number;myName:string;partnerName:string|null;onExit:()=>void;challengeId?:string|null};
const GIFTS:{id:GiftChoice;label:string}[]=[
 {id:"credit",label:"📱 Crédit téléphonique"},{id:"internet",label:"🌐 Connexion Internet"},{id:"wave2000",label:"💸 Wave 2 000 F CFA"}
];
const giftName=(key:GiftChoice|null)=>GIFTS.find(item=>item.id===key)?.label||"Un cadeau surprise";
export default function MemoryLove({token,mySeat,myName,partnerName,onExit,challengeId}:Props){
 const [game,setGame]=useState<Game|null>(null),[agreement,setAgreement]=useState<Agreement|null>(null);
 const [gift,setGift]=useState<Gift|null>(null),[challenge,setChallenge]=useState<Challenge|null>(null);
 const [members,setMembers]=useState(0),[busy,setBusy]=useState(false),[signBusy,setSignBusy]=useState(false);
 const [rulesAccepted,setRulesAccepted]=useState(false),[signature,setSignature]=useState(""),[giftConsent,setGiftConsent]=useState<""|"yes"|"no">("");
 const [menu,setMenu]=useState(false),[giftOpen,setGiftOpen]=useState(false),[error,setError]=useState(""),[challengeHint,setChallengeHint]=useState("");
 const [now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0),[loading,setLoading]=useState(true);
 const live=useRef(true),currentId=useRef<string|null>(null),polling=useRef(false);
 const userName=(seat:number)=>seat===mySeat?myName:(partnerName||"Ton amour");
 const update=useCallback((data:Data)=>{
  if(data.game!==undefined){
   const next=data.game||null;
   setGame(previous=>!next||!previous||next.id!==previous.id||next.version>=previous.version?next:previous);
  }
  if(data.agreement!==undefined)setAgreement(data.agreement||null);
  if(data.gift!==undefined)setGift(data.gift||null);
  if(data.challenge!==undefined)setChallenge(data.challenge||null);
  if(data.members!==undefined)setMembers(data.members);
  if(typeof data.serverNow==="number")setOffset(data.serverNow-Date.now());
 },[]);
 const sync=useCallback(async()=>{
  if(polling.current)return;
  polling.current=true;
  try{
   const res=await fetch("/api/memory",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as Data;
   if(!res.ok||!data.ok)throw Error(data.error||"Connexion impossible.");
   if(live.current){update(data);setError("")}
  }catch(e){if(live.current)setError(e instanceof Error?e.message:"Le jeu ne répond pas.")}
  finally{polling.current=false;if(live.current)setLoading(false)}
 },[token,update]);
 useEffect(()=>{
  live.current=true;void sync();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void sync()},1600);
  const visible=()=>{if(document.visibilityState==="visible")void sync()};
  document.addEventListener("visibilitychange",visible);
  const clock=window.setInterval(()=>setNow(Date.now()),250);
  return()=>{live.current=false;window.clearInterval(timer);window.clearInterval(clock);document.removeEventListener("visibilitychange",visible)};
 },[sync]);
 useEffect(()=>{
  if(game?.id===currentId.current)return;
  currentId.current=game?.id||null;
  setSignature("");setRulesAccepted(false);setGiftConsent("");setChallengeHint("");setGiftOpen(false);
 },[game?.id]);
 const act=async(action:"flip"|"forfeit"|"restart",index?:number)=>{
  if(!game||busy)return false;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/memory",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action,version:game.version,...(index===undefined?{}:{index})})});
   const data=await res.json() as Data;
   if(!res.ok||!data.ok)throw Error(data.error||"Action impossible.");
   if(live.current)update(data);
   return true;
  }catch(e){if(live.current)setError(e instanceof Error?e.message:"Impossible de jouer.");void sync();return false}
  finally{if(live.current)setBusy(false)}
 };
 const post=async(action:"challenge"|"sign"|"gift_choose"|"gift_given",extra:Record<string,unknown>={})=>{
  setError("");setChallengeHint("");
  try{
   const res=await fetch("/api/memory",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});
   const data=await res.json() as Data;
   if(!res.ok||!data.ok)throw Error(data.error||"Impossible de continuer.");
   if(live.current){update(data);if(action==="challenge")setChallengeHint("Défi envoyé ! La notification ouvrira directement Memory Love ❤️");if(action==="gift_choose"||action==="gift_given")setGiftOpen(false)}
  }catch(e){if(live.current)setError(e instanceof Error?e.message:"Erreur de connexion.")}
 };
 const sign=async()=>{
  if(signBusy||!rulesAccepted||!signature.trim()||giftConsent==="")return;
  setSignBusy(true);
  await post("sign",{readRules:true,signature:signature.trim(),giftConsent:giftConsent==="yes"});
  if(live.current)setSignBusy(false);
 };
 const launch=async()=>{
  if(busy)return;
  setBusy(true);await post("challenge");if(live.current)setBusy(false);
 };
 const myTurn=Boolean(game&&game.status==="playing"&&agreement?.startedAt&&game.turn===mySeat);
 const remaining=game?.deadlineAt?Math.max(0,Math.ceil((game.deadlineAt-now-offset)/1000)):null;
 const canFlip=Boolean(myTurn&&!busy&&!game?.pendingUntil);
 const mySigned=Boolean(agreement?.signed[mySeat]);
 const agreed=Boolean(agreement?.giftChoices.every(x=>x===true));
 const mustSign=Boolean(game&&game.status==="playing"&&!agreement?.startedAt);
 const lastScore=game?.scores||[0,0];
 const timePending=Boolean(game?.pendingUntil&&game.pendingUntil>now+offset);
 return <section className="memory-experience" aria-label="Memory Love en ligne à deux">
  <header className="memory-top"><button type="button" className="memory-leave" onClick={()=>setMenu(true)}>‹ Quitter</button>
   <div className="memory-brand"><strong>MEMORY <span>♥</span> LOVE</strong><small>DEUX CŒURS · UN JEU</small></div>
   <button type="button" className="memory-gift-button" onClick={()=>setGiftOpen(true)} aria-label="Défi cadeau">🎁</button>
  </header>
  <div className="memory-player-bar">{[0,1].map(seat=><div key={seat} className={"memory-player"+(game?.turn===seat&&game.status==="playing"?" active":"")}>
   <span className={"memory-avatar avatar-"+seat}>{userName(seat)[0]?.toUpperCase()}</span>
   <span className="memory-player-text"><strong>{userName(seat)}{seat===mySeat?" · Moi":""}</strong><small>{lastScore[seat]} paire{lastScore[seat]>1?"s":""}</small></span>
   {game?.turn===seat&&game.status==="playing"?<b className="memory-turn-dot">●</b>:null}
  </div>)}</div>
  <div className={"memory-status"+(myTurn?" mine":"")} role="status">
    <span>{game?.status==="won"?"🏆":timePending?"✨":myTurn?"💖":"⏳"}</span>
    <strong>{!game?loading?"Chargement…":"En attente de votre couple":game.status==="won"?"Partie terminée":mustSign?"Signez les règles avant de jouer":timePending?"Les cartes se retournent…":myTurn?"À toi de retourner une carte !":"Au tour de "+userName(game.turn)}</strong>
    {remaining!==null?<b className={"memory-clock"+(remaining<=10?" urgent":"")}>{remaining}s</b>:null}
  </div>
  <div className="memory-play-center">
   {game?<div className="memory-grid" role="group" aria-label="Grille de seize cartes Memory Love">
    {game.cards.map((symbol,index)=>{
     const matched=game.matched.includes(index),shown=symbol!==null;
     return <button type="button" key={index} className={"memory-card"+(shown?" revealed":"")+(matched?" matched":"")}
      disabled={!canFlip||shown} onClick={()=>void act("flip",index)}
      aria-label={shown?"Carte "+(index+1)+" : "+symbol:"Retourner la carte "+(index+1)}>
      <span className="memory-card-inner"><span className="memory-card-back" aria-hidden="true"><span>♥</span></span><span className="memory-card-front" aria-hidden="true">{symbol||"♡"}</span></span>
      {matched?<span className="memory-card-spark" aria-hidden="true">✦</span>:null}
     </button>;
    })}
   </div>:<div className="memory-waiting"><span>💞</span><h2>{members<2?"Invite ton partenaire pour jouer !":"Préparation des cartes…"}</h2><button onClick={()=>void sync()}>Actualiser</button></div>}
  </div>
  <footer className="memory-footer"><div className="memory-progress"><span>💕 {game?.matched.length||0}/16 cartes retrouvées</span><div><i style={{width:((game?.matched.length||0)/16*100)+"%"}}/></div></div>
   <p>{error?"⚠️ "+error:game?.lastAction||"Retrouvez les paires à deux, même à distance."}</p>
   <div className="memory-footer-actions"><button type="button" onClick={()=>setGiftOpen(true)}>🎁 Défi cadeau</button><button type="button" onClick={()=>setMenu(true)}>← Quitter</button></div>
  </footer>
  {game?.status==="won"?<div className="memory-victory" role="dialog" aria-label="Fin de partie Memory Love">
   <div className="memory-confetti" aria-hidden="true">💖 ✦ 💕 ✦ 💗</div>
   <div className="memory-victory-medal">🏆</div>
   <h2>{game.winner===null?"Égalité !":game.winner===mySeat?"Tu as gagné !":userName(game.winner)+" gagne !"}</h2>
   <p>{lastScore[0]} – {lastScore[1]} paires</p>
   {agreed&&game.winner!==null? <div className="memory-victory-gift">🎁 {gift?.choice?giftName(gift.choice):"Le gagnant choisit un cadeau"}
    {gift?.given?" · Offert ✓":null}
    <button type="button" onClick={()=>setGiftOpen(true)}>{game.winner===mySeat?"Choisir mon cadeau":"Voir le cadeau"}</button>
   </div>:null}
   <button type="button" className="memory-restart" disabled={busy} onClick={()=>void act("restart")}>↻ Nouvelle partie</button>
   <button type="button" className="memory-muted" onClick={onExit}>Retour à l’accueil</button>
  </div>:null}
  {mustSign?<div className="memory-modal-backdrop"><div className="memory-sign-panel" role="dialog" aria-modal="true" aria-label="Lire et signer les règles de Memory Love">
   <div className="memory-sign-head"><div className="memory-sign-emoji">💌</div><div><h2>Notre défi Memory Love</h2><p>À lire et signer avant chaque partie</p></div></div>
   {challenge&&challenge.fromSeat!==mySeat&&challenge.gameId===game?.id?<p className="memory-challenge-notice">🎲 {challenge.fromName} t’a lancé un défi Memory Love !</p>:challengeId&&challengeId!==game?.id?<p className="memory-challenge-notice">Ce défi n’est plus actif. Voici la nouvelle partie.</p>:null}
   <div className="memory-sign-players">{[0,1].map(seat=><div key={seat}><b>{agreement?.signed[seat]?"✅":"✍️"} {userName(seat)}</b><small>{agreement?.signed[seat]?"A signé":"Signature attendue"}</small></div>)}</div>
   {!mySigned?<><div className="memory-rules" tabIndex={0}>
    <h3>🃏 Règles du jeu</h3>
    <p>Vous jouez en ligne à deux sur le même plateau de 16 cartes : huit paires cachées. Chacun retourne deux cartes pendant son tour.</p>
    <p>Deux cartes identiques = une paire gagnée et un nouveau tour. Sinon, les cartes restent visibles un instant, se retournent et c’est au partenaire de jouer.</p>
    <p><strong>⏱ 30 secondes</strong> pour faire chaque action : en cas d’absence, l’ordinateur joue automatiquement à la place du joueur. Il peut agir quand au moins un téléphone est connecté.</p>
    <p>Quand toutes les paires sont trouvées, le joueur qui en a le plus gagne. En cas d’égalité, personne ne doit de cadeau.</p>
    <h3>🎁 Défi cadeau — facultatif</h3>
    <p>Si vous acceptez tous les deux avant la partie, le perdant offrira le cadeau choisi par le gagnant : crédit téléphonique, forfait Internet ou 2 000 F CFA via Wave.</p>
    <p>C’est un accord amical entre vous, non une obligation légale. Love Radar ne réalise aucun paiement et ne demande aucune donnée bancaire.</p>
   </div>
   <label className="memory-sign-read"><input type="checkbox" checked={rulesAccepted} onChange={e=>setRulesAccepted(e.target.checked)}/> J’ai lu et compris les règles.</label>
   <fieldset className="memory-gift-consent"><legend>Acceptes-tu le défi cadeau si tu perds ?</legend>
    <label><input type="radio" name="memory-gift" checked={giftConsent==="yes"} onChange={()=>setGiftConsent("yes")}/> Oui, j’accepte 🎁</label>
    <label><input type="radio" name="memory-gift" checked={giftConsent==="no"} onChange={()=>setGiftConsent("no")}/> Non, jouer sans cadeau</label>
   </fieldset>
   <label className="memory-signature-label">Ta signature (nom de profil : <b>{myName}</b>)
    <input type="text" maxLength={80} autoComplete="off" placeholder={"Écris « "+myName+" »"} value={signature} onChange={e=>setSignature(e.target.value)}/>
   </label>
   <button className="memory-primary" type="button" disabled={signBusy||!rulesAccepted||!signature.trim()||!giftConsent} onClick={()=>void sign()}>{signBusy?"Enregistrement…":"✍️ Signer les règles"}</button>
   </>:<div className="memory-signed-wait"><span>✅</span><h3>Tu as signé !</h3><p>{agreement?.signed[1-mySeat]?"Les deux signatures sont enregistrées.":"En attente de la signature de "+userName(1-mySeat)+"…"}</p><p>Défi cadeau : {agreement?.giftChoices[mySeat]?"Accepté 🎁":"Non accepté"}</p></div>}
   <button className="memory-invite-btn" type="button" onClick={()=>void launch()} disabled={busy}>{busy?"Envoi…":"💌 Lancer un défi à mon partenaire"}</button>
   {challengeHint?<p className="memory-challenge-hint" role="status">{challengeHint}</p>:null}
   {error?<p className="memory-modal-error" role="alert">{error}</p>:null}
   <button className="memory-muted" type="button" onClick={onExit}>← Retour à l’accueil</button>
   <small className="memory-legal">Signatures privées enregistrées pour cette manche. Elles ne constituent pas une signature légale certifiée.</small>
  </div></div>:null}
  {menu?<div className="memory-modal-backdrop"><div className="memory-simple-modal" role="dialog" aria-modal="true" aria-label="Quitter Memory Love">
    <div className="memory-modal-emoji">💞</div><h2>Quitter Memory Love ?</h2><p>Tu peux revenir à l’accueil en gardant ta partie, ou abandonner. Un abandon donne la victoire à ton partenaire.</p>
    <button type="button" className="memory-primary" onClick={onExit}>← Retour à l’accueil</button>
    {game?.status==="playing"&&agreement?.startedAt?<button type="button" className="memory-danger" disabled={busy} onClick={()=>void act("forfeit").then(done=>{if(done)onExit()})}>Abandonner cette partie</button>:null}
    <button type="button" className="memory-muted" onClick={()=>setMenu(false)}>Continuer à jouer</button>
   </div></div>:null}
  {giftOpen?<div className="memory-modal-backdrop"><div className="memory-simple-modal" role="dialog" aria-modal="true" aria-label="Cadeau de Memory Love">
   <div className="memory-modal-emoji">🎁</div><h2>Le défi cadeau</h2>
   {game?.status==="won"&&agreed&&game.winner!==null?game.winner===mySeat?<>
    <p>Tu as gagné ! Choisis ton cadeau parmi ces trois propositions.</p>
    {GIFTS.map(item=><button key={item.id} type="button" className="memory-gift-option" onClick={()=>void post("gift_choose",{choice:item.id})}>{item.label}</button>)}
   </>:<><p>{gift?.choice?giftName(gift.choice):"Ton partenaire choisit son cadeau."}</p>
    {gift?.choice?<button className="memory-primary" type="button" disabled={gift.given} onClick={()=>void post("gift_given",{given:true})}>{gift.given?"Déclaré offert ✓":"J’ai offert le cadeau"}</button>:null}
   </>:<><p>Le cadeau est facultatif. Il ne s’applique que si les deux partenaires l’ont accepté en signant avant le début de la manche.</p><p>{agreed?"✅ Défi accepté par les deux partenaires.":"Cette manche n’a pas de cadeau obligatoire."}</p></>}
   <p>Aucun paiement automatique par Love Radar.</p>
   {error?<p role="alert">{error}</p>:null}
   <button type="button" className="memory-muted" onClick={()=>setGiftOpen(false)}>Fermer</button>
   </div></div>:null}
 </section>;
}
