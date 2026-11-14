import { useCallback, useEffect, useState } from "react";
import "./ludo.css";

type Point=[number,number];
type Game={id:string;version:number;turn:number;dice:number|null;positions:number[][];status:"playing"|"won";winner:number|null;lastAction:string};
type ResponseData={ok:boolean;error?:string;members?:number;seat?:number;game?:Game|null};
type Props={token:string;mySeat:number;myName:string;partnerName:string|null};
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
const DIE=["","⚀","⚁","⚂","⚃","⚄","⚅"];
const CELL=Array.from({length:225},(_,i)=>[Math.floor(i/15),i%15] as Point);
function allowed(progress:number,dice:number|null){return dice!==null&&(progress===-1?dice===6:progress>=0&&progress<57&&progress+dice<=57)}
function labelPosition(progress:number){return progress===-1?"Dans la base":progress===57?"Arrivé !":progress>=51?"Couloir final":"Sur le plateau"}

export default function Ludo({token,mySeat,myName,partnerName}:Props){
 const [game,setGame]=useState<Game|null>(null);
 const [members,setMembers]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  try{
   const res=await fetch("/api/ludo",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Connexion au jeu impossible.");
   setMembers(data.members||0);
   if(data.game)setGame(prev=>!prev||data.game!.version>=prev.version?data.game!:prev);
   else setGame(null);
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Connexion au jeu impossible.")}
  finally{setLoading(false)}
 },[token]);
 useEffect(()=>{
  void load();
  const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load()},2000);
  const onVisible=()=>{if(document.visibilityState==="visible")void load()};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible)};
 },[load]);
 async function act(action:"roll"|"move"|"restart",pawn?:number){
  if(busy||!game)return;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/ludo",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action,version:game.version,...(pawn===undefined?{}:{pawn})})
   });
   const data=await res.json() as ResponseData;
   if(!res.ok||!data.ok)throw Error(data.error||"Coup impossible.");
   if(data.game)setGame(data.game);
  }catch(e){setError(e instanceof Error?e.message:"Coup impossible.");void load()}
  finally{setBusy(false)}
 }
 const myTurn=Boolean(game&&game.status==="playing"&&game.turn===mySeat);
 const canPlay=Boolean(game&&myTurn&&game.dice!==null&&!busy);
 const legal=game?game.positions[mySeat].map(p=>allowed(p,game.dice)):([false,false,false,false] as boolean[]);
 const displayName=(seat:number)=>seat===mySeat?myName:(partnerName||"Ton partenaire");
 const pawnCells=new Map<string,{seat:number;pawn:number;active:boolean}[]>();
 if(game)for(let side=0;side<2;side++)for(let pawn=0;pawn<4;pawn++){
  const progress=game.positions[side][pawn];
  if(progress===57)continue;
  const point=progress===-1?BASE[side][pawn]:progress<=50?TRACK[(side*26+progress)%52]:HOME[side][progress-51];
  if(!point)continue;
  const k=key(point[0],point[1]);
  const items=pawnCells.get(k)||[];
  items.push({seat:side,pawn,active:canPlay&&side===mySeat&&legal[pawn]});
  pawnCells.set(k,items);
 }
 const finished=(seat:number)=>game?.positions[seat].filter(p=>p===57).length||0;
 return <section className="ludo-page" aria-label="Ludo en ligne à deux joueurs">
  <header className="ludo-heading"><span className="ludo-eyebrow"><span className="ludo-live-dot"/> VOTRE SALON DE JEU PRIVÉ</span><h1>Ludo <em>♥</em> à deux</h1><p>Un petit défi, même à des kilomètres.</p></header>
  {!game?<div className="ludo-empty"><div>🎲</div><h2>{loading?"Ouverture du plateau…":members<2?"En attente de ton partenaire":"Préparation de la partie…"}</h2><p>{members<2?"Dès que ton partenaire rejoint votre espace privé avec votre code, la partie sera disponible.":"Le plateau se synchronise entre vos deux téléphones."}</p><button type="button" onClick={()=>void load()}>Actualiser le jeu</button>{error?<p role="alert" className="ludo-alert">{error}</p>:null}</div>:<>
   <div className="ludo-score">
    {[0,1].map(side=><div key={side} className={"ludo-person ludo-person-"+(side===0?"red":"gold")+(game.turn===side&&game.status==="playing"?" is-playing":"")}>
      <div className="ludo-person-icon">{displayName(side).charAt(0).toUpperCase()}</div>
      <div className="ludo-person-details"><strong>{displayName(side)}{side===mySeat?" (toi)":""}</strong><small>{finished(side)} pion{finished(side)>1?"s":""} à l’arrivée sur 4</small></div>
      {game.turn===side&&game.status==="playing"?<span className="ludo-turn-pill">Tour</span>:null}
    </div>)}
   </div>
   <div className="ludo-layout">
    <div className="ludo-board-wrap">
     <div className="ludo-board" role="group" aria-label="Plateau de Ludo avec pions rouges et jaunes">
      {CELL.map(([r,c])=>{
       const k=key(r,c),track=trackAt.get(k),redBase=r<6&&c<6,goldBase=r>8&&c>8;
       const neutralBase=(r<6&&c>8)||(r>8&&c<6);
       const redLane=homeAt[0].has(k),goldLane=homeAt[1].has(k);
       const center=r>=6&&r<=8&&c>=6&&c<=8;
       const baseClass=redBase?" ludo-red-base":goldBase?" ludo-gold-base":neutralBase?" ludo-neutral-base":"";
       const cellClass="ludo-cell"+baseClass+(track!==undefined?" ludo-path":"")+(redLane?" ludo-red-lane":"")+(goldLane?" ludo-gold-lane":"")+(center?" ludo-center":"")+(track===0?" ludo-red-start":"")+(track===26?" ludo-gold-start":"");
       const pawns=pawnCells.get(k)||[];
       return <div key={k} className={cellClass}>
        {track!==undefined&&SAFE.has(track)?<span className="ludo-star" aria-hidden="true">★</span>:null}
        {r===7&&c===7?<span className="ludo-heart" aria-hidden="true">♥</span>:null}
        {pawns.length?<div className="ludo-cell-pawns">{pawns.map(item=><button type="button" key={item.seat+"-"+item.pawn} disabled={!item.active} onClick={()=>void act("move",item.pawn)} title={"Pion "+(item.pawn+1)+" de "+displayName(item.seat)} aria-label={"Pion "+(item.pawn+1)+" de "+displayName(item.seat)+(item.active?", déplacer":"")} className={"ludo-pawn ludo-pawn-"+(item.seat===0?"red":"gold")+(item.active?" can-move":"")}>{item.pawn+1}</button>)}</div>:null}
       </div>;
      })}
      <div className="ludo-yard ludo-yard-red" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-upper" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-lower" aria-hidden="true"/>
      <div className="ludo-yard ludo-yard-gold" aria-hidden="true"/>
      <div className="ludo-board-center" aria-hidden="true"><span>♥</span></div>
     </div>
     <div className="ludo-board-caption"><span><i className="ludo-caption-red"/> Rouge</span><span><i className="ludo-caption-gold"/> Jaune</span><span className="ludo-safe-key">✦ Cases protégées</span></div>
    </div>
    <div className="ludo-controls">
     {game.status==="won"?<div className="ludo-winner"><span>🏆</span><h2>{game.winner===mySeat?"Tu as gagné !":"Victoire de "+displayName(game.winner??0)+" !"}</h2><p>Les quatre pions ont atteint le centre.</p><button disabled={busy} onClick={()=>void act("restart")} type="button">Nouvelle partie ♥</button></div>:<>
      <div className={"ludo-turn-card"+(myTurn?" ludo-its-you":"")}>
       <div className="ludo-state"><span className="ludo-eyebrow">{myTurn?"C’EST TON TOUR":"AU TOUR DE TON AMOUR"}</span><h2>{myTurn?"À toi de jouer !":displayName(game.turn)}</h2><p>{game.dice!==null&&myTurn?"Choisis un pion lumineux.":game.dice!==null?"Ton partenaire choisit son pion.":myTurn?"Tente ta chance avec le dé !":"Le jeu se synchronise automatiquement."}</p></div>
       <div className="ludo-dice-row"><div className="ludo-dice-face" aria-label={game.dice?"Dé : "+game.dice:"Dé en attente"}>{game.dice?DIE[game.dice]:"⚄"}</div><button type="button" className="ludo-roll" disabled={!myTurn||busy||game.dice!==null} onClick={()=>void act("roll")}>{busy?"Un instant…":game.dice!==null?"Choisir un pion":myTurn?"Lancer le dé":"Patiente…"}</button></div>
      </div>
      <div className="ludo-pawn-actions"><strong>MES 4 PIONS <span>• Choisis un pion après le lancer</span></strong><div>{game.positions[mySeat].map((p,i)=><button key={i} type="button" disabled={!canPlay||!legal[i]} onClick={()=>void act("move",i)}><b>{i+1}</b><span>{labelPosition(p)}</span></button>)}</div></div>
     </>}
     <div className="ludo-log" role="status" aria-live="polite"><span aria-hidden="true">✦</span> {game.lastAction}</div>
     {error?<div role="alert" className="ludo-alert">{error}<button onClick={()=>void load()}>Réessayer</button></div>:null}
     <p className="ludo-rules">Un 6 pour sortir • Un 6 ou une capture = rejouer • Trois 6 à la suite = tour perdu • Arrivée avec le nombre exact. Les étoiles protègent les pions.</p>
    </div>
   </div>
  </>}
 </section>;
}
