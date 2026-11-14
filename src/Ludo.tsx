import { useCallback, useEffect, useRef, useState } from "react";
import "./ludo.css";
import "./ludo-immersive.css";
import DiceFace from "./DiceFace";
import {useLudoSounds} from "./ludo-sounds";

type Point=[number,number];
type Game={id:string;version:number;turn:number;dice:number|null;positions:number[][];status:"playing"|"won";winner:number|null;lastAction:string;updatedAt:number;deadlineAt:number|null};
type Gift={consents:[boolean,boolean];choice:"credit"|"internet"|"wave2000"|null;chosenBy:number|null;given:boolean};
type Agreement={signed:[boolean,boolean];names:[string|null,string|null];giftChoices:[boolean|null,boolean|null];signedAt:[number|null,number|null];startedAt:number|null};
type GiftChoice="credit"|"internet"|"wave2000";
const GIFT_OPTIONS:{id:GiftChoice;label:string;detail:string}[]=[{id:"credit",label:"📱 Crédit téléphonique",detail:"Recharge à offrir"},{id:"internet",label:"🌐 Connexion Internet",detail:"Forfait Internet à offrir"},{id:"wave2000",label:"💸 Wave 2 000 F CFA",detail:"Cadeau à envoyer séparément"}];
const giftLabel=(choice:GiftChoice|null|undefined)=>GIFT_OPTIONS.find(item=>item.id===choice)?.label||"Cadeau à choisir";
type Reaction={seat:number;emoji:string;at:number};
type PawnMotion={seat:number;pawn:number;progress:number};
type ResponseData={ok:boolean;error?:string;members?:number;seat?:number;game?:Game|null;reaction?:Reaction|null;gift?:Gift|null;agreement?:Agreement|null;serverNow?:number};
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
 const [gift,setGift]=useState<Gift|null>(null);
 const [agreement,setAgreement]=useState<Agreement|null>(null);
 const [signature,setSignature]=useState("");
 const [rulesAccepted,setRulesAccepted]=useState(false);
 const [giftPreference,setGiftPreference]=useState<"yes"|"no"|"">("");
 const [signBusy,setSignBusy]=useState(false);
 const [giftOpen,setGiftOpen]=useState(false);
 const [giftBusy,setGiftBusy]=useState(false);
 const [clock,setClock]=useState(Date.now());
 const [clockOffset,setClockOffset]=useState(0);
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
  if(prev&&prev.id===latest.id&&latest.version<prev.version)return;
  if(prev&&prev.id===latest.id&&latest.version===prev.version){
   prior.current=latest;
   setGame(latest);
   return;
  }
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
   setGift(data.gift||null);
   setAgreement(data.agreement||null);
   if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
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
  const id=window.setInterval(()=>setClock(Date.now()),250);
  return()=>window.clearInterval(id);
 },[]);

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
  if(busy||!game||(action!=="restart"&&!agreement?.startedAt))return false;
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
   if(data.gift)setGift(data.gift);
   if(data.agreement)setAgreement(data.agreement);
   if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
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

 async function giftAction(action:"gift_choose"|"gift_given",value:boolean|GiftChoice){
  if(giftBusy||!game)return;
  setGiftBusy(true);setError("");
  const details=action==="gift_choose"?{choice:value}:{given:value};
  try{
   const response=await fetch("/api/ludo",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({action,...details})});
   const data=await response.json() as ResponseData;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d’enregistrer le cadeau.");
   if(data.gift)setGift(data.gift);
   setGiftOpen(false);
  }catch(e){setError(e instanceof Error?e.message:"Erreur cadeau.");}
  finally{setGiftBusy(false)}
 }

 async function signRules(){
  if(signBusy||!game||agreement?.startedAt||agreement?.signed[mySeat])return;
  if(!rulesAccepted||!signature.trim()||giftPreference==="")return;
  setSignBusy(true);setError("");
  try{
   const response=await fetch("/api/ludo",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"sign_rules",acceptRules:true,signature:signature.trim(),giftConsent:giftPreference==="yes"})
   });
   const data=await response.json() as ResponseData;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d’enregistrer la signature.");
   if(data.agreement)setAgreement(data.agreement);
   if(data.gift)setGift(data.gift);
   if(data.game)onGame(data.game);
   if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
  }catch(e){setError(e instanceof Error?e.message:"Signature non enregistrée.")}
  finally{setSignBusy(false)}
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

 const remaining=game?.status==="playing"&&game.deadlineAt?Math.max(0,Math.ceil((game.deadlineAt-clock-clockOffset)/1000)):null;
 const giftAgreed=Boolean(gift?.consents.every(Boolean));
 const myConsent=Boolean(gift?.consents[mySeat]);
 const mustSign=Boolean(game&&game.status==="playing"&&!agreement?.startedAt);
 const mySigned=Boolean(agreement?.signed[mySeat]);
 const otherSigned=Boolean(agreement?.signed[1-mySeat]);
 const myTurn=Boolean(game&&game.status==="playing"&&agreement?.startedAt&&game.turn===mySeat);
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
    <button type="button" className={"ludo-gift-shortcut"+(giftAgreed?" agreed":"")} onClick={()=>setGiftOpen(true)} aria-label="Défi cadeau facultatif" title="Défi cadeau">🎁</button>
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
   {remaining!==null?<span className={"ludo-countdown"+(remaining<=10?" urgent":"")} aria-label={"Temps restant : "+remaining+" secondes"}><span className="ludo-time-ring">{remaining}</span><small>s</small></span>:null}
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
    {giftAgreed?<div className="ludo-victory-gift">
      {gift?.choice?<span>🎁 {giftLabel(gift.choice)} {gift.given?"· Offert ✓":""}</span>:<span>🎁 Le gagnant choisit son cadeau</span>}
      {game.winner===mySeat?<button type="button" className="ludo-gift-victory-button" onClick={()=>setGiftOpen(true)}>{gift?.choice?"Modifier mon choix":"Choisir mon cadeau"}</button>:gift?.choice?<button type="button" className="ludo-gift-victory-button" onClick={()=>setGiftOpen(true)}>Voir le cadeau</button>:null}
    </div>:null}
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

  {mustSign?<div className="ludo-agreement-backdrop">
   <div className="ludo-agreement-dialog" role="dialog" aria-modal="true" aria-label="Règles et signature avant la partie">
    <div className="ludo-agreement-heading"><span className="ludo-agreement-icon">📜</span><div><h2>Avant de jouer</h2><p>Règles et accord des deux partenaires</p></div></div>
    <div className="ludo-agreement-status">
     {[0,1].map(seat=><div key={seat} className={"ludo-agreement-player"+(agreement?.signed[seat]?" is-signed":"")}>
       <span>{agreement?.signed[seat]?"✓":"✎"}</span>
       <strong>{displayName(seat)}</strong>
       <small>{agreement?.signed[seat]?"Signé":"Signature attendue"}</small>
      </div>)}
    </div>
    {!mySigned?<>
     <div className="ludo-agreement-rules" tabIndex={0} aria-label="Règles à lire">
      <h3>🎲 Règles du Ludo Duo</h3>
      <p>Vous jouez à deux, chacun avec quatre pions. Il faut faire un 6 pour sortir un pion. Le premier à amener ses quatre pions au centre gagne.</p>
      <p>Un 6, une capture ou une arrivée au centre donne un tour supplémentaire. Trois 6 consécutifs font perdre le tour. Les étoiles ★ sont protégées et il faut le nombre exact pour terminer.</p>
      <p><strong>⏱️ Chronomètre :</strong> chacun a 30 secondes pour agir. Après ce délai, l’ordinateur joue automatiquement à sa place dès qu’un appareil connecté interroge le serveur.</p>
      <h3>🎁 Défi cadeau facultatif</h3>
      <p>Si vous acceptez tous les deux le défi, <strong>le perdant propose d’offrir le cadeau choisi par le gagnant</strong> : crédit téléphonique, forfait Internet ou <strong>2 000 F CFA via Wave</strong>.</p>
      <p>Ce défi est un engagement amical, pas un contrat légal ni un paiement automatique. Vous pouvez jouer sans cadeau si l’un de vous refuse. Aucun achat ou transfert Wave n’est effectué dans Love Radar.</p>
     </div>
     <label className="ludo-agreement-read"><input type="checkbox" checked={rulesAccepted} onChange={e=>setRulesAccepted(e.target.checked)}/><span>J’ai lu et compris les règles de cette partie.</span></label>
     <fieldset className="ludo-agreement-choice">
      <legend>Acceptes-tu le défi cadeau si tu perds ?</legend>
      <label><input type="radio" name="gift_preference" checked={giftPreference==="yes"} onChange={()=>setGiftPreference("yes")}/><span>Oui, j’accepte de participer 🎁</span></label>
      <label><input type="radio" name="gift_preference" checked={giftPreference==="no"} onChange={()=>setGiftPreference("no")}/><span>Non, jouons sans cadeau</span></label>
     </fieldset>
     <label className="ludo-agreement-sign"><span>Ma signature (nom de mon profil : <strong>{myName}</strong>)</span><input type="text" maxLength={80} autoComplete="off" value={signature} onChange={e=>setSignature(e.target.value)} placeholder={"Écris « "+myName+" »"} aria-label="Signature électronique"/></label>
     <button type="button" className="ludo-agreement-submit" disabled={signBusy||!rulesAccepted||!signature.trim()||giftPreference===""} onClick={()=>void signRules()}>{signBusy?"Enregistrement…":"✍️ Je signe et j’accepte les règles"}</button>
    </>:<>
     <div className="ludo-agreement-wait">
      <span className="ludo-agreement-bigcheck">✓</span>
      <h3>Tu as signé !</h3>
      <p>Signature enregistrée pour cette manche.</p>
      <p>{otherSigned?"Vous avez signé tous les deux. La partie va commencer !":"En attente de la signature de "+displayName(1-mySeat)+"…"}</p>
      <p>Ton choix cadeau : <strong>{agreement?.giftChoices[mySeat]?"Accepté 🎁":"Sans cadeau"}</strong></p>
     </div>
    </>}
    {error?<div className="ludo-agreement-error" role="alert">{error}</div>:null}
    <button type="button" className="ludo-agreement-exit" onClick={onExit}>← Retour à l’accueil</button>
    <p className="ludo-agreement-footnote">Signature enregistrée dans votre espace privé pour cette manche uniquement.</p>
   </div>
  </div>:null}

  {giftOpen?<div className="ludo-modal-backdrop" role="presentation">
   <div className="ludo-modal ludo-gift-dialog" role="dialog" aria-modal="true" aria-label="Défi cadeau entre partenaires">
    <div className="ludo-modal-symbol">🎁</div>
    <h2>Défi cadeau</h2>
    {game?.status==="playing"?<>
      <p>Le choix du cadeau a été enregistré avec vos signatures avant cette partie.</p>
      <div className="ludo-gift-agreement"><span>Toi : {myConsent?"🎁 Oui":"Sans cadeau"}</span><span>Partenaire : {gift?.consents[1-mySeat]?"🎁 Oui":"Sans cadeau"}</span></div>
      {giftAgreed?<p className="ludo-gift-confirmed">✅ Vous avez tous les deux signé le défi cadeau.</p>:<p>Cette manche se joue sans cadeau.</p>}
    </>:game?.status==="won"&&giftAgreed?<>
      <p>{game.winner===mySeat?"Tu as gagné ! Choisis ton cadeau.":"Le gagnant choisit le cadeau à offrir."}</p>
      {game.winner===mySeat?GIFT_OPTIONS.map(item=><button type="button" className="ludo-gift-option" key={item.id} disabled={giftBusy} onClick={()=>void giftAction("gift_choose",item.id)}>
       <b>{item.label}</b><span>{item.detail}</span>
      </button>):<>
        <p className="ludo-gift-selected">{gift?.choice?giftLabel(gift.choice):"Le gagnant n’a pas encore choisi son cadeau."}</p>
        {gift?.choice?<button type="button" className="ludo-modal-primary" disabled={giftBusy||gift.given} onClick={()=>void giftAction("gift_given",true)}>{gift.given?"Déclaré offert ✓":"J’ai offert ce cadeau"}</button>:null}
      </>}
      <p>Le cadeau se règle entre vous, en dehors de Love Radar.</p>
    </>:<p>Le défi cadeau n’a pas été accepté par vous deux avant la fin de la partie. Vous pourrez l’activer pour une prochaine manche.</p>}
    <button type="button" className="ludo-modal-text" onClick={()=>setGiftOpen(false)}>Fermer</button>
   </div>
  </div>:null}

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
