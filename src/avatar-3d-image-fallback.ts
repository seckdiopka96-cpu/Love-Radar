import {embeddedAvatarBaseColors} from "./avatar-3d-textures";
import type * as THREE from "three";

/** iOS can show a gray GLB even when its JPEG maps were parsed successfully:
 * a DOM image / ImageBitmap is not always uploaded correctly to WebGL.
 * Convert the model's already-embedded JPEGs into raw RGBA pixels and bind
 * DataTextures, so WebGL receives typed pixel buffers rather than DOM images.
 * Everything stays inside the user's authenticated browser session. */
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
  for(const material of all){
   if(!(material instanceof T.MeshStandardMaterial))continue;
   // Avaturn's GLB uses "avaturn_body_material" for a mesh "avaturn_body".
   // Both paths are supported because material names may be rewritten by
   // third-party glTF importers.
   const names=[material.name,mesh.name?mesh.name+"_material":""].filter(Boolean);
   for(const name of names){
    const list=materials.get(name)||[];
    if(!list.includes(material))list.push(material);
    materials.set(name,list);
   }
  }
 });
 let restored=0;
 for(const entry of embedded){
  const target=materials.get(entry.materialName);
  if(!target?.length||isCancelled())continue;
  const url=URL.createObjectURL(new Blob([new Uint8Array(entry.data)],{
   type:entry.mimeType
  }));
  try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("Image de texture 3D illisible."));
    img.src=url;
   });
   if(isCancelled())break;
   // The canvas converts an iPhone's JPEG decode into actual RGBA pixel data.
   // Uploading those bytes via DataTexture avoids ImageBitmap WebGL issues.
   const canvas=document.createElement("canvas");
   const width=image.naturalWidth,height=image.naturalHeight;
   if(!width||!height||width>2048||height>2048)continue;
   canvas.width=width;canvas.height=height;
   const context=canvas.getContext("2d",{willReadFrequently:true});
   if(!context)continue;
   context.drawImage(image,0,0,width,height);
   const rgba=new Uint8Array(context.getImageData(0,0,width,height).data);
   if(isCancelled())break;
   for(const material of target){
    const old=material.map;
    const texture=new T.DataTexture(rgba,width,height,T.RGBAFormat,T.UnsignedByteType);
    // glTF UVs assume unflipped images, and base-color data is sRGB.
    texture.flipY=false;
    texture.colorSpace=T.SRGBColorSpace;
    texture.unpackAlignment=1;
    // DataTexture defaults to mipmaps disabled. Retaining GLTFLoader's
    // mipmapped minFilter without enabling mipmaps produces incomplete textures.
    texture.generateMipmaps=true;
    if(old){
     texture.wrapS=old.wrapS;texture.wrapT=old.wrapT;
     texture.magFilter=old.magFilter;texture.minFilter=old.minFilter;
     texture.offset.copy(old.offset);texture.repeat.copy(old.repeat);
     texture.center.copy(old.center);texture.rotation=old.rotation;
     texture.channel=old.channel;texture.anisotropy=old.anisotropy;
    }else{
     texture.minFilter=T.LinearMipmapLinearFilter;
     texture.magFilter=T.LinearFilter;
    }
    texture.needsUpdate=true;
    material.map=texture;
    material.needsUpdate=true;
    old?.dispose();
    restored++;
   }
  }catch{
   // Retain the original GLTFLoader map if the local canvas decode fails.
  }finally{
   URL.revokeObjectURL(url);
  }
 }
 return restored;
}
