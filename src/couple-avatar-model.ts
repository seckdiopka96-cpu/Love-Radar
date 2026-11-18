/** Original vector characters: presets are finite, validated and entirely free. */
export const SKINS=["porcelaine","sable","miel","caramel","brun","ebene"] as const;
export const HAIRS=["courts","boucles","tresses","locks","longs","hijab"] as const;
export const HAIR_COLORS=["nuit","chocolat","chatain","blond","roux"] as const;
export const OUTFITS=["rose","bleu","lilas","vert","soleil"] as const;
export const ACCESSORIES=["aucun","lunettes","fleur","bonnet"] as const;
export const COUPLE_POSES=["main","calin","bisou","danse"] as const;
export type Skin=typeof SKINS[number];
export type Hair=typeof HAIRS[number];
export type HairColor=typeof HAIR_COLORS[number];
export type Outfit=typeof OUTFITS[number];
export type Accessory=typeof ACCESSORIES[number];
export type CouplePose=typeof COUPLE_POSES[number];
export type AvatarStyle={skin:Skin;hair:Hair;hairColor:HairColor;outfit:Outfit;accessory:Accessory};
export type CoupleAvatarState={mine:AvatarStyle|null;partner:AvatarStyle|null;pose:CouplePose;version:number;mine3d?:boolean;partner3d?:boolean};
export const DEFAULT_AVATAR:AvatarStyle={skin:"caramel",hair:"boucles",hairColor:"nuit",outfit:"rose",accessory:"aucun"};
export const DEFAULT_PARTNER_AVATAR:AvatarStyle={skin:"brun",hair:"courts",hairColor:"chocolat",outfit:"bleu",accessory:"aucun"};
export const DEFAULT_COUPLE_AVATARS:CoupleAvatarState={mine:null,partner:null,pose:"main",version:0};
export const SKIN_HEX:Record<Skin,string>={
 porcelaine:"#f4ceb4",sable:"#dfb596",miel:"#cf9671",caramel:"#ae7350",brun:"#834d36",ebene:"#533526"
};
export const HAIR_HEX:Record<HairColor,string>={
 nuit:"#1e2332",chocolat:"#382826",chatain:"#704634",blond:"#d4a85c",roux:"#a64b31"
};
export const OUTFIT_HEX:Record<Outfit,string>={
 rose:"#e77fa2",bleu:"#5489c6",lilas:"#9b78c7",vert:"#54a894",soleil:"#d6a155"
};
export const POSE_LABEL:Record<CouplePose,string>={
 main:"Main dans la main",calin:"Gros câlin",bisou:"Petit bisou",danse:"On danse !"
};
export function validAvatarStyle(value:unknown):value is AvatarStyle{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return SKINS.includes(v.skin as Skin)&&HAIRS.includes(v.hair as Hair)&&
  HAIR_COLORS.includes(v.hairColor as HairColor)&&OUTFITS.includes(v.outfit as Outfit)&&
  ACCESSORIES.includes(v.accessory as Accessory);
}
export function validCouplePose(value:unknown):value is CouplePose{
 return typeof value==="string"&&COUPLE_POSES.includes(value as CouplePose);
}
export function safeAvatarStyle(value:unknown,fallback:AvatarStyle=DEFAULT_AVATAR):AvatarStyle{
 if(!validAvatarStyle(value))return fallback;
 const v=value as AvatarStyle;
 return {skin:v.skin,hair:v.hair,hairColor:v.hairColor,outfit:v.outfit,accessory:v.accessory};
}
export function safeCoupleAvatarState(value:unknown):CoupleAvatarState{
 if(!value||typeof value!=="object")return DEFAULT_COUPLE_AVATARS;
 const v=value as Record<string,unknown>;
 return {mine:validAvatarStyle(v.mine)?safeAvatarStyle(v.mine):null,
  partner:validAvatarStyle(v.partner)?safeAvatarStyle(v.partner):null,
  pose:validCouplePose(v.pose)?v.pose:"main",
  version:Number.isSafeInteger(v.version)&&Number(v.version)>=0?Number(v.version):0,
  ...(typeof v.mine3d==="boolean"?{mine3d:v.mine3d}:{}),
  ...(typeof v.partner3d==="boolean"?{partner3d:v.partner3d}:{})};
}
/** An encrypted text-message token, never executable HTML or an external URL. */
export const AVATAR_TOKEN_PREFIX="[couple-avatar:v1:";
export function avatarMessage(pose:CouplePose):string{
 if(!validCouplePose(pose))throw Error("Pose inconnue.");
 return AVATAR_TOKEN_PREFIX+pose+"]";
}
export function readAvatarMessage(content:string|null|undefined):CouplePose|null{
 if(!content||!content.startsWith(AVATAR_TOKEN_PREFIX)||!content.endsWith("]"))return null;
 const pose=content.slice(AVATAR_TOKEN_PREFIX.length,-1);
 return validCouplePose(pose)?pose:null;
}
