import {getSticker,readStickerId} from "./stickers";
export type QuoteKind="text"|"image"|"audio";
export function quotePreview(kind:QuoteKind,content:string|null|undefined,max=95):string{
 if(kind==="image")return "📷 Photo";
 if(kind==="audio")return "🎙️ Message vocal";
 const sticker=readStickerId(content);
 if(sticker)return "🎟️ Sticker · "+(getSticker(sticker)?.label||"Sticker");
 const normalized=(content||"").replace(/\s+/g," ").trim();
 return normalized.length>max?normalized.slice(0,max-1).trimEnd()+"…":normalized||"Message";
}
export function quoteAuthor(senderId:string|null|undefined,myId:string,partnerName:string):string{
 if(!senderId)return "Message";
 return senderId===myId?"Vous":partnerName;
}
