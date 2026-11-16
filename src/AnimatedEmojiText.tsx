import {EMOJIS} from "./emoji-catalog";
import "./animated-emoji.css";

/** Keep the original Unicode emoji in the message so both partners see the
 * same text. Motion is a visual enhancement, not a new message format. */
const knownEmojis=new Set(EMOJIS);
const emojiRegExp=new RegExp("("+[...knownEmojis]
 .sort((a,b)=>b.length-a.length)
 .map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))
 .join("|")+")","gu");

export function emojiMotionClass(emoji:string):string{
 if(/[😂🤣😆😅😭😤😡🤯]/u.test(emoji))return "lr-emoji-shake";
 if(/[💗💖💓💕💞💘💝❤️🩷♥️🥰😍]/u.test(emoji))return "lr-emoji-heartbeat";
 if(/[😘😗😚💋]/u.test(emoji))return "lr-emoji-kiss";
 if(/[🎉🎊🥳🎂💃🕺]/u.test(emoji))return "lr-emoji-party";
 if(/[👋👏🙌✋🤚]/u.test(emoji))return "lr-emoji-wave";
 return "lr-emoji-bounce";
}

export function emojiOnlyText(content:string|null|undefined):boolean{
 const value=(content||"").trim();
 if(!value||value.length>90)return false;
 const pieces=value.split(emojiRegExp).filter(part=>part.trim().length>0);
 return pieces.length>0&&pieces.length<=5&&pieces.every(part=>knownEmojis.has(part));
}

export default function AnimatedEmojiText({content}:{content:string}){
 const parts=content.split(emojiRegExp);
 const solo=emojiOnlyText(content);
 let animatedCount=0;
 return <span className={solo?"lr-emoji-only-content":undefined}>{
  parts.map((part,index)=>{
   if(!knownEmojis.has(part)||animatedCount>=16)return part;
   animatedCount++;
   return <span key={index} className={"lr-emoji-motion "+emojiMotionClass(part)}
    aria-label={part} role="img">{part}</span>;
  })
 }</span>;
}
