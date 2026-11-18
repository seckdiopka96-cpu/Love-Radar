import {useMemo,useState,type FormEvent} from "react";
import {quotePreview} from "./message-quote";
import PrivatePhoto from "./PrivatePhoto";
import "./chat-favorites.css";

/** A personal search across locally decrypted chat history and remote saved message references. */
export type ArchiveMessage={
 id:string;sender_id:string;kind:"text"|"audio"|"image";content:string|null;
 created_at:number;object_key:string|null;mime:string|null;view_once?:boolean|number;
};
export type FavoriteMessage=ArchiveMessage&{savedAt?:number;saved_at?:number};
type Props={
 initialMode?:"saved"|"search";messages:ArchiveMessage[];favorites:FavoriteMessage[];media:Record<string,string>;
 mineId:string;partner:string;myName:string;privacyEnabled:boolean;
 hasMore:boolean;historyBusy:boolean;historyError:string;favoritesBusy:boolean;favoritesError:string;
 onToggle:(message:ArchiveMessage)=>void;onLoadOlder:()=>void;onLoadMedia:(message:ArchiveMessage)=>void;
 onOpen:(message:ArchiveMessage)=>void;onClose:()=>void;
};
const normalize=(raw:string)=>raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr-FR");
const shortDate=(time:number)=>new Date(time).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"});
function Entry({item,favorite,media,mineId,partner,myName,privacyEnabled,onOpen,onToggle,onLoadMedia}:{
 item:ArchiveMessage;favorite:boolean;media:Record<string,string>;mineId:string;partner:string;myName:string;privacyEnabled:boolean;
 onOpen:(message:ArchiveMessage)=>void;onToggle:(message:ArchiveMessage)=>void;onLoadMedia:(message:ArchiveMessage)=>void;
}){
 const [showMedia,setShowMedia]=useState(false);
 const isAudio=item.kind==="audio",isPhoto=item.kind==="image";
 const author=item.sender_id===mineId?"Toi":partner;
 function viewMedia(){setShowMedia(true);onLoadMedia(item)}
 return <article className={"cf-entry"+(isAudio?" cf-voice-entry":"")} id={"cf-"+item.id}>
  <div className="cf-entry-top"><span className="cf-entry-avatar">{author.slice(0,1).toUpperCase()}</span>
   <div><strong>{author}</strong><small>{shortDate(item.created_at)}</small></div>
   {favorite?<span className="cf-entry-saved" title="Message enregistré">★</span>:null}
  </div>
  <p className="cf-entry-text">{quotePreview(item.kind,item.content,180)}</p>
  {(isAudio||isPhoto)&&showMedia?(media[item.id]?(isAudio?
   <audio src={media[item.id]} controls preload="metadata" className="cf-player" aria-label={"Vocal de "+author}/>:
   <div className="cf-photo"><PrivatePhoto src={media[item.id]} enabled={privacyEnabled} viewer={myName} alt={"Photo de "+author} variant="album"/></div>):
   <p className="cf-media-loading" role="status">Chargement du {isAudio?"vocal":"souvenir"}…</p>):null}
  <div className="cf-entry-actions">
   {(isAudio||isPhoto)?<button type="button" onClick={viewMedia}>{showMedia?"↻ Recharger":isAudio?"▶ Écouter le vocal":"▧ Voir la photo"}</button>:null}
   <button type="button" onClick={()=>onOpen(item)}>Voir le message</button>
   <button type="button" className={favorite?"cf-unstar":""} onClick={()=>onToggle(item)} aria-label={favorite?"Retirer des favoris":"Ajouter aux favoris"}>{favorite?"★ Retirer":"☆ Garder"}</button>
  </div>
 </article>;
}
export default function ChatFavorites({initialMode="saved",messages,favorites,media,mineId,partner,myName,privacyEnabled,
 hasMore,historyBusy,historyError,favoritesBusy,favoritesError,onToggle,onLoadOlder,onLoadMedia,onOpen,onClose}:Props){
 const [mode,setMode]=useState<"saved"|"search">(initialMode);
 const [draft,setDraft]=useState(""),[query,setQuery]=useState("");
 const [onlyVocals,setOnlyVocals]=useState(false);
 const favoritesIds=useMemo(()=>new Set(favorites.map(item=>item.id)),[favorites]);
 const results=useMemo(()=>{
  const all=new Map<string,ArchiveMessage>();
  for(const item of [...messages,...favorites])if(!item.view_once)all.set(item.id,item);
  const q=normalize(query.trim());
  return [...all.values()].filter(item=>{
   if(onlyVocals&&item.kind!=="audio")return false;
   if(!q)return true;
   if(item.kind!=="text")return normalize(item.sender_id===mineId?"toi":partner).includes(q)||normalize(quotePreview(item.kind,item.content)).includes(q);
   return normalize(item.content||"").includes(q)||normalize(item.sender_id===mineId?"toi":partner).includes(q);
  }).sort((a,b)=>b.created_at-a.created_at);
 },[messages,favorites,onlyVocals,query,mineId,partner]);
 function submitSearch(e:FormEvent){e.preventDefault();setQuery(draft)}
 const list=mode==="saved"?favorites:results.slice(0,120);
 return <div className="cf-backdrop" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="cf-dialog" role="dialog" aria-modal="true" aria-label="Favoris et recherche dans la conversation">
   <header className="cf-top"><div><span>LOVE RADAR · CONVERSATION</span><h2>Nos mots précieux <em>♡</em></h2></div>
    <button type="button" onClick={onClose} className="cf-close" aria-label="Fermer les messages favoris">×</button>
   </header>
   <div className="cf-switch" role="tablist" aria-label="Messages enregistrés et recherche">
    <button type="button" role="tab" aria-selected={mode==="saved"} className={mode==="saved"?"active":""} onClick={()=>setMode("saved")}>★ Favoris <small>{favorites.length}</small></button>
    <button type="button" role="tab" aria-selected={mode==="search"} className={mode==="search"?"active":""} onClick={()=>setMode("search")}>⌕ Rechercher</button>
   </div>
   {mode==="saved"?<p className="cf-description">Tes messages favoris restent privés et synchronisés entre tes appareils connectés à ce compte.</p>:
    <div className="cf-search">
     <form role="search" onSubmit={submitSearch}>
      <label htmlFor="cf-query">Rechercher un mot, un prénom ou un ancien vocal</label>
      <div><input id="cf-query" type="search" autoComplete="off" autoCapitalize="none" placeholder="Un souvenir, un mot…" value={draft} onChange={e=>{setDraft(e.target.value);setQuery(e.target.value)}}/>
       <button type="submit" aria-label="Lancer la recherche">⌕</button></div>
     </form>
     <label className="cf-vocal-filter"><input type="checkbox" checked={onlyVocals} onChange={e=>setOnlyVocals(e.target.checked)}/> 🎤 Uniquement les vocaux</label>
     <p>La recherche s'effectue sur ton appareil, dans les messages chargés et les favoris. Aucune recherche en clair n'est envoyée au serveur.</p>
    </div>}
   {favoritesError?<p className="cf-error" role="alert">{favoritesError}</p>:null}
   {favoritesBusy?<p className="cf-sync">Actualisation de tes favoris…</p>:null}
   <div className="cf-list" role="region" aria-label={mode==="saved"?"Messages favoris":"Résultats de recherche"}>
    {list.length?<>{list.map(item=><Entry key={item.id} item={item} favorite={favoritesIds.has(item.id)} media={media} mineId={mineId} partner={partner} myName={myName} privacyEnabled={privacyEnabled} onOpen={onOpen} onToggle={onToggle} onLoadMedia={onLoadMedia}/>)}
     {mode==="search"&&results.length>120?<p className="cf-hint">Affichage des 120 résultats les plus récents. Affine le mot recherché pour réduire la sélection.</p>:null}</>:
     <div className="cf-empty"><span aria-hidden="true">{mode==="saved"?"⭐":"⌕"}</span><strong>{mode==="saved"?"Aucun message favori pour le moment":"Aucun résultat dans les messages chargés"}</strong><p>{mode==="saved"?"Maintiens ton doigt sur un message ou un vocal, puis choisis « Ajouter aux favoris ».":"Essaie un autre mot ou charge des messages plus anciens."}</p></div>}
    {mode==="search"&&(hasMore||historyBusy)?<div className="cf-more">
     <button type="button" disabled={historyBusy} onClick={onLoadOlder}>{historyBusy?"Chargement des anciens messages…":"↑ Chercher aussi dans les messages plus anciens"}</button>
     <p>Chaque chargement ajoute jusqu'à 50 anciens messages à la recherche.</p>
     {historyError?<p role="alert">{historyError}</p>:null}
    </div>:null}
   </div>
   <div className="cf-footer"><button type="button" onClick={onClose}>Retour à notre conversation</button></div>
  </section>
 </div>;
}
