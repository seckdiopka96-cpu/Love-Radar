import {useCallback,useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from "react";
import {apiFetch} from "./api";
import {formatWatchTime,parseYouTubeId,expectedPlaybackSeconds,type WatchSnapshot} from "./watch-utils";
import {mountYouTubePlayer,type YouTubePlayer} from "./youtube-player";
import "./watch-together.css";

type TextMessage={id:string;sender_id:string;kind:string;content:string|null;created_at:number};
type ResponseState={ok:boolean;error?:string;state?:WatchSnapshot;serverNow?:number;members?:number;partnerWatching?:boolean};
type Props={
 token:string;myId:string;myName:string;partnerName:string|null;
 messages:TextMessage[];onSendText:(text:string)=>Promise<void>;
 onOpenChat:()=>void;onExit:()=>void
};
type WatchAction="set-video"|"play"|"pause"|"seek";
const MAX_DURATION=86400;
const safeCurrent=(p:YouTubePlayer|null)=>{try{return p?Math.max(0,Math.min(MAX_DURATION,p.getCurrentTime())):0}catch{return 0}};
const safeDuration=(p:YouTubePlayer|null)=>{try{return p?Math.max(0,p.getDuration()):0}catch{return 0}};

export default function WatchTogether({token,myId,myName,partnerName,messages,onSendText,onOpenChat,onExit}:Props){
 const [shared,setShared]=useState<WatchSnapshot|null>(null);
 const [members,setMembers]=useState(1);
 const [partnerWatching,setPartnerWatching]=useState(false);
 const [serverOffset,setServerOffset]=useState(0);
 const [url,setUrl]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState("");
 const [playerError,setPlayerError]=useState("");
 const [needsTap,setNeedsTap]=useState(false);
 const [clock,setClock]=useState(Date.now());
 const [duration,setDuration]=useState(0);
 const [localTime,setLocalTime]=useState(0);
 const [scrub,setScrub]=useState<number|null>(null);
 const [chatOpen,setChatOpen]=useState(false);
 const [chatDraft,setChatDraft]=useState("");
 const [sendingChat,setSendingChat]=useState(false);
 const [toast,setToast]=useState("");
 const playerRef=useRef<YouTubePlayer|null>(null);
 const playerHost=useRef<HTMLDivElement|null>(null);
 const sharedRef=useRef<WatchSnapshot|null>(null);
 const offsetRef=useRef(0);
 const busyRef=useRef(false);
 const mountedRef=useRef(true);
 const ignorePlayerEventsUntil=useRef(0);
 const lastAppliedVersion=useRef(0);
 const sendRef=useRef<(action:WatchAction,position?:number,videoId?:string)=>Promise<void>>(async()=>{});
 const scrubRef=useRef<number|null>(null);
 const lastPlaybackEvent=useRef(0);
 const onReadyRef=useRef(false);
 const videoId=shared?.videoId||"";
 const chatMessages=messages.filter(m=>m.kind==="text"&&m.content).slice(-12);
 const accept=useCallback((data:ResponseState)=>{
  if(!mountedRef.current)return;
  if(typeof data.serverNow==="number"){
   const offset=data.serverNow-Date.now();offsetRef.current=offset;setServerOffset(offset);
  }
  if(typeof data.members==="number")setMembers(data.members);
  if(typeof data.partnerWatching==="boolean")setPartnerWatching(data.partnerWatching);
  if(data.state&&(!sharedRef.current||data.state.version>=sharedRef.current.version)){
   if(!sharedRef.current||data.state.version!==sharedRef.current.version||data.state.videoId!==sharedRef.current.videoId){
    sharedRef.current=data.state;setShared(data.state);
   }
  }
  setLoading(false);
 },[]);
 const refresh=useCallback(async()=>{
  if(document.visibilityState==="hidden")return;
  try{
   const response=await apiFetch("/api/watch-together",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as ResponseState;
   if(!response.ok||!data.ok)throw new Error(data.error||"Synchronisation impossible.");
   accept(data);
  }catch(e){if(mountedRef.current){setLoading(false);setError(e instanceof Error?e.message:"Connexion perdue.");}}
 },[token,accept]);
 useEffect(()=>{
  mountedRef.current=true;
  void refresh();
  const refreshId=window.setInterval(()=>void refresh(),1600);
  const heartbeat=async()=>{
   try{
    const response=await apiFetch("/api/watch-together",{method:"POST",
     headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
     body:JSON.stringify({action:"heartbeat"})});
    const data=await response.json() as ResponseState;
    if(response.ok&&data.ok)accept(data);
   }catch{/* Next poll will retry. */}
  };
  void heartbeat();
  const beatId=window.setInterval(()=>{if(document.visibilityState==="visible")void heartbeat()},6500);
  const visible=()=>{if(document.visibilityState==="visible"){void refresh();void heartbeat()}};
  document.addEventListener("visibilitychange",visible);
  return ()=>{mountedRef.current=false;window.clearInterval(refreshId);window.clearInterval(beatId);document.removeEventListener("visibilitychange",visible)};
 },[refresh,token,accept]);
 useEffect(()=>{
  const id=window.setInterval(()=>{
   setClock(Date.now());
   const p=playerRef.current;
   if(p&&onReadyRef.current){
    setDuration(safeDuration(p));setLocalTime(safeCurrent(p));
   }
  },850);
  return ()=>window.clearInterval(id);
 },[]);
 const post=useCallback(async(action:WatchAction,position=0,id?:string)=>{
  if(busyRef.current)return;
  const current=sharedRef.current;
  if(!current){setError("La salle n'est pas encore prête.");return;}
  if(action!=="set-video"&&!current.videoId)return;
  busyRef.current=true;setBusy(true);setError("");
  try{
   const payload=action==="set-video"?{action,videoId:id,version:current.version}:
    {action,position:Math.max(0,Math.min(MAX_DURATION,position)),version:current.version};
   const response=await apiFetch("/api/watch-together",{method:"POST",headers:{
    Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const data=await response.json() as ResponseState;
   if(!response.ok||!data.ok)throw new Error(data.error||"Action impossible.");
   accept(data);
   if(action==="set-video"){setUrl("");setToast("🎬 Vidéo partagée avec ton partenaire.");}
  }catch(e){
   setError(e instanceof Error?e.message:"Synchronisation impossible.");
   void refresh();
  }finally{busyRef.current=false;setBusy(false)}
 },[token,accept,refresh]);
 sendRef.current=post;
 // If user interacts with YouTube's native controls, share play/pause as well.
 // Ignore events caused by a remotely synchronized play, pause or seek.
 const onPlayerChange=useCallback((value:number)=>{
  if(!mountedRef.current)return;
  if(value===1)setNeedsTap(false);
  if(Date.now()<ignorePlayerEventsUntil.current)return;
  const current=sharedRef.current;
  const p=playerRef.current;
  if(!current||!p||!current.videoId||busyRef.current)return;
  const now=Date.now();
  if(now-lastPlaybackEvent.current<650)return;
  if(value===1&&!current.playing){
   lastPlaybackEvent.current=now;
   void sendRef.current("play",safeCurrent(p));
  }else if((value===2||value===0)&&current.playing){
   lastPlaybackEvent.current=now;
   void sendRef.current("pause",value===0?Math.max(0,safeDuration(p)):safeCurrent(p));
  }else if(value===1&&current.playing){
   // A native YouTube seek often ends in a PLAYING event after buffering.
   const expected=expectedPlaybackSeconds(current,now+offsetRef.current);
   const actual=safeCurrent(p);
   if(Math.abs(actual-expected)>5){
    lastPlaybackEvent.current=now;
    void sendRef.current("seek",actual);
   }
  }
 },[]);
 const applyPlayback=useCallback((snapshot:WatchSnapshot,force=false)=>{
  const p=playerRef.current;
  if(!p||!onReadyRef.current||!snapshot.videoId)return;
  if(!force&&lastAppliedVersion.current===snapshot.version)return;
  lastAppliedVersion.current=snapshot.version;
  ignorePlayerEventsUntil.current=Date.now()+2400;
  const target=expectedPlaybackSeconds(snapshot,Date.now()+offsetRef.current);
  if(Math.abs(safeCurrent(p)-target)>1.5)p.seekTo(target,true);
  if(snapshot.playing){
   if(p.getPlayerState()!==1){
    p.playVideo();
    setNeedsTap(true); // Autoplay may be blocked until a direct user gesture.
   }
  }else{
   if(p.getPlayerState()===1)p.pauseVideo();
   setNeedsTap(false);
  }
 },[]);
 useEffect(()=>{
  if(!videoId)return;
  let cancelled=false;
  onReadyRef.current=false;playerRef.current=null;
  lastAppliedVersion.current=0;
  const host=playerHost.current;
  if(!host)return;
  host.replaceChildren();
  const holder=document.createElement("div");
  holder.className="wt-youtube-target";host.appendChild(holder);
  setReady(false);setDuration(0);setPlayerError("");setNeedsTap(false);
  let instance:YouTubePlayer|null=null;
  void mountYouTubePlayer(holder,videoId,{
   onReady:p=>{
    if(cancelled)return;
    playerRef.current=p;onReadyRef.current=true;setReady(true);
    const current=sharedRef.current;
    if(current&&current.videoId===videoId)applyPlayback(current,true);
   },
   onChange:onPlayerChange,
   onBlocked:()=>{if(!cancelled)setNeedsTap(true)},
   onError:message=>{if(!cancelled){setPlayerError(message);setNeedsTap(false)}}
  }).then(p=>{
   if(cancelled)p.destroy();else instance=p;
  }).catch(e=>{if(!cancelled){setPlayerError(e instanceof Error?e.message:"Lecteur indisponible.");setReady(false)}});
  return ()=>{
   cancelled=true;onReadyRef.current=false;
   if(instance)try{instance.destroy()}catch{/* Already closed. */}
   if(playerHost.current===host)host.replaceChildren();
   playerRef.current=null;
  };
 },[videoId,applyPlayback,onPlayerChange]);
 useEffect(()=>{
  if(shared?.videoId&&ready)applyPlayback(shared);
 },[shared,ready,applyPlayback]);
 async function selectVideo(e:FormEvent){
  e.preventDefault();
  const id=parseYouTubeId(url);
  if(!id){setError("Colle un vrai lien YouTube (youtube.com ou youtu.be).");return;}
  if(id===sharedRef.current?.videoId){setToast("Cette vidéo est déjà dans votre salle.");return;}
  await post("set-video",0,id);
 }
 function beginPlayback(){
  const p=playerRef.current;
  if(!p||!ready)return;
  const current=sharedRef.current;
  if(!current)return;
  ignorePlayerEventsUntil.current=Date.now()+2400;
  const position=expectedPlaybackSeconds(current,Date.now()+offsetRef.current);
  if(Math.abs(safeCurrent(p)-position)>1.5)p.seekTo(position,true);
  p.playVideo(); // Called synchronously from a user tap for iOS autoplay rules.
  setNeedsTap(false);setPlayerError("");
  if(!current.playing)void post("play",safeCurrent(p));
 }
 function pausePlayback(){
  const p=playerRef.current;
  if(!p)return;
  ignorePlayerEventsUntil.current=Date.now()+2000;
  const position=safeCurrent(p);
  p.pauseVideo();
  void post("pause",position);
 }
 function seekTo(seconds:number){
  const current=sharedRef.current;if(!current)return;
  const p=playerRef.current;
  const pos=Math.max(0,Math.min(MAX_DURATION,seconds));
  ignorePlayerEventsUntil.current=Date.now()+2200;
  if(p)p.seekTo(pos,true);
  setScrub(null);scrubRef.current=null;
  void post("seek",pos);
 }
 function endScrub(){
  if(scrubRef.current!==null)seekTo(scrubRef.current);
 }
 function seekKey(e:KeyboardEvent<HTMLInputElement>){
  if(["ArrowLeft","ArrowRight","Home","End","PageUp","PageDown","Enter"].includes(e.key)){
   // Keyboard can move the slider through many changes; commit on release.
   if(e.key==="Enter")endScrub();
  }
 }
 async function sendMessage(e:FormEvent){
  e.preventDefault();
  const value=chatDraft.trim();
  if(!value||!partnerName||sendingChat)return;
  setSendingChat(true);setChatDraft("");
  try{await onSendText(value)}
  catch(e){setChatDraft(value);setError(e instanceof Error?e.message:"Message non envoyé.")}
  finally{setSendingChat(false)}
 }
 const synced=shared?expectedPlaybackSeconds(shared,clock+serverOffset):0;
 const watchUrl=videoId?"https://www.youtube.com/watch?v="+videoId:"";
 const sliderMax=Math.max(1,Math.floor(duration||synced+30));
 const displayAt=Math.max(0,Math.min(sliderMax,scrub??(ready?localTime:synced)));
 return <section className="wt-page" aria-label="Regarder une vidéo ensemble">
  <header className="wt-header">
   <button type="button" className="wt-back" onClick={onExit}>‹ Ensemble</button>
   <div className="wt-brand"><strong>Notre cinéma <span>♥</span></strong><small>LOVE RADAR · REGARDER ENSEMBLE</small></div>
   <div className="wt-header-actions"><div id="lr-voice-button-slot" className="wt-call-slot" aria-label="Appel vocal"/>
    <button type="button" onClick={onOpenChat} className="wt-chat-open" aria-label="Ouvrir la messagerie">✉</button>
   </div>
  </header>
  <div className="wt-presence" role="status" aria-live="polite">
   <span className={"wt-live-dot"+(partnerWatching?" active":"")}/>
   <span>{members<2?"Ton partenaire n’a pas encore rejoint votre espace.":partnerWatching?(partnerName||"Ton partenaire")+" regarde avec toi 💕":(partnerName||"Ton partenaire")+" peut rejoindre la séance."}</span>
   <span className="wt-presence-tag">PRIVÉ · 2 PERSONNES</span>
  </div>
  <div className="wt-body">
   <div className="wt-screen-panel">
    <div className="wt-screen" aria-label="Lecteur YouTube synchronisé">
     {videoId?<div ref={playerHost} className="wt-youtube-host" aria-label="Vidéo YouTube intégrée"/>:
      <div className="wt-screen-empty"><span>🎞️</span><strong>Votre séance commence ici</strong><p>Choisis une vidéo YouTube pour la regarder ensemble, même à distance.</p></div>}
     {videoId&&!ready&&!playerError?<div className="wt-player-loading">Chargement du lecteur YouTube…</div>:null}
     {playerError?<div className="wt-player-error" role="alert"><span>⚠️</span><strong>Lecture indisponible</strong><p>{playerError}</p>
      <a href={watchUrl} target="_blank" rel="noopener noreferrer">Voir sur YouTube</a>
     </div>:null}
    </div>
    {videoId?<div className="wt-video-tools">
     <div className="wt-video-status">
      <span>{shared?.playing?"▶ Lecture synchronisée":"⏸ En pause pour vous deux"}</span>
      <span>{shared?.updatedBy?"Action : "+shared.updatedBy:"Synchronisation activée"}</span>
     </div>
     {needsTap&&ready&&shared?.playing?<button type="button" className="wt-activate" onClick={beginPlayback}>▶ Activer la vidéo sur mon téléphone</button>:null}
     <div className="wt-player-actions">
      <button type="button" className="wt-player-play" onClick={shared?.playing?pausePlayback:beginPlayback}
       disabled={busy||!ready||Boolean(playerError)}>{shared?.playing?"⏸ Pause pour nous deux":"▶ Lire ensemble"}</button>
      <button type="button" onClick={()=>seekTo(Math.max(0,synced-10))} disabled={busy||!ready} aria-label="Reculer de dix secondes">↶ 10 s</button>
      <button type="button" onClick={()=>seekTo(synced+10)} disabled={busy||!ready} aria-label="Avancer de dix secondes">10 s ↷</button>
     </div>
     <div className="wt-progress">
      <span>{formatWatchTime(scrub??displayAt)}</span>
      <input type="range" min="0" max={sliderMax} step="1" value={Math.max(0,Math.min(sliderMax,displayAt))}
       disabled={!ready||busy} aria-label="Position partagée de la vidéo"
       onChange={e=>{const n=Number(e.target.value);scrubRef.current=n;setScrub(n)}}
       onPointerUp={endScrub} onKeyUp={seekKey}/>
      <span>{duration>0?formatWatchTime(duration):"—:—"}</span>
     </div>
     <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="wt-youtube-source">YouTube ↗</a>
    </div>:null}
    <form className="wt-link-form" onSubmit={e=>void selectVideo(e)}>
     <label htmlFor="wt-video-link">🎬 Choisir une vidéo YouTube</label>
     <div className="wt-link-line">
      <input id="wt-video-link" type="url" inputMode="url" placeholder="Colle un lien youtube.com ou youtu.be"
       value={url} onChange={e=>setUrl(e.target.value)} autoComplete="off" maxLength={500}/>
      <button type="submit" disabled={busy||loading||!url.trim()}>Partager</button>
     </div>
     <small>Chaque personne voit sa propre copie de la vidéo. Les commandes sont partagées, pas le compte YouTube.</small>
    </form>
   </div>
   <div className={"wt-conversation"+(chatOpen?" is-open":"")}>
    <div className="wt-conversation-head">
     <div><strong>💬 Parler pendant la vidéo</strong><small>{partnerName?"Avec "+partnerName:"Votre conversation privée"}</small></div>
     <button type="button" onClick={()=>setChatOpen(!chatOpen)} aria-expanded={chatOpen}>
      {chatOpen?"Réduire −":"Ouvrir +"}
     </button>
    </div>
    {chatOpen?<><div className="wt-message-list" role="log" aria-label="Derniers messages de votre couple">
     {chatMessages.length===0?<p className="wt-chat-empty">Envoyez un petit mot pendant votre séance ❤️</p>:
      chatMessages.map(m=><div className={"wt-message"+(m.sender_id===myId?" mine":"")} key={m.id}>
       <span>{m.sender_id===myId?myName:partnerName||"Mon amour"}</span>
       <p>{m.content}</p>
      </div>)}
    </div>
    <form className="wt-chat-compose" onSubmit={e=>void sendMessage(e)}>
     <input type="text" value={chatDraft} onChange={e=>setChatDraft(e.target.value)}
      placeholder="Un petit message… ❤️" maxLength={2000} disabled={!partnerName||sendingChat}/>
     <button type="submit" disabled={!chatDraft.trim()||!partnerName||sendingChat} aria-label="Envoyer le message">➤</button>
    </form></>:null}
   </div>
  </div>
  {error?<div className="wt-alert" role="alert">{error}<button type="button" onClick={()=>setError("")} aria-label="Fermer">✕</button></div>:null}
  {toast?<div className="wt-toast" role="status">{toast}<button type="button" onClick={()=>setToast("")} aria-label="Fermer">✕</button></div>:null}
  <p className="wt-footnote">Certaines vidéos ne permettent pas l’intégration. Sur iPhone, chacun peut devoir appuyer une fois sur « Activer ». Les publicités et le chargement peuvent différer.</p>
 </section>;
}
