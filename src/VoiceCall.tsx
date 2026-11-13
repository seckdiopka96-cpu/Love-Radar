import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./voice-call.css";

type Call = {id:string;status:"ringing"|"active";direction:"incoming"|"outgoing";createdAt:number;updatedAt:number;expiresAt:number};
type Signal = {id:number;kind:"offer"|"answer";payload:string};
type Result = {ok:boolean;error?:string;call?:Call|null;signals?:Signal[]};
type Props = {token:string;partner:string;hasPartner:boolean;showButton:boolean};

const ICE_SERVERS:RTCIceServer[]=[
 {urls:"stun:stun.cloudflare.com:3478"},
 {urls:"stun:stun.l.google.com:19302"}
];
function iceReady(pc:RTCPeerConnection):Promise<void>{
 if(pc.iceGatheringState==="complete")return Promise.resolve();
 return new Promise(resolve=>{
  let done=false;
  const finish=()=>{if(done)return;done=true;pc.removeEventListener("icegatheringstatechange",check);clearTimeout(timeout);resolve()};
  const check=()=>{if(pc.iceGatheringState==="complete")finish()};
  const timeout=setTimeout(finish,10000);
  pc.addEventListener("icegatheringstatechange",check);
  check();
 });
}
export default function VoiceCall({token,partner,hasPartner,showButton}:Props){
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);
 const [active,setActive]=useState<Call|null>(null);
 const [busy,setBusy]=useState(false);
 const [muted,setMuted]=useState(false);
 const [phase,setPhase]=useState("");
 const [error,setError]=useState("");
 const [needsPlay,setNeedsPlay]=useState(false);
 const [speakerHelp,setSpeakerHelp]=useState("");
 const [speakerSelected,setSpeakerSelected]=useState(false);
 const [duration,setDuration]=useState(0);
 const current=useRef<Call|null>(null);
 const pc=useRef<RTCPeerConnection|null>(null);
 const local=useRef<MediaStream|null>(null);
 const remote=useRef<HTMLAudioElement|null>(null);
 const signalAfter=useRef(0);
 const isPolling=useRef(false);
 const starting=useRef(false);
 const offered=useRef(false);
 const answered=useRef(false);
 const suppressed=useRef("");
 const connectedSince=useRef(0);

 useEffect(()=>setAnchor(showButton?document.getElementById("lr-voice-button-slot"):null),[showButton]);
 const api=useCallback(async(action?:string,extra:Record<string,unknown>={},after=0):Promise<Result>=>{
  const res=await fetch("/api/call"+(!action?"?after="+after:""),{
   method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+token,...(action?{"Content-Type":"application/json"}:{})},
   ...(action?{body:JSON.stringify({action,...extra})}:{cache:"no-store" as RequestCache})
  });
  const data=await res.json() as Result;
  if(!res.ok||!data.ok)throw Error(data.error||"Le service d’appel ne répond pas.");
  return data;
 },[token]);
 const clearAudio=useCallback(()=>{
  const p=pc.current;
  pc.current=null;
  if(p){p.ontrack=null;p.onconnectionstatechange=null;p.oniceconnectionstatechange=null;p.close()}
  if(local.current){local.current.getTracks().forEach(track=>track.stop());local.current=null}
  if(remote.current){remote.current.pause();remote.current.srcObject=null}
  offered.current=false;answered.current=false;connectedSince.current=0;
  signalAfter.current=0;
  setMuted(false);setNeedsPlay(false);setDuration(0);setSpeakerHelp("");setSpeakerSelected(false);
 },[]);
 const reset=useCallback(()=>{
  clearAudio();
  current.current=null;
  setActive(null);setBusy(false);setPhase("");setError("");
 },[clearAudio]);
 const setCurrent=useCallback((call:Call)=>{
  if(current.current?.id!==call.id){
   if(current.current)clearAudio();
   setError("");setPhase(call.direction==="incoming"?"Appel vocal entrant…":"Appel en cours…");
  }
  current.current=call;
  setActive(call);
 },[clearAudio]);

 const createPeer=useCallback(()=>{
  if(pc.current)return pc.current;
  if(!local.current)throw Error("Le microphone doit être autorisé.");
  if(typeof RTCPeerConnection==="undefined")throw Error("Les appels vocaux ne sont pas compatibles avec cet appareil.");
  const peer=new RTCPeerConnection({iceServers:ICE_SERVERS});
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
    connectedSince.current=Date.now();setPhase("Connecté");setError("");
   }else if(peer.connectionState==="failed")setError("Connexion impossible sur ce réseau. Réessaie avec un autre Wi-Fi ou réseau mobile.");
   else if(peer.connectionState==="disconnected")setPhase("Reconnexion…");
  };
  pc.current=peer;
  return peer;
 },[]);
 const offer=useCallback(async(call:Call)=>{
  if(offered.current||!local.current)return;
  offered.current=true;
  try{
   const peer=createPeer();
   setPhase("Connexion en cours…");
   await peer.setLocalDescription(await peer.createOffer({offerToReceiveAudio:true}));
   await iceReady(peer);
   if(current.current?.id!==call.id||pc.current!==peer)return;
   if(!peer.localDescription?.sdp?.includes("a=candidate:"))throw Error("Impossible de trouver un chemin audio sur ce réseau. Essaie avec un autre Wi-Fi ou réseau mobile.");
   await api("signal",{id:call.id,kind:"offer",sdp:peer.localDescription.sdp});
  }catch(err){
   if(current.current?.id===call.id)setError(err instanceof Error?err.message:"Impossible de connecter l’appel.");
  }
 },[api,createPeer]);
 const receive=useCallback(async(call:Call,signal:Signal)=>{
  if(current.current?.id!==call.id||!local.current)return false;
  const peer=createPeer();
  if(signal.kind==="offer"&&call.direction==="incoming"&&!answered.current){
   answered.current=true;
   try{
    setPhase("Connexion en cours…");
    await peer.setRemoteDescription({type:"offer",sdp:signal.payload});
    await peer.setLocalDescription(await peer.createAnswer());
    await iceReady(peer);
    if(current.current?.id!==call.id||pc.current!==peer)return true;
    if(!peer.localDescription?.sdp?.includes("a=candidate:"))throw Error("Impossible d’établir un lien audio sur ce réseau. Change de Wi-Fi ou de réseau mobile.");
    await api("signal",{id:call.id,kind:"answer",sdp:peer.localDescription.sdp});
    return true;
   }catch(err){setError(err instanceof Error?err.message:"Réponse impossible.");return false}
  }
  if(signal.kind==="answer"&&call.direction==="outgoing"&&peer.signalingState==="have-local-offer"){
   try{await peer.setRemoteDescription({type:"answer",sdp:signal.payload});return true}
   catch(err){setError(err instanceof Error?err.message:"Connexion impossible.");return false}
  }
  return false;
 },[api,createPeer]);
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
   }
  }catch(err){if(current.current)setError(err instanceof Error?err.message:"Réseau indisponible.")}
  finally{isPolling.current=false}
 },[api,offer,receive,reset,setCurrent]);
 useEffect(()=>{
  if(!hasPartner)return;
  void sync();
  const interval=setInterval(()=>{void sync()},2000);
  const visible=()=>{if(document.visibilityState==="visible")void sync()};
  const focus=()=>{void sync()};
  document.addEventListener("visibilitychange",visible);
  window.addEventListener("focus",focus);
  return()=>{clearInterval(interval);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",focus)};
 },[sync,hasPartner]);
 useEffect(()=>{
  const tick=setInterval(()=>{if(connectedSince.current)setDuration(Math.floor((Date.now()-connectedSince.current)/1000))},1000);
  return()=>clearInterval(tick);
 },[]);
 useEffect(()=>()=>{const c=current.current;if(c)void api("end",{id:c.id}).catch(()=>{});clearAudio()},[api,clearAudio]);

 async function microphone(){
  if(!navigator.mediaDevices?.getUserMedia)throw Error("Ouvre Love Radar en HTTPS et autorise l’accès au microphone.");
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  local.current=stream;
 }
 async function start(){
  if(busy||current.current||!hasPartner)return;
  setBusy(true);starting.current=true;setError("");
  try{
   await microphone(); // called immediately after the user taps, for iOS permission.
   const result=await api("start");
   if(!result.call)throw Error("Appel non créé.");
   if(result.call.direction==="incoming"){
    local.current?.getTracks().forEach(track=>track.stop());
    local.current=null;
   }
   setCurrent(result.call);
   if(result.call.status==="active"&&result.call.direction==="outgoing")void offer(result.call);
  }catch(err){reset();setError(err instanceof Error?err.message:"Impossible d’appeler.");}
  finally{starting.current=false;setBusy(false)}
 }
 async function accept(){
  const c=current.current;
  if(!c||c.direction!=="incoming"||busy)return;
  setBusy(true);setError("");
  try{
   await microphone();
   createPeer();
   await api("accept",{id:c.id});
   const updated={...c,status:"active" as const};
   current.current=updated;setActive(updated);setPhase("Connexion en cours…");
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
 // Audio routing is only changeable where the browser exposes the audio-output devices.
 // On iPhone, device routing may remain under iOS control; do not pretend otherwise.
 async function selectSpeaker(){
  const audio=remote.current;
  if(!audio)return;
  try{
   audio.muted=false;
   audio.volume=1;
   if(audio.srcObject)await enableAudio();
   const method=(audio as HTMLAudioElement & {setSinkId?:(id:string)=>Promise<void>}).setSinkId;
   const devices=await navigator.mediaDevices?.enumerateDevices?.();
   const device=devices?.find(d=>d.kind==="audiooutput"&&/speaker|haut.parleur|built.in/i.test(d.label));
   if(typeof method==="function"&&device?.deviceId){
    await method.call(audio,device.deviceId);
    setSpeakerSelected(true);
    setSpeakerHelp("Sortie audio sélectionnée. Si le son ne change pas, utilise le contrôle audio du téléphone.");
   }else{
    setSpeakerSelected(false);
    setSpeakerHelp("Sur cet appareil, le haut-parleur est contrôlé par iOS ou Android. Utilise les commandes audio de ton téléphone.");
   }
  }catch{
   setSpeakerSelected(false);
   setSpeakerHelp("Ce navigateur ne permet pas de choisir le haut-parleur. Utilise les commandes audio du téléphone.");
  }
 }
 const isIncoming=active?.direction==="incoming"&&active.status==="ringing";
 const isOutgoing=active?.direction==="outgoing"&&active.status==="ringing";
 const total=String(Math.floor(duration/60)).padStart(2,"0")+":"+String(duration%60).padStart(2,"0");
 const callStatus=isIncoming?"Appel vocal entrant…":isOutgoing?"Appel en cours…":phase||"Connexion en cours…";
 const display=active?createPortal(
  <div className="lr-call-backdrop" role="dialog" aria-modal="true" aria-label="Appel vocal Love Radar">
   <div className="lr-call-sheet">
    <span className="lr-call-brand">APPEL VOCAL</span>
    <div className="lr-call-initial">{partner.trim().charAt(0).toUpperCase()}</div>
    <h2>{partner}</h2>
    <p className="lr-call-status" aria-live="polite">{callStatus}</p>
    <div className="lr-call-duration" aria-label={"Durée de l'appel : "+total}>{total}</div>
    {error?<div className="lr-call-error" role="alert">{error}</div>:null}
    {needsPlay?<button type="button" className="lr-call-sound" onClick={enableAudio}>Activer le son</button>:null}
    {speakerHelp?<div className="lr-call-audio-hint" role="status">{speakerHelp}</div>:null}
    <div className="lr-call-actions">
     {isIncoming?
      <>
       <button type="button" className="lr-call-action lr-call-decline" onClick={hangup} aria-label="Refuser l’appel" disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 17.5c5.4-4.7 12.6-4.7 18 0"/><path d="M5 17.5V21M19 17.5V21"/></svg><span>Refuser</span>
       </button>
       <button type="button" className="lr-call-action lr-call-answer" onClick={accept} aria-label="Décrocher" disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6.5c0 7.5 7 14.5 14.5 14.5l3-3.5-5-4-2 2c-2.5-1-4-2.5-5-5l2-2-4-5z"/></svg><span>Décrocher</span>
       </button>
      </>:
      <>
       <button type="button" className={"lr-call-action lr-call-mute "+(muted?"is-muted":"")} onClick={toggleMute} disabled={!local.current} aria-label={muted?"Réactiver le microphone":"Couper le microphone"} aria-pressed={muted}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>{muted?<path d="M3 3 21 21" strokeWidth="2.5"/>:null}</svg>
        <span>{muted?"Réactiver":"Muet"}</span>
       </button>
       <button type="button" className={"lr-call-action lr-call-speaker "+(speakerSelected?"is-selected":"")} onClick={selectSpeaker} aria-label="Haut-parleur" aria-pressed={speakerSelected}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9v6h4l5 4V5L7 9H3zM16 9a5 5 0 0 1 0 6M19 5a10 10 0 0 1 0 14"/></svg>
        <span>Haut-parleur</span>
       </button>
       <button type="button" className="lr-call-action lr-call-decline" onClick={hangup} aria-label="Raccrocher" disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 17.5c5.4-4.7 12.6-4.7 18 0"/><path d="M5 17.5V21M19 17.5V21"/></svg>
        <span>Raccrocher</span>
       </button>
      </>}
    </div>
    <small>La communication fonctionne lorsque Love Radar est ouvert.</small>
   </div>
  </div>,document.body):null;
 return <>
  {anchor&&createPortal(<button type="button" className="lr-call-trigger" onClick={start} disabled={!hasPartner||busy||Boolean(active)} aria-label="Appeler en vocal" title="Appeler en vocal"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.8v3a2 2 0 0 1-2.2 2A19.5 19.5 0 0 1 2.2 4.2 2 2 0 0 1 4.2 2h3a2 2 0 0 1 2 1.7l.6 3.1a2 2 0 0 1-.6 1.9L7.7 10a16 16 0 0 0 6.3 6.3l1.4-1.5a2 2 0 0 1 1.9-.6l3.1.6a2 2 0 0 1 1.6 1.9Z"/></svg></button>,anchor)}
  {error&&!active?<div className="lr-call-toast" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fermer">×</button></div>:null}
  <audio ref={remote} autoPlay playsInline aria-label="Voix de ton partenaire"/>
  {display}
 </>;
}
