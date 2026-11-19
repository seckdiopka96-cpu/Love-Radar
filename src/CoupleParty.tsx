import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import type {PartyMode,ChallengeKind} from "./couple-party-engine";
import "./couple-party.css";

type Base={id:string;mode:PartyMode;version:number;round:number;phase:string;turn:number;scores:[number,number];updatedAt:number};
type RapidGame=Base&{mode:"rapid";phase:"ready"|"question"|"result";question:string|null;options:[string,string,string,string]|null;correct:number|null;
 myReady:boolean;partnerReady:boolean;
 myChoice:number|null;partnerPicked:boolean;partnerChoice:number|null;winner:number|null;startAt:number;deadlineAt:number};
type TruthGame=Base&{mode:"truth";phase:"choose"|"challenge";kind:ChallengeKind|null;prompt:string|null};
type Game=RapidGame|TruthGame;
type Data={ok:boolean;error?:string;members?:number;seat?:number;game?:Game|null;serverNow?:number;invited?:boolean};
type Props={mode:PartyMode;token:string;myName:string;partnerName:string|null;onExit:()=>void;onOpenChat:()=>void};
const requestUrl=(mode:PartyMode)=>"/api/couple-party?mode="+mode;
function initials(name:string){return name.trim().slice(0,1).toUpperCase()||"♥"}
export default function CoupleParty({mode,token,myName,partnerName,onExit,onOpenChat}:Props){
 const [data,setData]=useState<Data|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [clock,setClock]=useState(Date.now());
 const [offset,setOffset]=useState(0);
 const alive=useRef(true);
 const inFlight=useRef(false);
 const busyRef=useRef(false);
 const last=useRef<Game|null>(null);
 const accept=useCallback((result:Data)=>{
  if(!alive.current)return;
  const current=result.game;
  if(current&&last.current&&current.id===last.current.id&&current.version<last.current.version)return;
  if(current)last.current=current;
  setData(result);
  if(typeof result.serverNow==="number")setOffset(result.serverNow-Date.now());
  setLoading(false);
 },[]);
 const refresh=useCallback(async(silent=false)=>{
  if(inFlight.current||busyRef.current||document.visibilityState==="hidden")return;
  inFlight.current=true;
  try{
   const res=await apiFetch(requestUrl(mode),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const json=await res.json() as Data;
   if(!res.ok||!json.ok)throw Error(json.error||"Connexion au jeu indisponible.");
   accept(json);
   if(!silent)setError("");
  }catch(e){if(alive.current&&!silent){setError(e instanceof Error?e.message:"Impossible de charger le jeu.");setLoading(false)}}
  finally{inFlight.current=false}
 },[mode,token,accept]);
 useEffect(()=>{
  alive.current=true;
  last.current=null;
  setData(null);setLoading(true);setError("");
  void refresh();
  const refreshTimer=window.setInterval(()=>void refresh(true),900);
  const clockTimer=window.setInterval(()=>setClock(Date.now()),175);
  const visible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",visible);
  window.addEventListener("focus",visible);
  return()=>{alive.current=false;window.clearInterval(refreshTimer);window.clearInterval(clockTimer);
   document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible)};
 },[refresh]);
 useEffect(()=>{
  if(!notice)return;
  const timeout=window.setTimeout(()=>setNotice(""),2800);
  return()=>window.clearTimeout(timeout);
 },[notice]);
 async function post(action:"invite"|"ready"|"answer"|"next"|"pick"|"finish"|"pass",extra:Record<string,unknown>={}){
  const game=last.current;
  if(!game||busyRef.current)return;
  busyRef.current=true;setBusy(true);setError("");
  try{
   const res=await apiFetch(requestUrl(mode),{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action,gameId:game.id,round:game.round,...extra})
   });
   const json=await res.json() as Data;
   if(!res.ok||!json.ok)throw Error(json.error||"Action impossible.");
   accept(json);
   if(action==="invite")setNotice("Invitation envoyée à ton partenaire 💌");
   void refresh();
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Action impossible.");void refresh()}
  finally{busyRef.current=false;if(alive.current)setBusy(false)}
 }
 const game=data?.game||null;
 const seat=data?.seat??0;
 const name=partnerName||"Ton amour";
 const now=clock+offset;
 const isRapid=mode==="rapid";
 const title=isRapid?"Questions rapides":"Action ou vérité";
 const motto=isRapid?"La première bonne réponse marque le point.":"Vos secrets, vos rires, vos défis.";
 const rapid=game?.mode==="rapid"?game:null;
 const truth=game?.mode==="truth"?game:null;
 const truthMyTurn=Boolean(truth&&((truth.phase==="choose"&&truth.round===1)||truth.turn===seat));
 const secondsToStart=rapid?Math.max(0,Math.ceil((rapid.startAt-now)/1000)):0;
 const secondsLeft=rapid?Math.max(0,Math.ceil((rapid.deadlineAt-now)/1000)):0;
 const canAnswer=Boolean(rapid&&rapid.phase==="question"&&secondsToStart===0&&secondsLeft>0&&rapid.myChoice===null&&!busy);
 const mine=game?.scores[seat]??0,other=game?.scores[seat===0?1:0]??0;
 return <section className={"lr-party lr-party-"+mode} aria-label={title+" à deux"}>
  <div className="lr-party-top">
   <button type="button" className="lr-party-back" onClick={onExit} aria-label="Retour aux jeux">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
   </button>
   <span>JEU À DEUX · EN DIRECT</span>
   <button type="button" className="lr-party-invite" onClick={()=>void post("invite")} disabled={!game||busy||data?.members!==2}>Inviter 💌</button>
  </div>
  <header className="lr-party-hero">
   <span className="lr-party-kicker">{isRapid?"⚡ DÉFI DE RÉFLEXES":"💗 COMPLICITÉ À DEUX"}</span>
   <h1>{isRapid?<>Questions <em>rapides</em></>:<>Action <em>ou vérité</em></>}</h1>
   <p>{motto}</p>
  </header>
  <div className="lr-party-score" aria-label="Points des deux joueurs">
   <div className="lr-party-player"><span className="lr-party-avatar">{initials(myName)}</span><span className="lr-party-player-name">Toi</span><strong>{mine}</strong></div>
   <div className="lr-party-round"><span>{isRapid?"VS":"♥"}</span><small>Manche {game?.round||1}</small></div>
   <div className="lr-party-player"><span className="lr-party-avatar is-other">{initials(name)}</span><span className="lr-party-player-name">{name}</span><strong>{other}</strong></div>
  </div>
  {loading?<div className="lr-party-panel lr-party-wait" role="status">Chargement de votre partie…</div>:
   !game||data?.members!==2?<div className="lr-party-panel lr-party-wait">
    <span className="lr-party-big-icon">💌</span>
    <strong>Votre partie vous attend</strong>
    <p>Rejoignez tous les deux votre espace privé pour jouer ensemble, même à distance.</p>
    <button type="button" className="lr-party-primary" onClick={onOpenChat}>Ouvrir notre conversation</button>
   </div>:
   rapid?.phase==="ready"?<div className="lr-party-panel lr-party-wait lr-party-ready">
    <span className="lr-party-big-icon" aria-hidden="true">⚡</span>
    <strong>Prêts à commencer la partie ?</strong>
    <p>Validez une seule fois tous les deux. Ensuite, vous restez dans la même salle et les manches s'enchaînent sans nouvelle confirmation.</p>
    <div className="lr-party-ready-status" role="status">
     <span className={rapid.myReady?"is-ready":""}>Toi {rapid.myReady?"✓ Prêt(e)":"· En attente"}</span>
     <span className={rapid.partnerReady?"is-ready":""}>{name} {rapid.partnerReady?"✓ Prêt(e)":"· En attente"}</span>
    </div>
    <button type="button" className="lr-party-primary" disabled={rapid.myReady||busy}
     onClick={()=>void post("ready")}>{rapid.myReady?"✓ Tu es prêt(e)":"Je suis prêt(e) →"}</button>
   </div>:
   rapid?<div className="lr-party-panel">
    <div className="lr-party-question-meta">
     <span>QUESTION {rapid.round}</span>
     <span className={"lr-party-timer"+(secondsLeft<=5?" urgent":"")} aria-live="off">{rapid.phase==="result"?"Terminé":secondsToStart>0?"Départ dans "+secondsToStart+"…":secondsLeft+" s"}</span>
    </div>
    <div className="lr-party-timer-track" aria-hidden="true">
     <span style={{width:rapid.phase==="result"?"0%":secondsToStart>0?"100%":Math.max(0,Math.min(100,(rapid.deadlineAt-now)/180))+"%"}}/>
    </div>
    <h2>{rapid.question||"Question en préparation…"}</h2>
    <div className="lr-party-answers" role="group" aria-label="Choisir une réponse">
     {(rapid.options||[]).map((choice,index)=>{
      const revealed=rapid.phase==="result";
      const correct=revealed&&rapid.correct===index;
      const wrong=revealed&&rapid.myChoice===index&&!correct;
      return <button type="button" key={index} className={"lr-party-answer"+(correct?" is-correct":"")+(wrong?" is-wrong":"")+(rapid.myChoice===index?" is-selected":"")}
       disabled={!canAnswer} aria-pressed={rapid.myChoice===index} onClick={()=>void post("answer",{choice:index})}>
       <span className="lr-party-answer-letter">{["A","B","C","D"][index]}</span><span>{choice}</span>
       {correct?<b aria-label="Bonne réponse">✓</b>:wrong?<b aria-label="Mauvaise réponse">×</b>:rapid.myChoice===index?<b>●</b>:null}
      </button>
     })}
    </div>
    {rapid.phase==="result"?<div className="lr-party-result" role="status">
     <strong>{rapid.winner===seat?"🎉 Tu marques le point !":rapid.winner===null?"⌛ Personne n'a marqué cette fois.":"💗 "+name+" marque le point !"}</strong>
     <span>Bonne réponse : {rapid.options?.[rapid.correct??0]||"—"}</span>
     <button type="button" className="lr-party-primary" disabled={busy} onClick={()=>void post("next")}>Question suivante →</button>
    </div>:<p className="lr-party-hint" role="status">{secondsToStart>0?"3… 2… 1… Soyez prêts !":
     secondsLeft===0?"Calcul du résultat en cours…":
     rapid.myChoice!==null?"Ta réponse est enregistrée. Une seule tentative par manche.":
     rapid.partnerPicked?"Ton partenaire a déjà tenté sa chance. À toi !":"Réponds avant la fin du chrono pour marquer."}</p>}
   </div>:
   truth?<div className="lr-party-panel lr-party-truth-board">
    <span className="lr-party-turn">{truth.phase==="choose"&&truth.round===1?"À VOUS DE COMMENCER":truth.turn===seat?"C’EST TON TOUR":"AU TOUR DE "+name.toUpperCase()}</span>
    {truth.phase==="choose"?<>
     <h2>{truthMyTurn?"Que choisis-tu ?":"En attente du choix…"}</h2>
     <p>{truthMyTurn?"Prends une carte et relève ton défi. Tu peux toujours passer.":name+" choisit sa carte. Tu verras la même question sur ton téléphone."}</p>
     <div className="lr-party-deck">
      <button type="button" className="lr-party-deck-truth" disabled={busy||!truthMyTurn} onClick={()=>void post("pick",{kind:"truth"})}>
       <span>♥</span><strong>Vérité</strong><small>Une question sincère</small>
      </button>
      <button type="button" className="lr-party-deck-action" disabled={busy||!truthMyTurn} onClick={()=>void post("pick",{kind:"action"})}>
       <span>✦</span><strong>Action</strong><small>Un défi complice</small>
      </button>
     </div>
    </>:<>
     <span className="lr-party-challenge-symbol">{truth.kind==="truth"?"♥":"✦"}</span>
     <span className="lr-party-challenge-category">{truth.kind==="truth"?"VÉRITÉ":"ACTION"}</span>
     <h2 className="lr-party-challenge-text">{truth.prompt}</h2>
     <p>{truth.turn===seat?"Raconte ou réalise ce défi avec ton partenaire.":"Écoute ou regarde ton amour relever le défi !"}</p>
     {truth.turn===seat?<div className="lr-party-challenge-actions">
      <button type="button" className="lr-party-primary" disabled={busy} onClick={()=>void post("finish")}>✓ Défi relevé</button>
      <button type="button" className="lr-party-secondary" disabled={busy} onClick={()=>void post("pass")}>Passer sans point</button>
     </div>:<p className="lr-party-hint">En attente de {name}…</p>}
    </>}
   </div>:null
  }
  <div className="lr-party-footer">
   <p>{isRapid?"18 secondes par question · Un point pour la première réponse correcte.":"Un tour chacun · Un point par défi relevé · Aucun défi obligatoire."}</p>
   <button type="button" onClick={onOpenChat}>💬 Discuter ensemble</button>
  </div>
  {error?<div className="lr-party-alert" role="alert">{error}<button type="button" onClick={()=>{setError("");void refresh()}}>Réessayer</button></div>:null}
  {notice?<div className="lr-party-notice" role="status">{notice}</div>:null}
 </section>;
}
