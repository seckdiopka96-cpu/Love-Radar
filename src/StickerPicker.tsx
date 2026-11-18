import {useMemo,useState} from "react";
import StickerArt from "./StickerArt";
import {emojiMotionClass} from "./AnimatedEmojiText";
import {getMotionEnabled,setMotionEnabled} from "./motion-mode";
import {STICKERS,MOTION_STICKERS,STICKER_GROUPS,getSticker,type StickerCategory} from "./stickers";
import {EMOJI_CATEGORIES,EMOJIS,filterEmojis} from "./emoji-catalog";
import {GIPHY_KEY} from "./gif-provider";
import GiphyCatalogue from "./GiphyCatalogue";
import "./stickers.css";
import "./sticker-picker-premium.css";

type Props={
 storageKey:string;
 onSend:(id:string)=>void;
 onSendEmoji:(emoji:string)=>void;
 onSendGif:(id:string)=>void;
 onClose:()=>void;
 onSearchFocus?:()=>void;
 onSearchBlur?:()=>void;
};
type Mode="gif"|"stickers"|"emoji";
type StickerGroup="all"|"animated"|"recent"|"favorite"|StickerCategory;
const FAV_KEY="couple-stickers-favorite-v1:";
const RECENT_KEY="couple-stickers-recent-v1:";
const EMOJI_RECENT_KEY="couple-emojis-recent-v1:";
function readSaved(key:string,max=35):string[]{
 try{
  const data=JSON.parse(localStorage.getItem(key)||"[]") as unknown;
  return Array.isArray(data)?data.filter((id):id is string=>typeof id==="string").slice(0,max):[];
 }catch{return []}
}
function readStickers(key:string){return readSaved(key).filter(id=>Boolean(getSticker(id)))}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Safari private mode */}}
function normalized(str:string){return str.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
const pickerModes:{id:Mode;label:string;symbol:string}[]=[
 {id:"gif",label:"GIF",symbol:"▣"},
 {id:"stickers",label:"Stickers",symbol:"♡"},
 {id:"emoji",label:"Émojis",symbol:"☺"}
];
export default function StickerPicker({storageKey,onSend,onSendEmoji,onSendGif,onClose,onSearchFocus,onSearchBlur}:Props){
 const [mode,setMode]=useState<Mode>(GIPHY_KEY?"gif":"stickers");
 const [motionEnabled,setMotionEnabledState]=useState(getMotionEnabled);
 function toggleMotion(){
  const next=!motionEnabled;
  setMotionEnabledState(next);
  setMotionEnabled(next);
 }
 const [selected,setSelected]=useState<StickerGroup>("animated");
 const [emojiCategory,setEmojiCategory]=useState("all");
 const [stickerSource,setStickerSource]=useState<"love"|"giphy">("love");
 const [emojiSource,setEmojiSource]=useState<"classic"|"giphy">("classic");
 const [query,setQuery]=useState("");
 const [favorites,setFavorites]=useState<string[]>(()=>readStickers(FAV_KEY+storageKey));
 const [recents,setRecents]=useState<string[]>(()=>readStickers(RECENT_KEY+storageKey));
 const [recentEmojis,setRecentEmojis]=useState<string[]>(()=>readSaved(EMOJI_RECENT_KEY+storageKey).filter(e=>EMOJIS.includes(e)));
 const stickerResults=useMemo(()=>{
  let list=STICKERS.slice();
  if(selected==="animated")list=MOTION_STICKERS.slice();
  else if(selected==="recent")list=recents.map(getSticker).filter((s):s is typeof STICKERS[number]=>Boolean(s));
  else if(selected==="favorite")list=favorites.map(getSticker).filter((s):s is typeof STICKERS[number]=>Boolean(s));
  else if(selected!=="all")list=list.filter(item=>item.category===selected);
  const text=normalized(query.trim());
  return text?list.filter(item=>normalized(item.label+" "+item.caption+" "+item.emoji+" "+item.id+" "+item.category).includes(text)):list;
 },[selected,query,favorites,recents]);
 const emojis=useMemo(()=>{
  const text=normalized(query.trim());
  // Search across all categories, even if a sub-category is currently selected.
  return filterEmojis(text?query:"",text?"all":emojiCategory,recentEmojis);
 },[query,emojiCategory,recentEmojis]);
 function sendSticker(id:string){
  const updated=[id,...recents.filter(other=>other!==id)].slice(0,25);
  setRecents(updated);save(RECENT_KEY+storageKey,updated);
  onSend(id);
 }
 function toggleFavorite(id:string){
  const updated=favorites.includes(id)?favorites.filter(v=>v!==id):[id,...favorites].slice(0,35);
  setFavorites(updated);save(FAV_KEY+storageKey,updated);
 }
 function sendEmoji(emoji:string){
  const updated=[emoji,...recentEmojis.filter(v=>v!==emoji)].slice(0,35);
  setRecentEmojis(updated);save(EMOJI_RECENT_KEY+storageKey,updated);
  onSendEmoji(emoji);
 }
 const categories:{id:StickerGroup;label:string;icon:string}[]=[
  {id:"animated",label:"Animés",icon:"✨"},
  {id:"recent",label:"Récents",icon:"◷"},
  {id:"favorite",label:"Favoris",icon:"☆"},
  {id:"all",label:"Tous",icon:"▦"},
  ...STICKER_GROUPS
 ];
 const emojiCategories=[{id:"all",label:"Tous",symbol:"🌈"},{id:"recent",label:"Récents",symbol:"◷"},...EMOJI_CATEGORIES];
 const fallbackGifs=MOTION_STICKERS.filter(item=>
  !query.trim()||normalized(item.label+" "+item.caption+" "+item.category).includes(normalized(query.trim()))
 );
 const subtitle=mode==="gif"?"Les images qui font parler":mode==="emoji"?"Exprime-toi en un clin d'œil":"Des réactions qui prennent vie";
 return <section className="lr-sticker-picker lr-expressive-picker" aria-label="Émojis, GIF et stickers" onKeyDown={event=>{if(event.key==="Escape")onClose()}}>
  <div className="lr-sticker-picker-head">
   <div><strong>Vos expressions <span aria-hidden="true">✦</span></strong><small>{subtitle}</small></div>
   <div className="lr-animation-controls">
    <button type="button" className="lr-animation-switch" aria-pressed={motionEnabled}
     aria-label={motionEnabled?"Mettre les animations en pause":"Activer les animations"}
     onClick={toggleMotion}>{motionEnabled?"⏸ Animations":"▶ Animer"}</button>
    <button type="button" className="lr-sticker-picker-close" aria-label="Fermer le sélecteur" onClick={onClose}>×</button>
   </div>
  </div>
  <nav className="lr-expression-modes" role="tablist" aria-label="Type d'expression">
   {pickerModes.map(tab=><button key={tab.id} type="button" role="tab" aria-selected={mode===tab.id}
    className={mode===tab.id?"is-active":""} onClick={()=>{setMode(tab.id);setQuery("")}}>
    <span aria-hidden="true">{tab.symbol}</span>{tab.label}
   </button>)}
  </nav>
  <label className="lr-sticker-search">
   <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
   <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
    onFocus={onSearchFocus} onBlur={onSearchBlur}
    placeholder={mode==="gif"?"Rechercher un GIF…":mode==="emoji"?(emojiSource==="giphy"?"Filtrer les émojis GIPHY…":"Rechercher un emoji…"):"Rechercher des stickers…"}
    aria-label={mode==="gif"?"Rechercher un GIF":mode==="emoji"?"Rechercher un emoji":"Rechercher un sticker"} autoComplete="off"/>
  </label>
  {mode==="stickers"?<>
    {GIPHY_KEY?<div className="lr-giphy-source-switch" role="tablist" aria-label="Collection de stickers">
     <button type="button" role="tab" aria-selected={stickerSource==="love"} onClick={()=>{setStickerSource("love");setQuery("")}}>Love Radar</button>
     <button type="button" role="tab" aria-selected={stickerSource==="giphy"} onClick={()=>{setStickerSource("giphy");setQuery("")}}>Stickers GIPHY</button>
    </div>:null}
    {stickerSource==="giphy"&&GIPHY_KEY?
     <GiphyCatalogue key="sticker" kind="sticker" query={query} storageKey={storageKey} onSendGif={onSendGif} onClose={onClose}/>:
     <>
   <div className="lr-sticker-categories" role="tablist" aria-label="Catégories de stickers">
    {categories.map(tab=><button key={tab.id} type="button" role="tab" aria-selected={selected===tab.id}
     className={selected===tab.id?"is-selected":""} onClick={()=>setSelected(tab.id)}>
     <span aria-hidden="true">{tab.icon}</span><small>{tab.label}</small></button>)}
   </div>
   <div className="lr-sticker-scroll" role="tabpanel" aria-label="Stickers disponibles">
    {stickerResults.length?<div className="lr-sticker-grid">{stickerResults.map(item=><div className="lr-sticker-choice" key={item.id}>
     <button type="button" className="lr-sticker-send" aria-label={"Envoyer le sticker "+item.label}
      title={"Envoyer : "+item.label} onClick={()=>sendSticker(item.id)}>
      <StickerArt id={item.id} compact animated/>
     </button>
     <button type="button" className={"lr-sticker-star"+(favorites.includes(item.id)?" is-favorite":"")}
      aria-label={favorites.includes(item.id)?"Retirer "+item.label+" des favoris":"Ajouter "+item.label+" aux favoris"}
      aria-pressed={favorites.includes(item.id)} onClick={()=>toggleFavorite(item.id)}>
      {favorites.includes(item.id)?"★":"☆"}</button>
    </div>)}</div>:<p className="lr-sticker-empty">Aucun sticker trouvé.</p>}
   </div>
   <div className="lr-sticker-footer"><span>Stickers Love Radar • animés sur les deux téléphones</span><span>{stickerResults.length}</span></div>
     </>}
  </>:mode==="emoji"?<>
    {GIPHY_KEY?<div className="lr-giphy-source-switch" role="tablist" aria-label="Collection d’émojis">
     <button type="button" role="tab" aria-selected={emojiSource==="classic"} onClick={()=>{setEmojiSource("classic");setQuery("")}}>Classiques</button>
     <button type="button" role="tab" aria-selected={emojiSource==="giphy"} onClick={()=>{setEmojiSource("giphy");setQuery("")}}>Émojis GIPHY</button>
    </div>:null}
    {emojiSource==="giphy"&&GIPHY_KEY?
     <GiphyCatalogue key="emoji" kind="emoji" query={query} storageKey={storageKey} onSendGif={onSendGif} onClose={onClose}/>:
     <>
   <div className="lr-emoji-categories" role="tablist" aria-label="Catégories d'émojis">
    {emojiCategories.map(tab=><button type="button" role="tab" aria-label={tab.label} title={tab.label}
     aria-selected={emojiCategory===tab.id} key={tab.id}
     className={emojiCategory===tab.id?"is-selected":""} onClick={()=>setEmojiCategory(tab.id)}>{tab.symbol}</button>)}
   </div>
   <div className="lr-sticker-scroll lr-emoji-scroll" role="tabpanel" aria-label="Émojis disponibles">
    {emojis.length?<div className="lr-emoji-grid">
     {emojis.map(emoji=><button type="button" key={emoji} aria-label={"Insérer l'emoji "+emoji} title={emoji}
      onClick={()=>sendEmoji(emoji)}><span className={"lr-emoji-motion "+emojiMotionClass(emoji)}>{emoji}</span></button>)}
    </div>:<p className="lr-sticker-empty">{emojiCategory==="recent"?"Tes emojis récents apparaîtront ici.":"Aucun emoji trouvé."}</p>}
   </div>
   <div className="lr-sticker-footer"><span>Émojis animés dans les messages</span><span>{emojis.length}</span></div>
     </>}
  </>:<>
    {GIPHY_KEY?
     <GiphyCatalogue key="gif" kind="gif" query={query} storageKey={storageKey} onSendGif={onSendGif} onClose={onClose}/>:
     <>
      <div className="lr-sticker-scroll lr-gif-scroll" role="tabpanel" aria-label="Animations Love Radar">
       <p className="lr-expression-hint">Animations Love Radar disponibles immédiatement. La recherche de GIF externes nécessite une clé GIPHY.</p>
       <div className="lr-sticker-grid lr-animation-grid">{fallbackGifs.map(item=><button type="button" className="lr-sticker-send"
        aria-label={"Envoyer l'animation "+item.label} key={item.id} onClick={()=>sendSticker(item.id)}>
        <StickerArt id={item.id} compact animated/>
       </button>)}</div>
      </div>
      <div className="lr-sticker-footer"><span>32 animations Love Radar incluses</span><span>GIF externes en option</span></div>
     </>}
  </>}
 </section>;
}
