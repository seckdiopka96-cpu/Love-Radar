import {useEffect,useState} from "react";
import {apiFetch} from "./api";
import {quotePreview} from "./message-quote";
import "./home-dashboard.css";

type Message={id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;created_at:number;view_once?:number|boolean};
type Game={turn:number;status:"playing"|"won";winner:number|null;version:number;dice:number|null};
type DailyOverview={ok:boolean;question:string;mine:{text:string}|null;partnerAnswered:boolean;revealed:boolean};
type Reaction={message_id:string;member_id:string;emoji:string;updated_at:number;kind:"text"|"image"|"audio";content:string|null};
type Room={user:{id:string;name:string;seat:number};partner:string|null;code:string;partnerLastSeenAt?:number;messages:Message[];recentReaction?:Reaction|null;unreadCount?:number};
type Props={
 room:Room;token:string;media:Record<string,string>;privacyEnabled:boolean;plusActive:boolean;
 mineAvatar?:string;partnerAvatar?:string;onEditProfile:()=>void;onInvite:()=>void;
 onNavigate:(tab:"chat"|"ludo"|"memory"|"memories"|"moment"|"together"|"watch"|"reconcile"|"puzzle"|"story"|"reunion"|"games"|"plus")=>void;
};
export default function HomeDashboard({room,token,mineAvatar,partnerAvatar,onEditProfile,onInvite,onNavigate,plusActive}:Props){
 const [daily,setDaily]=useState<DailyOverview|null>(null);
 const [game,setGame]=useState<Game|null>(null);
 useEffect(()=>{
  let alive=true,pending=false;
  async function load(){
   if(!alive||pending||document.visibilityState!=="visible")return;
   pending=true;
   try{
    const res=await apiFetch("/api/moment",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const data=await res.json() as DailyOverview;
    if(alive&&res.ok&&data.ok)setDaily(previous=>previous&&JSON.stringify(previous)===JSON.stringify(data)?previous:data);
   }catch{/* The dashboard works without a daily answer. */}
   finally{pending=false}
  }
  void load();
  // The daily question changes once per day; no need to poll every 12 seconds.
  const timer=window.setInterval(()=>void load(),60000);
  const visible=()=>{if(document.visibilityState==="visible")void load()};
  document.addEventListener("visibilitychange",visible);
  return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[token]);
 useEffect(()=>{
  if(!room.partner)return;
  let alive=true,pending=false;
  async function load(){
   if(!alive||pending||document.visibilityState!=="visible")return;
   pending=true;
   try{
    const response=await apiFetch("/api/ludo",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const data=await response.json() as {ok:boolean;game?:Game|null};
    if(alive&&response.ok&&data.ok)setGame(previous=>JSON.stringify(previous)===JSON.stringify(data.game||null)?previous:data.game||null);
   }catch{/* Game status is supplemental. */}
   finally{pending=false}
  }
  void load();
  const timer=window.setInterval(()=>void load(),30000);
  const visible=()=>{if(document.visibilityState==="visible")void load()};
  document.addEventListener("visibilitychange",visible);
  return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[token,room.partner]);
 const last=room.messages[room.messages.length-1];
 const reaction=room.recentReaction;
 const reactionIsLatest=Boolean(reaction&&(!last||reaction.updated_at>=last.created_at));
 const reactionAuthor=reaction?.member_id===room.user.id?"Vous":room.partner||"Ton partenaire";
 const reactionPreview=reaction?(reaction?.member_id===room.user.id?"Vous avez réagi par ":reactionAuthor+" a réagi par ")+reaction.emoji+" à «"+quotePreview(reaction.kind,reaction.content,54)+"»":"";
 const latest=reactionIsLatest?reactionPreview:last?.kind==="text"?quotePreview("text",last.content,85):last?.kind==="audio"?"🎤 Message vocal":last?.kind==="image"?"📸 Photo partagée":"Votre premier message vous attend";
 const from=reactionIsLatest?(reaction?.member_id===room.user.id?"Toi":room.partner||"Ton partenaire"):last?(last.sender_id===room.user.id?"Toi":room.partner||"Ton partenaire"):"Votre conversation";
 const online=Boolean(room.partner&&room.partnerLastSeenAt&&Date.now()-room.partnerLastSeenAt<35000);
 const firstName=room.user.name.trim().split(/\s+/)[0]||room.user.name;
 return <div className="lr-home lr-home-compact">
  <div className="lr-home-welcome">
   <div><span className="lr-home-kicker">VOTRE ESPACE À DEUX</span><h2>Bonjour, <em>{firstName}.</em></h2><p>Un petit univers rien qu’à vous.</p></div>
  </div>
  <section className="lr-home-couple" aria-label="Votre couple">
   <div className="lr-home-couple-avatars">
    <button type="button" className="lr-home-avatar lr-home-photo-profile" onClick={onEditProfile} aria-label="Modifier ma photo de profil">{mineAvatar?<img src={mineAvatar} alt="Ma photo de profil"/>:room.user.name.trim().charAt(0).toUpperCase()}</button>
    <span className="lr-home-heart" aria-hidden="true">♥</span>
    <div className="lr-home-avatar lr-home-avatar-other">{partnerAvatar?<img src={partnerAvatar} alt={"Photo de "+(room.partner||"ton partenaire")}/>:room.partner?.trim().charAt(0).toUpperCase()||"♡"}</div>
   </div>
   <div className="lr-home-couple-label"><h1>{room.user.name} <span>&</span> {room.partner||"ton amour"}</h1>
    <p><span className={"lr-home-online"+(online?" is-online":"")}/>{!room.partner?"En attente de ton partenaire":online?"En ligne":"Votre espace privé"}</p></div>
  </section>
    <div className="lr-home-quick" aria-label="Accès rapides">
   <button type="button" onClick={()=>onNavigate("chat")}><span className="lr-home-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></span><span><strong>Écrire</strong><small>Un petit mot</small></span><b>↗</b></button>
   <button type="button" onClick={()=>onNavigate("watch")}><span className="lr-home-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none"/></svg></span><span><strong>Regarder</strong><small>À deux</small></span><b>↗</b></button>
   <button type="button" onClick={()=>onNavigate("reconcile")}><span className="lr-home-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v4a5 5 0 0 0 10 0v-4"/><path d="M5 10V9a7 7 0 0 1 14 0v1M5 10H3v5h4v-5Zm14 0h2v5h-4v-5Z"/><path d="M15 20h-2"/></svg></span><span><strong>S’écouter</strong><small>Se comprendre</small></span><b>↗</b></button>
  </div>
  <section className="lr-plus-invite" aria-label="Love Radar Plus">
   <div><strong>{plusActive?"✦ Vos avantages Love Radar Plus":"✦ Découvrez Love Radar Plus"}</strong>
    <small>{plusActive?"Thèmes, défis et livre souvenir disponibles.":"3,99 $/mois par couple · votre messagerie reste gratuite."}</small></div>
   <button type="button" onClick={()=>onNavigate("plus")}>{plusActive?"Mes avantages":"Découvrir Plus"}</button>
  </section>
  {!room.partner?<section className="lr-home-invite"><div><strong>Invite ton amour 💌</strong><p>Partage ton code pour vous retrouver.</p></div><button type="button" onClick={onInvite}>Partager l’invitation</button></section>:null}
  <div className="lr-home-section-heading"><span>À NE PAS MANQUER</span><small>Vos dernières activités</small></div>
  <div className="lr-home-essentials">
   <button type="button" className="lr-home-conversation" onClick={()=>onNavigate("chat")}>
    <span className="lr-home-essential-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a7.8 7.8 0 0 1-8 7.7 8.3 8.3 0 0 1-3.5-.8L4 20l1.4-4.2A7.6 7.6 0 0 1 4 11.5 7.8 7.8 0 0 1 12 4a7.8 7.8 0 0 1 8 7.5Z"/><path d="M8.5 11.7h7M8.5 14.5h4.5"/></svg></span>
    <span className="lr-home-essential-copy"><strong>Notre conversation</strong><small>{from} · {latest}</small></span>
    {Number(room.unreadCount||0)>0?<b className="lr-home-unread">{Math.min(99,Number(room.unreadCount))}{Number(room.unreadCount)>99?"+":""}</b>:<span className="lr-home-essential-arrow" aria-hidden="true">›</span>}
   </button>
   <button type="button" className="lr-home-daily" onClick={()=>onNavigate("moment")}>
    <span className="lr-home-daily-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2.7" y="5.5" width="18.6" height="14" rx="3"/><path d="m3.8 7.6 8.2 6 8.2-6"/><path d="M12 4.2c-.8-1.5-3.7-1.3-3.7.9 0 1.3 1.4 2.1 3.7 3.6 2.3-1.5 3.7-2.3 3.7-3.6 0-2.2-2.9-2.4-3.7-.9Z" fill="currentColor" stroke="none"/></svg></span>
    <span className="lr-home-daily-content"><strong>Notre moment du jour</strong><span>{daily?.revealed?"Découvrir vos réponses":daily?.partnerAnswered&&!daily?.mine?"Ton amour a répondu, à toi !":daily?.mine?"Réponse envoyée · en attente":"Une question pour vous rapprocher"}</span></span>
    <span className="lr-home-daily-arrow" aria-hidden="true">›</span>
   </button>
   {game&&room.partner?<button type="button" className="lr-home-resume" onClick={()=>onNavigate("ludo")}>
    <span className="lr-home-essential-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.4" cy="8.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.6" cy="8.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.4" cy="15.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.6" cy="15.6" r="1.2" fill="currentColor" stroke="none"/></svg></span>
    <span className="lr-home-essential-copy"><strong>{game.status==="won"?"Rejouer au Ludo":"Reprendre notre partie"}</strong><small>{game.status==="won"?"Une nouvelle partie vous attend":game.turn===room.user.seat?"C’est à toi de jouer":"À "+room.partner+" de jouer"}</small></span>
    <span className="lr-home-essential-arrow" aria-hidden="true">›</span>
   </button>:null}
  </div>
  <p className="lr-home-compact-footer">Les autres activités sont dans <button type="button" onClick={()=>onNavigate("together")}>Nous deux</button>, <button type="button" onClick={()=>onNavigate("games")}>Jeux</button> et <button type="button" onClick={()=>onNavigate("memories")}>Souvenirs</button>.</p>
  <div className="lr-home-made-by">Créé par <strong>Diao-Tech.com</strong></div>
 </div>;
}
