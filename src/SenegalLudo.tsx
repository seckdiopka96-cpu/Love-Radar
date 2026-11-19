import {useCallback,useEffect,useRef,useState} from "react";
import LudoDuoFrame from "./LudoDuoFrame";

import {type LudoSticker} from "./LudoReactions";
import {useLudoSounds} from "./ludo-sounds";
import {TRACK,HOME,BASE,type Point} from "./ludo-visuals";
import {
 TURN_MS,newSenegalGame,isSenegalGame,repairSenegalHomeShortcut,movesForPawn,rollSenegal,
 applySenegalMove,chooseSenegalBotMove,senegalGateChoice,pointForPawn,die,
 type SenegalGame,type SenegalMove,type MoveOption,type Seat,type Pawn
} from "./ludo-senegal-engine";
import "./ludo.css";
import "./ludo-immersive.css";
import "./ludo-solo.css";
import "./ludo-senegal.css";
import "./ludo-senegal-shared.css";

type Props={
 mode:"solo"|"duo";token:string;mySeat:number;myName:string;
 partnerName:string|null;storageKey:string;onExit:()=>void;
 myAvatar?:string;partnerAvatar?:string
};
type ServerGame=SenegalGame&{id:string;version:number;deadlineAt:number|null};
type ReactionEvent={id:string;seat:Seat;emoji:string;at:number};
type ServerResponse={ok:boolean;error?:string;members?:number;seat?:number;game?:ServerGame|null;move?:SenegalMove|null;moveVersion?:number|null;serverNow?:number;reactions?:ReactionEvent[]};
type Moving={seat:Seat;pawn:number;point:Point;index:number;length:number};
type CaptureBack={seat:Seat;pawn:number;point:Point};
type CapturedSenegalPawn=SenegalMove["captures"][number];
/** Return a legally captured pawn backwards to its real base.
 * Bound the visual route to avoid 52+ queued timers freezing a turn on
 * iPhones (especially while a voice call is active). A pawn still within
 * its colored arrival lane is capturable; only finished center pawns are safe. */
