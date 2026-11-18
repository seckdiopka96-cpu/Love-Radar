import {useCallback,useEffect,useRef,useState,type ChangeEvent,type FormEvent} from "react";
import {apiFetch} from "./api";
import PrivatePhoto from "./PrivatePhoto";
import {claimRecordingAudio,releaseRecordingAudio} from "./audio-focus";
import "./couple-experiences.css";

type Section="date"|"mood"|"dreams"|"hugs"|"challenges"|"gifts";
type Mood={id:string;memberId:string;mood:string;note:string;createdAt:number};
type Dream={id:string;authorId:string;title:string;detail:string;doneAt:number|null;createdAt:number};
type Hug={id:string;senderId:string;replyTo:string|null;createdAt:number};
type Challenge={key:string;title:string;emoji:string};
type Completion={id:string;memberId:string;key:string;createdAt:number};
type DateNight={id:string;authorId:string;activity:"movie"|"games"|"talk";plannedAt:number;acceptedBy:string|null;createdAt:number};
type Life={ok:boolean;error?:string;day:string;week:string;memberCount:number;moods:Mood[];dreams:Dream[];hugs:Hug[];challenges:Challenge[];completions:Completion[];date:DateNight|null};
type Gift={id:string;senderId:string;title:string;body:string|null;hasImage:boolean;hasAudio:boolean;openedAt:number|null;createdAt:number};
type Gifts={ok:boolean;error?:string;gifts:Gift[]};
type Props={token:string;myId:string;myName:string;partnerName:string|null;privacyEnabled:boolean;
 onExit:()=>void;onChat:()=>void;onWatch:()=>void;onGames:()=>void;onMoment:()=>void;
 focusKind?:string|null;focusId?:string|null};
