import {useEffect,useState} from "react";
import CoupleAvatarDuo,{AvatarCharacter} from "./CoupleAvatarDuo";
import Avaturn3DEditor from "./Avaturn3DEditor";
import {apiFetch} from "./api";
import {DEFAULT_AVATAR,DEFAULT_PARTNER_AVATAR,SKINS,HAIRS,HAIR_COLORS,OUTFITS,
 ACCESSORIES,COUPLE_POSES,POSE_LABEL,SKIN_HEX,HAIR_HEX,OUTFIT_HEX,
 type AvatarStyle,type CoupleAvatarState,type CouplePose} from "./couple-avatar-model";
import "./couple-avatars.css";

type Props={data:CoupleAvatarState;myName:string;partnerName:string;hasPartner:boolean;
 token:string;onModelImported:()=>Promise<void>;
 saving:boolean;onSaveStyle:(value:AvatarStyle)=>Promise<unknown>;
 onSavePose:(pose:CouplePose)=>Promise<unknown>;
 onSend:(pose:CouplePose)=>void;onBack:()=>void};
type Category="skin"|"hair"|"hairColor"|"outfit"|"accessory";
const CATEGORIES:{id:Category;label:string;help:string}[]=[
 {id:"skin",label:"Teint",help:"Une palette qui te ressemble"},
 {id:"hair",label:"Coiffure",help:"Ta coiffure préférée"},
 {id:"hairColor",label:"Couleur",help:"La couleur de tes cheveux"},
 {id:"outfit",label:"Tenue",help:"Ton look pour vos aventures"},
 {id:"accessory",label:"Détails",help:"Une touche qui n’appartient qu’à toi"}
];
const SKIN_NAMES=["Porcelaine","Sable","Miel","Caramel","Brun","Ébène"];
const HAIR_NAMES=["Courts","Boucles","Tresses","Locks","Longs","Hijab"];
const HAIR_COLOR_NAMES=["Noir","Chocolat","Châtain","Blond","Roux"];
const OUTFIT_NAMES=["Rose","Bleu","Lilas","Vert","Soleil"];
const ACCESSORY_NAMES=["Naturel","Lunettes","Fleur","Bonnet"];

