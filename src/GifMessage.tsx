import {useEffect,useState} from "react";
import {GIPHY_KEY,gifById,type GifResult} from "./gif-provider";
import "./gif-message.css";

/** Third-party GIF is always fetched directly from GIPHY on this device.
 * The server stores only its opaque ID, never media URLs or copied GIF data. */
export default function GifMessage({id}:{id:string}){
 const [gif,setGif]=useState<GifResult|null>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!GIPHY_KEY){setFailed(true);return}
  const controller=new AbortController();
  setGif(null);setFailed(false);
  void gifById(id,controller.signal)
   .then(result=>{if(!controller.signal.aborted){setGif(result);setFailed(!result)}})
   .catch(()=>{if(!controller.signal.aborted)setFailed(true)});
  return()=>controller.abort();
 },[id]);
 return <figure className="lr-chat-gif" aria-label="GIF animé">
  {gif?<img src={gif.preview} alt={gif.title||"GIF animé"} loading="lazy"
   onError={()=>setFailed(true)}/>:null}
  {!gif&&!failed?<span className="lr-chat-gif-placeholder" role="status">Chargement du GIF…</span>:null}
  {failed?<span className="lr-chat-gif-placeholder">GIF momentanément indisponible</span>:null}
  <figcaption>Powered By GIPHY</figcaption>
 </figure>;
}
