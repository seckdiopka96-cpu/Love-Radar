import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {apiFetch} from "./api";
import {canonicalTikTokVideo,parseTikTokId,isTikTokShortLink,watchTikTokTime,formatTikTokTime,type TikTokSnapshot} from "./tiktok-utils";
import "./tiktok-together.css";

type Message={id:string;sender_id:string;kind:string;content:string|null;created_at:number};
type ApiReply={ok:boolean;error?:string;state?:TikTokSnapshot;serverNow?:number;partnerWatching?:boolean;members?:number;videoId?:string};
type Props={
 token:string;myId:string;myName:string;partnerName:string|null;
 messages:Message[];onSendText:(text:string)=>Promise<void>;
 onOpenChat:()=>void;onOpenYouTube:()=>void;onExit:()=>void
};
type Action="set-video"|"play"|"pause"|"seek";
type PlayerMessage={type:string;value?:unknown;"x-tiktok-player"?:boolean};
const TIKTOK_ORIGIN="https://www.tiktok.com";
const maxPos=(n:number)=>Math.max(0,Math.min(86400,Number.isFinite(n)?n:0));

export default function TikTokTogether({token,myId,myName,partnerName,messages,onSendText,onOpenChat,onOpenYouTube,onExit}:Props){
 const [snapshot,setSnapshot]=useState<TikTokSnapshot|null>(null);
 const [members,setMembers]=useState(1);
 const [partnerWatching,setPartnerWatching]=useState(false);
 const [offset,setOffset]=useState(0);
 const [input,setInput]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [needsTap,setNeedsTap]=useState(false);
 const [playerError,setPlayerError]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [now,setNow]=useState(Date.now());
 const [localPos,setLocalPos]=useState(0);
 const [duration,setDuration]=useState(0);
 const [chatOpen,setChatOpen]=useState(false);
 const [draft,setDraft]=useState("");
 const [sending,setSending]=useState(false);
 const frame=useRef<HTMLIFrameElement|null>(null);
 const snapshotRef=useRef<TikTokSnapshot|null>(null);
 const offsetRef=useRef(0);
 const posRef=useRef(0);
 const readyRef=useRef(false);
 const liveRef=useRef(true);
 const busyRef=useRef(false);
 const suppressRef=useRef(0);
 const lastPlayerEvent=useRef(0);
 const lastApplied=useRef(0);
 const playerPlaying=useRef(false);
 const postRef=useRef<(action:Action,position?:number,videoId?:string)=>Promise<void>>(async()=>{});
 const id=snapshot?.videoId||"";
 const recent=messages.filter(m=>m.kind==="text"&&m.content).slice(-14);
 const command=useCallback((type:"play"|"pause"|"seekTo",value?:number)=>{
  const child=frame.current?.contentWindow;
  if(!child)return;
  child.postMessage({"x-tiktok-player":true,type,...(value===undefined?{}:{value:maxPos(value)})},TIKTOK_ORIGIN);
 },[]);
 const accept=useCallback((data:ApiReply)=>{
  if(!liveRef.current)return;
  if(typeof data.serverNow==="number"){
   const delta=data.serverNow-Date.now();offsetRef.current=delta;setOffset(delta);
  }
  if(typeof data.members==="number")setMembers(data.members);
  if(typeof data.partnerWatching==="boolean")setPartnerWatching(data.partnerWatching);
  if(data.state&&(!snapshotRef.current||data.state.version>=snapshotRef.current.version)){
   if(!snapshotRef.current||data.state.version!==snapshotRef.current.version||data.state.videoId!==snapshotRef.current.videoId){
    snapshotRef.current=data.state;setSnapshot(data.state);
   }
  }
  setLoading(false);
 },[]);
 const refresh=useCallback(async()=>{
  if(document.visibilityState!=="visible")return;
  try{
   const response=await apiFetch("/api/tiktok-together",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as ApiReply;
   if(!data.ok||!response.ok)throw Error(data.error||"Synchronisation TikTok indisponible.");
   accept(data);setError("");
  }catch(e){if(liveRef.current){setLoading(false);setError(e instanceof Error?e.message:"Connexion perdue.");}}
 },[token,accept]);
 const post=useCallback(async(action:Action,position=0,videoId?:string)=>{
  const current=snapshotRef.current;
  if(!current||busyRef.current)return;
  busyRef.current=true;setBusy(true);setError("");
  try{
   const payload=action==="set-video"?{action,videoId,version:current.version}:
    {action,position:maxPos(position),version:current.version};
   const response=await apiFetch("/api/tiktok-together",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify(payload)
   });
   const data=await response.json() as ApiReply;
   if(!data.ok||!response.ok)throw Error(data.error||"Action refusée.");
   accept(data);
   if(action==="set-video"){setInput("");setNotice("💕 Cette vidéo TikTok est partagée avec ton partenaire !");}
   if(action==="play")setNotice("🔔 Ton partenaire sera invité si ses notifications sont activées.");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de synchroniser la vidéo.");void refresh()}
  finally{busyRef.current=false;setBusy(false)}
 },[token,accept,refresh]);
 postRef.current=post;
 useEffect(()=>{
  liveRef.current=true;
  void refresh();
  const poll=window.setInterval(()=>{if(!busyRef.current)void refresh()},1600);
  const heartbeat=async()=>{
   try{
    const response=await apiFetch("/api/tiktok-together",{
     method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
     body:JSON.stringify({action:"heartbeat"})
    });
    const data=await response.json() as ApiReply;
    if(response.ok&&data.ok)accept(data);
   }catch{/* Polling retries. */}
  };
  void heartbeat();
  const beat=window.setInterval(()=>{if(document.visibilityState==="visible")void heartbeat()},6000);
  const visible=()=>{if(document.visibilityState==="visible"){void refresh();void heartbeat()}};
  document.addEventListener("visibilitychange",visible);
  return ()=>{
   liveRef.current=false;window.clearInterval(poll);window.clearInterval(beat);
   document.removeEventListener("visibilitychange",visible);
  };
 },[token,refresh,accept]);
 useEffect(()=>{
  const clock=window.setInterval(()=>setNow(Date.now()),500);
  return ()=>window.clearInterval(clock);
 },[]);
 // Reset player event bindings and timeline when a new TikTok post is shared.
 useEffect(()=>{
  readyRef.current=false;setReady(false);
  setNeedsTap(false);setPlayerError("");setLocalPos(0);setDuration(0);
  posRef.current=0;playerPlaying.current=false;
  lastApplied.current=0;
  suppressRef.current=Date.now()+1900;
 },[id]);
 const apply=useCallback((state:TikTokSnapshot,force=false)=>{
  if(!state.videoId||!readyRef.current)return;
  if(!force&&lastApplied.current===state.version)return;
  lastApplied.current=state.version;
  const expected=watchTikTokTime(state,Date.now()+offsetRef.current);
  suppressRef.current=Date.now()+2600;
  if(Math.abs(posRef.current-expected)>1.8)command("seekTo",expected);
  if(state.playing){
   command("play");setNeedsTap(true);
  }else{
   command("pause");setNeedsTap(false);
  }
 },[command]);
 useEffect(()=>{
  if(snapshot&&ready)apply(snapshot);
 },[snapshot,ready,apply]);
 // Official TikTok embed postMessage events, with strict source + origin checks.
 useEffect(()=>{
  function onMessage(event:MessageEvent){
   if(event.origin!==TIKTOK_ORIGIN||!frame.current||event.source!==frame.current.contentWindow)return;
   const data=event.data as PlayerMessage|null;
   if(!data||typeof data!=="object"||data["x-tiktok-player"]!==true||typeof data.type!=="string")return;
   if(data.type==="onPlayerReady"){
    readyRef.current=true;setReady(true);
    if(snapshotRef.current)apply(snapshotRef.current,true);
    return;
   }
   if(data.type==="onPlayerError"){
    const value=data.value as {errorCode?:number;errorType?:string}|undefined;
    if(value?.errorCode===3002){setNeedsTap(true);return;}
    setPlayerError(value?.errorType==="INVALID_VIDEO"?
     "Vidéo privée, supprimée ou indisponible à l'intégration.":
     "TikTok ne peut pas lire cette vidéo sur cet appareil.");
    return;
   }
   if(data.type==="onCurrentTime"){
    const time=data.value as {currentTime?:number;duration?:number}|undefined;
    if(typeof time?.currentTime==="number"&&Number.isFinite(time.currentTime)){
     posRef.current=maxPos(time.currentTime);setLocalPos(posRef.current);
     if(typeof time.duration==="number"&&time.duration>0)setDuration(time.duration);
     const current=snapshotRef.current;
     if(readyRef.current&&current?.playing&&playerPlaying.current&&Date.now()>suppressRef.current&&
        !busyRef.current&&Date.now()-lastPlayerEvent.current>3200){
      const target=watchTikTokTime(current,Date.now()+offsetRef.current);
      if(Math.abs(target-posRef.current)>5){
       lastPlayerEvent.current=Date.now();
       void postRef.current("seek",posRef.current);
      }
     }
    }
    return;
   }
   if(data.type==="onStateChange"){
    const value=data.value;
    if(typeof value!=="number")return;
    if(value===1){playerPlaying.current=true;setNeedsTap(false)}
    if(value===2||value===0)playerPlaying.current=false;
    if(Date.now()<suppressRef.current||busyRef.current)return;
    const current=snapshotRef.current;
    if(!current?.videoId||Date.now()-lastPlayerEvent.current<700)return;
    if(value===1&&!current.playing){
     lastPlayerEvent.current=Date.now();
     void postRef.current("play",posRef.current);
    }else if((value===2||value===0)&&current.playing){
     lastPlayerEvent.current=Date.now();
     void postRef.current("pause",posRef.current);
    }
   }
  }
  window.addEventListener("message",onMessage);
  return ()=>window.removeEventListener("message",onMessage);
 },[apply]);
 async function selectVideo(event:FormEvent){
  event.preventDefault();
  const value=input.trim();
  let videoId=parseTikTokId(value);
  if(!videoId&&isTikTokShortLink(value)){
   setBusy(true);setError("");
   try{
    const response=await apiFetch("/api/tiktok-together",{
     method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
     body:JSON.stringify({action:"resolve",url:value})
    });
    const data=await response.json() as ApiReply;
    if(!response.ok||!data.ok||!data.videoId)throw Error(data.error||"Impossible de résoudre ce lien TikTok.");
    videoId=data.videoId;
   }catch(e){setError(e instanceof Error?e.message:"Lien TikTok court non reconnu.");return}
   finally{setBusy(false)}
  }
  if(!videoId){setError("Copie le lien d'une vidéo TikTok publique, pas le lien d'un profil.");return}
  if(videoId===snapshotRef.current?.videoId){setNotice("Cette vidéo est déjà partagée.");return}
  await post("set-video",0,videoId);
 }
 function play(){
  const current=snapshotRef.current;
  if(!current?.videoId)return;
  suppressRef.current=Date.now()+1800;
  const resumeAt=watchTikTokTime(current,Date.now()+offsetRef.current);
  posRef.current=resumeAt;setLocalPos(resumeAt);
  command("seekTo",resumeAt);
  command("play");setNeedsTap(false);setPlayerError("");
  if(!current.playing)void post("play",resumeAt);
 }
 function pause(){
  const current=snapshotRef.current;
  if(!current?.videoId)return;
  suppressRef.current=Date.now()+1800;command("pause");
  void post("pause",posRef.current);
 }
 function seek(seconds:number){
  if(!snapshotRef.current?.videoId)return;
  const target=maxPos(seconds);
  suppressRef.current=Date.now()+1900;
  posRef.current=target;setLocalPos(target);
  command("seekTo",target);void post("seek",target);
 }
 async function sendMessage(event:FormEvent){
  event.preventDefault();if(!draft.trim()||sending||!partnerName)return;
  const text=draft.trim();setDraft("");setSending(true);
  try{await onSendText(text)}
  catch(e){setDraft(text);setError(e instanceof Error?e.message:"Message non envoyé.")}
  finally{setSending(false)}
 }
 const syncTime=snapshot?watchTikTokTime(snapshot,now+offset):0;
 const shownTime=ready?localPos:syncTime;
 const directLink=id?"https://www.tiktok.com/player/v1/"+id:"";
 return <section className={"tk-page"+(id?" tk-has-video":" tk-no-video")} aria-label="Regarder TikTok ensemble">
  <header className="tk-header">
   <button type="button" className="tk-back" onClick={onExit}>‹ Ensemble</button>
   <div className="tk-title"><strong>TikTok <span>♥</span> à deux</strong><small>LOVE RADAR · REGARDER ENSEMBLE</small></div>
   <div className="tk-header-actions">
    <div id="lr-voice-button-slot" aria-label="Appel vocal"/>
    <button type="button" aria-label="Ouvrir la conversation" onClick={onOpenChat}>✉</button>
   </div>
  </header>
  <div className="tk-providers" role="group" aria-label="Choisir une plateforme">
   <button type="button" onClick={onOpenYouTube}>▶ YouTube</button>
   <button type="button" className="active" aria-current="page">♪ TikTok</button>
  </div>
  <div className="tk-presence" role="status" aria-live="polite">
   <span className={"tk-presence-dot"+(partnerWatching?" online":"")}/>
   <strong>{members<2?"En attendant ton partenaire…":partnerWatching?(partnerName||"Ton partenaire")+" regarde avec toi ❤️":(partnerName||"Ton partenaire")+" peut te rejoindre."}</strong>
   <small>DUO PRIVÉ</small>
  </div>
  <div className="tk-body">
   <div className={"tk-video-area"+(id?" has-video":" is-empty")}>
    <div className="tk-video-container">
     {id?<iframe ref={frame} className="tk-video-embed" key={id}
      src={canonicalTikTokVideo(id)}
      title="Vidéo TikTok partagée"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen loading="eager" referrerPolicy="strict-origin-when-cross-origin"/>:
      <div className="tk-video-empty">
       <span>♪</span><strong>Vos TikToks, ensemble !</strong>
       <p>Partage une vidéo TikTok : vous la regarderez en même temps, chacun sur son téléphone.</p>
      </div>}
    </div>
    {id?<div className="tk-controls">
     <div className="tk-control-caption"><strong>{snapshot?.playing?"▶ Lecture partagée":"⏸ En pause pour vous deux"}</strong><span>{snapshot?.updatedBy?"Par "+snapshot.updatedBy:"Synchronisation"}</span></div>
     {needsTap&&ready&&snapshot?.playing?<button type="button" className="tk-unblock" onClick={play}>▶ Activer la vidéo sur mon téléphone</button>:null}
     <div className="tk-playback">
      <button type="button" onClick={()=>seek(Math.max(0,syncTime-10))} disabled={busy||!ready} aria-label="Reculer de dix secondes">↶ 10s</button>
      <button type="button" className="tk-primary-play" onClick={snapshot?.playing?pause:play}
       disabled={busy||!ready||Boolean(playerError)}>{snapshot?.playing?"⏸ Pause pour les deux":"▶ Lire ensemble"}</button>
      <button type="button" onClick={()=>seek(syncTime+10)} disabled={busy||!ready} aria-label="Avancer de dix secondes">10s ↷</button>
     </div>
     <div className="tk-timebar"><span>{formatTikTokTime(shownTime)}</span>
      <input type="range" min={0} max={Math.max(1,Math.ceil(duration||syncTime+20))}
       value={Math.min(Math.max(1,Math.ceil(duration||syncTime+20)),shownTime)}
       onChange={event=>setLocalPos(Number(event.target.value))}
       onPointerUp={event=>seek(Number(event.currentTarget.value))}
       onKeyUp={event=>{if(event.key==="Enter"||event.key==="ArrowLeft"||event.key==="ArrowRight")seek(Number(event.currentTarget.value))}}
       disabled={!ready||busy} aria-label="Déplacer la vidéo pour vous deux"/>
      <span>{duration?formatTikTokTime(duration):"—:—"}</span>
     </div>
     {playerError?<div className="tk-player-error" role="alert">{playerError} <a href={directLink} target="_blank" rel="noopener noreferrer">Voir sur TikTok</a></div>:null}
     {!ready&&!playerError?<p className="tk-loading">Le lecteur TikTok démarre… Si nécessaire, touche la vidéo pour l'activer.</p>:null}
     <a className="tk-open-tiktok" href={directLink} target="_blank" rel="noopener noreferrer">Ouvrir sur TikTok ↗</a>
    </div>:null}
   </div>
   <form className="tk-share" onSubmit={event=>void selectVideo(event)}>
    <label htmlFor="tk-shared-link">🎬 Choisir le TikTok suivant</label>
    <div><input id="tk-shared-link" type="text" inputMode="url" autoComplete="off"
     placeholder="Colle le lien TikTok partagé" value={input} onChange={event=>setInput(event.target.value)} maxLength={400}/>
     <button type="submit" disabled={!input.trim()||busy||loading}>{busy?"…":"Partager"}</button></div>
    <small>Fonctionne avec les vidéos publiques, les liens tiktok.com et les liens courts vm.tiktok.com / vt.tiktok.com lorsque TikTok permet de les résoudre.</small>
   </form>
   <section className={"tk-chat"+(chatOpen?" open":"")} aria-label="Conversation pendant TikTok">
    <div className="tk-chat-head">
     <div><strong>💬 Réagir ensemble</strong><small>{partnerName?"Avec "+partnerName:"Votre conversation privée"}</small></div>
     <button type="button" onClick={()=>setChatOpen(!chatOpen)} aria-expanded={chatOpen}>{chatOpen?"Réduire −":"Messages +"}</button>
    </div>
    {chatOpen?<><div className="tk-chat-list" role="log">
     {recent.length?recent.map(message=><div key={message.id} className={"tk-bubble"+(message.sender_id===myId?" mine":"")}>
      <strong>{message.sender_id===myId?myName:partnerName||"Mon amour"}</strong><p>{message.content}</p>
     </div>):<p className="tk-chat-empty">Envoyez vos réactions ❤️ 😂 😮</p>}
    </div>
    <form className="tk-chat-send" onSubmit={event=>void sendMessage(event)}>
     <input type="text" value={draft} onChange={event=>setDraft(event.target.value)}
      disabled={!partnerName||sending} placeholder="Réagis à la vidéo… ❤️" maxLength={1600}/>
     <button type="submit" disabled={!draft.trim()||sending||!partnerName} aria-label="Envoyer le message">➤</button>
    </form></>:null}
   </section>
  </div>
  {error?<div className="tk-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Fermer">✕</button></div>:null}
  {notice?<div className="tk-notice" role="status">{notice}<button type="button" onClick={()=>setNotice("")} aria-label="Fermer">✕</button></div>:null}
  <p className="tk-footnote">Vidéos publiques uniquement · Un appui peut être nécessaire sur iPhone.</p>
 </section>;
}
