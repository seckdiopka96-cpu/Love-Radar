import { useCallback, useEffect, useRef, useState } from "react";
import "./ludo.css";
import "./ludo-immersive.css";
import DiceFace from "./DiceFace";
import {useLudoSounds} from "./ludo-sounds";

type Point=[number,number];
type Game={id:string;version:number;turn:number;dice:number|null;positions:number[][];status:"playing"|"won";winner:number|null;lastAction:string;updatedAt:number};
type Reaction={seat:number;emoji:string;at:number};
type PawnMotion={seat:number;pawn:number;progress:number};
type ResponseData={ok:boolean;error?:string;members?:number;seat?:number;game?:Game|null;reaction?:Reaction|null};
type Props={token:string;mySeat:number;myName:string;partnerName:string|null;onExit:()=>void};
const key=(r:number,c:number)=>r+"-"+c;
const TRACK:Point[]=[
 ...[1,2,3,4,5].map(c=>[6,c] as Point),
 ...[5,4,3,2,1,0].map(r=>[r,6] as Point),
 [0,7],
 ...[0,1,2,3,4,5].map(r=>[r,8] as Point),
 ...[9,10,11,12,13,14].map(c=>[6,c] as Point),
 [7,14],
 ...[14,13,12,11,10,9].map(c=>[8,c] as Point),
 ...[9,10,11,12,13,14].map(r=>[r,8] as Point),
 [14,7],
 ...[14,13,12,11,10,9].map(r=>[r,6] as Point),
 ...[5,4,3,2,1,0].map(c=>[8,c] as Point),
 [7,0],[6,0],
];
const HOME:Point[][]=[
 [1,2,3,4,5,6].map(c=>[7,c] as Point),
 [13,12,11,10,9,8].map(c=>[7,c] as Point),
];
const BASE:Point[][]=[
 [[1,1],[1,4],[4,1],[4,4]],
 [[10,10],[10,13],[13,10],[13,13]],
];
const trackAt=new Map(TRACK.map((p,i)=>[key(p[0],p[1]),i]));
const homeAt=HOME.map(list=>new Set(list.map(p=>key(p[0],p[1]))));
const SAFE=new Set([0,8,13,21,26,34,39,47]);
const CELL=Array.from({length:225},(_,i)=>[Math.floor(i/15),i%15] as Point);
function allowed(progress:number,dice:number|null){return dice!==null&&(progress===-1?dice===6:progress>=0&&progress<57&&progress+dice<=57)}
function labelPosition(progress:number){return progress===-1?"Dans la base":progress===57?"Arrivé !":progress>=51?"Couloir final":"Sur le plateau"}


const EMOJIS=["❤️","😂","🔥","👏","😍","💋"];
function PawnShape({index}:{index:number}){
 return <svg viewBox="0 0 34 45" focusable="false" aria-hidden="true">
  <ellipse className="ludo-pawn-shadow" cx="17" cy="41" rx="12" ry="3"/>
  <path className="ludo-pawn-stem" d="M13 18C13 23 12 27 9 32Q8 34 12 35H22Q26 34 25 32C22 27 21 23 21 18Z"/>
  <ellipse className="ludo-pawn-foot" cx="17" cy="36" rx="14" ry="6"/>
  <circle className="ludo-pawn-head" cx="17" cy="13" r="10"/>
  <path className="ludo-pawn-shine" d="M11 10Q13 5 17 5" fill="none" strokeWidth="2.3" strokeLinecap="round"/>
  <text x="17" y="39" textAnchor="middle" className="ludo-pawn-number">{index+1}</text>
 </svg>;
}

