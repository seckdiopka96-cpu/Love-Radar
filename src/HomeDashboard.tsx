import {apiFetch} from "./api";
import {useEffect,useState} from "react";
import DiceFace from "./DiceFace";
import {quotePreview} from "./message-quote";
import {daysTo,type StoryData} from "./story-dates";
import "./home-dashboard.css";
type Message={id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;created_at:number;view_once?:number|boolean};
type Game={turn:number;status:"playing"|"won";winner:number|null;version:number;dice:number|null};
type DailyOverview={ok:boolean;question:string;mine:{text:string}|null;partnerAnswered:boolean;revealed:boolean};
type Reaction={message_id:string;member_id:string;emoji:string;updated_at:number;kind:"text"|"image"|"audio";content:string|null};
type Room={user:{id:string;name:string;seat:number};partner:string|null;code:string;partnerLastSeenAt?:number;messages:Message[];recentReaction?:Reaction|null};
type Props={room:Room;token:string;media:Record<string,string>;privacyEnabled:boolean;mineAvatar?:string;partnerAvatar?:string;onEditProfile:()=>void;onInvite:()=>void;onNavigate:(tab:"chat"|"ludo"|"memory"|"memories"|"moment"|"together"|"watch"|"reconcile"|"puzzle"|"story"|"reunion")=>void};
export default function HomeDashboard({room,token,media,privacyEnabled,mineAvatar,partnerAvatar,onEditProfile,onInvite,onNavigate}:Props){
 const [game,setGame]=useState<Game|null>(null);
 const [daily,setDaily]=useState<DailyOverview|null>(null);
 const [story,setStory]=useState<StoryData|null>(null);
 useEffect(()=>{
  let alive=true,pending=false;
  async function refresh(){
   if(!alive||pending||document.visibilityState!=="visible")return;
   pending=true;
   try{
    const res=await apiFetch("/api/story",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const data=await res.json() as StoryData;
    if(alive&&res.ok&&data.ok)setStory(previous=>previous&&JSON.stringify(previous)===JSON.stringify(data)?previous:data);
   }catch{/* Keep the home page usable if story data is temporarily unavailable. */}
   finally{pending=false}
  }
  void refresh();
  const interval=window.setInterval(()=>void refresh(),20000);
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{alive=false;window.clearInterval(interval);document.removeEventListener("visibilitychange",onVisible)};
 },[token]);
 useEffect(()=>{
  let active=true,pending=false;
  async function checkDaily(){
   if(!active||pending||document.visibilityState==="hidden")return;
   pending=true;
   try{
    const res=await apiFetch("/api/moment",{headers:{"Authorization":"Bearer "+token},cache:"no-store"});
    const data=await res.json() as DailyOverview;
    if(active&&res.ok&&data.ok)setDaily(previous=>previous&&JSON.stringify(previous)===JSON.stringify(data)?previous:data);
   }catch{/* The daily card should never block the home page. */}
   finally{pending=false}
  }
  void checkDaily();
  const timer=window.setInterval(()=>void checkDaily(),12000);
  const visible=()=>{if(document.visibilityState==="visible")void checkDaily()};
  document.addEventListener("visibilitychange",visible);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[token]);
 useEffect(()=>{
  if(!room.partner)return;
  let alive=true,pending=false;
  const refresh=async()=>{
   if(!alive||pending||document.visibilityState!=="visible")return;
   pending=true;
   try{
    const response=await apiFetch("/api/ludo",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok)return;
    const payload=await response.json() as {ok:boolean;game?:Game|null};
    if(alive&&payload.ok)setGame(previous=>JSON.stringify(previous)===JSON.stringify(payload.game||null)?previous:payload.game||null);
   }catch{/* Keep the rest of the home page available if the game is offline. */}
   finally{pending=false}
  };
  void refresh();
  const timer=window.setInterval(()=>void refresh(),6500);
  return()=>{alive=false;window.clearInterval(timer)};
 },[token,room.partner]);
 const last=room.messages[room.messages.length-1];
 const photo=[...room.messages].reverse().find(m=>m.kind==="image"&&!m.view_once);
 const reaction=room.recentReaction;
 const reactionIsLatest=Boolean(reaction&&(!last||reaction.updated_at>=last.created_at));
 const reactionAuthor=reaction?.member_id===room.user.id?"Vous":room.partner||"Ton partenaire";
 const reactionPreview=reaction?(reaction?.member_id===room.user.id?"Vous avez réagi par ":reactionAuthor+" a réagi par ")+reaction.emoji+" à «"+quotePreview(reaction.kind,reaction.content,65)+"»":"";
 const latest=reactionIsLatest?reactionPreview:last?.kind==="text"?quotePreview("text",last.content,95):last?.kind==="audio"?(last.view_once?"Média temporaire ancien":"🎤 Message vocal"):last?.kind==="image"?(last.view_once?"Média temporaire ancien":"📸 Photo partagée"):"Votre premier message vous attend";
 const from=reactionIsLatest?(reaction?.member_id===room.user.id?"Toi":room.partner||"Ton partenaire"):last?(last.sender_id===room.user.id?"Toi":room.partner||"Ton partenaire"):"Votre conversation";
 const online=Boolean(room.partner&&room.partnerLastSeenAt&&Date.now()-room.partnerLastSeenAt<35000);
 const gameHeadline=game?.status==="won"?"Une partie terminée !":game?"Reprendre notre partie":"Jouons ensemble ?";
 const gameSub=game?.status==="won"?"Une nouvelle partie vous attend.":game?(game.turn===room.user.seat?"C’est à toi de jouer !":"C’est au tour de "+room.partner):"Un défi privé, juste vous deux.";
 return <div className="lr-home">
  <div className="lr-home-welcome">
   <div><span className="lr-home-kicker">VOTRE UNIVERS</span><h2>Bienvenue, <em>{room.user.name}.</em> <span>♡</span></h2><p>Votre petite bulle de bonheur, chaque jour.</p></div>
   <div className="lr-home-welcome-date">{new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date())}</div>
  </div>
  <section className="lr-home-couple" aria-label="Votre couple">
   <button type="button" className="lr-home-avatar lr-home-photo-profile" onClick={onEditProfile} aria-label="Ajouter ou modifier ma photo de profil" title="Modifier ma photo">{mineAvatar?<img src={mineAvatar} alt="Ma photo de profil"/>:room.user.name.trim().charAt(0).toUpperCase()}</button>
   <div className="lr-home-heart" aria-hidden="true">♥</div>
   <div className="lr-home-avatar lr-home-avatar-other">{partnerAvatar?<img src={partnerAvatar} alt={"Photo de "+(room.partner||"ton partenaire")}/>:room.partner?.trim().charAt(0).toUpperCase()||"♡"}</div>
   <h1>{room.user.name} <span>&</span> {room.partner||"ton amour"}</h1>
   <p><span className={"lr-home-online"+(online?" is-online":"")}/>{!room.partner?"En attente de ton partenaire":online?"Ton amour est en ligne":"Votre espace privé, toujours connecté"}</p>
  </section>
  <div className="lr-home-quick" aria-label="Accès rapides">
   <button type="button" onClick={()=>onNavigate("chat")}><span className="lr-home-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></span><span><strong>Écrire</strong><small>Un petit mot</small></span><b>↗</b></button>
   <button type="button" onClick={()=>onNavigate("watch")}><span className="lr-home-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4Z" fill="currentColor" stroke="none"/></svg></span><span><strong>Regarder</strong><small>À deux</small></span><b>↗</b></button>
   <button type="button" onClick={()=>onNavigate("reconcile")}><span className="lr-home-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v4a5 5 0 0 0 10 0v-4"/><path d="M5 10V9a7 7 0 0 1 14 0v1M5 10H3v5h4v-5Zm14 0h2v5h-4v-5Z"/><path d="M15 20h-2"/></svg></span><span><strong>S’écouter</strong><small>Se comprendre</small></span><b>↗</b></button>
  </div>
  {!room.partner?<section className="lr-home-invite"><div><strong>Invite ton amour 💌</strong><p>Partage ce code pour vous retrouver ici.</p></div><code>{room.code}</code><button type="button" onClick={onInvite}>Partager l’invitation</button></section>:null}
  <div className="lr-home-section-heading"><span>VOTRE HISTOIRE</span><small>Les instants qui comptent</small></div>
  <div className="lr-home-our-story">
   <button type="button" onClick={()=>onNavigate("story")}>
    <span className="lr-home-our-symbol" aria-hidden="true">💑</span>
    <span><strong>Notre histoire</strong><small>{story?.profile.meetingDate?Math.max(0,-daysTo(story.profile.meetingDate))+" jours ensemble ❤️":"Notre photo et nos plus beaux souvenirs."}</small></span>
    <b aria-hidden="true">↗</b>
   </button>
   <button type="button" onClick={()=>onNavigate("reunion")}>
    <span className="lr-home-our-symbol" aria-hidden="true">📅</span>
    <span><strong>Nos retrouvailles</strong><small>{story?.profile.reunionDate?(daysTo(story.profile.reunionDate)>0?"J-"+daysTo(story.profile.reunionDate)+" avant de se revoir 💗":daysTo(story.profile.reunionDate)===0?"C'est aujourd'hui ! ❤️":"Choisissons notre prochaine date."): "Un compte à rebours rien qu'à nous."}</small></span>
    <b aria-hidden="true">↗</b>
   </button>
  </div>
  <div className="lr-home-section-heading"><span>UN MOMENT POUR VOUS</span><small>Un rendez-vous quotidien</small></div>
  <button type="button" className="lr-home-daily" onClick={()=>onNavigate("moment")}>
   <span className="lr-home-daily-kicker">✦ NOTRE RENDEZ-VOUS QUOTIDIEN</span>
   <span className="lr-home-daily-line">
    <span className="lr-home-daily-icon" aria-hidden="true">💌</span>
    <span className="lr-home-daily-content">
     <strong>Notre moment du jour</strong>
     <span>{daily?.revealed?"Vos deux réponses sont révélées ! 💞":daily?.partnerAnswered&&!daily?.mine?"Ton amour a répondu. À toi ! 💗":daily?.mine?"Ta réponse est enregistrée. En attente de ton amour…":"Une question pour deux, un moment rien qu’à vous."}</span>
    </span>
    <span className="lr-home-daily-arrow" aria-hidden="true">↗</span>
   </span>
   {daily?.question?<span className="lr-home-daily-question">« {daily.question} »</span>:null}
   <span className="lr-home-daily-cta">{daily?.revealed?"Découvrir nos réponses":daily?.mine?"Voir notre moment":"Découvrir la question"} →</span>
  </button>
  <div className="lr-home-section-heading"><span>VIVRE ENSEMBLE</span><small>Des attentions et des jeux</small></div>
  <div className="lr-home-together">
   <button type="button" onClick={()=>onNavigate("together")} className="lr-together-miss-card">
    <span className="lr-together-icon">💗</span><strong>Tu me manques</strong><small>Un cœur pour ton amour, où qu’il soit.</small><b>Envoyer un cœur →</b>
   </button>
   <button type="button" onClick={()=>onNavigate("puzzle")} className="lr-together-puzzle-card">
    <span className="lr-together-icon">🧩</span><strong>Puzzle à deux</strong><small>Reconstituez une image de 9 pièces ensemble.</small><b>Jouer au puzzle →</b>
   </button>
  </div>
  <button type="button" className="lr-home-game" onClick={()=>onNavigate("ludo")}>
   <div className="lr-home-game-copy"><span className="lr-home-card-label">✦ VOTRE JEU PRIVÉ</span><h2>{gameHeadline}</h2><p>{room.partner?gameSub:"Invite ton partenaire pour jouer à deux."}</p><span className="lr-home-game-cta">{game?"Jouer maintenant":"Découvrir le Ludo"} <b>→</b></span></div>
   <div className="lr-home-game-dice" aria-hidden="true"><DiceFace value={5} variant="pink" size="large"/><DiceFace value={3} variant="gold"/></div>
  </button>
  <button type="button" className="lr-home-memory" onClick={()=>onNavigate("memory")}>
   <span className="lr-home-memory-icons" aria-hidden="true">🃏 ♡ 🌹 💌</span>
   <span className="lr-home-memory-copy"><small>NOUVEAU · À DEUX EN LIGNE</small><strong>Memory Love 💞</strong><span>Retrouve les paires avec ton amour, même à distance. 30 s par tour.</span><b>Jouer à Memory Love →</b></span>
  </button>
  <div className="lr-home-section-heading"><span>RESTER CONNECTÉS</span><small>Vos échanges privés</small></div>
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
    {photo&&media[photo.id]?(privacyEnabled?<div className="lr-home-private-photo"><span aria-hidden="true">🔒</span><strong>Photo privée</strong><small>Ouvre Souvenirs pour l'afficher</small></div>:<img src={media[photo.id]} alt="Dernière photo partagée" className="lr-home-photo"/>):
      <div className="lr-home-no-photo"><span>♡</span><p>{photo?"Photo en chargement…":"Votre première photo ici"}</p></div>}
    <span className="lr-home-open">Voir nos souvenirs →</span>
   </button>
  </div>
  <p className="lr-home-credit">Créé avec ♡ par <a href="https://diao-tech.com" rel="noopener noreferrer" target="_blank" onClick={e=>e.stopPropagation()}>Diao-Tech.com</a></p>
 </div>;
}
