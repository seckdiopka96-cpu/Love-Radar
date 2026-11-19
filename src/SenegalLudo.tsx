import {useCallback,useEffect,useRef,useState} from "react";
import LudoDie3D from "./LudoDie3D";
import PawnShape from "./LudoPawn";
import {LudoReactionBurst,LudoReactionPicker,type LudoSticker} from "./LudoReactions";
import {useLudoSounds} from "./ludo-sounds";
import {TRACK,HOME,BASE,SAFE,CELL,key,stackCellStyle,type Point} from "./ludo-visuals";
import {
 TURN_MS,newSenegalGame,isSenegalGame,movesForPawn,rollSenegal,
 applySenegalMove,chooseSenegalBotMove,pointForPawn,die,
 type SenegalGame,type SenegalMove,type MoveOption,type Seat,type Pawn
} from "./ludo-senegal-engine";
import "./ludo.css";
import "./ludo-immersive.css";
import "./ludo-solo.css";
import "./ludo-senegal.css";

type Props={
 mode:"solo"|"duo";token:string;mySeat:number;myName:string;
 partnerName:string|null;storageKey:string;onExit:()=>void
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
const routeMap=new Map(TRACK.map((p,i)=>[key(p[0],p[1]),i]));
const homeMap=HOME.map(lane=>new Set(lane.map(p=>key(p[0],p[1]))));
const storage=(scope:string)=>"love-radar-senegal-v1:"+scope;
function load(scope:string):SenegalGame{
 try{const raw=localStorage.getItem(storage(scope));if(raw){const game:unknown=JSON.parse(raw);if(isSenegalGame(game))return game;}}
 catch{/* Solo works when local storage is restricted. */}
 return newSenegalGame();
}
function haptic(){try{navigator.vibrate?.(20)}catch{/* iOS unsupported. */}}
export default function SenegalLudo({mode,token,mySeat,myName,partnerName,storageKey,onExit}:Props){
 const solo=mode==="solo";
 // The four modes load the exact same shared public board stylesheet.
 useEffect(()=>{
  const id="lr-one-board-dark-style";
  let link=document.getElementById(id) as HTMLLinkElement|null;
  if(!link){
   link=document.createElement("link");link.id=id;link.rel="stylesheet";
   link.href="/ludo-unified-stage.css?v=one-board-dark-20261119-v2";
  }else if(!link.href.includes("one-board-dark-20261119-v2")){
   link.href="/ludo-unified-stage.css?v=one-board-dark-20261119-v2";
  }
  document.head.appendChild(link); // After legacy CSS in the cascade.
 },[]);
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
 const [boardSize,setBoardSize]=useState(0);
 const {enabled:soundOn,unlock:unlockSound,play:playSound,toggle:toggleSound}=useLudoSounds();
 const stage=useRef<HTMLDivElement|null>(null);
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
  const elem=stage.current;if(!elem)return;
  const obs=new ResizeObserver(()=>{
   const available=Math.floor(Math.min(elem.clientWidth-8,elem.clientHeight-8));
   if(available>0)setBoardSize(available);
  });
  obs.observe(elem);return ()=>obs.disconnect();
 },[]);
 useEffect(()=>{
  const interval=window.setInterval(()=>setNow(Date.now()),250);
  return ()=>window.clearInterval(interval);
 },[]);
 useEffect(()=>{
  if(!rolling)return;
  const interval=window.setInterval(()=>setFace(1+Math.floor(Math.random()*6)),90);
  return ()=>window.clearInterval(interval);
 },[rolling]);
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
   playSound("step");
   if(i===path.length-1)haptic();
  },START_MS+i*STEP_MS));
  const done=START_MS+path.length*STEP_MS+90;
  later(()=>{
   if(!loaded.current)return;
   setMotion(null);setLanding(pointForPawn(move.seat,move.pawn,move.to));
   if(move.captures.length){
    playSound("capture");setReaction("💥");
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
   else if(move.to.zone==="finished"){playSound("win");setReaction("🏠");}
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
  playSound("roll");setRolling(true);
  if(solo){
   const face=die();
   later(()=>{
    if(!loaded.current)return;
    setFace(face);
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
  if(solo)setGame(newSenegalGame());
  else void sendAction({action:"restart"});
 }
 const playerCanAct=game.status==="playing"&&game.turn===seat&&
  (solo?!assisted:online&&members===2);
 const canRoll=playerCanAct&&game.dice===null&&!rolling&&!motion&&!captureBack.length&&!busy;
 const canPick=playerCanAct&&game.dice!==null&&!rolling&&!motion&&!captureBack.length&&!busy;
 const turnOwner=game.turn===seat;
 const seconds=game.status==="playing"&&(solo?game.turn===0&&!assisted:members===2)?
  Math.max(0,Math.ceil((game.updatedAt+TURN_MS+(solo?0:serverOffset)-now)/1000)):null;
 const remaining=game.positions.map(row=>row.filter(p=>p.zone==="finished").length);
 const invasionChoice=Boolean(chosen?.some(option=>option.action==="enemy"&&game.positions[seat][option.pawn].zone==="track"));
 const enemyCagePawns=game.positions[enemy].filter(p=>p.zone==="home");
 const directCapture=Boolean(chosen?.some(option=>option.action==="enemy"&&enemyCagePawns.some(p=>p.depth===option.to.depth)));
 const occupancy=new Map<string,{seat:Seat;pawn:number;active:boolean;zone:Pawn["zone"]}[]>();
 for(const side of [0,1] as Seat[])for(let pawn=0;pawn<4;pawn++){
  const current=game.positions[side][pawn];
  if(current.zone==="finished"||(motion?.seat===side&&motion.pawn===pawn)||captureBack.some(row=>row.seat===side&&row.pawn===pawn))continue;
  const [r,c]=pointForPawn(side,pawn,current),k=key(r,c);
  const members=occupancy.get(k)||[];
  members.push({seat:side,pawn,active:canPick&&seat===side&&movesForPawn(game,side,pawn).length>0,zone:current.zone});
  occupancy.set(k,members);
 }
 const lastFace=game.lastAction.match(/Dé ([1-6])/);
 const shownDie=rolling?face:game.dice??(lastFace?Number(lastFace[1]):face);
 const status=game.status==="won"?(game.winner===seat?"🏆 Tu as gagné !":"🏆 Ton adversaire a gagné !"):
  !solo&&members!==2?"En attente de ton partenaire…":rolling?"Le dé roule…":motion?"Le pion avance…":
  solo&&assisted&&game.turn===0?"🤖 L’ordinateur joue pour toi…":
  turnOwner?game.dice===null?"🎲 À toi de lancer le dé":"Touche un pion sur le plateau":
  solo?"🤖 L’ordinateur réfléchit…":"Ton partenaire joue…";
 const leftName=solo?myName:mySeat===0?myName:partnerName||"Ton partenaire";
 const rightName=solo?"Ordinateur":mySeat===1?myName:partnerName||"Ton partenaire";
 return <section className={"ludo-experience ludo-senegal "+(solo?"ludo-senegal-solo":"ludo-senegal-duo")} aria-label={"Ludo Sénégal "+(solo?"solo":"à deux")}>
  <header className="ludo-topbar">
   <button type="button" className="ludo-leave" onClick={onExit}><span aria-hidden="true">‹</span> Jeux</button>
   <div className="ludo-brand"><img className="ludo-head-logo" src="/ludo-mark.svg" alt="Logo Ludo"/><strong>LUDO <span>🇸🇳</span> SÉNÉGAL</strong><small>{solo?"DÉFIE L’ORDINATEUR":"EN DUO · RÈGLES SÉNÉGALAISES"}</small></div>
   <div className="ludo-top-actions">
    <button type="button" className="ludo-sound" onClick={toggleSound} aria-label={soundOn?"Désactiver le son":"Activer le son"} aria-pressed={soundOn}>{soundOn?"🔊":"🔇"}</button>
    <button type="button" className="ludo-solo-restart" onClick={()=>setConfirmReset(true)} aria-label="Recommencer">↻</button>
   </div>
  </header>
  <div className="ludo-players">
   <div className={"ludo-player ludo-player-red"+(game.turn===0&&game.status==="playing"?" is-active":"")}>
    <span className="ludo-player-avatar">{(leftName||"R").charAt(0).toUpperCase()}</span>
    <div className="ludo-player-info"><strong>{leftName}</strong><span>{remaining[0]} / 4 · ROUGE</span></div>
   </div>
   <div className={"ludo-player ludo-player-gold"+(game.turn===1&&game.status==="playing"?" is-active":"")}>
    <span className="ludo-player-avatar">{solo?"🤖":(rightName||"J").charAt(0).toUpperCase()}</span>
    <div className="ludo-player-info"><strong>{rightName}</strong><span>{remaining[1]} / 4 · JAUNE</span></div>
   </div>
  </div>
  <div className={"ludo-turn-banner"+(playerCanAct?" its-mine":"")} role="status" aria-live="polite">
   <span className="ludo-turn-icon">🇸🇳</span><strong>{status}</strong>
   {seconds!==null?<span className={"ludo-countdown"+(seconds<=5?" urgent":"")} aria-label={"Temps restant : "+seconds+" secondes"}><span className="ludo-time-ring">{seconds}</span><small>s</small></span>:null}
  </div>
  {error?<div className="ludo-senegal-error" role="alert">{error}</div>:null}
  <div className="ludo-play-area">
   <div className="ludo-stage" ref={stage}>
    <div className="ludo-board-wrap ludo-board-wrap-immersive lr-unified-ludo-frame" style={boardSize?{width:boardSize,height:boardSize}:undefined}>
     <div className={"ludo-board lr-unified-ludo-board"+(motion?" ludo-board-animating":"")} role="group" aria-label="Plateau Ludo Sénégal">
      {CELL.map(([r,c])=>{
       const k=key(r,c),track=routeMap.get(k),pawns=occupancy.get(k)||[];
       const red=r<6&&c<6,gold=r>8&&c>8,green=r<6&&c>8,blue=r>8&&c<6;
       const redLane=homeMap[0].has(k),goldLane=homeMap[1].has(k);
       const greenLane=c===7&&r>=1&&r<=5,blueLane=c===7&&r>=9&&r<=13;
       const center=r>=6&&r<=8&&c>=6&&c<=8;
       const classes="ludo-cell lr-ludo-cell"+(red||gold||blue||green?" in-yard":"")+(red?" ludo-red-base":gold?" ludo-gold-base":blue?" ludo-blue-base":green?" ludo-green-base":"")+
        (track!==undefined?" ludo-path":"")+(redLane?" ludo-red-lane":"")+(goldLane?" ludo-gold-lane":"")+
        (blueLane?" ludo-blue-lane":"")+(greenLane?" ludo-green-lane":"")+
        (center?" ludo-center":"")+(track===0?" ludo-red-start":"")+(track===26?" ludo-gold-start":"");
       return <div className={classes+(pawns.length?" has-pawns":"")+
        (landing?.[0]===r&&landing?.[1]===c?" ludo-landed":"")} key={k} style={{gridRow:r+1,gridColumn:c+1}}>
        {track!==undefined&&SAFE.has(track)?<span className="ludo-star" aria-hidden="true">★</span>:null}
        {pawns.length?<div className={"ludo-cell-pawns ludo-stack-"+Math.min(pawns.length,5)}>
         {pawns.map((item,i)=>{
          return <button type="button" key={item.seat+"-"+item.pawn} disabled={!item.active}
           className={"ludo-pawn ludo-pawn-stacked ludo-pawn-"+(item.seat===0?"red":"gold")+(item.active?" can-move":"")+(game.status==="playing"&&game.turn===seat&&item.seat===seat?" is-own-turn":"")+(item.zone==="enemy"?" is-invading":"")}
           onClick={()=>choose(item.pawn)}
           title={"Pion "+(item.pawn+1)+(item.zone==="enemy"?" · cage adverse":"")}
           aria-label={"Pion "+(item.pawn+1)+(item.zone==="enemy"?" dans la cage adverse":"")}
           style={{...stackCellStyle(pawns.length,i),zIndex:5+i}}>
            <PawnShape index={item.pawn}/>
           </button>;
         })}
        </div>:null}
        {pawns.length>1?<span className="ludo-stack-count" aria-hidden="true">×{pawns.length}</span>:null}
       </div>;
      })}
      {([
       ["red",1,1,0],["green",1,10,null],
       ["blue",10,1,null],["yellow",10,10,1]
      ] as const).map(([color,row,col,owner])=>
       <div key={color}
        className={"base lr-ludo-base base--"+color+
         (owner!==null&&game.status==="playing"&&game.turn===owner?" is-current-turn":"")+
         (owner===seat&&game.status==="playing"&&game.turn===seat?" is-my-turn":"")}
        style={{gridRow:row+" / span 6",gridColumn:col+" / span 6"}}
        aria-hidden="true">
        <div className="base-inner">
         {[0,1,2,3].map(index=><span className="base-spot" key={index}/>)}
        </div>
       </div>
      )}
      <div className="ludo-board-center lr-shared-center" aria-hidden="true">
       <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="0,0 100,0 50,50" fill="#006b4b"/>
        <polygon points="100,0 100,100 50,50" fill="#ae831a"/>
        <polygon points="100,100 0,100 50,50" fill="#11518b"/>
        <polygon points="0,100 0,0 50,50" fill="#a72342"/>
        <circle cx="50" cy="50" r="11" fill="#fff7e7"/>
       </svg>
      </div>
      {captureBack.map(row=><div key={"capture-"+row.seat+"-"+row.pawn}
       className={"ludo-captured-pawn ludo-pawn-"+(row.seat===0?"red":"gold")+" is-returning"}
       style={{left:((row.point[1]+.5)/15*100)+"%",top:((row.point[0]+.5)/15*100)+"%"}} aria-hidden="true">
       <PawnShape index={row.pawn}/>
      </div>)}
      {motion?<div className={"ludo-moving-pawn ludo-pawn-"+(motion.seat===0?"red":"gold")}
       style={{left:((motion.point[1]+.5)/15*100)+"%",top:((motion.point[0]+.5)/15*100)+"%"}} aria-hidden="true">
       <i className="ludo-motion-aura"/>
       <span key={motion.index} className="ludo-moving-bounce"><PawnShape index={motion.pawn}/></span>
       <span className="ludo-senegal-step">{motion.index}/{motion.length}</span>
      </div>:null}
     </div>
    </div>
    {game.status==="won"&&!motion?<div className="ludo-victory ludo-solo-win" role="dialog" aria-label="Victoire Ludo Sénégal">
     <div className="ludo-celebrate">🏆🇸🇳</div>
     <strong>{game.winner===seat?"Tu as gagné !":"Ton adversaire a gagné !"}</strong>
     <p>Les quatre pions ont atteint le centre du Ludo Sénégal !</p>
     <button type="button" onClick={()=>setConfirmReset(true)}>Rejouer</button>
     <button type="button" className="ludo-secondary" onClick={onExit}>Retour aux jeux</button>
    </div>:null}
    {!solo&&members<2?<div className="ludo-senegal-wait" role="status">
     <span>💌</span><strong>En attente de ton partenaire</strong>
     <small>Quand votre espace aura deux membres, le Ludo Sénégal à deux démarrera.</small>
    </div>:null}
   </div>
   <div className="ludo-game-footer">
    {chosen&&chosen.length?<div className={"ludo-senegal-choice"+(invasionChoice?" is-raid-decision":"")} role="dialog" aria-label={invasionChoice?"Entrer dans la cage adverse ou continuer le tour":"Choisis ton chemin"}>
     <div><strong>{invasionChoice?"😈 Entrer dans sa cage ou continuer ?":"🇸🇳 Où veux-tu aller ?"}</strong><span>Pion {chosen[0].pawn+1} · dé {game.dice}</span></div>
     {invasionChoice?<p className="ludo-senegal-cage-hint" role="status">
      {enemyCagePawns.length===0
       ?"⚠️ Cage adverse vide : aucun pion à capturer. Tu peux continuer le tour. Si tu entres, il faudra un 6 pour en sortir."
       :directCapture
        ?"🎯 Capture possible ! Tu peux entrer pour attraper un pion, ou continuer ton chemin."
        :"Il y a "+enemyCagePawns.length+" pion(s) adverse(s) dans la cage. À toi de choisir : entrer pour attaquer ou continuer."}
     </p>:null}
     {chosen.map(option=><button key={option.action+"-"+option.to.gate+"-"+option.to.step}
      type="button" disabled={busy||rolling||Boolean(motion)} onClick={()=>void move(option)}
      className={invasionChoice&&option.action==="track"?"ludo-senegal-continue":invasionChoice&&option.action==="enemy"?"ludo-senegal-enter":""}>
      {invasionChoice&&option.action==="track"?"➡️ Continuer le tour":invasionChoice&&option.action==="enemy"?"😈 Entrer dans la cage adverse":option.label}
     </button>)}
     <button type="button" className="ludo-senegal-dismiss" onClick={()=>setChosen(null)}>Annuler</button>
    </div>:null}
    <div className="ludo-bottom-actions">
     <button type="button" className={"ludo-die-holder"+(rolling?" is-rolling":"")} disabled={!canRoll}
      onClick={()=>void roll()} aria-label="Lancer le dé">
      <LudoDie3D value={shownDie} color={game.turn===0?"red":"gold"} rolling={rolling}/>
     </button>
     <button type="button" className="ludo-main-action" disabled={!canRoll} onClick={()=>void roll()}>
      {!solo&&!online?"CONNEXION…":rolling?"LE DÉ ROULE…":motion?"DÉPLACEMENT…":
       !turnOwner?"⏳ TOUR ADVERSE":game.dice!==null?"TOUCHE UN PION":assisted?"🤖 COUP AUTOMATIQUE":"🎲 LANCER LE DÉ"}
     </button>
    </div>

    <div className="ludo-last-move" role="status">{game.lastAction}</div>
   </div>
  </div>
  {confirmReset?<div className="ludo-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nouvelle partie">
   <div className="ludo-modal"><span className="ludo-modal-symbol">🇸🇳</span><h2>Nouvelle partie ?</h2>
    <p>{solo?"La partie contre l’ordinateur sera remise à zéro.":"Le plateau sera réinitialisé pour les deux joueurs."}</p>
    <button className="ludo-modal-primary" disabled={busy} onClick={reset}>Oui, recommencer</button>
    <button className="ludo-modal-text" onClick={()=>setConfirmReset(false)}>Continuer</button>
   </div>
  </div>:null}
 </section>;
}
