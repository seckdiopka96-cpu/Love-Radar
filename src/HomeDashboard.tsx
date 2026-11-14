import {useEffect,useState} from "react";
import DiceFace from "./DiceFace";
import "./home-dashboard.css";
type Message={id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;created_at:number};
type Game={turn:number;status:"playing"|"won";winner:number|null;version:number;dice:number|null};
type Room={user:{id:string;name:string;seat:number};partner:string|null;code:string;partnerLastSeenAt?:number;messages:Message[]};
type Props={room:Room;token:string;media:Record<string,string>;onInvite:()=>void;onNavigate:(tab:"chat"|"ludo"|"memories")=>void};
export default function HomeDashboard({room,token,media,onInvite,onNavigate}:Props){
 const [game,setGame]=useState<Game|null>(null);
 useEffect(()=>{
  if(!room.partner)return;
  let alive=true;
  const refresh=async()=>{
   if(document.visibilityState!=="visible")return;
   try{
    const response=await fetch("/api/ludo",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok)return;
    const payload=await response.json() as {ok:boolean;game?:Game|null};
    if(alive&&payload.ok)setGame(payload.game||null);
   }catch{/* Keep the rest of the home page available if the game is offline. */}
  };
  void refresh();
  const timer=window.setInterval(()=>void refresh(),6500);
  return()=>{alive=false;window.clearInterval(timer)};
 },[token,room.partner]);
 const last=room.messages[room.messages.length-1];
 const photo=[...room.messages].reverse().find(m=>m.kind==="image");
 const latest=last?.kind==="text"?(last.content||""):last?.kind==="audio"?"🎤 Message vocal":last?.kind==="image"?"📸 Photo partagée":"Votre premier message vous attend";
 const from=last?(last.sender_id===room.user.id?"Toi":room.partner||"Ton partenaire"):"Votre conversation";
 const online=Boolean(room.partner&&room.partnerLastSeenAt&&Date.now()-room.partnerLastSeenAt<35000);
 const gameHeadline=game?.status==="won"?"Une partie terminée !":game?"Reprendre notre partie":"Jouons ensemble ?";
 const gameSub=game?.status==="won"?"Une nouvelle partie vous attend.":game?(game.turn===room.user.seat?"C’est à toi de jouer !":"C’est au tour de "+room.partner):"Un défi privé, juste vous deux.";
 return <div className="lr-home">
  <div className="lr-home-kicker">♡ VOTRE ESPACE À DEUX</div>
  <section className="lr-home-couple" aria-label="Votre couple">
   <div className="lr-home-avatar">{room.user.name.trim().charAt(0).toUpperCase()}</div>
   <div className="lr-home-heart" aria-hidden="true">♥</div>
   <div className="lr-home-avatar lr-home-avatar-other">{room.partner?.trim().charAt(0).toUpperCase()||"♡"}</div>
   <h1>{room.user.name} <span>&</span> {room.partner||"ton amour"}</h1>
   <p><span className={"lr-home-online"+(online?" is-online":"")}/>{!room.partner?"En attente de ton partenaire":online?"Ton amour est en ligne":"Votre espace privé, toujours connecté"}</p>
  </section>
  {!room.partner?<section className="lr-home-invite"><div><strong>Invite ton amour 💌</strong><p>Partage ce code pour vous retrouver ici.</p></div><code>{room.code}</code><button type="button" onClick={onInvite}>Partager l’invitation</button></section>:null}
  <button type="button" className="lr-home-game" onClick={()=>onNavigate("ludo")}>
   <div className="lr-home-game-copy"><span className="lr-home-card-label">✦ VOTRE JEU PRIVÉ</span><h2>{gameHeadline}</h2><p>{room.partner?gameSub:"Invite ton partenaire pour jouer à deux."}</p><span className="lr-home-game-cta">{game?"Jouer maintenant":"Découvrir le Ludo"} <b>→</b></span></div>
   <div className="lr-home-game-dice" aria-hidden="true"><DiceFace value={5} variant="pink" size="large"/><DiceFace value={3} variant="gold"/></div>
  </button>
  <div className="lr-home-tiles">
   <button type="button" className="lr-home-tile" onClick={()=>onNavigate("chat")}>
    <div className="lr-home-tile-top"><span className="lr-home-tile-icon">✉</span><span>MESSAGE</span></div>
    <h2>Notre conversation</h2>
    <p className="lr-home-from">{from}</p>
    <p className="lr-home-preview">{latest}</p>
    <span className="lr-home-open">Ouvrir la conversation →</span>
   </button>
   <button type="button" className="lr-home-tile lr-home-photo-tile" onClick={()=>onNavigate("memories")}>
    <div className="lr-home-tile-top"><span className="lr-home-tile-icon">✦</span><span>SOUVENIRS</span></div>
    <h2>Notre dernier souvenir</h2>
    {photo&&media[photo.id]?<img src={media[photo.id]} alt="Dernière photo partagée" className="lr-home-photo"/>:
      <div className="lr-home-no-photo"><span>♡</span><p>{photo?"Photo en chargement…":"Votre première photo ici"}</p></div>}
    <span className="lr-home-open">Voir nos souvenirs →</span>
   </button>
  </div>
  <p className="lr-home-credit">Créé avec ♡ par <a href="https://diao-tech.com" rel="noopener noreferrer" target="_blank" onClick={e=>e.stopPropagation()}>Diao-Tech.com</a></p>
 </div>;
}
