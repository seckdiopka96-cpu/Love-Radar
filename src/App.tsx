import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import "./love-radar.css";

type AndroidInstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type Tab = "home" | "radar" | "chat" | "memories";
type Challenge = {kind:"daily"|"radar";key:string;prompt:string;options:string[];myChoice:number|null;partnerChoice:number|null;complete:boolean};
type Message = {id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;object_key:string|null;mime:string|null;created_at:number};
type Room = {user:{id:string;name:string;seat:number;owner:boolean};code:string;roomId:string;partner:string|null;members:number;challenges:Challenge[];messages:Message[];round:number};
type Result = {ok:boolean;error?:string;token?:string;code?:string}&Partial<Room>;


const NAV: {id:Tab;label:string;icon:string}[] = [
 {id:"home",label:"Accueil",icon:"♡"},
 {id:"radar",label:"Radar",icon:"◎"},
 {id:"chat",label:"Messages",icon:"✉"},
 {id:"memories",label:"Souvenirs",icon:"✦"},
];
const HEARTS = ["♡","♥","✦","♡","♥"];
function Initials({name,size="normal"}:{name:string;size?:"normal"|"small"}) {
 return <div className={"lr-avatar "+(size==="small"?"lr-avatar-sm":"")}>{name.trim().slice(0,1).toUpperCase()||"♡"}</div>;
}
function ChallengeCard({q,partner,onAnswer,busy,onNext}:{q:Challenge;partner:string|null;onAnswer:(q:Challenge,choice:number)=>void;busy:boolean;onNext?:()=>void}) {
 const reveal=q.complete&&q.myChoice!==null&&q.partnerChoice!==null;
 const same=reveal&&q.myChoice===q.partnerChoice;
 return <div className="lr-challenge">
  <div className="lr-challenge-top"><span className="lr-chip">{q.kind==="daily"?"✧ LA QUESTION DU JOUR":"◎ RADAR DE BLUFF"}</span><span className="lr-mini-star">✷</span></div>
  <h2>{q.prompt}</h2>
  <p className="lr-challenge-desc">{q.kind==="daily"?"Deux cœurs, une question. Découvrons vos réponses.":"Un petit jeu pour rire, discuter et mieux se connaître."}</p>
  <div className="lr-choices">
   {q.options.map((option,index)=><button key={index} type="button" className={"lr-choice "+(q.myChoice===index?"is-selected":"")} onClick={()=>onAnswer(q,index)} disabled={busy||q.myChoice!==null}>
    <span className="lr-choice-dot">{String.fromCharCode(65+index)}</span><span>{option}</span><span>{q.myChoice===index?"♥":""}</span>
   </button>)}
  </div>
  {q.myChoice!==null&&!reveal?<div className="lr-reveal-wait"><span>🔒</span><div><strong>Ta réponse est enregistrée !</strong><p>{partner?"La réponse de "+partner+" reste secrète jusqu’à ce que vous ayez répondu tous les deux.":"Invite ton partenaire pour découvrir sa réponse."}</p></div></div>:null}
  {reveal?<div className="lr-reveal"><div className="lr-reveal-icon">{same?"💞":"🚨"}</div><h3>{same?"Connexion parfaite !":"ALERTE BLUFF ! 😂"}</h3><p>{same?"Vous avez choisi la même réponse !": "Vos réponses sont différentes. Ça mérite une petite discussion, pas une enquête ! 👀"}</p><div className="lr-compare"><div><small>TOI</small><strong>{q.options[q.myChoice!]}</strong></div><div><small>{partner||"L'AUTRE"}</small><strong>{q.options[q.partnerChoice!]}</strong></div></div></div>:null}
  {reveal&&onNext?<button type="button" className="lr-next" onClick={onNext} disabled={busy}>Nouvelle question Radar <span>→</span></button>:null}
  <p className="lr-fine-print">Pour s’amuser ensemble : un quiz ne permet jamais de déterminer si quelqu’un est fidèle ou non.</p>
 </div>;
}

