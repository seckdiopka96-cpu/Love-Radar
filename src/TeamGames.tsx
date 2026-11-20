import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch,API_ORIGIN,isNativeApp} from "./api";
import {cleanTeamCode,parseTeamInvite,teamInviteUrl} from "./team-invite";
import {teamSnapshotPolicy} from "./team-game-sync";
import {teamBoardAnimation,teamCaptureHome,type TeamAnimationPin} from "./team-game-animation";
import {useLudoSounds} from "./ludo-sounds";
import {setTeamResumeHint} from "./team-resume";
import {TRACK,SAFE} from "./ludo-visuals";
import {movesForTeamPawn,teamPiecePoint,TEAM_BASE,TEAM_HOME,TEAM_COLORS,teamOf,
 type TeamSeat,type TeamGame,type TeamKind,type TeamMove
} from "./team-games-engine";
import "./team-games.css";

type Player={seat:number;name:string;team:number}|null;
type GameView={
 id:string;code:string;kind:TeamKind;version:number;seat:TeamSeat;team:0|1;
 host:boolean;guestJoined:boolean;players:Player[];presence:boolean[];
 state:TeamGame&{question?:string|null;options?:readonly string[]|null;correct?:number|null}
};
type Result={ok:boolean;error?:string;game?:GameView|null};
type CoupleTotals={matches:number;wins:number;losses:number;winRate:number;
 byKind:{kind:TeamKind;matches:number;wins:number}[]};
type CoupleHistory={kind:TeamKind;winner_team:number;win_reason:string;
 score_host:number;score_guest:number;finished_at:number;match_no:number};
type CoupleStats={teams:[CoupleTotals,CoupleTotals];history:CoupleHistory[]};
const gameLabel=(kind:TeamKind)=>kind==="quiz"?"Questions rapides":kind==="senegal"?"Ludo Sénégal":"Ludo Classique";
type Props={token:string;onExit:()=>void};
const MODES:[TeamKind,string,string][]=[
 ["classic","🎲 Ludo Classique","4 couleurs · 2 couples · mêmes règles classiques"],
 ["senegal","🇸🇳 Ludo Sénégal","Barrages, couloirs adverses et dés spéciaux"],
 ["quiz","⚡ Questions rapides","18 secondes · première équipe à 10 points"]
];
const colorHex=["#df4264","#149a79","#e7b23e","#3887d4"];
const cellKey=(r:number,c:number)=>r+":"+c;
const trackCells=new Set(TRACK.map(p=>cellKey(p[0],p[1])));
const homes=TEAM_HOME.flatMap((row,seat)=>row.map(p=>({seat,key:cellKey(p[0],p[1])})));
const baseCells=new Map(TEAM_BASE.flatMap((row,seat)=>row.map(p=>[cellKey(p[0],p[1]),seat] as const)));
const startCells=new Map([0,13,26,39].map((idx,seat)=>[cellKey(...TRACK[idx]),seat] as const));
function stageColor(r:number,c:number){
 if(r<6&&c<6)return "#b8274b";
 if(r<6&&c>8)return "#087453";
 if(r>8&&c>8)return "#bd891c";
 if(r>8&&c<6)return "#1658a0";
 if(r>=6&&r<=8&&c>=6&&c<=8)return "transparent";
 const home=homes.find(h=>h.key===cellKey(r,c));
 if(home)return colorHex[home.seat];
 if(trackCells.has(cellKey(r,c)))return startCells.has(cellKey(r,c))?colorHex[startCells.get(cellKey(r,c))!]: "#f8f2e7";
 return "#ede7d8";
}
type BoardFx={mover:TeamAnimationPin|null;captures:TeamAnimationPin[];
 impact:boolean;impactAt:[number,number]|null};
