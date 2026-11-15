import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiFetch} from "./api";
import {parseTelepartyInvite,NETFLIX_TELEPARTY_URL,NETFLIX_TELEPARTY_IOS,NETFLIX_TELEPARTY_ANDROID} from "./netflix-party-utils";
import "./netflix-party.css";

type SharedParty={inviteUrl:string;version:number;updatedAt:number;updatedBy:string|null};
type ApiResult={ok:boolean;error?:string;party?:SharedParty};
type Props={token:string;partnerName:string|null;onExit:()=>void;onOpenYouTube:()=>void;onOpenChat:()=>void};

export default function NetflixParty({token,partnerName,onExit,onOpenYouTube,onOpenChat}:Props){
 const [party,setParty]=useState<SharedParty|null>(null);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const mounted=useRef(true);
 const requestRef=useRef(false);
 const accept=useCallback((data:ApiResult)=>{
  if(!mounted.current)return;
  if(data.party)setParty(previous=>!previous||data.party!.version>=previous.version?data.party!:previous);
  setLoading(false);
 },[]);
 const refresh=useCallback(async()=>{
  if(document.visibilityState!=="visible")return;
  try{
   const res=await apiFetch("/api/netflix-party",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as ApiResult;
   if(!res.ok||!data.ok)throw Error(data.error||"Impossible de récupérer la séance.");
   accept(data);
   setError("");
  }catch(e){if(mounted.current){setLoading(false);setError(e instanceof Error?e.message:"Connexion indisponible.");}}
 },[token,accept]);
 useEffect(()=>{
  mounted.current=true;
  void refresh();
  const id=window.setInterval(()=>{if(!requestRef.current)void refresh()},2400);
  const visible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",visible);
  return ()=>{mounted.current=false;window.clearInterval(id);document.removeEventListener("visibilitychange",visible)};
 },[refresh]);
 async function update(action:"share"|"clear",url=""){
  if(!party||busy)return;
  const invite=action==="share"?parseTelepartyInvite(url):"";
  if(invite===null){setError("Colle le lien d'invitation créé par Teleparty, et non l'adresse d'un film Netflix.");return}
  requestRef.current=true;setBusy(true);setError("");setNotice("");
  try{
   const response=await apiFetch("/api/netflix-party",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action,version:party.version,inviteUrl:invite})
   });
   const data=await response.json() as ApiResult;
   if(!response.ok||!data.ok)throw Error(data.error||"Partage impossible.");
   accept(data);
   setDraft("");
   setNotice(action==="clear"?"La séance partagée a été retirée.":"Invitation envoyée dans votre espace privé ❤️");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de partager l'invitation.");void refresh()}
  finally{requestRef.current=false;setBusy(false)}
 }
 function submit(event:FormEvent){event.preventDefault();void update("share",draft)}
 async function copy(){
  if(!party?.inviteUrl)return;
  try{await navigator.clipboard.writeText(party.inviteUrl);setNotice("Lien Teleparty copié.")}
  catch{setNotice("Tu peux maintenir le lien affiché pour le copier.")}
 }
 const readyLink=party?.inviteUrl||"";
 return <section className="np-page" aria-label="Regarder Netflix ensemble par Teleparty">
  <header className="np-top">
   <button type="button" className="np-back" onClick={onExit}>‹ Regarder ensemble</button>
   <div className="np-brand"><strong>Notre cinéma <span>♥</span></strong><small>NETFLIX À DEUX</small></div>
   <div className="np-head-actions">
    <div id="lr-voice-button-slot" aria-label="Appel vocal"/>
    <button type="button" onClick={onOpenChat} aria-label="Ouvrir les messages">✉</button>
   </div>
  </header>
  <div className="np-tabs" role="group" aria-label="Choisir la plateforme">
   <button type="button" onClick={onOpenYouTube}>▶ YouTube</button>
   <button type="button" className="active" aria-current="page">🎬 Netflix</button>
  </div>
  <div className="np-scroll">
   <div className="np-hero">
    <span className="np-logo" aria-hidden="true">N</span>
    <h1>Un film, deux écrans, <em>le même moment.</em></h1>
    <p>Vous regardez le même film Netflix à distance, avec lecture et pause synchronisées <strong>par Teleparty</strong>.</p>
    <small>Netflix s'ouvre dans Teleparty, pas directement dans Love Radar.</small>
   </div>
   <div className="np-steps">
    <div className="np-step">
     <span>1</span>
     <div><strong>Installez Teleparty sur vos deux téléphones</strong><p>Connectez-vous à Netflix dans Teleparty. Chacun doit disposer d'un accès Netflix autorisé.</p>
      <div className="np-install">
       <a href={NETFLIX_TELEPARTY_IOS} target="_blank" rel="noopener noreferrer">iPhone · App Store ↗</a>
       <a href={NETFLIX_TELEPARTY_ANDROID} target="_blank" rel="noopener noreferrer">Android · Play Store ↗</a>
       <a href={NETFLIX_TELEPARTY_URL} target="_blank" rel="noopener noreferrer">Ordinateur ↗</a>
      </div>
     </div>
    </div>
    <div className="np-step">
     <span>2</span>
     <div><strong>Crée une séance Netflix dans Teleparty</strong>
      <p>Choisis ton film, ouvre l'onglet « Party », puis copie son lien d'invitation. Ne colle pas simplement le lien du film.</p>
     </div>
    </div>
    <div className="np-step">
     <span>3</span>
     <div><strong>Partagez la même séance ❤️</strong>
      <p>Colle l'invitation ici. {partnerName||"Ton partenaire"} retrouvera automatiquement le bouton pour rejoindre cette séance depuis Love Radar.</p>
     </div>
    </div>
   </div>
   <div className="np-session">
    <div className="np-section-head"><strong>🍿 Votre séance Netflix</strong>
     <span>{loading?"Chargement…":readyLink?"Lien partagé":"Aucune séance"}</span>
    </div>
    {readyLink?<div className="np-active-session">
     <strong>❤️ Votre invitation est prête</strong>
     <p>{party?.updatedBy?"Partagée par "+party.updatedBy:"Partagée dans votre espace privé"}.</p>
     <a href={readyLink} target="_blank" rel="noopener noreferrer" className="np-join">
      ▶ Ouvrir la séance synchronisée
     </a>
     <div className="np-link-preview" title={readyLink}>{readyLink}</div>
     <div className="np-link-actions">
      <button type="button" onClick={()=>void copy()}>Copier le lien</button>
      <button type="button" onClick={()=>void update("clear")} disabled={busy}>Retirer la séance</button>
     </div>
     <small>Le lien ouvre Teleparty. C'est cette application qui synchronise les films Netflix.</small>
    </div>:<div className="np-empty"><span>🎞️</span><p>Créez une séance Teleparty puis partagez son invitation ici.</p></div>}
    <form onSubmit={submit} className="np-share-form">
     <label htmlFor="np-party-link">{readyLink?"Changer de séance":"Coller votre invitation Teleparty"}</label>
     <div><input id="np-party-link" type="url" inputMode="url" value={draft} onChange={e=>setDraft(e.target.value)}
      placeholder="https://…teleparty.com/…" autoComplete="off" maxLength={1400}/>
      <button type="submit" disabled={!party||busy||!draft.trim()}>{busy?"Envoi…":"Partager"}</button>
     </div>
    </form>
   </div>
   <p className="np-disclaimer">La disponibilité des films dépend de Netflix et du pays de chacun. Teleparty est un service tiers indépendant de Netflix et Love Radar ; ses fonctionnalités mobiles et abonnements peuvent varier.</p>
  </div>
  {error?<div className="np-alert" role="alert">{error}<button type="button" aria-label="Fermer" onClick={()=>setError("")}>✕</button></div>:null}
  {notice?<div className="np-notice" role="status">{notice}<button type="button" aria-label="Fermer" onClick={()=>setNotice("")}>✕</button></div>:null}
 </section>;
}
