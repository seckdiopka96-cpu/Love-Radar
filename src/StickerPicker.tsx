import {useEffect,useMemo,useState} from "react";
import StickerArt from "./StickerArt";
import {STICKERS,MOTION_STICKERS,STICKER_GROUPS,getSticker,type StickerCategory} from "./stickers";
import {EMOJI_CATEGORIES,EMOJIS,filterEmojis} from "./emoji-catalog";
import {GIPHY_KEY,gifsByIds,searchGifs,type GifResult} from "./gif-provider";
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
type GifGroup="trending"|"recent"|"favorite";
const FAV_KEY="couple-stickers-favorite-v1:";
const RECENT_KEY="couple-stickers-recent-v1:";
const EMOJI_RECENT_KEY="couple-emojis-recent-v1:";
const GIF_RECENT_KEY="couple-gif-recent-v1:";
const GIF_FAV_KEY="couple-gif-favorite-v1:";
function readSaved(key:string,max=35):string[]{
 try{
  const data=JSON.parse(localStorage.getItem(key)||"[]") as unknown;
  return Array.isArray(data)?data.filter((id):id is string=>typeof id==="string").slice(0,max):[];
 }catch{return []}
}
function readStickers(key:string){return readSaved(key).filter(id=>Boolean(getSticker(id)))}
function readGifIds(key:string):string[]{
 try{
  const parsed=JSON.parse(localStorage.getItem(key)||"[]") as unknown;
  return Array.isArray(parsed)?parsed.flatMap((entry:unknown)=>{
   // Migrate any old locally cached URL objects to a list of identifiers only.
   const id=typeof entry==="string"?entry:
    entry&&typeof entry==="object"&&"id" in entry?(entry as {id?:unknown}).id:"";
   return typeof id==="string"&&/^[A-Za-z0-9]{3,60}$/.test(id)?[id]:[];
  }).slice(0,24):[];
 }catch{return []}
}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Safari private mode */}}
function normalized(str:string){return str.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
const pickerModes:{id:Mode;label:string;symbol:string}[]=[
 {id:"gif",label:"GIF",symbol:"▣"},
 {id:"stickers",label:"Stickers",symbol:"♡"},
 {id:"emoji",label:"Émojis",symbol:"☺"}
];
export default function StickerPicker({storageKey,onSend,onSendEmoji,onSendGif,onClose,onSearchFocus,onSearchBlur}:Props){
 const [mode,setMode]=useState<Mode>("stickers");
 const [selected,setSelected]=useState<StickerGroup>("animated");
 const [emojiCategory,setEmojiCategory]=useState("all");
 const [gifGroup,setGifGroup]=useState<GifGroup>("trending");
 const [query,setQuery]=useState("");
 const [favorites,setFavorites]=useState<string[]>(()=>readStickers(FAV_KEY+storageKey));
 const [recents,setRecents]=useState<string[]>(()=>readStickers(RECENT_KEY+storageKey));
 const [recentEmojis,setRecentEmojis]=useState<string[]>(()=>readSaved(EMOJI_RECENT_KEY+storageKey).filter(e=>EMOJIS.includes(e)));
 const [gifFavorites,setGifFavorites]=useState<string[]>(()=>readGifIds(GIF_FAV_KEY+storageKey));
 const [gifRecents,setGifRecents]=useState<string[]>(()=>readGifIds(GIF_RECENT_KEY+storageKey));
 const [remoteGifs,setRemoteGifs]=useState<GifResult[]>([]);
 const [savedRemoteGifs,setSavedRemoteGifs]=useState<GifResult[]>([]);
 const [loadingGifs,setLoadingGifs]=useState(false);
 const [gifError,setGifError]=useState("");

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
 const gifResults=useMemo(()=>{
  const input=gifGroup==="recent"||gifGroup==="favorite"?savedRemoteGifs:remoteGifs;
  const text=normalized(query.trim());
  return gifGroup==="trending"||!text?input:
   input.filter(item=>normalized(item.title).includes(text));
 },[gifGroup,query,remoteGifs,savedRemoteGifs]);

 useEffect(()=>{
  if(mode!=="gif"||!GIPHY_KEY||gifGroup!=="trending")return;
  let alive=true;
  const controller=new AbortController();
  const handle=window.setTimeout(()=>{
   setLoadingGifs(true);setGifError("");
   void searchGifs(query,controller.signal)
    .then(items=>{if(alive)setRemoteGifs(items)})
    .catch(error=>{if(alive&&!controller.signal.aborted){
     setGifError(error instanceof Error?error.message:"Recherche GIF indisponible.");
     setRemoteGifs([]);
    }})
    .finally(()=>{if(alive)setLoadingGifs(false)});
  },query.trim()?380:40);
  return()=>{alive=false;window.clearTimeout(handle);controller.abort()};
 },[mode,query,gifGroup]);

 useEffect(()=>{
  if(mode!=="gif"||!GIPHY_KEY||gifGroup==="trending")return;
  const controller=new AbortController();
  const ids=gifGroup==="recent"?gifRecents:gifFavorites;
  setSavedRemoteGifs([]);setGifError("");
  if(!ids.length)return()=>controller.abort();
  setLoadingGifs(true);
  void gifsByIds(ids,controller.signal)
   .then(items=>{if(!controller.signal.aborted)setSavedRemoteGifs(items)})
   .catch(error=>{if(!controller.signal.aborted)setGifError(error instanceof Error?error.message:"GIF indisponibles.")})
   .finally(()=>{if(!controller.signal.aborted)setLoadingGifs(false)});
  return()=>controller.abort();
 },[mode,gifGroup,gifRecents,gifFavorites]);

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
 function sendGif(item:GifResult){
  // Store only the GIPHY ID; render by a direct client-side request.
  const updated=[item.id,...gifRecents.filter(v=>v!==item.id)].slice(0,22);
  setGifRecents(updated);save(GIF_RECENT_KEY+storageKey,updated);
  onSendGif(item.id);onClose();
 }
 function toggleGifFavorite(item:GifResult){
  const updated=gifFavorites.includes(item.id)?
   gifFavorites.filter(v=>v!==item.id):[item.id,...gifFavorites].slice(0,24);
  setGifFavorites(updated);save(GIF_FAV_KEY+storageKey,updated);
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
   <button type="button" className="lr-sticker-picker-close" aria-label="Fermer le sélecteur" onClick={onClose}>×</button>
  </div>
  <nav className="lr-expression-modes" role="tablist" aria-label="Type d'expression">
   {pickerModes.map(tab=><button key={tab.id} type="button" role="tab" aria-selected={mode===tab.id}
    className={mode===tab.id?"is-active":""} onClick={()=>{setMode(tab.id);setQuery("");setGifError("")}}>
    <span aria-hidden="true">{tab.symbol}</span>{tab.label}
   </button>)}
  </nav>
  <label className="lr-sticker-search">
   <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
   <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
    onFocus={onSearchFocus} onBlur={onSearchBlur}
    placeholder={mode==="gif"?"Rechercher un GIF…":mode==="emoji"?"Rechercher un emoji…":"Rechercher des stickers…"}
    aria-label={mode==="gif"?"Rechercher un GIF":mode==="emoji"?"Rechercher un emoji":"Rechercher un sticker"} autoComplete="off"/>
  </label>
  {mode==="stickers"?<>
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
  </>:mode==="emoji"?<>
   <div className="lr-emoji-categories" role="tablist" aria-label="Catégories d'émojis">
    {emojiCategories.map(tab=><button type="button" role="tab" aria-label={tab.label} title={tab.label}
     aria-selected={emojiCategory===tab.id} key={tab.id}
     className={emojiCategory===tab.id?"is-selected":""} onClick={()=>setEmojiCategory(tab.id)}>{tab.symbol}</button>)}
   </div>
   <div className="lr-sticker-scroll lr-emoji-scroll" role="tabpanel" aria-label="Émojis disponibles">
    {emojis.length?<div className="lr-emoji-grid">
     {emojis.map(emoji=><button type="button" key={emoji} aria-label={"Insérer l'emoji "+emoji} title={emoji}
      onClick={()=>sendEmoji(emoji)}>{emoji}</button>)}
    </div>:<p className="lr-sticker-empty">{emojiCategory==="recent"?"Tes emojis récents apparaîtront ici.":"Aucun emoji trouvé."}</p>}
   </div>
   <div className="lr-sticker-footer"><span>Émojis • touche pour insérer dans ton message</span><span>{emojis.length}</span></div>
  </>:<>
   <div className="lr-gif-categories" role="tablist" aria-label="Catégories GIF">
    {([{id:"trending",label:"Découvrir"},{id:"recent",label:"Récents"},{id:"favorite",label:"Favoris"}] as const).map(tab=>
     <button key={tab.id} type="button" role="tab" aria-selected={gifGroup===tab.id}
      className={gifGroup===tab.id?"is-selected":""} onClick={()=>setGifGroup(tab.id)}>{tab.label}</button>)}
   </div>
   <div className="lr-sticker-scroll lr-gif-scroll" role="tabpanel" aria-label="GIF animés">
    {GIPHY_KEY?<>
     {loadingGifs?<p className="lr-sticker-empty" role="status">Recherche des GIF animés…</p>:null}
     {gifError?<p className="lr-gif-error" role="alert">{gifError}</p>:null}
     {gifResults.length?<div className="lr-gif-grid">{gifResults.map(item=>
      <div className="lr-gif-tile" key={item.id}>
       <button type="button" className="lr-gif-send" disabled={false}
        aria-label={"Envoyer le GIF "+item.title} title={item.title} onClick={()=>void sendGif(item)}>
        <img src={item.preview} alt={item.title||"GIF animé"} loading="lazy"/>
        
       </button>
       <button type="button" className={"lr-gif-favorite"+(gifFavorites.includes(item.id)?" is-favorite":"")}
        aria-label={"Favori : "+item.title} aria-pressed={gifFavorites.includes(item.id)}
        onClick={()=>toggleGifFavorite(item)}>{gifFavorites.includes(item.id)?"★":"☆"}</button>
      </div>)}</div>:!loadingGifs&&!gifError?<p className="lr-sticker-empty">Aucun GIF trouvé.</p>:null}
    </>:<>
     <p className="lr-expression-hint">Animations Love Radar disponibles immédiatement. La recherche de GIF externes nécessite une clé GIPHY.</p>
     <div className="lr-sticker-grid lr-animation-grid">{fallbackGifs.map(item=><button type="button" className="lr-sticker-send"
      aria-label={"Envoyer l'animation "+item.label} key={item.id} onClick={()=>sendSticker(item.id)}>
      <StickerArt id={item.id} compact animated/>
     </button>)}</div>
    </>}
   </div>
   {GIPHY_KEY?<div className="lr-sticker-footer"><strong>Powered By GIPHY</strong><span>GIF servis directement par GIPHY</span></div>:
    <div className="lr-sticker-footer"><span>32 animations Love Radar incluses</span><span>GIF externes en option</span></div>}
  </>}
 </section>;
}
