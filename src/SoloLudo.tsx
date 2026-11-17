import {useEffect,useRef,useState} from "react";
import LudoDie3D from "./LudoDie3D";
import PawnShape from "./LudoPawn";
import {useLudoSounds} from "./ludo-sounds";
import {TRACK,HOME,SAFE,CELL,key,pointForProgress,movementSteps,stackCellStyle,type Point} from "./ludo-visuals";
import {freshSoloGame,isSoloGame,rollSolo,moveSolo,chooseSoloBotPawn,canSoloMove,availableSoloPawns,solePlayableSoloPawn,soloDie,SOLO_TURN_MS,shouldAutoPlaySolo,
 type SoloGame,type SoloSeat,type SoloMove} from "./ludo-solo-engine";
import "./ludo.css";
import "./ludo-immersive.css";
import "./ludo-solo.css";
import "./ludo-arena.css";
import LudoTutorial,{ludoGuideWasSeen} from "./LudoTutorial";

type Props={myName:string;storageKey:string;onExit:()=>void};
type Motion={seat:SoloSeat;pawn:number;from:number;to:number;progress:number};
const trackAt=new Map(TRACK.map((point,i)=>[key(point[0],point[1]),i]));
const homeAt=HOME.map(lane=>new Set(lane.map(point=>key(point[0],point[1]))));
const storeKey=(scope:string)=>"love-radar-ludo-solo-v1:"+scope;
function loadSaved(scope:string):SoloGame{
 try{
  const raw=localStorage.getItem(storeKey(scope));
  if(raw){
   const saved=JSON.parse(raw) as unknown;
   if(isSoloGame(saved))return {...saved,updatedAt:saved.updatedAt||Date.now()};
  }
 }catch{/* Private mode may reject storage; solo still works. */}
 return freshSoloGame();
}
function haptic(){try{navigator.vibrate?.(16)}catch{/* Unsupported. */}}
export default function SoloLudo({myName,storageKey,onExit}:Props){
 const [game,setGame]=useState<SoloGame>(()=>loadSaved(storageKey));
 const [assisted,setAssisted]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [motion,setMotion]=useState<Motion|null>(null);
 const [rolling,setRolling]=useState(false);
 const [face,setFace]=useState(1);
 const [boardSize,setBoardSize]=useState(0);
 const [landing,setLanding]=useState<Point|null>(null);
 const [reaction,setReaction]=useState("");
 const [confirmRestart,setConfirmRestart]=useState(false);
 const [tutorialOpen,setTutorialOpen]=useState(()=>!ludoGuideWasSeen("solo")&&game.positions.every(row=>row.every(pawn=>pawn===-1)));
 const {enabled:soundOn,unlock:unlockSound,play:playSound,toggle:toggleSound}=useLudoSounds();
 const stage=useRef<HTMLDivElement|null>(null);
 const timers=useRef<number[]>([]);
 const clearTimers=()=>{
  timers.current.forEach(id=>window.clearTimeout(id));
  timers.current=[];
 };
 const later=(callback:()=>void,ms:number)=>{
  const id=window.setTimeout(callback,ms);
  timers.current.push(id);
 };
 useEffect(()=>()=>{
  clearTimers();
 },[]);
 useEffect(()=>{
  try{localStorage.setItem(storeKey(storageKey),JSON.stringify(game))}catch{/* Still playable without storage. */}
 },[game,storageKey]);
 useEffect(()=>{
  const node=stage.current;
  if(!node)return;
  const observer=new ResizeObserver(()=>{
   const available=Math.floor(Math.min(node.clientWidth-8,node.clientHeight-8));
   if(available>0)setBoardSize(available);
  });
  observer.observe(node);
  return ()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!rolling)return;
  const id=window.setInterval(()=>setFace(1+Math.floor(Math.random()*6)),85);
  return ()=>window.clearInterval(id);
 },[rolling]);
 useEffect(()=>{
  const id=window.setInterval(()=>setNow(Date.now()),250);
  return ()=>window.clearInterval(id);
 },[]);
 // 15 seconds per move opportunity: no extra delay for an inactive player.
 useEffect(()=>{
  if(game.status!=="playing"||game.turn!==0||assisted||rolling||motion||confirmRestart||tutorialOpen)return;
  const delay=Math.max(0,game.updatedAt+SOLO_TURN_MS-Date.now());
  const id=window.setTimeout(()=>{if(shouldAutoPlaySolo(game,Date.now()))setAssisted(true);},delay);
  return ()=>window.clearTimeout(id);
 },[game,assisted,rolling,motion,confirmRestart,tutorialOpen]);
 useEffect(()=>{
  if(game.turn!==0||game.status!=="playing")setAssisted(false);
 },[game.turn,game.status]);
 function performRoll(seat:SoloSeat,automatic=false){
  if(game.turn!==seat||game.dice!==null||game.status!=="playing"||rolling||motion||(seat===0&&assisted&&!automatic))return;
  if(seat===0&&!automatic)unlockSound();
  playSound("roll");
  const outcome=soloDie();
  setRolling(true);
  later(()=>{
   setFace(outcome);
   setGame(prev=>{
    if(prev.turn!==seat||prev.dice!==null)return prev;
    const next=rollSolo(prev,outcome);
    return automatic&&seat===0?{...next,lastAction:"🤖 Après 15 s, l’ordinateur a lancé le dé pour toi. "+next.lastAction}:next;
   });
   setRolling(false);
  },620);
 }
 function performMove(seat:SoloSeat,pawn:number,automatic=false){
  if(game.turn!==seat||game.status!=="playing"||game.dice===null||rolling||motion||(seat===0&&assisted&&!automatic))return;
  const result=moveSolo(game,pawn);
  if(!result)return;
  const {move}=result;
  const route=movementSteps(move.from,move.to);
  setGame(automatic&&seat===0?{...result.game,lastAction:"🤖 L’ordinateur a déplacé ton pion. "+result.game.lastAction}:result.game);
  setLanding(null);
  if(route.length){
   setMotion({...move,progress:move.from});
   const stepDuration=move.from===-1?520:540,initialDelay=250;
   route.forEach((progress,i)=>{
    later(()=>{
     setMotion({...move,progress});
     playSound("step");
     if(i===route.length-1)haptic();
    },initialDelay+i*stepDuration);
   });
   later(()=>{
    setMotion(null);
    if(result.game.turn===0&&result.game.status==="playing"&&!assisted)setGame(prev=>({...prev,updatedAt:Date.now()}));
    setLanding(pointForProgress(move.seat,move.pawn,move.to));
    playMoveEffects(move,result.game.winner);
   },initialDelay+route.length*stepDuration+100);
  }else playMoveEffects(move,result.game.winner);
 }
 function playMoveEffects(move:SoloMove,winner:SoloSeat|null){
  if(move.captured.length){
   playSound("capture");
   setReaction(move.seat===0?"🎯":"😱");
  }else if(winner!==null){
   playSound("win");
   setReaction(winner===0?"🏆":"🤖");
  }else if(move.to===57)setReaction("🏠");
  if(move.captured.length||winner!==null||move.to===57){
   later(()=>setReaction(""),1600);
  }
  later(()=>setLanding(null),850);
 }
 // AI controls its own turn, or finishes the human turn when 15 s expires.
 useEffect(()=>{
  if(game.status!=="playing"||rolling||motion||confirmRestart||tutorialOpen)return;
  if(game.turn!==1&&!(game.turn===0&&assisted))return;
  const id=window.setTimeout(()=>{
   const seat=game.turn;
   if(game.dice===null)performRoll(seat,true);
   else{
    const pawn=chooseSoloBotPawn(game);
    if(pawn!==null)performMove(seat,pawn,true);
   }
  },game.dice===null?900:720);
  return ()=>window.clearTimeout(id);
 },[game,rolling,motion,assisted,confirmRestart,tutorialOpen]);
 // If only one pawn can move, don't require a meaningless tap. Animate it as
 // any other move, after the dice roll animation has finished.
 useEffect(()=>{
  if(game.status!=="playing"||game.turn!==0||game.dice===null||rolling||motion||
     assisted||confirmRestart||tutorialOpen)return;
  const onlyPawn=solePlayableSoloPawn(game,0);
  if(onlyPawn===null)return;
  const timer=window.setTimeout(()=>performMove(0,onlyPawn),320);
  return ()=>window.clearTimeout(timer);
 },[game,rolling,motion,assisted,confirmRestart,tutorialOpen]);
 const isHumanTurn=game.status==="playing"&&game.turn===0;
 const canRoll=isHumanTurn&&!assisted&&game.dice===null&&!rolling&&!motion;
 const canPick=isHumanTurn&&!assisted&&game.dice!==null&&!rolling&&!motion&&availableSoloPawns(game,0).length>1;
 const secondsLeft=isHumanTurn&&!assisted&&!rolling&&!motion?Math.max(0,Math.ceil((game.updatedAt+SOLO_TURN_MS-now)/1000)):null;
 const counts=game.positions.map(row=>row.filter(progress=>progress===57).length);
 const pawnCells=new Map<string,{seat:SoloSeat;pawn:number;active:boolean}[]>();
 for(const seat of [0,1] as SoloSeat[])for(let pawn=0;pawn<4;pawn++){
  const progress=game.positions[seat][pawn];
  if(progress===57||(motion?.seat===seat&&motion.pawn===pawn))continue;
  const [r,c]=pointForProgress(seat,pawn,progress);
  const k=key(r,c);
  const list=pawnCells.get(k)||[];
  list.push({seat,pawn,active:seat===0&&canPick&&canSoloMove(progress,game.dice)});
  pawnCells.set(k,list);
 }
 const light=new Map<string,"current"|"passed"|"upcoming"|"finish">();
 if(motion){
  for(const step of movementSteps(motion.from,motion.to)){
   const [r,c]=pointForProgress(motion.seat,motion.pawn,step);
   light.set(key(r,c),step===motion.progress?"current":step<motion.progress?"passed":step===motion.to?"finish":"upcoming");
  }
 }
 const movingPoint=motion?pointForProgress(motion.seat,motion.pawn,motion.progress):null;
 const movingStyle=movingPoint?{left:((movingPoint[1]+.5)/15*100)+"%",top:((movingPoint[0]+.5)/15*100)+"%"}:undefined;
 const message=game.status==="won"?(game.winner===0?"🏆 Victoire !":"🤖 L'ordinateur gagne"):
  assisted&&game.turn===0?"🤖 L’ordinateur joue à ta place…":motion?"Le pion avance…":rolling?(game.turn===1?"L'ordinateur lance le dé…":"Le dé roule…"):
  game.turn===1?(game.dice===null?"L'ordinateur réfléchit…":"L'ordinateur choisit un pion…"):
  game.dice===null?"À toi de jouer : lance le dé !":solePlayableSoloPawn(game,0)!==null?"Ton pion avance automatiquement…":"Choisis un pion qui brille";
 function reset(){
  clearTimers();
  setGame(freshSoloGame());
  setAssisted(false);
  setMotion(null);setRolling(false);setLanding(null);setReaction("");
  setConfirmRestart(false);
 }
 return <section className="ludo-experience ludo-solo ludo-arena" aria-label="Ludo solo contre l'ordinateur">
  <header className="ludo-topbar">
   <button type="button" className="ludo-leave" onClick={onExit}><span aria-hidden="true">‹</span> Jeux</button>
   <div className="ludo-brand"><strong>LUDO <span>★</span> SOLO</strong><small>TOI CONTRE L’ORDINATEUR</small></div>
   <div className="ludo-top-actions">
    <button type="button" className="ludo-sound" onClick={toggleSound} aria-label={soundOn?"Désactiver le son":"Activer le son"} aria-pressed={soundOn}>{soundOn?"🔊":"🔇"}</button>
    <button type="button" className="ludo-arena-how" onClick={()=>setTutorialOpen(true)} aria-label="Voir le tutoriel Ludo">?</button>
    <button type="button" className="ludo-solo-restart" onClick={()=>setConfirmRestart(true)} aria-label="Nouvelle partie">↻</button>
   </div>
  </header>
  <div className="ludo-players ludo-arena-player-rail" aria-label="Joueurs, dé et tour actif">
   <div className={"ludo-player ludo-player-red"+(game.turn===0&&game.status==="playing"?" is-active":"")}>
    <span className="ludo-player-avatar">{myName.trim().charAt(0).toUpperCase()||"☺"}</span>
    <div className="ludo-player-info"><strong>TOI</strong><span>{counts[0]} / 4 arrivés</span></div>
    {game.turn===0&&game.status==="playing"?<span className="ludo-player-turn" aria-label="À ton tour">●</span>:null}
   </div>
   <button type="button" className={"ludo-die-holder ludo-die-in-player-rail"+(rolling?" is-rolling":"")}
    disabled={!canRoll} onClick={()=>performRoll(0)}
    aria-label={rolling?"Le dé est en train de rouler":canRoll?"Lancer le dé":"Dé affiché, en attente du tour"} title={canRoll?"Lancer le dé":"Résultat du dé"}>
    <LudoDie3D value={face} color={game.turn===1?"green":"blue"} rolling={rolling}/>
   </button>
   <div className={"ludo-player ludo-player-gold"+(game.turn===1&&game.status==="playing"?" is-active":"")}>
    <span className="ludo-player-avatar">🤖</span>
    <div className="ludo-player-info"><strong>ORDI</strong><span>{counts[1]} / 4 arrivés</span></div>
    {game.turn===1&&game.status==="playing"?<span className="ludo-player-turn" aria-label="À l’ordinateur">●</span>:null}
   </div>
  </div>
  <div className={"ludo-turn-banner"+(isHumanTurn?" its-mine":"")} role="status" aria-live="polite">
   <span className="ludo-turn-icon">{isHumanTurn?"✦":"🎲"}</span><strong>{message}</strong>
   {secondsLeft!==null?<span className={"ludo-countdown"+(secondsLeft<=5?" urgent":"")} aria-label={"Temps restant : "+secondsLeft+" secondes"}><span className="ludo-time-ring">{secondsLeft}</span><small>s</small></span>:null}
   <span className="ludo-solo-mode-tag">SOLO</span>
  </div>
  <div className="ludo-play-area">
   <div className="ludo-stage" ref={stage}>
    <div className="ludo-board-wrap ludo-board-wrap-immersive" style={boardSize?{width:boardSize,height:boardSize}:undefined}>
     <div className={"ludo-board"+(motion?" ludo-board-animating":"")} role="group" aria-label="Plateau Ludo contre l'ordinateur">
      {CELL.map(([r,c])=>{
       const k=key(r,c),track=trackAt.get(k),pawns=pawnCells.get(k)||[];
       const redBase=r<6&&c<6,goldBase=r>8&&c>8,blueBase=r<6&&c>8,greenBase=r>8&&c<6;
       const redLane=homeAt[0].has(k),goldLane=homeAt[1].has(k);
       const blueLane=c===7&&r>=1&&r<=5,greenLane=c===7&&r>=9&&r<=13;
       const center=r>=6&&r<=8&&c>=6&&c<=8;
       const cls="ludo-cell"+(redBase?" ludo-red-base":goldBase?" ludo-gold-base":blueBase?" ludo-blue-base":greenBase?" ludo-green-base":"")
        +(track!==undefined?" ludo-path":"")+(redLane?" ludo-red-lane":"")+(goldLane?" ludo-gold-lane":"")
        +(blueLane?" ludo-blue-lane":"")+(greenLane?" ludo-green-lane":"")+(center?" ludo-center":"")
        +(track===0?" ludo-red-start":"")+(track===26?" ludo-gold-start":"");
       const highlight=light.get(k);
       return <div key={k} className={cls+(pawns.length?" has-pawns":"")+(highlight?" ludo-route-"+highlight:"")+(landing&&landing[0]===r&&landing[1]===c?" ludo-landed":"")}>
        {track!==undefined&&SAFE.has(track)?<span className="ludo-star" aria-hidden="true">★</span>:null}
        {pawns.length?<div className={"ludo-cell-pawns ludo-stack-"+Math.min(5,pawns.length)}>
         {pawns.map((item,i)=>{
          return <button type="button" key={item.seat+"-"+item.pawn} disabled={!item.active}
           onClick={()=>performMove(item.seat,item.pawn)}
           title={"Pion "+(item.pawn+1)+(item.seat===0?" à toi":" à l'ordinateur")}
           aria-label={"Pion "+(item.pawn+1)+(item.seat===0?" à toi":" à l'ordinateur")}
           className={"ludo-pawn ludo-pawn-stacked ludo-pawn-"+(item.seat===0?"red":"gold")+(item.active?" can-move":"")}
           style={{...stackCellStyle(pawns.length,i),zIndex:5+i}}>
           <PawnShape index={item.pawn}/>
          </button>;
         })}
        </div>:null}
        {pawns.length>1?<span className="ludo-stack-count" aria-hidden="true">×{pawns.length}</span>:null}
       </div>;
      })}
      <div className="ludo-yard ludo-yard-red" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-upper" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-lower" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-gold" aria-hidden="true"/>
      <span className="ludo-arena-field-label is-human" aria-hidden="true">TOI</span>
      <span className="ludo-arena-field-label is-bot" aria-hidden="true">ORDINATEUR</span>
      <div className="ludo-board-center" aria-hidden="true"><span>★</span></div>
      {motion&&movingStyle?<div className={"ludo-moving-pawn ludo-pawn-"+(motion.seat===0?"red":"gold")} style={movingStyle} aria-hidden="true">
       <i className="ludo-motion-aura"/>
       <span key={motion.progress} className="ludo-moving-bounce"><PawnShape index={motion.pawn}/></span>
      </div>:null}
     </div>
    </div>
    {reaction?<div className="ludo-solo-reaction" role="status" aria-label="Réaction">{reaction}</div>:null}
    {game.status==="won"&&!motion?<div className="ludo-victory ludo-solo-win" role="dialog" aria-label="Partie terminée">
     <div className="ludo-celebrate">{game.winner===0?"🏆":"🤖"}</div>
     <strong>{game.winner===0?"Tu as gagné !":"L'ordinateur a gagné"}</strong>
     <p>{game.winner===0?"Bravo, les quatre pions sont arrivés !":"Rejoue pour prendre ta revanche !"}</p>
     <button type="button" onClick={reset}>Nouvelle partie</button>
     <button type="button" className="ludo-secondary" onClick={onExit}>Retour aux jeux</button>
    </div>:null}
   </div>
   <div className="ludo-game-footer">
    <div className="ludo-bottom-actions">
     <span className="ludo-arena-roll-tip" aria-live="polite">
      {rolling?"🎲 Le dé roule…":canRoll?"Touche le dé pour lancer":canPick?"Touche un pion sur le plateau":game.turn===1?"L’ordinateur joue…":solePlayableSoloPawn(game,0)!==null?"Ton pion avance…":"À toi de jouer"}
     </span>
    </div>

    <div className="ludo-last-move" role="status" aria-live="polite">{game.lastAction}</div>
   </div>
  </div>
  {tutorialOpen&&game.status==="playing"&&!confirmRestart?<LudoTutorial mode="solo" onClose={()=>{
   setTutorialOpen(false);
   // A first-run lesson must not consume the user's fifteen-second turn.
   setGame(previous=>previous.turn===0?{...previous,updatedAt:Date.now()}:previous);
  }}/>:null}
  {confirmRestart?<div className="ludo-modal-backdrop" role="dialog" aria-modal="true" aria-label="Recommencer la partie">
   <div className="ludo-modal">
    <span className="ludo-modal-symbol">🎲</span>
    <h2>Nouvelle partie ?</h2>
    <p>Ta partie actuelle sera remplacée. L'ordinateur repartira de zéro.</p>
    <button className="ludo-modal-primary" onClick={reset}>Oui, recommencer</button>
    <button className="ludo-modal-text" onClick={()=>setConfirmRestart(false)}>Continuer la partie</button>
   </div>
  </div>:null}
 </section>;
}
