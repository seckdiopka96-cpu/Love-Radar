import {embeddedAvatarBaseColors} from "./avatar-3d-textures";
import type * as THREE from "three";

/** Some iOS versions display ImageBitmap-backed GLB textures as flat gray/black.
 * Recreate ONLY the embedded color maps as HTMLImageElement textures, without
 * touching the private model, sending URLs off-device or changing its rig. */
export async function restoreAvatarColorsOnIOS(
 T:typeof import("three"),root:THREE.Object3D,bytes:ArrayBuffer,
 isCancelled:()=>boolean):Promise<number>{
 const embedded=embeddedAvatarBaseColors(bytes);
 if(!embedded.length)return 0;
 const materials=new Map<string,THREE.MeshStandardMaterial[]>();
 root.traverse(node=>{
  const mesh=node as THREE.Mesh;
  if(!mesh.isMesh)return;
  const all=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const m of all){
   if(!(m instanceof T.MeshStandardMaterial)||!m.name)continue;
   const group=materials.get(m.name)||[];
   if(!group.includes(m))group.push(m);
   materials.set(m.name,group);
  }
 });
 let restored=0;
 for(const entry of embedded){
  const target=materials.get(entry.materialName);
  if(!target?.length||isCancelled())continue;
  const url=URL.createObjectURL(new Blob([new Uint8Array(entry.data)],{type:entry.mimeType}));
  try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("Texture Avaturn illisible."));
    img.src=url;
   });
   if(isCancelled())continue;
   for(const material of target){
    const old=material.map;
    const texture=new T.Texture(image);
    texture.flipY=false; // glTF's UV origin differs from TextureLoader's default.
    texture.colorSpace=T.SRGBColorSpace;
    if(old){
     texture.wrapS=old.wrapS;texture.wrapT=old.wrapT;
     texture.magFilter=old.magFilter;texture.minFilter=old.minFilter;
     texture.offset.copy(old.offset);texture.repeat.copy(old.repeat);
     texture.center.copy(old.center);texture.rotation=old.rotation;
     texture.channel=old.channel;texture.anisotropy=old.anisotropy;
    }
    texture.needsUpdate=true;
    material.map=texture;
    material.needsUpdate=true;
    // The original ImageBitmap texture is no longer referenced by this material.
    old?.dispose();
    restored++;
   }
  }catch{
   // Keep GLTFLoader's original texture if this Safari fallback also fails.
  }finally{
   URL.revokeObjectURL(url);
  }
 }
 return restored;
}
