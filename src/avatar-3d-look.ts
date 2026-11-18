/** 3D styling is separate from legacy illustrated avatar presets.
 * "original" never modifies the personalized Avaturn texture. */
export const AVATAR_3D_OUTFITS=["original","rose","bleu","lilas","vert","soleil"] as const;
export const AVATAR_3D_HAIRS=["original","nuit","chocolat","chatain","blond","roux"] as const;
export const AVATAR_3D_SHOES=["original","blanc","noir","rose"] as const;
export type Avatar3DOutfit=typeof AVATAR_3D_OUTFITS[number];
export type Avatar3DHair=typeof AVATAR_3D_HAIRS[number];
export type Avatar3DShoes=typeof AVATAR_3D_SHOES[number];
export type Avatar3DLook={outfit:Avatar3DOutfit;hair:Avatar3DHair;shoes:Avatar3DShoes};
export const DEFAULT_3D_LOOK:Avatar3DLook={outfit:"original",hair:"original",shoes:"original"};
export const AVATAR_3D_OUTFIT_COLORS:Record<Avatar3DOutfit,string|null>={
 original:null,rose:"#e77fa2",bleu:"#598eca",lilas:"#aa83cd",
 vert:"#46ac75",soleil:"#e4aa54"
};
export const AVATAR_3D_HAIR_COLORS:Record<Avatar3DHair,string|null>={
 original:null,nuit:"#20212c",chocolat:"#51352a",chatain:"#875d3d",
 blond:"#d8af72",roux:"#ad5941"
};
export const AVATAR_3D_SHOE_COLORS:Record<Avatar3DShoes,string|null>={
 original:null,blanc:"#e6e7f3",noir:"#262b39",rose:"#db83ae"
};
export function validAvatar3DLook(value:unknown):value is Avatar3DLook{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return AVATAR_3D_OUTFITS.includes(v.outfit as Avatar3DOutfit)&&
  AVATAR_3D_HAIRS.includes(v.hair as Avatar3DHair)&&
  AVATAR_3D_SHOES.includes(v.shoes as Avatar3DShoes);
}
export function safeAvatar3DLook(value:unknown):Avatar3DLook|null{
 if(!validAvatar3DLook(value))return null;
 return {outfit:value.outfit,hair:value.hair,shoes:value.shoes};
}
