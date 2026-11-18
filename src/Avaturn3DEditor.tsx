import {useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import {requiresTopLevelAvaturnAuth} from "./avaturn-auth";
import "./avaturn-3d.css";

type ExportResult={url:string;urlType:"dataURL"|"httpURL";avatarId:string;sessionId:string};
type Props={token:string;onSaved:()=>Promise<void>|void;onClose:()=>void};
const MAX_BYTES=12_000_000;
const configSubdomain=String(import.meta.env.VITE_AVATURN_SUBDOMAIN||"").trim().toLowerCase();
const isValidSubdomain=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(configSubdomain);
export const AVATURN_DEMO_MODE=!isValidSubdomain;
export const AVATURN_URL="https://"+(isValidSubdomain?configSubdomain:"demo")+".avaturn.dev";

async function uploadModel(bytes:ArrayBuffer,token:string):Promise<void>{
 if(bytes.byteLength<24||bytes.byteLength>MAX_BYTES)
  throw Error("Modèle trop volumineux : 12 Mo maximum.");
 const view=new DataView(bytes);
 if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||
    view.getUint32(8,true)!==bytes.byteLength)throw Error("Le fichier doit être un véritable modèle GLB.");
 const response=await apiFetch("/api/couple-avatar-model",{method:"POST",
  headers:{"Content-Type":"model/gltf-binary","Authorization":"Bearer "+token},
  body:bytes,cache:"no-store"});
 const result=await response.json() as {ok?:boolean;error?:string};
 if(!response.ok||!result.ok)throw Error(result.error||"Import 3D impossible.");
}
async function fromExport(result:ExportResult,token:string):Promise<void>{
 if(!result||typeof result.url!=="string"||
   !["dataURL","httpURL"].includes(result.urlType))throw Error("Export Avaturn incomplet.");
 if(result.urlType==="dataURL"){
  if(!/^data:[^,]{0,120};base64,/i.test(result.url)||
    result.url.length>MAX_BYTES*1.5)throw Error("Données 3D invalides.");
 }else if(!/^https:\/\//i.test(result.url))throw Error("Seul HTTPS est autorisé.");
 let response:Response;
 try{response=await fetch(result.url,{cache:"no-store",referrerPolicy:"no-referrer"})}
 catch{throw Error("Le téléchargement direct est bloqué par Avaturn. Télécharge le fichier GLB et utilise « Importer un GLB » ci-dessous.")}
 if(!response.ok)throw Error("Impossible de télécharger l'avatar Avaturn.");
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)throw Error("Modèle trop volumineux.");
 const bytes=await response.arrayBuffer();
 await uploadModel(bytes,token);
}
export default function Avaturn3DEditor({token,onSaved,onClose}:Props){
 const element=useRef<HTMLDivElement>(null);
 const sdkRef=useRef<{destroy:()=>void}|null>(null);
 const [error,setError]=useState("");
 // Safari on iPhone/iPad partitions iframe storage during Avaturn's redirect login.
 // Start the sign-in flow at the editor's own top-level origin instead.
 const [externalOnIOS]=useState(()=>typeof navigator!=="undefined"&&
  requiresTopLevelAvaturnAuth(navigator.userAgent,navigator.platform,navigator.maxTouchPoints));
 const [loading,setLoading]=useState(!externalOnIOS);
 const [saving,setSaving]=useState(false);
 const [success,setSuccess]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);
 const inFlight=useRef(false);
 const onSavedRef=useRef(onSaved);onSavedRef.current=onSaved;
 useEffect(()=>{
  if(externalOnIOS)return;
  let active=true;
  let sdkInstance:{destroy:()=>void}|null=null;
  async function initialize(){
   try{
    const module=await import("@avaturn/sdk");
    if(!active||!element.current)return;
    const sdk=new module.AvaturnSDK();
    sdkInstance=sdk;sdkRef.current=sdk;
    await sdk.init(element.current,{url:AVATURN_URL,iframeClassName:"lr-avaturn-iframe"});
    if(!active)return;
    sdk.on("export",(result:ExportResult)=>{
     if(!active||inFlight.current)return;
     inFlight.current=true;setSaving(true);setError("");
     void fromExport(result,token).then(async()=>{
      if(!active)return;
      await onSavedRef.current();
      if(active)setSuccess(true);
     }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Export non disponible.")})
      .finally(()=>{inFlight.current=false;if(active)setSaving(false)});
    });
    if(active)setLoading(false);
   }catch(e){
    if(active){setLoading(false);setError(
      "Éditeur Avaturn indisponible. Essaie « Importer un GLB » ou réessaie plus tard."
    )}
   }
  }
  void initialize();
  return()=>{active=false;try{sdkInstance?.destroy()}catch{/* ignore */}
   sdkRef.current=null};
 },[token,externalOnIOS]);
 async function importFile(file:File|null){
  if(!file||inFlight.current)return;
  inFlight.current=true;setSaving(true);setSuccess(false);setError("");
  try{
   if(file.size>MAX_BYTES||file.size<24)throw Error("Fichier GLB invalide (12 Mo maximum).");
   const bytes=await file.arrayBuffer();
   await uploadModel(bytes,token);
   await onSavedRef.current();setSuccess(true);
  }catch(e){setError(e instanceof Error?e.message:"Import 3D impossible.")}
  finally{inFlight.current=false;setSaving(false);if(fileRef.current)fileRef.current.value=""}
 }
 return <div className="lr-avaturn-dialog" role="dialog" aria-modal="true"
  aria-label="Créer mon avatar Avaturn 3D">
  <header className="lr-avaturn-top">
   <div><small>CRÉATION 3D · AVATURN</small><h2>Ton véritable avatar 3D</h2>
    <p>Choisis ton visage, tes coiffures et tes tenues dans l’éditeur Avaturn.</p></div>
   <button type="button" onClick={onClose} aria-label="Fermer l'éditeur">✕</button>
  </header>
  {AVATURN_DEMO_MODE?<p className="lr-avaturn-demo" role="note">
   Mode démo Avaturn : certaines options ou exports peuvent être limités. Pour la version
   définitive, renseigner VITE_AVATURN_SUBDOMAIN dans Cloudflare avec ton projet gratuit.
  </p>:null}
  <p className="lr-avaturn-privacy">
   Avaturn est un service externe : si tu choisis de prendre des selfies, ils sont traités
   par Avaturn selon ses conditions. Aucun selfie n'est envoyé à Love Radar.
  </p>
  {externalOnIOS?
   <section className="lr-avaturn-external" aria-label="Avaturn dans Safari">
    <div className="lr-avaturn-external-icon" aria-hidden="true">✦</div>
    <h3>Crée ton avatar sur Safari</h3>
    <p>Sur iPhone, la connexion Avaturn peut échouer dans une fenêtre intégrée.
     Ouvre son éditeur directement dans le navigateur pour démarrer une nouvelle session.</p>
    <a className="lr-avaturn-external-launch" href={AVATURN_URL+"/"}
     target="_blank" rel="noopener noreferrer">
     Ouvrir Avaturn dans Safari <span aria-hidden="true">↗</span>
    </a>
    <p className="lr-avaturn-external-help">Une fois ton avatar créé, si Avaturn propose
     de télécharger un fichier <strong>.glb</strong>, enregistre-le dans Fichiers,
     reviens ici et utilise « Importer un fichier GLB ».
     L’export depuis Safari n’est pas transféré automatiquement à Love Radar.</p>
   </section>:
   <div className="lr-avaturn-frame" aria-label="Personnalisation Avaturn">
    <div ref={element} className="lr-avaturn-embed"/>
    {loading?<p className="lr-avaturn-loading">Ouverture de l’éditeur 3D…</p>:null}
   </div>}
  {!externalOnIOS?<a className="lr-avaturn-external-backup" href={AVATURN_URL+"/"}
    target="_blank" rel="noopener noreferrer">
    Connexion bloquée ? Ouvrir Avaturn directement dans le navigateur ↗
   </a>:null}
  <div className="lr-avaturn-actions">
   <input type="file" accept=".glb,model/gltf-binary" ref={fileRef} hidden
    onChange={event=>void importFile(event.target.files?.[0]||null)}/>
   <button type="button" disabled={saving} onClick={()=>fileRef.current?.click()}>
    Importer un fichier GLB
   </button>
   <button type="button" className="lr-avaturn-done" onClick={onClose}>
    {success?"Terminé ✓":"Retour aux avatars"}
   </button>
  </div>
  {saving?<p className="lr-avaturn-status" role="status">Enregistrement privé du modèle 3D…</p>:null}
  {success?<p className="lr-avaturn-status success" role="status">
   Ton avatar 3D est enregistré ! Il est désormais visible par ton partenaire.
  </p>:null}
  {error?<p className="lr-avaturn-status error" role="alert">{error}</p>:null}
 </div>;
}
