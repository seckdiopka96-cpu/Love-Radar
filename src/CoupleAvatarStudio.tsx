import {useEffect,useState} from "react";
import CoupleAvatarDuo from "./CoupleAvatarDuo";
import {DEFAULT_AVATAR,DEFAULT_PARTNER_AVATAR,
 SKINS,HAIRS,HAIR_COLORS,OUTFITS,ACCESSORIES,COUPLE_POSES,POSE_LABEL,
 SKIN_HEX,HAIR_HEX,OUTFIT_HEX,
 type AvatarStyle,type CoupleAvatarState,type CouplePose} from "./couple-avatar-model";
import "./couple-avatars.css";

type Props={data:CoupleAvatarState;myName:string;partnerName:string;hasPartner:boolean;
 saving:boolean;onSaveStyle:(value:AvatarStyle)=>Promise<unknown>;
 onSavePose:(pose:CouplePose)=>Promise<unknown>;
 onSend:(pose:CouplePose)=>void;onBack:()=>void};
const SKIN_NAMES=["Clair","Sable","Miel","Caramel","Brun","Ébène"];
const HAIR_NAMES=["Courts","Boucles","Tresses","Locks","Longs","Hijab"];
const HAIR_COLOR_NAMES=["Noir","Chocolat","Châtain","Blond","Roux"];
const OUTFIT_NAMES=["Rose","Bleu","Lilas","Vert","Soleil"];
const ACCESSORY_NAMES=["Sans","Lunettes","Fleur","Bonnet"];
type Category="skin"|"hair"|"hairColor"|"outfit"|"accessory";