const SECTIONS:{key:Section;emoji:string;title:string;hint:string}[]=[
 {key:"date",emoji:"🌙",title:"Soirée",hint:"Votre rendez-vous à distance"},
 {key:"mood",emoji:"🥹",title:"Humeur",hint:"Comment ça va aujourd'hui ?"},
 {key:"dreams",emoji:"✨",title:"Nos rêves",hint:"Votre liste de projets"},
 {key:"hugs",emoji:"🫂",title:"Câlins",hint:"Une pensée à distance"},
 {key:"challenges",emoji:"🏆",title:"Défis",hint:"Petites attentions chaque semaine"},
 {key:"gifts",emoji:"🎁",title:"Surprises",hint:"Coffres à ouvrir"}
];
const MOODS=[
 {key:"happy",icon:"😄",label:"Heureux"},
 {key:"love",icon:"🥰",label:"Amoureux"},
 {key:"calm",icon:"😌",label:"Serein"},
 {key:"tired",icon:"😴",label:"Fatigué"},
 {key:"sad",icon:"😢",label:"Triste"},
 {key:"stressed",icon:"😣",label:"Stressé"}
];
const ACTIVITIES=[
 {key:"movie",icon:"🎬",name:"Un film ensemble",desc:"Regarder YouTube ou TikTok à deux"},
 {key:"games",icon:"🎲",name:"Soirée jeux",desc:"Ludo et mini-jeux partagés"},
 {key:"talk",icon:"💞",name:"Un tête-à-tête",desc:"Discuter et s'appeler"}
] as const;
function formatDate(ms:number){
 return new Date(ms).toLocaleString("fr-FR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function defaultDate(){
 const d=new Date(Date.now()+86400000);
 d.setHours(20,0,0,0);
 const p=(x:number)=>String(x).padStart(2,"0");
 return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());
}
function selectedSection(kind?:string|null):Section{
 if(kind==="couple-date")return "date";
 if(kind==="couple-mood")return "mood";
 if(kind==="couple-dream")return "dreams";
 if(kind==="couple-hug")return "hugs";
 if(kind==="couple-challenge")return "challenges";
 if(kind==="couple-gift")return "gifts";
 return "date";
}
async function normalizeImage(file:File):Promise<File>{
 const local=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("Cette photo n'est pas prise en charge."));image.src=local;});
  const size=Math.max(image.naturalWidth,image.naturalHeight);
  if(!size)throw Error("Photo invalide.");
  const ratio=Math.min(1,1600/size),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Impossible de préparer cette photo.");
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Compression impossible.")),"image/jpeg",.8));
  return new File([blob],"surprise.jpg",{type:"image/jpeg"});
 }finally{URL.revokeObjectURL(local)}
}
function SurpriseAsset({token,id,kind,privacyEnabled,myName}:{token:string;id:string;kind:"image"|"audio";privacyEnabled:boolean;myName:string}){
 const [src,setSrc]=useState(""),[error,setError]=useState(false);
 useEffect(()=>{
  let current=true,objectUrl="";
  void (async()=>{
   try{
    const res=await apiFetch("/api/couple-surprises?media="+kind+"&id="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!res.ok)throw Error("Média indisponible.");
    const blob=await res.blob();
    if(!current)return;
    objectUrl=URL.createObjectURL(blob);setSrc(objectUrl);
   }catch{if(current)setError(true)}
  })();
  return()=>{current=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[token,id,kind]);
 if(error)return <p className="ce-muted">Ce fichier n'est plus disponible.</p>;
 if(!src)return <p className="ce-muted">Chargement de ton souvenir…</p>;
 return kind==="image"?<PrivatePhoto src={src} alt="Photo de la surprise" enabled={privacyEnabled} viewer={myName} variant="album"/>:
  <audio src={src} controls preload="metadata" aria-label="Message vocal surprise" className="ce-gift-audio"/>;
}
export default function CoupleExperiences({token,myId,myName,partnerName,privacyEnabled,onExit,onChat,onWatch,onGames,onMoment,focusKind,focusId}:Props){
 const [section,setSection]=useState<Section>(()=>selectedSection(focusKind));
 const [life,setLife]=useState<Life|null>(null),[gifts,setGifts]=useState<Gift[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [dateAt,setDateAt]=useState(defaultDate),[activity,setActivity]=useState<DateNight["activity"]>("movie");
 const [moodNote,setMoodNote]=useState("");
 const [dreamTitle,setDreamTitle]=useState(""),[dreamDetail,setDreamDetail]=useState("");
 const [giftTitle,setGiftTitle]=useState(""),[giftBody,setGiftBody]=useState("");
 const [photo,setPhoto]=useState<File|null>(null),[audio,setAudio]=useState<File|null>(null);
 const [recording,setRecording]=useState(false),[hugAnimation,setHugAnimation]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]);
 const inFlight=useRef(false),alive=useRef(true),recentHug=useRef<string|null>(null);
 const partner=partnerName||"ton amour";
 const mine=life?.moods.find(m=>m.memberId===myId),theirs=life?.moods.find(m=>m.memberId!==myId);
 const request=useCallback(async<T,>(path:string,options?:RequestInit):Promise<T>=>{
  const response=await apiFetch(path,{cache:"no-store",...options,headers:{Authorization:"Bearer "+token,...options?.headers}});
  const json=await response.json() as T&{ok:boolean;error?:string};
  if(!response.ok||!json.ok)throw Error(json.error||"Connexion interrompue.");
  return json;
 },[token]);
 const refresh=useCallback(async(silent=false)=>{
  if(inFlight.current||document.visibilityState==="hidden")return;
  inFlight.current=true;
  try{
   const [next,box]=await Promise.all([request<Life>("/api/couple-life"),request<Gifts>("/api/couple-surprises")]);
   if(!alive.current)return;
   setLife(next);setGifts(box.gifts);
   if(!silent)setError("");
   const incoming=next.hugs.find(h=>h.senderId!==myId&&!h.replyTo);
   if(incoming&&recentHug.current&&recentHug.current!==incoming.id){
    setHugAnimation(true);window.setTimeout(()=>{if(alive.current)setHugAnimation(false)},3400);
   }
   if(incoming)recentHug.current=incoming.id;
  }catch(e){if(alive.current&&!silent)setError(e instanceof Error?e.message:"Impossible de charger cet espace.")}
  finally{inFlight.current=false;if(alive.current)setLoading(false)}
 },[request,myId]);
 useEffect(()=>{
  alive.current=true;void refresh();
  const timer=window.setInterval(()=>void refresh(true),12000);
  const visible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",visible);
  return()=>{alive.current=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[refresh]);
 useEffect(()=>{
  setSection(selectedSection(focusKind));
  if(focusKind!=="couple-hug")return;
  setHugAnimation(true);
  const timer=window.setTimeout(()=>setHugAnimation(false),3400);
  return()=>window.clearTimeout(timer);
 },[focusKind,focusId]);
 useEffect(()=>()=>{if(recorder.current?.state==="recording")recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());releaseRecordingAudio()},[]);
 async function act(action:string,fields:Record<string,unknown>={},message="Enregistré pour vous deux. ❤️"){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const next=await request<Life>("/api/couple-life",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...fields})});
   if(!alive.current)return;
   setLife(next);setNotice(message);
   if(action==="hug_send"||action==="hug_reply"){
    setHugAnimation(true);
    window.setTimeout(()=>{if(alive.current)setHugAnimation(false)},3400);
    if("vibrate" in navigator)navigator.vibrate(70);
   }
   if(action==="dream_add"){setDreamTitle("");setDreamDetail("")}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Action impossible.")}
  finally{if(alive.current)setBusy(false)}
 }
 async function giftAction(path:string,options:RequestInit,message:string){
  if(busy)return false;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await request<Gifts>(path,options);
   if(alive.current){setGifts(result.gifts);setNotice(message)}
   return true;
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Action impossible.");return false}
  finally{if(alive.current)setBusy(false)}
 }
 function sendDate(e:FormEvent){
  e.preventDefault();
  const plannedAt=new Date(dateAt).getTime();
  if(!Number.isFinite(plannedAt)||plannedAt<=Date.now()+60000){setError("Choisis une date future.");return}
  void act("date_invite",{plannedAt,activity},"Invitation envoyée ! 💌");
 }
 function addDream(e:FormEvent){
  e.preventDefault();void act("dream_add",{title:dreamTitle,detail:dreamDetail},"Ce rêve est maintenant dans votre liste ✨");
 }
 function selectMood(key:string){
  void act("mood_set",{mood:key,note:moodNote},"Ton humeur a été partagée avec "+partner+". ❤️");
 }
 function pickPhoto(e:ChangeEvent<HTMLInputElement>){
  setPhoto(e.target.files?.[0]||null);
 }
 function pickAudio(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0]||null;
  if(f?.size&&f.size>7_000_000){setError("Le vocal doit peser moins de 7 Mo.");return}
  setAudio(f);
 }
 async function record(){
  if(recording){if(recorder.current?.state==="recording")recorder.current.stop();return}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Enregistrement indisponible : joins un fichier vocal à la place.");return}
  if(!claimRecordingAudio()){setError("Termine d'abord ton appel ou l'autre enregistrement audio.");return}
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:true});
   stream.current=s;chunks.current=[];
   const types=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg"];
   const mime=types.find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(s,mime?{mimeType:mime}:undefined);
   recorder.current=rec;
   rec.ondataavailable=ev=>{if(ev.data.size)chunks.current.push(ev.data)};
   rec.onstop=()=>{
    const type=rec.mimeType.split(";")[0]||"audio/mp4";
    if(chunks.current.length){
     const blob=new Blob(chunks.current,{type});
     setAudio(new File([blob],"mot-doux."+(type.includes("webm")?"webm":type.includes("ogg")?"ogg":"m4a"),{type}));
    }
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    recorder.current=null;setRecording(false);releaseRecordingAudio();
   };
   rec.start(250);setRecording(true);setAudio(null);setError("");
  }catch{
   stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
   releaseRecordingAudio();setError("Microphone indisponible. Autorise-le ou joins un fichier vocal.");
  }
 }
 async function sendGift(e:FormEvent){
  e.preventDefault();if(busy||recording)return;
  setBusy(true);setError("");setNotice("");
  try{
   const form=new FormData();
   form.append("title",giftTitle.trim());form.append("body",giftBody.trim());
   if(photo)form.append("image",await normalizeImage(photo));
   if(audio)form.append("audio",audio);
   const res=await request<Gifts>("/api/couple-surprises",{method:"POST",body:form});
   if(!alive.current)return;
   setGifts(res.gifts);setGiftTitle("");setGiftBody("");setPhoto(null);setAudio(null);
   setNotice("Coffre préparé ! "+partner+" recevra sa surprise. 🎁");
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{if(alive.current)setBusy(false)}
 }
 const date=life?.date;
 const challengeDone=(key:string,id:string)=>Boolean(life?.completions.some(c=>c.key===key&&c.memberId===id));
 const mineCount=life?.completions.filter(c=>c.memberId===myId).length||0;
 const partnerCount=life?.completions.filter(c=>c.memberId!==myId).length||0;
 const newHug=life?.hugs.find(h=>h.senderId!==myId&&!h.replyTo);
 const replied=Boolean(newHug&&life?.hugs.some(h=>h.senderId===myId&&h.replyTo===newHug.id));
 return <section className="ce-root" aria-label="Nos expériences en couple">
  <header className="ce-top">
   <button type="button" onClick={onExit} className="ce-back" aria-label="Retour à Nous deux">‹ Retour</button>
   <div><span>LOVE RADAR · NOUS DEUX</span><h1>Notre petit univers <em>♥</em></h1></div>
  </header>
  <div className="ce-intro"><span>✦ VOTRE QUOTIDIEN À DEUX</span><p>Six façons de prendre soin de votre histoire, même à distance.</p></div>
  <div className="ce-tabs" role="tablist" aria-label="Activités du couple">
   {SECTIONS.map(item=><button key={item.key} type="button" role="tab" aria-selected={section===item.key} className={section===item.key?"active":""} onClick={()=>{setSection(item.key);setError("");setNotice("")}}><span aria-hidden="true">{item.emoji}</span>{item.title}</button>)}
  </div>
  {error?<div className="ce-alert" role="alert">{error}</div>:null}
  {notice?<div className="ce-success" role="status">{notice}</div>:null}
  {loading?<div className="ce-loading">Ouverture de votre univers…</div>:null}
  {section==="date"?<div className="ce-panel">
   <div className="ce-heading"><span className="ce-hero-emoji">🌙</span><div><span className="ce-label">SOIRÉE EN AMOUREUX</span><h2>Un rendez-vous, même de loin.</h2><p>Choisissez votre activité, invitez votre partenaire et retrouvez-vous dans Love Radar.</p></div></div>
   {date?<div className="ce-feature-card">
    <span className="ce-status">{date.acceptedBy?"💕 Soirée confirmée":"💌 Invitation en attente"}</span>
    <h3>{ACTIVITIES.find(a=>a.key===date.activity)?.name}</h3>
    <p>📅 {formatDate(date.plannedAt)}</p>
    {date.acceptedBy?<div className="ce-actions">
     <button onClick={date.activity==="movie"?onWatch:date.activity==="games"?onGames:onChat}>{date.activity==="movie"?"🎬 Regarder ensemble":date.activity==="games"?"🎲 Jouer ensemble":"💬 Ouvrir la conversation"}</button>
     <small>Le bouton d'appel Love Radar reste disponible pour discuter en vidéo.</small>
    </div>:date.authorId!==myId?<button type="button" className="ce-primary" disabled={busy} onClick={()=>void act("date_accept",{id:date.id},"Soirée acceptée ! 💕")}>❤️ Accepter l'invitation</button>:<p>Ton partenaire doit encore accepter l'invitation.</p>}
    <button className="ce-text-action" type="button" disabled={busy} onClick={()=>void act("date_cancel",{id:date.id},"Invitation retirée.")}>Annuler ce rendez-vous</button>
   </div>:<form className="ce-form" onSubmit={sendDate}>
    <label>Votre rendez-vous<input type="datetime-local" value={dateAt} onChange={e=>setDateAt(e.target.value)} required/></label>
    <span className="ce-form-title">Quelle soirée vous ferait plaisir ?</span>
    <div className="ce-activity-options">{ACTIVITIES.map(a=><button type="button" key={a.key} className={activity===a.key?"picked":""} aria-pressed={activity===a.key} onClick={()=>setActivity(a.key)}><strong>{a.icon} {a.name}</strong><small>{a.desc}</small></button>)}</div>
    <button className="ce-primary" disabled={busy||!partnerName} type="submit">💌 Inviter {partner}</button>
   </form>}
  </div>:null}
  {section==="mood"?<div className="ce-panel">
   <div className="ce-heading"><span className="ce-hero-emoji">🥹</span><div><span className="ce-label">MON HUMEUR AUJOURD'HUI</span><h2>Comment va ton cœur ?</h2><p>Partage ton humeur librement, sans jugement.</p></div></div>
   <div className="ce-moods">{MOODS.map(m=><button type="button" key={m.key} disabled={busy||!partnerName} className={mine?.mood===m.key?"chosen":""} aria-pressed={mine?.mood===m.key} onClick={()=>selectMood(m.key)}><span>{m.icon}</span>{m.label}</button>)}</div>
   <label className="ce-form ce-mood-note">Un petit mot (facultatif)<input value={moodNote} maxLength={180} onChange={e=>setMoodNote(e.target.value)} placeholder="Ce dont j'ai besoin aujourd'hui…"/></label>
   <div className="ce-mood-grid">
    <article><small>MON HUMEUR</small><strong>{mine?MOODS.find(x=>x.key===mine.mood)?.icon+" "+MOODS.find(x=>x.key===mine.mood)?.label:"Pas encore partagée"}</strong>{mine?.note?<p>{mine.note}</p>:null}{mine?<button type="button" disabled={busy} onClick={()=>void act("mood_clear",{},"Humeur masquée pour aujourd'hui.")}>Effacer mon humeur</button>:null}</article>
    <article><small>{partner.toUpperCase()}</small><strong>{theirs?MOODS.find(x=>x.key===theirs.mood)?.icon+" "+MOODS.find(x=>x.key===theirs.mood)?.label:"N'a pas encore partagé"}</strong>{theirs?.note?<p>{theirs.note}</p>:null}{theirs?<button type="button" onClick={onChat}>💌 Envoyer du soutien</button>:null}</article>
   </div>
  </div>:null}
  {section==="dreams"?<div className="ce-panel">
   <div className="ce-heading"><span className="ce-hero-emoji">✨</span><div><span className="ce-label">NOS RÊVES ENSEMBLE</span><h2>De beaux projets à deux.</h2><p>Des idées aux souvenirs : imaginez votre avenir et cochez vos rêves accomplis.</p></div></div>
   <form className="ce-form" onSubmit={addDream}>
    <label>Notre prochain rêve<input value={dreamTitle} maxLength={95} onChange={e=>setDreamTitle(e.target.value)} placeholder="Visiter Paris ensemble…" required/></label>
    <label>Un détail (facultatif)<textarea value={dreamDetail} maxLength={350} rows={2} onChange={e=>setDreamDetail(e.target.value)} placeholder="Pourquoi ce rêve nous tient à cœur…"/></label>
    <button className="ce-primary" type="submit" disabled={busy||!dreamTitle.trim()||!partnerName}>+ Ajouter notre rêve</button>
   </form>
   <div className="ce-dream-progress"><strong>{life?.dreams.filter(d=>d.doneAt).length||0} / {life?.dreams.length||0}</strong> rêves accomplis</div>
   <div className="ce-list">{life?.dreams.length?life.dreams.map(d=><article className={"ce-dream"+(d.doneAt?" done":"")} key={d.id} id={"ce-"+d.id}>
    <button type="button" disabled={busy} className="ce-dream-check" aria-label={d.doneAt?"Marquer à refaire":"Marquer accompli"} onClick={()=>void act("dream_toggle",{id:d.id},"Votre liste de rêves est actualisée.")}>{d.doneAt?"✓":"♡"}</button>
    <div><h3>{d.title}</h3>{d.detail?<p>{d.detail}</p>:null}<small>{d.doneAt?"✨ Accompli le "+new Date(d.doneAt).toLocaleDateString("fr-FR"):"Ajouté par "+(d.authorId===myId?"toi":partner)}</small></div>
    <button type="button" disabled={busy} className="ce-remove" aria-label={"Supprimer "+d.title} onClick={()=>{if(window.confirm("Supprimer ce rêve partagé ?"))void act("dream_delete",{id:d.id},"Rêve supprimé.")}}>×</button>
   </article>):<p className="ce-placeholder">Votre premier rêve vous attend. ✨</p>}</div>
  </div>:null}
  {section==="hugs"?<div className="ce-panel ce-hug-panel">
   <div className="ce-heading"><span className="ce-hero-emoji">🫂</span><div><span className="ce-label">CÂLIN VIRTUEL</span><h2>Un câlin à travers l'écran.</h2><p>Quelques secondes pour se sentir tout près.</p></div></div>
   <div className={"ce-hug-scene"+(hugAnimation?" is-hugging":"")} aria-live="polite" aria-label="Animation de câlin">
    <span className="ce-hug-left">💗</span><span className="ce-hug-core">🫂</span><span className="ce-hug-right">💖</span>
    <span className="ce-floating-heart ce-float-one">♥</span><span className="ce-floating-heart ce-float-two">♥</span><span className="ce-floating-heart ce-float-three">♥</span>
   </div>
   <div className="ce-hug-actions">
    <button className="ce-primary" type="button" disabled={busy||!partnerName} onClick={()=>void act("hug_send",{},"Ton câlin est parti vers "+partner+" ! 🫂")}>🫂 Envoyer un câlin</button>
    {newHug&&!replied?<button type="button" disabled={busy} onClick={()=>void act("hug_reply",{id:newHug.id},"Un câlin retourné avec amour 💗")}>💞 Répondre à son câlin</button>:null}
   </div>
   <h3 className="ce-subtitle">Vos derniers câlins</h3>
   {life?.hugs.length?<div className="ce-hug-feed">{life.hugs.slice(0,12).map(h=><div key={h.id} id={"ce-"+h.id}><span>{h.replyTo?"💞":"🫂"}</span><p><strong>{h.senderId===myId?"Toi":partner}</strong> {h.replyTo?"a rendu un câlin":"a envoyé un câlin"}<small>{formatDate(h.createdAt)}</small></p></div>)}</div>:<p className="ce-placeholder">Envoyez-vous votre premier câlin. 💕</p>}
  </div>:null}
  {section==="challenges"?<div className="ce-panel">
   <div className="ce-heading"><span className="ce-hero-emoji">🏆</span><div><span className="ce-label">DÉFIS DE COUPLE</span><h2>Une petite victoire chaque jour.</h2><p>Les défis se renouvellent chaque lundi. Validez ceux que vous réalisez.</p></div></div>
   <div className="ce-score"><div><strong>{mineCount}/{life?.challenges.length||8}</strong><span>Toi</span></div><span>♥</span><div><strong>{partnerCount}/{life?.challenges.length||8}</strong><span>{partner}</span></div></div>
   <div className="ce-list">{life?.challenges.map(c=><article className="ce-challenge" key={c.key} id={"ce-"+c.key}>
    <span className="ce-challenge-emoji">{c.emoji}</span><div><h3>{c.title}</h3><small>{challengeDone(c.key,myId)?"✓ Tu l'as fait":"À faire"} · {challengeDone(c.key,life?.completions.find(x=>x.memberId!==myId)?.memberId||"")?"✓ Partenaire":"○ Partenaire"}</small></div>
    <button type="button" disabled={busy||!partnerName} aria-pressed={challengeDone(c.key,myId)} onClick={()=>void act("challenge_toggle",{key:c.key},"Défi enregistré pour cette semaine. 🏆")}>{challengeDone(c.key,myId)?"✓ Fait":"J'ai fait !"}</button>
   </article>)}</div>
   <button type="button" className="ce-link-action" onClick={onMoment}>💌 Répondre à notre question du jour</button>
  </div>:null}
  {section==="gifts"?<div className="ce-panel">
   <div className="ce-heading"><span className="ce-hero-emoji">🎁</span><div><span className="ce-label">COFFRE SURPRISE</span><h2>Une surprise rien que pour toi.</h2><p>Un message, une photo et un vocal, réunis dans un cadeau privé.</p></div></div>
   <form className="ce-form" onSubmit={e=>void sendGift(e)}>
    <label>Un titre mystérieux<input maxLength={75} value={giftTitle} onChange={e=>setGiftTitle(e.target.value)} placeholder="Pour toi, mon amour…" required/></label>
    <label>Ton message<textarea maxLength={2500} rows={3} value={giftBody} onChange={e=>setGiftBody(e.target.value)} placeholder="Je voulais te dire…" required/></label>
    <div className="ce-gift-attachments">
     <label>📸 Ajouter une photo<input type="file" accept="image/*" onChange={pickPhoto}/>{photo?<small>✓ {photo.name}</small>:null}</label>
     <label>🎤 Joindre un vocal<input type="file" accept="audio/*" onChange={pickAudio}/>{audio?<small>✓ {audio.name}</small>:null}</label>
    </div>
    <button type="button" className={"ce-record"+(recording?" is-recording":"")} onClick={()=>void record()} disabled={busy}>{recording?"■ Arrêter le vocal":"🎙️ Enregistrer directement un vocal"}</button>
    <button className="ce-primary" type="submit" disabled={busy||recording||giftTitle.trim().length<1||giftBody.trim().length<3||!partnerName}>{busy?"Préparation…":"🎁 Envoyer ma surprise"}</button>
   </form>
   <h3 className="ce-subtitle">Vos coffres</h3>
   <div className="ce-list">{gifts.length?gifts.map(g=>{
    const sender=g.senderId===myId,opened=Boolean(g.openedAt);
    return <article className={"ce-gift"+(!opened&&!sender?" ce-closed":"")} key={g.id} id={"ce-"+g.id}>
     <div className="ce-gift-symbol">{opened?"💝":"🎁"}</div>
     <div className="ce-gift-content"><small>{sender?"De toi, pour "+partner:"De "+partner+", pour toi"} · {formatDate(g.createdAt)}</small>
      <h3>{g.title}</h3>
      {!sender&&!opened?<><p>🔒 Un petit secret t'attend à l'intérieur…</p><button className="ce-primary" type="button" disabled={busy} onClick={()=>void giftAction("/api/couple-surprises",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"open",id:g.id})},"Surprise ouverte ! 💝")}>🎁 Ouvrir ma surprise</button></>:
       <><p className="ce-gift-letter">{g.body}</p>{g.hasImage?<SurpriseAsset token={token} id={g.id} kind="image" privacyEnabled={privacyEnabled} myName={myName}/>:null}{g.hasAudio?<SurpriseAsset token={token} id={g.id} kind="audio" privacyEnabled={privacyEnabled} myName={myName}/>:null}
        {sender&&!opened?<small>🔒 Ton partenaire n'a pas encore ouvert le coffre.</small>:null}</>}
      {sender?<button className="ce-text-action" type="button" disabled={busy} onClick={()=>{if(window.confirm("Supprimer définitivement cette surprise ?"))void giftAction("/api/couple-surprises?id="+encodeURIComponent(g.id),{method:"DELETE"},"Surprise supprimée.")}}>Supprimer ce coffre</button>:null}
     </div>
    </article>;}):<p className="ce-placeholder">Votre première surprise vous attend. 🎁</p>}</div>
  </div>:null}
  {section==="date"?<div className="ce-tips"><strong>💬 Rendez-vous en cours ?</strong><p>L'appel vidéo de Love Radar est disponible sur cette page. Vous pouvez aussi ouvrir le cinéma, puis revenir à votre conversation.</p></div>:null}
  <p className="ce-footer">Votre espace reste réservé à votre couple. Les émotions et les projets partagés sont facultatifs. ❤️</p>
 </section>;
}
