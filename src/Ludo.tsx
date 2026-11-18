import {apiFetch} from "./api";
import { useCallback, useEffect, useRef, useState } from "react";
import "./ludo.css";
import "./ludo-immersive.css";
import "./ludo-arena.css";
import LudoTutorial from "./LudoTutorial";
import LudoDie3D from "./LudoDie3D";
import LudoDuoFrame from "./LudoDuoFrame";
import "./ludo-duo-color.css";
import PawnShape from "./LudoPawn";
import {useLudoSounds} from "./ludo-sounds";
import {TRACK,HOME,BASE,SAFE,CELL,key,pointForProgress,movementSteps,stackCellStyle,type Point} from "./ludo-visuals";

type Game={id:string;version:number;turn:number;dice:number|null;positions:number[][];status:"playing"|"won";winner:number|null;autoCounts:[number,number];lastAction:string;updatedAt:number;deadlineAt:number|null};
type Gift={consents:[boolean,boolean];choice:"credit"|"internet"|"wave2000"|null;chosenBy:number|null;given:boolean};
type DuoColor="blue"|"red"|"green"|"yellow";
type Palette={colors:[DuoColor,DuoColor];chosenBy:number|null};
const DUO_COLORS:{value:DuoColor;name:string}[]=[
 {value:"blue",name:"Bleu"},{value:"red",name:"Rouge"},
 {value:"green",name:"Vert"},{value:"yellow",name:"Jaune"}
];
type Agreement={signed:[boolean,boolean];names:[string|null,string|null];giftChoices:[boolean|null,boolean|null];signedAt:[number|null,number|null];startedAt:number|null};
type GiftChoice="credit"|"internet"|"wave2000";
const GIFT_OPTIONS:{id:GiftChoice;label:string;detail:string}[]=[{id:"credit",label:"📱 Crédit téléphonique",detail:"Recharge à offrir"},{id:"internet",label:"🌐 Connexion Internet",detail:"Forfait Internet à offrir"},{id:"wave2000",label:"💸 Wave 2 000 F CFA",detail:"Cadeau à envoyer séparément"}];
const giftLabel=(choice:GiftChoice|null|undefined)=>GIFT_OPTIONS.find(item=>item.id===choice)?.label||"Cadeau à choisir";
type Reaction={id?:string;seat:number;emoji:string;at:number};
type CapturedPawn={seat:number;pawn:number;from:number};
type MoveEvent={gameId:string;version:number;seat:number;pawn:number;from:number;to:number;captures:CapturedPawn[];at:number};
type PawnMotion={seat:number;pawn:number;progress:number;from:number;to:number};
type CapturedMotion=CapturedPawn&{returning:boolean;progress:number};
type Challenge={gameId:string;fromId:string;fromName:string;fromSeat:number;sentAt:number};
type Presence=[{online:boolean;joinedAt:number|null},{online:boolean;joinedAt:number|null}];
type DieResult={seat:number;face:number;at:number};
type ResponseData={ok:boolean;unchanged?:boolean;delta?:boolean;error?:string;members?:number;seat?:number;game?:Game|null;reaction?:Reaction|null;reactions?:Reaction[];moveEvent?:MoveEvent|null;gift?:Gift|null;agreement?:Agreement|null;palette?:Palette|null;lastRoll?:DieResult|null;challenge?:Challenge|null;presence?:Presence|null;notificationRequested?:boolean;serverNow?:number};
type Props={token:string;mySeat:number;myName:string;partnerName:string|null;myAvatar?:string;partnerAvatar?:string;onExit:()=>void;challengeId?:string|null;onNotificationReady?:(challengeId:string)=>void};
function allowed(progress:number,dice:number|null){return dice!==null&&(progress===-1?dice===6:progress>=0&&progress<57&&progress+dice<=57)}
function labelPosition(progress:number){return progress===-1?"Dans la base":progress===57?"Arrivé !":progress>=51?"Couloir final":"Sur le plateau"}
const trackAt=new Map(TRACK.map((p,i)=>[key(p[0],p[1]),i]));
const homeAt=HOME.map(list=>new Set(list.map(p=>key(p[0],p[1]))));
function haptic(duration:number|number[]=12){try{if("vibrate" in navigator)navigator.vibrate(duration)}catch{/* unsupported on iOS */}}


