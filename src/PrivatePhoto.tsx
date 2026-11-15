import {useEffect,useRef,useState} from "react";
import "./private-photo.css";

/**
 * Privacy curtain for picture previews. This deliberately does NOT prevent an
 * operating-system screenshot. It hides photos by default on this device and
 * watermarks them when the viewer chooses to reveal them.
 */
type Props={
 src:string;
 alt:string;
 enabled:boolean;
 viewer:string;
 variant?:"chat"|"album"|"focus"|"portrait";
 onImageError?:()=>void;
};
const VIEW_MS=30000;
export default function PrivatePhoto({src,alt,enabled,viewer,variant="chat",onImageError}:Props){
 const [visible,setVisible]=useState(false);
 const expire=useRef<number|null>(null);
 function conceal(){
  if(expire.current!==null){window.clearTimeout(expire.current);expire.current=null}
  setVisible(false);
 }
 useEffect(()=>{
  setVisible(false);
  const hide=()=>{if(document.visibilityState!=="visible")conceal()};
  const blur=()=>conceal();
  document.addEventListener("visibilitychange",hide);
  window.addEventListener("pagehide",blur);
  window.addEventListener("blur",blur);
  return()=>{
   if(expire.current!==null)window.clearTimeout(expire.current);
   document.removeEventListener("visibilitychange",hide);
   window.removeEventListener("pagehide",blur);
   window.removeEventListener("blur",blur);
  };
 },[src,enabled]);
 function reveal(){
  if(expire.current!==null)window.clearTimeout(expire.current);
  setVisible(true);
  expire.current=window.setTimeout(()=>{setVisible(false);expire.current=null},VIEW_MS);
 }
 const show=!enabled||visible;
 return <div className={"lr-private-photo lr-private-photo-"+variant+(show?" is-revealed":" is-concealed")}>
  {show?<img src={src} alt={alt} draggable={false} onError={onImageError} onContextMenu={e=>{if(enabled)e.preventDefault()}}/>:null}
  {enabled?(show?<div className="lr-private-photo-watermarks" aria-hidden="true">
   <span>LOVE RADAR · PRIVÉ · {viewer}</span>
   <span>LOVE RADAR · PRIVÉ · {viewer}</span>
   <span>LOVE RADAR · PRIVÉ · {viewer}</span>
  </div>:null):null}
  {enabled?(show?<button type="button" className="lr-private-photo-hide" onClick={conceal} aria-label="Masquer cette photo">🔒 Masquer</button>:
   <button type="button" className="lr-private-photo-reveal" onClick={reveal} aria-label={"Afficher temporairement "+alt}>
    <span aria-hidden="true">🔒</span>
    <strong>Photo privée</strong>
    <small>Toucher pour afficher · 30 secondes</small>
   </button>):null}
 </div>;
}
