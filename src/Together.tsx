import {apiFetch} from "./api";
import {useCallback,useEffect,useRef,useState} from "react";
import "./together.css";
import "./together-premium.css";

type Signal={id:string;sender_id:string;seat:number;kind:string;reply_to:string|null;created_at:number};
type Reply={ok:boolean;error?:string;signals?:Signal[];focus?:Signal|null};
type Props={
 token:string;myName:string;partnerName:string|null;mySeat:number;onExit:()=>void;
 onOpenMoment:()=>void;onOpenReunion:()=>void;onOpenWatch:()=>void;onOpenPuzzle:()=>void;onOpenReconcile:()=>void;onOpenCare:()=>void;onOpenLife:()=>void;onOpenCamera:()=>void;
 focusKind?:"love-signal"|null;focusId?:string|null
};
const RESPONSE_OPTIONS=[
 {kind:"heart",symbol:"❤️",text:"Moi aussi"},
 {kind:"kiss",symbol:"😘",text:"Je t’embrasse"},
 {kind:"love",symbol:"💖",text:"Je t’aime"}
];
function messageOf(signal:Signal){
 if(signal.kind==="miss")return "Tu me manques… ❤️";
 if(signal.kind==="kiss")return "Un bisou juste pour toi 😘";
 if(signal.kind==="love")return "Je t’aime 💖";
 return "Tu me manques aussi ❤️";
}
export default function Together({token,myName,partnerName,mySeat,onExit,onOpenMoment,onOpenReunion,onOpenWatch,onOpenPuzzle,onOpenReconcile,onOpenCare,onOpenLife,onOpenCamera,focusKind,focusId}:Props){
 const [signals,setSignals]=useState<Signal[]>([]);
 const [focused,setFocused]=useState<Signal|null>(null);
 const [onlyFocused,setOnlyFocused]=useState(Boolean(focusKind==="love-signal"&&focusId));
 const [showAll,setShowAll]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const alive=useRef(true),requesting=useRef(false);
 const partner=partnerName||"Ton amour";
 const focusIdValid=focusKind==="love-signal"&&focusId&&/^[0-9a-f-]{36}$/i.test(focusId)?focusId:null;
 useEffect(()=>{setOnlyFocused(Boolean(focusIdValid));},[focusIdValid]);
 const load=useCallback(async(silent=false)=>{
  if(requesting.current)return;
  requesting.current=true;
  try{
   const query=focusIdValid?"?focus="+encodeURIComponent(focusIdValid):"";
   const response=await apiFetch("/api/together"+query,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as Reply;
   if(!data.ok||!response.ok)throw Error(data.error||"Nos petits mots sont indisponibles.");
   if(alive.current){
    setSignals(previous=>JSON.stringify(previous)===JSON.stringify(data.signals||[])?previous:data.signals||[]);
    setFocused(previous=>JSON.stringify(previous)===JSON.stringify(data.focus||null)?previous:data.focus||null);
    setError(previous=>previous?"":previous);
   }
  }catch(e){if(alive.current&&!silent)setError(e instanceof Error?e.message:"Connexion interrompue.")}
  finally{requesting.current=false;if(alive.current)setLoading(false)}
 },[token,focusIdValid]);
 useEffect(()=>{
  alive.current=true;void load();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load(true)},6000);
  const visible=()=>{if(document.visibilityState==="visible")void load(true)};
  document.addEventListener("visibilitychange",visible);
  return ()=>{alive.current=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[load]);
 async function send(body:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await apiFetch("/api/together",{
    method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(body)
   });
   const data=await response.json() as Reply;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d’envoyer ton cœur.");
   if(!alive.current)return;
   if(data.signals)setSignals(data.signals);
   if(data.focus!==undefined)setFocused(data.focus||null);
   setNotice(body.action==="miss"?"Ton cœur est parti vers "+partner+" ! 💗":"Ta réponse a été envoyée. 💌");
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{if(alive.current)setBusy(false)}
 }
 const selected=onlyFocused?(focused||signals.find(s=>s.id===focusIdValid)||null):null;
 const canReply=(signal:Signal)=>signal.kind==="miss"&&signal.seat!==mySeat&&
  !signals.some(s=>s.seat===mySeat&&s.reply_to===signal.id);
 const feed=selected?[selected]:showAll?signals.slice(-9).reverse():signals.slice(-1);
 return <section className="tg-page tg-page-premium" aria-label="Nous deux, votre espace privé">
  <header className="tg-top">
   <button type="button" onClick={onExit} className="tg-back" aria-label="Retour à l’accueil">
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
   </button>
   <div className="tg-brand"><strong>Nous deux</strong><small>VOTRE ESPACE À DEUX</small></div>
   <span className="tg-header-sparkle" aria-hidden="true">✧</span>
  </header>
  <div className="tg-activities">
   <div className="tg-section-label"><strong>À PARTAGER ENSEMBLE</strong><small>Même à distance</small></div>
   <button type="button" className="tg-watch-feature" onClick={onOpenWatch}>
    <span className="tg-watch-symbol" aria-hidden="true">▶</span>
    <span className="tg-watch-copy"><small>NOTRE CINÉMA</small><strong>Regarder ensemble</strong><span>YouTube et TikTok, au même moment</span></span>
    <span className="tg-watch-arrow" aria-hidden="true">›</span>
   </button>
   <button type="button" className="tg-life-feature" onClick={onOpenLife} aria-label="Découvrir les six activités du quotidien">
    <span className="tg-life-emblem" aria-hidden="true">💞</span>
    <span className="tg-life-content"><small>6 EXPÉRIENCES À DEUX</small><strong>Notre quotidien</strong><span>Soirées · Humeurs · Rêves · Câlins · Défis · Surprises</span></span>
    <span className="tg-life-arrow" aria-hidden="true">›</span>
   </button>
   <button type="button" className="lr-together-fun-feature" onClick={onOpenCamera} aria-label="Ouvrir la caméra fun avec effets animés">
    <span className="lr-together-fun-icon" aria-hidden="true">✨</span>
    <span><small>NOTRE STUDIO PHOTO</small><strong>Caméra fun</strong><em>Filtres animés · Photos · Vidéos · Sans appel</em></span>
    <b aria-hidden="true">›</b>
   </button>
   <div className="tg-shortcuts" aria-label="Nos activités à deux">
    <button type="button" className="tg-moment-link" onClick={onOpenMoment}>
     <span className="tg-tile-icon" aria-hidden="true">💌</span><strong>Notre moment</strong><small>Chaque jour</small>
    </button>
    <button type="button" className="tg-reunion-link" onClick={onOpenReunion}>
     <span className="tg-tile-icon" aria-hidden="true">📅</span><strong>Retrouvailles</strong><small>Nos rendez-vous</small>
    </button>
    <button type="button" className="tg-reconcile-entry" onClick={onOpenReconcile} aria-label="On se comprend : un espace pour mieux s’écouter">
     <span className="tg-tile-icon" aria-hidden="true">🕊️</span><strong>On se comprend</strong><small>S’écouter</small>
    </button>
    <button type="button" className="tg-puzzle-open" onClick={onOpenPuzzle}>
     <span className="tg-tile-icon" aria-hidden="true">🧩</span><strong>Puzzle à deux</strong><small>Jouer ensemble</small>
    </button>
   </div>
   <button type="button" className="tg-care-entry" onClick={onOpenCare}>
    <span className="tg-care-symbol" aria-hidden="true">💗</span>
    <span><small>PRENDRE SOIN DE NOUS</small><strong>Nos petites attentions</strong><small>Règles et rappels de prière, en toute liberté</small></span>
    <b aria-hidden="true">›</b>
   </button>
  </div>
  <section className="tg-affection-section" aria-labelledby="tg-affection-heading">
   <div className="tg-affection-heading">
    <div><span className="tg-heart-kicker">UNE PETITE ATTENTION</span><h2 id="tg-affection-heading">Un cœur pour toi</h2><p>Un geste, même à distance.</p></div>
    <button type="button" className="tg-send-heart" disabled={busy||!partnerName} onClick={()=>void send({action:"miss"})}>
     <span aria-hidden="true">💗</span> Envoyer
    </button>
   </div>
   {!partnerName?<p className="tg-partner-hint">Invite ton partenaire pour lui envoyer un cœur.</p>:null}
   {selected?<div className="tg-direct-notice" role="status">
    <span>NOTIFICATION REÇUE</span>
    <strong>{selected.seat===mySeat?"Tu as envoyé ce cœur":partner+" pense à toi"}</strong>
    <button type="button" onClick={()=>{setOnlyFocused(false);setShowAll(false)}}>Voir les petits mots</button>
   </div>:null}
   <div className="tg-heart-feed">
    <div className="tg-heart-feed-title">
     <strong>{selected?"Le cœur reçu":"Nos petits mots"}</strong>
     {!selected&&signals.length>1?<button type="button" className="tg-history-toggle" aria-expanded={showAll} onClick={()=>setShowAll(value=>!value)}>
      {showAll?"Réduire":"Tout voir ("+signals.length+")"}
     </button>:<span aria-hidden="true">♡</span>}
    </div>
    {loading&&!signals.length?<p>Chargement des petits mots…</p>:feed.length===0?
     <div className="tg-feed-empty"><span aria-hidden="true">💌</span><strong>Votre premier petit mot vous attend</strong>
      <p>Envoyez un cœur pour commencer.</p></div>:
     feed.map(signal=><article key={signal.id} className={"tg-signal"+(signal.seat===mySeat?" sent":" received")}>
      <span className="tg-signal-avatar">{(signal.seat===mySeat?myName:partner).slice(0,1).toUpperCase()}</span>
      <div className="tg-signal-content">
       <small>{signal.seat===mySeat?"Toi":partner} · {new Date(signal.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small>
       <strong>{messageOf(signal)}</strong>
       {canReply(signal)?<div className="tg-reply-options">
        {RESPONSE_OPTIONS.map(option=><button key={option.kind} type="button" disabled={busy} onClick={()=>void send({action:"reply",kind:option.kind,replyTo:signal.id})}>{option.symbol} {option.text}</button>)}
       </div>:null}
      </div>
     </article>)}
   </div>
  </section>
  {error?<p className="tg-floating-alert" role="alert">{error}</p>:null}
  {notice?<p className="tg-floating-alert tg-floating-success" role="status">{notice}</p>:null}
 </section>;
}
