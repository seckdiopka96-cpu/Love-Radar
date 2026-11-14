import {apiFetch} from "./api";
import {useEffect,useState} from "react";
import "./daily-moment.css";

type Reply={text:string;createdAt:number;reaction:string|null};
type History={day:string;both:boolean};
type MomentData={ok:boolean;date:string;today:string;question:string;mine:Reply|null;partnerAnswered:boolean;partner:Reply|null;revealed:boolean;history:History[];error?:string};
type Props={token:string;myName:string;partnerName:string|null;onExit:()=>void;focusDay?:string|null};
const HEARTS=["❤️","🥹","😍","😘","👏","💖"];
const utcDay=()=>new Date().toISOString().slice(0,10);
function formatDay(day:string){
 return new Date(day+"T12:00:00Z").toLocaleDateString("fr-FR",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long"});
}
export default function DailyMoment({token,myName,partnerName,onExit,focusDay}:Props){
 const [day,setDay]=useState(()=>focusDay&&/^\d{4}-\d{2}-\d{2}$/.test(focusDay)?focusDay:utcDay());
 const [today,setToday]=useState(utcDay());
 const [result,setResult]=useState<MomentData|null>(null);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [note,setNote]=useState("");
 useEffect(()=>{
  if(focusDay&&/^\d{4}-\d{2}-\d{2}$/.test(focusDay))setDay(focusDay);
 },[focusDay]);
 useEffect(()=>{
  const clock=window.setInterval(()=>{
   const next=utcDay();
   setToday(old=>{
    if(old!==next)setDay(current=>current===old?next:current);
    return next;
   });
  },20000);
  return()=>window.clearInterval(clock);
 },[]);
 useEffect(()=>{
  let active=true,fetching=false;
  setResult(null);setLoading(true);setError("");setNote("");
  async function refresh(){
   if(!active||fetching||document.visibilityState==="hidden")return;
   fetching=true;
   try{
    const response=await apiFetch("/api/moment?date="+encodeURIComponent(day),{headers:{"Authorization":"Bearer "+token},cache:"no-store"});
    const data=await response.json() as MomentData;
    if(!response.ok||!data.ok)throw Error(data.error||"Impossible de charger la question.");
    if(active){setResult(data);setToday(data.today);setError("")}
   }catch(err){if(active)setError(err instanceof Error?err.message:"Connexion impossible.")}
   finally{fetching=false;if(active)setLoading(false)}
  }
  void refresh();
  const timer=window.setInterval(()=>void refresh(),4000);
  const visible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",visible);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[token,day]);
 async function perform(action:"answer"|"react",body:object){
  if(busy)return;
  setBusy(true);setError("");setNote("");
  try{
   const response=await apiFetch("/api/moment?date="+encodeURIComponent(day),{
    method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action,...body})
   });
   const data=await response.json() as MomentData;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d'enregistrer.");
   setResult(data);
   if(action==="answer"){setDraft("");setNote(data.revealed?"Vous avez répondu tous les deux ! 💕":"Ta réponse est enregistrée. À ton amour de jouer ! 💌")}
  }catch(err){setError(err instanceof Error?err.message:"Erreur de connexion.")}
  finally{setBusy(false)}
 }
 const isToday=day===today;
 const mine=result?.mine;
 const partner=result?.partner;
 const locked=Boolean(mine&&!result?.revealed);
 const opened=Boolean(result?.revealed);
 const history=result?.history||[];
 return <section className="dm-experience" aria-label="Notre moment du jour">
  <header className="dm-top">
   <button type="button" className="dm-back" onClick={onExit} aria-label="Retour à l’accueil">‹ Accueil</button>
   <div className="dm-brand"><strong>Notre moment <span>♡</span></strong><small>LOVE RADAR · À DEUX</small></div>
   <span className="dm-top-star" aria-hidden="true">✦</span>
  </header>
  <div className="dm-main">
   <div className="dm-intro">
    <span className="dm-subtitle">UNE QUESTION · DEUX CŒURS</span>
    <h1>Un instant rien que <em>pour nous.</em></h1>
    <p>Chaque jour, une nouvelle façon de mieux se connaître et de se rapprocher.</p>
   </div>
   <div className="dm-date">
    <span>📅 {formatDay(day)}</span>
    {!isToday?<button type="button" onClick={()=>setDay(today)}>Voir aujourd’hui →</button>:<span className="dm-today">Aujourd’hui</span>}
   </div>
   <div className="dm-question-card">
    <span className="dm-question-label">💌 LA QUESTION DU JOUR</span>
    <div className="dm-question-mark" aria-hidden="true">“</div>
    <h2>{loading&&!result?"Découvrons notre question…":result?.question||"Notre question ne peut pas être affichée pour l’instant."}</h2>
    <div className="dm-question-dots" aria-hidden="true">✦ · ♥ · ✦</div>
   </div>
   <div className="dm-participants" aria-label="Participation du couple">
    <div className={"dm-participant"+(mine?" done":"")}><span className="dm-avatar">{myName.charAt(0).toUpperCase()}</span><div><strong>{myName} · Moi</strong><small>{mine?"Réponse envoyée ✓":"À ton tour"}</small></div><span className="dm-check">{mine?"✓":"♡"}</span></div>
    <div className={"dm-participant"+(result?.partnerAnswered?" done":"")}><span className="dm-avatar dm-partner-avatar">{(partnerName||"♡").charAt(0).toUpperCase()}</span><div><strong>{partnerName||"Ton amour"}</strong><small>{result?.partnerAnswered?"Réponse envoyée ✓":"En attente de sa réponse"}</small></div><span className="dm-check">{result?.partnerAnswered?"✓":"♡"}</span></div>
   </div>
   {error?<div className="dm-error" role="alert">{error}</div>:null}
   {note?<p className="dm-note" role="status">{note}</p>:null}
   {!loading&&result&&!mine&&isToday?<div className="dm-answer-composer">
    <label htmlFor="dm-answer">Ta réponse reste secrète jusqu’à ce que vous répondiez tous les deux.</label>
    <textarea id="dm-answer" placeholder="Écris ce que tu ressens… 💗" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1200} rows={4}/>
    <div className="dm-compose-bottom"><span>{draft.trim().length}/1 200</span><button type="button" disabled={busy||draft.trim().length<2} onClick={()=>void perform("answer",{answer:draft})}>{busy?"Envoi…":"Envoyer ma réponse ♥"}</button></div>
   </div>:null}
   {!loading&&result&&!mine&&!isToday?<div className="dm-locked"><span>💗</span><h3>Cette question est passée.</h3><p>Reviens à la question d’aujourd’hui pour partager votre nouveau moment.</p></div>:null}
   {locked?<div className="dm-locked"><span>💌</span><h3>Ta réponse est précieusement gardée.</h3><p>Dès que {partnerName||"ton amour"} aura répondu, vous pourrez découvrir vos deux mots ensemble.</p><div className="dm-locked-lock">🔒 Réponse de ton amour masquée</div></div>:null}
   {opened&&mine&&partner?<div className="dm-reveal" role="region" aria-label="Vos deux réponses dévoilées">
    <div className="dm-reveal-title"><span>💕</span><h3>Vos deux cœurs ont parlé !</h3><p>Voici ce que vous avez partagé.</p></div>
    <article className="dm-reply dm-reply-mine"><div className="dm-reply-label">♡ {myName}</div><p>{mine.text}</p>{partner.reaction?<span className="dm-received-emoji">{partnerName||"Ton amour"} a réagi : {partner.reaction}</span>:null}</article>
    <article className="dm-reply dm-reply-partner"><div className="dm-reply-label">♥ {partnerName||"Ton amour"}</div><p>{partner.text}</p></article>
    <div className="dm-reaction-bar"><strong>Réagis à sa réponse :</strong><div>{HEARTS.map(emoji=><button key={emoji} type="button" disabled={busy} className={mine.reaction===emoji?" active":""} onClick={()=>void perform("react",{emoji})} aria-label={"Réagir "+emoji}>{emoji}</button>)}</div></div>
   </div>:null}
   <div className="dm-archive">
    <div className="dm-archive-title"><strong>Nos moments précédents</strong><span>♡</span></div>
    {history.filter(item=>item.day!==today).length?
     <div className="dm-history">{history.filter(item=>item.day!==today).slice(0,8).map(item=><button type="button" key={item.day} className={item.day===day?" active":""} onClick={()=>setDay(item.day)}><span>{formatDay(item.day)}</span><small>{item.both?"💞 Révélé":"🔒 En attente"}</small></button>)}</div>:
     <p className="dm-empty-history">Votre histoire quotidienne commence ici. ❤️</p>}
   </div>
   <p className="dm-date-note">Une même question pour vous deux, renouvelée chaque jour à minuit UTC. Vos réponses restent privées.</p>
  </div>
 </section>;
}
