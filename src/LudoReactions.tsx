/** Compact animated Ludo reactions shared by Solo and Senegalese modes.
 * Emojis are animated by CSS (no remote sticker service or extra downloads).
 */
export type LudoSticker={id:number;emoji:string;label:string};
export const LUDO_EMOTES=[
 {emoji:"😝",label:"Langue tirée"},
 {emoji:"🤪",label:"Grimace"},
 {emoji:"🤣",label:"Fou rire"},
 {emoji:"😂",label:"Mort de rire"},
 {emoji:"😭",label:"Je pleure"},
 {emoji:"😱",label:"Choqué"},
 {emoji:"😎",label:"Trop fort"},
 {emoji:"👏",label:"Bravo"},
] as const;

export const ludoReactionMood=(emoji:string)=>{
 if(emoji==="😝"||emoji==="🤪")return "tongue";
 if(emoji==="🤣"||emoji==="😂")return "laugh";
 if(emoji==="😭")return "cry";
 if(emoji==="😱")return "shock";
 if(emoji==="👏")return "clap";
 return "cool";
};

export function LudoReactionBurst({sticker}:{sticker:LudoSticker|null}){
 if(!sticker)return null;
 return <div key={sticker.id} className="ludo-reaction-burst"
  data-kind={ludoReactionMood(sticker.emoji)} role="status"
  aria-label={"Réaction : "+sticker.label}>
  <span className="ludo-reaction-face">{sticker.emoji}</span>
 </div>;
}

export function LudoReactionPicker({open,disabled=false,onPick,onClose}:{
 open:boolean;disabled?:boolean;
 onPick:(emoji:string,label:string)=>void;
 onClose:()=>void;
}){
 if(!open)return null;
 return <div className="ludo-reaction-picker" role="group" aria-label="Réactions animées du Ludo">
  <div className="ludo-reaction-picker-title">
   <strong>Ta réaction 😝</strong>
   <button type="button" onClick={onClose} aria-label="Fermer les réactions">×</button>
  </div>
  <div className="ludo-reaction-picker-grid">
   {LUDO_EMOTES.map(r=><button type="button" key={r.emoji} title={r.label} aria-label={r.label}
    disabled={disabled} onClick={()=>onPick(r.emoji,r.label)}>{r.emoji}</button>)}
  </div>
 </div>;
}
