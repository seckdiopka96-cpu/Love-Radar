import {useState} from "react";
import {apiFetch} from "./api";
import "./connection-diagnostics.css";

type Check={name:string;state:"ok"|"warn"|"error";detail:string};
type Props={token:string;nativeApp:boolean};

/** Tests real device connectivity without sending messages or changing a call. */
export default function ConnectionDiagnostics({token,nativeApp}:Props){
 const [running,setRunning]=useState(false);
 const [microphoneBusy,setMicrophoneBusy]=useState(false);
 const [microphone,setMicrophone]=useState<Check|null>(null);
 const [checks,setChecks]=useState<Check[]>([]);
 async function readApi(path:string,timeoutMs:number){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const start=performance.now();
  try{
   const res=await apiFetch(path,{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal});
   const data=await res.json() as {ok?:boolean;relay?:boolean;iceServers?:unknown[];error?:string};
   return {res,data,ms:Math.round(performance.now()-start)};
  }finally{clearTimeout(timer)}
 }
 async function run(){
  if(running)return;
  setRunning(true);setChecks([]);
  const results:Check[]=[];
  if(!window.isSecureContext)results.push({name:"Connexion sécurisée",state:"error",detail:"Ouvre l’application en HTTPS."});
  else results.push({name:"Connexion sécurisée",state:"ok",detail:"HTTPS disponible."});
  try{
   const status=await readApi("/api/love?status=1",8500);
   results.push(status.res.ok&&status.data.ok&&status.ms<4000?
    {name:"Messagerie",state:"ok",detail:"Serveur accessible en "+status.ms+" ms."}:
    {name:"Messagerie",state:"warn",detail:status.res.ok?"Connexion lente : "+status.ms+" ms.":"Serveur indisponible ("+status.res.status+")."});
  }catch{
   results.push({name:"Messagerie",state:"error",detail:"Impossible de contacter le serveur depuis ce téléphone."});
  }
  try{
   const config=await readApi("/api/call-config",6500);
   results.push(!config.res.ok||!config.data.ok?
    {name:"Appels audio",state:"error",detail:"Impossible d’obtenir la configuration des appels."}:
    config.data.relay?
    {name:"Relais réseau TURN",state:"ok",detail:"Relais déclaré disponible. La qualité réelle reste à tester à deux."}:
    {name:"Relais réseau TURN",state:"warn",detail:"Relais non configuré ou indisponible. Certains appels mobiles peuvent échouer."});
  }catch{
   results.push({name:"Relais réseau TURN",state:"error",detail:"Impossible de vérifier le relais audio."});
  }
  results.push(typeof RTCPeerConnection!=="undefined"&&Boolean(navigator.mediaDevices?.getUserMedia)?
   {name:"Compatibilité des appels",state:"ok",detail:"WebRTC et microphone pris en charge. Teste l’audio avec ton partenaire."}:
   {name:"Compatibilité des appels",state:"error",detail:"WebRTC ou microphone indisponible sur cet appareil."});
  results.push(nativeApp?
   {name:"Notifications",state:"warn",detail:"La réception native doit être vérifiée sur ce téléphone."}:
   typeof Notification==="undefined"?
   {name:"Notifications",state:"warn",detail:"Notifications Web non prises en charge dans cette fenêtre."}:
   Notification.permission==="granted"?
   {name:"Notifications",state:"ok",detail:"Permission accordée. Teste également l’arrivée en écran verrouillé."}:
   {name:"Notifications",state:"warn",detail:"Permission non accordée. Active les notifications depuis les Paramètres."});
  setChecks(results);
  setRunning(false);
 }
 async function testMic(){
  if(microphoneBusy)return;
  setMicrophoneBusy(true);
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
   stream.getTracks().forEach(track=>track.stop());
   setMicrophone({name:"Microphone",state:"ok",detail:"Accès autorisé. Aucune voix n’a été enregistrée ni envoyée."});
  }catch{
   setMicrophone({name:"Microphone",state:"error",detail:"Accès refusé ou indisponible. Vérifie les autorisations du téléphone."});
  }finally{setMicrophoneBusy(false)}
 }
 return <section className="lr-diagnostics" aria-label="Diagnostics de ce téléphone">
  <div className="lr-diagnostics-copy"><strong>Tester ce téléphone</strong><small>Vérifie l’accès aux services, le relais des appels et les permissions. Aucun message n’est envoyé.</small></div>
  <div className="lr-diagnostics-actions">
   <button type="button" onClick={()=>void run()} disabled={running}>{running?"Vérification…":"Tester la connexion"}</button>
   <button type="button" disabled={microphoneBusy||!navigator.mediaDevices?.getUserMedia} onClick={()=>void testMic()}>{microphoneBusy?"Test…":"Tester le micro"}</button>
  </div>
  {checks.length||microphone?<div className="lr-diagnostics-results" role="status" aria-live="polite">
   {[...checks,...(microphone?[microphone]:[])].map(check=><div className="lr-diagnostics-result" key={check.name}>
    <span className={"lr-diagnostics-indicator is-"+check.state} aria-hidden="true">{check.state==="ok"?"✓":check.state==="warn"?"!":"×"}</span>
    <div><strong>{check.name}</strong><small>{check.detail}</small></div>
   </div>)}
  </div>:null}
  <p className="lr-diagnostics-note">Ce diagnostic ne valide pas l’arrivée de notifications quand l’app est fermée ni un appel réussi entre deux réseaux. Teste aussi avec deux vrais téléphones.</p>
 </section>;
}
