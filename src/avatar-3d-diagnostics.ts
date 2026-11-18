/** Cheap, private GLB inspection. Only reads the embedded JSON header; model bytes
 * and identities never leave the user's device or their authenticated room. */
export type AvatarGlbInfo={
 images:number;texturedMaterials:number;skins:number;animations:number;meshes:number;
};
export function inspectAvatarGlb(bytes:ArrayBuffer):AvatarGlbInfo|null{
 if(bytes.byteLength<24)return null;
 const view=new DataView(bytes);
 if(view.getUint32(0,true)!==0x46546c67||
  view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)return null;
 const jsonLength=view.getUint32(12,true);
 if(jsonLength<2||jsonLength>Math.min(bytes.byteLength-20,1_000_000)||
    view.getUint32(16,true)!==0x4e4f534a)return null;
 try{
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength)))
   as Record<string,unknown>;
  const list=(key:string):Record<string,unknown>[]=>Array.isArray(json[key])?
   (json[key] as unknown[]).filter((x):x is Record<string,unknown>=>
    Boolean(x)&&typeof x==="object"&&!Array.isArray(x)):[];
  const materials=list("materials");
  // Metallic/roughness/normal maps are not enough to reproduce colored clothes.
  const texturedMaterials=materials.filter(material=>{
   const pbr=material.pbrMetallicRoughness as Record<string,unknown>|undefined;
   const ext=material.extensions as Record<string,unknown>|undefined;
   return Boolean(pbr?.baseColorTexture||ext?.KHR_materials_pbrSpecularGlossiness);
  }).length;
  return {images:list("images").length,texturedMaterials,
   skins:list("skins").length,animations:list("animations").length,
   meshes:list("meshes").length};
 }catch{return null}
}
