import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiFetch} from "./api";
import {MAX_RECONCILIATION_TEXT,hasReconciliationMessage} from "./reconcile-rules";
import "./reconcile.css";

type Feelings={pain:string;needs:string;message:string};
type Session={
 id:string;status:"writing"|"revealed";createdAt:number;initiatedByMe:boolean;
 mySubmitted:boolean;partnerSubmitted:boolean;myDraft:Feelings;
 partnerText:Feelings|null;partnerName:string|null;bothReady:boolean
};
type Reply={ok:boolean;error?:string;session?:Session|null};
type Props={token:string;myName:string;partnerName:string|null;onExit:()=>void;onOpenChat:()=>void};
const EMPTY:Feelings={pain:"",needs:"",message:""};
const LIMIT=MAX_RECONCILIATION_TEXT;
const same=(a:Feelings,b:Feelings)=>a.pain===b.pain&&a.needs===b.needs&&a.message===b.message;
export default function Reconcile({token,myName,partnerName,onExit,onOpenChat}:Props){
 const [session,setSession]=useState<Session|null>(null);
 const [draft,setDraft]=useState<Feelings>(EMPTY);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [saveStatus,setSaveStatus]=useState<"saved"|"unsaved"|"saving"|"error">("saved");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [showTips,setShowTips]=useState(false);
 const [confirmClose,setConfirmClose]=useState(false);
 const live=useRef(true);
 const busyRef=useRef(false);
 const sessionRef=useRef<Session|null>(null);
 const draftRef=useRef<Feelings>(EMPTY);
 const savedRef=useRef<Feelings>(EMPTY);
 const saveInFlight=useRef<Promise<boolean>|null>(null);
 const refreshInFlight=useRef(false);
 const reinitialize=useRef(false);
 const partner=partnerName||session?.partnerName||"Ton amour";
 const canWrite=Boolean(session&&session.status==="writing"&&!session.mySubmitted);
 const canSubmit=canWrite&&hasReconciliationMessage(draft);

 const adopt=useCallback((result:Reply)=>{
  if(!live.current||result.session===undefined)return;
  const next=result.session;
  const previous=sessionRef.current;
  if(!next){
   sessionRef.current=null;setSession(null);
   if(previous){draftRef.current=EMPTY;savedRef.current=EMPTY;setDraft(EMPTY);}
   return;
  }
  if(!previous||previous.id!==next.id){
   const text=next.myDraft||EMPTY;
   draftRef.current=text;savedRef.current=text;setDraft(text);
   setSaveStatus("saved");setConfirmClose(false);
  }else if(next.mySubmitted&&!previous.mySubmitted){
   draftRef.current=next.myDraft;savedRef.current=next.myDraft;setDraft(next.myDraft);
   setSaveStatus("saved");
  }
  sessionRef.current=next;setSession(next);
 },[]);
 const refresh=useCallback(async(silent=false)=>{
  if(document.visibilityState==="hidden"||refreshInFlight.current)return;
  refreshInFlight.current=true;
  try{
   const response=await apiFetch("/api/reconcile",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const result=await response.json() as Reply;
   if(!response.ok||!result.ok)throw Error(result.error||"Impossible de charger votre espace.");
   adopt(result);
   if(live.current&&!silent)setError("");
  }catch(e){
   if(live.current&&!silent)setError(e instanceof Error?e.message:"Impossible de récupérer la démarche.");
  }finally{
   refreshInFlight.current=false;
   if(live.current)setLoading(false);
  }
 },[token,adopt]);
 const submitAction=useCallback(async(body:Record<string,unknown>):Promise<Reply>=>{
  const response=await apiFetch("/api/reconcile",{method:"POST",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
   body:JSON.stringify(body)
  });
  const result=await response.json() as Reply;
  if(!response.ok||!result.ok)throw Error(result.error||"Impossible d'enregistrer.");
  return result;
 },[token]);
 useEffect(()=>{
  live.current=true;void refresh();
  const id=window.setInterval(()=>{if(!busyRef.current)void refresh(true)},2600);
  const visible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",visible);
  return()=>{live.current=false;window.clearInterval(id);document.removeEventListener("visibilitychange",visible)};
 },[refresh]);

 const saveDraft=useCallback(async():Promise<boolean>=>{
  const s=sessionRef.current;
  if(!s||s.status!=="writing"||s.mySubmitted||busyRef.current)return false;
  if(same(draftRef.current,savedRef.current))return true;
  if(saveInFlight.current){
   await saveInFlight.current;
   if(same(draftRef.current,savedRef.current))return true;
  }
  const text={...draftRef.current},sessionId=s.id;
  const task=(async()=>{
   if(live.current){setSaving(true);setSaveStatus("saving")}
   try{
    const res=await submitAction({action:"save",sessionId,...text});
    if(live.current){
     adopt(res);savedRef.current=text;
     setSaveStatus(same(draftRef.current,text)?"saved":"unsaved");
    }
    return true;
   }catch(e){
    if(live.current){setSaveStatus("error");setError(e instanceof Error?e.message:"Brouillon non enregistré.")}
    return false;
   }finally{if(live.current)setSaving(false)}
  })();
  saveInFlight.current=task;
  try{return await task}finally{if(saveInFlight.current===task)saveInFlight.current=null}
 },[submitAction,adopt]);
 useEffect(()=>{
  if(!canWrite||same(draft,savedRef.current)||busyRef.current)return;
  const handle=window.setTimeout(()=>{void saveDraft()},1500);
  return()=>window.clearTimeout(handle);
 },[draft,canWrite,saveDraft]);
 function change(key:keyof Feelings,value:string){
  const next={...draftRef.current,[key]:value};
  draftRef.current=next;setDraft(next);setSaveStatus("unsaved");setError("");
 }
 async function start(){
  if(busyRef.current||reinitialize.current)return;
  busyRef.current=true;reinitialize.current=true;setBusy(true);setError("");setNotice("");
  try{
   const result=await submitAction({action:"start"});
   adopt(result);
   if(live.current)setNotice("Invitation envoyée. Chacun pourra écrire à son rythme.");
  }catch(e){if(live.current)setError(e instanceof Error?e.message:"Impossible d'ouvrir la démarche.")}
  finally{busyRef.current=false;reinitialize.current=false;if(live.current)setBusy(false)}
 }
 async function submit(e:FormEvent){
  e.preventDefault();
  const s=sessionRef.current;
  if(!s||s.mySubmitted||s.status!=="writing"||busyRef.current)return;
  if(!hasReconciliationMessage(draftRef.current)){
   setError("Écris d’abord quelques mots sur ce que tu ressens.");return;
  }
  busyRef.current=true;setBusy(true);setError("");setNotice("");
  // Capture the complete current text; no auto-saved draft can overwrite a
  // submitted statement because server-side submitted texts are immutable.
  try{
   if(saveInFlight.current)await saveInFlight.current;
   const result=await submitAction({action:"submit",sessionId:s.id,...draftRef.current});
   adopt(result);
   if(live.current)setNotice(result.session?.bothReady?
    "💗 Vos deux textes sont maintenant visibles. Prenez le temps de vous lire.":
    "💌 Tes mots sont déposés. Ils restent cachés jusqu’à ce que vous ayez tous les deux choisi de les partager.");
  }catch(e){if(live.current)setError(e instanceof Error?e.message:"Envoi impossible. Ton texte reste affiché.")}
  finally{busyRef.current=false;if(live.current)setBusy(false)}
 }
 async function close(){
  const s=sessionRef.current;
  if(!s||busyRef.current)return;
  busyRef.current=true;setBusy(true);setError("");
  try{
   const result=await submitAction({action:"close",sessionId:s.id});
   adopt(result);setConfirmClose(false);
   if(live.current)setNotice("Cette démarche est terminée et ses textes ont été effacés.");
  }catch(e){if(live.current)setError(e instanceof Error?e.message:"Impossible de fermer cette démarche.")}
  finally{busyRef.current=false;if(live.current)setBusy(false)}
 }
 function section(label:string,value:string){
  if(!value.trim())return null;
  return <section className="rc-answer-part"><h3>{label}</h3><p>{value}</p></section>;
 }
 return <section className="rc-page" aria-label="Mode Réconciliation">
  <header className="rc-header">
   <button type="button" onClick={onExit} className="rc-back">‹ Nous deux</button>
   <div className="rc-brand"><strong>On se comprend <span>♡</span></strong><small>RÉCONCILIATION</small></div>
   <div id="lr-voice-button-slot" className="rc-call-slot" aria-label="Appel vocal"/>
  </header>
  <div className="rc-body">
   <div className="rc-intro">
    <div className="rc-dove" aria-hidden="true">🕊️</div>
    <span className="rc-eyebrow">UN ESPACE POUR SE DIRE LES CHOSES</span>
    <h1>Dis-moi ce qui <em>te fait mal.</em></h1>
    <p>Ici, tu peux dire ce que tu gardes sur le cœur, sans avoir à tout résumer. Chaque sentiment mérite d’être entendu.</p>
    <div className="rc-safety"><span aria-hidden="true">🔒</span><span>Ton brouillon n’est visible que par toi. Il ne sera partagé avec {partner} que lorsque <strong>vous aurez tous les deux validé vos textes</strong>. Rien ne t'oblige à participer.</span></div>
   </div>
   {loading?<div className="rc-wait" role="status">Ouverture de votre espace…</div>:
    !session?<div className="rc-begin">
     <div className="rc-begin-icon" aria-hidden="true">💌</div>
     <h2>Une conversation qui compte</h2>
     <p>Vous écrirez chacun séparément, à votre rythme. Personne n’a accès au texte de l’autre avant l’accord des deux.</p>
     <button type="button" onClick={()=>void start()} disabled={busy||!partnerName} className="rc-main-action">
      🕊️ Inviter {partnerName||"mon amour"} à se comprendre
     </button>
     {!partnerName?<small>Ton partenaire doit d'abord rejoindre votre espace privé.</small>:<small>Une notification discrète sera envoyée si ses alertes sont activées.</small>}
    </div>:
    <div className="rc-session">
     <div className="rc-session-status" role="status">
      <div className="rc-status-avatar">❤️</div>
      <div><strong>{session.bothReady?"Vous vous êtes exprimés tous les deux":session.mySubmitted?"Tes mots sont déposés":"Écrivez à votre rythme"}</strong>
      <small>{session.bothReady?"Il est temps de vous lire calmement.":session.partnerSubmitted?"Ton partenaire a terminé son texte.": "Ton partenaire peut écrire sans pression."}</small></div>
      <span className="rc-status-tag">{session.bothReady?"À LIRE":session.mySubmitted?"EN ATTENTE":"PRIVÉ"}</span>
     </div>
     {!session.mySubmitted&&session.status==="writing"?<form className="rc-writing" onSubmit={e=>void submit(e)}>
      <div className="rc-field">
       <label htmlFor="rc-pain"><span>01</span> Tout ce qui me fait mal</label>
       <p>Raconte ce que tu as vécu, ce qui t’a blessé, ce que tu n’as jamais réussi à dire. Tu peux écrire aussi longtemps que tu en as besoin.</p>
       <textarea id="rc-pain" value={draft.pain} onChange={e=>change("pain",e.target.value)} onBlur={()=>void saveDraft()}
        placeholder="Ce qui m’a profondément blessé, c’est…&#10;&#10;Depuis quelque temps, je ressens…" maxLength={LIMIT.pain} rows={9} autoComplete="off" spellCheck/>
       <div className="rc-count">{draft.pain.length.toLocaleString("fr-FR")} / {LIMIT.pain.toLocaleString("fr-FR")} caractères</div>
      </div>
      <div className="rc-field">
       <label htmlFor="rc-needs"><span>02</span> Ce dont j’ai besoin</label>
       <p>Qu'est-ce qui pourrait te rassurer, te faire sentir respecté ou te permettre d’avancer ?</p>
       <textarea id="rc-needs" value={draft.needs} onChange={e=>change("needs",e.target.value)} onBlur={()=>void saveDraft()}
        placeholder="J’ai besoin que tu comprennes…&#10;Ce que j'aimerais voir changer…" maxLength={LIMIT.needs} rows={4}/>
       <div className="rc-count">{draft.needs.length.toLocaleString("fr-FR")} / {LIMIT.needs.toLocaleString("fr-FR")}</div>
      </div>
      <div className="rc-field">
       <label htmlFor="rc-message"><span>03</span> Ce que j’aimerais te dire</label>
       <p>Un mot pour terminer, une vérité importante, ou un souhait pour votre avenir.</p>
       <textarea id="rc-message" value={draft.message} onChange={e=>change("message",e.target.value)} onBlur={()=>void saveDraft()}
        placeholder="J’aimerais que tu saches que…" maxLength={LIMIT.message} rows={4}/>
       <div className="rc-count">{draft.message.length.toLocaleString("fr-FR")} / {LIMIT.message.toLocaleString("fr-FR")}</div>
      </div>
      <div className="rc-editor-actions">
       <div className={"rc-save-status "+saveStatus} role="status">
        {saveStatus==="saving"?"⏳ Enregistrement…":saveStatus==="saved"?"✓ Brouillon privé enregistré":
         saveStatus==="error"?"⚠️ Brouillon non enregistré":"✎ Modifications non enregistrées"}
       </div>
       <button type="button" className="rc-save" onClick={()=>void saveDraft()} disabled={busy||saving||saveStatus==="saved"}>Sauvegarder mon brouillon</button>
       <button type="submit" className="rc-main-action" disabled={!canSubmit||busy||saving}>
        💌 J’ai tout dit · Partager quand nous serons prêts
       </button>
       <small>Après validation, tu ne pourras plus modifier tes mots dans cette démarche. Ils ne seront révélés qu’une fois les deux textes validés.</small>
      </div>
     </form>:
     <div className="rc-read">
      {!session.bothReady?<div className="rc-pending">
       <div aria-hidden="true">🕯️</div>
       <h2>Merci d’avoir posé tes mots.</h2>
       <p>Ton texte est enregistré. Il reste caché pour {partner} jusqu’à ce que vous ayez tous les deux validé votre participation.</p>
       <span>{session.partnerSubmitted?"Les deux réponses se préparent…":"En attente de l'autre réponse, sans délai imposé."}</span>
      </div>:<div className="rc-reveal-head">
       <span aria-hidden="true">💞</span><h2>Vos deux vérités, côte à côte.</h2>
       <p>Lisez d’abord pour comprendre, pas pour répondre immédiatement. Vous n’avez pas besoin de tout résoudre aujourd’hui.</p>
      </div>}
      <div className="rc-answer-card mine">
       <h2>💗 Tes mots, {myName}</h2>
       {section("Ce qui me fait mal",session.myDraft.pain)}
       {section("Ce dont j’ai besoin",session.myDraft.needs)}
       {section("Ce que je voulais te dire",session.myDraft.message)}
      </div>
      {session.bothReady&&session.partnerText?<div className="rc-answer-card theirs">
       <h2>💌 Les mots de {partner}</h2>
       {section("Ce qui lui fait mal",session.partnerText.pain)}
       {section("Ce dont il ou elle a besoin",session.partnerText.needs)}
       {section("Ce qu'il ou elle voulait te dire",session.partnerText.message)}
      </div>:null}
      {session.bothReady?<div className="rc-conversation">
       <h2>🤝 On en parle, si vous le souhaitez ?</h2>
       <p>Écoutez-vous chacun votre tour. Reformulez ce que vous avez compris et demandez ce dont l'autre a besoin. Vous pouvez aussi choisir de faire une pause.</p>
       <button type="button" className="rc-main-action" onClick={onOpenChat}>💬 Ouvrir la conversation et l’appel</button>
       <small>Le bouton téléphone en haut permet aussi de lancer un appel vocal.</small>
       <button type="button" className="rc-tips-toggle" onClick={()=>setShowTips(v=>!v)} aria-expanded={showTips}>
        {showTips?"Masquer":"Voir"} trois phrases pour commencer
       </button>
       {showTips?<ul className="rc-tips"><li>« J’ai lu ce que tu as ressenti. Est-ce que j’ai bien compris ? »</li>
        <li>« Je veux t’écouter sans te couper. »</li>
        <li>« De quoi aurais-tu besoin pour te sentir respecté(e) ? »</li></ul>:null}
      </div>:null}
     </div>}
     <div className="rc-exit-area">
      {!confirmClose?<button type="button" className="rc-close-link" onClick={()=>setConfirmClose(true)} disabled={busy}>Fermer cette démarche et effacer les textes</button>:
       <div className="rc-confirm"><strong>Effacer cette démarche pour vous deux ?</strong>
        <p>Les deux textes et brouillons seront supprimés de cet espace. Cette action est définitive.</p>
        <div><button type="button" onClick={()=>setConfirmClose(false)}>Annuler</button>
         <button type="button" onClick={()=>void close()} disabled={busy}>Oui, effacer</button></div>
       </div>}
     </div>
    </div>}
   {error?<div className="rc-alert" role="alert">{error}<button type="button" onClick={()=>{setError("");void refresh()}}>Réessayer</button></div>:null}
   {notice?<div className="rc-notice" role="status">{notice}<button type="button" onClick={()=>setNotice("")}>×</button></div>:null}
  </div>
 </section>;
}
