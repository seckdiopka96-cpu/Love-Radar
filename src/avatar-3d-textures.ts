/** Read embedded base-color image bytes of a private GLB entirely in the browser.
 * Used to repair GLTFLoader ImageBitmap texture failures on some iOS WebGL builds.
 * Nothing is uploaded to an external service. */
export type EmbeddedAvatarColor={
 materialName:string;mimeType:"image/png"|"image/jpeg"|"image/webp";data:ArrayBuffer;
};
export function embeddedAvatarBaseColors(bytes:ArrayBuffer):EmbeddedAvatarColor[]{
 if(bytes.byteLength<36||bytes.byteLength>12_000_000)return [];
 const view=new DataView(bytes);
 if(view.getUint32(0,true)!==0x46546c67||
  view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)return [];
 const jsonLength=view.getUint32(12,true);
 if(jsonLength<2||jsonLength>1_000_000||jsonLength+36>bytes.byteLength||
  view.getUint32(16,true)!==0x4e4f534a)return [];
 const binChunkAt=20+jsonLength;
 if(binChunkAt+8>bytes.byteLength||view.getUint32(binChunkAt+4,true)!==0x004e4942)return [];
 const binLength=view.getUint32(binChunkAt,true);
 const binStart=binChunkAt+8,binEnd=binStart+binLength;
 if(binEnd>bytes.byteLength)return [];
 try{
  const gltf=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength))) as Record<string,unknown>;
  const list=(key:string):Record<string,unknown>[]=>Array.isArray(gltf[key])?
   (gltf[key] as unknown[]).map(item=>
    item&&typeof item==="object"&&!Array.isArray(item)?
     item as Record<string,unknown>:{}):[];
  const materials=list("materials"),textures=list("textures"),
   images=list("images"),views=list("bufferViews");
  const result:EmbeddedAvatarColor[]=[];
  for(const m of materials){
   if(typeof m.name!=="string"||!m.name||m.name.length>150)continue;
   const pbr=m.pbrMetallicRoughness as Record<string,unknown>|undefined;
   const ref=pbr?.baseColorTexture as Record<string,unknown>|undefined;
   if(!ref||!Number.isInteger(ref.index))continue;
   const texture=textures[Number(ref.index)];
   if(!texture||!Number.isInteger(texture.source))continue;
   const image=images[Number(texture.source)];
   if(!image||!Number.isInteger(image.bufferView))continue;
   const mime=image.mimeType;
   if(mime!=="image/png"&&mime!=="image/jpeg"&&mime!=="image/webp")continue;
   const bufferView=views[Number(image.bufferView)];
   if(!bufferView||!Number.isInteger(bufferView.byteLength))continue;
   const offset=bufferView.byteOffset===undefined?0:Number(bufferView.byteOffset);
   const length=Number(bufferView.byteLength);
   if(!Number.isInteger(offset)||offset<0||length<24||
     length>6_000_000||offset+length>binLength)continue;
   result.push({materialName:m.name,mimeType:mime,
    data:bytes.slice(binStart+offset,binStart+offset+length)});
  }
  return result;
 }catch{return []}
}
