import {useEffect,useRef,useState,type ChangeEvent} from "react";
import {apiFetch} from "./api";
import "./love-radar-plus.css";

export type PlusTheme="classic"|"starlight"|"rose";
export type PlusStatus={active:boolean;available:boolean;status:string;periodEnd:number;
 cancelAtPeriodEnd:boolean;monthlyCents:number;currency:string};
type Props={
 token:string;roomId:string;partnerName:string|null;nativeApp:boolean;
 theme:PlusTheme;onThemeChange:(theme:PlusTheme)=>void;
 onEntitlementChange:(active:boolean)=>void;onBack:()=>void;
};
const CHALLENGES=[
 "Raconte un souvenir de nous que tu n'oublieras jamais.",
 "Offre à ton amour trois compliments différents.",
 "Décris notre rendez-vous idéal en seulement cinq mots.",
 "Choisis une chanson qui raconte notre histoire et explique pourquoi.",
 "Fais deviner un souvenir commun sans dire où il s'est passé.",
 "Imite ta réaction lors de notre première rencontre.",
 "Imagine une surprise à organiser ensemble le mois prochain.",
 "Raconte une chose que tu as apprise grâce à notre relation.",
 "Fais sourire ton partenaire en trente secondes.",
 "Compose un message tendre sans utiliser le mot « amour »."
];
const DEFAULT_STATUS:PlusStatus={active:false,available:false,status:"free",periodEnd:0,
 cancelAtPeriodEnd:false,monthlyCents:399,currency:"usd"};