export default function CoupleAvatarStudio({data,myName,partnerName,hasPartner,saving,token,onModelImported,
 onSaveStyle,onSavePose,onSend,onBack}:Props){
 const [draft,setDraft]=useState<AvatarStyle>(data.mine||DEFAULT_AVATAR);
 const [modified,setModified]=useState(false);
 const [posePreview,setPosePreview]=useState<CouplePose>(data.pose);
 const [category,setCategory]=useState<Category>("hair");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [openAvaturn,setOpenAvaturn]=useState(false);
 const [showClassic,setShowClassic]=useState(false);
 const [confirmRemove3d,setConfirmRemove3d]=useState(false);
 const [removing3d,setRemoving3d]=useState(false);
 const [notice,setNotice]=useState("");
 useEffect(()=>{if(!modified)setDraft(data.mine||DEFAULT_AVATAR)},[data.mine,modified]);
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
   setNotice("Modèle 3D effacé. Ton personnage classique est toujours disponible.");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de supprimer le modèle.")}
  finally{setRemoving3d(false)}
 }
 function change(key:Category,value:AvatarStyle[Category]){
  if(draft[key]===value)return;
  setDraft(old=>({...old,[key]:value}));setModified(true);setNotice("");setError("");
 }
 async function store(){
  if(busy||saving)return;
  setBusy(true);setError("");setNotice("");
  try{await onSaveStyle(draft);setModified(false);setNotice("Ton avatar est enregistré et visible par ton amour ✓")}
  catch(e){setError(e instanceof Error?e.message:"Impossible de sauvegarder.")}
  finally{setBusy(false)}
 }
 async function choosePose(value:CouplePose){
  if(busy||saving||modified||value===posePreview)return;
  setPosePreview(value);setBusy(true);setError("");setNotice("");
  try{await onSavePose(value);setNotice("Votre pose est partagée sur les deux téléphones ♥")}
  catch(e){setPosePreview(data.pose);setError(e instanceof Error?e.message:"Impossible de partager la pose.")}
  finally{setBusy(false)}
 }
 const options=category==="skin"?SKINS.map((id,i)=>({id,title:SKIN_NAMES[i],color:SKIN_HEX[id]})):
  category==="hair"?HAIRS.map((id,i)=>({id,title:HAIR_NAMES[i],color:null})):
  category==="hairColor"?HAIR_COLORS.map((id,i)=>({id,title:HAIR_COLOR_NAMES[i],color:HAIR_HEX[id]})):
  category==="outfit"?OUTFITS.map((id,i)=>({id,title:OUTFIT_NAMES[i],color:OUTFIT_HEX[id]})):
  ACCESSORIES.map((id,i)=>({id,title:ACCESSORY_NAMES[i],color:null}));
 const activeCategory=CATEGORIES.find(item=>item.id===category)!;
 return <section className="lr-avatar-studio" aria-label="Nos avatars amoureux">
  <header className="lr-avatar-studio-head">
   <button type="button" className="lr-avatar-studio-back" onClick={onBack} aria-label="Retour à l’accueil">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>
   </button>
   <div className="lr-avatar-studio-intro"><small>VOTRE UNIVERS À DEUX</small>
    <h1>Nos avatars <em>amoureux</em></h1>
    <p>Deux personnalités. Une seule histoire.</p>
   </div>
   <span className="lr-avatar-studio-free" aria-label="Gratuit">GRATUIT</span>
  </header>

  <div className="lr-avatar-studio-stage">
   <div className="lr-avatar-studio-stage-heading"><span>✧</span> VOTRE DUO <span>✧</span></div>
   <CoupleAvatarDuo mine={draft} partner={data.partner||DEFAULT_PARTNER_AVATAR}
    pose={posePreview} mode="hero" mineName={myName} partnerName={partnerName}
    token={token} mine3d={Boolean(data.mine3d)} partner3d={Boolean(data.partner3d)}/>
   <div className="lr-avatar-studio-names"><span><i/> {myName}</span><span><i/> {partnerName}</span></div>
   {!data.partner&&hasPartner?<p className="lr-avatar-studio-hint">Ton partenaire personnalisera son personnage de son côté.</p>:null}
   {!hasPartner?<p className="lr-avatar-studio-hint">Invite ton partenaire pour retrouver vos deux avatars.</p>:null}
  </div>

  <section className="lr-avaturn-card" aria-label="Créer un véritable avatar en 3D">
   <div className="lr-avaturn-card-head">
    <span className="lr-avaturn-card-symbol" aria-hidden="true">3D</span>
    <div><small>PERSONNALISATION · AVATURN</small>
     <h2>{data.mine3d?"Ton avatar 3D est actif":"Passe à ton véritable avatar 3D"}</h2>
     <p>Visage, coiffure et vêtements réalistes : crée ton personnage gratuitement dans Avaturn.
      Les deux avatars bougent ensuite ensemble dans Love Radar.</p>
    </div>
   </div>
   <button type="button" className="lr-avaturn-launch" onClick={()=>setOpenAvaturn(true)}>
    {data.mine3d?"Recréer mon avatar 3D":"Créer mon avatar 3D"} <span aria-hidden="true">↗</span>
   </button>
   {data.mine3d?<><p className="lr-avaturn-card-active" role="status">
    Modèle 3D enregistré dans l’espace privé du couple ✓</p>
    {!confirmRemove3d?<button type="button" className="lr-avaturn-remove-link"
     onClick={()=>setConfirmRemove3d(true)}>Supprimer mon modèle 3D</button>:
     <div className="lr-avaturn-remove-confirm" role="group" aria-label="Confirmer la suppression du modèle 3D">
      <p>Effacer ton modèle 3D ? Ton avatar classique sera conservé.</p>
      <button type="button" disabled={removing3d} onClick={()=>void remove3D()}>
       {removing3d?"Suppression…":"Oui, supprimer"}
      </button>
      <button type="button" disabled={removing3d} onClick={()=>setConfirmRemove3d(false)}>
       Annuler
      </button>
     </div>}
   </>:null}
   <p className="lr-avaturn-card-note">
    Avaturn est un service externe. Tes selfies restent chez Avaturn, tes modèles 3D sont
    enregistrés dans l’espace privé Love Radar.
   </p>
  </section>
  {data.mine3d?<button type="button" className="lr-avaturn-classic-toggle"
   onClick={()=>setShowClassic(value=>!value)}>
   {showClassic?"Masquer les anciens avatars":"Afficher les avatars classiques (secours)"}
  </button>:null}
  {(!data.mine3d||showClassic)?<section className="lr-avatar-studio-editor" aria-label="Crée ton avatar et personnalise ton personnage">
   <div className="lr-avatar-studio-section-top">
    <div><span>01 · PERSONNALISATION</span><h2>Ton personnage, ton style</h2></div>
    <small>✨ À TON IMAGE</small>
   </div>
   <div className="lr-avatar-studio-tabs" role="tablist" aria-label="Options de personnalisation">
    {CATEGORIES.map(group=><button type="button" key={group.id} role="tab"
     aria-selected={category===group.id} className={category===group.id?"active":""}
     onClick={()=>setCategory(group.id)}>{group.label}</button>)}
   </div>
   <p className="lr-avatar-studio-category-hint">{activeCategory.help}</p>
   <div className="lr-avatar-studio-options" role="group"
    aria-label={"Choisir "+activeCategory.label}>
    {options.map(option=>{
     const selected=draft[category]===option.id;
     const preview={...draft,[category]:option.id} as AvatarStyle;
     return <button key={option.id} type="button"
      className={"lr-avatar-option"+(selected?" selected":"")} aria-pressed={selected}
      disabled={busy||saving} onClick={()=>change(category,option.id as AvatarStyle[Category])}>
      <span className={"lr-avatar-option-visual"+(category==="outfit"?" outfit":"")} aria-hidden="true">
       <AvatarCharacter style={preview} portrait={category!=="outfit"} label=""/>
       {selected?<span className="lr-avatar-option-check">✓</span>:null}
      </span>
      <span className="lr-avatar-option-name">{option.title}</span>
      {category==="skin"||category==="hairColor"?
       <span className="lr-avatar-option-color" style={{background:option.color||"#fff"}} aria-hidden="true"/>:null}
     </button>;
    })}
   </div>
   <button className="lr-avatar-save" type="button" onClick={()=>void store()}
    disabled={(!modified&&Boolean(data.mine))||busy||saving}>
    <span>{busy||saving?"Enregistrement…":!data.mine?"Créer mon avatar":modified?"Enregistrer mon avatar":"Personnage enregistré"}</span>
    <span aria-hidden="true">{modified||!data.mine?"→":"✓"}</span>
   </button>
   <p className="lr-avatar-studio-editor-note">Tes choix sont privés et synchronisés avec ton amour.</p>
  </section>:null}
  <section className="lr-avatar-studio-poses" aria-label="Animations à deux">
   <div className="lr-avatar-studio-section-top">
    <div><span>02 · NOTRE COMPLICITÉ</span><h2>Vos moments à deux</h2></div>
   </div>
   <p>Choisissez une pose, puis envoyez votre duo dans les messages.</p>
   <div className="lr-avatar-pose-grid">
    {COUPLE_POSES.map(pose=><button type="button" key={pose}
     aria-pressed={posePreview===pose}
     className={"lr-avatar-pose-choice"+(posePreview===pose?" selected":"")}
     disabled={busy||saving||modified} onClick={()=>void choosePose(pose)}>
     {data.mine3d||data.partner3d?
      <span className="lr-avaturn-pose-symbol" aria-hidden="true">
       {pose==="main"?"🫶":pose==="calin"?"🤗":pose==="bisou"?"😘":"💃"}
      </span>:
      <CoupleAvatarDuo mine={draft} partner={data.partner||DEFAULT_PARTNER_AVATAR}
       pose={pose} mode="sticker" animate={true} mineName={myName} partnerName={partnerName}/>}
     <span className="lr-avatar-pose-label">{POSE_LABEL[pose]}{posePreview===pose?<b> ✓</b>:null}</span>
    </button>)}
   </div>
   <button type="button" className="lr-avatar-send" disabled={!hasPartner||busy||saving||modified}
    onClick={()=>onSend(posePreview)}>
     <span aria-hidden="true">♡</span> Envoyer notre animation <span aria-hidden="true">→</span>
   </button>
   {modified?<p className="lr-avatar-studio-hint">Enregistre ton avatar avant de choisir votre animation.</p>:null}
  </section>
  {notice?<p className="lr-avatar-toast success" role="status">{notice}</p>:null}
  {error?<p className="lr-avatar-toast error" role="alert">{error}</p>:null}
  <footer className="lr-avatar-studio-footer">Une création Love Radar · Diao-Tech.com</footer>
  {openAvaturn?<Avaturn3DEditor token={token} onSaved={onModelImported}
   onClose={()=>setOpenAvaturn(false)}/>:null}
 </section>;
}
