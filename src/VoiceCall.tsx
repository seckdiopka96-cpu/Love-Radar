import {apiFetch,isNativeApp} from "./api";
import {beginNativeCallSession,endNativeCallSession,nativeCallSessionRunning} from "./native-call-session";
import {activateNativeVoip,hasNativeVoip,nativeVoipAnswered,nativeVoipEnd,type NativeVoipAction} from "./native-voip";
import {findBuiltInSpeaker,audioRouteHelp} from "./audio-output";
import {claimCallAudio,releaseCallAudio} from "./audio-focus";
import {relayNeedsRefresh,RELAY_REFRESH_AFTER_MS,RELAY_RETRY_AFTER_ERROR_MS} from "./reliability-rules";
import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./voice-call.css";
import "./video-call.css";

type Call = {id:string;status:"ringing"|"active";direction:"incoming"|"outgoing";createdAt:number;updatedAt:number;expiresAt:number;mode?:"audio"|"video"};
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
 const [cameraOff,setCameraOff]=useState(false);
 const [cameraFacing,setCameraFacing]=useState<"user"|"environment">("user");
 const [cameraBusy,setCameraBusy]=useState(false);
 const [cameraWarning,setCameraWarning]=useState("");
 const [remoteHasVideo,setRemoteHasVideo]=useState(false);
 const [remoteVideoReady,setRemoteVideoReady]=useState(false);
 const [localPreviewReady,setLocalPreviewReady]=useState(false);
 const [localPreviewHelp,setLocalPreviewHelp]=useState("");
 const current=useRef<Call|null>(null);
 const pc=useRef<RTCPeerConnection|null>(null);
 const iceServers=useRef<RTCIceServer[]>(STUN_SERVERS);
 const local=useRef<MediaStream|null>(null);
 const remote=useRef<HTMLAudioElement|null>(null);
 const remoteStream=useRef<MediaStream|null>(null);
 const remoteVideo=useRef<HTMLVideoElement|null>(null);
 const localVideo=useRef<HTMLVideoElement|null>(null);
 const cameraSwitching=useRef(false);
 const cancelPendingStart=useRef(false);
 const playLocalPreview=useCallback(async()=>{
  const element=localVideo.current;
  const track=local.current?.getVideoTracks().find(video=>video.readyState==="live");
  if(!element)return;
  if(!track){
   element.srcObject=null;
   setLocalPreviewReady(false);
   setLocalPreviewHelp("Aucune image caméra. Vérifie l’autorisation de la caméra.");
   return;
  }
  // On iPhone, use a video-only MediaStream to avoid muting the local microphone.
  const bound=element.srcObject instanceof MediaStream
   ?element.srcObject.getVideoTracks()[0]:null;
  if(bound!==track)element.srcObject=new MediaStream([track]);
  element.muted=true;
  element.playsInline=true;
  try{
   await element.play();
   if(localVideo.current===element&&track.readyState==="live"&&!track.muted&&element.videoWidth>0){
    setLocalPreviewReady(true);setLocalPreviewHelp("");
   }else if(localVideo.current===element){setLocalPreviewHelp("Ouverture de la caméra…")}
  }catch{
   if(localVideo.current===element){
    setLocalPreviewReady(false);
    setLocalPreviewHelp("Appuie pour afficher ta caméra.");
   }
  }
 },[]);
 const attachRemoteVideo=useCallback((element:HTMLVideoElement|null)=>{
  remoteVideo.current=element;
  if(element){element.srcObject=remoteStream.current;if(remoteStream.current)void element.play().catch(()=>{})}
 },[]);
 const revealLocalFrame=useCallback(()=>{
  const element=localVideo.current;
  if(element&&element.videoWidth>0&&element.readyState>=2){
   setLocalPreviewReady(true);setLocalPreviewHelp("");
  }
 },[]);
 const attachLocalVideo=useCallback((element:HTMLVideoElement|null)=>{
  localVideo.current=element;
  if(element){setLocalPreviewReady(false);void playLocalPreview()}
 },[playLocalPreview]);
 const signalAfter=useRef(0);
 const isPolling=useRef(false);
 const starting=useRef(false);
 const offered=useRef(false);
 const answered=useRef(false);
 const suppressed=useRef("");
 const connectedSince=useRef(0);
 const pendingSystemAnswer=useRef<string|null>(null);
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
  // Stop the native microphone service on any end, reset or room change.
  void endNativeCallSession().catch(error=>console.warn("Native call cleanup",error));
  const p=pc.current;
  pc.current=null;
  if(p){p.ontrack=null;p.onicecandidate=null;p.onconnectionstatechange=null;p.oniceconnectionstatechange=null;p.close()}
  if(local.current){local.current.getTracks().forEach(track=>track.stop());local.current=null}
  if(remote.current){remote.current.pause();remote.current.srcObject=null}
  if(remoteVideo.current){remoteVideo.current.pause();remoteVideo.current.srcObject=null}
  if(localVideo.current){localVideo.current.pause();localVideo.current.srcObject=null}
  if(remoteStream.current){remoteStream.current.getTracks().forEach(track=>track.stop());remoteStream.current=null}
  releaseCallAudio();
  offered.current=false;answered.current=false;connectedSince.current=0;
  signalAfter.current=0;
  queuedCandidates.current=[];sessionDescriptionSent.current=false;sendingCandidates.current=false;
  const audioSession=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;
  if(audioSession){try{audioSession.type="auto"}catch{/* Browser controls audio routing. */}}
  previousSinkId.current="";
  setMuted(false);setNeedsPlay(false);setDuration(0);setSpeakerHelp("");setSpeakerSelected(false);setSpeakerBusy(false);setMinimized(false);setCallPanel("none");setDialed("");
  cameraSwitching.current=false;setCameraOff(false);setCameraFacing("user");setCameraBusy(false);setCameraWarning("");setRemoteHasVideo(false);setRemoteVideoReady(false);setLocalPreviewReady(false);setLocalPreviewHelp("");
 },[]);
 const reset=useCallback(()=>{
  const endedId=current.current?.id;
  clearAudio();
  if(endedId)nativeVoipEnd(endedId);
  current.current=null;
  setActive(null);setBusy(false);setPhase("");setError("");
 },[clearAudio]);
 const setCurrent=useCallback((call:Call)=>{
  if(current.current?.id!==call.id){
   if(current.current)clearAudio();
   setMinimized(false);setCallPanel("none");setDialed("");
   setError("");setPhase(call.direction==="incoming"?(call.mode==="video"?"Appel vidéo entrant…":"Appel vocal entrant…"):"Appel en cours…");
  }
  current.current=call;
  claimCallAudio(); // Incoming and outgoing calls silence any message or video audio.
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
  if(current.current?.mode==="video"){
   const videos=local.current.getVideoTracks();
   if(videos.length)for(const track of videos)peer.addTrack(track,local.current);
   else peer.addTransceiver("video",{direction:"recvonly"});
  }
  peer.ontrack=event=>{
   if(pc.current!==peer)return;
   const stream=remoteStream.current||new MediaStream();
   remoteStream.current=stream;
   for(const track of event.streams[0]?.getTracks()||[event.track]){
    if(!stream.getTracks().some(other=>other.id===track.id))stream.addTrack(track);
   }
   if(event.track.kind==="video"){
    setRemoteHasVideo(!event.track.muted);
    event.track.onmute=()=>setRemoteHasVideo(false);
    event.track.onunmute=()=>setRemoteHasVideo(true);
    event.track.onended=()=>setRemoteHasVideo(false);
   }
   const el=remote.current;
   if(el){el.srcObject=stream;void el.play().then(()=>setNeedsPlay(false)).catch(()=>setNeedsPlay(true))}
   const video=remoteVideo.current;
   if(video){video.srcObject=stream;void video.play().catch(()=>{})}
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
   else if(peer.connectionState==="connecting")setPhase(current.current?.mode==="video"?"Connexion vidéo…":"Connexion audio…");
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
   if(!peer.localDescription)await peer.setLocalDescription(await peer.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:call.mode==="video"}));
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
  if(isPolling.current||starting.current||(document.visibilityState==="hidden"&&!isNativeApp))return;
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
   else if(current.current.status!==call.status||current.current.mode!==call.mode){current.current=call;setActive(call)}
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
  // Prepare native background audio only once the caller/recipient explicitly
  // started microphone capture while the Android activity was still visible.
  if(!isNativeApp)return;
  if(active?.status!=="active"||!local.current){
   void endNativeCallSession().catch(()=>{});
   return;
  }
  const callId=active.id;
  void beginNativeCallSession(callId,token).catch(error=>{
   if(current.current?.id===callId)
    setError("Appel en arrière-plan indisponible sur ce téléphone : "+
     (error instanceof Error?error.message:"service natif non chargé."));
  });
 },[active?.id,active?.status,token]);
 useEffect(()=>{
  if(!active||active.status!=="active")return;
  const ping=()=>{
   // Native layer keeps the server lease alive when JS timers are suspended.
   if(nativeCallSessionRunning(active.id))return;
   if(document.visibilityState==="visible")void api("heartbeat",{id:active.id}).catch(()=>{});
  };
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

 async function microphone(mode:"audio"|"video"="audio"){
  if(!navigator.mediaDevices?.getUserMedia)throw Error("Ouvre l’application en HTTPS et autorise l’accès au microphone.");
  const audio:MediaTrackConstraints={echoCancellation:true,noiseSuppression:true};
  const video:MediaTrackConstraints|false=mode==="video"?{
   facingMode:{ideal:"user"},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}
  }:false;
  let stream:MediaStream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio,video})}
  catch(err){
   if(mode!=="video")throw err;
   // Safari can reject optional HD constraints: retry with basic video.
   // Never silently ring with audio-only when the caller expects video.
   try{stream=await navigator.mediaDevices.getUserMedia({audio,video:true})}
   catch{throw Error("Caméra indisponible. Autorise la caméra pour Love Radar dans les réglages de ton iPhone, puis réessaie.")}
   setCameraWarning("");
  }
  local.current=stream;
  if(localVideo.current)void playLocalPreview();
  const audioSession=(navigator as Navigator & {audioSession?:{type:string}}).audioSession;
  if(audioSession){try{audioSession.type="play-and-record"}catch{/* Unsupported session type. */}}
 }
 async function start(mode:"audio"|"video"="audio"){
  if(busy||starting.current||current.current||!hasPartner)return;
  claimCallAudio();
  cancelPendingStart.current=false;
  setBusy(true);starting.current=true;setError("");setCameraWarning("");
  // iOS camera permission must start in the user gesture, not after signaling.
  const micTask=microphone(mode);
  if(mode==="video"){
   setLocalPreviewReady(false);
   setActive({id:"preparing-video",status:"ringing",direction:"outgoing",mode:"video",
    createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+60000});
   setPhase("Ouverture de la caméra…");
  }
  const callTask=api("start",{mode});
  const networkTask=warmNetwork();
  try{
   const [result]=await Promise.all([callTask,micTask]);
   if(cancelPendingStart.current){
    if(result.call?.direction==="outgoing")void api("end",{id:result.call.id}).catch(()=>{});
    reset();return;
   }
   await networkTask;
   if(cancelPendingStart.current){
    if(result.call?.direction==="outgoing")void api("end",{id:result.call.id}).catch(()=>{});
    reset();return;
   }
   if(!result.call)throw Error("Appel non créé.");
   if(result.call.direction==="incoming"){
    local.current?.getTracks().forEach(track=>track.stop());
    local.current=null;
   }else if(result.call.mode!=="video"&&local.current?.getVideoTracks().length){
    // An already-existing voice call must never retain a camera captured for a video request.
    local.current.getVideoTracks().forEach(track=>{local.current?.removeTrack(track);track.stop()});
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
   reset();
   if(!cancelPendingStart.current)setError(err instanceof Error?err.message:"Impossible d’appeler.");
  }finally{starting.current=false;setBusy(false)}
 }
 async function accept(){
  const c=current.current;
  if(!c||c.direction!=="incoming"||busy)return;
  claimCallAudio();
  setBusy(true);setError("");
  try{
   await Promise.all([microphone(c.mode==="video"?"video":"audio"),warmNetwork()]);
   createPeer();
   await api("accept",{id:c.id});
   const updated={...c,status:"active" as const};
   current.current=updated;setActive(updated);setPhase("Connexion en cours…");
   nativeVoipAnswered(c.id);
   void sync();
  }catch(err){
   clearAudio();
   setError(err instanceof Error?err.message:"Impossible de décrocher.");
  }finally{setBusy(false)}
 }
 useEffect(()=>{
  if(!hasPartner||!hasNativeVoip())return;
  let disposed=false;
  let detach:(()=>void)|null=null;
  const onNativeCall=(action:NativeVoipAction)=>{
   if(action.action==="answer"){
    pendingSystemAnswer.current=action.callId;
    void sync();
   }else if(action.action==="end"){
    if(pendingSystemAnswer.current===action.callId)pendingSystemAnswer.current=null;
    if(current.current?.id===action.callId)reset();
   }
  };
  void activateNativeVoip(token,onNativeCall).then(cleanup=>{
   if(disposed)cleanup();
   else detach=cleanup;
  }).catch(error=>console.warn("iOS VoIP registration is not active",error));
  return()=>{disposed=true;detach?.();pendingSystemAnswer.current=null};
 },[token,hasPartner,sync,reset]);
 useEffect(()=>{
  const callId=pendingSystemAnswer.current;
  if(!callId||!active||active.id!==callId||active.direction!=="incoming"||local.current)return;
  pendingSystemAnswer.current=null;
  // Answer was selected on the system lock screen; resume the existing
  // WebRTC call once Capacitor has restored the private room and WebView.
  void accept();
 },[active?.id,active?.status,active?.direction]);
 async function hangup(){
  const c=current.current;
  if(!c&&starting.current){
   cancelPendingStart.current=true;setActive(null);clearAudio();return;
  }
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
 function toggleCamera(){
  if(current.current?.mode!=="video"||!local.current)return;
  const tracks=local.current.getVideoTracks();
  if(!tracks.length){setCameraWarning("Cette caméra est indisponible. Autorise-la puis rappelle.");return}
  const next=!cameraOff;
  tracks.forEach(track=>{track.enabled=!next});
  setCameraOff(next);
  if(next)setLocalPreviewReady(false);
  else void playLocalPreview();
 }
 async function switchCamera(){
  if(current.current?.mode!=="video"||!local.current||cameraSwitching.current)return;
  const sender=pc.current?.getSenders().find(item=>item.track?.kind==="video");
  const existing=local.current.getVideoTracks()[0];
  if(!existing){setCameraWarning("Aucune caméra disponible. Vérifie son autorisation.");return}
  cameraSwitching.current=true;setCameraBusy(true);setCameraWarning("");
  const oldFacing=cameraFacing,nextFacing=oldFacing==="user"?"environment":"user";
  const acquire=(facing:"user"|"environment")=>navigator.mediaDevices.getUserMedia({
   audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}}
  });
  let replacement:MediaStream|null=null,stopped=false,adopted=false;
  try{
   try{replacement=await acquire(nextFacing)}
   catch{
    // Safari on iPhone sometimes allows only one camera stream at a time.
    existing.stop();stopped=true;replacement=await acquire(nextFacing);
   }
   const track=replacement.getVideoTracks()[0];
   if(!track)throw Error("Aucune caméra détectée.");
   track.enabled=!cameraOff;
   // The outgoing caller has no video sender until the call is answered.
   if(sender)await sender.replaceTrack(track);
   local.current.removeTrack(existing);local.current.addTrack(track);
   if(!stopped)existing.stop();
   adopted=true;
   setLocalPreviewReady(false);
   if(localVideo.current)void playLocalPreview();
   setCameraFacing(nextFacing);
   setCameraWarning("");
  }catch(err){
   if(stopped){
    try{
     const restored=await acquire(oldFacing),track=restored.getVideoTracks()[0];
     if(track){
      track.enabled=!cameraOff;if(sender)await sender.replaceTrack(track);
      local.current.removeTrack(existing);local.current.addTrack(track);
      setLocalPreviewReady(false);
      if(localVideo.current)void playLocalPreview();
     }
    }catch{setCameraOff(true);setLocalPreviewReady(false)}
   }
   setCameraWarning("Changement de caméra impossible : "+(err instanceof Error?err.message:"réessaie plus tard."));
  }finally{
   if(replacement&&!adopted)replacement.getTracks().forEach(track=>track.stop());
   cameraSwitching.current=false;setCameraBusy(false);
  }
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
  const call=current.current;
  if(!call)return;
  // Keep the video peer and camera alive while sending messages, even during ringing.
  if(call.status!=="active"&&!(call.status==="ringing"&&call.direction==="outgoing"))return;
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
 const isVideo=active?.mode==="video";
 const showPartnerFullscreen=Boolean(isVideo&&active?.status==="active"&&remoteVideoReady);
 const callStatus=isIncoming?(isVideo?"Appel vidéo entrant…":"Appel vocal entrant…"):isOutgoing?(isVideo?"Appel vidéo sortant…":"Appel en cours…"):phase||"Connexion en cours…";
 const display=active&&(!minimized||(active.status==="ringing"&&active.direction==="incoming"))?createPortal(
  <div className="lr-call-backdrop" role="dialog" aria-modal="true" aria-label={isVideo?"Appel vidéo":"Appel audio"}>
   <div className={"lr-call-sheet lr-call-facetime"+(isVideo?" lr-video-call"+(active.direction==="outgoing"?" is-video-outgoing":""):"")}>
    <div className="lr-call-upper">
     <div className="lr-call-topbar">
      {(active.status==="active"||active.direction==="outgoing")?<button type="button" className="lr-call-minimize" onClick={minimizeAndWrite} aria-label="Réduire l’appel et écrire des messages">
       <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>Réduire</span>
      </button>:<span className="lr-call-top-spacer" aria-hidden="true"/>}
      <button type="button" className="lr-call-info-button" aria-label="Informations sur l’appel" onClick={()=>setCallPanel("info")}>
       <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 11v6M12 7h.01"/></svg>
      </button>
     </div>
     <div className="lr-call-identity">
      <div className="lr-call-initial" aria-label={"Avatar de "+partner}>{avatarSrc?<img src={avatarSrc} alt={"Photo de "+partner}/>:partner.trim().charAt(0).toUpperCase()||"♡"}</div>
      <div className="lr-call-identification">
       <div className="lr-call-brand">{isVideo?"Appel vidéo HD":"Appel audio"}</div>
       <div className="lr-call-duration" aria-label={"Durée de l’appel : "+total}>{active.status==="active"&&connectedSince.current?total:callStatus}</div>
       <h2>{partner}</h2>
       {active.status==="active"&&phase!=="Connecté"?<p className="lr-call-status" aria-live="polite">{phase||(isVideo?"Connexion vidéo…":"Connexion audio…")}</p>:null}
      </div>
     </div>
     <div className="lr-call-feedback">
      {error?<div className="lr-call-error" role="alert">{error}</div>:null}
      {needsPlay?<button type="button" className="lr-call-sound" onClick={enableAudio}>Activer le son</button>:null}
      {speakerHelp?<div className="lr-call-audio-hint" role="status">{speakerHelp}</div>:null}
      {networkHint&&active.status==="active"&&phase!=="Connecté"?<div className="lr-call-audio-hint" role="status">{networkHint}</div>:null}
      {cameraWarning&&isVideo?<div className="lr-call-audio-hint" role="status">{cameraWarning}</div>:null}
     </div>
    </div>
    {isVideo?<div className={"lr-call-video-stage"+(showPartnerFullscreen?" has-partner-video":" is-self-first")} aria-label={showPartnerFullscreen?"Vidéo de ton partenaire":"Ma caméra en plein écran"}>
     <div className="lr-call-video-remote">
      <video ref={attachRemoteVideo} autoPlay playsInline muted
       onPlaying={()=>setRemoteVideoReady(true)}
       onPause={()=>setRemoteVideoReady(false)}
       onWaiting={()=>setRemoteVideoReady(false)}
       aria-label={"Vidéo de "+partner}/>
      {!remoteVideoReady&&!localPreviewReady?<div className="lr-call-video-wait">
       <div className="lr-call-video-avatar">{avatarSrc?<img src={avatarSrc} alt=""/>:partner.trim().charAt(0).toUpperCase()||"♡"}</div>
       <strong>{partner}</strong>
       <span>{active.id==="preparing-video"?"Activation de ta caméra…":active.status==="ringing"?"En attente de réponse…":"En attente de la caméra du partenaire…"}</span>
      </div>:null}
     </div>
     <div className={"lr-call-video-self"+(cameraOff||!local.current?.getVideoTracks().some(track=>track.readyState==="live")?" is-camera-off":"")}>
      <video ref={attachLocalVideo} autoPlay playsInline muted
       onPlaying={revealLocalFrame} onLoadedData={revealLocalFrame} onLoadedMetadata={revealLocalFrame}
       onError={()=>{setLocalPreviewReady(false);setLocalPreviewHelp("Aperçu indisponible. Appuie pour réessayer.")}}
       aria-label="Ma caméra"/>
      {cameraOff||!local.current?.getVideoTracks().some(track=>track.readyState==="live")?
       <span>{active.id==="preparing-video"?"Ouverture de la caméra…":"Caméra indisponible"}</span>
      :!localPreviewReady?
       <button type="button" className="lr-call-video-self-help" onClick={()=>void playLocalPreview()} aria-label="Relancer ma caméra">{localPreviewHelp||"Afficher ma caméra"}</button>
      :null}
      <button type="button" className="lr-call-video-retry" onClick={()=>void playLocalPreview()} title="Rafraîchir ma caméra" aria-label="Rafraîchir ma caméra">↻</button>
     </div>
     <div className="lr-call-video-tag">{showPartnerFullscreen?"EN APPEL · VIDÉO":"MA CAMÉRA · EN DIRECT"}</div>
    </div>:null}
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
      {isVideo?<button type="button" className={"lr-call-action lr-call-camera"+(cameraOff?" is-muted":"")} onClick={toggleCamera} aria-label={cameraOff?"Activer la caméra":"Désactiver la caméra"} aria-pressed={!cameraOff}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>{cameraOff?<path d="M3 3 21 21" strokeWidth="2.6"/>:null}</svg></span>
       <span className="lr-call-control-label">{cameraOff?"Caméra off":"Caméra"}</span>
      </button>:null}
      {isVideo?<button type="button" className="lr-call-action lr-call-flip" onClick={()=>void switchCamera()} disabled={cameraBusy||!local.current?.getVideoTracks().length} aria-label="Changer de caméra">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 10a5 5 0 0 1 8-2m0 0V5m0 3h-3M17 14a5 5 0 0 1-8 2m0 0v3m0-3h3"/></svg></span>
       <span className="lr-call-control-label">{cameraBusy?"Changement…":"Retourner"}</span>
      </button>:null}
      <button type="button" className="lr-call-action lr-call-chat" onClick={minimizeAndWrite} aria-label="Réduire l’appel et ouvrir les messages">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11.2a8.3 8.3 0 0 1-8.5 8.3 10 10 0 0 1-3.6-.8L3 21l1.5-4.7a8.4 8.4 0 1 1 15.5-5.1Z"/><path d="M8 11h8M8 14.5h5"/></svg></span>
       <span className="lr-call-control-label">Messages</span>
      </button>
      <button type="button" className="lr-call-action lr-call-more" onClick={()=>setCallPanel("more")} aria-label="Plus d’options">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span>
       <span className="lr-call-control-label">Plus</span>
      </button>
      <button type="button" className="lr-call-action lr-call-decline lr-call-hangup" onClick={hangup} aria-label="Raccrocher" disabled={busy&&!starting.current}>
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M3 17.5c5.4-4.7 12.6-4.7 18 0M5 17.5V21M19 17.5V21"/></svg></span>
       <span className="lr-call-control-label">Raccrocher</span>
      </button>
      <button type="button" className="lr-call-action lr-call-keypad" onClick={()=>setCallPanel("keypad")} aria-label="Ouvrir le clavier d’appel">
       <span className="lr-call-control-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{[4,10,16].flatMap(y=>[4,10,16].map(x=><circle key={x+"-"+y} cx={x+2} cy={y+1} r="2.15"/>))}</svg></span>
       <span className="lr-call-control-label">Clavier</span>
      </button>
     </>}
    </div>
    {!isVideo&&callPanel!=="none"?<div className="lr-call-panel-backdrop" onClick={()=>setCallPanel("none")}>
     <div className="lr-call-panel" role="dialog" aria-modal="true" aria-label={callPanel==="info"?"Informations de l’appel":callPanel==="more"?"Plus d’options":"Clavier d’appel"} onClick={e=>e.stopPropagation()}>
      <div className="lr-call-panel-head">
       <strong>{callPanel==="info"?"Informations de l’appel":callPanel==="more"?"Plus d’options":"Clavier d’appel"}</strong>
       <button type="button" onClick={()=>setCallPanel("none")} aria-label="Fermer les options">×</button>
      </div>
      {callPanel==="info"?<div className="lr-call-panel-details">
       <p><span>Avec</span><strong>{partner}</strong></p>
       <p><span>Type</span><strong>{isVideo?"Appel vidéo":"Appel audio"}</strong></p>
       <p><span>État</span><strong>{callStatus}</strong></p>
       <p><span>Durée</span><strong>{total}</strong></p>
       <p><span>Relais audio</span><strong>{relayEnabled?"Disponible":"Non confirmé"}</strong></p>
      </div>:callPanel==="more"?<div className="lr-call-panel-options">
       <button type="button" onClick={minimizeAndWrite}>Écrire un message pendant l’appel</button>
       {isVideo?<button type="button" onClick={()=>{setCallPanel("none");toggleCamera()}}>{cameraOff?"Activer ma caméra":"Couper ma caméra"}</button>:null}
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
 const mini=active&&minimized&&(active.status==="active"||(active.status==="ringing"&&active.direction==="outgoing"))?createPortal(
  <div className={"lr-call-mini"+(isVideo?" lr-call-mini-video":"")} role="region" aria-label={(isVideo?"Appel vidéo":"Appel vocal")+" en cours avec "+partner}>
   {isVideo?<div className="lr-call-mini-preview" aria-hidden="true"><video ref={attachRemoteVideo} autoPlay playsInline muted/>{!remoteHasVideo?<span>📹</span>:null}</div>:null}
   <button type="button" className="lr-call-mini-expand" onClick={()=>setMinimized(false)} aria-label="Agrandir l’appel" title="Revenir à l’appel">
    <span className="lr-call-mini-pulse" aria-hidden="true">●</span>
    <span className="lr-call-mini-info"><strong>{active.status==="ringing"?"Appel sortant…":phase==="Connecté"?"En appel":phase||"Appel en cours"} · {partner}</strong><small>{total} · Appuyer pour agrandir</small></span>
    <span className="lr-call-mini-up" aria-hidden="true">⌃</span>
   </button>
   <div className="lr-call-mini-actions">
    {needsPlay?<button type="button" onClick={enableAudio} className="lr-call-mini-sound" aria-label="Activer le son">🔊</button>:null}
    <button type="button" className={"lr-call-mini-speaker "+(speakerSelected?"active":"")} onClick={selectSpeaker} disabled={speakerBusy} aria-pressed={speakerSelected} aria-label={speakerSelected?"Désactiver le haut-parleur":"Activer le haut-parleur"}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/></svg></button>
    <button type="button" className={"lr-call-mini-mute "+(muted?"active":"")} onClick={toggleMute} disabled={!local.current} aria-label={muted?"Réactiver le micro":"Couper le micro"} aria-pressed={muted}>{muted?"🔇":"🎙️"}</button>
    {isVideo?<button type="button" onClick={toggleCamera} aria-pressed={!cameraOff} aria-label={cameraOff?"Activer la caméra":"Couper la caméra"}>{cameraOff?"📷":"📹"}</button>:null}
    <button type="button" className="lr-call-mini-end" onClick={hangup} disabled={busy} aria-label="Raccrocher">✕</button>
   </div>
  </div>,document.body):null;
 const videoOptions=active&&isVideo&&callPanel!=="none"?createPortal(
  <div className="lr-video-options-backdrop" onClick={event=>{if(event.target===event.currentTarget)setCallPanel("none")}}>
   <section className="lr-video-options-sheet" role="dialog" aria-modal="true" aria-label={callPanel==="info"?"Informations de l’appel vidéo":"Options de l’appel vidéo"}>
    <div className="lr-video-options-grip" aria-hidden="true"/>
    <div className="lr-video-options-head">
     <div><small>LOVE RADAR · APPEL VIDÉO</small><h3>{callPanel==="info"?"Détails de l’appel":"Options de l’appel"}</h3></div>
     <button type="button" className="lr-video-options-close" onClick={()=>setCallPanel("none")} aria-label="Fermer les options">×</button>
    </div>
    {callPanel==="info"?<div className="lr-video-options-detail">
     <p><span>Avec</span><strong>{partner}</strong></p>
     <p><span>Statut</span><strong>{callStatus}</strong></p>
     <p><span>Durée</span><strong>{total}</strong></p>
     <p><span>Type</span><strong>Vidéo privée</strong></p>
     <p><span>Relais réseau</span><strong>{relayEnabled?"Disponible":"Non confirmé"}</strong></p>
     <button type="button" onClick={()=>setCallPanel("more")}>Retour aux options</button>
    </div>:<div className="lr-video-options-list">
     <button type="button" onClick={minimizeAndWrite}>
      <span className="lr-video-options-glyph" aria-hidden="true">✉</span><span><strong>Messages</strong><small>Écrire sans raccrocher, même pendant la sonnerie</small></span><b aria-hidden="true">›</b>
     </button>
     <button type="button" onClick={()=>{setCallPanel("none");toggleCamera()}}>
      <span className="lr-video-options-glyph" aria-hidden="true">▣</span><span><strong>{cameraOff?"Réactiver la caméra":"Désactiver la caméra"}</strong><small>Gérer ce que voit ton partenaire</small></span><b aria-hidden="true">›</b>
     </button>
     <button type="button" onClick={()=>{setCallPanel("none");void switchCamera()}}>
      <span className="lr-video-options-glyph" aria-hidden="true">⇄</span><span><strong>Retourner la caméra</strong><small>Passer de la caméra avant à l’arrière</small></span><b aria-hidden="true">›</b>
     </button>
     <button type="button" onClick={()=>{setCallPanel("none");void selectSpeaker()}}>
      <span className="lr-video-options-glyph" aria-hidden="true">◖))</span><span><strong>Sortie audio</strong><small>{speakerSelected?"Haut-parleur sélectionné":"Choisir un haut-parleur disponible"}</small></span><b aria-hidden="true">›</b>
     </button>
     <button type="button" onClick={()=>setCallPanel("info")}>
      <span className="lr-video-options-glyph" aria-hidden="true">ⓘ</span><span><strong>Informations de connexion</strong><small>Statut, durée et réseau</small></span><b aria-hidden="true">›</b>
     </button>
    </div>}
   </section>
  </div>,document.body):null;
 return <>
  {anchor&&createPortal(<><button type="button" className="lr-call-trigger" onClick={()=>void start("audio")} disabled={!hasPartner||busy||Boolean(active)} aria-label="Appeler en vocal" title="Appeler en vocal"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.8v3a2 2 0 0 1-2.2 2A19.5 19.5 0 0 1 2.2 4.2 2 2 0 0 1 4.2 2h3a2 2 0 0 1 2 1.7l.6 3.1a2 2 0 0 1-.6 1.9L7.7 10a16 16 0 0 0 6.3 6.3l1.4-1.5a2 2 0 0 1 1.9-.6l3.1.6a2 2 0 0 1 1.6 1.9Z"/></svg></button>
   <button type="button" className="lr-video-trigger" onClick={()=>void start("video")} disabled={!hasPartner||busy||Boolean(active)} aria-label="Appeler en vidéo HD" title="Appeler en vidéo">
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="14" height="13" rx="3"/><path d="m16.5 10 5-3v10l-5-3"/></svg>
   </button></>,anchor)}
  {error&&!active?<div className="lr-call-toast" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fermer">×</button></div>:null}
  <audio ref={remote} data-lr-call-audio="true" autoPlay playsInline aria-label="Voix de ton partenaire"/>
  {display}
  {mini}
  {videoOptions}
 </>;
}
