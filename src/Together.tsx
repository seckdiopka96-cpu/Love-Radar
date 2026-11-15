import {apiFetch} from "./api";
import {useCallback,useEffect,useRef,useState} from "react";
import "./together.css";

type Signal={id:string;sender_id:string;seat:number;kind:string;reply_to:string|null;created_at:number};
type Reply={ok:boolean;error?:string;signals?:Signal[];focus?:Signal|null};
type Props={
 token:string;myName:string;partnerName:string|null;mySeat:number;onExit:()=>void;
 onOpenMoment:()=>void;onOpenReunion:()=>void;onOpenWatch:()=>void;onOpenPuzzle:()=>void;onOpenReconcile:()=>void;
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
export default function Together({token,myName,partnerName,mySeat,onExit,onOpenMoment,onOpenReunion,onOpenWatch,onOpenPuzzle,onOpenReconcile,focusKind,focusId}:Props){
 const [signals,setSignals]=useState<Signal[]>([]);
 const [focused,setFocused]=useState<Signal|null>(null);
 const [onlyFocused,setOnlyFocused]=useState(Boolean(focusKind==="love-signal"&&focusId));
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
    setSignals(data.signals||[]);setFocused(data.focus||null);setError("");
   }
  }catch(e){if(alive.current&&!silent)setError(e instanceof Error?e.message:"Connexion interrompue.")}
  finally{requesting.current=false;if(alive.current)setLoading(false)}
 },[token,focusIdValid]);
 useEffect(()=>{
  alive.current=true;void load();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load(true)},2200);
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
 const feed=selected?[selected]:signals.slice(-9).reverse();
 return <section className="tg-page" aria-label="Nous deux, votre espace privé">
  <header className="tg-top">
   <button type="button" onClick={onExit} className="tg-back">‹ Accueil</button>
   <div className="tg-brand"><strong>Nous deux <span>♡</span></strong><small>LOVE RADAR · TOUJOURS ENSEMBLE</small></div>
   <span className="tg-top-heart" aria-hidden="true">♥</span>
  </header>
  <div className="tg-activities">
   <div className="tg-section-label"><strong>NOS ACTIVITÉS À DEUX</strong><small>Même à distance 💞</small></div>
   <button type="button" className="tg-watch-feature" onClick={onOpenWatch}>
    <span className="tg-watch-symbol" aria-hidden="true">▶</span>
    <span className="tg-watch-copy"><small>NOTRE CINÉMA · EN DIRECT</small><strong>Regarder ensemble</strong><span>YouTube & TikTok · Une vidéo pour vous deux</span></span>
    <span className="tg-watch-arrow" aria-hidden="true">›</span>
   </button>
   <div className="tg-shortcuts" aria-label="Nos moments privilégiés">
    <button type="button" className="tg-moment-link" onClick={onOpenMoment}><span aria-hidden="true">💌</span><strong>Moment</strong></button>
    <button type="button" className="tg-reunion-link" onClick={onOpenReunion}><span aria-hidden="true">📅</span><strong>Retrouvailles</strong></button>
   </div>
  </div>
  <button type="button" className="tg-reconcile-entry" onClick={onOpenReconcile} aria-label="Mode Réconciliation, exprimer librement ce qui me fait mal">
   <span className="tg-reconcile-icon" aria-hidden="true">🕊️</span>
   <span className="tg-reconcile-copy"><strong>On se comprend</strong><small>Un espace pour dire tout ce qui fait mal et s'écouter vraiment</small></span>
   <span className="tg-reconcile-arrow" aria-hidden="true">›</span>
  </button>
  <div className="tg-section-label tg-between-label"><strong>RIEN QUE NOUS DEUX</strong><small>Des attentions et des jeux</small></div>
  <div className="tg-modes" role="group" aria-label="Activités romantiques">
   <button type="button" className="selected" aria-current="page">💗 Tu me manques</button>
   <button type="button" className="tg-puzzle-open" onClick={onOpenPuzzle}>🧩 Puzzle à deux</button>
  </div>
  <div className="tg-heart-screen">
   {selected?<div className="tg-direct-notice" role="status"><span>Notification reçue</span>
    <strong>{selected.seat===mySeat?"Tu as envoyé ce cœur":partner+" pense à toi"}</strong>
    <button type="button" onClick={()=>setOnlyFocused(false)}>Voir nos autres cœurs →</button></div>:null}
   <div className="tg-heart-center">
    <span className="tg-heart-kicker">TOUJOURS UN PEU PLUS PRÈS</span>
    <span className="tg-heart-animation" aria-hidden="true">♥</span>
    <h1>Un petit cœur, <em>juste pour toi.</em></h1>
    <p>Même à distance, une pensée peut traverser le monde.</p>
    {!selected?<button type="button" className="tg-send-heart" disabled={busy||!partnerName} onClick={()=>void send({action:"miss"})}>💗 Tu me manques</button>:null}
    {!partnerName?<small>Invite ton partenaire pour lui envoyer un cœur.</small>:null}
   </div>
   <div className="tg-heart-feed">
    <div className="tg-heart-feed-title"><strong>{selected?"Ce cœur reçu":"Nos petits mots"}</strong><span>♡</span></div>
    {loading&&!signals.length?<p>Chargement des cœurs…</p>:feed.length===0?
     <div className="tg-feed-empty"><span aria-hidden="true">💌</span><strong>Votre première attention vous attend</strong>
      <p>Un petit mot, un cœur… vos moments apparaîtront ici.</p></div>:
     feed.map(signal=><article key={signal.id} className={"tg-signal"+(signal.seat===mySeat?" sent":" received")}>
      <span className="tg-signal-avatar">{(signal.seat===mySeat?myName:partner).slice(0,1).toUpperCase()}</span>
      <div className="tg-signal-content"><small>{signal.seat===mySeat?"Toi":partner} · {new Date(signal.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small>
       <strong>{messageOf(signal)}</strong>
       {canReply(signal)?<div className="tg-reply-options">{RESPONSE_OPTIONS.map(option=><button key={option.kind} type="button" disabled={busy} onClick={()=>void send({action:"reply",kind:option.kind,replyTo:signal.id})}>{option.symbol} {option.text}</button>)}</div>:null}
      </div>
     </article>)}
    <p className="tg-vocal-hint">🎙️ Pour un vocal, ouvre votre conversation.</p>
   </div>
  </div>
  {error?<p className="tg-floating-alert" role="alert">{error}</p>:null}
  {notice?<p className="tg-floating-alert tg-floating-success" role="status">{notice}</p>:null}
 </section>;
}
