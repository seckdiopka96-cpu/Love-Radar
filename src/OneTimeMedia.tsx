import {useEffect,useState} from "react";
import {apiFetch} from "./api";
import PrivatePhoto from "./PrivatePhoto";
import "./one-time-media.css";

type Props={
 id:string;kind:"image"|"audio";token:string;viewer:string;
 onClose:()=>void;onOpened:()=>void;
};
/** View-once media is downloaded ONLY after the recipient explicitly opens it.
 * The server atomically consumes access. Leaving the overlay destroys the blob URL.
 * Screenshots or recordings by the operating system cannot be prevented.
 */
export default function OneTimeMedia({id,kind,token,viewer,onClose,onOpened}:Props){
 const [url,setUrl]=useState("");
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;let blobUrl="";
  const controller=new AbortController();
  const closeOnHide=()=>{if(document.visibilityState!=="visible")onClose()};
  const closeOnBlur=()=>onClose();
  document.addEventListener("visibilitychange",closeOnHide);
  window.addEventListener("pagehide",closeOnBlur);
  window.addEventListener("blur",closeOnBlur);
  void (async()=>{
   try{
    const res=await apiFetch("/api/media?id="+encodeURIComponent(id),{headers:{"Authorization":"Bearer "+token},cache:"no-store",signal:controller.signal});
    if(!res.ok){
     if(res.status===410)throw new Error("Ce média à vue unique a déjà été ouvert ou n’est plus accessible.");
     throw new Error("Impossible d’ouvrir ce média.");
    }
    const contentType=(res.headers.get("content-type")||"").toLowerCase();
    if(kind==="image"&&!contentType.startsWith("image/")||kind==="audio"&&!contentType.startsWith("audio/")&&!contentType.startsWith("video/"))
     throw new Error("Type de média inattendu.");
    const blob=await res.blob();
    if(!blob.size)throw new Error("Média vide.");
    if(!active)return;
    blobUrl=URL.createObjectURL(blob);
    setUrl(blobUrl);
    onOpened();
   }catch(e){
    if(active)setError(e instanceof Error?e.message:"Média indisponible.");
   }
  })();
  return()=>{
   active=false;controller.abort();
   document.removeEventListener("visibilitychange",closeOnHide);
   window.removeEventListener("pagehide",closeOnBlur);
   window.removeEventListener("blur",closeOnBlur);
   if(blobUrl)URL.revokeObjectURL(blobUrl);
  };
 },[id,kind,token]);
 return <div className="lr-once-overlay" role="dialog" aria-modal="true" aria-label={kind==="image"?"Photo à vue unique":"Vocal à écoute unique"}>
  <div className="lr-once-window">
   <div className="lr-once-header"><div><strong>{kind==="image"?"① Photo à vue unique":"① Vocal à écoute unique"}</strong><small>Ce média ne pourra plus être rouvert après avoir quitté cet écran.</small></div>
    <button type="button" onClick={onClose} aria-label="Fermer la vue unique">×</button>
   </div>
   {error?<div className="lr-once-error" role="alert">{error}</div>:url?
    kind==="image"?<PrivatePhoto src={url} alt="Photo à vue unique" enabled={false} viewer={viewer} variant="focus"/>:
    <audio className="lr-once-audio" src={url} controls autoPlay playsInline onEnded={onClose} aria-label="Écouter une fois le message vocal"/>:
    <div className="lr-once-loading" role="status">Ouverture sécurisée du média…</div>}
   <button type="button" className="lr-once-close" onClick={onClose}>Fermer définitivement</button>
  </div>
 </div>;
}
