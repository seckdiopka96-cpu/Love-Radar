import {useEffect,useMemo,useRef,useState} from "react";
import {browseGiphy,gifsByIds,GIPHY_PAGE_SIZE,type GifResult,type GiphyKind} from "./gif-provider";

type Group="trending"|"recent"|"favorite";
type Props={
 kind:GiphyKind;
 query:string;
 storageKey:string;
 onSendGif:(id:string)=>void;
 onClose:()=>void;
};
const RECENT_KEY="couple-gif-recent-v1:";
const FAVORITE_KEY="couple-gif-favorite-v1:";

/** Save only IDs, never remote GIF URLs or responses. Preserve older favorites. */
function readIds(key:string):string[]{
 try{
  const raw=JSON.parse(localStorage.getItem(key)||"[]") as unknown;
  if(!Array.isArray(raw))return [];
  return raw.flatMap((entry:unknown)=>{
   const id=typeof entry==="string"?entry:
    entry&&typeof entry==="object"&&"id" in entry?(entry as {id?:unknown}).id:"";
   return typeof id==="string"&&/^[A-Za-z0-9]{3,60}$/.test(id)?[id]:[];
  }).slice(0,24);
 }catch{return []}
}
function persistIds(key:string,ids:string[]){
 try{localStorage.setItem(key,JSON.stringify(ids))}catch{/* Private browsing */}
}
function normalized(value:string){
 return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}

