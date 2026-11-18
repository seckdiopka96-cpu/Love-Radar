import {useCallback,useEffect,useRef,useState,type ChangeEvent,type FormEvent} from "react";
import {apiFetch} from "./api";
import PrivatePhoto from "./PrivatePhoto";
import "./shared-keepsakes.css";

type AlbumItem={id:string;authorId:string;caption:string;mime:string;createdAt:number};
type LetterItem={id:string;authorId:string;title:string;body:string|null;unlockAt:number;createdAt:number;opened:boolean};
type Reply<T>={ok:boolean;items?:T[];error?:string;serverNow?:number};
type Props={token:string;myId:string;myName:string;partnerName:string|null;privacyEnabled:boolean;focusKind?:string|null;focusId?:string|null};
const url=(type:"album"|"letters",extra="")=>"/api/keepsakes?type="+type+extra;
const dateFormat=(time:number)=>new Date(time).toLocaleString("fr-FR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
function nextDayInput(){
 const d=new Date(Date.now()+86400000);
 const p=(n:number)=>String(n).padStart(2,"0");
 return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());
}
async function photoAsJpeg(file:File):Promise<File>{
 if(!file.type.startsWith("image/"))return file;
 const resource=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Cette photo ne peut pas être lue."));image.src=resource});
  const longest=Math.max(image.naturalWidth,image.naturalHeight);
  if(!longest)throw new Error("Photo invalide.");
  const scale=Math.min(1,1800/longest),canvas=document.createElement("canvas");
  canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  const context=canvas.getContext("2d");if(!context)throw new Error("Impossible de préparer la photo.");
  context.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Conversion impossible.")),"image/jpeg",.82));
  return new File([blob],"souvenir.jpg",{type:"image/jpeg"});
 }finally{URL.revokeObjectURL(resource)}
}
function AlbumAsset({token,item,privacyEnabled,viewer}:{token:string;item:AlbumItem;privacyEnabled:boolean;viewer:string}){
 const [src,setSrc]=useState(""),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true,objectUrl="";
  setSrc("");setFailed(false);
  void (async()=>{
   try{
    const response=await apiFetch(url("album","&media=1&id="+encodeURIComponent(item.id)),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok)throw new Error("Fichier indisponible.");
    const blob=await response.blob();
    if(!active)return;
    objectUrl=URL.createObjectURL(blob);setSrc(objectUrl);
   }catch{if(active)setFailed(true)}
  })();
  return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[token,item.id]);
 if(failed)return <div className="sk-asset-placeholder" role="status">Souvenir indisponible</div>;
 if(!src)return <div className="sk-asset-placeholder">Chargement…</div>;
 return item.mime.startsWith("video/")?
  <video className="sk-video" controls playsInline preload="metadata" src={src} aria-label="Vidéo souvenir du couple"/>:
  <PrivatePhoto src={src} alt={item.caption||"Photo de notre album partagé"} viewer={viewer} enabled={privacyEnabled} variant="album"/>;
}
export default function SharedKeepsakes({token,myId,myName,partnerName,privacyEnabled,focusKind,focusId}:Props){
 const [album,setAlbum]=useState<AlbumItem[]>([]),[letters,setLetters]=useState<LetterItem[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [showUpload,setShowUpload]=useState(false),[showCompose,setShowCompose]=useState(false);
 const [file,setFile]=useState<File|null>(null),[caption,setCaption]=useState("");
 const [title,setTitle]=useState(""),[body,setBody]=useState(""),[unlock,setUnlock]=useState(nextDayInput);
 const picker=useRef<HTMLInputElement>(null),alive=useRef(true),inFlight=useRef(false);
 const partner=partnerName||"Ton amour";
 const author=(id:string)=>id===myId?"Toi":partner;
 const request=useCallback(async<T,>(kind:"album"|"letters",options?:RequestInit,extra=""):Promise<T[]>=>{
  const response=await apiFetch(url(kind,extra),{...options,headers:{"Authorization":"Bearer "+token,...options?.headers},cache:"no-store"});
  const result=await response.json() as Reply<T>;
  if(!response.ok||!result.ok)throw new Error(result.error||"Connexion momentanément indisponible.");
  return result.items||[];
 },[token]);
 const refresh=useCallback(async(silent=false)=>{
  if(inFlight.current)return;
  inFlight.current=true;
  try{
   const [a,l]=await Promise.all([request<AlbumItem>("album"),request<LetterItem>("letters")]);
   if(alive.current){setAlbum(a);setLetters(l);if(!silent)setError("")}
  }catch(e){if(alive.current&&!silent)setError(e instanceof Error?e.message:"Connexion impossible.")}
  finally{inFlight.current=false;if(alive.current)setLoading(false)}
 },[request]);
 useEffect(()=>{
  alive.current=true;void refresh();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh(true)},30000);
  const visible=()=>{if(document.visibilityState==="visible")void refresh(true)};
  document.addEventListener("visibilitychange",visible);
  return()=>{alive.current=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[refresh]);
 useEffect(()=>{
  if(!focusId||!album.concat(letters as unknown as AlbumItem[]).some(x=>x.id===focusId))return;
  const timer=window.setTimeout(()=>document.getElementById("sk-"+focusId)?.scrollIntoView({block:"center",behavior:"smooth"}),180);
  return()=>window.clearTimeout(timer);
 },[focusId,album,letters]);
 async function upload(e:FormEvent){
  e.preventDefault();if(busy||!file)return;
  setBusy(true);setError("");setSuccess("");
  try{
   const prepared=await photoAsJpeg(file);
   const form=new FormData();form.append("file",prepared);form.append("caption",caption);
   const items=await request<AlbumItem>("album",{method:"POST",body:form});
   if(!alive.current)return;
   setAlbum(items);setFile(null);setCaption("");setShowUpload(false);if(picker.current)picker.current.value="";
   setSuccess("Votre souvenir a rejoint l'album partagé. ❤️");
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Impossible d'envoyer le souvenir.")}
  finally{if(alive.current)setBusy(false)}
 }
 async function sendLetter(e:FormEvent){
  e.preventDefault();if(busy)return;
  const unlockAt=new Date(unlock).getTime();
  if(!Number.isFinite(unlockAt)||unlockAt<Date.now()+60000){setError("Choisis une date future pour ouvrir la lettre.");return}
  setBusy(true);setError("");setSuccess("");
  try{
   const items=await request<LetterItem>("letters",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body,unlockAt})});
   if(!alive.current)return;
   setLetters(items);setTitle("");setBody("");setUnlock(nextDayInput());setShowCompose(false);
   setSuccess("Lettre scellée. Elle se dévoilera à la date choisie. 💌");
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{if(alive.current)setBusy(false)}
 }
 async function remove(type:"album"|"letters",id:string){
  if(busy||!window.confirm(type==="album"?"Supprimer ce souvenir de l'album pour vous deux ?":"Supprimer définitivement cette lettre pour vous deux ?"))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const items=await request<AlbumItem|LetterItem>(type,{method:"DELETE"},"&id="+encodeURIComponent(id));
   if(!alive.current)return;
   if(type==="album")setAlbum(items as AlbumItem[]);else setLetters(items as LetterItem[]);
   setSuccess("Souvenir supprimé.");
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Suppression impossible.")}
  finally{if(alive.current)setBusy(false)}
 }
 function chooseFile(e:ChangeEvent<HTMLInputElement>){
  const selected=e.target.files?.[0]||null;
  if(selected&&(!["image/jpeg","image/png","image/webp","image/heic","image/heif","video/mp4","video/webm"].includes(selected.type)||
   selected.size>(selected.type.startsWith("video/")?15_000_000:20_000_000))){
   setError("Photo invalide ou vidéo trop grande (15 Mo maximum).");setFile(null);return;
  }
  setFile(selected);setError("");
 }
 return <div className="sk-root">
  {error?<div className="sk-alert" role="alert">{error}</div>:null}
  {success?<div className="sk-success" role="status">{success}</div>:null}
  <section className="sk-panel" aria-label="Notre album partagé">
   <div className="sk-section-head"><div><span className="sk-kicker">📸 NOTRE ALBUM</span><h2>Nos instants précieux</h2><p>Vos photos et petites vidéos réunies dans un album privé.</p></div>
    <button type="button" className="sk-action" onClick={()=>{setShowUpload(v=>!v);setShowCompose(false)}}>{showUpload?"Fermer":"+ Ajouter"}</button></div>
   {showUpload?<form onSubmit={e=>void upload(e)} className="sk-form">
    <label>Photo ou courte vidéo<input ref={picker} type="file" accept="image/*,video/mp4,video/webm" onChange={chooseFile} required/></label>
    {file?<small>{file.name} · {Math.round(file.size/1024)} Ko</small>:null}
    <label>Un petit mot (facultatif)<input value={caption} maxLength={180} onChange={e=>setCaption(e.target.value)} placeholder="Notre plus belle journée…"/></label>
    <button type="submit" disabled={busy||!file}>{busy?"Enregistrement…":"Ajouter à notre album ♥"}</button>
   </form>:null}
   {loading?<p className="sk-empty">Chargement de votre album…</p>:album.length?
    <div className="sk-album-grid">{album.map(item=><article id={"sk-"+item.id} key={item.id} className={"sk-photo-card"+(focusKind==="album-memory"&&focusId===item.id?" sk-highlight":"")}>
      <AlbumAsset token={token} item={item} privacyEnabled={privacyEnabled} viewer={myName}/>
      <div className="sk-photo-meta"><strong>{item.caption||"Notre souvenir ❤️"}</strong><small>{author(item.authorId)} · {dateFormat(item.createdAt)}</small>
       <button type="button" disabled={busy} onClick={()=>void remove("album",item.id)}>Supprimer</button></div>
     </article>)}</div>:
    <div className="sk-empty"><span aria-hidden="true">📷</span><strong>Votre premier souvenir vous attend</strong><p>Ajoutez une photo ou une courte vidéo que vous pourrez retrouver à deux.</p></div>}
  </section>
  <section className="sk-panel sk-letters" aria-label="Nos lettres surprises">
   <div className="sk-section-head"><div><span className="sk-kicker">💌 LETTRES DU FUTUR</span><h2>À ouvrir plus tard…</h2><p>Écris une lettre. Elle restera scellée jusqu'à la date choisie.</p></div>
    <button type="button" className="sk-action" onClick={()=>{setShowCompose(v=>!v);setShowUpload(false)}}>{showCompose?"Fermer":"+ Écrire"}</button></div>
   {showCompose?<form onSubmit={e=>void sendLetter(e)} className="sk-form">
    <label>Titre de la lettre<input maxLength={70} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Pour notre prochain anniversaire…" required/></label>
    <label>Ce que j'ai envie de te dire<textarea rows={5} maxLength={3500} value={body} onChange={e=>setBody(e.target.value)} placeholder="Mon amour…" required/></label>
    <label>Dévoiler cette lettre le<input type="datetime-local" value={unlock} onChange={e=>setUnlock(e.target.value)} required/></label>
    <small>La date et l'heure sont celles de ton téléphone. Le texte sera invisible pour vous deux jusque-là.</small>
    <button type="submit" disabled={busy||title.trim().length<1||body.trim().length<3}>{busy?"Enregistrement…":"Sceller cette lettre 💌"}</button>
   </form>:null}
   {loading?<p className="sk-empty">Chargement des lettres…</p>:letters.length?
    <div className="sk-letter-list">{letters.map(letter=><article id={"sk-"+letter.id} className={"sk-letter"+(!letter.opened?" is-sealed":"")+(focusKind==="love-letter"&&focusId===letter.id?" sk-highlight":"")} key={letter.id}>
     <span className="sk-letter-envelope" aria-hidden="true">{letter.opened?"💌":"✉️"}</span>
     <div className="sk-letter-body"><small>{author(letter.authorId)} · {dateFormat(letter.createdAt)}</small><h3>{letter.title}</h3>
      {letter.opened?<p className="sk-open-letter">{letter.body}</p>:<p className="sk-locked">🔒 À découvrir le {dateFormat(letter.unlockAt)}</p>}
      {letter.authorId===myId?<button type="button" disabled={busy} className="sk-delete-letter" onClick={()=>void remove("letters",letter.id)}>Supprimer ma lettre</button>:null}
     </div>
    </article>)}</div>:
    <div className="sk-empty"><span aria-hidden="true">💌</span><strong>Une surprise pour demain</strong><p>Écris les mots que {partner} découvrira au bon moment.</p></div>}
  </section>
 </div>;
}
