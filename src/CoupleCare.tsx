import {useCallback,useEffect,useState} from "react";
import {apiFetch} from "./api";
import "./couple-care.css";

type PrayerConfig={enabled:boolean;latitude:number;longitude:number;timezone:string;method:number};
type Notice={id:string;sender_id:string;kind:"period"|"prayer";label:string|null;created_at:number;expires_at:number;read_at:number|null};
type State={ok:boolean;error?:string;prayer?:PrayerConfig|null;partnerPrayerEnabled?:boolean;
 notices?:Notice[];ownPeriodId?:string|null;timings?:Record<string,string>};
type Props={token:string;partnerName:string|null;myName:string;onExit:()=>void;onOpenChat:()=>void};
const methods=[
 {value:3,label:"Ligue islamique mondiale"},
 {value:2,label:"Amérique du Nord (ISNA)"},
 {value:4,label:"Umm Al-Qura (La Mecque)"},
 {value:5,label:"Égypte"},
 {value:12,label:"France (UOIF)"},
 {value:21,label:"Maroc"}
];
export default function CoupleCare({token,partnerName,myName,onExit,onOpenChat}:Props){
 const [state,setState]=useState<State|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [supplies,setSupplies]=useState(false);
 const [method,setMethod]=useState(3);
 const [timings,setTimings]=useState<Record<string,string>|null>(null);
 const [position,setPosition]=useState<{latitude:number;longitude:number;timezone:string}|null>(null);
 const partner=partnerName||"ton amour";
 const reload=useCallback(async()=>{
  const res=await apiFetch("/api/care",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const data=await res.json() as State;
  if(!res.ok||!data.ok)throw Error(data.error||"Impossible de retrouver vos attentions.");
  setState(data);
  if(data.prayer?.method)setMethod(data.prayer.method);
  return data;
 },[token]);
 useEffect(()=>{
  let alive=true;
  void reload().catch(e=>{if(alive)setError(e instanceof Error?e.message:"Service indisponible.")})
   .finally(()=>{if(alive)setLoading(false)});
  const tick=()=>{
   if(document.visibilityState==="visible")void reload().catch(()=>{});
  };
  const id=window.setInterval(tick,45000);
  document.addEventListener("visibilitychange",tick);
  return()=>{alive=false;window.clearInterval(id);document.removeEventListener("visibilitychange",tick)};
 },[reload]);
 async function action(body:Record<string,unknown>,message:string){
  if(busy)return;
  setBusy(true);setError("");setSuccess("");
  try{
   const res=await apiFetch("/api/care",{method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
   const response=await res.json() as State;
   if(!res.ok||!response.ok)throw Error(response.error||"Impossible d'envoyer la notification.");
   setState(response);
   if(response.timings)setTimings(response.timings);
   setSuccess(message);
  }catch(e){setError(e instanceof Error?e.message:"Connexion indisponible.")}
  finally{setBusy(false)}
 }
 function locate(){
  setError("");setSuccess("");
  if(!navigator.geolocation){setError("La géolocalisation n'est pas disponible sur cet appareil.");return}
  setBusy(true);
  navigator.geolocation.getCurrentPosition(
   result=>{
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    if(!timezone||!timezone.includes("/")){
     setError("Le fuseau horaire de cet appareil est inconnu.");setBusy(false);return;
    }
    setPosition({
     latitude:Math.round(result.coords.latitude*10)/10,
     longitude:Math.round(result.coords.longitude*10)/10,timezone
    });
    setSuccess("Zone approximative récupérée. Tu peux maintenant activer les rappels.");
    setBusy(false);
   },
   ()=>{
    setBusy(false);
    setError("Position non autorisée. Active la localisation du navigateur pour cette fonction.");
   },{enableHighAccuracy:false,timeout:12000,maximumAge:180000}
  );
 }
 const activePeriod=state?.ownPeriodId||null;
 const notices=(state?.notices||[]).filter(n=>n.read_at===null);
 const prayerActive=Boolean(state?.prayer?.enabled);
 const selected=position||state?.prayer&&{
  latitude:state.prayer.latitude,longitude:state.prayer.longitude,timezone:state.prayer.timezone
 };
 return <section className="lr-care" aria-label="Nos petites attentions">
  <header className="lr-care-header">
   <button type="button" onClick={onExit} aria-label="Retour à Nous deux">‹</button>
   <div><small>NOTRE COMPLICITÉ</small><h1>Nos attentions <span>♥</span></h1></div>
  </header>
  <p className="lr-care-intro">Prendre soin l'un de l'autre, avec douceur et toujours avec votre accord.</p>
  <div className="lr-care-grid">
   <section className="lr-care-card lr-care-period">
    <span className="lr-care-icon" aria-hidden="true">💗</span>
    <span className="lr-care-eyebrow">UNE ATTENTION DOUCE</span>
    <h2>J'ai mes règles</h2>
    <p>Tu peux prévenir {partner} quand tu le souhaites. Aucune information n'est détectée automatiquement.</p>
    <label className="lr-care-checkbox">
     <input type="checkbox" checked={supplies} onChange={e=>setSupplies(e.target.checked)}/>
     <span>Suggérer des protections hygiéniques, sans obligation</span>
    </label>
    <button type="button" className="lr-care-primary" disabled={busy||!partnerName||Boolean(activePeriod)}
     onClick={()=>{
      if(window.confirm("Envoyer à "+partner+" une attention privée indiquant que tu as tes règles ?"))
       void action({action:"period",confirmed:true,supplies},
        "Ton message a été envoyé à "+partner+". 💗");
     }}>{activePeriod?"Attention déjà partagée":"Prévenir mon amour"}</button>
    {activePeriod?<button type="button" className="lr-care-text-btn" disabled={busy}
     onClick={()=>void action({action:"revoke-period",id:activePeriod},
      "Message retiré de votre espace. Une notification déjà affichée ne peut pas être effacée de son téléphone.")}>
     Retirer cette attention</button>:null}
    {!partnerName?<small>Invitez d'abord ton partenaire pour partager cette information.</small>:null}
    <small>Visible uniquement par ton partenaire pendant 48 h, puis supprimé. Le partage est facultatif.</small>
   </section>
   <section className="lr-care-card lr-care-prayer">
    <span className="lr-care-icon" aria-hidden="true">🕌</span>
    <span className="lr-care-eyebrow">SE RAPPELER L'ESSENTIEL</span>
    <h2>Heures de prière</h2>
    <p>Si tu le souhaites, {partner} recevra un doux rappel à tes heures de Fajr, Dhuhr, Asr, Maghrib et Isha.</p>
    <label className="lr-care-field">Méthode de calcul
     <select value={method} onChange={e=>setMethod(Number(e.target.value))}
      disabled={busy} aria-label="Méthode de calcul des horaires de prière">
      {methods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
     </select>
    </label>
    <div className="lr-care-status">
     {prayerActive?<span className="lr-care-enabled">● Horaires de prière enregistrés</span>:
      <span>○ Rappels désactivés</span>}
     {state?.partnerPrayerEnabled?<small>Ton partenaire partage aussi ses horaires.</small>:null}
    </div>
    <button type="button" className="lr-care-secondary" disabled={busy}
     onClick={locate}>{position?"✓ Zone récupérée":"Utiliser ma position approximative"}</button>
    <small>Position arrondie à environ 10 km pour préserver ta vie privée. La zone est envoyée à AlAdhan pour calculer les heures de prière quotidiennes. Ton partenaire ne voit pas ta position.</small>
    <button type="button" className="lr-care-primary" disabled={busy||!partnerName||!selected}
     onClick={()=>{
      if(!selected)return;
      if(window.confirm("Autoriser Love-Radar à envoyer à "+partner+" des rappels aux horaires de tes cinq prières ?"))
       void action({action:"enable-prayer",confirmed:true,...selected,method},
        "Horaires de prière enregistrés. Les rappels automatiques nécessitent le service Cloudflare.");
     }}>{prayerActive?"Mettre à jour mes rappels":"Activer les rappels de prière"}</button>
    {prayerActive?<button type="button" className="lr-care-text-btn" disabled={busy}
     onClick={()=>void action({action:"disable-prayer"},"Rappels de prière désactivés.")}>
     Désactiver les rappels</button>:null}
    {timings?<div className="lr-care-times">
     <strong>Horaires estimés aujourd'hui</strong>
     {Object.entries(timings).map(([name,time])=><span key={name}>{name}<b>{time}</b></span>)}
    </div>:null}
    <small>Les horaires sont indicatifs : vérifie la méthode utilisée par ta mosquée. Pour recevoir les alertes quand l'app est fermée, les notifications et le service de rappel Cloudflare doivent être activés.</small>
   </section>
  </div>
  <section className="lr-care-inbox" aria-label="Vos attentions reçues">
   <div className="lr-care-inbox-title"><h2>Les attentions reçues</h2><small>{notices.length} nouvelle{notices.length>1?"s":""}</small></div>
   {loading?<p>Chargement…</p>:notices.length===0?<p>Les petits rappels de ton amour apparaîtront ici. 💕</p>:
    notices.map(n=><article key={n.id} className="lr-care-notice">
     <span className="lr-care-notice-icon">{n.kind==="period"?"💗":"🕌"}</span>
     <div><strong>{n.kind==="period"?"Un petit soutien pour "+partner:"C'est l'heure de "+(n.label||"la prière")}</strong>
      <p>{n.kind==="period"?
       n.label==="supplies"?"Ton amour a ses règles. Si tu peux et si tu veux, pense à envoyer des protections hygiéniques. Aucune obligation. 💗":
        "Ton amour a ses règles et apprécierait une petite attention. Un mot gentil suffit. 💗":
       "Une petite pensée pour encourager "+partner+" à prier."}</p>
      <small>{new Date(n.created_at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div>
     <button type="button" aria-label="Marquer l'attention comme vue" disabled={busy}
      onClick={()=>void action({action:"dismiss",id:n.id},"Attention marquée comme vue.")}>✓</button>
    </article>)}
  </section>
  <button type="button" className="lr-care-chat" onClick={onOpenChat}>Écrire à mon amour →</button>
  {error?<p className="lr-care-error" role="alert">{error}</p>:null}
  {success?<p className="lr-care-success" role="status">{success}</p>:null}
 </section>;
}