function captureReversePoints(capture:CapturedSenegalPawn):Point[]{
 const {seat,pawn,from}=capture;
 const path:Point[]=[];
 const track=(step:number):Point=>TRACK[((seat*26+step)%52+52)%52];
 if(from.zone==="enemy"||from.zone==="home"){
  const owner=from.zone==="home"?seat:(1-seat) as Seat;
  for(let d=from.depth-1;d>=1;d--)path.push(HOME[owner][d-1]);
  const remaining=Math.min(8,Math.max(0,from.gate));
  for(let i=0;i<remaining;i++)path.push(track(from.gate-1-i));
 }else if(from.zone==="track"){
  const count=Math.min(10,Math.abs(from.step));
  const sign=from.step<0?1:-1;
  for(let i=1;i<=count;i++){
   const step=from.step+sign*Math.ceil(i*Math.abs(from.step)/count);
   path.push(track(step));
  }
 }
 path.push(BASE[seat][pawn]);
 return path;
}
const storage=(scope:string)=>"love-radar-senegal-v1:"+scope;
function load(scope:string):SenegalGame{
 try{const raw=localStorage.getItem(storage(scope));if(raw){const game:unknown=JSON.parse(raw);if(isSenegalGame(game))return repairSenegalHomeShortcut(game);}}
 catch{/* Solo works when local storage is restricted. */}
 return newSenegalGame();
}
function haptic(){try{navigator.vibrate?.(20)}catch{/* iOS unsupported. */}}
export default function SenegalLudo({mode,token,mySeat,myName,partnerName,storageKey,onExit,myAvatar,partnerAvatar}:Props){
 const solo=mode==="solo";
 const seat:Seat=solo?0:mySeat===1?1:0;
 const enemy:Seat=(1-seat) as Seat;
 const [game,setGame]=useState<SenegalGame>(()=>solo?load(storageKey):newSenegalGame());
 const [online,setOnline]=useState(false);
 const [members,setMembers]=useState(solo?2:0);
 const [serverOffset,setServerOffset]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [rolling,setRolling]=useState(false);
 const [face,setFace]=useState(1);
 const [now,setNow]=useState(Date.now());
 const [assisted,setAssisted]=useState(false);
 const [motion,setMotion]=useState<Moving|null>(null);
 const [captureBack,setCaptureBack]=useState<CaptureBack[]>([]);
 const [chosen,setChosen]=useState<MoveOption[]|null>(null);
 const [landing,setLanding]=useState<Point|null>(null);
 const [reaction,setReaction]=useState("");
 const [emotes,setEmotes]=useState(false);
 const [sticker,setSticker]=useState<LudoSticker|null>(null);
 const [reactionBusy,setReactionBusy]=useState(false);
 const [confirmReset,setConfirmReset]=useState(false);
 const [quitting,setQuitting]=useState(false);
 const quittingRef=useRef(false);
 const sessionId=useRef("senegal-"+storageKey+"-"+Date.now());
 const [lastRoll,setLastRoll]=useState<{seat:number;face:number;at:number}|null>(null);
 const {enabled:soundOn,unlock:unlockSound,play:playSound,toggle:toggleSound}=useLudoSounds();

 const timers=useRef<number[]>([]);
 const captureDeadline=useRef(0);
 const motionDeadline=useRef(0);
 const motionGeneration=useRef(0);
 const loaded=useRef(true);
 const versionRef=useRef(0);
 const idRef=useRef("");
 const busyRef=useRef(false);
 const pollInFlight=useRef(false);
 const pollQueued=useRef(false);
 const lastAnimated=useRef("");
 const lastReactionId=useRef("");
 const clearTimers=()=>{for(const t of timers.current)window.clearTimeout(t);timers.current=[];};
 const later=(callback:()=>void,delay:number)=>{
  const id=window.setTimeout(callback,delay);timers.current.push(id);
 };
 useEffect(()=>{loaded.current=true;return ()=>{loaded.current=false;clearTimers();};},[]);
 useEffect(()=>{
  if(!solo)return;
  if(quittingRef.current)return; // Do not restore a discarded Solo game on exit.
  try{localStorage.setItem(storage(storageKey),JSON.stringify(game))}catch{/* Offline play remains available. */}
 },[solo,storageKey,game]);
 useEffect(()=>{
  const interval=window.setInterval(()=>setNow(Date.now()),250);
  return ()=>window.clearInterval(interval);
 },[]);
 // iOS may suspend callbacks during a phone call. Neither a moving pawn
 // nor a captured pawn may keep inputs locked after the game resumes.
 useEffect(()=>{
  if(motion&&motionDeadline.current>0&&now>=motionDeadline.current){
   motionGeneration.current++;
   clearTimers();motionDeadline.current=0;captureDeadline.current=0;
   setMotion(null);setCaptureBack([]);setLanding(null);setReaction("");
   setRolling(false);
  }else if(captureBack.length&&captureDeadline.current>0&&now>=captureDeadline.current){
   setCaptureBack([]);captureDeadline.current=0;
  }
 },[now,Boolean(motion),captureBack.length]);
 // Only authentic Senegal dice results are passed to the existing Classic 3D die.
 const animate=useCallback((move:SenegalMove)=>{
  const path=move.path;
  if(!path.length)return;
  const generation=++motionGeneration.current;
  const STEP_MS=move.from.zone==="base"?520:540,START_MS=250;
  const done=START_MS+path.length*STEP_MS+90;
  motionDeadline.current=Date.now()+done+850;
  const captured=move.captures.map(p=>({...p,point:pointForPawn(p.seat,p.pawn,p.from)}));
  if(captured.length){
   // Enforce an absolute deadline independent of every animation callback.
   captureDeadline.current=Date.now()+250+path.length*540+1800;
   setCaptureBack(captured.map(({seat,pawn,point})=>({seat,pawn,point})));
  }
  setMotion({seat:move.seat,pawn:move.pawn,point:pointForPawn(move.seat,move.pawn,move.from),index:0,length:path.length});
  path.forEach((point,i)=>later(()=>{
   if(!loaded.current||motionGeneration.current!==generation)return;
   setMotion({seat:move.seat,pawn:move.pawn,point,index:i+1,length:path.length});
   // Shared Classic renderer plays each step sound.
   if(i===path.length-1)haptic();
  },START_MS+i*STEP_MS));
  later(()=>{
   if(!loaded.current||motionGeneration.current!==generation)return;
   motionDeadline.current=0;
   setMotion(null);setLanding(pointForPawn(move.seat,move.pawn,move.to));
   if(move.captures.length){
    setReaction("💥");
    const returns=move.captures.map(captured=>({...captured,path:captureReversePoints(captured)}));
    returns.forEach(item=>item.path.forEach((point,index)=>later(()=>{
     if(!loaded.current||motionGeneration.current!==generation)return;
     setCaptureBack(rows=>rows.map(row=>row.seat===item.seat&&row.pawn===item.pawn?{...row,point}:row));
    },70+index*50)));
    const longest=Math.max(...returns.map(item=>item.path.length));
    const returnMs=240+longest*50;
    captureDeadline.current=Date.now()+returnMs+350;
    later(()=>{if(loaded.current&&motionGeneration.current===generation){setCaptureBack([]);captureDeadline.current=0}},returnMs);
   }
   else if(move.action==="exit"){setReaction("↩️");}
   else if(move.action==="jump"){setReaction("⤴️");}
   else if(move.to.zone==="enemy"){setReaction("😈");}
   else if(move.to.zone==="finished"){setReaction("🏠");}
   else if(move.action==="home")setReaction("🏠");
   later(()=>{if(loaded.current){setReaction("");setLanding(null)}},1300);
  },done);
 },[playSound,seat]);
 const accept=useCallback((data:ServerResponse)=>{
  if(!loaded.current)return;
  if(data.serverNow)setServerOffset(Date.now()-data.serverNow);
  if(data.members!==undefined)setMembers(data.members);
  setOnline(true);
  const recent=data.reactions?.[0];
  if(recent&&recent.id!==lastReactionId.current&&Date.now()-recent.at<8000){
   lastReactionId.current=recent.id;
   const label=recent.seat===seat?"Ta réaction":"Réaction de ton partenaire";
   const id=recent.at;
   setSticker({id,emoji:recent.emoji,label});
   later(()=>setSticker(prev=>prev?.id===id?null:prev),2700);
  }
  if(!data.game)return;
  const next=data.game;
  const oldVersion=versionRef.current,oldId=idRef.current;
  // Version is monotonic for the entire private room, including rematches.
  // A delayed GET from an earlier match must never resurrect its old board.
  if(next.version<oldVersion||(next.version===oldVersion&&oldId&&next.id!==oldId))return;
  // A roll with no legal move immediately changes turns and clears dice.
  // Recover the real face from lastAction rather than showing an invented 1.
  const faceMatch=/Dé ([1-6])/.exec(next.lastAction);
  const actualFace=next.dice??(faceMatch?Number(faceMatch[1]):next.lastAction.includes("Troisième 6")?6:null);
  if(actualFace!==null){
   const roller:Seat=next.dice!==null?next.turn:(1-next.turn) as Seat;
   setLastRoll(previous=>previous?.at===next.updatedAt&&previous.face===actualFace&&previous.seat===roller?
    previous:{seat:roller,face:actualFace,at:next.updatedAt});
  }
  if(next.id!==oldId){lastAnimated.current="";motionGeneration.current++;motionDeadline.current=0;setMotion(null);setCaptureBack([]);captureDeadline.current=0;clearTimers();setChosen(null);}
  versionRef.current=next.version;idRef.current=next.id;
  if(next.status==="ended"){
   for(const id of timers.current)window.clearTimeout(id);
   timers.current=[];
   motionGeneration.current++;motionDeadline.current=0;setMotion(null);setCaptureBack([]);captureDeadline.current=0;setChosen(null);setRolling(false);
  }
  setGame({
   positions:next.positions,turn:next.turn,dice:next.dice,streak:next.streak,
   status:next.status,winner:next.winner,updatedAt:next.updatedAt,lastAction:next.lastAction
  });
  // Use the move's own version. The board may have received another dice
  // result by the time polling delivers the pawn path to the second phone.
  const moveVersion=data.moveVersion??(data.move?next.version:null);
  const animationKey=next.id+":"+moveVersion;
  if(data.move&&moveVersion!==null&&oldId===next.id&&oldVersion<moveVersion&&lastAnimated.current!==animationKey){
   lastAnimated.current=animationKey;animate(data.move);
  }
 },[animate,seat]);
 const refresh=useCallback(async()=>{
  if(solo||document.visibilityState!=="visible")return;
  if(pollInFlight.current||busyRef.current){pollQueued.current=true;return;}
  pollInFlight.current=true;
  try{
   const response=await fetch("/api/ludo-senegal",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as ServerResponse;
   if(!response.ok||!data.ok)throw Error(data.error||"Connexion indisponible.");
   accept(data);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Connexion indisponible.");setOnline(false);}
  finally{
   pollInFlight.current=false;
   if(pollQueued.current&&!busyRef.current&&document.visibilityState==="visible"){
    pollQueued.current=false;
    void refresh();
   }
  }
 },[token,solo,accept]);
 useEffect(()=>{
  if(solo)return;
  void refresh();
  const id=window.setInterval(()=>void refresh(),850);
  const onResume=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onResume);
  window.addEventListener("focus",onResume);
  window.addEventListener("online",onResume);
  return ()=>{
   window.clearInterval(id);
   document.removeEventListener("visibilitychange",onResume);
   window.removeEventListener("focus",onResume);
   window.removeEventListener("online",onResume);
  };
 },[solo,refresh]);
 // Solo player has 15 seconds for each action. AI takes over if the timer expires.
 // The AI turn effect below MUST depend on captureBack.length: a captured pawn
 // can finish returning after the active move animation ends, without any dice
 // or game-state change. Omitting that dependency strands the AI on a six.
 useEffect(()=>{
  if(!solo||game.status!=="playing"||game.turn!==0||assisted||busy||rolling||motion||captureBack.length||chosen||confirmReset)return;
  const id=window.setTimeout(()=>setAssisted(true),Math.max(0,game.updatedAt+TURN_MS-Date.now()));
  return ()=>window.clearTimeout(id);
 },[solo,game,assisted,busy,rolling,motion,chosen,confirmReset]);
 useEffect(()=>{if(game.turn!==0||game.status!=="playing")setAssisted(false);},[game.turn,game.status]);
 useEffect(()=>{if(assisted)setChosen(null);},[assisted]);
 async function sendAction(payload:Record<string,unknown>){
  busyRef.current=true;setBusy(true);setError("");
  try{
   const response=await fetch("/api/ludo-senegal",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({...payload,version:versionRef.current})
   });
   const data=await response.json() as ServerResponse;
   if(!response.ok||!data.ok)throw Error(data.error||"Action refusée.");
   accept(data);
   return data;
  }catch(e){
   setError(e instanceof Error?e.message:"Action refusée.");
   void refresh();return null;
  }finally{
   busyRef.current=false;setBusy(false);
   if(pollQueued.current&&document.visibilityState==="visible"){
    pollQueued.current=false;void refresh();
   }
  }
 }
 async function sendSticker(emoji:string,label:string){
  setEmotes(false);
  if(solo){
   const id=Date.now();
   setSticker({id,emoji,label});
   playSound("reaction");haptic();
   later(()=>setSticker(prev=>prev?.id===id?null:prev),2700);
   return;
  }
  if(reactionBusy||!online||members!==2)return;
  setReactionBusy(true);
  try{
   const response=await fetch("/api/ludo-senegal",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"react",emoji})
   });
   const data=await response.json() as ServerResponse;
   if(!response.ok||!data.ok)throw Error(data.error||"Réaction non envoyée.");
   accept(data);playSound("reaction");haptic();
  }catch(e){setError(e instanceof Error?e.message:"Réaction non envoyée.");}
  finally{setReactionBusy(false);}
 }
 async function roll(automatic=false){
  if(game.status!=="playing"||game.dice!==null||rolling||busy||busyRef.current||motion||captureBack.length||chosen||(!solo&&(!online||members!==2||game.turn!==seat))||
   (solo&&game.turn!==1&&!(game.turn===0&&(automatic||!assisted))))return;
  if(!automatic)unlockSound();
  setRolling(true); // The one Classic frame plays the physical dice sound.
  if(solo){
   const face=die();
   later(()=>{
    if(!loaded.current)return;
    setFace(face);
    setLastRoll({seat:game.turn,face,at:Date.now()});
    setGame(prev=>{
     if(prev.dice!==null)return prev;
     const next=rollSenegal(prev,face);
     return automatic&&prev.turn===0?{...next,lastAction:"L’ordinateur a lancé le dé pour toi. "+next.lastAction}:next;
    });
    setRolling(false);
   },560);
  }else{
   const result=await sendAction({action:"roll"});
   if(result?.game?.dice)setFace(result.game.dice);
   later(()=>{if(loaded.current)setRolling(false)},550);
  }
 }
 async function move(option:MoveOption,automatic=false){
  if(busy||busyRef.current||rolling||motion||captureBack.length||game.status!=="playing"||game.dice===null||
   (!solo&&(!online||members!==2||game.turn!==seat))||
   (solo&&game.turn!==1&&!(game.turn===0&&(automatic||!assisted))))return;
  const legal=movesForPawn(game,game.turn,option.pawn).find(m=>
   m.action===option.action&&m.to.gate===option.to.gate&&m.to.step===option.to.step&&m.to.depth===option.to.depth);
  if(!legal)return;
  setChosen(null);
  if(solo){
   const result=applySenegalMove(game,legal);
   if(!result)return;
   setGame(automatic&&game.turn===0?
    {...result.game,lastAction:"L’ordinateur a déplacé ton pion. "+result.game.lastAction}:result.game);
   animate(result.move);
  }else{
   const data=await sendAction({action:"move",pawn:option.pawn,moveKind:option.action,gate:option.to.gate,dest:option.to.step});
  }
 }
 function choose(pawn:number){
  if(chosen||busy||rolling||motion||captureBack.length||game.status!=="playing"||game.turn!==seat||(solo&&assisted)||
   (!solo&&(!online||members!==2)))return;
  const options=movesForPawn(game,seat,pawn);
  // A route decision is for THIS token and THIS throw only. Even when just
  // one route remains legal (e.g. the other is too long or blocked), show
  // the entrance choice instead of silently using a previous pawn's choice.
  const gate=senegalGateChoice(game,seat,pawn);
  if(options.length===1&&!gate){void move(options[0]);return;}
  if(options.length)setChosen(options);
 }
 useEffect(()=>{
  if(!chosen?.length)return;
  const current=movesForPawn(game,seat,chosen[0].pawn);
  if(current.length!==chosen.length||chosen.some(option=>!current.some(next=>
   next.action===option.action&&next.to.zone===option.to.zone&&
   next.to.step===option.to.step&&next.to.gate===option.to.gate&&
   next.to.depth===option.to.depth))){
   // In particular, another dice throw or a partner move must not reuse the
   // answer that was waiting for a different pawn or turn.
   setChosen(null);
  }
 },[game,seat,chosen]);
 useEffect(()=>{
  if(!solo||game.status!=="playing"||rolling||motion||captureBack.length||busy||chosen||confirmReset)return;
  if(game.turn!==1&&!(game.turn===0&&assisted))return;
  const timer=window.setTimeout(()=>{
   if(game.dice===null)void roll(true);
   else{
    const option=chooseSenegalBotMove(game);
    if(option)void move(option,true);
   }
  },game.dice===null?790:570);
  return ()=>window.clearTimeout(timer);
 },[solo,game,rolling,motion,captureBack.length,busy,chosen,confirmReset,assisted]);
 async function quitGame(){
  if(quittingRef.current)return;
  quittingRef.current=true;
  setQuitting(true);
  // Solo: discard the saved match, cancel every pending die/pawn animation,
  // and return to the game room. Reopening starts a fresh match.
  if(solo){
   clearTimers();
   try{localStorage.removeItem(storage(storageKey))}catch{/* Private browsing may block local storage. */}
   onExit();
   return;
  }
  // A finished or previously ended match no longer needs a second quit call.
  if(game.status!=="playing"||members<2){clearTimers();onExit();return;}
  if(!online||!idRef.current){
   setError("Impossible d’arrêter la partie sans connexion. Réessaie.");
   quittingRef.current=false;setQuitting(false);return;
  }
  // Duo: server stops the shared match for BOTH partners before leaving.
  // A game ID prevents an older request from closing a new match.
  const result=await sendAction({action:"quit",gameId:idRef.current});
  if(result?.game?.status==="ended"||result?.game?.status==="won"){
   clearTimers();onExit();return;
  }
  quittingRef.current=false;setQuitting(false);
 }
 function reset(){
  setConfirmReset(false);setChosen(null);setAssisted(false);
  motionGeneration.current++;motionDeadline.current=0;captureDeadline.current=0;
  clearTimers();setMotion(null);setCaptureBack([]);setReaction("");setSticker(null);setEmotes(false);setRolling(false);
  if(solo){sessionId.current="senegal-"+storageKey+"-"+Date.now();setLastRoll(null);setGame(newSenegalGame());}
  else void sendAction({action:"restart"});
 }
 const playerCanAct=game.status==="playing"&&game.turn===seat&&
  (solo?!assisted:online&&members===2);
 const canRoll=playerCanAct&&game.dice===null&&!rolling&&!motion&&!captureBack.length&&!busy;
 const canPick=playerCanAct&&game.dice!==null&&!rolling&&!motion&&!captureBack.length&&!busy;
 const turnOwner=game.turn===seat;
 const seconds=game.status==="playing"&&(solo?game.turn===0&&!assisted:members===2)?
  Math.max(0,Math.ceil((game.updatedAt+TURN_MS+(solo?0:serverOffset)-now)/1000)):null;
 const gateDecision=chosen?.length?senegalGateChoice(game,seat,chosen[0].pawn):null;
 const entryRoutes=chosen?.filter(option=>gateDecision==="home"?
  option.to.zone==="home"||option.to.zone==="finished":option.to.zone==="enemy")||[];
 const continueRoutes=chosen?.filter(option=>option.to.zone==="track")||[];
 const enemyCagePawns=game.positions[enemy].filter(p=>p.zone==="home");
 // An invader can capture unfinished home-lane pawns by exact landing.
 const lastFace=game.lastAction.match(/Dé ([1-6])/);
 const shownDie=rolling?face:game.dice??(lastFace?Number(lastFace[1]):face);
 const status=game.status==="won"?(game.winner===seat?"🏆 Tu as gagné !":"🏆 Ton adversaire a gagné !"):
  !solo&&members!==2?"En attente de ton partenaire…":rolling?"Le dé roule…":motion?"Le pion avance…":
  solo&&assisted&&game.turn===0?"L’ordinateur joue pour toi…":
  turnOwner?game.dice===null?"🎲 À toi de lancer le dé":"Touche un pion sur le plateau":
  solo?"L’ordinateur réfléchit…":"Ton partenaire joue…";
 // All four games now use the original Classic renderer. Senegal is ONLY
 // the rules adapter: its own game engine still decides every move and die.
 const boardPoints:(Point|null)[][]=game.positions.map((row,side)=>row.map((pawn,index)=>
  pawn.zone==="base"?null:pointForPawn(side as Seat,index,pawn)));
 const numericPositions=game.positions.map(row=>row.map(pawn=>
  pawn.zone==="base"?-1:pawn.zone==="finished"?56:
  pawn.zone==="home"?Math.min(55,50+pawn.depth):Math.abs(pawn.step)%52));
 const snapshot={
  id:solo?sessionId.current:idRef.current||"senegal-connexion",
  version:solo?game.updatedAt:versionRef.current,
  turn:game.turn,dice:game.dice,positions:numericPositions,
  status:game.status,winner:game.winner,autoCounts:[0,0] as [number,number],
  lastAction:game.lastAction,
  deadlineAt:game.status==="playing"?game.updatedAt+TURN_MS:null
 };
 const visibleMotion=motion?{
  seat:motion.seat,pawn:motion.pawn,from:0,to:motion.length,
  progress:motion.index,point:motion.point,index:motion.index,length:motion.length
 }:null;
 const visibleCaptures=captureBack.map(pawn=>({
  seat:pawn.seat,pawn:pawn.pawn,from:0,progress:0,returning:true,point:pawn.point
 }));
 const legalPawns=canPick?game.positions[seat].flatMap((_,pawn)=>
  movesForPawn(game,seat,pawn).length?[pawn]:[]):[];
 const handleFrameAction=(action:"roll"|"move"|"restart"|"exit"|"leave"|"gift"|"menu",pawn?:number)=>{
  if(quittingRef.current)return;
  switch(action){
   case "roll":void roll();break;
   case "move":if(Number.isInteger(pawn))choose(pawn as number);break;
   case "restart":reset();break;
   case "exit":case "leave":case "menu":void quitGame();break;
   case "gift":void sendSticker("🎁","Cadeau");break;
  }
 };
 return <section className={"ludo-experience ludo-duo-arena ludo-senegal ludo-senegal-classic "+(solo?"ludo-senegal-solo":"ludo-senegal-duo")}
  aria-label={"Ludo Sénégal "+(solo?"Solo":"Duo")+", le plateau Classique réutilisé"}>
  <LudoDuoFrame variant="senegal" opponent={solo?"solo":"duo"}
   game={snapshot} palette={{colors:["red","yellow"],chosenBy:null}}
   lastRoll={lastRoll} mySeat={seat} myName={myName}
   partnerName={solo?"Ordinateur":partnerName}
   myAvatar={myAvatar} partnerAvatar={solo?undefined:partnerAvatar}
   remaining={seconds} rolling={rolling} rollingFace={shownDie}
   busy={busy||quitting||Boolean(motion)||captureBack.length>0||Boolean(chosen)||confirmReset}
   animationBusy={Boolean(motion)||captureBack.length>0}
   motion={visibleMotion} capturedMotions={visibleCaptures}
   boardPoints={boardPoints} legalPawns={legalPawns}
   statusText={status+(seconds!==null?" · "+seconds+" s":"")}
   canRoll={canRoll} error={error}
   overlayOpen={Boolean(chosen)||confirmReset||emotes||(!solo&&(!online||members!==2))}
   onAction={handleFrameAction}/>
  {!solo&&members<2?<div className="ludo-senegal-overlay ludo-senegal-wait-shared" role="status">
   <span>💌</span><strong>En attente de ton partenaire</strong>
   <p>Le plateau Classique est prêt. Vous jouerez avec les règles sénégalaises.</p>
   <button type="button" onClick={()=>void quitGame()} disabled={quitting}>Arrêter et retourner aux jeux</button>
  </div>:null}
  {game.status==="won"?<div className="ludo-senegal-overlay" role="dialog" aria-modal="true" aria-label="Victoire au Ludo Sénégal">
   <div className="ludo-senegal-shared-dialog">
    <strong>🏆 {game.winner===seat?"Victoire !":"Partie terminée !"}</strong>
    <p>{game.winner===seat?"Tu as terminé tes quatre pions !":"Ton adversaire a terminé ses quatre pions !"} Le match est arrêté pour vous deux.</p>
    <button type="button" onClick={reset} disabled={busy||quitting}>↻ Nouvelle partie</button>
    <button type="button" className="ludo-senegal-shared-cancel" onClick={onExit}>← Retour aux Ludos</button>
   </div>
  </div>:null}
  {!solo&&game.status==="ended"?<div className="ludo-senegal-overlay" role="dialog" aria-modal="true" aria-label="Partie arrêtée">
   <div className="ludo-senegal-shared-dialog">
    <strong>Partie arrêtée</strong>
    <p>{game.lastAction} Le plateau est maintenant arrêté pour vous deux.</p>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" onClick={reset} disabled={busy||quitting}>↻ Nouvelle partie</button>
    <button type="button" className="ludo-senegal-shared-cancel" onClick={onExit}>← Retour aux Ludos</button>
   </div>
  </div>:null}
  {chosen&&chosen.length?<div className="ludo-senegal-overlay" role="dialog" aria-modal="true" aria-label="Choisir le chemin sénégalais">
   <div className="ludo-senegal-shared-dialog">
    <strong>{gateDecision==="enemy"?"😈 Entrer dans sa cage ou continuer ?":
     gateDecision==="home"?"🏠 Entrer chez toi ou continuer ?":"🇸🇳 Choisis ton chemin"}</strong>
    <p>Pion {chosen[0].pawn+1} · dé {game.dice}</p>
    {gateDecision?<p className="ludo-senegal-per-pawn-hint">
     Ce choix concerne uniquement le pion {chosen[0].pawn+1}. Tu devras choisir à nouveau pour chaque autre pion.
    </p>:null}
    {gateDecision==="enemy"?<p>{enemyCagePawns.length===0?"La cage adverse est vide.":
     "Les pions dans ce couloir peuvent être capturés sur leur case. Ceux au centre sont protégés."}</p>:null}
    {gateDecision?<>
     {continueRoutes.length?continueRoutes.map((option,index)=><button type="button"
      key={"continue-"+option.pawn+"-"+option.to.step+"-"+index}
      className="ludo-senegal-route-continue" disabled={busy||rolling}
      onClick={()=>void move(option)}>➡️ Continuer sur le parcours</button>):
      <button type="button" className="ludo-senegal-route-continue" disabled>➡️ Continuer · trajet bloqué</button>}
     {entryRoutes.length?entryRoutes.map((option,index)=><button type="button"
      key={"enter-"+option.pawn+"-"+option.to.step+"-"+index}
      className="ludo-senegal-route-enter" disabled={busy||rolling}
      onClick={()=>void move(option)}>{gateDecision==="home"?"🏠 Entrer dans ma maison":"😈 Entrer dans la cage adverse"}</button>):
      <button type="button" className="ludo-senegal-route-enter" disabled>
       {gateDecision==="home"?"🏠 Entrer chez moi · impossible avec ce dé":"😈 Entrer dans sa cage · impossible avec ce dé"}
      </button>}
    </>:chosen.map((option,index)=><button type="button" key={option.pawn+"-"+option.action+"-"+option.to.gate+"-"+index}
     onClick={()=>void move(option)} disabled={busy||rolling}>{option.label}</button>)}
    <button type="button" className="ludo-senegal-shared-cancel" onClick={()=>setChosen(null)}>Annuler</button>
   </div>
  </div>:null}
  {sticker?<span className="ludo-senegal-shared-sticker" key={sticker.id} role="status">{sticker.emoji}</span>:null}
  {confirmReset?<div className="ludo-senegal-overlay" role="dialog" aria-modal="true" aria-label="Nouvelle partie">
   <div className="ludo-senegal-shared-dialog">
    <strong>🇸🇳 Nouvelle partie ?</strong>
    <p>{solo?"Recommencer contre l’ordinateur ?":"Réinitialiser la partie des deux joueurs ?"}</p>
    <button type="button" onClick={reset} disabled={busy}>Oui, recommencer</button>
    <button type="button" className="ludo-senegal-shared-cancel" onClick={()=>setConfirmReset(false)}>Continuer</button>
   </div>
  </div>:null}
 </section>;
}