export default function Ludo({token,mySeat,myName,partnerName,onExit}:Props){
 const [game,setGame]=useState<Game|null>(null);
 const [members,setMembers]=useState(0);
 const [reaction,setReaction]=useState<Reaction|null>(null);
 const [busy,setBusy]=useState(false);
 const [rolling,setRolling]=useState(false);
 const [rollingFace,setRollingFace]=useState(1);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [menu,setMenu]=useState(false);
 const [rules,setRules]=useState(false);
 const [emotes,setEmotes]=useState(false);
 const [effect,setEffect]=useState("");
 const [boardSize,setBoardSize]=useState(0);
 const [motion,setMotion]=useState<PawnMotion|null>(null);
 const [captureFlash,setCaptureFlash]=useState(false);
 const {enabled:soundOn,unlock:unlockSound,play:playSound,toggle:toggleSound}=useLudoSounds();
 const boardStage=useRef<HTMLDivElement|null>(null);
 const prior=useRef<Game|null>(null);
 const effectTimeout=useRef<number|null>(null);
 const movementTimers=useRef<number[]>([]);
 const captureTimer=useRef<number|null>(null);
 const isActive=useRef(true);

 const clearMotionTimers=useCallback(()=>{
  for(const timer of movementTimers.current)window.clearTimeout(timer);
  movementTimers.current=[];
  if(captureTimer.current!==null){window.clearTimeout(captureTimer.current);captureTimer.current=null}
 },[]);

 const onGame=useCallback((latest:Game)=>{
  const prev=prior.current;
  // Concurrent polls must not roll the client back to an older version.
  if(prev&&prev.id===latest.id&&latest.version<=prev.version)return;
  if(prev?.id!==latest.id){clearMotionTimers();setMotion(null);setCaptureFlash(false)}
  if(prev&&prev.id===latest.id&&latest.version>prev.version){
   const captured=latest.positions.some((positions,side)=>positions.some((p,i)=>p===-1&&prev.positions[side][i]>=0));
   const moved=latest.positions.flatMap((positions,side)=>positions.map((progress,pawn)=>({
    seat:side,pawn,from:prev.positions[side][pawn],to:progress
   }))).find(item=>item.to>item.from&&item.to>=0&&item.to<=57);
   const celebration=latest.status==="won"&&prev.status!=="won";
   const canAnimate=Boolean(moved&&moved.to-moved.from<=6&&document.visibilityState==="visible"&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
   if(moved||captured||celebration){
    setEffect(celebration?"win":captured?"capture":"move");
    if(effectTimeout.current!==null)window.clearTimeout(effectTimeout.current);
    effectTimeout.current=window.setTimeout(()=>{if(isActive.current){setEffect("");setCaptureFlash(false)}},1400);
   }
   clearMotionTimers();
   if(moved){
    if(canAnimate){
     const route:number[]=[];
     for(let step=moved.from+1;step<=moved.to;step++)route.push(step);
     // Display animation only: D1 remains authoritative for game state.
     setMotion({seat:moved.seat,pawn:moved.pawn,progress:moved.from});
     route.forEach((progress,index)=>{
      movementTimers.current.push(window.setTimeout(()=>{
       if(!isActive.current)return;
       setMotion({seat:moved.seat,pawn:moved.pawn,progress});
       playSound("step");
      },index*125+55));
     });
     const ending=route.length*125+90;
     movementTimers.current.push(window.setTimeout(()=>{if(isActive.current)setMotion(null)},ending));
     if(captured)captureTimer.current=window.setTimeout(()=>{
      if(isActive.current){setCaptureFlash(true);playSound("capture")}
     },ending);
     if(celebration)captureTimer.current=window.setTimeout(()=>{if(isActive.current)playSound("win")},ending);
    }else{
     setMotion(null);
     playSound("step");
     if(captured){setCaptureFlash(true);playSound("capture")}
     if(celebration)playSound("win");
    }
   }else{
    setMotion(null);
    if(captured){setCaptureFlash(true);playSound("capture")}
    if(celebration)playSound("win");
   }
  }
  prior.current=latest;
  setGame(latest);
 },[clearMotionTimers,playSound]);

 const load=useCallback(async()=>{
  try{
   const res=await fetch("/api/ludo",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Connexion au jeu impossible.");
   if(!isActive.current)return;
   setMembers(data.members||0);
   if(data.game)onGame(data.game);
   else {prior.current=null;setGame(null)}
   setReaction(data.reaction||null);
   setError("");
  }catch(e){if(isActive.current)setError(e instanceof Error?e.message:"Connexion au jeu impossible.")}
  finally{if(isActive.current)setLoading(false)}
 },[token,onGame]);

 useEffect(()=>{
  isActive.current=true;
  void load();
  const interval=window.setInterval(()=>{if(document.visibilityState==="visible")void load()},1600);
  const visible=()=>{if(document.visibilityState==="visible")void load()};
  document.addEventListener("visibilitychange",visible);
  return()=>{
   isActive.current=false;
   window.clearInterval(interval);
   document.removeEventListener("visibilitychange",visible);
   if(effectTimeout.current!==null)window.clearTimeout(effectTimeout.current);
   clearMotionTimers();
  };
 },[load,clearMotionTimers]);

 useEffect(()=>{
  const el=boardStage.current;
  if(!el)return;
  const observe=new ResizeObserver(()=>{
   const available=Math.min(el.clientWidth-8,el.clientHeight-8);
   if(available>0)setBoardSize(Math.floor(available));
  });
  observe.observe(el);
  return()=>observe.disconnect();
 },[]);

 useEffect(()=>{
  if(!rolling)return;
  const interval=window.setInterval(()=>setRollingFace(1+Math.floor(Math.random()*6)),90);
  return()=>window.clearInterval(interval);
 },[rolling]);

 async function act(action:"roll"|"move"|"restart"|"forfeit",pawn?:number){
  if(busy||!game)return false;
  // WebAudio must be unlocked immediately by a user tap on iOS.
  if(action==="roll"||action==="move"){unlockSound();if(action==="roll")playSound("roll")}
  setBusy(true);setError("");
  if(action==="roll")setRolling(true);
  try{
   const res=await fetch("/api/ludo",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action,version:game.version,...(pawn===undefined?{}:{pawn})})
   });
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Action impossible.");
   if(data.game)onGame(data.game);
   return true;
  }catch(e){
   setError(e instanceof Error?e.message:"Action impossible.");
   void load();
   return false;
  }finally{
   setBusy(false);
   if(action==="roll")window.setTimeout(()=>{if(isActive.current)setRolling(false)},350);
  }
 }

 async function sendReaction(emoji:string){
  setEmotes(false);
  try{
   const res=await fetch("/api/ludo",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"react",emoji})
   });
   const data=await res.json() as ResponseData;
   if(res.ok&&data.ok&&data.reaction)setReaction(data.reaction);
  }catch{/* Reactions are optional and must never interrupt play. */}
 }

 const myTurn=Boolean(game&&game.status==="playing"&&game.turn===mySeat);
 const canPlay=Boolean(game&&myTurn&&game.dice!==null&&!busy&&!rolling&&!motion);
 const legal=game?game.positions[mySeat].map(p=>allowed(p,game.dice)):([false,false,false,false] as boolean[]);
 const displayName=(seat:number)=>seat===mySeat?myName:(partnerName||"Ton amour");
 const red= mySeat===0;
 const finished=(seat:number)=>game?.positions[seat].filter(p=>p===57).length||0;
 const pawnCells=new Map<string,{seat:number;pawn:number;active:boolean}[]>();
 if(game)for(let side=0;side<2;side++)for(let pawn=0;pawn<4;pawn++){
  const progress=game.positions[side][pawn];
  if(progress===57||(motion?.seat===side&&motion.pawn===pawn))continue;
  const point=progress===-1?BASE[side][pawn]:progress<=50?TRACK[(side*26+progress)%52]:HOME[side][progress-51];
  if(!point)continue;
  const k=key(point[0],point[1]);
  const items=pawnCells.get(k)||[];
  items.push({seat:side,pawn,active:canPlay&&side===mySeat&&legal[pawn]});
  pawnCells.set(k,items);
 }
 const movingPoint:Point|null=motion?(motion.progress<0?BASE[motion.seat][motion.pawn]:motion.progress<=50?TRACK[(motion.seat*26+motion.progress)%52]:motion.progress===57?[7,7]:HOME[motion.seat][motion.progress-51]):null;
 const movingStyle=movingPoint?{left:((movingPoint[1]+.5)/15*100)+"%",top:((movingPoint[0]+.5)/15*100)+"%"}:undefined;
 const shownReaction=reaction&&Date.now()-reaction.at<7000?reaction:null;
 const lastNumber=game?.lastAction.match(/lancé un ([1-6])/);
 const showLast=lastNumber?Number(lastNumber[1]):5;
 const dice=rolling?rollingFace:(game?.dice??showLast);
 const message=!game?"En attente de votre salon à deux":game.status==="won"?"Partie terminée":game.dice!==null&&myTurn?"Choisis un pion qui brille":game.dice!==null?"Ton partenaire choisit son pion":myTurn?"À TOI DE JOUER !":"AU TOUR DE "+displayName(game.turn);
 const status=game?.status==="won"?"🏆":myTurn?"✦":"◌";
 return <section className="ludo-experience" aria-label="Ludo en ligne privé à deux joueurs">
  <header className="ludo-topbar">
   <button type="button" className="ludo-leave" onClick={()=>setMenu(true)} aria-label="Quitter ou abandonner la partie">
    <span aria-hidden="true">‹</span> Quitter
   </button>
   <div className="ludo-brand"><strong>LUDO <span>♥</span> DUO</strong><small>PARTIE PRIVÉE · 2 JOUEURS</small></div>
   <div className="ludo-top-actions">
    <button type="button" className="ludo-sound" onClick={toggleSound} aria-label={soundOn?"Couper les sons du jeu":"Activer les sons du jeu"} aria-pressed={soundOn}>{soundOn?"🔊":"🔇"}</button>
    <button type="button" className="ludo-help" onClick={()=>setRules(true)} aria-label="Voir les règles du Ludo">?</button>
   </div>
  </header>

  <div className="ludo-players">
   {[0,1].map(side=><div key={side} className={"ludo-player ludo-player-"+(side===0?"red":"gold")+(game?.turn===side&&game.status==="playing"?" is-active":"")}>
    <div className="ludo-player-avatar">{displayName(side).trim().charAt(0).toUpperCase()||"♥"}</div>
    <div className="ludo-player-info"><strong>{displayName(side)}{side===mySeat?" · Moi":""}</strong><span>{finished(side)} / 4 arrivés</span></div>
    {game?.turn===side&&game.status==="playing"?<span className="ludo-player-turn" aria-label="À son tour">●</span>:null}
   </div>)}
  </div>

  <div className={"ludo-turn-banner"+(myTurn?" its-mine":"")} role="status" aria-live="polite">
   <span className="ludo-turn-icon" aria-hidden="true">{status}</span>
   <strong>{message}</strong>
   {game?.status==="playing"?<span className="ludo-turn-mini">{myTurn?"Ton dé 🎲":"En direct"}</span>:null}
  </div>

  <div className="ludo-play-area">
  <div className={"ludo-stage"+(captureFlash?" ludo-is-capture":"")} ref={boardStage}>
   {!game?<div className="ludo-waiting"><span>🎲</span><h2>{loading?"Chargement du jeu…":members<2?"Ton partenaire n’a pas encore rejoint":"Ouverture du plateau…"}</h2><p>{members<2?"Partage votre code privé pour jouer ensemble.":"Synchronisation des deux téléphones."}</p><button onClick={()=>void load()}>Actualiser</button></div>:
    <div className={"ludo-board-wrap ludo-board-wrap-immersive"+(effect==="move"?" ludo-board-move":"")} style={boardSize?{width:boardSize,height:boardSize}:undefined}>
     <div className="ludo-board" role="group" aria-label="Plateau coloré de Ludo pour deux joueurs">
      {CELL.map(([r,c])=>{
       const k=key(r,c),track=trackAt.get(k);
       const redBase=r<6&&c<6, goldBase=r>8&&c>8;
       const blueBase=r<6&&c>8,greenBase=r>8&&c<6;
       const redLane=homeAt[0].has(k),goldLane=homeAt[1].has(k);
       const blueLane=c===7&&r>=1&&r<=5,greenLane=c===7&&r>=9&&r<=13;
       const center=r>=6&&r<=8&&c>=6&&c<=8;
       const baseClass=redBase?" ludo-red-base":goldBase?" ludo-gold-base":blueBase?" ludo-blue-base":greenBase?" ludo-green-base":"";
       const cls="ludo-cell"+baseClass+(track!==undefined?" ludo-path":"")+(redLane?" ludo-red-lane":"")+(goldLane?" ludo-gold-lane":"")+(blueLane?" ludo-blue-lane":"")+(greenLane?" ludo-green-lane":"")+(center?" ludo-center":"")+(track===0?" ludo-red-start":"")+(track===26?" ludo-gold-start":"");
       const pawns=pawnCells.get(k)||[];
       return <div key={k} className={cls}>
        {track!==undefined&&SAFE.has(track)?<span className="ludo-star" aria-hidden="true">★</span>:null}
        {pawns.length?<div className="ludo-cell-pawns">{pawns.map(item=><button type="button" key={item.seat+"-"+item.pawn}
         disabled={!item.active} onClick={()=>void act("move",item.pawn)}
         title={"Pion "+(item.pawn+1)+" de "+displayName(item.seat)}
         aria-label={"Pion "+(item.pawn+1)+" de "+displayName(item.seat)+(item.active?" : déplacer":"")}
         className={"ludo-pawn ludo-pawn-"+(item.seat===0?"red":"gold")+(item.active?" can-move":"")}>
         <PawnShape index={item.pawn}/>
        </button>)}</div>:null}
       </div>;
      })}
      <div className="ludo-yard ludo-yard-red" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-upper" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-lower" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-gold" aria-hidden="true"/>
      <div className="ludo-board-center" aria-hidden="true"><span>♥</span></div>
      {motion&&movingStyle?<div className={"ludo-moving-pawn ludo-pawn-"+(motion.seat===0?"red":"gold")} style={movingStyle} aria-hidden="true">
        <PawnShape index={motion.pawn}/>
       </div>:null}
     </div>
    </div>}
   {error?<div className="ludo-alert-pop" role="alert">{error}</div>:null}
   {shownReaction?<div className={"ludo-floating-emoji"+(shownReaction.seat===mySeat?" mine":" theirs")} key={shownReaction.at} role="status">{shownReaction.emoji}</div>:null}
   {game?.status==="won"&&!motion?<div className="ludo-victory" role="dialog" aria-label="Partie terminée">
    <div className="ludo-confetti-layer" aria-hidden="true">{Array.from({length:20},(_,i)=><i key={i} style={{left:((i*37+9)%97)+"%",animationDelay:((i*71)%900)+"ms",backgroundColor:["#ffc757","#fa8db9","#5ed3ba","#b995ff"][i%4]}}/>)}</div>
    <div className="ludo-celebrate" aria-hidden="true">🏆</div>
    <strong>{game.winner===mySeat?"Victoire !":displayName(game.winner??0)+" gagne !"}</strong>
    <p>{game.lastAction.includes("abandonné")?"Un joueur a abandonné la partie.":"Les quatre pions ont atteint le centre !"}</p>
    <button type="button" onClick={()=>void act("restart")} disabled={busy}>↻ Nouvelle partie</button>
    <button type="button" className="ludo-secondary" onClick={onExit}>Retour à l’accueil</button>
   </div>:null}
  </div>

  <footer className="ludo-game-footer">
   <div className="ludo-bottom-actions">
    <button type="button" className={"ludo-die-holder"+(rolling?" is-rolling":"")} disabled={!myTurn||busy||rolling||!!motion||!game||game.status==="won"||game.dice!==null} onClick={()=>void act("roll")} aria-label="Lancer le dé">
     <DiceFace value={dice||0} size="large" variant={red?"pink":"gold"}/>
    </button>
    <button type="button" className="ludo-main-action" disabled={!myTurn||busy||rolling||!!motion||!game||game.status==="won"||game.dice!==null}
     onClick={()=>void act("roll")}>{game?.dice!==null&&game?"DÉPLACE UN PION":myTurn?rolling?"LANCEMENT…":"LANCER LE DÉ":"ATTENDRE…"}</button>
    <button type="button" className={"ludo-emoji-button"+(emotes?" is-open":"")} onClick={()=>setEmotes(!emotes)} aria-label="Envoyer une réaction" aria-expanded={emotes}>♡</button>
   </div>
   <div className="ludo-pick-row" aria-label="Choisir un de tes quatre pions">
    <span className="ludo-pick-label">MES PIONS</span>
    {[0,1,2,3].map(i=><button key={i} type="button"
     disabled={!canPlay||!legal[i]} onClick={()=>void act("move",i)}
     aria-label={"Jouer le pion "+(i+1)+", "+labelPosition(game?.positions[mySeat]?.[i]??-1)}
     className={"ludo-pick ludo-pawn-"+(red?"red":"gold")+(canPlay&&legal[i]?" can-play":"")}>
      <PawnShape index={i}/>
     </button>)}
   </div>
   <div className="ludo-last-move" role="status" aria-live="polite">{error?"⚠ "+error:(game?.lastAction||"Ludo privé : rien que vous deux ♥")}</div>
   {emotes?<div className="ludo-emote-tray" role="group" aria-label="Réactions rapides">{EMOJIS.map(e=><button key={e} onClick={()=>void sendReaction(e)} type="button" aria-label={"Envoyer "+e}>{e}</button>)}</div>:null}
  </footer>
  </div>

  {menu?<div className="ludo-modal-backdrop" role="presentation">
   <div className="ludo-modal" role="dialog" aria-modal="true" aria-label="Quitter la partie">
    <div className="ludo-modal-symbol">♥</div><h2>Quitter la partie ?</h2>
    <p>Tu peux revenir à l’accueil sans perdre ta partie. Si tu abandonnes, ton partenaire remporte cette manche.</p>
    <button type="button" className="ludo-modal-primary" onClick={onExit}>← Retour à l’accueil</button>
    {game?.status==="playing"?<button type="button" className="ludo-modal-danger" disabled={busy} onClick={()=>{void act("forfeit").then(ok=>{if(ok){setMenu(false);onExit()}})}}>Abandonner la partie</button>:null}
    <button type="button" className="ludo-modal-text" onClick={()=>setMenu(false)}>Continuer à jouer</button>
   </div>
  </div>:null}

  {rules?<div className="ludo-modal-backdrop" role="presentation">
   <div className="ludo-modal ludo-rules-dialog" role="dialog" aria-modal="true" aria-label="Règles">
    <div className="ludo-modal-symbol">🎲</div><h2>Comment jouer ?</h2>
    <p>À deux, chacun avance ses 4 pions. Lance un 6 pour sortir. Choisis le pion à déplacer, capture l’adversaire et vise le centre du plateau.</p>
    <p>Un 6, une capture ou un pion arrivé donnent un tour bonus. Trois 6 d’affilée font passer le tour. Les cases ★ sont protégées. Il faut le nombre exact pour finir.</p>
    <button type="button" className="ludo-modal-primary" onClick={()=>setRules(false)}>Compris, jouons !</button>
   </div>
  </div>:null}
 </section>;
}
