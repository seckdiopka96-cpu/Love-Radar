import {AVATAR_3D_OUTFITS,AVATAR_3D_HAIRS,AVATAR_3D_SHOES,
 AVATAR_3D_OUTFIT_COLORS,AVATAR_3D_HAIR_COLORS,AVATAR_3D_SHOE_COLORS,
 type Avatar3DLook} from "./avatar-3d-look";
import "./avatar-3d-quick-editor.css";

const LABELS:Record<string,string>={
 original:"Original",rose:"Rose",bleu:"Bleu",lilas:"Lilas",vert:"Vert",
 soleil:"Doré",nuit:"Noir",chocolat:"Chocolat",chatain:"Châtain",
 blond:"Blond",roux:"Roux",blanc:"Blanc",noir:"Noir"
};
type Props={
 look:Avatar3DLook;disabled:boolean;
 onPreview:(next:Avatar3DLook)=>void;
 onSave:()=>void;onCancel:()=>void;onAdvanced:()=>void;
};
export default function Avatar3DQuickEditor({look,disabled,onPreview,onSave,onCancel,onAdvanced}:Props){
 function select(key:keyof Avatar3DLook,value:string){
  onPreview({...look,[key]:value});
 }
 const groups=[
  {key:"outfit" as const,title:"Couleur des vêtements",items:AVATAR_3D_OUTFITS,
   colors:AVATAR_3D_OUTFIT_COLORS},
  {key:"hair" as const,title:"Couleur des cheveux",items:AVATAR_3D_HAIRS,
   colors:AVATAR_3D_HAIR_COLORS},
  {key:"shoes" as const,title:"Couleur des chaussures",items:AVATAR_3D_SHOES,
   colors:AVATAR_3D_SHOE_COLORS}
 ] as const;
 return <section className="lr-3d-quick-editor" aria-label="Personnaliser mon avatar 3D">
  <header><span>PERSONNALISATION DANS LOVE RADAR</span><h3>Change ton look</h3>
   <p>Choisis une couleur. Regarde ton avatar juste au-dessus, puis enregistre.</p></header>
  {groups.map(group=><fieldset key={group.key}>
   <legend>{group.title}</legend>
   <div className="lr-3d-swatch-row">
    {group.items.map(value=><button type="button" key={value}
     disabled={disabled} aria-pressed={look[group.key]===value}
     className={"lr-3d-swatch"+(look[group.key]===value?" selected":"")}
     onClick={()=>select(group.key,value)}>
     <span className={"lr-3d-swatch-dot"+(value==="original"?" original":"")}
      style={value==="original"?undefined:{background:group.colors[value]||undefined}}
      aria-hidden="true">{value==="original"?"↺":null}</span>
     <small>{LABELS[value]||value}</small>
    </button>)}
   </div>
  </fieldset>)}
  <p className="lr-3d-quick-editor-footnote">
   Les couleurs disponibles dépendent des textures de ton modèle.
   Ton visage et tes vêtements d’origine restent conservés.</p>
  <div className="lr-3d-quick-actions">
   <button type="button" className="lr-3d-quick-save" disabled={disabled} onClick={onSave}>
    {disabled?"Enregistrement…":"Enregistrer mon look"}
   </button>
   <button type="button" className="lr-3d-quick-cancel" disabled={disabled} onClick={onCancel}>
    Annuler
   </button>
  </div>
  <button type="button" className="lr-3d-quick-advanced" disabled={disabled} onClick={onAdvanced}>
   Changer le visage ou la coiffure avec Avaturn <span aria-hidden="true">↗</span>
  </button>
 </section>;
}
