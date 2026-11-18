import {useEffect,useState} from "react";
import CoupleAvatarDuo from "./CoupleAvatarDuo";
import Avaturn3DEditor from "./Avaturn3DEditor";
import {apiFetch} from "./api";
import {DEFAULT_AVATAR,DEFAULT_PARTNER_AVATAR,COUPLE_POSES,POSE_LABEL,
 type AvatarStyle,type CoupleAvatarState,type CouplePose} from "./couple-avatar-model";
import "./couple-avatars.css";

type Props={data:CoupleAvatarState;myName:string;partnerName:string;hasPartner:boolean;
 token:string;onModelImported:()=>Promise<void>;
 saving:boolean;onSaveStyle:(value:AvatarStyle)=>Promise<unknown>;
 onSavePose:(pose:CouplePose)=>Promise<unknown>;
 onSend:(pose:CouplePose)=>void;onBack:()=>void};
const POSE_ICONS:Record<CouplePose,string>={main:"🫶",calin:"🤗",bisou:"😘",danse:"💃"};

export default function CoupleAvatarStudio({data,myName,partnerName,hasPartner,saving,token,onModelImported,
 onSavePose,onSend,onBack}:Props){
 const [posePreview,setPosePreview]=useState<CouplePose>(data.pose);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [openAvaturn,setOpenAvaturn]=useState(false);
 const [confirmRemove3d,setConfirmRemove3d]=useState(false);
 const [removing3d,setRemoving3d]=useState(false);
 useEffect(()=>{if(!busy)setPosePreview(data.pose)},[data.pose,busy]);
 async function remove3D(){
  if(!confirmRemove3d||removing3d)return;
  setRemoving3d(true);setError("");setNotice("");
  try{
   const response=await apiFetch("/api/couple-avatar-model",{method:"DELETE",
    cache:"no-store",headers:{"Authorization":"Bearer "+token}});
   const result=await response.json() as {ok?:boolean;error?:string};
   if(!response.ok||!result.ok)throw Error(result.error||"Suppression impossible.");
   await onModelImported();setConfirmRemove3d(false);
   setNotice("Ton modèle 3D a été supprimé. Tu peux en créer un nouveau.");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de supprimer le modèle.")}
  finally{setRemoving3d(false)}
 }
 async function choosePose(value:CouplePose){
  if(busy||saving||value===posePreview)return;
  setPosePreview(value);setBusy(true);setError("");setNotice("");
  try{await onSavePose(value);setNotice("Votre moment est partagé sur les deux téléphones ♥")}
  catch(e){setPosePreview(data.pose);setError(e instanceof Error?e.message:"Impossible de partager ce moment.")}
  finally{setBusy(false)}
 }
 return <section className="lr-avatar-studio lr-avatar-studio-3d" aria-label="Nos avatars 3D">
  <header className="lr-avatar-studio-head">
   <button type="button" className="lr-avatar-studio-back" onClick={onBack} aria-label="Retour à l’accueil">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>
   </button>
   <div className="lr-avatar-studio-intro"><small>VOTRE UNIVERS À DEUX</small>
    <h1>Nos avatars <em>3D</em></h1>
    <p>Vous deux, comme vous êtes. En trois dimensions.</p>
   </div>
   <span className="lr-avatar-studio-free" aria-label="Gratuit">GRATUIT</span>
  </header>

  <div className="lr-avatar-studio-stage">
   <div className="lr-avatar-studio-stage-heading"><span>✧</span> VOTRE DUO <span>✧</span></div>
   <CoupleAvatarDuo mine={data.mine||DEFAULT_AVATAR} partner={data.partner||DEFAULT_PARTNER_AVATAR}
    pose={posePreview} mode="hero" mineName={myName} partnerName={partnerName}
    token={token} mine3d={Boolean(data.mine3d)} partner3d={Boolean(data.partner3d)} modelVersion={data.version}/>
   <div className="lr-avatar-studio-names"><span><i/> {myName}</span><span><i/> {partnerName}</span></div>
   {hasPartner&&!data.partner3d?<p className="lr-avatar-studio-hint">Ton partenaire pourra créer son propre avatar 3D depuis son téléphone.</p>:null}
   {!hasPartner?<p className="lr-avatar-studio-hint">Invite ton partenaire pour vivre vos animations ensemble.</p>:null}
  </div>

  <section className="lr-avaturn-card" aria-label="Créer et personnaliser son avatar 3D">
   <div className="lr-avaturn-card-head">
    <span className="lr-avaturn-card-symbol" aria-hidden="true">3D</span>
    <div><small>TON STYLE · AVATURN</small>
     <h2>{data.mine3d?"Ton personnage est prêt":"Crée ton véritable avatar 3D"}</h2>
     <p>Choisis ton visage, ta coiffure, tes vêtements et tes accessoires dans Avaturn.
      Retrouve ensuite ton personnage en 3D dans votre espace à deux.</p>
    </div>
   </div>
   <button type="button" className="lr-avaturn-launch" onClick={()=>setOpenAvaturn(true)}>
    {data.mine3d?"Personnaliser à nouveau":"Créer mon avatar 3D"} <span aria-hidden="true">↗</span>
   </button>
   {data.mine3d?<><p className="lr-avaturn-card-active" role="status">Ton avatar 3D est enregistré et partagé avec ton partenaire ✓</p>
    {!confirmRemove3d?<button type="button" className="lr-avaturn-remove-link"
     onClick={()=>setConfirmRemove3d(true)}>Supprimer mon modèle 3D</button>:
     <div className="lr-avaturn-remove-confirm" role="group" aria-label="Confirmer la suppression du modèle 3D">
      <p>Effacer ton modèle 3D ? Les messages et les autres données du couple resteront intacts.</p>
      <button type="button" disabled={removing3d} onClick={()=>void remove3D()}>
       {removing3d?"Suppression…":"Oui, supprimer"}
      </button>
      <button type="button" disabled={removing3d} onClick={()=>setConfirmRemove3d(false)}>Annuler</button>
     </div>}
   </>:null}
   <p className="lr-avaturn-card-note">Avaturn est un service externe.
    Seul le modèle exporté est enregistré dans l’espace privé Love Radar.</p>
  </section>

  <section className="lr-avatar-studio-poses" aria-label="Animations à deux">
   <div className="lr-avatar-studio-section-top">
    <div><span>VOS MOMENTS À DEUX</span><h2>Faites vivre vos avatars</h2></div>
   </div>
   <p>Choisissez votre moment. Les modèles 3D compatibles bougent ensemble en temps réel.</p>
   <div className="lr-avatar-pose-grid">
    {COUPLE_POSES.map(pose=><button type="button" key={pose}
     aria-pressed={posePreview===pose}
     className={"lr-avatar-pose-choice"+(posePreview===pose?" selected":"")}
     disabled={busy||saving} onClick={()=>void choosePose(pose)}>
     <span className="lr-avaturn-pose-symbol" aria-hidden="true">{POSE_ICONS[pose]}</span>
     <span className="lr-avatar-pose-label">{POSE_LABEL[pose]}{posePreview===pose?<b> ✓</b>:null}</span>
    </button>)}
   </div>
   <button type="button" className="lr-avatar-send" disabled={!hasPartner||busy||saving}
    onClick={()=>onSend(posePreview)}>
    <span aria-hidden="true">♡</span> Envoyer ce moment <span aria-hidden="true">→</span>
   </button>
  </section>
  {notice?<p className="lr-avatar-toast success" role="status">{notice}</p>:null}
  {error?<p className="lr-avatar-toast error" role="alert">{error}</p>:null}
  <footer className="lr-avatar-studio-footer">Une création Love Radar · Diao-Tech.com</footer>
  {openAvaturn?<Avaturn3DEditor token={token} onSaved={onModelImported}
   onClose={()=>setOpenAvaturn(false)}/>:null}
 </section>;
}