const dicePips:Record<number,number[]>={
 1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]
};
function TeamDie({face,rolling,seat}:{face:number;rolling:boolean;seat:TeamSeat}){
 const faces=[1,2,3,4,5,6];
 return <span className={"lr-team-die "+(rolling?"is-tumbling":"lr-team-die-face-"+face)}
  style={{"--team-die-color":colorHex[seat]} as React.CSSProperties} aria-hidden="true">
  <span className="lr-team-die-cube">{faces.map(n=><span key={n} className={"lr-team-die-side lr-team-die-side-"+n}>
   {Array.from({length:9},(_,i)=><i key={i} className={dicePips[n].includes(i)?"is-pip":""}/>)}
  </span>)}</span>
 </span>;
}
function TeamBoard({game,onChoose,fx}:{game:GameView;onChoose:(pawn:number)=>void;fx:BoardFx|null}){
 const board=game.state;
 const own=game.seat;
 const canChoose=board.status==="playing"&&board.dice!==null&&board.turn===own;
 const pips=[...Array(225)].map((_,i)=>{
  const row=Math.floor(i/15),col=i%15,key=cellKey(row,col);
  const color=stageColor(row,col);
  const isSafe=TRACK.findIndex(([r,c])=>r===row&&c===col);
  const start=startCells.get(key);
  const home=homes.find(h=>h.key===key);
  const bg=row>=6&&row<=8&&col>=6&&col<=8?
   {background:"conic-gradient(#a98526 0 25%,#245ba5 25% 50%,#ac2249 50% 75%,#0d795b 75% 100%)"}:
   {background:color};
  return <span key={i} className={"lr-team-cell"+(start!==undefined?" is-start":"")+(home?" is-home":"")}
   style={bg} aria-hidden="true">{isSafe>=0&&SAFE.has(isSafe)?"★":""}</span>;
 });
 const pieces=board.positions.flatMap((row,seat)=>row.map((pawn,index)=>{
  const point=teamPiecePoint(seat as TeamSeat,index,pawn);
  const colliders=board.positions.flatMap((r,s)=>r.map((p,j)=>({
   seat:s,index:j,key:cellKey(...teamPiecePoint(s as TeamSeat,j,p))
  }))).filter(x=>x.key===cellKey(...point));
  const ownIndex=colliders.findIndex(x=>x.seat===seat&&x.index===index);
  const shift=(ownIndex-(colliders.length-1)/2)*2.4;
  const animating=(fx?.mover?.seat===seat&&fx.mover.pawn===index)||
   Boolean(fx?.captures.some(c=>c.seat===seat&&c.pawn===index));
  const movable=canChoose&&!fx&&seat===own&&movesForTeamPawn(board,own,index).length>0;
  return <button key={seat+"-"+index} type="button"
    aria-label={"Pion "+(index+1)+" de "+(game.players[seat]?.name||"joueur")}
    className={"lr-team-pin"+(movable?" can-move":"")+(pawn.zone==="finished"?" is-finished":"")+(animating?" is-effect-hidden":"")}
    style={{left:((point[1]+.5)/15*100+shift/3)+"%",top:((point[0]+.5)/15*100+shift/3)+"%",
      backgroundColor:colorHex[seat],borderColor:seat===own?"#fff0c7":"#f6f8ff"}}
    onClick={()=>{if(movable)onChoose(index)}} disabled={!movable}><span/></button>;
 }));
 return <div className="lr-team-board-shell"><div className="lr-team-board"
  role="group" aria-label="Plateau partagé 15 par 15 à quatre couleurs">
   {pips}
   <span className="lr-team-board-center" aria-hidden="true">♥</span>
   <div className="lr-team-pieces">{pieces}
    {fx?.mover?<span className="lr-team-effect-pin is-travelling"
     style={{left:((fx.mover.point[1]+.5)/15*100)+"%",top:((fx.mover.point[0]+.5)/15*100)+"%",
       backgroundColor:colorHex[fx.mover.seat]}} aria-hidden="true"><i/></span>:null}
    {fx?.captures.map(c=><span key={c.seat+"-"+c.pawn} className="lr-team-effect-pin is-captured"
     style={{left:((c.point[1]+.5)/15*100)+"%",top:((c.point[0]+.5)/15*100)+"%",
       backgroundColor:colorHex[c.seat]}} aria-hidden="true"><i/></span>)}
    {fx?.impact&&fx.impactAt?<span className="lr-team-impact" aria-hidden="true"
     style={{left:((fx.impactAt[1]+.5)/15*100)+"%",top:((fx.impactAt[0]+.5)/15*100)+"%"}}>💥</span>:null}
   </div>
  </div></div>;
}
export default function TeamGames({token,onExit}:Props){
 const [game,setGame]=useState<GameView|null>(null);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [kind,setKind]=useState<TeamKind>("senegal");
 const [code,setCode]=useState("");
 const [error,setError]=useState("");
 const [now,setNow]=useState(Date.now());
 const [choices,setChoices]=useState<TeamMove[]|null>(null);
 const [confirmLeave,setConfirmLeave]=useState(false);
 const [hiddenResult,setHiddenResult]=useState(false);
 const [shareFeedback,setShareFeedback]=useState("");
 const [boardFx,setBoardFx]=useState<BoardFx|null>(null);
 const [dieTumbling,setDieTumbling]=useState(false);
 const {unlock:unlockSound,play:playSound}=useLudoSounds();
 const effectTimers=useRef<number[]>([]);
 const diceTimer=useRef<number|null>(null);
 const reduceMotion=useRef(false);
 const [statsOpen,setStatsOpen]=useState(false);
 const [stats,setStats]=useState<CoupleStats|null>(null);
 const [statsLoading,setStatsLoading]=useState(false);
 const [statsError,setStatsError]=useState("");
 const [reconnecting,setReconnecting]=useState(false);
 const [reconnectedAt,setReconnectedAt]=useState(0);
 const attemptedInvite=useRef("");
 const mounted=useRef(true);
 const ref=useRef<GameView|null>(null);
 const lock=useRef(false);
 const pollInFlight=useRef(false);
 const pollAgain=useRef(false);
 const leaving=useRef(false);
 const wasOffline=useRef(false);
 const localRollAt=useRef(0);
 const stopEffects=useCallback(()=>{
  effectTimers.current.forEach(window.clearTimeout);
  effectTimers.current=[];
  setBoardFx(null);
 },[]);
 const scheduleEffect=(cb:()=>void,ms:number)=>{
  effectTimers.current.push(window.setTimeout(cb,ms));
 };
 const rollDieVisual=useCallback(()=>{
  if(diceTimer.current!==null)window.clearTimeout(diceTimer.current);
  setDieTumbling(true);
  diceTimer.current=window.setTimeout(()=>{setDieTumbling(false);diceTimer.current=null},470);
 },[]);
 const receive=useCallback((value:GameView|null,allowRoomSwitch=false)=>{
  if(!mounted.current)return;
  if(!value){
   ref.current=null;setGame(null);setChoices(null);setTeamResumeHint(false);return;
  }
  const previous=ref.current;
  const policy=teamSnapshotPolicy(previous,value,allowRoomSwitch);
  if(policy==="ignore")return;
  setTeamResumeHint(value.state.status==="playing"||value.state.status==="waiting");
  if(policy==="presence-only"&&previous){
   // Presence is refreshed independently from turns. Keep the newer board.
   const merged={...previous,players:value.players,presence:value.presence};
   ref.current=merged;setGame(merged);
   return;
  }
  // Never infer a result from the animation. First accept the verified
  // server snapshot; then derive only cosmetic motion from its difference.
  if(previous&&previous.id===value.id&&
    (previous.state.matchNo||1)===(value.state.matchNo||1)&&
    previous.version<value.version){
   const freshRoll=value.state.lastRoll;
   if(freshRoll&&freshRoll.at!==previous.state.lastRoll?.at){
    // The tapping phone has already heard/seen the die. Other phones
    // receive this same animation once, with the authentic server face.
    if(freshRoll.seat!==value.seat||Date.now()-localRollAt.current>6500){
     rollDieVisual();
     playSound("roll");
    }
   }
   const effect=teamBoardAnimation(previous.state,value.state);
   stopEffects();
   if(effect&&document.visibilityState==="visible"&&!reduceMotion.current){
    setBoardFx({mover:effect.mover,captures:effect.captures,impact:false,
     impactAt:effect.captures[0]?.point||null});
    effect.path.forEach((point,i)=>scheduleEffect(()=>{
     setBoardFx(current=>current?.mover?
      {...current,mover:{...current.mover,point}}:current);
     playSound("step");
    },150*(i+1)));
    const landed=150*(effect.path.length+1);
    scheduleEffect(()=>{
     setBoardFx(current=>current?{
      mover:null,
      captures:current.captures.map(c=>({...c,point:teamCaptureHome(c.seat,c.pawn)})),
      impact:effect.captures.length>0,
      impactAt:effect.captures[0]?.point||null
     }:current);
     if(effect.captures.length){playSound("capture");navigator.vibrate?.(35);}
    },landed);
    scheduleEffect(()=>setBoardFx(null),landed+(effect.captures.length?520:130));
   }
   if(previous.state.status!=="finished"&&value.state.status==="finished"&&value.state.winner!==null){
    playSound("win");navigator.vibrate?.([50,60,100]);
   }
  }else{
   stopEffects();
  }
  ref.current=value;setGame(value);setChoices(null);
 },[rollDieVisual,playSound,stopEffects]);
 const refresh=useCallback(async()=>{
  if(!mounted.current||document.visibilityState==="hidden")return;
  if(pollInFlight.current||lock.current){pollAgain.current=true;return;}
  pollInFlight.current=true;
  try{
   const requestedId=ref.current?.id;
   const url="/api/team-games"+(requestedId?"?id="+encodeURIComponent(requestedId):"");
   const response=await apiFetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as Result;
   if(!response.ok||!data.ok)throw Error(data.error||"Connexion au tournoi impossible.");
   // A create/join can occur while a previous GET is in flight.
   if(mounted.current&&data.game&&(!requestedId||ref.current?.id===requestedId)){
    receive(data.game);
    setError("");
   }
   if(mounted.current){
    if(wasOffline.current){setReconnectedAt(Date.now());wasOffline.current=false;}
    setReconnecting(false);
   }
  }catch(e){
   if(mounted.current){
    wasOffline.current=true;setReconnecting(true);
    setError(prev=>ref.current?prev:(e instanceof Error?e.message:"Erreur de connexion."));
   }
  }
  finally{
   pollInFlight.current=false;
   if(mounted.current)setLoading(false);
   if(pollAgain.current&&mounted.current&&document.visibilityState==="visible"){
    pollAgain.current=false;
    // A one-shot queued poll is deliberately serialized, not overlapping.
    void refresh();
   }
  }
 },[token,receive]);
 useEffect(()=>{
  mounted.current=true;
  reduceMotion.current=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches||false;
  void refresh();
  const heartbeat=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},900);
  const clock=window.setInterval(()=>setNow(Date.now()),160);
  const onResume=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onResume);
  window.addEventListener("focus",onResume);
  window.addEventListener("online",onResume);
  const onLeave=()=>{
   const last=ref.current;
   if(!last||last.state.status!=="playing"||leaving.current)return;
   leaving.current=true;
   setTeamResumeHint(false);
   void apiFetch("/api/team-games",{
    method:"POST",cache:"no-store",keepalive:true,
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action:"quit",id:last.id,version:last.version})
   }).catch(()=>{});
  };
  window.addEventListener("lr-team-leave",onLeave);
  return()=>{mounted.current=false;clearInterval(heartbeat);clearInterval(clock);
   effectTimers.current.forEach(window.clearTimeout);effectTimers.current=[];
   if(diceTimer.current!==null)window.clearTimeout(diceTimer.current);
   document.removeEventListener("visibilitychange",onResume);
   window.removeEventListener("focus",onResume);
   window.removeEventListener("online",onResume);
   window.removeEventListener("lr-team-leave",onLeave)};
 },[refresh,token]);
 async function act(action:string,extra:Record<string,unknown>={}){
  if(lock.current)return;
  lock.current=true;setWorking(true);setError("");
  try{
   const current=ref.current;
   const response=await apiFetch("/api/team-games",{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action,...(current?{id:current.id,version:current.version}:{}),...extra})
   });
   const payload=await response.json() as Result;
   // Even a 409 can contain the current authoritative board. Reconcile it
   // before prompting the user so a stale turn never remains visible.
   if(payload.game)receive(payload.game,action==="create"||action==="join");
   if(!response.ok||!payload.ok)throw Error(payload.error||"Impossible de synchroniser le jeu.");
   if(wasOffline.current){setReconnectedAt(Date.now());wasOffline.current=false;}
   setReconnecting(false);
   setConfirmLeave(false);
   return true;
  }catch(e){
   if(mounted.current){
    setError(e instanceof Error?e.message:"Erreur de connexion.");
    if(!navigator.onLine){wasOffline.current=true;setReconnecting(true);}
   }
   pollAgain.current=true;
   return false;
  }finally{
   lock.current=false;
   if(mounted.current)setWorking(false);
   if(pollAgain.current&&document.visibilityState==="visible"){
    pollAgain.current=false;void refresh();
   }
  }
 }
 // A shared link survives login and opens the authenticated invited lobby.
 // The server always checks actual couple membership; the link is not auth.
 useEffect(()=>{
  const invited=parseTeamInvite(window.location.search);
  if(!invited||attemptedInvite.current===invited)return;
  attemptedInvite.current=invited;
  setCode(invited);setHiddenResult(false);
  void act("join",{code:invited}).then(joined=>{
   if(!joined)return;
   const url=new URL(window.location.href);
   if(url.searchParams.get("invite")!==invited)return;
   url.searchParams.delete("invite");
   window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  });
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[token]);
 const currentInvite=game&&game.state.status==="waiting"?
  teamInviteUrl(game.code,isNativeApp?API_ORIGIN:window.location.origin):"";
 const copyInvite=async(value:string,label:string)=>{
  try{
   if(!navigator.clipboard?.writeText)throw Error("Clipboard unavailable");
   await navigator.clipboard.writeText(value);
   setShareFeedback(label+" copié !");
  }catch{setShareFeedback("Sélectionne le lien affiché pour le copier.");}
 };
 const shareInvite=async()=>{
  if(!currentInvite)return;
  if(typeof navigator.share==="function"){
   try{
    await navigator.share({title:"Défis entre couples · Love Radar",
     text:"Rejoins notre salon privé 2 contre 2 sur Love Radar ❤️",url:currentInvite});
    setShareFeedback("Invitation partagée ❤️");return;
   }catch(e){if(e instanceof Error&&e.name==="AbortError")return;}
  }
  await copyInvite(currentInvite,"Lien d'invitation");
 };
 const loadStats=useCallback(async(gameId:string)=>{
  setStatsLoading(true);setStatsError("");
  try{
   const response=await apiFetch("/api/team-games?stats=1&id="+encodeURIComponent(gameId),{
    headers:{Authorization:"Bearer "+token},cache:"no-store"
   });
   const data=await response.json() as {ok:boolean;stats?:CoupleStats;error?:string};
   if(!response.ok||!data.ok||!data.stats)throw Error(data.error||"Classement indisponible.");
   if(mounted.current&&ref.current?.id===gameId)setStats(data.stats);
  }catch(e){
   if(mounted.current)setStatsError(e instanceof Error?e.message:"Classement indisponible.");
  }finally{if(mounted.current)setStatsLoading(false)}
 },[token]);
 useEffect(()=>{
  if(!statsOpen||!game?.id)return;
  const gameId=game.id;
  void loadStats(gameId);
  const interval=window.setInterval(()=>{
   if(document.visibilityState==="visible")void loadStats(gameId);
  },15000);
  return()=>window.clearInterval(interval);
 },[statsOpen,game?.id,game?.state.status,loadStats]);
 useEffect(()=>{setStats(null);setStatsError("");setStatsOpen(false)},[game?.id]);
 const leave=async()=>{
  const active=ref.current;
  if(active?.state.status==="playing"){
   const ok=await act("quit");if(!ok)return;
  }else if(active?.state.status==="waiting"){
   // Opening chat or going back from a pending invite is not a surrender.
   const ok=await act("leave-lobby");if(!ok)return;
  }
  setTeamResumeHint(false);
  onExit();
 };
 const active=game?.state;
 const status=active?.status;
 const seat=game?.seat??0;
 const myTeam=game?.team??0;
 const names=(team:0|1)=>game?.players.filter(x=>x?.team===team).map(x=>x!.name).join(" + ")||"Couple en attente";
 const choose=(pawn:number)=>{
  if(!game||boardFx||seat!==active?.turn||!active?.dice)return;
  const legal=movesForTeamPawn(active,seat,pawn);
  if(legal.length===1)void act("move",{pawn,move:legal[0].action});
  else if(legal.length>1)setChoices(legal);
 };
 const seconds=Math.max(0,Math.ceil(((active?.deadlineAt||0)-now)/1000));
 const readyIn=Math.max(0,Math.ceil(((active?.startsAt||0)-now)/1000));
 const turnLeft=Math.max(0,Math.ceil(((active?.updatedAt||0)+15000-now)/1000));
 const inQuiz=game?.kind==="quiz";
 return <section className="lr-team-screen" aria-label="Défis entre couples, deux contre deux">
  <header className="lr-team-header">
   <button type="button" onClick={()=>{if(status==="playing")setConfirmLeave(true);else void leave()}}>‹ Jeux</button>
   <div><small>❤️ 2 CONTRE 2 · EN DIRECT</small><h1>Défis entre couples</h1></div>
   <span className="lr-team-header-mark">🎮</span>
  </header>
  {reconnecting&&game?<div role="status" className="lr-team-connection">
   <span>📶 Reconnexion en cours…</span>
   <small>Ta partie, tes pions et tes points restent enregistrés.</small>
   <button type="button" onClick={()=>void refresh()}>Réessayer</button>
  </div>:null}
  {!reconnecting&&reconnectedAt>0&&now-reconnectedAt<3600?
   <div role="status" className="lr-team-reconnected">✓ Reconnecté · partie retrouvée</div>:null}
  {error&&(!game||!reconnecting)?<div role="alert" className="lr-team-error">{error}<button type="button" onClick={()=>void refresh()}>Réessayer</button></div>:null}
  {loading?<p className="lr-team-muted">Connexion à la salle privée…</p>:
  !game||hiddenResult?<div className="lr-team-lobby">
   <h2>Invitez un autre couple 💞</h2>
   <p>Deux couples, quatre joueurs et deux équipes. Vos messages privés restent séparés.</p>
   <div className="lr-team-modes">
    {MODES.map(([id,label,description])=><button type="button" key={id}
     className={kind===id?"is-selected":""} onClick={()=>setKind(id)}>
     <strong>{label}</strong><small>{description}</small></button>)}
   </div>
   <button className="lr-team-primary" type="button" disabled={working}
    onClick={()=>{setHiddenResult(false);void act("create",{kind})}}>Créer une salle pour deux couples</button>
   <div className="lr-team-join">
    <label htmlFor="team-code">Ou rejoindre un couple avec son code</label>
    <div><input id="team-code" autoCapitalize="characters" maxLength={10}
      value={code} placeholder="CODE À 10 CARACTÈRES" onChange={e=>setCode(e.target.value.toUpperCase())}/>
     <button type="button" disabled={working||!cleanTeamCode(code)} onClick={()=>{setHiddenResult(false);void act("join",{code:cleanTeamCode(code)})}}>Rejoindre</button>
    </div>
   </div>
  </div>:
  <div className="lr-team-live">
   <div className="lr-team-score">
    <div className={myTeam===0?"my-team":""}><small>ÉQUIPE ❤️</small><strong>{names(0)}</strong>
     {inQuiz?<b>{active!.scores[0]}</b>:null}</div>
    <span>VS</span>
    <div className={myTeam===1?"my-team":""}><small>ÉQUIPE 💙</small><strong>{names(1)}</strong>
     {inQuiz?<b>{active!.scores[1]}</b>:null}</div>
   </div>
   <div className="lr-team-ranking-toggle">
    <button type="button" aria-expanded={statsOpen} aria-controls="lr-team-ranking"
     onClick={()=>setStatsOpen(open=>!open)}>
     🏆 {statsOpen?"Masquer le classement":"Voir le classement des couples"}
    </button>
   </div>
   {statsOpen?<section id="lr-team-ranking" className="lr-team-ranking" aria-label="Classement privé des couples">
    <div className="lr-team-ranking-head">
     <strong>🏆 Classement des couples</strong>
     <span>Privé · Victoires et défaites cumulées</span>
    </div>
    {statsLoading&&!stats?<p className="lr-team-muted">Chargement des statistiques…</p>:null}
    {statsError?<p role="alert" className="lr-team-stat-error">{statsError}
     <button type="button" onClick={()=>void loadStats(game.id)}>Réessayer</button></p>:null}
    {stats?<><div className="lr-team-ranking-teams">
     {stats.teams.map((team,i)=><div key={i} className={"lr-team-ranking-entry"+(i===myTeam?" is-mine":"")}>
      <span className="lr-team-ranking-rank">{team.wins>stats.teams[1-i].wins?"🥇":
       team.wins<stats.teams[1-i].wins?"🥈":"🤝"}</span>
      <strong>{i===0?"❤️":"💙"} {names(i as 0|1)}</strong>
      <div className="lr-team-ranking-count"><b>{team.wins}</b><span>victoires</span></div>
      <p>{team.losses} défaite(s) · {team.matches} match(s) · {team.winRate}% gagnés</p>
      <small>{team.byKind.length?team.byKind.map(k=>gameLabel(k.kind)+" "+k.wins+"/"+k.matches).join(" · "):
       "Aucun match terminé pour l’instant"}</small>
     </div>)}
    </div>
    <h3>Vos dernières confrontations</h3>
    {stats.history.length===0?<p className="lr-team-muted">Aucun résultat entre ces deux couples pour le moment.</p>:
     <div className="lr-team-ranking-history">{stats.history.map((match,i)=>
      <div key={match.finished_at+"-"+match.match_no+"-"+i}>
       <span>{gameLabel(match.kind)}</span>
       <strong>{match.winner_team===0?"❤️":"💙"} Victoire {match.win_reason==="abandon"?"(abandon)":""}</strong>
       {match.kind==="quiz"?<small>{match.score_host} – {match.score_guest}</small>:null}
      </div>)}</div>}
    </>:null}
   </section>:null}
   <div className={"lr-team-roster"+(status==="playing"?" is-playing":"")} aria-label="Présence en direct des quatre joueurs">
    {game.players.map((player,i)=><div key={i} className={"lr-team-player"+(game.presence[i]?" is-online":"")}>
     <span className="lr-team-player-avatar" style={{borderColor:colorHex[i]}}>{player?.name?.trim().slice(0,1).toUpperCase()||"?"}</span>
     <strong>{player?.name||"Place libre"}</strong>
     <small>{i%2===0?"❤️":"💙"} {i<2?"Joueur 1":"Joueur 2"} · {game.presence[i]?"En ligne":"En attente"}</small>
    </div>)}
   </div>
   {status==="waiting"?<div className="lr-team-wait">
    <h2>Salon privé prêt ✨</h2>
    <p>Envoie ce lien au couple invité : il ouvrira directement ce salon après connexion.</p>
    <div className="lr-team-code">{game.code}</div>
    <div className="lr-team-share-actions">
     <button className="lr-team-primary" type="button" onClick={()=>void shareInvite()}>💌 Partager l’invitation</button>
     <button type="button" onClick={()=>void copyInvite(currentInvite,"Lien")}>🔗 Copier le lien</button>
     <button type="button" onClick={()=>void copyInvite(game.code,"Code")}>📋 Copier le code</button>
    </div>
    <input className="lr-team-invite-url" aria-label="Lien d'invitation à copier" readOnly value={currentInvite}
     onFocus={e=>e.target.select()} onClick={e=>e.currentTarget.select()}/>
    {shareFeedback?<p className="lr-team-share-feedback" role="status">{shareFeedback}</p>:null}
    <p>{game.presence.filter(Boolean).length} joueur(s) sur 4 · Démarrage automatique quand tous sont présents.</p>
   </div>:null}
   {status==="finished"?<div className="lr-team-victory">
    {active!.winner!==null?<div className="lr-team-confetti" aria-hidden="true">
      {Array.from({length:18},(_,i)=><i key={i} style={{"--confetti-i":i} as React.CSSProperties}/>)}
     </div>:null}
    <span className="lr-team-trophy">{active!.winner===null?"🔒":"🏆"}</span>
    <h2>{active!.winner===null?"Salon fermé":("Victoire de l'équipe "+(active!.winner===0?"❤️":"💙")+" !")}</h2>
    <p>{active!.lastAction}</p>
    {inQuiz&&active!.winner!==null?<p>Score final : {active!.scores[0]} – {active!.scores[1]}</p>:null}
    {active!.winner!==null?<button className="lr-team-primary" type="button" disabled={working} onClick={()=>void act("restart")}>↻ Revanche à quatre</button>:null}
    <button type="button" onClick={()=>{receive(null);setHiddenResult(true)}}>Créer un autre match</button>
   </div>:null}
   {status==="playing"?(inQuiz?
    <div className="lr-team-quiz">
     <div className="lr-team-timer"><span>⚡ Manche {active!.round}</span>
      <strong>{active!.phase==="question"?readyIn?readyIn+" · Préparez-vous":seconds+" s":"Résultat"}</strong>
      <span>Premier à 10 points</span></div>
     <h2>{active!.question||"Préparez-vous pour la prochaine question."}</h2>
     <p>La première bonne réponse marque un point pour son couple.</p>
     <div className="lr-team-answers">
      {(active!.options||[]).map((answer,i)=><button key={active!.round+"-"+i}
       type="button" className={active!.phase==="result"&&active!.correct===i?"is-correct":""}
       disabled={working||active!.phase!=="question"||readyIn>0||seconds<=0||active!.answered.includes(seat)}
       onClick={()=>void act("answer",{round:active!.round,choice:i})}>
       {answer}</button>)}
     </div>
     <p className="lr-team-muted">{active!.answered.includes(seat)?"Réponse envoyée. Attends les autres joueurs.":active!.phase==="result"?"Nouvelle manche dans un instant…":"Réponds avant la fin du chrono !"}</p>
    </div>:
    <div className="lr-team-ludo">
     <div className="lr-team-turn"><span>{game.players[active!.turn]?.name||"Joueur"} joue</span>
      <strong>{active!.turn===seat?"🎯 À TOI":"Tour adverse"} · {turnLeft}s</strong>
      <span>{game.kind==="senegal"?"🇸🇳 Règles sénégalaises":"🎲 Classique"}</span></div>
     <TeamBoard game={game} onChoose={choose} fx={boardFx}/>
     <div className="lr-team-dice">
      <span>{active!.lastAction}</span>
      <button type="button" className={"lr-team-dice-button"+(dieTumbling?" is-tumbling":"")}
       disabled={working||Boolean(boardFx)||dieTumbling||active!.turn!==seat||active!.dice!==null}
       onClick={()=>{unlockSound();playSound("roll");localRollAt.current=Date.now();
        rollDieVisual();void act("roll")}}
       aria-label="Lancer le dé">
       <TeamDie rolling={dieTumbling} face={active!.dice||active!.lastRoll?.face||1}
        seat={active!.dice!==null?active!.turn:active!.lastRoll?.seat??active!.turn}/>
      </button>
      <span>{active!.turn===seat?active!.dice===null?"Lance le dé":"Touche un pion disponible":"En attente du joueur"}</span>
     </div>
     <div className="lr-team-color-key">{TEAM_COLORS.map((col,i)=>
      <span key={col} style={{color:colorHex[i]}}>{game.players[i]?.name||"Joueur"} {teamOf(i as TeamSeat)===0?"❤️":"💙"}</span>)}</div>
     {choices?<div className="lr-team-route" role="dialog" aria-modal="true">
      <h3>Choisis pour ce pion</h3>
      {choices.map(option=><button key={option.action+"-"+option.to.gate}
       disabled={working} type="button" onClick={()=>void act("move",{pawn:option.pawn,move:option.action})}>
       {option.action==="home"?"🏠 Entrer chez toi":option.action==="enemy"?"😈 Entrer dans la cage adverse":
        option.action==="track"?"➡️ Continuer":option.action==="jump"?"⤴️ Sauter le barrage":
        "Déplacer le pion"}</button>)}
      <button type="button" onClick={()=>setChoices(null)}>Annuler</button>
     </div>:null}
    </div>):null}
   {status==="playing"?<button className="lr-team-quit" type="button" onClick={()=>setConfirmLeave(true)}>Quitter le match</button>:null}
  </div>}
  {confirmLeave?<div className="lr-team-route" role="dialog" aria-modal="true" aria-label="Confirmer l'abandon">
   <h3>Quitter la partie ?</h3>
   <p>L'autre couple gagnera par abandon si tu quittes.</p>
   <button className="lr-team-quit" disabled={working} onClick={()=>void leave()}>Oui, abandonner</button>
   <button onClick={()=>setConfirmLeave(false)}>Continuer à jouer</button>
  </div>:null}
 </section>;
}