export default function LoveRadar(){
 const [token,setToken]=useState("");
 const [room,setRoom]=useState<Room|null>(null);
 const [initializing,setInitializing]=useState(true);
 const [joinMode,setJoinMode]=useState(false);
 const [name,setName]=useState("");
 const [code,setCode]=useState("");
 const [tab,setTab]=useState<Tab>("home");
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [media,setMedia]=useState<Record<string,string>>({});
 const [recording,setRecording]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null);
 const recordingStream=useRef<MediaStream|null>(null);
 const recordingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const mediaCache=useRef<Record<string,string>>({});
 const tail=useRef<HTMLDivElement|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const firstPoll=useRef(true);
 const [menu,setMenu]=useState(false);
 const [canInstall,setCanInstall]=useState(false);
 const [showInstallHelp,setShowInstallHelp]=useState(false);
 const pendingInstall=useRef<AndroidInstallEvent|null>(null);
 useEffect(()=>{
  const standalone=window.matchMedia("(display-mode: standalone)").matches;
  const isAndroid=/Android/i.test(navigator.userAgent);
  if(isAndroid&&!standalone)setCanInstall(true);
  const onPrompt=(event:Event)=>{
   event.preventDefault();
   pendingInstall.current=event as AndroidInstallEvent;
   setCanInstall(true);
  };
  const onInstalled=()=>{
   pendingInstall.current=null;
   setShowInstallHelp(false);
   setCanInstall(false);
  };
  window.addEventListener("beforeinstallprompt",onPrompt);
  window.addEventListener("appinstalled",onInstalled);
  return()=>{
   window.removeEventListener("beforeinstallprompt",onPrompt);
   window.removeEventListener("appinstalled",onInstalled);
  };
 },[]);
 async function installAndroid(){
  const event=pendingInstall.current;
  if(event){
   try{
    await event.prompt();
    const result=await event.userChoice;
    pendingInstall.current=null;
    if(result.outcome==="accepted"){setCanInstall(false);setNotice("Installation de Love Radar lancée ❤️")}
    else setShowInstallHelp(true);
   }catch{setShowInstallHelp(true)}
  }else setShowInstallHelp(true);
 }

 const request=useCallback(async(action:string,body:Record<string,unknown>={},authToken?:string):Promise<Result>=>{
  const t=authToken??token;
  const res=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json",...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...body})});
  const data=await res.json() as Result;
  if(!data.ok)throw new Error(data.error||"Une erreur est survenue.");
  return data;
 },[token]);
 const refresh=useCallback(async(key?:string)=>{
  const t=key||token;
  if(!t)return;
  try{
   const res=await fetch("/api/love",{headers:{Authorization:"Bearer "+t},cache:"no-store"});
   if(res.status===401){
    localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setError("Ton accès a expiré. Rejoins un espace.");return;
   }
   const data=await res.json() as Result;
   if(!data.ok)throw new Error(data.error||"Actualisation impossible.");
   setRoom(data as unknown as Room);
  }catch(e){setError(e instanceof Error?e.message:"Connexion impossible.")}
 },[token]);
 useEffect(()=>{
  const saved=localStorage.getItem("love-radar-token")||"";
  const q=new URLSearchParams(window.location.search);
  if(q.get("join")){setJoinMode(true);setCode(q.get("join")?.toUpperCase()||"")}
  if(saved){setToken(saved);void refresh(saved).finally(()=>setInitializing(false));}else setInitializing(false);
 },[]);
 useEffect(()=>{
  if(!token)return;
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void refresh()},4500);
  const onFocus=()=>{void refresh()};
  window.addEventListener("focus",onFocus);
  return()=>{clearInterval(interval);window.removeEventListener("focus",onFocus)};
 },[token,refresh]);
 useEffect(()=>{
  if(!room||!token)return;
  const candidates=room.messages.filter(m=>m.object_key&&!mediaCache.current[m.id]);
  for(const item of candidates){
   mediaCache.current[item.id]="pending";
   void fetch("/api/media?id="+encodeURIComponent(item.object_key!),{headers:{Authorization:"Bearer "+token}})
    .then(r=>{if(!r.ok)throw new Error("media inaccessible");return r.blob()})
    .then(blob=>{const url=URL.createObjectURL(blob);mediaCache.current[item.id]=url;setMedia(prev=>({...prev,[item.id]:url}))})
    .catch(()=>{delete mediaCache.current[item.id]});
  }
 },[room?.messages,token]);
 useEffect(()=>()=>{for(const url of Object.values(mediaCache.current)){if(url.startsWith("blob:"))URL.revokeObjectURL(url)}},[]);
 useEffect(()=>{
  if(tab==="chat"&&room?.messages?.length&&firstPoll.current){tail.current?.scrollIntoView({behavior:"instant" as ScrollBehavior});firstPoll.current=false}
 },[room?.messages,tab]);

 async function startRoom(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  try{
   const result=await request(joinMode?"join":"create",{name:name.trim(),...(joinMode?{code:code.trim().toUpperCase()}:{})},"");
   const newToken=result.token!;
   localStorage.setItem("love-radar-token",newToken);
   setToken(newToken);
   await refresh(newToken);
   setNotice(joinMode?"Bienvenue dans votre espace ❤️":"Ton espace privé est créé !");
   setTab("home");
  }catch(e){setError(e instanceof Error?e.message:"Connexion impossible.")}
  finally{setBusy(false)}
 }
 async function submitAnswer(q:Challenge,choice:number){
  if(q.myChoice!==null)return;setBusy(true);setError("");
  try{await request("answer",{kind:q.kind,choice});await refresh()}
  catch(e){setError(e instanceof Error?e.message:"Erreur de réponse.")}
  finally{setBusy(false)}
 }
 async function nextRadar(){
  setBusy(true);setError("");
  try{await request("next");await refresh()}
  catch(e){setError(e instanceof Error?e.message:"Impossible d’avancer.")}
  finally{setBusy(false)}
 }
 async function sendMessage(e:FormEvent){
  e.preventDefault();if(!draft.trim()||busy||!room?.partner)return;
  const original=draft;setDraft("");setBusy(true);setError("");
  try{await request("message",{text:original});await refresh();setTimeout(()=>tail.current?.scrollIntoView({behavior:"smooth"}),100)}
  catch(e){setDraft(original);setError(e instanceof Error?e.message:"Échec de l’envoi.")}
  finally{setBusy(false)}
 }
 async function upload(file:File,kind:"image"|"audio"){
  if(!token||!room?.partner){setError("Ton partenaire doit d’abord rejoindre l’espace.");return}
  const limit=kind==="image"?6_000_000:5_000_000;
  if(file.size>limit){setError("Fichier trop lourd : "+(kind==="image"?"6 Mo":"5 Mo")+" maximum.");return}
  setBusy(true);setError("");
  try{
   const form=new FormData();form.append("file",file);form.append("kind",kind);
   const res=await fetch("/api/media",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});
   const data=await res.json() as {ok:boolean;error?:string};
   if(!data.ok)throw new Error(data.error||"Envoi impossible.");
   await refresh();
   setTimeout(()=>tail.current?.scrollIntoView({behavior:"smooth"}),120);
  }catch(e){setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{setBusy(false)}
 }
 async function onImageChange(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";
  if(file)await upload(file,"image");
 }
 async function toggleRecording(){
  if(recording&&recorder.current){recorder.current.stop();setRecording(false);return}
  if(busy||!room?.partner)return;
  if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Enregistrement vocal indisponible sur ce navigateur.");return}
  setError("");
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   recordingStream.current=stream;
   const mime=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg"].find(type=>MediaRecorder.isTypeSupported(type));
   const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   const chunks:Blob[]=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   rec.onerror=()=>setError("Enregistrement interrompu.");
   rec.onstop=()=>{
    if(recordingTimer.current)clearTimeout(recordingTimer.current);
    stream.getTracks().forEach(t=>t.stop());recordingStream.current=null;setRecording(false);
    const type=rec.mimeType?.split(";")[0]||"audio/mp4";
    const ext=type.includes("webm")?"webm":type.includes("ogg")?"ogg":"m4a";
    const blob=new Blob(chunks,{type});
    if(blob.size>0){void upload(new File([blob],"vocal."+ext,{type}),"audio")}
   };
   rec.start(1000);recorder.current=rec;setRecording(true);
   recordingTimer.current=setTimeout(()=>{if(rec.state==="recording")rec.stop()},45000);
  }catch{setError("Microphone refusé ou non disponible. Autorise le micro dans Safari.")}
 }
 async function shareCode(){
  const url=new URL(window.location.href);url.search="?join="+room?.code;
  const text="Rejoins-moi sur Love Radar ❤️\n"+url.href+"\nCode : "+room?.code;
  try{if(navigator.share)await navigator.share({title:"Love Radar ❤️",text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);setNotice("Invitation copiée !")}else setNotice(text)}
  catch{setNotice("Utilise le code : "+room?.code)}
 }
 async function deleteRoom(){
  if(!window.confirm("Supprimer définitivement votre espace, toutes les conversations, photos, vocaux et réponses ? Cette action est irréversible."))return;
  setBusy(true);
  try{await request("delete");localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setTab("home");setNotice("Espace supprimé.")}
  catch(e){setError(e instanceof Error?e.message:"Suppression impossible.")}
  finally{setBusy(false);setMenu(false)}
 }
 function logout(){localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setMenu(false);setNotice("Tu t’es déconnecté(e).")}
 const daily=room?.challenges.find(c=>c.kind==="daily");
 const radar=room?.challenges.find(c=>c.kind==="radar");
 const partner=room?.partner||"Ton amour";
 const images=room?.messages.filter(m=>m.kind==="image")||[];
 return <div className="lr-app">
  <div className="lr-bg-decor lr-bg-1" aria-hidden="true">♡</div><div className="lr-bg-decor lr-bg-2" aria-hidden="true">✧</div>
  <header className="lr-header"><div className="lr-brand"><span className="lr-brand-mark">♥</span><div><b>love<span>radar</span></b><small>BY DIAO-TECH.COM</small></div></div>
   <div className="lr-header-end">{canInstall?<button type="button" className="lr-install-btn" onClick={installAndroid}>↓ Installer</button>:null}{room?<><span className="lr-top-status"><i/> {room.partner?"À deux, c’est mieux":"Invitation en attente"}</span><button className="lr-header-avatar" aria-label="Options de mon espace" onClick={()=>setMenu(!menu)}>{room.user.name[0]?.toUpperCase()}</button>{menu?<div className="lr-menu"><b>{room.user.name}</b><span>Espace privé · {room.code}</span><button onClick={logout}>Se déconnecter</button>{room.user.owner?<button className="lr-danger" onClick={deleteRoom}>Supprimer l’espace</button>:null}</div>:null}</>:<span className="lr-badge-free">100% gratuit</span>}</div>
  </header>
  {showInstallHelp?<div className="lr-install-backdrop" onClick={()=>setShowInstallHelp(false)}><div className="lr-install-modal" role="dialog" aria-modal="true" aria-labelledby="lr-install-title" onClick={e=>e.stopPropagation()}><div className="lr-install-symbol">♥</div><h2 id="lr-install-title">Love Radar sur ton Android</h2><p>Installe l’application directement depuis <strong>Google Chrome</strong>, sans Play Store.</p><ol><li>Ouvre ce site dans Chrome sur ton téléphone Android.</li><li>Appuie sur le menu <strong>⋮</strong> en haut à droite.</li><li>Choisis <strong>Installer l’application</strong> (ou « Ajouter à l’écran d’accueil »), puis confirme.</li></ol><p className="lr-install-note">L’icône Love Radar apparaîtra parmi tes applications. Une connexion Internet est nécessaire pour jouer et échanger des messages.</p><button onClick={()=>setShowInstallHelp(false)}>J’ai compris ❤️</button></div></div>:null}
  {notice?<div className="lr-toast" onClick={()=>setNotice("")}>{notice} <span>×</span></div>:null}
  {error?<div className="lr-error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fermer">×</button></div>:null}
  {initializing?<main className="lr-loading">Un petit moment de magie… 💕</main>:!room?
   <main className="lr-auth"><div className="lr-auth-story">
    <span className="lr-eyebrow">LE JEU QUI RAPPROCHE</span>
    <h1>Et si l’amour<br/>avait son <em>radar ?</em></h1>
    <p>Des questions qui font sourire, des réponses qui surprennent, et un espace rien qu’à vous deux.</p>
    <div className="lr-story-chips"><span>💬 Parlez librement</span><span>👀 Déjouez les bluffs</span><span>💞 Restez complices</span></div>
    <div className="lr-story-scene"><div className="lr-scene-heart">♥</div><div className="lr-float-note lr-note-one">« Tu me connais si bien ! » 💌</div><div className="lr-float-note lr-note-two">🚨 ALERTE BLUFF 😂</div><div className="lr-scene-orbit">✦</div></div>
   </div>
   <div className="lr-auth-panel"><div className="lr-panel-head"><span>♡ VOTRE HISTOIRE COMMENCE ICI</span><h2>{joinMode?"Rejoins ton amour.":"Créez votre bulle."}</h2><p>{joinMode?"Entre le code privé envoyé par ton partenaire.":"Invitez votre moitié avec un code unique, puis jouez ensemble où que vous soyez."}</p></div>
    <div className="lr-auth-switch"><button className={!joinMode?"active":""} onClick={()=>setJoinMode(false)}>Créer mon espace</button><button className={joinMode?"active":""} onClick={()=>setJoinMode(true)}>J’ai un code</button></div>
    <form onSubmit={startRoom} className="lr-auth-form"><label htmlFor="lr-name">Ton prénom</label><input id="lr-name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={30} placeholder="Comment doit-on t’appeler ?" required/>
     {joinMode?<><label htmlFor="lr-code">Code d’invitation</label><input id="lr-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={14} placeholder="EX : AB23CD45EF" required autoCapitalize="characters"/></>:null}
     <button type="submit" disabled={busy}>{busy?"Connexion…":joinMode?"Rejoindre mon partenaire →":"Créer notre espace →"}</button>
    </form>
    <div className="lr-safe-copy">🔒 Un espace privé accessible uniquement avec une invitation. Pas d’appel, pas de géolocalisation, pas d’espionnage.</div>
   </div>
  </main>:
  <div className="lr-shell">
   <aside className="lr-sidebar"><div className="lr-sidebar-top"><span className="lr-side-label">VOTRE PETIT UNIVERS</span><div className="lr-couple"><Initials name={room.user.name}/><span className="lr-couple-mid">♥</span><Initials name={partner}/></div><h2>{room.user.name}<span> &amp; </span>{partner}</h2><p>{room.partner?"La belle aventure continue…":"En attente de ta moitié."}</p></div>
    <div className="lr-side-nav">{NAV.map(n=><button key={n.id} className={tab===n.id?"active":""} onClick={()=>{setTab(n.id);firstPoll.current=true}}><span>{n.icon}</span>{n.label}{n.id==="chat"&&room.messages.length>0?<small>{room.messages.length}</small>:null}</button>)}</div>
    <div className="lr-sidebar-bottom"><div className="lr-side-heart">♡</div>Chaque jour, une nouvelle occasion de se découvrir.</div>
   </aside>
   <main className="lr-main">
    {tab==="home"?<><div className="lr-hello"><span className="lr-eyebrow">VOTRE BULLE D'AMOUR</span><h1>Bonjour, {room.user.name} <span>♥</span></h1><p>Un petit moment à deux, même à des kilomètres.</p></div>
      {!room.partner?<div className="lr-invite"><div className="lr-invite-left"><span className="lr-invite-emoji">💌</span><div><h3>Il manque juste ton amour !</h3><p>Partage ce code pour ouvrir votre espace à deux.</p></div></div><div className="lr-code">{room.code}</div><button onClick={shareCode} className="lr-invite-button">Partager l’invitation ↗</button></div>:<div className="lr-connected"><span>💞</span><div><b>Vous êtes connectés !</b><p>Vos échanges restent dans votre espace privé.</p></div><button onClick={()=>setTab("chat")}>Écrire à {partner} →</button></div>}
      <div className="lr-dash-grid"><div className="lr-dash-main">{daily?<ChallengeCard q={daily} partner={room.partner} onAnswer={submitAnswer} busy={busy}/>:null}</div><div className="lr-dash-side">
      <button className="lr-feature-card lr-feature-radar" onClick={()=>setTab("radar")}><span>◎ MODE JEU</span><h3>Fidèle<br/>ou Bluff ?</h3><p>Des questions qui ne laissent personne indifférent… 👀</p><b>Activer le radar ↗</b><i>♥</i></button>
      <button className="lr-feature-card lr-feature-chat" onClick={()=>setTab("chat")}><span>✉ VOTRE CONVERSATION</span><h3>Un petit mot<br/>d’amour ?</h3><p>Texte, photos et messages vocaux, juste entre vous.</p><b>Ouvrir les messages ↗</b></button>
      </div></div>
      <div className="lr-footnote">✧ Créé avec amour par <a href="https://diao-tech.com" target="_blank" rel="noopener noreferrer">Diao-Tech.com</a></div>
     </>:null}
    {tab==="radar"?<><div className="lr-section-head"><span className="lr-eyebrow">◎ LE DÉTECTEUR DE BLUFF</span><h1>Osez répondre. <em>👀</em></h1><p>Une question, deux réponses, et parfois un grand fou rire.</p></div><div className="lr-radar-layout">{radar?<ChallengeCard q={radar} partner={room.partner} onAnswer={submitAnswer} busy={busy} onNext={nextRadar}/>:null}<div className="lr-radar-info"><span className="lr-radar-glass">◎</span><h3>Comment on joue ?</h3><p>Chacun répond secrètement. Quand vous avez terminé tous les deux, les réponses sont révélées.</p><p>Un désaccord ? Ça lance une conversation, pas une accusation.</p><div className="lr-radar-step">QUESTION {room.round+1}</div></div></div></>:null}
    {tab==="chat"?<div className="lr-chat"><div className="lr-chat-head"><div className="lr-chat-partner"><Initials name={partner} size="small"/><div><h2>{partner}</h2><span>{room.partner?"Votre espace privé ❤️":"En attente de connexion…"}</span></div></div><span className="lr-no-calls">✦ Messages uniquement</span></div>
     <div className="lr-chat-messages">{room.messages.length===0?<div className="lr-chat-empty"><span>💌</span><h3>Votre première conversation</h3><p>Envoyez un message pour commencer votre histoire ici.</p></div>:room.messages.map((m,idx)=>{const mine=m.sender_id===room.user.id;const stamp=new Date(m.created_at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});return <div key={m.id} className={"lr-bubble-row "+(mine?"mine":"other")}><div className="lr-bubble">{m.kind==="text"?<p>{m.content}</p>:m.kind==="image"?media[m.id]?<img className="lr-chat-image" src={media[m.id]} alt={"Photo envoyée "+(mine?"par toi":"par "+partner)} />:<div className="lr-media-loading">Chargement de la photo…</div>:media[m.id]?<div className="lr-voice"><span>🎙️ Vocal</span><audio controls preload="metadata" src={media[m.id]}/></div>:<div className="lr-media-loading">Chargement du vocal…</div>}<small>{stamp} {mine?"♡":""}</small></div></div>})}<div ref={tail}/></div>
     <div className="lr-chat-compose">{recording?<div className="lr-recording"><span className="lr-record-dot"/> Enregistrement… touche « Arrêter » pour envoyer.</div>:null}
      <form className="lr-chat-form" onSubmit={sendMessage}><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onImageChange}/><button type="button" title="Envoyer une photo" aria-label="Envoyer une photo" onClick={()=>fileInput.current?.click()} disabled={!room.partner||busy}>＋</button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={room.partner?"Écris un joli message…":"En attente de ton partenaire…"} disabled={!room.partner||busy} maxLength={1600}/><button className={"lr-mic "+(recording?"recording":"")} type="button" title={recording?"Arrêter le vocal":"Enregistrer un vocal"} onClick={toggleRecording} disabled={!room.partner||busy}>{recording?"■":"♫"}</button><button className="lr-send" type="submit" disabled={!room.partner||!draft.trim()||busy}>➤</button></form>
      <p className="lr-chat-caption">🔒 Texte, images et vocaux privés. Pas de chiffrement de bout en bout. Photos 6 Mo max, vocaux 45 s max.</p></div>
    </div>:null}
    {tab==="memories"?<><div className="lr-section-head"><span className="lr-eyebrow">✦ VOTRE ALBUM</span><h1>Nos petits souvenirs <em>♥</em></h1><p>Retrouvez les photos partagées dans votre conversation.</p></div><div className="lr-memories-grid">{images.length===0?<div className="lr-memories-empty"><span>📸</span><h3>Votre album commence ici</h3><p>Partage une photo dans les messages pour la retrouver ici.</p><button onClick={()=>setTab("chat")}>Ouvrir la conversation →</button></div>:images.map(m=><div className="lr-memory" key={m.id}>{media[m.id]?<img src={media[m.id]} alt="Souvenir du couple"/>:<div>Photo en chargement…</div>}<span>{new Date(m.created_at).toLocaleDateString("fr-FR")}</span></div>)}</div></>:null}
   </main>
   <nav className="lr-mobile-nav" aria-label="Navigation du couple">{NAV.map(n=><button key={n.id} className={tab===n.id?"active":""} onClick={()=>{setTab(n.id);firstPoll.current=true}}><span>{n.icon}</span><small>{n.label}</small></button>)}</nav>
  </div>}
 </div>;
}
