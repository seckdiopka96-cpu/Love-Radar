import type * as THREE from "three";
import {AVATAR_3D_OUTFIT_COLORS,AVATAR_3D_HAIR_COLORS,AVATAR_3D_SHOE_COLORS,
 type Avatar3DLook} from "./avatar-3d-look";

/** Simple in-app color variations applied to the user's own real Avaturn GLB.
 * Only clothing, hair and shoe material maps are edited; we do not recolor
 * skin/eyes, claim to change hairstyles, or fetch any external textures. */
function hexRgb(hex:string):[number,number,number]{
 return [Number.parseInt(hex.slice(1,3),16),Number.parseInt(hex.slice(3,5),16),
  Number.parseInt(hex.slice(5,7),16)];
}
function hue(rgb:[number,number,number]):number{
 const [r,g,b]=rgb.map(x=>x/255),max=Math.max(r,g,b),min=Math.min(r,g,b);
 const delta=max-min;if(delta<.0001)return 0;
 let h=max===r?(g-b)/delta+(g<b?6:0):max===g?(b-r)/delta+2:(r-g)/delta+4;
 return (h/6+1)%1;
}
function hsv(r:number,g:number,b:number):{h:number;s:number;v:number}{
 const max=Math.max(r,g,b)/255,min=Math.min(r,g,b)/255;
 const d=max-min;
 const h=d===0?0:max===r/255?((g-b)/255/d+6)%6:
  max===g/255?((b-r)/255/d+2):((r-g)/255/d+4);
 return {h:h/6,s:max?d/max:0,v:max};
}
function rgbHsv(h:number,s:number,v:number):[number,number,number]{
 const i=Math.floor(h*6)%6,f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
 const triples:[[number,number,number],[number,number,number],[number,number,number],
 [number,number,number],[number,number,number],[number,number,number]]=[
  [v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
 return triples[i].map(c=>Math.max(0,Math.min(255,Math.round(c*255)))) as [number,number,number];
}
function mainClothingHue(pixels:Uint8Array):number|null{
 const bins=new Float64Array(36);
 for(let i=0;i<pixels.length;i+=16){
  if(pixels[i+3]<100)continue;
  const c=hsv(pixels[i],pixels[i+1],pixels[i+2]);
  // Denim is generally muted; saturated bright cloth colors dominate here.
  if(c.s<.34||c.v<.18)continue;
  bins[Math.floor(c.h*36)%36]+=c.s*c.s*c.v;
 }
 let maximum=0,index=-1;
 for(let i=0;i<bins.length;i++){
  if(bins[i]>maximum){maximum=bins[i];index=i}
 }
 return index>=0&&maximum>20?(index+.5)/36:null;
}
export function recolorAvatarPixels(pixels:Uint8Array,kind:"outfit"|"hair"|"shoes",
 target:string):Uint8Array{
 const result=new Uint8Array(pixels);
 const rgb=hexRgb(target),targetHue=hue(rgb);
 const targetStyle=hsv(...rgb);
 const sourceHue=kind==="outfit"?mainClothingHue(pixels):null;
 for(let i=0;i<result.length;i+=4){
  const alpha=result[i+3];if(alpha<32)continue;
  const original=hsv(result[i],result[i+1],result[i+2]);
  if(kind==="outfit"){
   if(sourceHue===null||original.s<.27||original.v<.15)continue;
   const distance=Math.min(Math.abs(original.h-sourceHue),
    1-Math.abs(original.h-sourceHue));
   if(distance>.095)continue;
   const next=rgbHsv(targetHue,Math.max(.26,Math.min(.85,targetStyle.s)),original.v);
   result[i]=next[0];result[i+1]=next[1];result[i+2]=next[2];
  }else{
   // Preserve the highlights/shadows of existing hair or shoe textures.
   const brightness=original.v;
   if(brightness<.09)continue;
   const v=kind==="hair"?Math.max(.12,Math.min(.87,brightness*.77+.16)):
    Math.max(.12,Math.min(.95,brightness*.86+.1));
   const next=rgbHsv(targetHue,Math.max(.17,targetStyle.s*.72),v);
   result[i]=next[0];result[i+1]=next[1];result[i+2]=next[2];
  }
 }
 return result;
}
export async function applyAvatar3DLook(T:typeof import("three"),root:THREE.Object3D,
 look:Avatar3DLook,isCancelled:()=>boolean):Promise<void>{
 if(look.outfit==="original"&&look.hair==="original"&&look.shoes==="original")return;
 const jobs:{material:THREE.MeshStandardMaterial;kind:"outfit"|"hair"|"shoes";color:string}[]=[];
 const seen=new Set<THREE.MeshStandardMaterial>();
 root.traverse(node=>{
  const mesh=node as THREE.Mesh;
  if(!mesh.isMesh)return;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const material of mats){
   if(!(material instanceof T.MeshStandardMaterial)||seen.has(material)||!material.map)continue;
   seen.add(material);
   const name=(material.name+" "+mesh.name).toLowerCase();
   if(/avaturn.*look/.test(name)&&look.outfit!=="original"){
    jobs.push({material,kind:"outfit",color:AVATAR_3D_OUTFIT_COLORS[look.outfit]!});
   }else if(/avaturn.*hair/.test(name)&&look.hair!=="original"){
    jobs.push({material,kind:"hair",color:AVATAR_3D_HAIR_COLORS[look.hair]!});
   }else if(/avaturn.*shoes/.test(name)&&look.shoes!=="original"){
    jobs.push({material,kind:"shoes",color:AVATAR_3D_SHOE_COLORS[look.shoes]!});
   }
  }
 });
 for(const job of jobs){
  if(isCancelled())return;
  const source=job.material.map;
  if(!source)continue;
  const img=source.image as {data?:Uint8Array;width:number;height:number}|null;
  if(!img)continue;
  const width=img.width,height=img.height;
  if(!width||!height||width>2048||height>2048)continue;
  let original:Uint8Array;
  if(img.data&&img.data.length===width*height*4){
   original=new Uint8Array(img.data);
  }else{
   const canvas=document.createElement("canvas");
   canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)continue;
   try{
    ctx.drawImage(img as CanvasImageSource,0,0,width,height);
    original=new Uint8Array(ctx.getImageData(0,0,width,height).data);
   }catch{continue}
  }
  const rgba=recolorAvatarPixels(original,job.kind,job.color);
  if(isCancelled())return;
  const tex=new T.DataTexture(rgba,width,height,T.RGBAFormat,T.UnsignedByteType);
  tex.flipY=false;tex.colorSpace=T.SRGBColorSpace;tex.unpackAlignment=1;
  tex.wrapS=source.wrapS;tex.wrapT=source.wrapT;
  tex.magFilter=source.magFilter;tex.minFilter=source.minFilter;
  tex.offset.copy(source.offset);tex.repeat.copy(source.repeat);
  tex.center.copy(source.center);tex.rotation=source.rotation;
  tex.channel=source.channel;tex.anisotropy=source.anisotropy;
  tex.generateMipmaps=true;tex.needsUpdate=true;
  job.material.map=tex;job.material.needsUpdate=true;source.dispose();
 }
}
