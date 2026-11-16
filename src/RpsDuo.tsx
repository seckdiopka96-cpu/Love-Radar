import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import {RPS_MOVES,rpsEmoji,rpsName,type RpsMove} from "./rps-engine";
import "./rps-duo.css";

type Game={
 id:string;round:number;version:number;status:"choosing"|"revealed";
 mine:RpsMove|null;partnerPicked:boolean;partnerMove:RpsMove|null;
 scores:[number,number];ties:number;winner:0|1|null;ready:[boolean,boolean];
 updatedAt:number;revealedAt:number|null
};
type Data={ok:boolean;error?:string;members?:number;seat?:number;game?:Game|null;invited?:boolean;serverNow?:number};
type Props={token:string;myName:string;partnerName:string|null;onExit:()=>void;onOpenChat:()=>void};
const REACTION_EMOJI=["🎉","🔥","😂","👏","💗"];
function haptic(){try{navigator.vibrate?.(12)}catch{/* iOS may not support vibration. */}}
function outcomeMessage(game:Game,seat:number){
 return game.winner===null?"Égalité ! Rejouez pour vous départager.":game.winner===seat?"Tu as gagné cette manche !":"Ton partenaire a gagné cette manche !";
}
export default function RpsDuo({token,myName,partnerName,onExit,onOpenChat}:Props){
 const [data,setData]=useState<Data|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState<"choose"|"next"|"invite"|null>(null);
 const [optimistic,setOptimistic]=useState<RpsMove|null>(null);
 const [error,setError]=useState("");
 const [celebrate,setCelebrate]=useState(false);
 const [showRules,setShowRules]=useState(false);
 const inFlight=useRef(false);
 const latest=useRef<Game|null>(null);
 const active=useRef(true);
 const clearEffect=useRef<number|null>(null);
 const apply=useCallback((next:Data)=>{
  if(!active.current)return;
  const incoming=next.game;
  const previous=latest.current;
  if(previous&&incoming&&incoming.id===previous.id&&incoming.version<previous.version)return;
  if(incoming){
   if(previous&&incoming.id===previous.id&&incoming.round===previous.round&&previous.status==="choosing"&&incoming.status==="revealed"){
    haptic();setCelebrate(true);
    if(clearEffect.current!==null)window.clearTimeout(clearEffect.current);
    clearEffect.current=window.setTimeout(()=>{if(active.current)setCelebrate(false)},1800);
   }
   latest.current=incoming;
  }
  setData(next);
  setLoading(false);
  if(incoming?.mine||incoming?.status==="revealed")setOptimistic(null);
 },[]);
 const refresh=useCallback(async()=>{
  if(!token||inFlight.current||document.visibilityState==="hidden")return;
  inFlight.current=true;
  try{
   const response=await apiFetch("/api/rps",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const next=await response.json() as Data;
   if(!response.ok||!next.ok)throw Error(next.error||"Jeu indisponible.");
   apply(next);setError("");
  }catch(err){if(active.current){setError(err instanceof Error?err.message:"Connexion indisponible.");setLoading(false)}}
  finally{inFlight.current=false}
 },[token,apply]);
 useEffect(()=>{
  active.current=true;
  void refresh();
  // Poll only while the game is visible: ~1 second end-to-end on a good network.
  const timer=window.setInterval(()=>{void refresh()},900);
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("focus",onVisible);
  return()=>{
   active.current=false;window.clearInterval(timer);
   document.removeEventListener("visibilitychange",onVisible);
   window.removeEventListener("focus",onVisible);
   if(clearEffect.current!==null)window.clearTimeout(clearEffect.current);
  };
 },[refresh]);
 async function act(action:"choose"|"next"|"invite",move?:RpsMove){
  const game=latest.current||data?.game;
  if(!game||busy)return;
  if(action==="choose"){
   if(!move||game.status!=="choosing"||game.mine)return;
   setOptimistic(move);
  }
  setBusy(action);setError("");haptic();
  try{
   const response=await apiFetch("/api/rps",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action,gameId:game.id,round:game.round,...(move?{move}:{})})
   });
   const result=await response.json() as Data;
   if(!response.ok||!result.ok)throw Error(result.error||"Action impossible.");
   if(result.game)apply(result);
   if(action==="invite")setToast("Invitation demandée. Ton partenaire peut rejoindre le jeu.");
   if(action==="next")setToast("Prêt pour la prochaine manche !");
   void refresh();
  }catch(err){setError(err instanceof Error?err.message:"Action impossible.");setOptimistic(null);void refresh()}
  finally{if(active.current)setBusy(null)}
 }
 const [toast,setToast]=useState("");
 useEffect(()=>{
  if(!toast)return;
  const timer=window.setTimeout(()=>setToast(""),2800);
  return()=>window.clearTimeout(timer);
 },[toast]);
 const game=data?.game||null;
 const seat=data?.seat??0;
 const myScore=game?.scores[seat]??0;
 const partnerScore=game?.scores[seat===0?1:0]??0;
 const myChoice=game?.mine||optimistic;
 const partnerChoice=game?.status==="revealed"?game.partnerMove:null;
 const iAmReady=Boolean(game?.ready[seat]);
 const partnerReady=Boolean(game?.ready[seat===0?1:0]);
 return <section className="lr-rps" aria-label="Pierre Papier Ciseaux en temps réel">
  <div className="lr-rps-topbar">
   <button type="button" className="lr-rps-back" onClick={onExit} aria-label="Retour aux jeux">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"/></svg>
   </button>
   <span>JEU À DEUX · EN DIRECT</span>
   <button type="button" className="lr-rps-rules-button" onClick={()=>setShowRules(true)} aria-label="Règles du jeu">?</button>
  </div>
  <div className="lr-rps-hero"><div className="lr-rps-badge"><span className="lr-rps-live-dot"/> SYNCHRONISÉ ENTRE VOUS DEUX</div>
   <h1>Pierre <em>Papier</em> Ciseaux</h1>
   <p>Choisis sans montrer ta main. Découvrez vos choix ensemble !</p>
  </div>
  <div className="lr-rps-score" aria-label="Score du match">
   <div className="lr-rps-player"><span className="lr-rps-avatar">{myName.trim().charAt(0).toUpperCase()}</span><strong>Toi</strong><b>{myScore}</b></div>
   <span className="lr-rps-vs">VS</span>
   <div className="lr-rps-player"><span className="lr-rps-avatar is-other">{(partnerName||"?").trim().charAt(0).toUpperCase()}</span><strong>{partnerName||"Ton partenaire"}</strong><b>{partnerScore}</b></div>
  </div>
  <div className="lr-rps-progress"><span>Manche <strong>{game?.round||1}</strong></span><span>Égalités <strong>{game?.ties||0}</strong></span></div>
  {loading?<div className="lr-rps-center" role="status">Connexion au jeu…</div>:!game||data?.members!==2?
   <div className="lr-rps-center">
    <div className="lr-rps-wait-icon">💌</div>
    <strong>Ton partenaire n’a pas encore rejoint l’espace</strong>
    <p>Vous devez être deux dans votre espace privé pour commencer la partie.</p>
    <button type="button" className="lr-rps-chat-link" onClick={onOpenChat}>Ouvrir les messages</button>
   </div>:
   <div className="lr-rps-board">
    <div className={"lr-rps-arena"+(celebrate?" is-revealing":"")}>
     <div className="lr-rps-hand">
      <span className="lr-rps-hand-caption">TON CHOIX</span>
      <div className={"lr-rps-hand-disc"+(myChoice?" is-picked":"")}>{rpsEmoji(myChoice)}</div>
      <strong>{rpsName(myChoice)}</strong>
     </div>
     <span className="lr-rps-arena-middle">{game.status==="revealed"?"VS":"✦"}</span>
     <div className="lr-rps-hand">
      <span className="lr-rps-hand-caption">{partnerName||"L’AUTRE"}</span>
      <div className={"lr-rps-hand-disc is-other"+(game.partnerPicked?" is-picked":"")}>{game.status==="revealed"?rpsEmoji(partnerChoice):"❔"}</div>
      <strong>{game.status==="revealed"?rpsName(partnerChoice):game.partnerPicked?"Choix enregistré":"Choix secret"}</strong>
     </div>
    </div>
    {game.status==="choosing"?<>
     <div className="lr-rps-status" role="status">
      {myChoice?(game.partnerPicked?"Vos deux choix arrivent…":"Ton choix est enregistré. En attente de l’autre joueur…"):"À toi de choisir ta main !"}
     </div>
     <div className="lr-rps-options" aria-label="Choisir Pierre Papier ou Ciseaux">
      {RPS_MOVES.map(option=><button key={option.id} type="button" className={"lr-rps-option"+(myChoice===option.id?" is-picked":"")} onClick={()=>void act("choose",option.id)} aria-pressed={myChoice===option.id}
       disabled={!!myChoice||busy!==null}>
       <span className="lr-rps-option-emoji" aria-hidden="true">{option.emoji}</span><strong>{option.label}</strong><small>{option.detail}</small>
      </button>)}
     </div>
    </>:<>
     <div className={"lr-rps-result"+(game.winner===seat?" is-win":game.winner===null?" is-tie":" is-loss")} role="status">
      <div className="lr-rps-result-emojis" aria-hidden="true">{game.winner===seat?"🏆 🎊":game.winner===null?"🤝 ✨":"💪 💗"}</div>
      <strong>{outcomeMessage(game,seat)}</strong>
      <span>{rpsName(game.mine)} contre {rpsName(game.partnerMove)}</span>
     </div>
     <div className="lr-rps-ready-status">{iAmReady?(partnerReady?"Nouvelle manche en préparation…":"Tu es prêt(e). En attente de ton partenaire…"):"Prêt(e) à rejouer ?"} </div>
     <button type="button" className="lr-rps-next" onClick={()=>void act("next")} disabled={iAmReady||busy!==null}>{iAmReady?"✓ En attente…":"Manche suivante"}</button>
    </>}
    <div className="lr-rps-bottom-actions">
     <button type="button" onClick={()=>void act("invite")} disabled={busy!==null}>✉ Inviter mon partenaire</button>
     <button type="button" onClick={onOpenChat}>💬 Messages</button>
    </div>
   </div>}
  {error?<div className="lr-rps-error" role="alert">{error}<button type="button" onClick={()=>void refresh()}>Réessayer</button></div>:null}
  {toast?<div className="lr-rps-toast" role="status">{toast}</div>:null}
  {showRules?<div className="lr-rps-modal-backdrop" onClick={()=>setShowRules(false)}><div className="lr-rps-modal" role="dialog" aria-modal="true" aria-label="Règles de Pierre Papier Ciseaux" onClick={e=>e.stopPropagation()}>
   <h2>Comment jouer ?</h2>
   <p>Les deux joueurs choisissent une main secrètement. Les choix sont révélés seulement lorsque les deux sont prêts.</p>
   <div>{RPS_MOVES.map(option=><p key={option.id}><span aria-hidden="true">{option.emoji}</span> {option.detail}</p>)}</div>
   <p>Une victoire rapporte 1 point. En cas d’égalité, aucun des deux ne marque. Chacun confirme avant la prochaine manche.</p>
   <button type="button" onClick={()=>setShowRules(false)}>J’ai compris</button>
  </div></div>:null}
  {celebrate?<div className="lr-rps-celebration" aria-hidden="true">{REACTION_EMOJI.map((emoji,index)=><span key={index} style={{left:(index*20+7)+"%",animationDelay:(index*.12)+"s"}}>{emoji}</span>)}</div>:null}
 </section>;
}
