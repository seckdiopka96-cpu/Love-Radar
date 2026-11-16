/** First-party stickers: no external image API, no tracking, no copyright dependencies. */
export type StickerCategory="amour"|"reactions"|"humour"|"fetes";
export type Sticker={id:string;emoji:string;label:string;caption:string;category:StickerCategory;tone:"rose"|"peach"|"mint"|"lilac"|"gold"};
const data:Sticker[]=[
 {id:"love-you",emoji:"🥰",label:"Je t’aime",caption:"JE T’AIME",category:"amour",tone:"rose"},
 {id:"big-kiss",emoji:"😘",label:"Bisous",caption:"BISOUS",category:"amour",tone:"peach"},
 {id:"pink-heart",emoji:"💗",label:"Mon cœur",caption:"MON CŒUR",category:"amour",tone:"rose"},
 {id:"hug",emoji:"🫂",label:"Câlin",caption:"CÂLIN",category:"amour",tone:"lilac"},
 {id:"miss-you",emoji:"🥺",label:"Tu me manques",caption:"TU ME MANQUES",category:"amour",tone:"peach"},
 {id:"forever",emoji:"💞",label:"Pour toujours",caption:"POUR TOUJOURS",category:"amour",tone:"rose"},
 {id:"my-baby",emoji:"🧸",label:"Mon bébé",caption:"MON BÉBÉ",category:"amour",tone:"gold"},
 {id:"rose",emoji:"🌹",label:"Une rose",caption:"POUR TOI",category:"amour",tone:"peach"},
 {id:"couple",emoji:"💑",label:"Toi et moi",caption:"TOI & MOI",category:"amour",tone:"lilac"},
 {id:"kiss-heart",emoji:"💋",label:"Un bisou",caption:"MOUAH !",category:"amour",tone:"rose"},
 {id:"love-letter",emoji:"💌",label:"Petit mot",caption:"POUR MON AMOUR",category:"amour",tone:"peach"},
 {id:"sweet",emoji:"🍯",label:"Mon trésor",caption:"MON TRÉSOR",category:"amour",tone:"gold"},
 {id:"laugh",emoji:"🤣",label:"Mort de rire",caption:"MDR !",category:"reactions",tone:"gold"},
 {id:"happy",emoji:"😁",label:"Trop content",caption:"TROP BIEN",category:"reactions",tone:"mint"},
 {id:"wow",emoji:"😱",label:"Oh wow",caption:"WAAAW !",category:"reactions",tone:"lilac"},
 {id:"shy",emoji:"🫣",label:"Timide",caption:"OOOH",category:"reactions",tone:"peach"},
 {id:"sad",emoji:"😭",label:"Je pleure",caption:"NOOOON",category:"reactions",tone:"mint"},
 {id:"angry",emoji:"😤",label:"Fâché",caption:"HMMM !",category:"reactions",tone:"rose"},
 {id:"thinking",emoji:"🤔",label:"Je réfléchis",caption:"ATTENDS...",category:"reactions",tone:"gold"},
 {id:"agree",emoji:"👍",label:"D’accord",caption:"VALIDÉ",category:"reactions",tone:"mint"},
 {id:"applause",emoji:"👏",label:"Bravo",caption:"BRAVO !",category:"reactions",tone:"gold"},
 {id:"sleepy",emoji:"🥱",label:"Fatigué",caption:"DODO",category:"reactions",tone:"lilac"},
 {id:"surprised",emoji:"😳",label:"Choqué",caption:"HEIN ??",category:"reactions",tone:"rose"},
 {id:"proud",emoji:"😎",label:"Stylé",caption:"CLASSE",category:"reactions",tone:"mint"},
 {id:"oops",emoji:"🙈",label:"Oups",caption:"OUPS...",category:"humour",tone:"peach"},
 {id:"dancing",emoji:"💃",label:"Je danse",caption:"ON DANSE",category:"humour",tone:"rose"},
 {id:"popcorn",emoji:"🍿",label:"Je regarde",caption:"JE REGARDE",category:"humour",tone:"gold"},
 {id:"eyes",emoji:"👀",label:"Je vois",caption:"JE VOIS",category:"humour",tone:"lilac"},
 {id:"tea",emoji:"☕",label:"Pause",caption:"PAUSE CAFÉ",category:"humour",tone:"peach"},
 {id:"ghost",emoji:"👻",label:"Coucou",caption:"BOUH !",category:"humour",tone:"lilac"},
 {id:"hello",emoji:"👋",label:"Salut",caption:"COUCOU !",category:"humour",tone:"mint"},
 {id:"please",emoji:"🙏",label:"S’il te plaît",caption:"STP...",category:"humour",tone:"gold"},
 {id:"cat",emoji:"😼",label:"Malin",caption:"HÉHÉ",category:"humour",tone:"rose"},
 {id:"tada",emoji:"🎉",label:"Félicitations",caption:"FÉLICITATIONS",category:"fetes",tone:"gold"},
 {id:"birthday",emoji:"🎂",label:"Anniversaire",caption:"JOYEUX ANNIV'",category:"fetes",tone:"rose"},
 {id:"goodnight",emoji:"🌙",label:"Bonne nuit",caption:"BONNE NUIT",category:"fetes",tone:"lilac"},
 {id:"goodmorning",emoji:"☀️",label:"Bonjour",caption:"BONJOUR !",category:"fetes",tone:"gold"},
 {id:"party",emoji:"🥳",label:"On fête",caption:"ON FÊTE !",category:"fetes",tone:"peach"},
 {id:"flowers",emoji:"💐",label:"Des fleurs",caption:"BELLE JOURNÉE",category:"fetes",tone:"mint"},
 {id:"gift",emoji:"🎁",label:"Un cadeau",caption:"SURPRISE !",category:"fetes",tone:"rose"},
 {id:"goodluck",emoji:"🍀",label:"Bonne chance",caption:"BONNE CHANCE",category:"fetes",tone:"mint"}
];
export const STICKERS:readonly Sticker[]=data;
const byId=new Map(data.map(item=>[item.id,item]));
export const STICKER_PREFIX="[sticker:v1:";
export function getSticker(id:string|null|undefined):Sticker|undefined{return id?byId.get(id):undefined}
export function encodeSticker(id:string):string{
 if(!getSticker(id))throw new Error("Sticker inconnu.");
 return STICKER_PREFIX+id+"]";
}
export function readStickerId(content:string|null|undefined):string|null{
 if(!content||!content.startsWith(STICKER_PREFIX)||!content.endsWith("]"))return null;
 const id=content.slice(STICKER_PREFIX.length,-1);
 return /^[a-z0-9-]{1,36}$/.test(id)&&byId.has(id)?id:null;
}
export function isSticker(content:string|null|undefined):boolean{return readStickerId(content)!==null}
export const STICKER_GROUPS:{id:StickerCategory;label:string;icon:string}[]=[
 {id:"amour",label:"Amour",icon:"💗"},
 {id:"reactions",label:"Réactions",icon:"😆"},
 {id:"humour",label:"Humour",icon:"😜"},
 {id:"fetes",label:"Occasions",icon:"🎉"}
];
