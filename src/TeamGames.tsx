import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
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
function TeamBoard({game,onChoose}:{game:GameView;onChoose:(pawn:number)=>void}){
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
  const movable=canChoose&&seat===own&&movesForTeamPawn(board,own,index).length>0;
  return <button key={seat+"-"+index} type="button"
    aria-label={"Pion "+(index+1)+" de "+(game.players[seat]?.name||"joueur")}
    className={"lr-team-pin"+(movable?" can-move":"")+(pawn.zone==="finished"?" is-finished":"")}
    style={{left:((point[1]+.5)/15*100+shift/3)+"%",top:((point[0]+.5)/15*100+shift/3)+"%",
      backgroundColor:colorHex[seat],borderColor:seat===own?"#fff0c7":"#f6f8ff"}}
    onClick={()=>{if(movable)onChoose(index)}} disabled={!movable}><span/></button>;
 }));
 return <div className="lr-team-board-shell"><div className="lr-team-board"
  role="group" aria-label="Plateau partagé 15 par 15 à quatre couleurs">
   {pips}
   <span className="lr-team-board-center" aria-hidden="true">♥</span>
   <div className="lr-team-pieces">{pieces}</div>
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
 const mounted=useRef(true);
 const ref=useRef<GameView|null>(null);
 const lock=useRef(false);
 const leaving=useRef(false);
 const receive=useCallback((value:GameView|null)=>{
  ref.current=value;
  setGame(value);
  setChoices(null);
 },[]);
 const refresh=useCallback(async()=>{
  try{
   const id=ref.current?.id;
   const url="/api/team-games"+(id?"?id="+encodeURIComponent(id):"");
   const response=await apiFetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as Result;
   if(!response.ok||!data.ok)throw Error(data.error||"Connexion au tournoi impossible.");
   if(mounted.current&&data.game){
    if(!ref.current||data.game.version!==ref.current.version||data.game.state.status!==ref.current.state.status){
     receive(data.game);
    }else{
     ref.current=data.game;
     setGame(data.game);
    }
   }
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Erreur de connexion.");}
  finally{if(mounted.current)setLoading(false);}
 },[token,receive]);
 useEffect(()=>{
  mounted.current=true;
  void refresh();
  const heartbeat=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},1600);
  const clock=window.setInterval(()=>setNow(Date.now()),160);
  const onLeave=()=>{
   const last=ref.current;
   if(!last||last.state.status!=="playing"||leaving.current)return;
   leaving.current=true;
   void apiFetch("/api/team-games",{
    method:"POST",cache:"no-store",keepalive:true,
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action:"quit",id:last.id,version:last.version})
   }).catch(()=>{});
  };
  window.addEventListener("lr-team-leave",onLeave);
  return()=>{mounted.current=false;clearInterval(heartbeat);clearInterval(clock);
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
   if(!response.ok||!payload.ok)throw Error(payload.error||"Impossible de synchroniser le jeu.");
   if(payload.game)receive(payload.game);
   setConfirmLeave(false);
   return true;
  }catch(e){
   setError(e instanceof Error?e.message:"Erreur de connexion.");
   void refresh();
   return false;
  }finally{lock.current=false;setWorking(false);}
 }
 const leave=async()=>{
  const active=ref.current;
  if(active&&(active.state.status==="playing"||active.state.status==="waiting")){
   const ok=await act("quit");if(!ok)return;
  }
  onExit();
 };
 const active=game?.state;
 const status=active?.status;
 const seat=game?.seat??0;
 const myTeam=game?.team??0;
 const names=(team:0|1)=>game?.players.filter(x=>x?.team===team).map(x=>x!.name).join(" + ")||"Couple en attente";
 const choose=(pawn:number)=>{
  if(!game||seat!==active?.turn||!active?.dice)return;
  const legal=movesForTeamPawn(active,seat,pawn);
  if(legal.length===1)void act("move",{pawn,move:legal[0].action});
  else if(legal.length>1)setChoices(legal);
 };
 const seconds=Math.max(0,Math.ceil(((active?.deadlineAt||0)-now)/1000));
 const readyIn=Math.max(0,Math.ceil(((active?.startsAt||0)-now)/1000));
 const inQuiz=game?.kind==="quiz";
 return <section className="lr-team-screen" aria-label="Défis entre couples, deux contre deux">
  <header className="lr-team-header">
   <button type="button" onClick={()=>{if(status==="playing")setConfirmLeave(true);else void leave()}}>‹ Jeux</button>
   <div><small>❤️ 2 CONTRE 2 · EN DIRECT</small><h1>Défis entre couples</h1></div>
   <span className="lr-team-header-mark">🎮</span>
  </header>
  {error?<div role="alert" className="lr-team-error">{error}<button type="button" onClick={()=>void refresh()}>Réessayer</button></div>:null}
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
     <button type="button" disabled={working||code.length!==10} onClick={()=>{setHiddenResult(false);void act("join",{code})}}>Rejoindre</button>
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
   {status==="waiting"?<div className="lr-team-wait">
    <h2>Salon privé prêt ✨</h2>
    <p>Partage ce code avec l’autre couple. Chacun des quatre joueurs doit ouvrir « Défis entre couples » dans Love Radar.</p>
    <div className="lr-team-code">{game.code}</div>
    <button className="lr-team-primary" type="button" onClick={()=>void navigator.clipboard?.writeText(game.code)}>
     <span>📋 Copier le code</span></button>
    <div className="lr-team-presence">{game.players.map((p,i)=><span key={i}
      className={game.presence[i]?"is-online":""}>
      {p?.name||"En attente…"} · {game.presence[i]?"présent(e)":"en attente"}
     </span>)}</div>
    <p>Début automatique lorsque les 4 joueurs sont présents.</p>
   </div>:null}
   {status==="finished"?<div className="lr-team-victory">
    <span className="lr-team-trophy">🏆</span>
    <h2>Victoire de l'équipe {active!.winner===0?"❤️":"💙"} !</h2>
    <p>{active!.lastAction}</p>
    {inQuiz?<p>Score final : {active!.scores[0]} – {active!.scores[1]}</p>:null}
    <button className="lr-team-primary" type="button" disabled={working} onClick={()=>void act("restart")}>↻ Revanche à quatre</button>
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
      <strong>{active!.turn===seat?"🎯 À TOI":"Tour adverse"}</strong>
      <span>{game.kind==="senegal"?"🇸🇳 Règles sénégalaises":"🎲 Classique"}</span></div>
     <TeamBoard game={game} onChoose={choose}/>
     <div className="lr-team-dice">
      <span>{active!.lastAction}</span>
      <button type="button" className="lr-team-dice-button"
       disabled={working||active!.turn!==seat||active!.dice!==null}
       onClick={()=>void act("roll")} aria-label="Lancer le dé">
       {active!.dice||"🎲"}</button>
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
