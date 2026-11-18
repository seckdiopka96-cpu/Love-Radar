import {LOVE_LENSES,type LoveLensId} from "./love-lenses";

type Props={value:LoveLensId;onSelect:(lens:LoveLensId)=>void;disabled?:boolean;compact?:boolean};
export default function LensPicker({value,onSelect,disabled=false,compact=false}:Props){
 return <div className={"lr-lenses-picker"+(compact?" compact":"")} role="group" aria-label="Effets caméra Love Radar">
  {LOVE_LENSES.map(item=><button type="button" key={item.id} className={"lr-lens-option"+(value===item.id?" is-selected":"")}
   disabled={disabled} aria-label={"Effet "+item.name} aria-pressed={value===item.id}
   onClick={()=>onSelect(item.id)}>
   <span className="lr-lens-icon" aria-hidden="true">{item.icon}</span>
   <span className="lr-lens-name">{item.name}</span>
  </button>)}
 </div>;
}
