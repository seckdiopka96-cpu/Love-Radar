import {apiFetch} from "./api";
import {findBuiltInSpeaker,audioRouteHelp} from "./audio-output";
import {relayNeedsRefresh,RELAY_REFRESH_AFTER_MS,RELAY_RETRY_AFTER_ERROR_MS} from "./reliability-rules";
import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./voice-call.css";

type Call = {id:string;status:"ringing"|"active";direction:"incoming"|"outgoing";createdAt:number;updatedAt:number;expiresAt:number};
type Signal = {id:number;kind:"offer"|"answer"|"candidate";payload:string};
type Result = {ok:boolean;error?:string;call?:Call|null;signals?:Signal[]};
type Props = {token:string;partner:string;avatarSrc?:string;hasPartner:boolean;showButton:boolean;onOpenChat:()=>void};

const STUN_SERVERS:RTCIceServer[]=[
 {urls:"stun:stun.cloudflare.com:3478"},
 {urls:"stun:stun.l.google.com:19302"}
];
export default function VoiceCall({token,partner,avatarSrc,hasPartner,showButton,onOpenChat}:Props){
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);
 const [active,setActive]=useState<Call|null>(null);
 const [minimized,setMinimized]=useState(false);
 const [callPanel,setCallPanel]=useState<"none"|"info"|"more"|"keypad">("none");
 const [dialed,setDialed]=useState("");
 const [busy,setBusy]=useState(false);
 const [muted,setMuted]=useState(false);
 const [phase,setPhase]=useState("");
 const [error,setError]=useState("");
 const [needsPlay,setNeedsPlay]=useState(false);
 const [speakerHelp,setSpeakerHelp]=useState("");
 const [speakerSelected,setSpeakerSelected]=useState(false);
 const [speakerBusy,setSpeakerBusy]=useState(false);
 const [relayEnabled,setRelayEnabled]=useState(false);
 const [networkHint,setNetworkHint]=useState("");
 const [duration,setDuration]=useState(0);
 const current=useRef<Call|null>(null);
 const pc=useRef<RTCPeerConnection|null>(null);
 const iceServers=useRef<RTCIceServer[]>(STUN_SERVERS);
 const local=useRef<MediaStream|null>(null);
 const remote=useRef<HTMLAudioElement|null>(null);
 const signalAfter=useRef(0);
 const isPolling=useRef(false);
 const starting=useRef(false);
 const offered=useRef(false);
 const answered=useRef(false);
 const suppressed=useRef("");
 const connectedSince=useRef(0);
 const queuedCandidates=useRef<RTCIceCandidateInit[]>([]);
 const sendingCandidates=useRef(false);
 const sessionDescriptionSent=useRef(false);
 const networkWarmup=useRef<Promise<void>|null>(null);
 const networkWarmedAt=useRef(0);
 const networkMaxAge=useRef(RELAY_REFRESH_AFTER_MS);
 const previousSinkId=useRef<string>("");

 useEffect(()=>setAnchor(showButton?document.getElementById("lr-voice-button-slot"):null),[showButton]);
 const api=useCallback(async(action?:string,extra:Record<string,unknown>={},after=0):Promise<Result>=>{
  const controller=new AbortController();
  // A stuck signaling GET must not freeze incoming calls or WebRTC ICE updates.
  const timeout=!action?window.setTimeout(()=>controller.abort(),8000):null;
  try{
   const res=await apiFetch("/api/call"+(!action?"?after="+after:""),{
    method:action?"POST":"GET",
    headers:{Authorization:"Bearer "+token,...(action?{"Content-Type":"application/json"}:{})},
    ...(action?{body:JSON.stringify({action,...extra})}:{cache:"no-store" as RequestCache}),
    signal:controller.signal
   });
   const data=await res.json() as Result;
   if(!res.ok||!data.ok)throw Error(data.error||"Le service d’appel ne répond pas.");
   return data;
  }finally{if(timeout!==null)window.clearTimeout(timeout)}
 },[token]);
 const loadNetwork=useCallback(async()=>{
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),5000);
  try{
   const response=await apiFetch("/api/call-config",{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal});
   const data=await response.json() as {ok?:boolean;relay?:boolean;iceServers?:RTCIceServer[];warning?:string};
   if(!response.ok||!data.ok)throw Error("Configuration audio inaccessible.");
   if(Array.isArray(data.iceServers)&&data.iceServers.length)iceServers.current=data.iceServers;
   else iceServers.current=STUN_SERVERS;
   networkMaxAge.current=data.relay?RELAY_REFRESH_AFTER_MS:RELAY_RETRY_AFTER_ERROR_MS;
   setRelayEnabled(Boolean(data.relay));
   setNetworkHint(data.warning||(!data.relay?"La connexion directe peut échouer sur certains réseaux. Un relais TURN doit être activé sur Cloudflare.":""));
  }catch{
   networkMaxAge.current=RELAY_RETRY_AFTER_ERROR_MS;
   iceServers.current=STUN_SERVERS;
   setRelayEnabled(false);
   setNetworkHint("Le serveur relais audio n’a pas pu être contacté.");
  }finally{window.clearTimeout(timeout)}
 },[token]);
 const warmNetwork=useCallback(()=>{
  // TURN credentials expire; refresh before a new call rather than reusing an
  // expired network setup for hours after the app was left open on an iPhone.
  if(!networkWarmup.current||relayNeedsRefresh(networkWarmedAt.current,Date.now(),networkMaxAge.current)){
   networkWarmedAt.current=Date.now();
   networkWarmup.current=loadNetwork();
  }
  return networkWarmup.current;
 },[loadNetwork]);
 useEffect(()=>{if(hasPartner)void warmNetwork()},[hasPartner,warmNetwork]);
 const flushCandidates=useCallback(async(callId:string)=>{
  if(sendingCandidates.current||!sessionDescriptionSent.current)return;
  sendingCandidates.current=true;
  try{
   const queue=queuedCandidates.current;
   while(sessionDescriptionSent.current&&queue.length&&current.current?.id===callId&&queue===queuedCandidates.current){
    const candidate=queue[0];
    try{
     await api("signal",{id:callId,kind:"candidate",candidate});
     if(queue===queuedCandidates.current)queue.shift();
    }catch(error){
     // A transient error will be retried at the next signaling poll.
     console.warn("Trickle ICE delivery retry",error);
     break;
    }
   }
  }finally{sendingCandidates.current=false}
 },[api]);
 const clearAudio=useCallback(()=>{
  const p=pc.current;
  pc.current=null;
  if(p){p.ontrack=null;p.onicecandidate=null;p.onconnectionstatechange=null;p.oniceconnectionstatechange=null;p.close()}
  if(local.current){local.current.getTracks().forEach(track=>track.stop());local.current=null}
  if(remote.current){remote.current.pause();remote.current.srcObject=null}
  offered.current=false;answered.current=false;connectedSince.current=0;
  signalAfter.current=0;
  queuedCandidates.current=[];sessionDescriptionSent.current=false;sendingCandidates.current=false;
  const audioSession=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;
  if(audioSession){try{audioSession.type="auto"}catch{/* Browser controls audio routing. */}}
  previousSinkId.current="";
  setMuted(false);setNeedsPlay(false);setDuration(0);setSpeakerHelp("");setSpeakerSelected(false);setSpeakerBusy(false);setMinimized(false);setCallPanel("none");setDialed("");
 },[]);
 const reset=useCallback(()=>{
  clearAudio();
  current.current=null;
  setActive(null);setBusy(false);setPhase("");setError("");
 },[clearAudio]);
 const setCurrent=useCallback((call:Call)=>{
  if(current.current?.id!==call.id){
   if(current.current)clearAudio();
   setMinimized(false);setCallPanel("none");setDialed("");
   setError("");setPhase(call.direction==="incoming"?"Appel vocal entrant…":"Appel en cours…");
  }
  current.current=call;
  setActive(call);
 },[clearAudio]);

 const createPeer=useCallback(()=>{
  if(pc.current)return pc.current;
  if(!local.current)throw Error("Le microphone doit être autorisé.");
  if(typeof RTCPeerConnection==="undefined")throw Error("Les appels vocaux ne sont pas compatibles avec cet appareil.");
  const peer=new RTCPeerConnection({iceServers:iceServers.current,iceCandidatePoolSize:2});
  peer.onicecandidate=event=>{
   if(pc.current!==peer||!event.candidate||!current.current)return;
   queuedCandidates.current.push(event.candidate.toJSON());
   void flushCandidates(current.current.id);
  };
  for(const track of local.current.getAudioTracks())peer.addTrack(track,local.current);
  peer.ontrack=event=>{
   const el=remote.current;
   if(!el)return;
   el.srcObject=event.streams[0]||new MediaStream([event.track]);
   void el.play().then(()=>setNeedsPlay(false)).catch(()=>setNeedsPlay(true));
  };
  peer.onconnectionstatechange=()=>{
   if(pc.current!==peer)return;
   if(peer.connectionState==="connected"){
    if(!connectedSince.current)connectedSince.current=Date.now();setPhase("Connecté");setError("");
   }else if(peer.connectionState==="failed"){
    setPhase("Connexion échouée");
    networkWarmedAt.current=0;
    setError("Impossible de transmettre l'audio sur ce réseau. Vérifie la connexion ou le relais TURN.");
   }else if(peer.connectionState==="disconnected")setPhase("Reconnexion…");
   else if(peer.connectionState==="connecting")setPhase("Connexion audio…");
  };
  peer.oniceconnectionstatechange=()=>{
   if(pc.current!==peer)return;
   if(peer.iceConnectionState==="failed")setError("Aucun chemin audio trouvé. Un relais TURN peut être nécessaire.");
  };
  pc.current=peer;
  return peer;
 },[flushCandidates]);
 const offer=useCallback(async(call:Call)=>{
  if(offered.current||!local.current)return;
  offered.current=true;
  try{
   const peer=createPeer();
   setPhase("Connexion en cours…");
   if(!peer.localDescription)await peer.setLocalDescription(await peer.createOffer({offerToReceiveAudio:true}));
   if(current.current?.id!==call.id||pc.current!==peer)return;
   // Send the offer immediately; trickle ICE paths over separate messages.
   await api("signal",{id:call.id,kind:"offer",sdp:peer.localDescription?.sdp||""});
   if(current.current?.id!==call.id||pc.current!==peer)return;
   sessionDescriptionSent.current=true;
   void flushCandidates(call.id);
  }catch(err){
   offered.current=false;
    if(current.current?.id===call.id)setError(err instanceof Error?err.message:"Impossible de connecter l’appel.");
  }
 },[api,createPeer,flushCandidates]);
 const receive=useCallback(async(call:Call,signal:Signal)=>{
  if(current.current?.id!==call.id||!local.current)return false;
  const peer=createPeer();
  if(signal.kind==="offer"&&call.direction==="incoming"&&!answered.current){
   answered.current=true;
   try{
    setPhase("Connexion en cours…");
    if(!peer.remoteDescription)await peer.setRemoteDescription({type:"offer",sdp:signal.payload});
    if(!peer.localDescription)await peer.setLocalDescription(await peer.createAnswer());
    if(current.current?.id!==call.id||pc.current!==peer)return true;
    await api("signal",{id:call.id,kind:"answer",sdp:peer.localDescription?.sdp||""});
    if(current.current?.id!==call.id||pc.current!==peer)return true;
    sessionDescriptionSent.current=true;
    void flushCandidates(call.id);
    return true;
   }catch(err){answered.current=false;setError(err instanceof Error?err.message:"Réponse impossible.");return false}
  }
  if(signal.kind==="answer"&&call.direction==="outgoing"&&peer.signalingState==="have-local-offer"){
   try{await peer.setRemoteDescription({type:"answer",sdp:signal.payload});return true}
   catch(err){setError(err instanceof Error?err.message:"Connexion impossible.");return false}
  }
  if(signal.kind==="candidate"){
   if(!peer.remoteDescription)return false;
   try{
    await peer.addIceCandidate(JSON.parse(signal.payload) as RTCIceCandidateInit);
   }catch(err){
    // An invalid individual candidate must not block valid later paths.
    console.warn("ICE candidate ignored",err);
   }
   return true;
  }
  return false;
 },[api,createPeer,flushCandidates]);
 const sync=useCallback(async()=>{
  if(isPolling.current||starting.current||document.visibilityState==="hidden")return;
  isPolling.current=true;
  try{
   const data=await api(undefined,{},signalAfter.current);
   const call=data.call||null;
   if(!call){
    if(current.current)reset();
    return;
   }
   if(call.id===suppressed.current)return;
   if(current.current?.id!==call.id)setCurrent(call);
   else if(current.current.status!==call.status){current.current=call;setActive(call)}
   if(call.status==="active"&&call.direction==="outgoing"&&local.current)void offer(call);
   if(call.status==="active"&&local.current){
    for(const signal of data.signals||[]){
     if(signal.id<=signalAfter.current)continue;
     const handled=await receive(call,signal);
     if(handled)signalAfter.current=signal.id;
     else break;
    }
    if(sessionDescriptionSent.current&&queuedCandidates.current.length)void flushCandidates(call.id);
   }
  }catch(err){if(current.current)setError(err instanceof Error?err.message:"Réseau indisponible.")}
  finally{isPolling.current=false}
 },[api,offer,receive,reset,setCurrent,flushCandidates]);
 useEffect(()=>{
  if(!hasPartner)return;
  let stopped=false,timer:number|null=null;
  const tick=async()=>{
   await sync();
   if(!stopped)timer=window.setTimeout(tick,current.current?420:1800);
  };
  void tick();
  const visible=()=>{if(document.visibilityState==="visible")void sync()};
  const focus=()=>{void sync()};
  document.addEventListener("visibilitychange",visible);
  window.addEventListener("focus",focus);
  return()=>{
   stopped=true;
   if(timer!==null)window.clearTimeout(timer);
   document.removeEventListener("visibilitychange",visible);
   window.removeEventListener("focus",focus);
  };
 },[sync,hasPartner]);
 useEffect(()=>{
  if(!active||active.status!=="active")return;
  const ping=()=>{if(document.visibilityState==="visible")void api("heartbeat",{id:active.id}).catch(()=>{})};
  ping();
  const interval=setInterval(ping,24000);
  return()=>clearInterval(interval);
 },[active?.id,active?.status,api]);
 useEffect(()=>{
  if(active?.status!=="ringing"||active.direction!=="incoming")return;
  const vibration=navigator as Navigator & {vibrate?:(pattern:number[])=>boolean};
  vibration.vibrate?.([180,130,180]);
 },[active?.id,active?.status,active?.direction]);
 useEffect(()=>{
  const tick=setInterval(()=>{if(connectedSince.current)setDuration(Math.floor((Date.now()-connectedSince.current)/1000))},1000);
  return()=>clearInterval(tick);
 },[]);
 useEffect(()=>()=>{const c=current.current;if(c)void api("end",{id:c.id}).catch(()=>{});clearAudio()},[api,clearAudio]);

 async function microphone(){
  if(!navigator.mediaDevices?.getUserMedia)throw Error("Ouvre l’application en HTTPS et autorise l’accès au microphone.");
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  local.current=stream;
  const audioSession=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;
  if(audioSession){try{audioSession.type="play-and-record"}catch{/* Unsupported session type. */}}
 }
 async function start(){
  if(busy||current.current||!hasPartner)return;
  setBusy(true);starting.current=true;setError("");
  // iOS getUserMedia begins in the user gesture; signaling starts in parallel
  // rather than waiting for the microphone permission/initialization.
  const micTask=microphone();
  const callTask=api("start");
  const networkTask=warmNetwork(); // Ring immediately; ensure fresh TURN credentials before creating the peer.
  try{
   const [result]=await Promise.all([callTask,micTask]);
   await networkTask;
   if(!result.call)throw Error("Appel non créé.");
   if(result.call.direction==="incoming"){
    local.current?.getTracks().forEach(track=>track.stop());
    local.current=null;
   }
   setCurrent(result.call);
   if(result.call.status==="active"&&result.call.direction==="outgoing")void offer(result.call);
  }catch(err){
   const [created]=await Promise.all([callTask.catch(()=>null),micTask.catch(()=>{})]);
   // A denied microphone must not leave the partner ringing indefinitely.
   if(created?.call?.direction==="outgoing"&&created.call.status==="ringing"){
    suppressed.current=created.call.id;
    void api("end",{id:created.call.id}).catch(()=>{});
   }
   reset();setError(err instanceof Error?err.message:"Impossible d’appeler.");
  }finally{starting.current=false;setBusy(false)}
 }
 async function accept(){
  const c=current.current;
  if(!c||c.direction!=="incoming"||busy)return;
  setBusy(true);setError("");
  try{
   await Promise.all([microphone(),warmNetwork()]);
   createPeer();
   await api("accept",{id:c.id});
   const updated={...c,status:"active" as const};
   current.current=updated;setActive(updated);setPhase("Connexion en cours…");
   void sync();
  }catch(err){
   clearAudio();
   setError(err instanceof Error?err.message:"Impossible de décrocher.");
  }finally{setBusy(false)}
 }
 async function hangup(){
  const c=current.current;
  if(!c||busy)return;
  suppressed.current=c.id;
  const action=c.status==="ringing"&&c.direction==="incoming"?"decline":"end";
  reset();
  try{await api(action,{id:c.id})}catch(err){setError(err instanceof Error?err.message:"Déconnexion impossible.");}
 }
 function toggleMute(){
  if(!local.current)return;
  const next=!muted;
  for(const t of local.current.getAudioTracks())t.enabled=!next;
  setMuted(next);
 }
 async function enableAudio(){
  if(!remote.current)return;
  try{remote.current.muted=false;await remote.current.play();setNeedsPlay(false)}catch{setError("Vérifie le volume du téléphone et réessaie.")}
 }
 // Choose a real audio output when the browser offers Speaker Selection API.
 // On iPhone PWA, Safari's available devices vary by iOS version: never fake
 // a selected state when hardware routing cannot be confirmed.
 async function selectSpeaker(){
  const audio=remote.current;
  if(!audio||speakerBusy)return;
  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  const output=audio as HTMLAudioElement & {setSinkId?:(id:string)=>Promise<void>;sinkId?:string};
  setSpeakerBusy(true);setSpeakerHelp("");
  try{
   if(typeof output.setSinkId!=="function"){
    setSpeakerSelected(false);setSpeakerHelp(audioRouteHelp(isIOS));return;
   }
   if(speakerSelected){
    // Restore the device used before the user activated speaker mode.
    await output.setSinkId(previousSinkId.current);
    setSpeakerSelected(false);
    setSpeakerHelp("Retour à la sortie audio précédente. Si iOS utilise toujours le haut-parleur, choisis la sortie dans le Centre de contrôle.");
    return;
   }
   const devices=await navigator.mediaDevices?.enumerateDevices?.()||[];
   let speakerId=findBuiltInSpeaker(devices);
   const picker=navigator.mediaDevices as MediaDevices & {selectAudioOutput?:()=>Promise<MediaDeviceInfo>};
   // Safari 26+ may expose a default system speaker instead of a labeled one.
   // If a native output picker exists, let the user explicitly choose it.
   if(!speakerId&&typeof picker?.selectAudioOutput==="function"){
    try{speakerId=(await picker.selectAudioOutput()).deviceId}
    catch{
     setSpeakerHelp("Sélection annulée. Le son reste sur sa sortie actuelle.");return;
    }
   }
   if(!speakerId){
    // A default speaker can be exposed as deviceId=default; only request it
    // if the browser enumerated that audio output.
    speakerId=devices.find(d=>d.kind==="audiooutput"&&d.deviceId==="default")?.deviceId||null;
   }
   if(!speakerId){setSpeakerSelected(false);setSpeakerHelp(audioRouteHelp(isIOS));return}
   previousSinkId.current=output.sinkId||"";
   await output.setSinkId(speakerId);
   audio.muted=false;audio.volume=1;
   if(audio.srcObject){
    try{await audio.play();setNeedsPlay(false)}
    catch{setNeedsPlay(true)}
   }
   setSpeakerSelected(true);
   setSpeakerHelp(isIOS?"Haut-parleur sélectionné. Si le son ne change pas, iOS peut imposer une autre sortie : vérifie le Centre de contrôle.":"Haut-parleur sélectionné. Appuie de nouveau pour revenir à la sortie précédente.");
  }catch(error){
   setSpeakerSelected(false);
   setSpeakerHelp("Impossible de changer la sortie audio : "+(error instanceof Error?error.message:"choisis une sortie depuis les réglages du téléphone."));
  }finally{setSpeakerBusy(false)}
 }
 function minimizeAndWrite(){
  if(!current.current||current.current.status!=="active")return;
  // Navigation changes the page only; the VoiceCall component and WebRTC peer stay mounted.
  setCallPanel("none");setMinimized(true);
  onOpenChat();
 }
 function pressKey(digit:string){
  setDialed(previous=>(previous+digit).slice(-24));
  // DTMF is optional for peer-to-peer WebRTC and never dials a phone number.
  try{
   const sender=pc.current?.getSenders().find(item=>item.track?.kind==="audio");
   if(sender?.dtmf?.canInsertDTMF)sender.dtmf.insertDTMF(digit,180);
  }catch{/* The keypad remains locally usable if DTMF is not available. */}
 }
 const isIncoming=active?.direction==="incoming"&&active.status==="ringing";
 const isOutgoing=active?.direction==="outgoing"&&active.status==="ringing";
 const total=String(Math.floor(duration/60)).padStart(2,"0")+":"+String(duration%60).padStart(2,"0");
 const callStatus=isIncoming?"Appel vocal entrant…":isOutgoing?"Appel en cours…":phase||"Connexion en cours…";
 const display=active&&(!minimized||active.status==="ringing")?createPortal(
  <div className="lr-call-backdrop" role="dialog" aria-modal="true" aria-label="Appel audio">
   <div className="lr-call-sheet lr-call-facetime">
    <div className="lr-call-upper">
     <div className="lr-call-topbar">
      {active.status==="active"?<button type="button" className="lr-call-minimize" onClick={minimizeAndWrite} aria-label="Réduire l’appel et écrire des messages">
       <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>Réduire</span>
      </button>:<span className="lr-call-top-spacer" aria-hidden="true"/>}
      <button type="button" className="lr-call-info-button" aria-label="Informations sur l’appel" onClick={()=>setCallPanel("info")}>
       <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 11v6M12 7h.01"/></svg>
      </button>
     </div>
     <div className="lr-call-identity">
      <div className="lr-call-initial" aria-label={"Avatar de "+partner}>{avatarSrc?<img src={avatarSrc} alt={"Photo de "+partner}/>:partner.trim().charAt(0).toUpperCase()||"♡"}</div>
      <div className="lr-call-identification">
       <div className="lr-call-brand">Appel audio</div>
       <div className="lr-call-duration" aria-label={"Durée de l’appel : "+total}>{active.status==="active"&&connectedSince.current?total:callStatus}</div>
       <h2>{partner}</h2>
       {active.status==="active"&&phase!=="Connecté"?<p className="lr-call-status" aria-live="polite">{phase||"Connexion audio…"}</p>:null}
      </div>
     </div>
     <div className="lr-call-feedback">
      {error?<div className="lr-call-error" role="alert">{error}</div>:null}
      {needsPlay?<button type="button" className="lr-call-sound" onClick={enableAudio}>Activer le son</button>:null}
      {speakerHelp?<div className="lr-call-audio-hint" role="status">{speakerHelp}</div>:null}
      {networkHint&&active.status==="active"&&phase!=="Connecté"?<div className="lr-call-audio-hint" role="status">{networkHint}</div>:null}
     </div>
    </div>
    <div className={"lr-call-actions"+(isIncoming?" is-ringing":"")} aria-label="Commandes de l’appel">
     {isIncoming?<>
      <button type="button" className="lr-call-action lr-call-decline" onClick={hangup} aria-label="Refuser l’appel" disabled={busy}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" aria-hidden="true"><path d="M3 17.5c5.4-4.7 12.6-4.7 18 0M5 17.5V21M19 17.5V21"/></svg></span>
       <span className="lr-call-control-label">Refuser</span>
      </button>
      <button type="button" className="lr-call-action lr-call-answer" onClick={accept} aria-label="Décrocher" disabled={busy}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" aria-hidden="true"><path d="M3 6.5c0 7.5 7 14.5 14.5 14.5l3-3.5-5-4-2 2c-2.5-1-4-2.5-5-5l2-2-4-5z"/></svg></span>
       <span className="lr-call-control-label">Décrocher</span>
      </button>
     </>:<>
      <button type="button" className={"lr-call-action lr-call-speaker "+(speakerSelected?"is-selected":"")} onClick={selectSpeaker} disabled={speakerBusy} aria-label={speakerSelected?"Désactiver le haut-parleur":"Activer le haut-parleur"} aria-pressed={speakerSelected}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/></svg></span>
       <span className="lr-call-control-label">Haut-parleur</span>
      </button>
      <button type="button" className={"lr-call-action lr-call-mute "+(muted?"is-muted":"")} onClick={toggleMute} disabled={!local.current} aria-label={muted?"Réactiver le microphone":"Couper le microphone"} aria-pressed={muted}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>{muted?<path d="M3 3 21 21" strokeWidth="2.5"/>:null}</svg></span>
       <span className="lr-call-control-label">{muted?"Réactiver":"Couper le son"}</span>
      </button>
      <button type="button" className="lr-call-action lr-call-chat" onClick={minimizeAndWrite} aria-label="Réduire l’appel et ouvrir les messages">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11.2a8.3 8.3 0 0 1-8.5 8.3 10 10 0 0 1-3.6-.8L3 21l1.5-4.7a8.4 8.4 0 1 1 15.5-5.1Z"/><path d="M8 11h8M8 14.5h5"/></svg></span>
       <span className="lr-call-control-label">Messages</span>
      </button>
      <button type="button" className="lr-call-action lr-call-more" onClick={()=>setCallPanel("more")} aria-label="Plus d’options">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span>
       <span className="lr-call-control-label">Plus</span>
      </button>
      <button type="button" className="lr-call-action lr-call-decline lr-call-hangup" onClick={hangup} aria-label="Raccrocher" disabled={busy}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M3 17.5c5.4-4.7 12.6-4.7 18 0M5 17.5V21M19 17.5V21"/></svg></span>
       <span className="lr-call-control-label">Raccrocher</span>
      </button>
      <button type="button" className="lr-call-action lr-call-keypad" onClick={()=>setCallPanel("keypad")} aria-label="Ouvrir le clavier d’appel">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{[4,10,16].flatMap(y=>[4,10,16].map(x=><circle key={x+"-"+y} cx={x+2} cy={y+1} r="2.15"/>))}</svg></span>
       <span className="lr-call-control-label">Clavier</span>
      </button>
     </>}
    </div>
    {callPanel!=="none"?<div className="lr-call-panel-backdrop" onClick={()=>setCallPanel("none")}>
     <div className="lr-call-panel" role="dialog" aria-modal="true" aria-label={callPanel==="info"?"Informations de l’appel":callPanel==="more"?"Plus d’options":"Clavier d’appel"} onClick={e=>e.stopPropagation()}>
      <div className="lr-call-panel-head">
       <strong>{callPanel==="info"?"Informations de l’appel":callPanel==="more"?"Plus d’options":"Clavier d’appel"}</strong>
       <button type="button" onClick={()=>setCallPanel("none")} aria-label="Fermer les options">×</button>
      </div>
      {callPanel==="info"?<div className="lr-call-panel-details">
       <p><span>Avec</span><strong>{partner}</strong></p>
       <p><span>Type</span><strong>Appel audio</strong></p>
       <p><span>État</span><strong>{callStatus}</strong></p>
       <p><span>Durée</span><strong>{total}</strong></p>
       <p><span>Relais audio</span><strong>{relayEnabled?"Disponible":"Non confirmé"}</strong></p>
      </div>:callPanel==="more"?<div className="lr-call-panel-options">
       <button type="button" onClick={minimizeAndWrite}>Écrire un message pendant l’appel</button>
       <button type="button" onClick={()=>{setCallPanel("none");void selectSpeaker()}}>Changer la sortie audio</button>
       <button type="button" onClick={()=>setCallPanel("info")}>Informations de la connexion</button>
      </div>:<div className="lr-call-keypad-area">
       <div className="lr-call-dialed" aria-live="polite">{dialed||"· · ·"}</div>
       <div className="lr-call-keypad-grid">
        {["1","2","3","4","5","6","7","8","9","*","0","#"].map(key=><button key={key} type="button" onClick={()=>pressKey(key)} aria-label={"Touche "+key}>{key}</button>)}
       </div>
       <button type="button" className="lr-call-keypad-clear" onClick={()=>setDialed(v=>v.slice(0,-1))} disabled={!dialed}>Effacer le dernier chiffre</button>
       <p>Clavier pour les tonalités WebRTC, sans composition de numéro externe.</p>
      </div>}
     </div>
    </div>:null}
   </div>
  </div>,document.body):null;
 const mini=active?.status==="active"&&minimized?createPortal(
  <div className="lr-call-mini" role="region" aria-label={"Appel vocal en cours avec "+partner}>
   <button type="button" className="lr-call-mini-expand" onClick={()=>setMinimized(false)} aria-label="Agrandir l’appel" title="Revenir à l’appel">
    <span className="lr-call-mini-pulse" aria-hidden="true">●</span>
    <span className="lr-call-mini-info"><strong>{phase==="Connecté"?"En appel":phase||"Appel en cours"} · {partner}</strong><small>{total} · Appuyer pour agrandir</small></span>
    <span className="lr-call-mini-up" aria-hidden="true">⌃</span>
   </button>
   <div className="lr-call-mini-actions">
    {needsPlay?<button type="button" onClick={enableAudio} className="lr-call-mini-sound" aria-label="Activer le son">🔊</button>:null}
    <button type="button" className={"lr-call-mini-speaker "+(speakerSelected?"active":"")} onClick={selectSpeaker} disabled={speakerBusy} aria-pressed={speakerSelected} aria-label={speakerSelected?"Désactiver le haut-parleur":"Activer le haut-parleur"}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/></svg></button>
    <button type="button" className={"lr-call-mini-mute "+(muted?"active":"")} onClick={toggleMute} disabled={!local.current} aria-label={muted?"Réactiver le micro":"Couper le micro"} aria-pressed={muted}>{muted?"🔇":"🎙️"}</button>
    <button type="button" className="lr-call-mini-end" onClick={hangup} disabled={busy} aria-label="Raccrocher">✕</button>
   </div>
  </div>,document.body):null;
 return <>
  {anchor&&createPortal(<button type="button" className="lr-call-trigger" onClick={start} disabled={!hasPartner||busy||Boolean(active)} aria-label="Appeler en vocal" title="Appeler en vocal"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.8v3a2 2 0 0 1-2.2 2A19.5 19.5 0 0 1 2.2 4.2 2 2 0 0 1 4.2 2h3a2 2 0 0 1 2 1.7l.6 3.1a2 2 0 0 1-.6 1.9L7.7 10a16 16 0 0 0 6.3 6.3l1.4-1.5a2 2 0 0 1 1.9-.6l3.1.6a2 2 0 0 1 1.6 1.9Z"/></svg></button>,anchor)}
  {error&&!active?<div className="lr-call-toast" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fermer">×</button></div>:null}
  <audio ref={remote} autoPlay playsInline aria-label="Voix de ton partenaire"/>
  {display}
  {mini}
 </>;
}
