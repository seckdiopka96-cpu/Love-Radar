import {useEffect,useRef} from "react";
import "./partner-profile-viewer.css";

/** Read-only private profile viewer. src is an authenticated local Blob URL,
 * never a public R2 URL. No download/share/screenshot actions are added. */
export default function PartnerProfileViewer({name,src,onClose}:{
 name:string;src?:string;onClose:()=>void
}){
 const closeButton=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{
  closeButton.current?.focus();
  const escape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();onClose()}
  };
  document.addEventListener("keydown",escape);
  return()=>document.removeEventListener("keydown",escape);
 },[onClose]);
 return <div className="lr-partner-photo-backdrop" role="presentation"
  onPointerDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <section className="lr-partner-photo-viewer" role="dialog" aria-modal="true"
   aria-labelledby="lr-partner-photo-name" aria-describedby="lr-partner-photo-desc">
   <header className="lr-partner-photo-heading">
    <div><small>PHOTO DE PROFIL</small><h2 id="lr-partner-photo-name">{name}</h2></div>
    <button ref={closeButton} type="button" className="lr-partner-photo-close"
     aria-label="Fermer la photo de profil" onClick={onClose}>×</button>
   </header>
   {src?<img className="lr-partner-photo-full" src={src} alt={"Photo de profil de "+name}
    draggable={false}/>:
    <div className="lr-partner-photo-empty" role="img" aria-label={"Aucune photo de profil pour "+name}>
     <span>{name.trim().charAt(0).toUpperCase()||"♡"}</span>
    </div>}
   <p id="lr-partner-photo-desc">Photo visible uniquement dans votre espace privé.</p>
  </section>
 </div>;
}
