import {useCallback,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import "./profile-photo.css";
type Props={file:File;onCancel:()=>void;onSave:(cropped:File)=>Promise<void>};
const SIZE=512;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export default function ProfilePhotoEditor({file,onCancel,onSave}:Props){
 const canvas=useRef<HTMLCanvasElement>(null);
 const image=useRef<HTMLImageElement|null>(null);
 const lastPointer=useRef<{id:number;x:number;y:number}|null>(null);
 const [zoom,setZoom]=useState(1);
 const [angle,setAngle]=useState(0);
 const [offset,setOffset]=useState({x:0,y:0});
 const [ready,setReady]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const objectUrl=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{if(active){image.current=img;setReady(true);setError("")}};
  img.onerror=()=>{if(active)setError("Cette image ne peut pas être ouverte. Choisis une photo JPG, PNG ou HEIC compatible.")};
  img.src=objectUrl;
  return()=>{active=false;image.current=null;URL.revokeObjectURL(objectUrl)};
 },[file]);
 const bounds=useCallback((nextZoom:number,nextAngle:number)=>{
  const img=image.current;
  if(!img)return {x:0,y:0};
  const rotated=nextAngle%180!==0;
  const width=rotated?img.naturalHeight:img.naturalWidth;
  const height=rotated?img.naturalWidth:img.naturalHeight;
  const scale=Math.max(SIZE/width,SIZE/height)*nextZoom;
  return {x:Math.max(0,(width*scale-SIZE)/2),y:Math.max(0,(height*scale-SIZE)/2)};
 },[]);
 useEffect(()=>{
  if(!ready||!canvas.current||!image.current)return;
  const cvs=canvas.current,ctx=cvs.getContext("2d",{alpha:false});
  if(!ctx)return;
  const img=image.current;
  ctx.fillStyle="#132535";ctx.fillRect(0,0,SIZE,SIZE);
  const rotated=angle%180!==0;
  const width=rotated?img.naturalHeight:img.naturalWidth;
  const height=rotated?img.naturalWidth:img.naturalHeight;
  const scale=Math.max(SIZE/width,SIZE/height)*zoom;
  const limit=bounds(zoom,angle);
  const x=clamp(offset.x,-limit.x,limit.x),y=clamp(offset.y,-limit.y,limit.y);
  ctx.save();
  ctx.translate(SIZE/2+x,SIZE/2+y);
  ctx.rotate(angle*Math.PI/180);
  ctx.drawImage(img,-img.naturalWidth*scale/2,-img.naturalHeight*scale/2,img.naturalWidth*scale,img.naturalHeight*scale);
  ctx.restore();
 },[ready,zoom,angle,offset,bounds]);
 function onMove(e:ReactPointerEvent<HTMLCanvasElement>){
  const prev=lastPointer.current;
  if(!prev||prev.id!==e.pointerId)return;
  e.preventDefault();
  const rect=e.currentTarget.getBoundingClientRect();
  const scale=SIZE/Math.max(1,rect.width);
  const boundsNow=bounds(zoom,angle);
  setOffset(pos=>({
   x:clamp(pos.x+(e.clientX-prev.x)*scale,-boundsNow.x,boundsNow.x),
   y:clamp(pos.y+(e.clientY-prev.y)*scale,-boundsNow.y,boundsNow.y)
  }));
  lastPointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};
 }
 function onDown(e:ReactPointerEvent<HTMLCanvasElement>){
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  lastPointer.current={id:e.pointerId,x:e.clientX,y:e.clientY};
 }
 function onUp(e:ReactPointerEvent<HTMLCanvasElement>){
  if(lastPointer.current?.id===e.pointerId)lastPointer.current=null;
  try{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
 }
 async function save(){
  if(!ready||!canvas.current||saving)return;
  setSaving(true);setError("");
  try{
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.current!.toBlob(value=>value?resolve(value):reject(Error("Export impossible.")),"image/jpeg",.89));
   if(blob.size>1_500_000)throw Error("Photo trop volumineuse. Essaie une autre image.");
   await onSave(new File([blob],"photo-de-profil.jpg",{type:"image/jpeg"}));
  }catch(err){setError(err instanceof Error?err.message:"Impossible d’enregistrer la photo.")}
  finally{setSaving(false)}
 }
 function rotate(){
  const newAngle=(angle+90)%360;
  setAngle(newAngle);setOffset({x:0,y:0});
 }
 return <div className="lr-profile-editor-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget&&!saving)onCancel()}}>
  <section role="dialog" aria-modal="true" aria-label="Ajuster la photo de profil" className="lr-profile-editor">
   <header className="lr-profile-editor-head">
    <button type="button" onClick={onCancel} disabled={saving} aria-label="Annuler">×</button>
    <div><strong>Ajuster la photo</strong><small>Elle apparaîtra dans un cercle</small></div>
    <span aria-hidden="true">✧</span>
   </header>
   <div className="lr-profile-photo-preview">
    <canvas ref={canvas} width={SIZE} height={SIZE} aria-label="Glisser pour déplacer la photo" role="img"
     onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}/>
    <div className="lr-profile-photo-guide" aria-hidden="true"/>
    {!ready?<div className="lr-profile-photo-loading" role="status">Chargement de la photo…</div>:null}
   </div>
   <p className="lr-profile-photo-hint">Fais glisser la photo pour la centrer. Utilise le zoom pour ajuster ton visage.</p>
   <div className="lr-profile-photo-tools">
    <label htmlFor="lr-profile-photo-zoom">Zoom <b>{Math.round(zoom*100)} %</b></label>
    <input id="lr-profile-photo-zoom" type="range" min="1" max="3" step=".025" value={zoom}
     onChange={e=>{const next=Number(e.target.value);setZoom(next);const max=bounds(next,angle);setOffset(p=>({x:clamp(p.x,-max.x,max.x),y:clamp(p.y,-max.y,max.y)}))}} disabled={!ready||saving}/>
    <button type="button" onClick={rotate} disabled={!ready||saving} className="lr-profile-rotate">↻ Tourner à 90°</button>
   </div>
   {error?<p className="lr-profile-photo-error" role="alert">{error}</p>:null}
   <div className="lr-profile-photo-buttons">
    <button type="button" className="lr-profile-cancel" onClick={onCancel} disabled={saving}>Annuler</button>
    <button type="button" className="lr-profile-save" onClick={()=>void save()} disabled={!ready||saving}>{saving?"Enregistrement…":"Enregistrer la photo"}</button>
   </div>
  </section>
 </div>;
}