export default function CoupleAvatarStudio({data,myName,partnerName,hasPartner,saving,
 onSaveStyle,onSavePose,onSend,onBack}:Props){
 const [draft,setDraft]=useState<AvatarStyle>(data.mine||DEFAULT_AVATAR);
 const [modified,setModified]=useState(false);
 const [posePreview,setPosePreview]=useState<CouplePose>(data.pose);
 const [category,setCategory]=useState<Category>("skin");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{if(!modified)setDraft(data.mine||DEFAULT_AVATAR)},[data.mine,modified]);
 useEffect(()=>{if(!busy)setPosePreview(data.pose)},[data.pose,busy]);
 function change<K extends Category>(key:K,value:AvatarStyle[K]){
  setDraft(old=>({...old,[key]:value}));setModified(true);setNotice("");setError("");
 }
 async function store(){
  if(busy||saving)return;
  setBusy(true);setError("");setNotice("");
  try{
   await onSaveStyle(draft);
   setModified(false);setNotice("Ton avatar est enregistré et visible par ton amour ✓");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de sauvegarder.")}
  finally{setBusy(false)}
 }
 async function choosePose(value:CouplePose){
  if(busy||saving||modified)return;
  setPosePreview(value);setBusy(true);setError("");setNotice("");
  try{await onSavePose(value);setNotice("Votre pose a été synchronisée ♥")}
  catch(e){setPosePreview(data.pose);setError(e instanceof Error?e.message:"Pose non enregistrée.")}
  finally{setBusy(false)}
 }
 const groups=[
  {id:"skin" as const,label:"Peau"},
  {id:"hair" as const,label:"Coiffure"},
  {id:"hairColor" as const,label:"Cheveux"},
  {id:"outfit" as const,label:"Tenue"},
  {id:"accessory" as const,label:"Accessoires"}
 ];
 const options=category==="skin"?SKINS.map((id,i)=>({id,title:SKIN_NAMES[i],color:SKIN_HEX[id]})):
  category==="hair"?HAIRS.map((id,i)=>({id,title:HAIR_NAMES[i],color:null})):
  category==="hairColor"?HAIR_COLORS.map((id,i)=>({id,title:HAIR_COLOR_NAMES[i],color:HAIR_HEX[id]})):
  category==="outfit"?OUTFITS.map((id,i)=>({id,title:OUTFIT_NAMES[i],color:OUTFIT_HEX[id]})):
  ACCESSORIES.map((id,i)=>({id,title:ACCESSORY_NAMES[i],color:null}));
 return <section className="lr-avatar-studio" aria-label="Nos avatars amoureux">
  <header className="lr-avatar-studio-head">
   <button type="button" className="lr-avatar-studio-back" onClick={onBack} aria-label="Retour">‹</button>
   <div><small>NOTRE PETIT MONDE · 100 % GRATUIT</small><h1>Nos avatars <em>amoureux</em> 🥰</h1>
    <p>Deux personnages uniques, une histoire à partager.</p></div>
  </header>
  <div className="lr-avatar-studio-stage">
   <span className="lr-avatar-studio-glitter" aria-hidden="true">✦ DES PETITS MOMENTS À DEUX ✦</span>
   <CoupleAvatarDuo mine={draft} partner={data.partner||DEFAULT_PARTNER_AVATAR}
    pose={posePreview} mode="hero" mineName={myName} partnerName={partnerName}/>
   <div className="lr-avatar-studio-names"><span>♡ {myName}</span><span>♥ {partnerName}</span></div>
   {!data.partner&&hasPartner?<p className="lr-avatar-studio-hint">Ton amour pourra créer son propre avatar sur son téléphone.</p>:null}
   {!hasPartner?<p className="lr-avatar-studio-hint">Ton partenaire apparaîtra ici après son invitation.</p>:null}
  </div>
  <section className="lr-avatar-studio-editor" aria-label="Personnaliser mon personnage">
   <div className="lr-avatar-studio-section-top"><div><span>✦ TON PERSONNAGE</span><h2>Crée ton avatar</h2></div>
    <small>Visible par vous deux</small></div>
   <div className="lr-avatar-studio-tabs" role="tablist" aria-label="Options de personnalisation">
    {groups.map(group=><button type="button" key={group.id} role="tab"
     aria-selected={category===group.id} className={category===group.id?"active":""}
     onClick={()=>setCategory(group.id)}>{group.label}</button>)}
   </div>
   <div className="lr-avatar-studio-options" role="group" aria-label="Choisir "+groups.find(g=>g.id===category)?.label}>
    {options.map(option=>{
     const selected=draft[category]===option.id;
     return <button key={option.id} type="button" className={"lr-avatar-option"+(selected?" selected":"")}
      aria-pressed={selected} disabled={busy||saving}
      onClick={()=>change(category,option.id as never)}>
      {option.color?<span className="lr-avatar-color-dot" style={{background:option.color}} aria-hidden="true"/>:
       <span className="lr-avatar-option-symbol" aria-hidden="true">
        {option.id==="hijab"?"🧕":option.id==="tresses"?"🌿":option.id==="boucles"?"〰":option.id==="locks"?"✿":
         option.id==="lunettes"?"👓":option.id==="fleur"?"🌼":option.id==="bonnet"?"🧢":"♡"}
       </span>}
      <span>{option.title}</span>
     </button>
    })}
   </div>
   <button className="lr-avatar-save" type="button" onClick={()=>void store()}
    disabled={!modified||busy||saving}>{busy||saving?"Enregistrement…":modified?"Enregistrer mon avatar ♥":"Mon avatar est enregistré ✓"}</button>
  </section>
  <section className="lr-avatar-studio-poses" aria-label="Animations à deux">
   <div className="lr-avatar-studio-section-top"><div><span>✦ VOS COMPLICITÉS</span><h2>Faites vivre vos avatars</h2></div></div>
   <p>Choisis une pose partagée puis envoie-la en sticker dans votre conversation.</p>
   <div className="lr-avatar-pose-grid">
    {COUPLE_POSES.map(pose=><button type="button" key={pose}
     aria-pressed={posePreview===pose}
     className={"lr-avatar-pose-choice"+(posePreview===pose?" selected":"")}
     disabled={busy||saving||modified} onClick={()=>void choosePose(pose)}>
      <span aria-hidden="true">{pose==="main"?"🫶":pose==="calin"?"🤗":pose==="bisou"?"😘":"💃"}</span>
      <strong>{POSE_LABEL[pose]}</strong>
     </button>)}
   </div>
   <button type="button" className="lr-avatar-send" disabled={!hasPartner||busy||saving||modified}
    onClick={()=>onSend(posePreview)}>💌 Envoyer notre animation en sticker</button>
   {modified?<p className="lr-avatar-studio-hint">Enregistre d’abord ton personnage pour choisir les animations.</p>:null}
  </section>
  {notice?<p className="lr-avatar-toast success" role="status">{notice}</p>:null}
  {error?<p className="lr-avatar-toast error" role="alert">{error}</p>:null}
  <footer className="lr-avatar-studio-footer">Une création originale Love Radar · Diao-Tech.com</footer>
 </section>;
}
