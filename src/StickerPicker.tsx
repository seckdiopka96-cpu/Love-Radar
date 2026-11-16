import {useMemo,useState} from "react";
import StickerArt from "./StickerArt";
import {STICKERS,STICKER_GROUPS,getSticker,type StickerCategory} from "./stickers";
import "./stickers.css";
type Props={storageKey:string;onSend:(id:string)=>void;onClose:()=>void};
type Group="all"|"recent"|"favorite"|StickerCategory;
const FAV_KEY="couple-stickers-favorite-v1:";
const RECENT_KEY="couple-stickers-recent-v1:";
function readIds(key:string){
 try{
  const data=JSON.parse(localStorage.getItem(key)||"[]");
  return Array.isArray(data)?data.filter((id):id is string=>typeof id==="string"&&!!getSticker(id)).slice(0,35):[];
 }catch{return []}
}
function normalized(str:string){return str.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
export default function StickerPicker({storageKey,onSend,onClose}:Props){
 const [selected,setSelected]=useState<Group>("all");
 const [query,setQuery]=useState("");
 const [favorites,setFavorites]=useState<string[]>(()=>readIds(FAV_KEY+storageKey));
 const [recents,setRecents]=useState<string[]>(()=>readIds(RECENT_KEY+storageKey));
 const results=useMemo(()=>{
  let list=STICKERS.slice();
  if(selected==="recent")list=recents.map(id=>getSticker(id)).filter((s):s is typeof STICKERS[number]=>Boolean(s));
  else if(selected==="favorite")list=favorites.map(id=>getSticker(id)).filter((s):s is typeof STICKERS[number]=>Boolean(s));
  else if(selected!=="all")list=list.filter(item=>item.category===selected);
  const text=normalized(query.trim());
  return text?list.filter(item=>normalized(item.label+" "+item.caption+" "+item.emoji+" "+item.id+" "+item.category).includes(text)):list;
 },[selected,query,favorites,recents]);
 function sendSticker(id:string){
  const updated=[id,...recents.filter(other=>other!==id)].slice(0,20);
  setRecents(updated);
  try{localStorage.setItem(RECENT_KEY+storageKey,JSON.stringify(updated))}catch{/* Storage is optional. */}
  onSend(id);
 }
 function toggleFavorite(id:string){
  const updated=favorites.includes(id)?favorites.filter(item=>item!==id):[id,...favorites].slice(0,35);
  setFavorites(updated);
  try{localStorage.setItem(FAV_KEY+storageKey,JSON.stringify(updated))}catch{/* Storage is optional. */}
 }
 const tabs:{id:Group;label:string;icon:string}[]=[
  {id:"all",label:"Tous",icon:"▦"},
  {id:"recent",label:"Récents",icon:"◷"},
  {id:"favorite",label:"Favoris",icon:"☆"},
  ...STICKER_GROUPS
 ];
 return <section className="lr-sticker-picker" aria-label="Choisir un sticker" onKeyDown={e=>{if(e.key==="Escape")onClose()}}>
  <div className="lr-sticker-picker-head">
   <div><strong>Stickers</strong><small>Un petit dessin pour dire beaucoup</small></div>
   <button type="button" className="lr-sticker-picker-close" aria-label="Fermer les stickers" onClick={onClose}>×</button>
  </div>
  <label className="lr-sticker-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
   <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un sticker…" aria-label="Rechercher un sticker" autoComplete="off"/>
  </label>
  <div className="lr-sticker-categories" role="tablist" aria-label="Catégories de stickers">
   {tabs.map(t=><button key={t.id} type="button" role="tab" aria-selected={selected===t.id} className={selected===t.id?"is-selected":""} onClick={()=>setSelected(t.id)}>
    <span aria-hidden="true">{t.icon}</span><small>{t.label}</small>
   </button>)}
  </div>
  <div className="lr-sticker-scroll" role="tabpanel" aria-label="Stickers disponibles">
   {results.length?<div className="lr-sticker-grid">{results.map(item=><div className="lr-sticker-choice" key={item.id}>
    <button type="button" className="lr-sticker-send" aria-label={"Envoyer le sticker "+item.label} title={"Envoyer : "+item.label} onClick={()=>sendSticker(item.id)}>
     <StickerArt id={item.id} compact animated/>
    </button>
    <button type="button" className={"lr-sticker-star"+(favorites.includes(item.id)?" is-favorite":"")} aria-label={favorites.includes(item.id)?"Retirer "+item.label+" des favoris":"Ajouter "+item.label+" aux favoris"} aria-pressed={favorites.includes(item.id)} title="Favori" onClick={()=>toggleFavorite(item.id)}>{favorites.includes(item.id)?"★":"☆"}</button>
   </div>)}</div>:
   <p className="lr-sticker-empty">{selected==="recent"?"Tes stickers envoyés apparaîtront ici.":selected==="favorite"?"Ajoute tes préférés avec l’étoile ☆.":"Aucun sticker trouvé."}</p>}
  </div>
  <div className="lr-sticker-footer"><span>✦ Stickers intégrés · disponibles sans catalogue externe</span><span>{results.length} stickers</span></div>
 </section>;
}