export default function Ludo({token,mySeat,myName,partnerName,myAvatar,partnerAvatar,onExit,challengeId,onNotificationReady}:Props){
 const [game,setGame]=useState<Game|null>(null);
 const [members,setMembers]=useState(0);
 const [reactions,setReactions]=useState<Reaction[]>([]);
 const [gift,setGift]=useState<Gift|null>(null);
 const [agreement,setAgreement]=useState<Agreement|null>(null);
 const [palette,setPalette]=useState<Palette|null>(null);
 const [lastRoll,setLastRoll]=useState<DieResult|null>(null);
 const [colorBusy,setColorBusy]=useState(false);
 const autoDuoPawn=useRef("");
 // Conditional refreshes only apply after both players have signed.
 const activeDuoGame=useRef(false);
 const lastFullRefresh=useRef(0);
 
 const [presence,setPresence]=useState<Presence>([{online:false,joinedAt:null},{online:false,joinedAt:null}]);
 const [partnerJustJoined,setPartnerJustJoined]=useState(false);
 const previousPartnerOnline=useRef<boolean|null>(null);
 const [challenge,setChallenge]=useState<Challenge|null>(null);
 const [challengeBusy,setChallengeBusy]=useState(false);
 const [challengeHint,setChallengeHint]=useState("");
 const [signBusy,setSignBusy]=useState(false);
 const [giftOptIn,setGiftOptIn]=useState(false);
 // A new match always requires a fresh read, choice and signature.
 useEffect(()=>{
  setGiftOpen(false);
  setGiftOptIn(false);
 },[game?.id]);
 const [giftOpen,setGiftOpen]=useState(false);
 const [giftBusy,setGiftBusy]=useState(false);
 const [clock,setClock]=useState(Date.now());
 const [clockOffset,setClockOffset]=useState(0);
 const [busy,setBusy]=useState(false);
 const actionInFlight=useRef(false);
 const [rolling,setRolling]=useState(false);
 const [rollingFace,setRollingFace]=useState(1);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [frameReady,setFrameReady]=useState(false);
 const [menu,setMenu]=useState(false);
 const [rules,setRules]=useState(false);
 const [tutorialOpen,setTutorialOpen]=useState(false);
 const [emotes,setEmotes]=useState(false);
 const [effect,setEffect]=useState("");
 const [boardSize,setBoardSize]=useState(0);
 const [motion,setMotion]=useState<PawnMotion|null>(null);
 const [capturedMotions,setCapturedMotions]=useState<CapturedMotion[]>([]);
 const [landing,setLanding]=useState<Point|null>(null);
 const [captureFlash,setCaptureFlash]=useState(false);
 const [reactionBusy,setReactionBusy]=useState(false);
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

 const onGame=useCallback((latest:Game,moveEvent?:MoveEvent|null)=>{
  const prev=prior.current;
  if(prev&&prev.id===latest.id&&latest.version<prev.version)return;
  if(prev&&prev.id===latest.id&&latest.version===prev.version){
   prior.current=latest;setGame(latest);return;
  }
  if(prev?.id!==latest.id){
   clearMotionTimers();setMotion(null);setCapturedMotions([]);setLanding(null);setCaptureFlash(false);
  }
  if(prev&&prev.id===latest.id&&latest.version>prev.version){
   const inferred=latest.positions.flatMap((positions,seat)=>positions.map((to,pawn)=>({
    seat,pawn,from:prev.positions[seat][pawn],to
   }))).find(item=>item.to>item.from&&item.to>=0&&item.to<=57);
   const event=moveEvent&&moveEvent.gameId===latest.id&&moveEvent.version>prev.version&&moveEvent.version<=latest.version?moveEvent:null;
   const moved=event||inferred;
   const captured:CapturedPawn[]=event?.captures||latest.positions.flatMap((positions,seat)=>positions.flatMap((p,pawn)=>{
    const before=prev.positions[seat][pawn];
    return p===-1&&before>=0&&before<=50?[{seat,pawn,from:before}]:[];
   }));
   const celebration=latest.status==="won"&&prev.status!=="won";
   const route=moved?movementSteps(moved.from,moved.to):[];
   const canAnimate=Boolean(moved&&route.length&&document.visibilityState==="visible"
);
   if(moved||captured.length||celebration){
    setEffect(celebration?"win":captured.length?"capture":"move");
    if(effectTimeout.current!==null)window.clearTimeout(effectTimeout.current);
    effectTimeout.current=window.setTimeout(()=>{if(isActive.current){setEffect("");setCaptureFlash(false)}},Math.max(3500,250+route.length*(moved?.from===-1?520:540)+900));
    clearMotionTimers();setLanding(null);
    if(canAnimate&&moved){
     // Hold each square long enough for the pawn to be readable on mobile.
      // Match Solo's deliberate pace. Every square stays visible on both phones
      // long enough to see the pin land before moving to the next square.
      const STEP_MS=moved.from===-1?520:540,START_MS=250;
     setCapturedMotions(captured.map(p=>({...p,returning:false,progress:p.from})));
     setMotion({seat:moved.seat,pawn:moved.pawn,from:moved.from,to:moved.to,progress:moved.from});
     route.forEach((progress,index)=>{
      movementTimers.current.push(window.setTimeout(()=>{
       if(!isActive.current)return;
       setMotion({seat:moved.seat,pawn:moved.pawn,from:moved.from,to:moved.to,progress});
       playSound("step");
       if(index===route.length-1)haptic(18);
      },START_MS+index*STEP_MS));
     });
     const finish=START_MS+route.length*STEP_MS+90;
     movementTimers.current.push(window.setTimeout(()=>{
      if(!isActive.current)return;
      setMotion(null);
      setLanding(pointForProgress(moved.seat,moved.pawn,moved.to));
      if(captured.length){
       setCaptureFlash(true);playSound("capture");haptic([35,40,45]);
       // Replay the captured pawn's journey BACKWARDS, one real square per
       // 50 ms, then move from its own starting square into its home slot.
       const maxBack=Math.max(...captured.map(p=>p.from));
       captured.forEach(p=>{
        for(let step=p.from-1;step>=0;step--){
         movementTimers.current.push(window.setTimeout(()=>{
          if(!isActive.current)return;
          setCapturedMotions(rows=>rows.map(row=>row.seat===p.seat&&row.pawn===p.pawn?
           {...row,progress:step,returning:true}:row));
         },75+(p.from-1-step)*50));
        }
       });
       movementTimers.current.push(window.setTimeout(()=>{
        if(isActive.current)setCapturedMotions(rows=>rows.map(row=>({...row,progress:-1,returning:true})));
       },85+maxBack*50));
       movementTimers.current.push(window.setTimeout(()=>{
        if(isActive.current)setCapturedMotions([]);
       },240+maxBack*50));
      }
      if(celebration){playSound("win");haptic([55,70,65])}
     },finish));
     movementTimers.current.push(window.setTimeout(()=>{if(isActive.current)setLanding(null)},finish+1100));
    }else{
     setMotion(null);setCapturedMotions([]);
     if(moved){setLanding(pointForProgress(moved.seat,moved.pawn,moved.to));playSound("step");haptic(14)}
     if(captured.length){setCaptureFlash(true);playSound("capture");haptic(40)}
     if(celebration)playSound("win");
     movementTimers.current.push(window.setTimeout(()=>{if(isActive.current)setLanding(null)},1050));
    }
   }
   // A dice roll with no position changes must not cancel an ongoing pawn hop.
  }
  prior.current=latest;
  setGame(latest);
 },[clearMotionTimers,playSound]);

 const load=useCallback(async()=>{
  try{
   const previous=prior.current;
   // Version-only checks can miss a partner joining or leaving.
   const quick=Boolean(previous&&activeDuoGame.current&&previous.status==="playing"&&
    Date.now()-lastFullRefresh.current<3200);
   const endpoint=quick&&previous?"/api/ludo?since="+previous.version+"&game="+encodeURIComponent(previous.id):"/api/ludo";
   const res=await apiFetch(endpoint,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Connexion au jeu impossible.");
   if(!isActive.current)return;
   if(!quick)lastFullRefresh.current=Date.now();
   if(data.presence)setPresence(data.presence);
   // No board state changed: do not make React re-render every half second.
   if(data.unchanged){setError("");return}
   if(data.delta){
    if(data.game)onGame(data.game,data.moveEvent);
    if(data.lastRoll!==undefined)setLastRoll(data.lastRoll);
    if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
    setError("");
    return;
   }
   activeDuoGame.current=Boolean(data.agreement?.startedAt);
   setMembers(data.members||0);
   if(data.game)onGame(data.game,data.moveEvent);
   else {prior.current=null;setGame(null)}
   setReactions(data.reactions||(data.reaction?[data.reaction]:[]));
   setGift(data.gift||null);
   setAgreement(data.agreement||null);
   setPalette(data.palette||null);
   setLastRoll(data.lastRoll||null);
   setChallenge(data.challenge||null);
   if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
   setError("");
  }catch(e){if(isActive.current)setError(e instanceof Error?e.message:"Connexion au jeu impossible.")}
  finally{if(isActive.current)setLoading(false)}
 },[token,onGame]);

 useEffect(()=>{
  isActive.current=true;
  let stopped=false,inFlight=false;
  let timer:number|null=null;
  const poll=async()=>{
   if(stopped||inFlight||document.visibilityState!=="visible")return;
   inFlight=true;
   try{await load()}finally{
    inFlight=false;
    // Check the partner's turns more often; reduce server load during ours.
    // Schedule AFTER the previous response, never overlap on mobile.
    const current=prior.current;
    // Game-over/pre-signature screens need occasional full metadata, not
    // hundreds of unnecessary D1 queries per minute.
    const delay=!activeDuoGame.current?700:
     current?.status==="won"?1800:
     current?.turn!==mySeat?250:650;
    if(!stopped&&document.visibilityState==="visible")timer=window.setTimeout(()=>{void poll()},delay);
   }
  };
  const visible=()=>{
   if(timer!==null){window.clearTimeout(timer);timer=null}
   if(document.visibilityState==="visible"&&!inFlight)void poll();
  };
  void poll();
  document.addEventListener("visibilitychange",visible);
  return()=>{
   stopped=true;
   isActive.current=false;
   if(timer!==null)window.clearTimeout(timer);
   document.removeEventListener("visibilitychange",visible);
   if(effectTimeout.current!==null)window.clearTimeout(effectTimeout.current);
   clearMotionTimers();
  };
 },[load,clearMotionTimers,mySeat]);
 useEffect(()=>{
  const id=window.setInterval(()=>setClock(Date.now()),250);
  return()=>window.clearInterval(id);
 },[]);
 // Presence belongs to this specific mounted device, not the account.
 // Old iPhone tabs cannot delete a newer session's presence lease.
 useEffect(()=>{
  if(!game?.id||members!==2)return;
  const gameId=game.id,sessionId=crypto.randomUUID();
  let closed=false,inFlight=false,lastJoin:Promise<void>|null=null;
  const send=async(mode:"join"|"leave")=>{
   if(mode==="join"&&inFlight)return;
   if(mode==="join")inFlight=true;
   try{
    const response=await apiFetch("/api/ludo",{
     method:"POST",keepalive:mode==="leave",
     headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
     body:JSON.stringify({action:"presence",mode,gameId,sessionId})
    });
    if(mode==="join"&&response.ok&&!closed){
     const result=await response.json() as ResponseData;
     if(result.presence)setPresence(result.presence);
    }
   }catch{/* Network loss expires on the server automatically. */}
   finally{if(mode==="join")inFlight=false}
  };
  const ping=()=>{
   if(document.visibilityState==="visible"&&!inFlight)lastJoin=send("join");
  };
  ping();
  const timer=window.setInterval(ping,7000);
  document.addEventListener("visibilitychange",ping);
  window.addEventListener("focus",ping);
  return()=>{
   closed=true;
   window.clearInterval(timer);
   document.removeEventListener("visibilitychange",ping);
   window.removeEventListener("focus",ping);
   // Any pending join must finish before this session can be released.
   if(lastJoin)void lastJoin.finally(()=>{void send("leave")});
   else void send("leave");
  };
 },[token,game?.id,members]);
 useEffect(()=>{
  const online=Boolean(presence[1-mySeat]?.online);
  if(previousPartnerOnline.current===false&&online)setPartnerJustJoined(true);
  previousPartnerOnline.current=online;
 },[presence,mySeat]);
 useEffect(()=>{
  if(!partnerJustJoined)return;
  const timer=window.setTimeout(()=>setPartnerJustJoined(false),4500);
  return()=>window.clearTimeout(timer);
 },[partnerJustJoined]);

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

 // An invited player has reached the real game only after its current
 // agreement and color palette have been fetched from the authenticated API.
 // The parent may now consume the pending notification without losing it.
 useEffect(()=>{
  if(challengeId&&game&&palette&&frameReady&&!loading)onNotificationReady?.(challengeId);
 },[challengeId,game?.id,Boolean(palette),frameReady,loading,onNotificationReady]);

 useEffect(()=>{
  if(!rolling)return;
  const interval=window.setInterval(()=>setRollingFace(1+Math.floor(Math.random()*6)),55);
  return()=>window.clearInterval(interval);
 },[rolling]);

 async function act(action:"roll"|"move"|"restart"|"forfeit",pawn?:number){
  if(actionInFlight.current||busy||!game||(action!=="restart"&&!agreement?.startedAt))return false;
   actionInFlight.current=true;
  // WebAudio must be unlocked immediately by a user tap on iOS.
  if(action==="roll"||action==="move"){unlockSound();if(action==="roll")playSound("roll")}
  setBusy(true);setError("");
  const actionStarted=Date.now();
  if(action==="roll")setRolling(true);
  try{
   const res=await apiFetch("/api/ludo",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action,version:game.version,...(pawn===undefined?{}:{pawn})})
   });
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Action impossible.");
   if(data.game)onGame(data.game,data.moveEvent);
   if(data.gift)setGift(data.gift);
   if(data.agreement){setAgreement(data.agreement);activeDuoGame.current=Boolean(data.agreement.startedAt);}
   if(data.palette)setPalette(data.palette);
   if(data.lastRoll!==undefined)setLastRoll(data.lastRoll);
   if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
   return true;
  }catch(e){
   setError(e instanceof Error?e.message:"Action impossible.");
   void load();
   return false;
  }finally{
   actionInFlight.current=false;
   setBusy(false);
   if(action==="roll")window.setTimeout(()=>{if(isActive.current)setRolling(false)},Math.max(0,320-(Date.now()-actionStarted)));
  }
 }

 async function giftAction(action:"gift_choose"|"gift_given",value:boolean|GiftChoice){
  if(giftBusy||!game)return;
  setGiftBusy(true);setError("");
  const details=action==="gift_choose"?{choice:value}:{given:value};
  try{
   const response=await apiFetch("/api/ludo",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({action,...details})});
   const data=await response.json() as ResponseData;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d’enregistrer le cadeau.");
   if(data.gift)setGift(data.gift);
   setGiftOpen(false);
  }catch(e){setError(e instanceof Error?e.message:"Erreur cadeau.");}
  finally{setGiftBusy(false)}
 }

 async function sendChallenge(){
  if(challengeBusy||!game||agreement?.startedAt)return;
  setChallengeBusy(true);setChallengeHint("");setError("");
  try{
   const response=await apiFetch("/api/ludo",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"challenge"})});
   const data=await response.json() as ResponseData;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d’envoyer le défi.");
   if(data.challenge)setChallenge(data.challenge);
   setChallengeHint("Défi envoyé ! Ton partenaire recevra une notification s’il les a activées.");
  }catch(e){setChallengeHint(e instanceof Error?e.message:"Envoi impossible.")}
  finally{setChallengeBusy(false)}
 }

 async function signRules(){
  if(signBusy||!game||agreement?.startedAt||agreement?.signed[mySeat])return;
  setSignBusy(true);setError("");
  try{
   const response=await apiFetch("/api/ludo",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"sign_rules",acceptRules:true,signed:true,giftConsent:giftOptIn})
   });
   const data=await response.json() as ResponseData;
   if(!response.ok||!data.ok)throw Error(data.error||"Impossible d’enregistrer la signature.");
   if(data.agreement)setAgreement(data.agreement);
   if(data.gift)setGift(data.gift);
   if(data.palette)setPalette(data.palette);
   if(data.game)onGame(data.game,data.moveEvent);
   if(typeof data.serverNow==="number")setClockOffset(data.serverNow-Date.now());
  }catch(e){setError(e instanceof Error?e.message:"Signature non enregistrée.")}
  finally{setSignBusy(false)}
 }

 async function chooseDuoColor(color:DuoColor){
  if(colorBusy||!game||agreement?.startedAt||agreement?.signed.some(Boolean))return;
  setColorBusy(true);setError("");
  try{
   const res=await apiFetch("/api/ludo",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"choose_color",color})
   });
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Cette couleur n’est pas disponible.");
   if(data.palette)setPalette(data.palette);
  }catch(e){setError(e instanceof Error?e.message:"Impossible de sélectionner cette couleur.");void load()}
  finally{setColorBusy(false)}
 }
 async function sendReaction(emoji:string){
  if(reactionBusy||members<2||!game)return;
  setEmotes(false);setReactionBusy(true);
  unlockSound();
  try{
   const res=await apiFetch("/api/ludo",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"react",emoji})
   });
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Réaction non envoyée.");
   if(data.reactions)setReactions(data.reactions);
   else if(data.reaction)setReactions([data.reaction]);
   playSound("reaction");haptic(10);
  }catch(e){setError(e instanceof Error?e.message:"Réaction non envoyée.")}
  finally{setReactionBusy(false)}
 }

 function duoFrameAction(action:"roll"|"move"|"restart"|"exit"|"leave"|"gift"|"menu",pawn?:number){
  // Leaving after the match has ended must never require a second dialog.
  if(action==="leave"){if(game?.status==="won")onExit();else setMenu(true);return}
  if(action==="exit"||action==="menu"){setMenu(true);return}
  if(action==="gift"){setGiftOpen(true);return}
  if(action==="roll"||action==="move"||action==="restart")void act(action,pawn);
 }
 // One legal pawn means automatic movement, just as in the new Solo.
 // Deduplicate this action across clock updates and repeated polls.
 useEffect(()=>{
  if(!game||!agreement?.startedAt||game.status!=="playing"||game.turn!==mySeat||
      game.dice===null||busy||rolling||motion||capturedMotions.length)return;
  const pawns=game.positions[mySeat].flatMap((p,i)=>allowed(p,game.dice)?[i]:[]);
  if(pawns.length!==1)return;
  const stamp=game.id+":"+game.version+":"+pawns[0];
  if(autoDuoPawn.current===stamp)return;
  const timer=window.setTimeout(()=>{
   autoDuoPawn.current=stamp;
   void act("move",pawns[0]);
  },190);
  return()=>window.clearTimeout(timer);
 },[game,agreement?.startedAt,mySeat,busy,rolling,motion,capturedMotions.length]);

 const remaining=game?.status==="playing"&&game.deadlineAt?Math.max(0,Math.ceil((game.deadlineAt-clock-clockOffset)/1000)):null;
 const giftAgreed=Boolean(gift?.consents.every(Boolean));
 const myConsent=Boolean(gift?.consents[mySeat]);
 const mustSign=Boolean(game&&game.status==="playing"&&!agreement?.startedAt);
 const mySigned=Boolean(agreement?.signed[mySeat]);
 const otherSigned=Boolean(agreement?.signed[1-mySeat]);
 const myTurn=Boolean(game&&game.status==="playing"&&agreement?.startedAt&&game.turn===mySeat);
 const animationBusy=Boolean(motion||capturedMotions.length);
 const canPlay=Boolean(game&&myTurn&&game.dice!==null&&!busy&&!rolling&&!animationBusy);
 const legal=game?game.positions[mySeat].map(p=>allowed(p,game.dice)):([false,false,false,false] as boolean[]);
 const displayName=(seat:number)=>seat===mySeat?myName:(partnerName||"Ton amour");
 const red= mySeat===0;
 const finished=(seat:number)=>game?.positions[seat].filter(p=>p===57).length||0;
 // Show the real Ludo board with starting pawns even before the second partner joins.
 // This is a visual preview only: the server remains authoritative and controls stay disabled.
 const displayPositions=game?.positions??[[-1,-1,-1,-1],[-1,-1,-1,-1]];
 const pawnCells=new Map<string,{seat:number;pawn:number;active:boolean}[]>();
 for(let side=0;side<2;side++)for(let pawn=0;pawn<4;pawn++){
  const progress=displayPositions[side][pawn];
  if(progress===57||(motion?.seat===side&&motion.pawn===pawn)
   ||capturedMotions.some(item=>item.seat===side&&item.pawn===pawn))continue;
  const point=pointForProgress(side,pawn,progress);
  const k=key(point[0],point[1]);
  const items=pawnCells.get(k)||[];
  items.push({seat:side,pawn,active:canPlay&&side===mySeat&&legal[pawn]});
  pawnCells.set(k,items);
 }
 const movingPoint:Point|null=motion?pointForProgress(motion.seat,motion.pawn,motion.progress):null;
 const movingStyle=movingPoint?{left:((movingPoint[1]+.5)/15*100)+"%",top:((movingPoint[0]+.5)/15*100)+"%"}:undefined;
  const motionStepCount=motion?movementSteps(motion.from,motion.to).length:0;
  // Keep taller pawns inside the board when crossing the outside border.
  const movingEdge=movingPoint?(movingPoint[0]===0?" ludo-motion-top":movingPoint[0]===14?" ludo-motion-bottom":"")
   +(movingPoint[1]===0?" ludo-motion-left":movingPoint[1]===14?" ludo-motion-right":""):"";
 const highlighted=new Map<string,"upcoming"|"passed"|"current"|"finish">();
 if(motion){
  for(const step of movementSteps(motion.from,motion.to)){
   const pt=pointForProgress(motion.seat,motion.pawn,step);
   highlighted.set(key(pt[0],pt[1]),step===motion.progress?"current":step<motion.progress?"passed":step===motion.to?"finish":"upcoming");
  }
 }
 const lastNumber=game?.lastAction.match(/lancé un ([1-6])/);
 const showLast=lastRoll?.face??(lastNumber?Number(lastNumber[1]):5);
 const dice=rolling?rollingFace:(game?.dice??showLast);
 const message=!game?(loading?"Ouverture du plateau…":members<2?"Plateau prêt · En attente de ton amour":"Connexion à la partie…"):game.status==="won"?"Partie terminée":game.dice!==null&&myTurn?"Touche un pion sur le plateau":game.dice!==null?"Ton partenaire choisit son pion":myTurn?"À TOI DE JOUER !":"AU TOUR DE "+displayName(game.turn);
 const status=game?.status==="won"?"🏆":myTurn?"✦":"◌";
 return <section className="ludo-experience ludo-arena ludo-duo-arena" aria-label="Ludo en ligne privé à deux joueurs">
  <header className="ludo-topbar">
   <button type="button" className="ludo-leave" onClick={()=>setMenu(true)} aria-label="Quitter ou abandonner la partie">
    <span aria-hidden="true">‹</span> Quitter
   </button>
   <div className="ludo-brand"><img className="ludo-head-logo" src="/ludo-mark.svg" alt="Logo Ludo"/><strong>LUDO <span>♥</span> DUO</strong><small>ARÈNE PRIVÉE · DEUX JOUEURS</small></div>
   <div className="ludo-top-actions">
    <button type="button" className="ludo-sound" onClick={toggleSound} aria-label={soundOn?"Couper les sons du jeu":"Activer les sons du jeu"} aria-pressed={soundOn}>{soundOn?"🔊":"🔇"}</button>
    <button type="button" className={"ludo-gift-shortcut"+(giftAgreed?" agreed":"")} onClick={()=>setGiftOpen(true)} aria-label="Défi cadeau facultatif" title="Défi cadeau">🎁</button>
    <button type="button" className="ludo-help" onClick={()=>setRules(true)} aria-label="Voir les règles du Ludo">?</button>
    <button type="button" className="ludo-arena-how" onClick={()=>setTutorialOpen(true)} aria-label="Voir le tutoriel Ludo">▶</button>
   </div>
  </header>

  <div className="ludo-players">
   {[0,1].map(side=><div key={side} className={"ludo-player ludo-player-"+(side===0?"red":"gold")+(game?.turn===side&&game.status==="playing"?" is-active":"")}>
    <div className="ludo-player-avatar">{displayName(side).trim().charAt(0).toUpperCase()||"♥"}</div>
    <div className="ludo-player-info"><strong>{displayName(side)}{side===mySeat?" · Moi":presence[side]?.online?" 🟢":" ⚪"}</strong><span>{finished(side)} / 4 arrivés</span></div>
    {game?.turn===side&&game.status==="playing"?<span className="ludo-player-turn" aria-label="À son tour">●</span>:null}
   </div>)}
  </div>

  <div className={"ludo-turn-banner"+(myTurn?" its-mine":"")} role="status" aria-live="polite">
   <span className="ludo-turn-icon" aria-hidden="true">{status}</span>
   <strong>{message}</strong>
   {partnerJustJoined?<span className="ludo-partner-joined" role="status">🟢 {displayName(1-mySeat)} vient de rejoindre !</span>:null}
   {remaining!==null?<span className={"ludo-countdown"+(remaining<=5?" urgent":"")} aria-label={"Temps restant : "+remaining+" secondes"}><span className="ludo-time-ring">{remaining}</span><small>s</small></span>:null}
  </div>

  <div className="ludo-play-area">
  <div className={"ludo-stage"+(captureFlash?" ludo-is-capture":"")} ref={boardStage}>
   <div className="ludo-board-wrap ludo-board-wrap-immersive" style={boardSize?{width:boardSize,height:boardSize}:undefined}>
     <div className={"ludo-board"+(motion?" ludo-board-animating":"")} role="group" aria-label={game?"Plateau coloré de Ludo pour deux joueurs":"Aperçu du plateau Ludo avant l’arrivée du partenaire"}>
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
       const light=highlighted.get(k);
       const isLanding=Boolean(landing&&landing[0]===r&&landing[1]===c);
       return <div key={k} className={cls+(pawns.length?" has-pawns":"")+(light?" ludo-route-"+light:"")+(isLanding?" ludo-landed":"")}>
        {track!==undefined&&SAFE.has(track)?<span className="ludo-star" aria-hidden="true">★</span>:null}
        {pawns.length?<div className={"ludo-cell-pawns ludo-stack-"+Math.min(pawns.length,5)}>
         {pawns.map((item,index)=>{
          return <button type="button" key={item.seat+"-"+item.pawn}
           disabled={!item.active} onClick={()=>void act("move",item.pawn)}
           title={"Pion "+(item.pawn+1)+" de "+displayName(item.seat)}
           aria-label={"Pion "+(item.pawn+1)+" de "+displayName(item.seat)+(item.active?" : déplacer":"")}
           style={{...stackCellStyle(pawns.length,index),zIndex:5+index}}
           className={"ludo-pawn ludo-pawn-stacked ludo-pawn-"+(item.seat===0?"red":"gold")+(item.active?" can-move":"")}>
           <PawnShape index={item.pawn}/>
          </button>;
         })}</div>:null}
        {pawns.length>1?<span className="ludo-stack-count" aria-hidden="true">×{pawns.length}</span>:null}
       </div>;
      })}
      <div className="ludo-yard ludo-yard-red" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-upper" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-lower" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-gold" aria-hidden="true"/>
      <div className="ludo-board-center" aria-hidden="true"><span>♥</span></div>
      {capturedMotions.map(item=>{
       const point=pointForProgress(item.seat,item.pawn,item.progress);
       return <div key={"captured-"+item.seat+"-"+item.pawn} className={"ludo-captured-pawn ludo-pawn-"+(item.seat===0?"red":"gold")+(item.returning?" is-returning":"")}
        style={{left:((point[1]+.5)/15*100)+"%",top:((point[0]+.5)/15*100)+"%"}} aria-hidden="true">
        <PawnShape index={item.pawn}/>
       </div>;
      })}
      {motion&&movingStyle?<div className={"ludo-moving-pawn ludo-pawn-"+(motion.seat===0?"red":"gold")+movingEdge} style={movingStyle} aria-hidden="true">
       <i className="ludo-motion-aura"/>
       <span key={motion.progress} className="ludo-moving-bounce"><PawnShape index={motion.pawn}/></span>
       <b className="ludo-motion-step">{Math.max(0,motion.progress-motion.from)} / {motionStepCount}</b>
      </div>:null}
     </div>
    </div>
   {error?<div className="ludo-alert-pop" role="alert">{error}</div>:null}
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
    <button type="button" className={"ludo-die-holder"+(rolling?" is-rolling":"")} disabled={!myTurn||busy||rolling||animationBusy||!game||game.status==="won"||game.dice!==null} onClick={()=>void act("roll")} aria-label="Lancer le dé">
     <LudoDie3D value={dice||0} color={palette?.colors[game?.turn??mySeat]??"blue"} rolling={rolling}/>
    </button>
    <button type="button" className="ludo-main-action" disabled={busy||animationBusy||Boolean(game&&(!myTurn||rolling||game.status==="won"||game.dice!==null))}
     onClick={()=>{if(game)void act("roll");else void load()}}>{!game?"ACTUALISER":game.dice!==null?"TOUCHE UN PION":myTurn?rolling?"LANCEMENT…":"LANCER LE DÉ":"ATTENDRE…"}</button>
   </div>

   <div className="ludo-last-move" role="status" aria-live="polite">{error?"⚠ "+error:(game?.lastAction||"Plateau visible · La partie commencera quand vous serez deux ♥")}</div>
  </footer>
  </div>

  {!game||!palette?<div className="ludo-duo-loading" role="status" aria-live="polite">
   <img src="/ludo-mark.svg" alt="Ludo" className="ludo-duo-loading-logo"/>
   <strong>LUDO DUO</strong>
   <p>{error||(!game?"Préparation de la partie à deux…":"Synchronisation du plateau…")}</p>
   <div className="ludo-duo-loading-actions">
    <button type="button" onClick={()=>void load()}>↻ Réessayer</button>
    <button type="button" onClick={onExit}>‹ Retour aux jeux</button>
   </div>
  </div>:null}
  {game&&palette?
   <LudoDuoFrame game={game} palette={palette} lastRoll={lastRoll} mySeat={mySeat} myName={myName} partnerName={partnerName} myAvatar={myAvatar} partnerAvatar={partnerAvatar}
    remaining={remaining} rolling={rolling} rollingFace={rollingFace}
    busy={busy} animationBusy={animationBusy} motion={motion} capturedMotions={capturedMotions}
    error={error} overlayOpen={menu||giftOpen||rules||mustSign} onAction={duoFrameAction}
     onReady={()=>setFrameReady(true)}/>:null}
  {tutorialOpen&&Boolean(agreement?.startedAt)&&game?.status==="playing"&&!mustSign&&!giftOpen&&!rules?<LudoTutorial mode="duo" onClose={()=>setTutorialOpen(false)}/>:null}
  {mustSign?<div className="ludo-agreement-backdrop">
   <div className="ludo-agreement-dialog ludo-ready-dialog" role="dialog" aria-modal="true" aria-label="Accord pour jouer au Ludo Duo">
    <div className="ludo-agreement-heading">
     <span className="ludo-agreement-icon" aria-hidden="true">🎲</span>
     <div><span className="ludo-ready-kicker">LUDO DUO · PARTIE PRIVÉE</span><h2>Prêts à jouer ?</h2><p>Un accord simple, et la partie commence.</p></div>
    </div>
    {challengeId&&game?.id!==challengeId?<div className="ludo-challenge-alert" role="status">⏳ L’ancien défi est terminé. Voici votre partie actuelle.</div>:null}
    {challenge&&challenge.gameId===game?.id&&challenge.fromSeat!==mySeat?<div className="ludo-challenge-alert" role="status">🎲 {challenge.fromName} t’invite à jouer !</div>:null}
    <div className="ludo-presence-status" role="status" aria-live="polite">
     {presence[1-mySeat]?.online?"🟢 "+displayName(1-mySeat)+" a rejoint la partie":"⚪ En attente de "+displayName(1-mySeat)+"…"}
    </div>
    <div className="ludo-agreement-status" aria-label="Accord des deux joueurs">
     {[0,1].map(seat=><div key={seat} className={"ludo-agreement-player"+(agreement?.signed[seat]?" is-signed":"")}>
      <span aria-hidden="true">{agreement?.signed[seat]?"✓":seat===mySeat?"●":"◌"}</span>
      <strong>{seat===mySeat?"Toi · "+displayName(seat):displayName(seat)}</strong>
      <small>{agreement?.signed[seat]?"Prêt à jouer":seat===mySeat?"À confirmer":"En attente"}</small>
     </div>)}
    </div>
    {!mySigned?<>
     <fieldset className="ludo-duo-color-picker" disabled={colorBusy||Boolean(agreement?.signed.some(Boolean))}>
      <legend>1 · Choisis ta couleur</legend>
      <div className="ludo-duo-color-options">
       {DUO_COLORS.map(c=><button key={c.value} type="button"
        className={"ludo-duo-color-choice ludo-duo-color-"+c.value+
         (palette?.chosenBy!=null&&palette?.colors[mySeat]===c.value?" is-selected":"")}
        aria-pressed={palette?.chosenBy!=null&&palette?.colors[mySeat]===c.value}
        onClick={()=>void chooseDuoColor(c.value)}>
        <span aria-hidden="true"/>{c.name}
       </button>)}
      </div>
      <p>{palette?.chosenBy==null?"Choisis une couleur pour continuer.":
       "Ta couleur : "+(DUO_COLORS.find(c=>c.value===palette?.colors[mySeat])?.name||"Bleu")+
       " · Ton partenaire a la couleur opposée."}</p>
     </fieldset>
     <section className="ludo-ready-rules" aria-label="Règles essentielles du Ludo Duo">
      <h3>2 · Les règles, en bref</h3>
      <p>🎲 <span>Fais <strong>6</strong> pour sortir un pion. Le premier à rentrer ses <strong>4 pions</strong> gagne.</span></p>
      <p>⭐ <span>Les étoiles protègent. Un 6, une capture ou une arrivée donne un tour bonus.</span></p>
      <p>⏱️ <span>Tu as <strong>15 secondes</strong> pour jouer. Après <strong>3 tours automatiques</strong> à ta place, tu perds.</span></p>
     </section>
     <label className="ludo-ready-gift-option">
      <input type="checkbox" checked={giftOptIn} onChange={e=>setGiftOptIn(e.target.checked)}/>
      <span><strong>🎁 Défi cadeau (facultatif)</strong><small>Seulement si vous l’acceptez tous les deux. Aucun paiement automatique.</small></span>
     </label>
     <p className="ludo-ready-consent">En appuyant sur le bouton, tu acceptes les règles pour cette partie. Tu peux jouer sans cadeau.</p>
     <button type="button" className="ludo-agreement-submit" disabled={signBusy||colorBusy||palette?.chosenBy==null} onClick={()=>void signRules()}>
      {signBusy?"Validation en cours…":"✓ J’accepte et je joue"}
     </button>
    </>:<>
     <div className="ludo-agreement-wait" role="status">
      <span className="ludo-agreement-bigcheck" aria-hidden="true">✓</span>
      <h3>Tu es prêt·e !</h3>
      <p>{otherSigned?"Vous êtes prêts tous les deux. La partie commence !":"En attente de "+displayName(1-mySeat)+"…"}</p>
      <small>{agreement?.giftChoices[mySeat]?"Défi cadeau accepté":"Partie sans cadeau de ton côté"}</small>
     </div>
    </>}
    {!otherSigned?<button type="button" className="ludo-challenge-send" disabled={challengeBusy} onClick={()=>void sendChallenge()}>
     {challengeBusy?"Envoi…":"↗ Inviter mon partenaire"}
    </button>:null}
    {challengeHint?<p className="ludo-challenge-hint" role="status">{challengeHint}</p>:null}
    {error?<div className="ludo-agreement-error" role="alert">{error}</div>:null}
    <button type="button" className="ludo-agreement-exit" onClick={onExit}>← Quitter la partie</button>
    <p className="ludo-agreement-footnote">Accord valable uniquement pour cette manche.</p>
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
      <p>Le cadeau se règle entre vous, en dehors de l’application.</p>
    </>:<p>Le défi cadeau n’a pas été accepté par vous deux avant la fin de la partie. Vous pourrez l’activer pour une prochaine manche.</p>}
    <button type="button" className="ludo-modal-text" onClick={()=>setGiftOpen(false)}>Fermer</button>
   </div>
  </div>:null}

  {menu?<div className="ludo-modal-backdrop" role="presentation">
   <div className="ludo-modal" role="dialog" aria-modal="true" aria-label="Quitter la partie">
    <div className="ludo-modal-symbol">♥</div><h2>Quitter la partie ?</h2>
    <p>{agreement?.startedAt?
     "Tu peux quitter l’écran sans abandonner, mais le chronomètre continue : après 3 tours joués par l’ordinateur à ta place, tu perds. Si tu abandonnes, ton partenaire gagne immédiatement.":
     "La partie n’a pas encore commencé. Tu peux quitter ce plateau sans pénalité."}</p>
    <button type="button" className="ludo-modal-primary" onClick={onExit}>← Quitter le plateau</button>
    {game?.status==="playing"&&agreement?.startedAt?<button type="button" className="ludo-modal-danger" disabled={busy} onClick={()=>{void act("forfeit").then(ok=>{if(ok){setMenu(false);onExit()}})}}>Abandonner et perdre</button>:null}
    <button type="button" className="ludo-modal-text" onClick={()=>setMenu(false)}>Continuer à jouer</button>
   </div>
  </div>:null}

  {rules?<div className="ludo-modal-backdrop" role="presentation">
   <div className="ludo-modal ludo-rules-dialog" role="dialog" aria-modal="true" aria-label="Règles">
    <div className="ludo-modal-symbol">🎲</div><h2>Comment jouer ?</h2>
    <p>À deux, chacun avance ses 4 pions. Lance un 6 pour sortir. Choisis le pion à déplacer, capture l’adversaire et vise le centre du plateau.</p>
    <p>Un 6, une capture ou un pion arrivé donnent un tour bonus. Trois 6 d’affilée font passer le tour. Les cases ★ sont protégées. Il faut le nombre exact pour finir.</p>
    <p>Tu as 15 secondes par tour. Après 3 tours confiés automatiquement à l’ordinateur, tu perds la manche.</p>
    <button type="button" className="ludo-modal-primary" onClick={()=>setRules(false)}>Compris, jouons !</button>
   </div>
  </div>:null}
 </section>;
}
