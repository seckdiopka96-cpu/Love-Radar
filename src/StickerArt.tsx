import {getSticker} from "./stickers";
import "./animated-stickers.css";
type Props={id:string;compact?:boolean;animated?:boolean};
export default function StickerArt({id,compact=false,animated=false}:Props){
 const sticker=getSticker(id);
 if(!sticker)return null;
 return <span className={"lr-sticker-art lr-sticker-tone-"+sticker.tone+(compact?" is-compact":"")+(animated||sticker.motion?" is-animated":"")+(sticker.motion?" lr-motion-"+sticker.motion:"")} role="img" aria-label={sticker.label}>
  <span className="lr-sticker-sparkle lr-sticker-sparkle-left" aria-hidden="true">✦</span>
  <span className="lr-sticker-main" aria-hidden="true">{sticker.emoji}</span>
  <span className="lr-sticker-sparkle lr-sticker-sparkle-right" aria-hidden="true">✧</span>
  <span className="lr-sticker-caption" aria-hidden="true">{sticker.caption}</span>
 </span>;
}
