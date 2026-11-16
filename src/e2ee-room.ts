import {decryptText,isEncryptedText,type CryptoContext} from "./e2ee";

export const LOCKED_TEXT="🔐 Message chiffré — vérifie les clés de chiffrement";
export const CORRUPTED_TEXT="🔐 Impossible de déchiffrer ce message";

export type SecuredMessage={
 id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;
 reply_to_id?:string|null;reply_content?:string|null;reply_sender_id?:string|null;
};
/** Ciphertext must never be rendered raw or sent to other UI components. */
export async function revealMessages<T extends SecuredMessage>(
 messages:T[],context:CryptoContext|null
):Promise<T[]>{
 return Promise.all(messages.map(async message=>{
  const decode=async(text:string|null|undefined,id:string|undefined,sender:string|undefined)=>{
   if(!text||!isEncryptedText(text))return text??null;
   if(!context||!id||!sender)return LOCKED_TEXT;
   try{return await decryptText(context,text,id,sender)}catch{return CORRUPTED_TEXT}
  };
  const content=message.kind==="text"?await decode(message.content,message.id,message.sender_id):message.content;
  const reply_content=message.reply_content===undefined?undefined:
   await decode(message.reply_content,message.reply_to_id||undefined,message.reply_sender_id||undefined);
  return {...message,content,...(reply_content!==undefined?{reply_content}:{})};
 }));
}
