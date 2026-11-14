import {useCallback,useEffect,useRef,useState,type ChangeEvent,type FormEvent} from "react";
import {daysTo,emptyProfile,formatDate,todayLocal,upcomingDates,type StoryData,type StoryProfile} from "./story-dates";
import "./couple-story.css";
import PrivatePhoto from "./PrivatePhoto";

type Mode="story"|"reunion";
type Props={token:string;mode:Mode;privacyEnabled:boolean;myName:string;partnerName:string|null;onExit:()=>void;onOpenStory:()=>void;onOpenReunion:()=>void};
async function photoAsJpeg(file:File):Promise<File>{
 // The iPhone camera may produce large photos: resize and convert locally before upload.
 const url=URL.createObjectURL(file);
 const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(Error("Cette photo ne peut pas être ouverte. Essaie une image JPEG ou PNG."));
   image.src=url;
  });
  const width=image.naturalWidth,height=image.naturalHeight;
  if(width<1||height<1)throw Error("Photo invalide.");
  const ratio=Math.min(1,1500/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*ratio));
  canvas.height=Math.max(1,Math.round(height*ratio));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Impossible de préparer cette photo.");
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(result=>result?resolve(result):reject(Error("Conversion de la photo impossible.")),"image/jpeg",.84);
  });
  if(blob.size>5_000_000)throw Error("Cette photo est trop volumineuse.");
  return new File([blob],"notre-photo.jpg",{type:"image/jpeg"});
 }finally{URL.revokeObjectURL(url)}
}
function Preview({token,profile,privacyEnabled,viewer}:{token:string;profile:StoryProfile;privacyEnabled:boolean;viewer:string}){
 const [src,setSrc]=useState<string|null>(null);
 useEffect(()=>{
  let active=true,url="";
  setSrc(null);
  if(!profile.hasPhoto)return()=>{};
  void (async()=>{
   try{
    const response=await fetch("/api/story-photo",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok)throw Error("Photo non disponible");
    const blob=await response.blob();
    if(!active)return;
    url=URL.createObjectURL(blob);
    setSrc(url);
   }catch{/* Keep the private photo area as a placeholder while unavailable. */}
  })();
  return()=>{active=false;if(url)URL.revokeObjectURL(url)};
 },[token,profile.photoVersion,profile.hasPhoto]);
 return src?<PrivatePhoto src={src} alt="Votre photo de couple privée" enabled={privacyEnabled} viewer={viewer} variant="portrait"/>:
  <div className="cs-photo-empty" aria-label="Aucune photo visible"><span>♡</span><small>{profile.hasPhoto?"Chargement de votre photo…":"Votre photo à deux"}</small></div>;
}
export default function CoupleStory({token,mode,privacyEnabled,myName,partnerName,onExit,onOpenStory,onOpenReunion}:Props){
 const [data,setData]=useState<StoryData|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const [meeting,setMeeting]=useState("");
 const [reunion,setReunion]=useState(""),[place,setPlace]=useState("");
 const [eventDate,setEventDate]=useState(todayLocal),[eventTitle,setEventTitle]=useState(""),[eventNote,setEventNote]=useState("");
 const [annual,setAnnual]=useState(false),[adding,setAdding]=useState(false);
 const [today,setToday]=useState(todayLocal);
 const dirtyMeeting=useRef(false),dirtyReunion=useRef(false),inFlight=useRef(false);
 const inputFile=useRef<HTMLInputElement|null>(null);
 const active=useRef(true);
 const profile=data?.profile||emptyProfile;
 const events=data?.events||[];
 const dayCount=profile.meetingDate?Math.max(0,-daysTo(profile.meetingDate,today)):null;
 const reunionDays=profile.reunionDate?daysTo(profile.reunionDate,today):null;
 const anniversary=upcomingDates(profile,events,today);
 const loadingText=loading&&!data?"Ouverture de votre histoire…":null;
 const partner=partnerName||"ton amour";

 const apply=useCallback((snapshot:StoryData)=>{
  if(!active.current)return;
  setData(snapshot);
  if(!dirtyMeeting.current)setMeeting(snapshot.profile.meetingDate||"");
  if(!dirtyReunion.current){setReunion(snapshot.profile.reunionDate||"");setPlace(snapshot.profile.reunionPlace||"")}
 },[]);
 const load=useCallback(async(silent=false)=>{
  if(inFlight.current)return;
  inFlight.current=true;
  try{
   const res=await fetch("/api/story",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const body=await res.json() as StoryData;
   if(!res.ok||!body.ok)throw Error(body.error||"Impossible d’ouvrir votre espace.");
   apply(body);
   if(!silent&&active.current)setError("");
  }catch(e){if(active.current&&!silent)setError(e instanceof Error?e.message:"Connexion indisponible.")}
  finally{inFlight.current=false;if(active.current)setLoading(false)}
 },[token,apply]);
 useEffect(()=>{
  active.current=true;void load();
  const poll=window.setInterval(()=>{if(document.visibilityState==="visible")void load(true)},12000);
  const vis=()=>{if(document.visibilityState==="visible")void load(true)};
  const dateTimer=window.setInterval(()=>setToday(todayLocal()),30000);
  document.addEventListener("visibilitychange",vis);
  return()=>{active.current=false;window.clearInterval(poll);window.clearInterval(dateTimer);document.removeEventListener("visibilitychange",vis)};
 },[load]);

 async function submit(action:Record<string,unknown>,confirmation:string){
  if(busy)return false;
  setBusy(true);setError("");setSuccess("");
  try{
   const res=await fetch("/api/story",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(action)});
   const body=await res.json() as StoryData;
   if(!res.ok||!body.ok)throw Error(body.error||"Impossible d’enregistrer.");
   apply(body);setSuccess(confirmation);
   return true;
  }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");return false}
  finally{if(active.current)setBusy(false)}
 }
 const saveMeeting=async(e:FormEvent)=>{
  e.preventDefault();
  const saved=await submit({action:"set_meeting",date:meeting||null},"Votre date de rencontre est enregistrée ❤️");
  if(saved){dirtyMeeting.current=false;void load(true)}
 };
 const saveReunion=async(e:FormEvent)=>{
  e.preventDefault();
  if(!reunion){setError("Choisis la date de vos retrouvailles.");return}
  const saved=await submit({action:"set_reunion",date:reunion,place},"Votre compte à rebours est partagé ! 💞");
  if(saved){dirtyReunion.current=false;void load(true)}
 };
 const clearReunion=async()=>{
  if(!window.confirm("Retirer la date des retrouvailles pour vous deux ?"))return;
  const saved=await submit({action:"set_reunion",date:null,place:""},"Compte à rebours retiré.");
  if(saved){dirtyReunion.current=false;setReunion("");setPlace("")}
 };
 const saveEvent=async(e:FormEvent)=>{
  e.preventDefault();
  const saved=await submit({action:"add_event",date:eventDate,title:eventTitle,note:eventNote,annual},"Votre souvenir est ajouté à votre histoire ❤️");
  if(saved){setEventTitle("");setEventNote("");setAnnual(false);setEventDate(todayLocal());setAdding(false)}
 };
 const removeEvent=async(id:string,title:string)=>{
  if(!window.confirm('Supprimer « '+title+' » de votre histoire commune ?'))return;
  await submit({action:"delete_event",id},"Événement supprimé.");
 };
 const onPhoto=async(e:ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];e.target.value="";
  if(!file||busy)return;
  setError("");setSuccess("");setBusy(true);
  try{
   const prepared=await photoAsJpeg(file),form=new FormData();
   form.append("file",prepared);
   const response=await fetch("/api/story-photo",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});
   const result=await response.json() as {ok:boolean;error?:string};
   if(!response.ok||!result.ok)throw Error(result.error||"Envoi impossible.");
   dirtyMeeting.current=false;dirtyReunion.current=false;
   setSuccess("Votre photo de couple a été enregistrée. 📸");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de modifier la photo.")}
  finally{if(active.current){setBusy(false);void load(true)}}
 };
 const removePhoto=async()=>{
  if(busy||!window.confirm("Supprimer votre photo de couple pour vous deux ?"))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const res=await fetch("/api/story-photo",{method:"DELETE",headers:{Authorization:"Bearer "+token}});
   const body=await res.json() as {ok:boolean;error?:string};
   if(!res.ok||!body.ok)throw Error(body.error||"Suppression impossible.");
   setSuccess("Votre photo commune a été supprimée.");
  }catch(e){setError(e instanceof Error?e.message:"Suppression impossible.")}
  finally{if(active.current){setBusy(false);void load(true)}}
 };
 return <section className={"cs-page "+(mode==="reunion"?"cs-reunion-page":"")} aria-label={mode==="story"?"Notre histoire de couple":"Compte à rebours de nos retrouvailles"}>
  <header className="cs-header">
   <button type="button" onClick={onExit} className="cs-back">{mode==="story"?"‹ Souvenirs":"‹ Ensemble"}</button>
   <strong>LOVE RADAR <span>♡</span></strong>
   <span aria-hidden="true">{mode==="story"?"💑":"📅"}</span>
  </header>
  {loadingText?<p className="cs-loading">{loadingText}</p>:null}
  {error?<div className="cs-alert" role="alert">{error}</div>:null}
  {success?<div className="cs-success" role="status">{success}</div>:null}
  {mode==="story"?<>
   <div className="cs-hero">
    <span className="cs-kicker">♥ NOTRE HISTOIRE</span>
    <h1>Toi, moi… <em>nous.</em></h1>
    <p>Chaque histoire d’amour commence quelque part. Voici la vôtre.</p>
    <div className="cs-portrait">
     <Preview token={token} profile={profile} privacyEnabled={privacyEnabled} viewer={myName}/>
     <div className="cs-photo-overlay"><input ref={inputFile} type="file" accept="image/*" hidden onChange={e=>void onPhoto(e)}/>
      <button type="button" onClick={()=>inputFile.current?.click()} disabled={busy}>{profile.hasPhoto?"📷 Changer la photo":"📸 Ajouter notre photo"}</button>
      {profile.hasPhoto?<button type="button" className="cs-remove-photo" disabled={busy} onClick={()=>void removePhoto()}>Supprimer</button>:null}
     </div>
    </div>
    <div className="cs-together-days"><span aria-hidden="true">♥</span><strong>{dayCount===null?"Votre histoire commence ici":dayCount+" jour"+(dayCount>1?"s":"")+" ensemble"}</strong>
     {profile.meetingDate?<small>Depuis le {formatDate(profile.meetingDate)}</small>:<small>Ajoutez votre date de rencontre</small>}
    </div>
   </div>
   <form className="cs-panel" onSubmit={e=>void saveMeeting(e)}>
    <h2>Notre première rencontre 💕</h2>
    <label htmlFor="cs-meeting">La date où tout a commencé</label>
    <div className="cs-inline-form"><input id="cs-meeting" type="date" min="1900-01-01" max={todayLocal()} value={meeting} onChange={e=>{dirtyMeeting.current=true;setMeeting(e.target.value)}}/>
     <button type="submit" disabled={busy||!meeting}>{busy?"Enregistrement…":"Enregistrer"}</button>
    </div>
   </form>
   <section className="cs-panel cs-timeline" aria-label="Nos souvenirs marquants">
    <div className="cs-section-title"><div><span className="cs-kicker">NOTRE CHEMIN À DEUX</span><h2>Nos moments précieux ✨</h2></div>
     <button type="button" onClick={()=>setAdding(!adding)}>{adding?"Fermer":"+ Ajouter"}</button>
    </div>
    {adding?<form className="cs-event-form" onSubmit={e=>void saveEvent(e)}>
     <label htmlFor="cs-event-title">Titre du souvenir ou de la date importante</label>
     <input id="cs-event-title" value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="Notre premier rendez-vous, un anniversaire…" maxLength={65} required/>
     <label htmlFor="cs-event-date">Date</label>
     <input id="cs-event-date" type="date" min="1900-01-01" max="2100-12-31" value={eventDate} onChange={e=>setEventDate(e.target.value)} required/>
     <label htmlFor="cs-event-note">Petit mot (facultatif)</label>
     <textarea id="cs-event-note" rows={2} maxLength={300} placeholder="Ce que nous voulons garder en mémoire…" value={eventNote} onChange={e=>setEventNote(e.target.value)}/>
     <label className="cs-check"><input type="checkbox" checked={annual} onChange={e=>setAnnual(e.target.checked)}/> Cette date revient chaque année (anniversaire, fête…)</label>
     <button className="cs-primary" type="submit" disabled={busy||!eventTitle.trim()||!eventDate}>Enregistrer ce moment ♡</button>
    </form>:null}
    {events.length?<div className="cs-event-list">{events.map(ev=><article className="cs-event" key={ev.id}>
     <div className="cs-event-mark" aria-hidden="true">{ev.annual?"🎂":"♥"}</div>
     <div className="cs-event-content"><span>{formatDate(ev.date)} {ev.annual?"· Chaque année":""}</span><strong>{ev.title}</strong>{ev.note?<p>{ev.note}</p>:null}</div>
     <button className="cs-event-delete" type="button" disabled={busy} onClick={()=>void removeEvent(ev.id,ev.title)} aria-label={"Supprimer "+ev.title}>×</button>
    </article>)}</div>:<div className="cs-empty">🌷 Votre album d’histoire attend son premier souvenir. Ajoutez une date marquante à deux.</div>}
   </section>
   <button type="button" className="cs-crosslink" onClick={onOpenReunion}>📅 Voir notre prochain rendez-vous et nos anniversaires <span>→</span></button>
  </>:<>
   <div className="cs-countdown">
    <span className="cs-kicker">✦ NOS RETROUVAILLES</span>
    <span className="cs-countdown-hearts" aria-hidden="true">♥ ♥</span>
    <h1>Encore un peu de patience, <em>mon amour.</em></h1>
    {reunionDays===null?<><strong className="cs-countdown-number">♡</strong><p>Choisissez ensemble la date de votre prochaine rencontre.</p></>:
     reunionDays>0?<><strong className="cs-countdown-number">{reunionDays}</strong><p>jour{reunionDays>1?"s":""} avant de nous retrouver ❤️</p></>:
     reunionDays===0?<><strong className="cs-countdown-number">❤️</strong><p>C’est aujourd’hui ! Profitez de vos retrouvailles.</p></>:
     <><strong className="cs-countdown-number">♡</strong><p>Cette date est passée. Planifiez votre prochaine rencontre.</p></>}
    {profile.reunionDate?<div className="cs-countdown-date">📅 {formatDate(profile.reunionDate,true)}{profile.reunionPlace?" · "+profile.reunionPlace:""}</div>:null}
    <small>Le compte à rebours est partagé et calculé en jours calendaires sur chaque téléphone.</small>
   </div>
   <form className="cs-panel" onSubmit={e=>void saveReunion(e)}>
    <h2>Notre prochain rendez-vous 💞</h2>
    <label htmlFor="cs-reunion-date">Date des retrouvailles</label>
    <input id="cs-reunion-date" type="date" min={todayLocal()} max="2100-12-31" value={reunion} onChange={e=>{dirtyReunion.current=true;setReunion(e.target.value)}} required/>
    <label htmlFor="cs-reunion-place">Lieu ou petit mot (facultatif)</label>
    <input id="cs-reunion-place" type="text" maxLength={90} value={place} onChange={e=>{dirtyReunion.current=true;setPlace(e.target.value)}} placeholder="À l’aéroport, à Dakar, enfin dans tes bras…"/>
    <button className="cs-primary" type="submit" disabled={busy||!reunion}>{busy?"Enregistrement…":"💗 Enregistrer nos retrouvailles"}</button>
    {profile.reunionDate?<button type="button" className="cs-secondary" disabled={busy} onClick={()=>void clearReunion()}>Retirer cette date</button>:null}
   </form>
   <section className="cs-panel cs-annual">
    <div className="cs-section-title"><div><span className="cs-kicker">NE RIEN OUBLIER</span><h2>Nos dates importantes 🎂</h2></div></div>
    {anniversary.length?<div className="cs-anniversary-list">{anniversary.slice(0,8).map(item=><div key={item.id} className="cs-anniversary-item">
      <div className="cs-anniversary-date"><strong>{new Date(item.date+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})}</strong><small>{item.date.slice(0,4)}</small></div>
      <div><strong>{item.label}</strong><span>{item.annual?"Chaque année · ":""}{daysTo(item.date,today)===0?"Aujourd’hui ❤️":"Dans "+daysTo(item.date,today)+" jour"+(daysTo(item.date,today)>1?"s":"")}</span></div>
     </div>)}</div>:<p className="cs-empty">Aucune date importante pour l’instant. Ajoutez votre rencontre ou des anniversaires dans « Notre histoire ».</p>}
    <button type="button" className="cs-secondary" onClick={onOpenStory}>♡ Ajouter un anniversaire dans Notre histoire →</button>
   </section>
  </>}
  <p className="cs-credit">Créé avec ♡ par <strong>Diao-Tech.com</strong> · Espace privé à deux</p>
 </section>;
}
