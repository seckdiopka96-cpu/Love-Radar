import {useCallback,useEffect,useRef,useState,type DragEvent} from "react";
import {apiFetch} from "./api";
import {PUZZLE_TILE_COUNT,PUZZLE_THEMES,puzzleImage,themeLabel,tileBackgroundPosition,type PuzzleBoard,type PuzzleTheme} from "./puzzle-utils";
import "./shared-puzzle.css";
type Reply={ok:boolean;error?:string;board?:PuzzleBoard;partnerOnBoard?:boolean;members?:number};
type Props={token:string;myName:string;partnerName:string|null;onExit:()=>void};
export default function SharedPuzzle({token,myName,partnerName,onExit}:Props){
 const [board,setBoard]=useState<PuzzleBoard|null>(null);
 const [selected,setSelected]=useState<number|null>(null);
 const [partnerOnBoard,setPartnerOnBoard]=useState(false);
 const [members,setMembers]=useState(1);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [preview,setPreview]=useState(false);
 const selectedRef=useRef<number|null>(null);
 const boardRef=useRef<PuzzleBoard|null>(null);
 const busyRef=useRef(false);
 const aliveRef=useRef(true);
 const dragging=useRef<number|null>(null);
 const firstRef=useRef(true);
 const accept=useCallback((data:Reply)=>{
  if(!aliveRef.current)return;
  if(data.board&&(!boardRef.current||data.board.version>=boardRef.current.version)){
   if(boardRef.current?.version!==data.board.version){
    const previouslySolved=boardRef.current?.solved||false;
    boardRef.current=data.board;setBoard(data.board);
    if(data.board.solved&&!previouslySolved)setNotice("🎉 Bravo ! Puzzle terminé à deux ❤️");
    if(firstRef.current)firstRef.current=false;
    selectedRef.current=null;setSelected(null);
   }
  }
  if(data.members!==undefined)setMembers(data.members);
  if(data.partnerOnBoard!==undefined)setPartnerOnBoard(data.partnerOnBoard);
  setLoading(false);
 },[]);
 const refresh=useCallback(async(silent=false)=>{
  if(document.visibilityState!=="visible"||busyRef.current)return;
  try{
   const response=await apiFetch("/api/puzzle",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as Reply;
   if(!response.ok||!data.ok)throw Error(data.error||"Connexion au puzzle perdue.");
   accept(data);
   setError("");
  }catch(e){if(aliveRef.current){setLoading(false);if(!silent)setError(e instanceof Error?e.message:"Impossible de charger le puzzle.");}}
 },[token,accept]);
 useEffect(()=>{
  aliveRef.current=true;
  void refresh();
  const sync=window.setInterval(()=>void refresh(true),1150);
  const heartbeat=async()=>{
   try{
    const response=await apiFetch("/api/puzzle",{method:"POST",headers:{
     "Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({action:"presence"})});
    const data=await response.json() as Reply;
    if(response.ok&&data.ok)accept(data);
   }catch{/* Retry on next interval. */}
  };
  void heartbeat();
  const beat=window.setInterval(()=>{if(document.visibilityState==="visible")void heartbeat()},6000);
  const visible=()=>{if(document.visibilityState==="visible"){void refresh();void heartbeat();}};
  document.addEventListener("visibilitychange",visible);
  return()=>{aliveRef.current=false;window.clearInterval(sync);window.clearInterval(beat);document.removeEventListener("visibilitychange",visible)};
 },[token,refresh,accept]);
 const post=useCallback(async(payload:Record<string,unknown>)=>{
  const latest=boardRef.current;
  if(!latest||busyRef.current)return false;
  busyRef.current=true;setBusy(true);setError("");
  try{
   const response=await apiFetch("/api/puzzle",{method:"POST",headers:{
    "Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({...payload,version:latest.version})});
   const data=await response.json() as Reply;
   if(!response.ok||!data.ok)throw Error(data.error||"Déplacement impossible.");
   accept(data);
   if(payload.action==="restart")setNotice("🧩 Nouvelle image ! À vous de jouer.");
   return true;
  }catch(e){
   if(aliveRef.current)setError(e instanceof Error?e.message:"Le puzzle a changé. Réessaie.");
   return false;
  }finally{
   busyRef.current=false;setBusy(false);
   // On conflicting moves always reload the authoritative shared arrangement.
   void refresh();
  }
 },[token,accept,refresh]);
 function choose(index:number){
  if(busy||!board||board.solved)return;
  if(selectedRef.current===null){
   selectedRef.current=index;setSelected(index);
  }else if(selectedRef.current===index){
   selectedRef.current=null;setSelected(null);
  }else{
   const from=selectedRef.current;selectedRef.current=null;setSelected(null);
   void post({action:"swap",from,to:index});
  }
 }
 function dragStart(event:DragEvent<HTMLButtonElement>,index:number){
  if(busy||board?.solved){event.preventDefault();return;}
  dragging.current=index;event.dataTransfer.effectAllowed="move";
  event.dataTransfer.setData("text/plain",String(index));
 }
 function drop(event:DragEvent<HTMLButtonElement>,index:number){
  event.preventDefault();
  const from=dragging.current;dragging.current=null;
  if(from!==null&&from!==index&&!busy&&!board?.solved){
   selectedRef.current=null;setSelected(null);void post({action:"swap",from,to:index});
  }
 }
 const correct=board?.tiles.filter((tile,index)=>tile===index).length||0;
 const currentTheme=board?.theme||"love";
 const image=puzzleImage(currentTheme);
 return <section className="cp-page" aria-label="Puzzle coopératif pour couple">
  <header className="cp-top">
   <button type="button" className="cp-back" onClick={onExit}>‹ Nous deux</button>
   <div className="cp-brand"><strong>Puzzle <span>♡</span> à deux</strong><small>LOVE RADAR · NOTRE JEU</small></div>
   <span className="cp-top-symbol" aria-hidden="true">🧩</span>
  </header>
  <div className="cp-online" role="status">
   <span className={"cp-online-dot"+(partnerOnBoard?" on":"")}/>
   <span>{members<2?"Invite ton partenaire pour jouer ensemble.":partnerOnBoard?
    (partnerName||"Ton amour")+" joue avec toi 💞":
    "Tu peux commencer, "+(partnerName||"ton partenaire")+" verra le même puzzle."}</span>
  </div>
  <div className="cp-body">
   <div className="cp-game-head">
    <div><small>VOTRE IMAGE À RECONSTRUIRE</small><strong>{themeLabel(currentTheme)}</strong></div>
    <span className="cp-moves">🧩 {correct}/9 <small>· {board?.moves||0} échanges</small></span>
   </div>
   <div className="cp-grid-row">
    <div className="cp-puzzle-frame">
     {board?<div className={"cp-puzzle-grid"+(board.solved?" is-solved":"")} role="group" aria-label="Puzzle de neuf pièces. Sélectionne deux cases pour échanger les images.">
      {board.tiles.map((tile,index)=>{
       const p=tileBackgroundPosition(tile);
       const isCorrect=tile===index;
       return <button type="button" key={index}
        className={"cp-tile"+(selected===index?" selected":"")+(isCorrect?" correct":"")}
        disabled={busy||board.solved}
        aria-pressed={selected===index}
        aria-label={"Case "+(index+1)+", pièce "+(tile+1)+(isCorrect?", bien placée":"")}
        onClick={()=>choose(index)}
        draggable={!busy&&!board.solved}
        onDragStart={event=>dragStart(event,index)}
        onDragOver={event=>event.preventDefault()}
        onDrop={event=>drop(event,index)}
        onDragEnd={()=>{dragging.current=null}}
        style={{backgroundImage:"url("+image+")",backgroundSize:"300% 300%",backgroundPosition:p.x+" "+p.y}}>
        {isCorrect?<span className="cp-correct-mark" aria-hidden="true">✓</span>:null}
       </button>;
      })}
     </div>:<div className="cp-loading" role="status">{loading?"Ouverture de votre puzzle…":"Puzzle indisponible, réessaie."}</div>}
     {board?.solved?<div className="cp-solved-overlay" role="status"><span>🎉</span><strong>Vous avez réussi !</strong><small>Votre image est complète ❤️</small>
      <button type="button" disabled={busy} onClick={()=>void post({action:"restart",theme:currentTheme})}>Rejouer ensemble ↻</button>
     </div>:null}
    </div>
    <div className="cp-side">
     <button type="button" className="cp-image-preview" onClick={()=>setPreview(v=>!v)}
      aria-expanded={preview} aria-label="Afficher le modèle de l'image">
      <img src={image} alt={"Modèle de puzzle : "+themeLabel(currentTheme)}/>
      <span>👁️ Modèle</span>
     </button>
     <div className="cp-game-status">
      <strong>{board?.solved?"🏆 Puzzle réussi !":selected!==null?"Sélectionne la deuxième case":"À toi de jouer !"}</strong>
      <small>{board?.lastBy?"Dernier mouvement : "+board.lastBy:"Touchez deux pièces pour les échanger."}</small>
     </div>
    </div>
   </div>
   {preview?<div className="cp-preview-box" role="dialog" aria-label="Modèle du puzzle"><img src={image} alt={"Image complète : "+themeLabel(currentTheme)}/><button type="button" onClick={()=>setPreview(false)}>Fermer le modèle</button></div>:null}
   <div className="cp-instructions"><span>👆</span><p><strong>Comment jouer ?</strong> Choisissez une pièce, puis une deuxième pour les échanger. Vous pouvez tous les deux déplacer les pièces en temps réel. Retrouvez l’image complète ensemble !</p></div>
   <div className="cp-chooser">
    <div className="cp-chooser-header"><strong>💞 Choisir une autre image</strong><span>Partie commune</span></div>
    <div className="cp-choices">
     {PUZZLE_THEMES.map(theme=><button type="button" key={theme} className={theme===currentTheme?" active":""}
      disabled={busy||loading} onClick={()=>void post({action:"restart",theme})}>
      <img src={puzzleImage(theme)} alt=""/><span>{themeLabel(theme)}</span>
     </button>)}
    </div>
    <button type="button" className="cp-restart" disabled={busy||loading} onClick={()=>void post({action:"restart",theme:currentTheme})}>↻ Mélanger les pièces</button>
   </div>
  </div>
  {error?<div className="cp-alert" role="alert">{error}<button type="button" onClick={()=>{setError("");void refresh()}}>Réessayer</button></div>:null}
  {notice?<div className="cp-notice" role="status">{notice}<button type="button" onClick={()=>setNotice("")} aria-label="Fermer">×</button></div>:null}
 </section>;
}