const EMPTY_IMAGES:{url:string;name:string}[]=[];
function stripeDestination(url:unknown){
 if(typeof url!=="string")return false;
 try{const parsed=new URL(url);return parsed.protocol==="https:"&&
  (parsed.hostname==="checkout.stripe.com"||parsed.hostname.endsWith(".checkout.stripe.com")||
   parsed.hostname==="billing.stripe.com")}catch{return false}
}
export default function LoveRadarPlus({token,roomId,partnerName,nativeApp,theme,onThemeChange,onEntitlementChange,onBack}:Props){
 const [status,setStatus]=useState<PlusStatus>(DEFAULT_STATUS);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [challenge,setChallenge]=useState(0);
 const [bookTitle,setBookTitle]=useState("Notre belle histoire");
 const [bookStory,setBookStory]=useState("");
 const [bookPhotos,setBookPhotos]=useState<{url:string;name:string}[]>(EMPTY_IMAGES);
 const ownedUrls=useRef<string[]>([]);
 useEffect(()=>()=>{for(const url of ownedUrls.current)URL.revokeObjectURL(url)},[]);
 async function refresh(){
  setLoading(true);setError("");
  try{
   const response=await apiFetch("/api/plus",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const body=await response.json() as PlusStatus&{ok?:boolean;error?:string};
   if(!response.ok||!body.ok)throw Error(body.error||"Abonnement indisponible.");
   setStatus(body);onEntitlementChange(body.active===true);
  }catch(e){setError(e instanceof Error?e.message:"Vérification indisponible.");onEntitlementChange(false)}
  finally{setLoading(false)}
 }
 useEffect(()=>{
  let live=true;
  void (async()=>{
   try{
    const response=await apiFetch("/api/plus",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const body=await response.json() as PlusStatus&{ok?:boolean;error?:string};
    if(!response.ok||!body.ok)throw Error(body.error||"Abonnement indisponible.");
    if(live){setStatus(body);onEntitlementChange(body.active===true)}
   }catch(e){if(live){setError(e instanceof Error?e.message:"Vérification indisponible.");onEntitlementChange(false)}}
   finally{if(live)setLoading(false)}
  })();
  return()=>{live=false};
 },[token,roomId]);
 async function billing(action:"checkout"|"portal"){
  if(busy||loading)return;
  setBusy(true);setError("");
  try{
   const response=await apiFetch("/api/plus",{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action})});
   const body=await response.json() as {ok?:boolean;url?:string;error?:string};
   if(!response.ok||!body.ok||!stripeDestination(body.url))
    throw Error(body.error||"Paiement indisponible.");
   window.location.assign(body.url!);
  }catch(e){setError(e instanceof Error?e.message:"Paiement indisponible.");setBusy(false)}
 }
 function addPhotos(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files||[]);
  const remaining=Math.max(0,6-bookPhotos.length);
  const accepted=files.filter(file=>file.type.startsWith("image/")&&file.size<=4*1024*1024).slice(0,remaining);
  if(files.length!==accepted.length)setInfo("6 photos maximum, 4 Mo par photo.");
  const next=accepted.map(file=>({url:URL.createObjectURL(file),name:file.name}));
  ownedUrls.current.push(...next.map(item=>item.url));
  setBookPhotos(previous=>[...previous,...next]);
  event.target.value="";
 }
 function removePhoto(url:string){
  setBookPhotos(previous=>previous.filter(item=>item.url!==url));
  URL.revokeObjectURL(url);
  ownedUrls.current=ownedUrls.current.filter(item=>item!==url);
 }
 const isActive=status.active===true;
 const returnStatus=new URLSearchParams(window.location.search).get("plus");
 return <section className="lr-plus" aria-label="Love Radar Plus">
  <header className="lr-plus-heading">
   <button className="lr-plus-back" type="button" onClick={onBack} aria-label="Retour">‹</button>
   <div><small>UNE ÉDITION POUR VOTRE COUPLE</small><h1>Love Radar <em>Plus ✦</em></h1>
    <p>Un peu plus de magie, à deux.</p></div>
  </header>
  {returnStatus==="success"?<p className="lr-plus-info" role="status">
   Paiement terminé ? Le statut se met à jour après confirmation de Stripe. Vérifie ton accès ci-dessous.</p>:null}
  {returnStatus==="cancel"?<p className="lr-plus-info">Achat abandonné. Aucun accès premium n'a été activé.</p>:null}
  <div className="lr-plus-hero">
   <span>{isActive?"✦ VOTRE COUPLE EST PLUS":"✦ UN ABONNEMENT POUR DEUX"}</span>
   <div className="lr-plus-pricing"><strong>3,99 $</strong><small>/ mois / couple</small></div>
   <p>Les deux partenaires profitent du même abonnement. La messagerie, les appels et vos jeux actuels restent gratuits.</p>
   <div className="lr-plus-status">{loading?"Vérification de l'abonnement…":isActive?"✓ Plus actif pour votre couple":
    status.available?"Plus est disponible":"Abonnement en préparation"}</div>
   {isActive&&status.periodEnd>0?<small>{status.cancelAtPeriodEnd?"Accès jusqu'au":"Période actuelle jusqu'au"} {new Date(status.periodEnd*1000).toLocaleDateString("fr-FR")}</small>:null}
   {!isActive&&status.available&&!nativeApp?<button className="lr-plus-primary" type="button" disabled={busy||loading}
    onClick={()=>void billing("checkout")}>{busy?"Ouverture du paiement…":"Activer Plus pour 3,99 $ / mois"}</button>:null}
   {nativeApp&&!isActive?<p className="lr-plus-help">L'achat dans l'application native nécessite une configuration Apple/Google. Aucun paiement n'est lancé ici.</p>:null}
   {!status.available&&!loading?<p className="lr-plus-help">Le paiement sera proposé dès la configuration de Stripe. Aucun débit n'est possible actuellement.</p>:null}
   {status.status!=="free"&&status.status!=="canceled"&&status.status!=="incomplete_expired"&&status.available&&!nativeApp?
    <button className="lr-plus-manage" type="button" disabled={busy} onClick={()=>void billing("portal")}>Gérer ou résilier l’abonnement</button>:null}
   <button className="lr-plus-refresh" type="button" disabled={loading||busy} onClick={()=>void refresh()}>
    {loading?"Vérification…":"Actualiser mon abonnement"}</button>
   {error?<p className="lr-plus-error" role="alert">{error}</p>:null}
  </div>
  <div className="lr-plus-features">
   <article className="lr-plus-feature">
    <span className="lr-plus-icon">🌙</span><div><h2>Thèmes exclusifs</h2>
     <p>Habillez votre espace d'une ambiance Nuit étoilée ou Rose luxe.</p></div>
    {isActive?<div className="lr-plus-theme-options">
     {([{id:"classic",label:"Classique"},{id:"starlight",label:"Nuit étoilée"},{id:"rose",label:"Rose luxe"}] as const).map(choice=>
      <button type="button" className={theme===choice.id?"selected":""} key={choice.id}
       aria-pressed={theme===choice.id} onClick={()=>onThemeChange(choice.id)}>{choice.label}</button>)}
    </div>:<span className="lr-plus-locked">🔒 Réservé à Plus</span>}
   </article>
   <article className="lr-plus-feature">
    <span className="lr-plus-icon">🎯</span><div><h2>Défis bonus à deux</h2>
     <p>10 défis originaux à découvrir avec {partnerName||"ton partenaire"}.</p></div>
    {isActive?<div className="lr-plus-challenge">
     <p>{CHALLENGES[challenge]}</p>
     <button type="button" onClick={()=>setChallenge(index=>(index+1)%CHALLENGES.length)}>Autre défi →</button>
    </div>:<span className="lr-plus-locked">🔒 Réservé à Plus</span>}
   </article>
   <article className="lr-plus-feature lr-plus-book-feature">
    <span className="lr-plus-icon">📖</span><div><h2>Notre livre souvenir</h2>
     <p>Compose un mini-livre avec ton histoire et jusqu'à six photos, puis imprime-le ou enregistre-le en PDF.</p></div>
    {isActive?<div className="lr-plus-editor">
     <label>Titre du livre<input maxLength={80} value={bookTitle} onChange={event=>setBookTitle(event.target.value)}/></label>
     <label>Notre histoire<textarea rows={5} maxLength={4000} value={bookStory}
      onChange={event=>setBookStory(event.target.value)} placeholder="Raconte un moment précieux de votre histoire…"/></label>
     <label className="lr-plus-photo-upload">📷 Ajouter des photos (6 maximum)
      <input type="file" accept="image/*" multiple onChange={addPhotos} aria-label="Ajouter des photos au livre"/></label>
     {info?<small role="status">{info}</small>:null}
     {bookPhotos.length?<div className="lr-plus-photo-list">{bookPhotos.map(photo=>
      <div key={photo.url}><img src={photo.url} alt={photo.name}/>
       <button type="button" onClick={()=>removePhoto(photo.url)} aria-label={"Retirer "+photo.name}>×</button></div>)}</div>:null}
     <button type="button" className="lr-plus-primary" onClick={()=>window.print()}
      disabled={!bookTitle.trim()||(!bookStory.trim()&&!bookPhotos.length)}>Imprimer ou enregistrer en PDF</button>
     <small>Ces photos et textes restent sur cet appareil, sans transfert au serveur. Ils ne sont pas conservés après fermeture.</small>
    </div>:<span className="lr-plus-locked">🔒 Réservé à Plus</span>}
   </article>
  </div>
  {isActive?<article className="lr-plus-print-book" aria-label="Livre souvenir à imprimer">
   <h1>{bookTitle}</h1><p className="lr-plus-book-couple">{partnerName?"Notre histoire à deux ♡":"Notre histoire ♡"}</p>
   <p className="lr-plus-book-text">{bookStory}</p>
   <div className="lr-plus-book-photos">{bookPhotos.map(photo=><img key={photo.url} src={photo.url} alt={photo.name}/>)}</div>
   <p>Créé avec Love Radar Plus · Diao-Tech.com</p>
  </article>:null}
 </section>;
}
