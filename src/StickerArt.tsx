import {getSticker} from "./stickers";
type Props={id:string;compact?:boolean;animated?:boolean};
export default function StickerArt({id,compact=false,animated=false}:Props){
 const sticker=getSticker(id);
 if(!sticker)return null;
 // All local stickers need motion in chat, not just the original 32.
 // Deterministic fallback keeps the sender and recipient in sync without data changes.
 const motions=["bounce","heartbeat","shake","party","wave","dance","kiss","glow"] as const;
 const motion=sticker.motion??motions[Array.from(sticker.id).reduce((n,c)=>n+c.charCodeAt(0),0)%motions.length];
 return <span className={"lr-sticker-art lr-sticker-tone-"+sticker.tone+(compact?" is-compact":"")+(animated||motion?" is-animated":"")+" lr-motion-"+motion} role="img" aria-label={sticker.label}>
  <span className="lr-sticker-sparkle lr-sticker-sparkle-left" aria-hidden="true">✦</span>
  <span className="lr-sticker-main" aria-hidden="true">{sticker.emoji}</span>
  <span className="lr-sticker-sparkle lr-sticker-sparkle-right" aria-hidden="true">✧</span>
  <span className="lr-sticker-caption" aria-hidden="true">{sticker.caption}</span>
 </span>;
}
