import {useEffect,useRef,useState} from "react";
import LensPicker from "./LensPicker";
import {isCallAudioActive} from "./audio-focus";
import {createLensProcessor,type LensProcessor,type LoveLensId} from "./love-lenses";
import "./fun-camera.css";

type Props={partner:string|null;onBack:()=>void;onSendPhoto:(file:File)=>Promise<boolean>;onOpenChat:()=>void};
const cameraSettings=(facing:"user"|"environment"):MediaStreamConstraints=>({
 audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}
});
function formatRecording(seconds:number){return "00:"+String(seconds).padStart(2,"0")}
export default function FunCamera({partner,onBack,onSendPhoto,onOpenChat}:Props){
 const preview=useRef<HTMLVideoElement|null>(null);
 const canvasHost=useRef<HTMLDivElement|null>(null);
 const source=useRef<MediaStream|null>(null);
 const processor=useRef<LensProcessor|null>(null);
 const recorder=useRef<MediaRecorder|null>(null);
 const recordParts=useRef<Blob[]>([]);
 const elapsedTimer=useRef<ReturnType<typeof setInterval>|null>(null);
 const photoRef=useRef<string|null>(null),videoRef=useRef<string|null>(null);
 const alive=useRef(true);
 const [active,setActive]=useState(false);
 const [busy,setBusy]=useState(false);
 const [facing,setFacing]=useState<"user"|"environment">("user");
 const [lens,setLens]=useState<LoveLensId>("none");
 const [tracking,setTracking]=useState<"loading"|"ready"|"missing"|"unavailable">("loading");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [photo,setPhoto]=useState<Blob|null>(null);
 const [photoUrl,setPhotoUrl]=useState("");
 const [recorded,setRecorded]=useState<Blob|null>(null);
 const [recordedUrl,setRecordedUrl]=useState("");
 const [recording,setRecording]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const [sending,setSending]=useState(false);
 function mountCanvas(){
  const host=canvasHost.current,canvas=processor.current?.canvas;
  if(!host||!canvas)return;
  if(canvas.parentNode!==host)host.replaceChildren(canvas);
 }
 function unmountCanvas(){canvasHost.current?.replaceChildren()}
 function clearOutputs(){
  if(photoRef.current){URL.revokeObjectURL(photoRef.current);photoRef.current=null}
  if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current=null}
  setPhoto(null);setPhotoUrl("");setRecorded(null);setRecordedUrl("");
 }
 function stopRecording(){
  if(elapsedTimer.current){clearInterval(elapsedTimer.current);elapsedTimer.current=null}
  if(recorder.current&&recorder.current.state!=="inactive")recorder.current.stop();
  setRecording(false);
 }
 function cleanup(){
  stopRecording();
  processor.current?.stop();processor.current=null;
  unmountCanvas();
  source.current?.getTracks().forEach(track=>track.stop());source.current=null;
  if(preview.current){preview.current.pause();preview.current.srcObject=null}
 }
 useEffect(()=>{
  if(!active||lens==="none"){setTracking("loading");return}
  const interval=setInterval(()=>{
   const status=processor.current?.trackingStatus()||"loading";
   setTracking(current=>current===status?current:status);
  },400);
  return()=>clearInterval(interval);
 },[active,lens]);
 useEffect(()=>{
  alive.current=true;
  return()=>{
   alive.current=false;
   if(elapsedTimer.current)clearInterval(elapsedTimer.current);
   const r=recorder.current;
   if(r){r.onstop=null;r.ondataavailable=null;if(r.state!=="inactive")r.stop()}
   processor.current?.stop();unmountCanvas();source.current?.getTracks().forEach(t=>t.stop());
   if(preview.current){preview.current.pause();preview.current.srcObject=null}
   if(photoRef.current)URL.revokeObjectURL(photoRef.current);
   if(videoRef.current)URL.revokeObjectURL(videoRef.current);
  };
 },[]);
 async function show(stream:MediaStream){
  if(!preview.current)return;
  preview.current.srcObject=stream;preview.current.muted=true;preview.current.playsInline=true;
  await preview.current.play();
 }
 // The camera <video> mounts only after active becomes true; attach after commit.
 useEffect(()=>{
  if(!active||!source.current)return;
  mountCanvas();
  void show(source.current).catch(()=>{
   if(alive.current)setError("Impossible d’afficher l’aperçu de la caméra.");
  });
 },[active]);
 async function openCamera(){
  if(busy)return;
  setError("");setBusy(true);clearOutputs();
  try{
   if(isCallAudioActive())throw Error("Un appel est déjà en cours. Utilise les effets ✨ de l’appel vidéo ou termine-le avant d’ouvrir le studio.");
   if(!navigator.mediaDevices?.getUserMedia)throw Error("Ouvre Love Radar en HTTPS et autorise la caméra.");
   const camera=await navigator.mediaDevices.getUserMedia(cameraSettings(facing));
   if(!alive.current){camera.getTracks().forEach(t=>t.stop());return}
   source.current=camera;
   await show(camera);
   if(lens!=="none"){
    const processed=await createLensProcessor(camera.getVideoTracks()[0],lens,{previewOnly:true});
    processor.current=processed;
   }
   setActive(true);
  }catch(err){
   cleanup();setActive(false);
   setError(err instanceof Error?err.message:"Caméra indisponible. Autorise la caméra dans les réglages de ton téléphone.");
  }finally{if(alive.current)setBusy(false)}
 }
 async function chooseLens(value:LoveLensId){
  if(recording||busy)return;
  if(!source.current){setLens(value);return}
  setError("");setBusy(true);
  try{
   if(value==="none"){
    await show(source.current);
    processor.current?.stop();processor.current=null;
    unmountCanvas();
   }else if(processor.current){
    processor.current.setLens(value);
   }else{
    const next=await createLensProcessor(source.current.getVideoTracks()[0],value,{previewOnly:true});
    if(!alive.current){next.stop();return}
    processor.current=next;
    mountCanvas();
   }
   if(alive.current){setLens(value);setTracking("loading");setNotice(value==="none"?"Caméra naturelle.":"Recherche du visage…");}
  }catch(err){if(alive.current)setError(err instanceof Error?err.message:"Impossible d’appliquer cet effet.")}
  finally{if(alive.current)setBusy(false)}
 }
 async function flip(){
  if(!source.current||busy||recording)return;
  setBusy(true);setError("");
  const next=facing==="user"?"environment":"user";
  const original=source.current;
  let stream:MediaStream|null=null,stoppedOld=false;
  try{
   try{stream=await navigator.mediaDevices.getUserMedia(cameraSettings(next))}
   catch{
    // Some iPhones support only one active camera at a time.
    original.getTracks().forEach(t=>t.stop());stoppedOld=true;
    stream=await navigator.mediaDevices.getUserMedia(cameraSettings(next));
   }
   if(!alive.current){stream.getTracks().forEach(t=>t.stop());return}
   if(processor.current){
    await processor.current.setSource(stream.getVideoTracks()[0]);
    await show(stream);
   }else await show(stream);
   source.current=stream;
   original.getTracks().forEach(t=>t.stop());
   setFacing(next);
  }catch(err){
   stream?.getTracks().forEach(t=>t.stop());
   if(stoppedOld){
    try{
     const restored=await navigator.mediaDevices.getUserMedia(cameraSettings(facing));
     source.current=restored;
     if(processor.current){await processor.current.setSource(restored.getVideoTracks()[0]);await show(restored)}
     else await show(restored);
    }catch{cleanup();setActive(false)}
   }
   setError("Impossible de changer de caméra : "+(err instanceof Error?err.message:"réessaie."));
  }finally{if(alive.current)setBusy(false)}
 }
 async function takePhoto(){
  if(!active||recording||busy)return;
  setError("");setNotice("");
  try{
   const video=preview.current;
   if(!video||video.readyState<2)throw Error("L’image caméra n’est pas encore prête.");
   const canvas=processor.current?.canvas||document.createElement("canvas");
   if(!processor.current){
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext("2d")?.drawImage(video,0,0);
   }
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.88));
   if(!blob||!blob.size)throw Error("Photo indisponible.");
   if(photoRef.current)URL.revokeObjectURL(photoRef.current);
   const url=URL.createObjectURL(blob);photoRef.current=url;
   setPhoto(blob);setPhotoUrl(url);setRecorded(null);setRecordedUrl("");
   setNotice("Ta photo avec effet est prête ❤️");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de prendre la photo.")}
 }
 function recordVideo(){
  if(!active||recording||busy||recorder.current?.state==="recording")return;
  setError("");setNotice("");
  try{
   if(typeof MediaRecorder==="undefined")throw Error("L'enregistrement vidéo n'est pas pris en charge sur cet appareil.");
   const video=preview.current;
   const effectCanvas=processor.current?.canvas;
   if(effectCanvas&&typeof effectCanvas.captureStream!=="function")
    throw Error("Cet appareil ne peut pas filmer avec des effets. Utilise le bouton photo pour garder ton filtre.");
   const live=effectCanvas?effectCanvas.captureStream(20):source.current;
   if(!video||!live?.getVideoTracks().length)throw Error("Caméra indisponible.");
   const candidates=["video/mp4;codecs=h264","video/mp4","video/webm;codecs=vp8","video/webm"];
   const mime=candidates.find(type=>typeof MediaRecorder.isTypeSupported==="function"&&MediaRecorder.isTypeSupported(type));
   const session=new MediaRecorder(new MediaStream(live.getVideoTracks()),mime?{mimeType:mime}:undefined);
   recordParts.current=[];recorder.current=session;setRecording(true);setSeconds(0);
   session.ondataavailable=e=>{if(e.data.size)recordParts.current.push(e.data)};
   session.onstop=()=>{
    if(effectCanvas)live.getVideoTracks().forEach(track=>track.stop());
    if(elapsedTimer.current){clearInterval(elapsedTimer.current);elapsedTimer.current=null}
    if(!alive.current)return;
    const blob=new Blob(recordParts.current,{type:session.mimeType||mime||"video/webm"});
    if(blob.size){
     if(videoRef.current)URL.revokeObjectURL(videoRef.current);
     const url=URL.createObjectURL(blob);videoRef.current=url;
     setRecorded(blob);setRecordedUrl(url);setPhoto(null);setPhotoUrl("");
     setNotice("Vidéo enregistrée sur ce téléphone, prête à partager.");
    }else setError("Cette vidéo n'a pas pu être enregistrée.");
    recorder.current=null;setRecording(false);
   };
   session.onerror=()=>{if(effectCanvas)live.getVideoTracks().forEach(track=>track.stop());setError("L'enregistrement vidéo s'est interrompu.");};
   session.start(1000);
   let time=0;
   elapsedTimer.current=setInterval(()=>{
    time+=1;setSeconds(time);
    if(time>=20)stopRecording();
   },1000);
  }catch(err){recorder.current=null;setRecording(false);setError(err instanceof Error?err.message:"Enregistrement indisponible.")}
 }
 async function exportBlob(blob:Blob,name:string){
  setError("");setNotice("");
  const file=new File([blob],name,{type:blob.type});
  try{
   if(typeof navigator.share==="function"&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    await navigator.share({files:[file],title:"Love Radar ❤️"});
    return;
   }
  }catch(err){
   if((err as Error).name==="AbortError")return;
   // Fall back to a local download if the operating system rejects sharing.
  }
  const url=URL.createObjectURL(file);
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  setNotice("Fichier préparé : choisis où l’enregistrer.");
 }
 async function sendToPartner(){
  if(!photo||!partner||sending)return;
  setSending(true);setError("");
  try{
   const file=new File([photo],"love-radar-effet-"+Date.now()+".jpg",{type:"image/jpeg"});
   const sent=await onSendPhoto(file);
   if(!sent)throw Error("Envoi impossible. Vérifie ta connexion et les autorisations.");
   cleanup();onOpenChat();
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{if(alive.current)setSending(false)}
 }
 return <section className="lr-fun-camera" aria-label="Caméra fun avec effets Love Radar">
  <header className="lr-fun-camera-head">
   <button type="button" onClick={()=>{cleanup();onBack()}} aria-label="Quitter la caméra">‹</button>
   <div><small>LOVE RADAR · STUDIO</small><h1>Caméra fun <span>✨</span></h1></div>
   <span className="lr-fun-camera-badge">PRIVÉ</span>
  </header>
  <div className="lr-fun-preview">
   {active?<video ref={preview} autoPlay muted playsInline className={facing==="user"?"mirrored":""} aria-label="Aperçu caméra avec effet"/>:
    <div className="lr-fun-camera-placeholder"><span aria-hidden="true">📸</span><h2>Amuse-toi avec tes effets</h2><p>Prends des photos et de courtes vidéos, même sans être en appel.</p>
     <button type="button" disabled={busy} onClick={()=>void openCamera()}>{busy?"Ouverture…":"Activer ma caméra"}</button></div>}
   <div className={"lr-fun-processed-frame"+(facing==="user"?" mirrored":"")} ref={canvasHost} aria-hidden="true"/>
   {active&&lens!=="none"?<div className="lr-fun-face-status" role="status">
    {tracking==="unavailable"?"Suivi du visage indisponible sur cet appareil.":tracking==="missing"?"Place ton visage dans le cadre.":tracking==="loading"?"Détection du visage…":"Effet fixé sur ton visage ✓"}
   </div>:null}
   {active?<div className="lr-fun-preview-top"><span>● {recording?formatRecording(seconds):"EN DIRECT"}</span>
    <button type="button" onClick={()=>void flip()} disabled={busy||recording} aria-label="Retourner la caméra">⇄</button>
   </div>:null}
   {active?<div className="lr-fun-shutter">
    <button type="button" className="lr-fun-photo-shutter" onClick={()=>void takePhoto()} disabled={busy||recording} aria-label="Prendre une photo">◉</button>
    <button type="button" className={"lr-fun-record"+(recording?" is-recording":"")} onClick={recording?stopRecording:recordVideo}
     disabled={busy} aria-label={recording?"Arrêter l’enregistrement":"Enregistrer une vidéo de 20 secondes"}>{recording?"■ Arrêter":"● Vidéo"}</button>
   </div>:null}
  </div>
  {active?<div className="lr-fun-lenses"><div className="lr-fun-lenses-title"><strong>CHOISIS UN EFFET</strong><small>10 looks · en direct</small></div>
   <LensPicker value={lens} onSelect={value=>void chooseLens(value)} disabled={busy||recording}/></div>:null}
  {(photoUrl||recordedUrl)?<div className="lr-fun-result" aria-label="Votre création">
   <div className="lr-fun-result-head"><strong>{photoUrl?"Ta photo ❤️":"Ta vidéo 🎬"}</strong><button type="button" onClick={clearOutputs}>×</button></div>
   {photoUrl?<img src={photoUrl} alt="Ta photo avec effet"/>:<video src={recordedUrl} controls playsInline preload="metadata" aria-label="Vidéo enregistrée"/>}
   <div className="lr-fun-result-actions">
    <button type="button" onClick={()=>void exportBlob((photo||recorded)!,photoUrl?"love-radar-photo.jpg":"love-radar-video."+(recorded?.type.includes("mp4")?"mp4":"webm"))}>⇧ Enregistrer / partager</button>
    {photoUrl&&partner?<button type="button" disabled={sending} onClick={()=>void sendToPartner()}>{sending?"Envoi…":"💌 Envoyer à mon amour"}</button>:null}
   </div>
   {recordedUrl?<small>Les vidéos se partagent via ton téléphone. Elles ne sont pas envoyées automatiquement à ton partenaire.</small>:null}
  </div>:null}
  {error?<p role="alert" className="lr-fun-error">{error}</p>:null}
  {notice?<p role="status" className="lr-fun-notice">{notice}</p>:null}
  <p className="lr-fun-privacy">🔒 Les effets et la détection du visage fonctionnent sur ton appareil. Tu choisis si tu envoies une photo.</p>
 </section>;
}
