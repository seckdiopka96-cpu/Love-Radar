import {useCallback,useEffect,useRef,useState} from "react";
import LudoDuoFrame from "./LudoDuoFrame";

import {type LudoSticker} from "./LudoReactions";
import {useLudoSounds} from "./ludo-sounds";
import {TRACK,HOME,BASE,type Point} from "./ludo-visuals";
import {
 TURN_MS,newSenegalGame,isSenegalGame,movesForPawn,rollSenegal,
 applySenegalMove,chooseSenegalBotMove,pointForPawn,die,
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
/** Walk backwards through the track (one lap at most on a repeating track)
 * or out of a home lane before settling into the original base slot. */
function captureReversePoints(capture:CapturedSenegalPawn):Point[]{
 const {seat,pawn,from}=capture;
 const path:Point[]=[];
 const track=(step:number):Point=>TRACK[((seat*26+step)%52+52)%52];
 if(from.zone==="home"||from.zone==="enemy"){
  const owner=from.zone==="enemy"?(1-seat) as Seat:seat;
  for(let d=from.depth-1;d>=1;d--)path.push(HOME[owner][d-1]);
  for(let i=0;i<Math.min(52,Math.abs(from.gate));i++)path.push(track(from.gate-1-i));
 }else if(from.zone==="track"){
  const sign=from.step<0?1:-1;
  for(let i=1;i<=Math.min(52,Math.abs(from.step));i++)path.push(track(from.step+i*sign));
 }
 path.push(BASE[seat][pawn]);
 return path;
}
const storage=(scope:string)=>"love-radar-senegal-v1:"+scope;
function load(scope:string):SenegalGame{
 try{const raw=localStorage.getItem(storage(scope));if(raw){const game:unknown=JSON.parse(raw);if(isSenegalGame(game))return game;}}
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
 const sessionId=useRef("senegal-"+storageKey+"-"+Date.now());
 const [lastRoll,setLastRoll]=useState<{seat:number;face:number;at:number}|null>(null);
 const {enabled:soundOn,unlock:unlockSound,play:playSound,toggle:toggleSound}=useLudoSounds();

 const timers=useRef<number[]>([]);
 const loaded=useRef(true);
 const versionRef=useRef(0);
 const idRef=useRef("");
 const busyRef=useRef(false);
 const lastAnimated=useRef("");
 const lastReactionId=useRef("");
 const clearTimers=()=>{for(const t of timers.current)window.clearTimeout(t);timers.current=[];};
 const later=(callback:()=>void,delay:number)=>{
  const id=window.setTimeout(callback,delay);timers.current.push(id);
 };
 useEffect(()=>{loaded.current=true;return ()=>{loaded.current=false;clearTimers();};},[]);
 useEffect(()=>{
  if(!solo)return;
  try{localStorage.setItem(storage(storageKey),JSON.stringify(game))}catch{/* Offline play remains available. */}
 },[solo,storageKey,game]);
 useEffect(()=>{
  const interval=window.setInterval(()=>setNow(Date.now()),250);
  return ()=>window.clearInterval(interval);
 },[]);
 // Only authentic Senegal dice results are passed to the existing Classic 3D die.
 const animate=useCallback((move:SenegalMove)=>{
  const path=move.path;
  if(!path.length)return;
  const captured=move.captures.map(p=>({...p,point:pointForPawn(p.seat,p.pawn,p.from)}));
  if(captured.length)setCaptureBack(captured.map(({seat,pawn,point})=>({seat,pawn,point})));
  setMotion({seat:move.seat,pawn:move.pawn,point:pointForPawn(move.seat,move.pawn,move.from),index:0,length:path.length});
  const STEP_MS=move.from.zone==="base"?520:540,START_MS=250;
  path.forEach((point,i)=>later(()=>{
   if(!loaded.current)return;
   setMotion({seat:move.seat,pawn:move.pawn,point,index:i+1,length:path.length});
   // Shared Classic renderer plays each step sound.
   if(i===path.length-1)haptic();
  },START_MS+i*STEP_MS));
  const done=START_MS+path.length*STEP_MS+90;
  later(()=>{
   if(!loaded.current)return;
   setMotion(null);setLanding(pointForPawn(move.seat,move.pawn,move.to));
   if(move.captures.length){
    setReaction("💥");
    const returns=move.captures.map(captured=>({...captured,path:captureReversePoints(captured)}));
    returns.forEach(item=>item.path.forEach((point,index)=>later(()=>{
     if(!loaded.current)return;
     setCaptureBack(rows=>rows.map(row=>row.seat===item.seat&&row.pawn===item.pawn?{...row,point}:row));
    },70+index*50)));
    const longest=Math.max(...returns.map(item=>item.path.length));
    later(()=>{if(loaded.current)setCaptureBack([])},240+longest*50);
   }
   else if(move.to.zone==="enemy"){setReaction("😈");}
   else if(move.action==="reverse"){setReaction("↩️");}
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
  // A roll with no legal move immediately changes turns and clears dice.
  // Recover the real face from lastAction rather than showing an invented 1.
  const faceMatch=/Dé ([1-6])/.exec(next.lastAction);
  const actualFace=next.dice??(faceMatch?Number(faceMatch[1]):next.lastAction.includes("Troisième 6")?6:null);
  if(actualFace!==null){
   const roller:Seat=next.dice!==null?next.turn:(1-next.turn) as Seat;
   setLastRoll(previous=>previous?.at===next.updatedAt&&previous.face===actualFace&&previous.seat===roller?
    previous:{seat:roller,face:actualFace,at:next.updatedAt});
  }
  const oldVersion=versionRef.current,oldId=idRef.current;
  if(next.id!==oldId){lastAnimated.current="";setMotion(null);setCaptureBack([]);clearTimers();setChosen(null);}
  if(next.version<oldVersion&&next.id===oldId)return;
  versionRef.current=next.version;idRef.current=next.id;
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
  if(solo||busyRef.current||document.visibilityState!=="visible")return;
  try{
   const response=await fetch("/api/ludo-senegal",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as ServerResponse;
   if(!response.ok||!data.ok)throw Error(data.error||"Connexion indisponible.");
   accept(data);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Connexion indisponible.");setOnline(false);}
 },[token,solo,accept]);
 useEffect(()=>{
  if(solo)return;
  void refresh();
  const id=window.setInterval(()=>void refresh(),1400);
  return ()=>window.clearInterval(id);
 },[solo,refresh]);
 // Solo player has 15 seconds for each action. AI takes over if the timer expires.
 useEffect(()=>{
  if(!solo||game.status!=="playing"||game.turn!==0||assisted||busy||rolling||motion||captureBack.length||confirmReset)return;
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
  }finally{busyRef.current=false;setBusy(false)}
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
  if(game.status!=="playing"||game.dice!==null||rolling||busy||motion||captureBack.length||chosen||(!solo&&(!online||members!==2||game.turn!==seat))||
   (solo&&game.turn!==1&&!(game.turn===0&&(automatic||!assisted))))return;
  if(!automatic)unlockSound();
  if(automatic)playSound("roll");setRolling(true);
  if(solo){
   const face=die();
   later(()=>{
    if(!loaded.current)return;
    setFace(face);
    setLastRoll({seat:game.turn,face,at:Date.now()});
    setGame(prev=>{
     if(prev.dice!==null)return prev;
     const next=rollSenegal(prev,face);
     return automatic&&prev.turn===0?{...next,lastAction:"🤖 L’ordinateur a lancé le dé pour toi. "+next.lastAction}:next;
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
  if(busy||rolling||motion||captureBack.length||game.status!=="playing"||game.dice===null||
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
    {...result.game,lastAction:"🤖 L’ordinateur a déplacé ton pion. "+result.game.lastAction}:result.game);
   animate(result.move);
  }else{
   const data=await sendAction({action:"move",pawn:option.pawn,moveKind:option.action,gate:option.to.gate,dest:option.to.step});
  }
 }
 function choose(pawn:number){
  if(busy||rolling||motion||captureBack.length||game.status!=="playing"||game.turn!==seat||(solo&&assisted)||
   (!solo&&(!online||members!==2)))return;
  const options=movesForPawn(game,seat,pawn);
  if(options.length===1){void move(options[0]);return;}
  if(options.length>1)setChosen(options);
 }
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
 },[solo,game,rolling,motion,busy,chosen,confirmReset,assisted]);
 function reset(){
  setConfirmReset(false);setChosen(null);setAssisted(false);
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
 const invasionChoice=Boolean(chosen?.some(option=>option.action==="enemy"&&game.positions[seat][option.pawn].zone==="track"));
 const enemyCagePawns=game.positions[enemy].filter(p=>p.zone==="home");
 const directCapture=Boolean(chosen?.some(option=>option.action==="enemy"&&enemyCagePawns.some(p=>p.depth===option.to.depth)));
 const lastFace=game.lastAction.match(/Dé ([1-6])/);
 const shownDie=rolling?face:game.dice??(lastFace?Number(lastFace[1]):face);
 const status=game.status==="won"?(game.winner===seat?"🏆 Tu as gagné !":"🏆 Ton adversaire a gagné !"):
  !solo&&members!==2?"En attente de ton partenaire…":rolling?"Le dé roule…":motion?"Le pion avance…":
  solo&&assisted&&game.turn===0?"🤖 L’ordinateur joue pour toi…":
  turnOwner?game.dice===null?"🎲 À toi de lancer le dé":"Touche un pion sur le plateau":
  solo?"🤖 L’ordinateur réfléchit…":"Ton partenaire joue…";
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
  switch(action){
   case "roll":void roll();break;
   case "move":if(Number.isInteger(pawn))choose(pawn as number);break;
   case "restart":reset();break;
   case "exit":case "leave":case "menu":onExit();break;
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
   busy={busy||Boolean(motion)||captureBack.length>0||Boolean(chosen)||confirmReset}
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
   <button type="button" onClick={onExit}>Retour aux jeux</button>
  </div>:null}
  {chosen&&chosen.length?<div className="ludo-senegal-overlay" role="dialog" aria-modal="true" aria-label="Choisir le chemin sénégalais">
   <div className="ludo-senegal-shared-dialog">
    <strong>{invasionChoice?"😈 Attaquer la cage ou continuer ?":"🇸🇳 Choisis ton chemin"}</strong>
    <p>Pion {chosen[0].pawn+1} · dé {game.dice}</p>
    {invasionChoice?<p>{enemyCagePawns.length===0?"La cage adverse est vide.":
     directCapture?"Une capture est possible.":"Tu peux attaquer ou continuer le tour."}</p>:null}
    {chosen.map((option,index)=><button type="button" key={option.action+"-"+option.to.gate+"-"+index}
     onClick={()=>void move(option)} disabled={busy||rolling}>
     {option.action==="track"&&invasionChoice?"➡️ Continuer le tour":
      option.action==="enemy"&&invasionChoice?"😈 Entrer dans sa cage":option.label}
    </button>)}
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
