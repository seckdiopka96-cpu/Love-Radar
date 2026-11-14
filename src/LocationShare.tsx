import {useCallback,useEffect,useRef,useState} from "react";
import "./location-share.css";

type Status="pending"|"active"|"declined"|"cancelled"|"stopped"|"expired";
type SharedLocation={lat:number;lng:number;accuracy:number|null;updatedAt:number};
type SharingRequest={id:string;status:Status;role:"requester"|"sharer";requesterName:string;targetName:string;createdAt:number;approvedAt:number|null;expiresAt:number;location:SharedLocation|null;isFresh:boolean};
type ResponseData={ok:boolean;error?:string;request?:SharingRequest|null;serverNow?:number};
type Props={token:string;partnerName:string|null;myName:string;onExit:()=>void;focusId?:string|null};
const endpoint="/api/location";
function formatted(ms:number){const min=Math.max(0,Math.ceil(ms/60000));return min+" min";}
function getPosition():Promise<GeolocationPosition>{
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error("Ce téléphone ne permet pas d’utiliser la géolocalisation."));return}
  navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
 });
}
function geoError(error:unknown){
 if(error&&typeof error==="object"&&"code" in error){
  const code=Number((error as GeolocationPositionError).code);
  if(code===1)return "L’accès à ta position a été refusé sur ton téléphone. Tu peux modifier cette autorisation dans les réglages iOS/Android.";
  if(code===2)return "Le GPS ne trouve pas de position pour le moment.";
  if(code===3)return "La recherche GPS a expiré. Réessaie.";
 }
 return error instanceof Error?error.message:"Impossible de récupérer ta position.";
}
function mapUrl(pos:SharedLocation){
 const lat=pos.lat,lng=pos.lng;
 const box=[lng-.006,lat-.006,lng+.006,lat+.006].map(n=>n.toFixed(6)).join(",");
 return "https://www.openstreetmap.org/export/embed.html?"+new URLSearchParams({bbox:box,layer:"mapnik",marker:lat.toFixed(6)+","+lng.toFixed(6)});
}
function externalMapUrl(pos:SharedLocation){
 return "https://www.openstreetmap.org/?"+new URLSearchParams({mlat:pos.lat.toFixed(6),mlon:pos.lng.toFixed(6),zoom:"16"});
}
export default function LocationShare({token,partnerName,myName,onExit,focusId}:Props){
 const [request,setRequest]=useState<SharingRequest|null>(null),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true),[clock,setClock]=useState(Date.now());
 const [syncStatus,setSyncStatus]=useState<"connecting"|"synced"|"offline">("connecting");
 const [mapOpen,setMapOpen]=useState(false),[permissionWaiting,setPermissionWaiting]=useState(false);
 const [mapPoint,setMapPoint]=useState<SharedLocation|null>(null);
 const mapUpdatedAt=useRef(0);
 const [offset,setOffset]=useState(0);
 const active=useRef(true),polling=useRef(false),updating=useRef(false);
 const localRequest=useRef<SharingRequest|null>(null),watchId=useRef<number|null>(null),offsetRef=useRef(0);
 const partner=partnerName||"Ton amour";
 useEffect(()=>()=> {
  // Also revoke on navigation away from the page if it was still sharing.
  const last=localRequest.current;
  if(last?.role==="sharer"&&last.status==="active"){
   void fetch(endpoint,{method:"POST",keepalive:true,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action:"stop",id:last.id})}).catch(()=>{});
  }
 },[token]);
 const requestId=request?.id||null,role=request?.role,status=request?.status;
 const serverNow=clock+offset;
 const remaining=request?Math.max(0,request.expiresAt-serverNow):0;
 const mySharing=role==="sharer"&&status==="active"&&remaining>0;
 const otherSharing=role==="requester"&&status==="active"&&remaining>0;
 const myRequest=role==="requester"&&status==="pending"&&remaining>0;
 const incoming=role==="sharer"&&status==="pending"&&remaining>0;
 const stale=otherSharing&&!request?.location;
 const update=(data:ResponseData)=>{
  if(data.request!==undefined){localRequest.current=data.request||null;setRequest(data.request||null)}
  if(typeof data.serverNow==="number"){offsetRef.current=data.serverNow-Date.now();setOffset(offsetRef.current)}
 };
 const load=useCallback(async(silent=false)=>{
  if(polling.current)return;
  polling.current=true;
  try{
   const res=await fetch(endpoint,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"La localisation est indisponible.");
   if(active.current){update(data);setSyncStatus("synced");if(!silent)setError("")}
  }catch(e){if(active.current){setSyncStatus("offline");if(!silent)setError(e instanceof Error?e.message:"Impossible de charger la demande.")}}
  finally{polling.current=false;if(active.current)setLoading(false)}
 },[token]);
 useEffect(()=>{
  active.current=true;void load();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load(true)},1500);
  const ticker=window.setInterval(()=>setClock(Date.now()),500);
  const visible=()=>{if(document.visibilityState==="visible")void load(true)};
  document.addEventListener("visibilitychange",visible);
  return()=>{active.current=false;window.clearInterval(timer);window.clearInterval(ticker);document.removeEventListener("visibilitychange",visible)};
 },[load]);
 const send=async(action:string,extra:Record<string,unknown>={})=>{
  if(busy)return false;
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Impossible de continuer.");
   if(active.current){update(data);setMapOpen(false)}
   return true;
  }catch(e){if(active.current)setError(e instanceof Error?e.message:"Erreur temporaire.");void load(true);return false}
  finally{if(active.current)setBusy(false)}
 };
 const ask=async()=>{
  if(!partnerName){setError("Ton partenaire doit d’abord rejoindre votre espace.");return}
  if(await send("request"))setNotice("Demande envoyée ! Ton partenaire peut accepter ou refuser librement.");
 };
 const accept=async()=>{
  if(!request||!incoming||busy||permissionWaiting)return;
  const id=request.id;
  setError("");setNotice("");setPermissionWaiting(true);
  try{
   // This location permission prompt comes directly from the user's explicit tap.
   const pos=await getPosition();
   if(!active.current)return;
   const accepted=await send("accept",{id,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy});
   if(accepted)setNotice("Tu partages ta position pendant 15 minutes maximum. Tu peux arrêter à tout moment.");
  }catch(e){if(active.current)setError(geoError(e))}
  finally{if(active.current)setPermissionWaiting(false)}
 };
 useEffect(()=>{
  // Never track after closing or backgrounding the screen. No service-worker GPS.
  if(!mySharing||!requestId||!navigator.geolocation)return;
  let enabled=true;
  const stop=()=>{if(watchId.current!==null){navigator.geolocation.clearWatch(watchId.current);watchId.current=null}};
  const start=()=>{
   if(!enabled||document.visibilityState!=="visible"||watchId.current!==null)return;
   watchId.current=navigator.geolocation.watchPosition(pos=>{
    const current=localRequest.current;
    if(!enabled||document.visibilityState!=="visible"||!current||current.role!=="sharer"||current.status!=="active"||current.id!==requestId||Date.now()+offsetRef.current>=current.expiresAt||updating.current)return;
    updating.current=true;
    void fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
     body:JSON.stringify({action:"update",id:requestId,lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy})})
     .then(res=>res.json() as Promise<ResponseData>).then(data=>{
      if(active.current&&data.ok)update(data);
      else if(active.current&&data.error)setError(data.error);
     }).catch(()=>{/* GPS updates will retry when the location changes. */}).finally(()=>{updating.current=false});
   },e=>{if(active.current)setError(geoError(e));if(e.code===1)stop()},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  };
  start();
  const visibility=()=>{if(document.visibilityState==="hidden")stop();else start()};
  document.addEventListener("visibilitychange",visibility);
  return()=>{enabled=false;stop();document.removeEventListener("visibilitychange",visibility)};
 },[mySharing,requestId,token]);
 const stop=async()=>{if(!request)return;if(await send("stop",{id:request.id}))setNotice("Partage arrêté : ta position n'est plus accessible.")};
 const exit=()=>{
  if(mySharing&&request)void send("stop",{id:request.id}).finally(onExit);
  else onExit();
 };
 const decline=async()=>{if(!request)return;if(await send("decline",{id:request.id}))setNotice("Demande refusée. Aucune position partagée.")};
 const cancel=async()=>{if(!request)return;if(await send("cancel",{id:request.id}))setNotice("Demande annulée.")};
 const center=request?.location;
 useEffect(()=>{
  if(!mapOpen||!center)return;
  const now=Date.now();
  if(!mapUpdatedAt.current||now-mapUpdatedAt.current>16000){
   setMapPoint(center);mapUpdatedAt.current=now;
  }
 },[center?.updatedAt,mapOpen]);
 const focusOld=focusId&&request&&focusId!==request.id;
 return <section className="loc-page" aria-label="Partage de position avec consentement">
  <header className="loc-head"><button type="button" onClick={exit}>‹ Accueil</button><div><strong>Notre position <span>♡</span></strong><small>TOUJOURS AVEC TON ACCORD</small></div><span className="loc-pin">📍</span></header>
  <div className="loc-intro"><div className="loc-illustration">📍</div><h1>Se retrouver, <em>en toute confiance.</em></h1><p>Demande à voir la position de ton amour. La personne choisit librement d’accepter ou de refuser.</p>
   <span role="status" className={"loc-sync "+(syncStatus==="offline"?"loc-sync-offline":"")}>{syncStatus==="synced"?"✓ Deux téléphones synchronisés via Love Radar":syncStatus==="connecting"?"⏳ Connexion…":"⚠️ Réseau indisponible · Reconnexion automatique"}</span>
  </div>
  {focusOld?<div className="loc-message" role="status">Cette notification concerne une ancienne demande. Voici la demande actuelle.</div>:null}
  {error?<div className="loc-message loc-error" role="alert">{error}</div>:null}
  {notice?<div className="loc-message loc-success" role="status">{notice}</div>:null}
  {loading&&!request?<div className="loc-card"><p>Vérification des demandes…</p></div>:
   (!request||["declined","cancelled","stopped","expired"].includes(status||""))?
   <div className="loc-card">
    <div className="loc-card-symbol">{status==="declined"?"🔒":status==="expired"?"⏳":"💗"}</div>
    <h2>{status==="declined"?"Demande refusée":status==="stopped"?"Partage terminé":status==="expired"?"Temps écoulé":status==="cancelled"?"Demande annulée":"Où est ton amour ?"}</h2>
    <p>{status==="declined"?"Ton partenaire a choisi de ne pas partager sa position. Ce choix est respecté.":status==="stopped"?"Le partage a été arrêté. Aucune position n'est visible.":status==="expired"?"La demande ou le partage a expiré. Les coordonnées ont été effacées.":status==="cancelled"?"La demande a été annulée.":"Tu peux lui demander d’afficher volontairement sa position pendant 15 minutes."}</p>
    <button className="loc-primary" type="button" disabled={busy||!partnerName} onClick={()=>void ask()}>{busy?"Envoi…":"📍 Demander sa position"}</button>
    {!partnerName?<small>Invite d’abord ton partenaire à rejoindre votre espace.</small>:null}
   </div>:
   incoming?<div className="loc-card loc-consent">
    <span className="loc-card-symbol">🔔</span><h2>{request.requesterName} demande ta position</h2>
    <p>Souhaites-tu lui montrer ta <strong>position GPS précise pendant 15 minutes</strong> ?</p>
    <div className="loc-consent-summary"><span>✓ Toi seul(e) peux accepter</span><span>✓ Arrêt à tout moment</span><span>✓ Pas de suivi en arrière-plan</span></div>
    <button type="button" className="loc-primary" disabled={busy||permissionWaiting} onClick={()=>void accept()}>{permissionWaiting?"Demande d’autorisation GPS…":"✓ Accepter et partager 15 min"}</button>
    <button type="button" className="loc-secondary loc-refuse" disabled={busy||permissionWaiting} onClick={()=>void decline()}>✕ Refuser</button>
    <small>Ton téléphone demandera aussi l’autorisation d’accès à la position. Tu peux la refuser.</small>
   </div>:
   myRequest?<div className="loc-card"><span className="loc-card-symbol">⌛</span><h2>En attente de {request.targetName}</h2>
    <p>Ton partenaire peut accepter ou refuser ta demande. Aucune position n’est accessible pour le moment.</p>
    <p className="loc-timer">Cette demande expire dans {formatted(remaining)}</p>
    <button type="button" className="loc-secondary" disabled={busy} onClick={()=>void cancel()}>Annuler ma demande</button>
   </div>:
   mySharing?<div className="loc-card loc-active"><span className="loc-card-symbol">🟢</span><h2>Tu partages ta position</h2>
    <p>{request.requesterName} peut consulter ta position pendant que cette page est ouverte et que le GPS fonctionne.</p>
    <div className="loc-time-pill">⏱️ Encore {formatted(remaining)}</div>
    <button className="loc-stop" type="button" disabled={busy} onClick={()=>void stop()}>■ Arrêter le partage immédiatement</button>
    <small>Le suivi s’interrompt lorsque tu quittes cette page. L’ancienne position cesse d’être visible après environ 85 secondes. L’accès prend fin au plus tard après 15 minutes.</small>
   </div>:
   otherSharing?<div className="loc-card loc-map-card"><div className="loc-map-head"><div><span className="loc-live-indicator">● PARTAGE AUTORISÉ</span><h2>Position de {request.targetName}</h2></div><div className="loc-time-pill">{formatted(remaining)}</div></div>
    {center?<><p>{request.targetName} partage volontairement sa position. Dernière actualisation : {new Date(center.updatedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}.</p>
     <div className="loc-accuracy">📡 Précision GPS estimée : ± {Math.max(1,Math.round(center.accuracy||1))} mètres</div>
     {!mapOpen?<button type="button" className="loc-primary" onClick={()=>{setMapPoint(center);mapUpdatedAt.current=Date.now();setMapOpen(true)}}>🗺️ Afficher sur la carte</button>:<>
      <div className="loc-map"><iframe title="Position partagée sur OpenStreetMap" src={mapUrl(mapPoint||center)} referrerPolicy="no-referrer" loading="lazy"/></div><span className="loc-map-refresh">Carte actualisée environ toutes les 16 secondes.</span>
      <a className="loc-map-link" href={externalMapUrl(center)} rel="noopener noreferrer" target="_blank">Ouvrir la carte en grand ↗</a>
     </>}
     <small>Carte OpenStreetMap : si tu l’ouvres, ce service cartographique reçoit les coordonnées affichées. La position peut être imprécise et n’est pas une preuve d’identité ou de présence.</small>
    </>:<><div className="loc-map-placeholder">📍</div><p>Partage autorisé, mais aucune position récente n’est disponible. Ton amour doit garder la page de partage ouverte et le GPS activé.</p></>}
   </div>:null}
  <div className="loc-privacy"><strong>🔒 Ta confidentialité avant tout</strong><p>Personne ne peut suivre quelqu’un sans son accord. Le refus est possible sans justification. Les coordonnées sont remplacées à chaque mise à jour, pas enregistrées comme historique, et effacées à l’arrêt ou à l’expiration.</p></div>
 </section>;
}