export default function GiphyCatalogue({kind,query,storageKey,onSendGif,onClose}:Props){
 const [group,setGroup]=useState<Group>("trending");
 const [recents,setRecents]=useState<string[]>(()=>readIds(RECENT_KEY+storageKey));
 const [favorites,setFavorites]=useState<string[]>(()=>readIds(FAVORITE_KEY+storageKey));
 const [items,setItems]=useState<GifResult[]>([]);
 const [loading,setLoading]=useState(false);
 const [loadingMore,setLoadingMore]=useState(false);
 const [error,setError]=useState("");
 const [moreError,setMoreError]=useState("");
 const [hasMore,setHasMore]=useState(false);
 const [nextOffset,setNextOffset]=useState(0);
 const [retry,setRetry]=useState(0);
 const scrollRef=useRef<HTMLDivElement|null>(null);
 const generation=useRef(0);
 const pagingController=useRef<AbortController|null>(null);
 const pagingBusy=useRef(false);
 const idsSignature=group==="recent"?recents.join(","):group==="favorite"?favorites.join(","):"";
 const effectiveQuery=kind==="emoji"?"":query;
 const displayed=useMemo(()=>{
  if(kind!=="emoji"||!query.trim()||group!=="trending")return items;
  const term=normalized(query.trim());
  return items.filter(item=>normalized(item.title).includes(term));
 },[kind,query,items,group]);

 useEffect(()=>{
  let active=true;
  const epoch=++generation.current;
  const controller=new AbortController();
  pagingController.current?.abort();
  pagingBusy.current=false;
  setLoading(false);setLoadingMore(false);
  setError("");setMoreError("");setItems([]);setHasMore(false);setNextOffset(0);
  if(scrollRef.current)scrollRef.current.scrollTop=0;

  async function load(){
   setLoading(true);
   try{
    if(group==="trending"){
     const page=await browseGiphy(kind,effectiveQuery,0,controller.signal);
     if(active&&!controller.signal.aborted&&generation.current===epoch){
      setItems(page.items);setHasMore(page.hasMore);setNextOffset(page.nextOffset);
     }
    }else{
     const ids=idsSignature?idsSignature.split(","):[];
     if(ids.length){
      const result=await gifsByIds(ids,controller.signal);
      if(active&&!controller.signal.aborted&&generation.current===epoch)setItems(result);
     }
    }
   }catch(reason){
    if(active&&!controller.signal.aborted&&generation.current===epoch){
     setError(reason instanceof Error?reason.message:"GIPHY momentanément indisponible.");
    }
   }finally{
    if(active&&!controller.signal.aborted&&generation.current===epoch)setLoading(false);
   }
  }
  const delay=group==="trending"&&effectiveQuery.trim()?450:40;
  const timer=window.setTimeout(()=>{void load()},delay);
  return ()=>{
   active=false;
   window.clearTimeout(timer);controller.abort();pagingController.current?.abort();
   generation.current+=1;pagingBusy.current=false;
  };
 },[kind,effectiveQuery,group,idsSignature,retry]);

 async function loadMore(){
  if(group!=="trending"||!hasMore||loading||pagingBusy.current||error)return;
  const epoch=generation.current;
  const controller=new AbortController();
  pagingController.current=controller;
  pagingBusy.current=true;
  setLoadingMore(true);setMoreError("");
  try{
   const page=await browseGiphy(kind,effectiveQuery,nextOffset,controller.signal);
   if(controller.signal.aborted||generation.current!==epoch)return;
   setItems(previous=>{
    const known=new Set(previous.map(item=>item.id));
    return [...previous,...page.items.filter(item=>!known.has(item.id))];
   });
   setNextOffset(page.nextOffset);
   setHasMore(page.hasMore);
  }catch(reason){
   if(!controller.signal.aborted&&generation.current===epoch){
    setMoreError(reason instanceof Error?reason.message:"Impossible de charger plus de GIF.");
   }
  }finally{
   if(generation.current===epoch){
    pagingBusy.current=false;setLoadingMore(false);
   }
  }
 }
 function onScroll(event:React.UIEvent<HTMLDivElement>){
  const element=event.currentTarget;
  if(element.scrollTop+element.clientHeight>=element.scrollHeight-220)void loadMore();
 }
 function send(item:GifResult){
  const ids=[item.id,...recents.filter(id=>id!==item.id)].slice(0,22);
  setRecents(ids);persistIds(RECENT_KEY+storageKey,ids);
  onSendGif(item.id);onClose();
 }
 function toggleFavorite(item:GifResult){
  const ids=favorites.includes(item.id)?
   favorites.filter(id=>id!==item.id):[item.id,...favorites].slice(0,24);
  setFavorites(ids);persistIds(FAVORITE_KEY+storageKey,ids);
 }
 const label=kind==="sticker"?"stickers GIPHY":kind==="emoji"?"émojis animés GIPHY":"GIF";
 return <>
  <div className="lr-gif-categories" role="tablist" aria-label={"Catégories "+label}>
   {([{id:"trending",label:"Découvrir"},{id:"recent",label:"Récents"},{id:"favorite",label:"Favoris"}] as const).map(tab=>
    <button key={tab.id} type="button" role="tab" aria-selected={group===tab.id}
     className={group===tab.id?"is-selected":""} onClick={()=>setGroup(tab.id)}>{tab.label}</button>)}
  </div>
  <div className="lr-gif-attribution" aria-label="Powered By GIPHY"><span>Powered by <strong>GIPHY</strong></span></div>
  <div ref={scrollRef} className={"lr-sticker-scroll lr-gif-scroll lr-giphy-"+kind} role="tabpanel"
   aria-label={"Catalogue de "+label} onScroll={onScroll}>
   {loading?<p className="lr-sticker-empty" role="status">Chargement des {label}…</p>:null}
   {error?<div className="lr-gif-error" role="alert">{error}
    <button type="button" onClick={()=>setRetry(previous=>previous+1)}>Réessayer</button></div>:null}
   {displayed.length?<div className="lr-gif-grid">{displayed.map(item=>
    <div className="lr-gif-tile" key={item.id}>
     <button type="button" className="lr-gif-send"
      aria-label={"Envoyer "+item.title} title={item.title} onClick={()=>send(item)}>
      <img src={item.preview} alt={item.title||label} loading="lazy"/>
     </button>
     <button type="button" className={"lr-gif-favorite"+(favorites.includes(item.id)?" is-favorite":"")}
      aria-label={"Favori : "+item.title} aria-pressed={favorites.includes(item.id)}
      onClick={()=>toggleFavorite(item)}>{favorites.includes(item.id)?"★":"☆"}</button>
    </div>)}</div>:!loading&&!error?<p className="lr-sticker-empty">
     {group!=="trending"?"Aucun élément enregistré.":kind==="emoji"&&query.trim()?
      "Aucun emoji correspondant parmi les résultats chargés.":"Aucun résultat trouvé."}
    </p>:null}
   {kind==="emoji"&&query.trim()?<p className="lr-giphy-help">Recherche parmi les émojis GIPHY chargés.</p>:null}
   {loadingMore?<p className="lr-giphy-page-status" role="status">Chargement de nouveaux résultats…</p>:null}
   {moreError?<p className="lr-gif-error" role="alert">{moreError}</p>:null}
   {hasMore&&!loading&&!error?<button className="lr-giphy-load-more" type="button"
    disabled={loadingMore} onClick={()=>void loadMore()}>
    {loadingMore?"Chargement…":"Voir plus de "+label}</button>:null}
   {group==="trending"&&items.length>=GIPHY_PAGE_SIZE&&!hasMore&&!loading?
    <p className="lr-giphy-page-status">Fin des résultats disponibles.</p>:null}
  </div>
 </>;
}
