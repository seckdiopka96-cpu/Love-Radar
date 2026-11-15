import {apiFetch,isNativeApp,publicInviteUrl} from "./api";
import {setNativePrivacy} from "./native-privacy";
import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import "./love-radar.css";
import VoiceCall from "./VoiceCall";
import Ludo from "./Ludo";
import SoloLudo from "./SoloLudo";
import SenegalLudo from "./SenegalLudo";
import MemoryLove from "./MemoryLove";
import DailyMoment from "./DailyMoment";
import Together from "./Together";
import WatchTogether from "./WatchTogether";
import TikTokTogether from "./TikTokTogether";
import SharedPuzzle from "./SharedPuzzle";
import Reconcile from "./Reconcile";
import HomeDashboard from "./HomeDashboard";
import GamesHub from "./GamesHub";
import CoupleStory from "./CoupleStory";
import PrivatePhoto from "./PrivatePhoto";
import VoiceMessage from "./VoiceMessage";
import OneTimeMedia from "./OneTimeMedia";
import ChatActivity from "./ChatActivity";
import QuoteCard from "./QuoteCard";
import {quoteAuthor,type QuoteKind} from "./message-quote";
import {mergeOptimisticMessages,shouldKeepVoiceDraft,type AudioOutboxStatus} from "./voice-outbox";
import "./redesign.css";
import "./redesign-features.css";
import "./chat-stability.css";
import "./voice-message.css";
import "./immersive-chat.css";
import "./message-replies.css";
import "./message-actions.css";
import "./photo-reliability.css";

type AndroidInstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type Tab = "home" | "together" | "watch" | "watch-tiktok" | "puzzle" | "reconcile" | "moment" | "reunion" | "games" | "ludo" | "ludo-solo" | "ludo-senegal" | "ludo-senegal-solo" | "memory" | "chat" | "memories" | "story";
type Message = {id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;object_key:string|null;mime:string|null;created_at:number;
 reply_to_id?:string|null;reply_kind?:QuoteKind|null;reply_content?:string|null;reply_sender_id?:string|null;
 edited_at?:number;reactions?:{member_id:string;emoji:string}[];view_once?:number|boolean;once_opened_at?:number};
type RecentReaction={message_id:string;member_id:string;emoji:string;updated_at:number;kind:"text"|"image"|"audio";content:string|null};
type Room = {recentReaction?:RecentReaction|null;user:{id:string;name:string;seat:number;owner:boolean};code:string;roomId:string;partner:string|null;members:number;messages:Message[];unreadCount?:number;partnerReadAt?:number;partnerTypingUntil?:number;partnerRecordingUntil?:number;partnerLastSeenAt?:number};
type Result = {ok:boolean;error?:string;token?:string;code?:string}&Partial<Room>;
type LocalVoice={id:string;created_at:number;file:File;status:AudioOutboxStatus;view_once:boolean;error?:string};


const NAV: {id:Tab;label:string}[] = [
 {id:"home",label:"Accueil"},
 {id:"chat",label:"Messages"},
 {id:"together",label:"Nous deux"},
 {id:"games",label:"Jeux"},
 {id:"memories",label:"Souvenirs"},
];
function NavGlyph({tab}:{tab:Tab}){
 return <svg className="lr-nav-glyph" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {tab==="home"?<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-7h6v7"/></>:
   tab==="chat"?<><path d="M21 11.6a8.6 8.6 0 0 1-8.6 8.6 9.6 9.6 0 0 1-3.7-.8L3 21l1.5-5.2A8.6 8.6 0 1 1 21 11.6Z"/><path d="M8 11h8M8 14.6h5.3"/></>:
   tab==="together"?<><path d="M20.2 5.8a5.4 5.4 0 0 0-7.7 0l-.5.5-.5-.5a5.4 5.4 0 0 0-7.7 7.7L12 21.2l8.2-7.7a5.4 5.4 0 0 0 0-7.7Z"/></>:
   tab==="games"?<><rect x="3" y="8" width="18" height="12" rx="5"/><path d="M8 11v6M5 14h6M16.7 12.7h.01M18.5 15.5h.01"/></>:
   <><rect x="3" y="3.5" width="18" height="17" rx="3"/><path d="m7 15 3.2-3.3 2.3 2.2 2.8-3.3L19 15"/><circle cx="8" cy="8.2" r="1.2"/></>}
 </svg>;
}
function selectedNav(tab:Tab):Tab {
 if(tab==="moment"||tab==="puzzle"||tab==="reconcile"||tab==="reunion"||tab==="watch"||tab==="watch-tiktok")return "together";
 if(tab==="story")return "memories";
 if(tab==="ludo"||tab==="ludo-solo"||tab==="ludo-senegal"||tab==="ludo-senegal-solo"||tab==="memory")return "games";
 return tab;
}
const HEARTS = ["♡","♥","✦","♡","♥"];
const CHAT_REACTIONS=["👍","❤️","😂","😮","😢","🙏","👏"];

type NoticeKind="message"|"photo"|"audio"|"call"|"ludo-challenge"|"memory-challenge"|"daily-question"|"love-signal";
type NoticeTarget={tab:Tab;kind:NoticeKind|null;id:string|null};
const NOTICE_KINDS=new Set(["message","photo","audio","call","ludo-challenge","memory-challenge","daily-question","love-signal"]);
function parseNotice(search:string):NoticeTarget|null{
 const q=new URLSearchParams(search);
 const tab=q.get("tab");
 if(tab==="location")return {tab:"together",kind:null,id:null};
 if(tab!=="home"&&tab!=="moment"&&tab!=="together"&&tab!=="watch"&&tab!=="watch-tiktok"&&tab!=="puzzle"&&tab!=="reconcile"&&tab!=="reunion"&&tab!=="story"&&tab!=="chat"&&tab!=="games"&&tab!=="ludo"&&tab!=="ludo-solo"&&tab!=="ludo-senegal"&&tab!=="ludo-senegal-solo"&&tab!=="memory"&&tab!=="memories")return null;
 const kind=q.get("kind"),id=q.get("id");
 if(!kind||!NOTICE_KINDS.has(kind)||!id||!(/^[0-9a-f-]{36}$/i.test(id)||(kind==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(id))))return {tab,kind:null,id:null};
 return {tab:kind==="ludo-challenge"?"ludo":kind==="memory-challenge"?"memory":kind==="daily-question"?"moment":kind==="love-signal"?"together":"chat",kind:kind as NoticeKind,id};
}
function noticeUrl(target:NoticeTarget){
 const q=new URLSearchParams({tab:target.tab});
 if(target.kind&&target.id){q.set("kind",target.kind);q.set("id",target.id)}
 return "/?"+q.toString();
}

function Initials({name,size="normal"}:{name:string;size?:"normal"|"small"}) {
 return <div className={"lr-avatar "+(size==="small"?"lr-avatar-sm":"")}>{name.trim().slice(0,1).toUpperCase()||"♡"}</div>;
}
export default function LoveRadar(){
 const [token,setToken]=useState("");
 const [room,setRoom]=useState<Room|null>(null);
 const [initializing,setInitializing]=useState(true);
 const [joinMode,setJoinMode]=useState(false);
 const [name,setName]=useState("");
 const [code,setCode]=useState("");
 const [tab,setTab]=useState<Tab>(()=>parseNotice(window.location.search)?.tab||"home");
 const currentTab=useRef(tab);
 currentTab.current=tab;
 const chatReturnTab=useRef<Tab>("home");
 const [noticeTarget,setNoticeTarget]=useState<NoticeTarget|null>(()=>parseNotice(window.location.search));
 const [focusMessage,setFocusMessage]=useState<Message|null>(null);
 const [focusLoading,setFocusLoading]=useState(false);
 const [focusError,setFocusError]=useState("");
 const [focusMedia,setFocusMedia]=useState("");
 const focusAsset=useRef("");
 function closeNotice(){
  setNoticeTarget(null);
  setFocusMessage(null);
  setFocusError("");
  if(focusAsset.current){URL.revokeObjectURL(focusAsset.current);focusAsset.current="";setFocusMedia("")}
  const url=new URL(window.location.href);
  url.searchParams.delete("kind");url.searchParams.delete("id");
  window.history.replaceState(null,"",url.pathname+(url.search||""));
 }
 function navigate(tab:Tab){
  if(tab==="chat"&&currentTab.current!=="chat")chatReturnTab.current=currentTab.current;
  closeNotice();
  setOnceTarget(null);
  setTab(tab);
  if(tab==="watch"||tab==="watch-tiktok")setWatchInvite(null);
  if(tab==="reconcile")setReconcileInvite(false);
  const url=new URL(window.location.href);
  url.searchParams.set("tab",tab);
  url.searchParams.delete("kind");url.searchParams.delete("id");url.searchParams.delete("mode");
  window.history.replaceState(null,"",url.pathname+url.search);
  firstPoll.current=true;
 }
 const [draft,setDraft]=useState("");
 const [viewOnce,setViewOnce]=useState(false);
 const [onceTarget,setOnceTarget]=useState<Message|null>(null);
 const viewOnceRecording=useRef(false);
 const [replyTarget,setReplyTarget]=useState<Message|null>(null);
 const [actionMessageId,setActionMessageId]=useState<string|null>(null);
 const [infoMessageId,setInfoMessageId]=useState<string|null>(null);
 const [editTarget,setEditTarget]=useState<Message|null>(null);
 const composerBeforeEdit=useRef<{draft:string;reply:Message|null}|null>(null);
 const chatInput=useRef<HTMLInputElement|null>(null);
 const swipe=useRef<{id:string;x:number;y:number;cancelled:boolean;held:boolean;timer:number|null}|null>(null);
 const suppressHeldClickUntil=useRef(0);
 const [chatFocused,setChatFocused]=useState(false);
 const [chatAtBottom,setChatAtBottom]=useState(true);
 const chatAtBottomRef=useRef(true);
 const [partnerActivity,setPartnerActivity]=useState<{partnerTypingUntil:number;partnerRecordingUntil:number;partnerLastSeenAt:number}|null>(null);
 const chatScroller=useRef<HTMLDivElement|null>(null);
 const snapshotStarted=useRef(0);
 const snapshotApplied=useRef(0);
 const scrollFrame=useRef<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [media,setMedia]=useState<Record<string,string>>({});
 const [mediaErrors,setMediaErrors]=useState<Record<string,string>>({});
 const mediaRetries=useRef<Record<string,number>>({});
 const mediaFailures=useRef<Record<string,number>>({});
 const [voiceOutbox,setVoiceOutbox]=useState<LocalVoice[]>([]);
 const sendingVoiceIds=useRef(new Set<string>());
 const chatMessages=mergeOptimisticMessages(room?.messages||[],voiceOutbox.map(entry=>({
  id:entry.id,sender_id:room?.user.id||"",kind:"audio" as const,
  content:null,object_key:entry.id,mime:entry.file.type,created_at:entry.created_at,view_once:entry.view_once?1:0
 })));
 const actionMessage=chatMessages.find(m=>m.id===actionMessageId)||null;
 const infoMessage=chatMessages.find(m=>m.id===infoMessageId)||null;
 const [recording,setRecording]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null);
 const recordingStream=useRef<MediaStream|null>(null);
 const recordingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const mediaCache=useRef<Record<string,string>>({});
 const tail=useRef<HTMLDivElement|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const firstPoll=useRef(true);
 const lastReadSent=useRef(0);
 useEffect(()=>{lastReadSent.current=0},[token]);
 useEffect(()=>()=>{if(swipe.current?.timer!==null&&swipe.current?.timer!==undefined)clearTimeout(swipe.current.timer)},[]);
 const lastTypingSent=useRef(0);
 const typingActive=useRef(false);
 const recordingActive=useRef(false);
 const discardRecording=useRef(false);
 useEffect(()=>{
  const viewport=window.visualViewport;
  const sync=()=>{
   document.documentElement.style.setProperty("--lr-visible-height",Math.round(viewport?.height||window.innerHeight)+"px");
   document.documentElement.style.setProperty("--lr-visible-top",Math.round(viewport?.offsetTop||0)+"px");
  };
  const syncWithChat=()=>{
   sync();
   if(document.activeElement?.matches(".lr-chat-form input[type=text]")){
    window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
     if(chatScroller.current)chatScroller.current.scrollTop=chatScroller.current.scrollHeight;
    }));
   }
  };
  syncWithChat();viewport?.addEventListener("resize",syncWithChat);viewport?.addEventListener("scroll",sync);
  window.addEventListener("resize",syncWithChat);
  return()=>{
   viewport?.removeEventListener("resize",syncWithChat);viewport?.removeEventListener("scroll",sync);
   window.removeEventListener("resize",syncWithChat);
   document.documentElement.style.removeProperty("--lr-visible-height");
   document.documentElement.style.removeProperty("--lr-visible-top");
  };
 },[]);
 useEffect(()=>{
  if(!chatFocused)return;
  const before=document.documentElement.style.overflow;
  document.documentElement.style.overflow="hidden";
  return()=>{document.documentElement.style.overflow=before};
 },[chatFocused]);
 useEffect(()=>{
  if(tab!=="chat"||!room)return;
  const oldBody=document.body.style.overflow;
  const oldRoot=document.documentElement.style.overflow;
  window.scrollTo(0,0);
  document.body.style.overflow="hidden";
  document.documentElement.style.overflow="hidden";
  return()=>{document.body.style.overflow=oldBody;document.documentElement.style.overflow=oldRoot};
 },[tab,!!room]);
 useEffect(()=>{
  if(!room)return;
  const stopGesture=(e:Event)=>e.preventDefault();
  const stopMultitouch=(e:TouchEvent)=>{if(e.touches.length>1)e.preventDefault()};
  document.addEventListener("gesturestart",stopGesture,{passive:false});
  document.addEventListener("gesturechange",stopGesture,{passive:false});
  document.addEventListener("touchmove",stopMultitouch,{passive:false});
  return()=>{
   document.removeEventListener("gesturestart",stopGesture);
   document.removeEventListener("gesturechange",stopGesture);
   document.removeEventListener("touchmove",stopMultitouch);
  };
 },[!!room]);
 const [menu,setMenu]=useState(false);
 const [privacyEnabled,setPrivacyEnabled]=useState(()=>{
  try{return localStorage.getItem("love-radar-privacy-mode")!=="off"}catch{return true}
 });
 function updatePrivacy(enabled:boolean){
  setPrivacyEnabled(enabled);
  try{localStorage.setItem("love-radar-privacy-mode",enabled?"on":"off")}catch{/* Device preference may not persist in private browsing. */}
  void setNativePrivacy(enabled);
 }
 const [notificationsOn,setNotificationsOn]=useState(false);
 const [notificationsBusy,setNotificationsBusy]=useState(false);
 const [notificationsHint,setNotificationsHint]=useState("");
 const [watchInvite,setWatchInvite]=useState<"watch"|"watch-tiktok"|null>(null);
 const [reconcileInvite,setReconcileInvite]=useState(false);
 const [notificationsTesting,setNotificationsTesting]=useState(false);
 const pushOperation=useRef(false),pushDisabled=useRef(false);
 const [canInstall,setCanInstall]=useState(false);
 const [showInstallHelp,setShowInstallHelp]=useState(false);
 const pendingInstall=useRef<AndroidInstallEvent|null>(null);
 useEffect(()=>{
  const standalone=window.matchMedia("(display-mode: standalone)").matches;
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const appleStandalone=(navigator as Navigator & {standalone?:boolean}).standalone===true;
  if(isMobile&&!standalone&&!appleStandalone)setCanInstall(true);
  const onPrompt=(event:Event)=>{
   event.preventDefault();
   pendingInstall.current=event as AndroidInstallEvent;
   setCanInstall(true);
  };
  const onInstalled=()=>{
   pendingInstall.current=null;
   setShowInstallHelp(false);
   setCanInstall(false);
  };
  window.addEventListener("beforeinstallprompt",onPrompt);
  window.addEventListener("appinstalled",onInstalled);
  return()=>{
   window.removeEventListener("beforeinstallprompt",onPrompt);
   window.removeEventListener("appinstalled",onInstalled);
  };
 },[]);
 async function installAndroid(){
  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(isIOS){setShowInstallHelp(true);return;}
  const event=pendingInstall.current;
  if(event){
   try{
    await event.prompt();
    const result=await event.userChoice;
    pendingInstall.current=null;
    if(result.outcome==="accepted"){setCanInstall(false);setNotice("Installation de Love Radar lancée ❤️")}
    else setShowInstallHelp(true);
   }catch{setShowInstallHelp(true)}
  }else setShowInstallHelp(true);
 }

 function isStandalone(){
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & {standalone?:boolean}).standalone===true;
 }
 function decodeApplicationKey(base64url:string):ArrayBuffer{
  const base64=base64url.replace(/-/g,"+").replace(/_/g,"/");
  const padded=base64+"=".repeat((4-base64.length%4)%4);
  const binary=atob(padded),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out.buffer;
 }
 useEffect(()=>{
  const onMessage=(event:MessageEvent)=>{
   const data=event.data;
   if(data?.type==="love-radar-push-received"){
    firstPoll.current=true;
    if(data.tab==="watch"||data.tab==="watch-tiktok")setWatchInvite(data.tab);
    if(data.tab==="reconcile")setReconcileInvite(true);
    if(document.visibilityState==="visible"&&["message","photo","audio"].includes(data.kind||""))
     setNotice("💌 Nouveau message reçu. Ouvre Messages pour le lire.");
    return;
   }
   if(data?.type==="love-radar-push-needs-repair"){
    setNotificationsOn(false);
    setNotificationsHint("Le téléphone a renouvelé son abonnement push. Ouvre Réparer les notifications.");
    return;
   }
   if(data?.type==="love-radar-open-notification"){
    const dest=parseNotice(new URL(noticeUrl({tab:data.tab,kind:data.kind,id:data.id}),window.location.origin).search);
    if(dest){
     window.history.replaceState(null,"",noticeUrl(dest));
     setNoticeTarget(dest);
     setTab(dest.tab);setWatchInvite(null);setReconcileInvite(false);firstPoll.current=true;
    }
   }else if(["chat","watch","watch-tiktok","games","ludo","ludo-solo","ludo-senegal","ludo-senegal-solo","memory" ,"moment","together","puzzle","reconcile","reunion","story","home","memories"].includes(data?.tab)){
    const dest=data.tab as Tab;
    setTab(dest);setNoticeTarget({tab:dest,kind:null,id:null});if(dest==="reconcile")setReconcileInvite(false);firstPoll.current=true;
   }
  };
  const onRoute=()=>{
   const dest=parseNotice(window.location.search);
   if(dest){setNoticeTarget(dest);setTab(dest.tab);firstPoll.current=true}
  };
  navigator.serviceWorker?.addEventListener("message",onMessage);
  window.addEventListener("popstate",onRoute);
  return()=>{
   navigator.serviceWorker?.removeEventListener("message",onMessage);
   window.removeEventListener("popstate",onRoute);
  };
 },[]);

 useEffect(()=>{
  const id=noticeTarget?.id,kind=noticeTarget?.kind;
  if(!token||!room||!id||!["message","photo","audio"].includes(kind||""))return;
  let cancelled=false;
  const controller=new AbortController();
  setFocusLoading(true);setFocusMessage(null);setFocusError("");
  void (async()=>{
   try{
    const res=await apiFetch("/api/love?messageId="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal});
    const data=await res.json() as {ok:boolean;focusMessage?:Message|null;error?:string};
    if(!res.ok||!data.ok)throw Error(data.error||"Ce message n’est pas disponible.");
    if(!data.focusMessage)throw Error("Ce contenu n’est plus disponible dans cet espace.");
    if(!cancelled)setFocusMessage(data.focusMessage);
   }catch(err){if(!cancelled)setFocusError(err instanceof Error?err.message:"Impossible d’ouvrir le contenu.")}
   finally{if(!cancelled)setFocusLoading(false)}
  })();
  return()=>{cancelled=true;controller.abort()};
 },[token,room?.roomId,noticeTarget?.id,noticeTarget?.kind]);
 useEffect(()=>{
  const m=focusMessage;
  if(!m||!m.object_key||m.view_once)return;
  const controller=new AbortController();
  let cancelled=false;
  if(focusAsset.current){URL.revokeObjectURL(focusAsset.current);focusAsset.current="";}
  setFocusMedia("");
  void apiFetch("/api/media?id="+encodeURIComponent(m.object_key),{headers:{Authorization:"Bearer "+token},signal:controller.signal})
   .then(res=>{if(!res.ok)throw Error("Média indisponible");return res.blob()})
   .then(blob=>{if(cancelled)return;const url=URL.createObjectURL(blob);focusAsset.current=url;setFocusMedia(url)})
   .catch(()=>{if(!cancelled)setFocusError("Ce média n’est plus disponible.")});
  return()=>{cancelled=true;controller.abort();if(focusAsset.current){URL.revokeObjectURL(focusAsset.current);focusAsset.current="";}}
 },[focusMessage?.id,token]);

 // Restore the server registration whenever this PWA is reopened.
 // Browser permission and a local subscription alone are not proof of delivery.
 useEffect(()=>{
  if(!token||!room||isNativeApp)return;
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))return;
  let live=true;
  const sync=async()=>{
   if(!live||pushOperation.current||pushDisabled.current||document.visibilityState!=="visible")return;
   if(Notification.permission!=="granted"){setNotificationsOn(false);return}
   pushOperation.current=true;
   try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){if(live){setNotificationsOn(false);setNotificationsHint("Ce téléphone n’est plus abonné. Appuie sur Activer les notifications.")}return}
    const configRes=await apiFetch("/api/push",{cache:"no-store"});
    const cfg=await configRes.json() as {ok?:boolean;enabled?:boolean;publicKey?:string};
    if(!configRes.ok||!cfg.enabled||!cfg.publicKey)throw Error("La configuration des notifications Cloudflare est indisponible.");
    const key=sub.options?.applicationServerKey||null;
    if(key){
     const actual=new Uint8Array(key),expected=new Uint8Array(decodeApplicationKey(cfg.publicKey));
     if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i])){
      await sub.unsubscribe();
      sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeApplicationKey(cfg.publicKey)});
     }
    }
    const response=await apiFetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
     body:JSON.stringify({action:"subscribe",subscription:sub.toJSON()})});
    const saved=await response.json() as {ok?:boolean;error?:string};
    if(!response.ok||!saved.ok)throw Error(saved.error||"Abonnement non enregistré sur Cloudflare.");
    if(live){setNotificationsOn(true);setNotificationsHint(v=>v.includes("plus abonné")||v.includes("indisponible")?"Abonnement réparé. Tu peux lancer un test.":v)}
   }catch(e){if(live){setNotificationsOn(false);setNotificationsHint(e instanceof Error?e.message:"Impossible de vérifier les notifications.")}}
   finally{pushOperation.current=false}
  };
  void sync();
  const visible=()=>{if(document.visibilityState==="visible")void sync()};
  window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
  const timer=window.setInterval(()=>void sync(),120000);
  return()=>{live=false;window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);window.clearInterval(timer)}
 },[token,room?.user.id]);
 async function enableNotifications(repair=false){
  if(notificationsBusy||pushOperation.current||!token||isNativeApp)return;
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
   setNotificationsHint("Les notifications push ne sont pas disponibles sur ce navigateur. Utilise Chrome sur Android ou installe Love Radar sur l’écran d’accueil de l’iPhone.");
   return;
  }
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent)&&!isStandalone()){
   setNotificationsHint("Sur iPhone : Safari → Partager → Sur l’écran d’accueil. Ouvre ensuite Love Radar depuis son icône, puis active les notifications.");
   return;
  }
  setNotificationsHint("");
  pushOperation.current=true;setNotificationsBusy(true);
  try{
   // iOS requires asking permission from a direct user tap.
   const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
   if(permission!=="granted"){setNotificationsHint("Notifications refusées. Tu peux les autoriser dans les réglages du téléphone.");return;}
   const configRes=await apiFetch("/api/push",{cache:"no-store"});
   const cfg=await configRes.json() as {ok?:boolean,enabled?:boolean,publicKey?:string};
   if(!cfg.ok||!cfg.enabled||!cfg.publicKey){setNotificationsHint("Les notifications ne sont pas encore activées sur notre serveur. Configuration Cloudflare nécessaire.");return;}
   const registration=await navigator.serviceWorker.ready;
   let sub=await registration.pushManager.getSubscription();
   if(sub){
    const old=sub.options?.applicationServerKey||null,expected=new Uint8Array(decodeApplicationKey(cfg.publicKey));
    const current=old?new Uint8Array(old):null;
    const keyMismatch=current&&(current.length!==expected.length||current.some((v,i)=>v!==expected[i]));
    if(repair||keyMismatch){
     await apiFetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:JSON.stringify({action:"unsubscribe",endpoint:sub.endpoint})}).catch(()=>{});
     await sub.unsubscribe();sub=null;
    }
   }
   if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeApplicationKey(cfg.publicKey)});
   const response=await apiFetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action:"subscribe",subscription:sub.toJSON()})});
   const saved=await response.json() as {ok:boolean,error?:string};
   if(!response.ok||!saved.ok)throw Error(saved.error||"Activation impossible.");
   pushDisabled.current=false;
   setNotificationsOn(true);
   setNotificationsHint("Abonnement enregistré sur Cloudflare. Appuie sur Tester pour vérifier la réception.");
  }catch(e){setNotificationsHint(e instanceof Error?e.message:"Activation impossible. Réessaie.")}
  finally{pushOperation.current=false;setNotificationsBusy(false)}
 }
 async function testNotifications(){
  if(!token||notificationsTesting)return;
  setNotificationsTesting(true);setNotificationsHint("");
  try{
   const response=await apiFetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"test"})});
   const data=await response.json() as {ok?:boolean;error?:string};
   if(!response.ok||!data.ok)throw Error(data.error||"Test de notification impossible.");
   setNotificationsHint("Test accepté par le service push. Vérifie la notification sur ton téléphone, même lorsque Love Radar est fermé.");
  }catch(e){setNotificationsHint(e instanceof Error?e.message:"Test impossible. Utilise Réparer.")}
  finally{setNotificationsTesting(false)}
 }
 async function disableNotifications(){
  if(!token||notificationsBusy||pushOperation.current)return;
  pushOperation.current=true;pushDisabled.current=true;setNotificationsBusy(true);
  try{
   const registration=await navigator.serviceWorker.ready,sub=await registration.pushManager.getSubscription();
   if(sub){
    await apiFetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({action:"unsubscribe",endpoint:sub.endpoint})});
    await sub.unsubscribe();
   }
   setNotificationsOn(false);setNotificationsHint("Notifications désactivées sur cet appareil.");
  }catch{setNotificationsHint("Impossible de désactiver les notifications pour le moment.")}
  finally{pushOperation.current=false;setNotificationsBusy(false)}
 }
 async function stopPushOnExit(key:string){
  try{
   const registration=await navigator.serviceWorker.ready,sub=await registration.pushManager.getSubscription();
   if(sub){
    await apiFetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify({action:"unsubscribe",endpoint:sub.endpoint})});
    await sub.unsubscribe();
   }
  }catch{}
 }
 const request=useCallback(async(action:string,body:Record<string,unknown>={},authToken?:string):Promise<Result>=>{
  const t=authToken??token;
  const res=await apiFetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json",...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...body})});
  const data=await res.json() as Result;
  if(!data.ok)throw new Error(data.error||"Une erreur est survenue.");
  return data;
 },[token]);
 const refresh=useCallback(async(key?:string,silent=false)=>{
  const t=key||token;
  if(!t)return;
  const sequence=++snapshotStarted.current;
  try{
   const res=await apiFetch("/api/love",{headers:{Authorization:"Bearer "+t},cache:"no-store"});
   if(res.status===401){
    if(sequence>=snapshotApplied.current){
     snapshotApplied.current=sequence;
     localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setError("Ton accès a expiré. Rejoins un espace.");
    }
    return;
   }
   const data=await res.json() as Result;
   if(!res.ok||!data.ok)throw Error(data.error||"Actualisation impossible.");
   // Overlapping network requests may complete out of order. Never replace
   // a newer conversation with an older response.
   if(sequence<snapshotApplied.current)return;
   snapshotApplied.current=sequence;
   setRoom(data as unknown as Room);
  }catch(e){if(!silent)setError(e instanceof Error?e.message:"Connexion impossible.")}
 },[token]);
 useEffect(()=>{
  const saved=localStorage.getItem("love-radar-token")||"";
  const q=new URLSearchParams(window.location.search);
  if(q.get("join")){setJoinMode(true);setCode(q.get("join")?.toUpperCase()||"")}
  if(saved){setToken(saved);void refresh(saved).finally(()=>setInitializing(false));}else setInitializing(false);
 },[]);
 // Presence means actively viewing the application; it automatically expires
 // after 35 seconds of inactivity or when the app is backgrounded.
 useEffect(()=>{
  if(!token)return;
  const ping=()=>{if(document.visibilityState==="visible")void request("presence").catch(()=>{})};
  ping();
  const ticker=window.setInterval(ping,12000);
  const onVisible=()=>{if(document.visibilityState==="visible")ping()};
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("focus",ping);
  return()=>{window.clearInterval(ticker);document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",ping)};
 },[token,request]);
 useEffect(()=>{
  if(!token)return;
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void refresh(undefined,true)},tab==="chat"?850:4500);
  const onFocus=()=>{void refresh(undefined,true)};
  window.addEventListener("focus",onFocus);
  return()=>{clearInterval(interval);window.removeEventListener("focus",onFocus)};
 },[token,refresh,tab]);
 // Lightweight status-only fetch avoids reloading 90 messages just to see
 // the typing or voice-recording indicator on the partner's iPhone.
 useEffect(()=>{
  if(tab!=="chat"||!token||!room?.partner){setPartnerActivity(null);return}
  let stopped=false,controller:AbortController|null=null,timer:number|null=null;
  const poll=async()=>{
   if(stopped)return;
   if(document.visibilityState==="visible"){
    controller=new AbortController();
    try{
     const res=await apiFetch("/api/love?status=1",{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal});
     const data=await res.json() as Result;
     if(!stopped&&res.ok&&data.ok)setPartnerActivity({
      partnerTypingUntil:Number(data.partnerTypingUntil||0),
      partnerRecordingUntil:Number(data.partnerRecordingUntil||0),
      partnerLastSeenAt:Number(data.partnerLastSeenAt||0)
     });
    }catch{/* The previous activity will expire naturally. */}
   }
   if(!stopped)timer=window.setTimeout(poll,1050);
  };
  void poll();
  return()=>{stopped=true;controller?.abort();if(timer!==null)clearTimeout(timer)};
 },[tab,token,room?.roomId,room?.partner]);
 // Keep activity online even if the person pauses while composing a message.
 useEffect(()=>{
  if(tab!=="chat"||!token)return;
  const heartbeat=()=>{
   if(document.visibilityState!=="visible")return;
   if(typingActive.current)void request("typing",{active:true}).catch(()=>{});
   if(recordingActive.current)void request("recording",{active:true}).catch(()=>{});
  };
  const timer=window.setInterval(heartbeat,2800);
  return()=>window.clearInterval(timer);
 },[tab,token,request]);
 useEffect(()=>{
  if(tab!=="chat"||!token||!room||document.visibilityState!=="visible")return;
  const newest=[...room.messages].reverse().find(m=>m.sender_id!==room.user.id);
  const latestReaction=room.recentReaction?.member_id!==room.user.id?Number(room.recentReaction?.updated_at||0):0;
  const latestIncoming=Math.max(newest?.created_at||0,latestReaction);
  if(latestIncoming<=lastReadSent.current)return;
  lastReadSent.current=latestIncoming;
  void request("read").catch(()=>{lastReadSent.current=0});
 },[tab,room?.messages,room?.recentReaction?.updated_at,room?.recentReaction?.member_id,room?.user.id,token,request]);
 useEffect(()=>{
  if(tab!=="chat"&&typingActive.current){
   typingActive.current=false;
   void request("typing",{active:false}).catch(()=>{});
  }
  if(tab!=="chat"&&recordingActive.current){
   discardRecording.current=true;
   if(recorder.current?.state==="recording")recorder.current.stop();
   recordingActive.current=false;
   void request("recording",{active:false}).catch(()=>{});
  }
 },[tab,request]);
 // Verify that a media response actually contains decodable image bytes. A
 // failed photo used to disappear silently, leaving an empty narrow rectangle.
 async function fetchMedia(item:Message,force=false){
  if(!token||!item.object_key||item.view_once)return;
  const id=item.id;
  if(mediaCache.current[id])return;
  if(!force&&Date.now()<(mediaRetries.current[id]||0))return;
  mediaCache.current[id]="pending";
  try{
   const response=await apiFetch("/api/media?id="+encodeURIComponent(item.object_key),{
    headers:{Authorization:"Bearer "+token},cache:"no-store"
   });
   if(!response.ok)throw new Error("HTTP "+response.status);
   const mime=(response.headers.get("content-type")||"").toLowerCase();
   if(item.kind==="image"&&!mime.startsWith("image/"))throw new Error("Incorrect photo MIME");
   if(item.kind==="audio"&&!mime.startsWith("audio/")&&!mime.startsWith("video/"))throw new Error("Incorrect sound MIME");
   const blob=await response.blob();
   if(blob.size===0)throw new Error("Empty file");
   const url=URL.createObjectURL(blob);
   if(item.kind==="image"){
    const image=new Image();image.src=url;
    try{await image.decode()}catch{URL.revokeObjectURL(url);throw new Error("Unable to decode photo")}
   }
   if(mediaCache.current[id]!=="pending"){URL.revokeObjectURL(url);return}
   mediaCache.current[id]=url;
   delete mediaRetries.current[id];
   delete mediaFailures.current[id];
   setMedia(prev=>({...prev,[id]:url}));
   setMediaErrors(prev=>{
    if(!prev[id])return prev;
    const next={...prev};delete next[id];return next;
   });
  }catch{
   if(mediaCache.current[id]==="pending")delete mediaCache.current[id];
   const attempts=(mediaFailures.current[id]||0)+1;
   mediaFailures.current[id]=attempts;
   mediaRetries.current[id]=Date.now()+Math.min(30000,2500*2**Math.min(attempts-1,4));
   if(item.kind==="image")
    setMediaErrors(prev=>prev[id]?prev:{...prev,[id]:"Photo indisponible pour le moment."});
  }
 }
 function retryMedia(item:Message){
  const url=mediaCache.current[item.id];
  if(url?.startsWith("blob:"))URL.revokeObjectURL(url);
  delete mediaCache.current[item.id];
  delete mediaRetries.current[item.id];
  mediaFailures.current[item.id]=0;
  setMedia(prev=>{if(!prev[item.id])return prev;const next={...prev};delete next[item.id];return next});
  setMediaErrors(prev=>{if(!prev[item.id])return prev;const next={...prev};delete next[item.id];return next});
  void fetchMedia(item,true);
 }
 useEffect(()=>{
  if(!room||!token)return;
  for(const item of room.messages){
   if(item.object_key&&!item.view_once&&!mediaCache.current[item.id])void fetchMedia(item);
  }
 },[room?.messages,token]);
 // Retire the local item only once the matching server row is visible.
 useEffect(()=>{
  if(!room)return;
  const received=new Set(room.messages.map(m=>m.id));
  setVoiceOutbox(items=>{
   if(!items.some(item=>!shouldKeepVoiceDraft(item.status,received.has(item.id))))return items;
   return items.filter(item=>shouldKeepVoiceDraft(item.status,received.has(item.id)));
  });
 },[room?.messages,voiceOutbox]);
 useEffect(()=>()=>{for(const url of Object.values(mediaCache.current)){if(url.startsWith("blob:"))URL.revokeObjectURL(url)}},[]);
 const scrollToLatest=useCallback(()=>{
  const list=chatScroller.current;
  if(!list)return;
  if(scrollFrame.current!==null)cancelAnimationFrame(scrollFrame.current);
  scrollFrame.current=requestAnimationFrame(()=>{
   scrollFrame.current=null;
   if(chatScroller.current){chatScroller.current.scrollTop=chatScroller.current.scrollHeight;chatAtBottomRef.current=true;setChatAtBottom(true)}
  });
 },[]);
 useEffect(()=>{
  if(tab!=="chat")return;
  const list=chatScroller.current;
  if(!list)return;
  const closeToBottom=list.scrollHeight-list.scrollTop-list.clientHeight<155;
  if(firstPoll.current||chatFocused||closeToBottom)scrollToLatest();
  firstPoll.current=false;
 },[chatMessages.at(-1)?.id,tab,chatFocused,scrollToLatest]);
 useEffect(()=>()=>{if(scrollFrame.current!==null)cancelAnimationFrame(scrollFrame.current)},[]);
 // Keyboard changes the visible area: keep recent messages anchored, but
 // don't jump down when a user deliberately reads older messages.
 useEffect(()=>{
  if(tab!=="chat"||!chatScroller.current||typeof ResizeObserver==="undefined")return;
  const observer=new ResizeObserver(()=>{
   if(chatFocused||chatAtBottomRef.current)scrollToLatest();
  });
  observer.observe(chatScroller.current);
  return()=>observer.disconnect();
 },[tab,chatFocused,scrollToLatest]);
 useEffect(()=>{if(tab!=="chat"&&chatFocused)setChatFocused(false)},[tab,chatFocused]);

 async function startRoom(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  try{
   const result=await request(joinMode?"join":"create",{name:name.trim(),...(joinMode?{code:code.trim().toUpperCase()}:{})},"");
   const newToken=result.token!;
   localStorage.setItem("love-radar-token",newToken);
   setToken(newToken);
   await refresh(newToken);
   setNotice(joinMode?"Bienvenue dans votre espace ❤️":"Ton espace privé est créé !");
   setTab("home");
  }catch(e){setError(e instanceof Error?e.message:"Connexion impossible.")}
  finally{setBusy(false)}
 }
 function setTyping(active:boolean){
  if(!token||!room?.partner)return;
  const now=Date.now();
  if(active&&typingActive.current&&now-lastTypingSent.current<2400)return;
  if(!active&&!typingActive.current)return;
  lastTypingSent.current=now;
  typingActive.current=active;
  void request("typing",{active}).catch(()=>{});
 }
 async function sendMessage(e:FormEvent){
  e.preventDefault();if(!draft.trim()||busy||!room?.partner)return;
  if(editTarget){
   const text=draft.trim(),id=editTarget.id;
   setBusy(true);setError("");
   try{
    await request("edit-message",{id,text});
    cancelEditing();
    await refresh(undefined,true);
   }catch(err){setError(err instanceof Error?err.message:"Impossible de modifier ce message.")}
   finally{setBusy(false)}
   return;
  }
  const original=draft,quoted=replyTarget;
  setDraft("");setReplyTarget(null);setTyping(false);setBusy(true);setError("");
  try{
   await request("message",{text:original,...(quoted?{replyTo:quoted.id}:{})});
   await refresh(undefined,true);
   scrollToLatest();
  }catch(e){
   setDraft(original);if(quoted)setReplyTarget(quoted);
   setError(e instanceof Error?e.message:"Échec de l’envoi.");
  }finally{setBusy(false)}
 }
 function cancelEditing(){
  const previous=composerBeforeEdit.current;
  setEditTarget(null);
  setDraft(previous?.draft||"");
  setReplyTarget(previous?.reply||null);
  composerBeforeEdit.current=null;
  setTyping(false);
 }
 function beginEditing(message:Message){
  if(message.kind!=="text"||message.sender_id!==room?.user.id)return;
  composerBeforeEdit.current={draft,reply:replyTarget};
  setEditTarget(message);setReplyTarget(null);setDraft(message.content||"");
  setActionMessageId(null);
  chatInput.current?.focus();
 }
 async function reactToMessage(message:Message,emoji:string){
  setActionMessageId(null);
  try{
   await request("react-message",{id:message.id,emoji});
   await refresh(undefined,true);
  }catch(err){setError(err instanceof Error?err.message:"Réaction impossible.")}
 }
 async function deleteOwnMessage(message:Message){
  setActionMessageId(null);
  if(message.sender_id!==room?.user.id)return;
  if(!window.confirm("Supprimer ce message pour vous deux ? Cette action est définitive."))return;
  try{
   await request("delete-message",{id:message.id});
   const url=mediaCache.current[message.id];
   if(url?.startsWith("blob:"))URL.revokeObjectURL(url);
   delete mediaCache.current[message.id];
   setMedia(prev=>{if(!prev[message.id])return prev;const next={...prev};delete next[message.id];return next});
   if(replyTarget?.id===message.id)setReplyTarget(null);
   if(editTarget?.id===message.id)cancelEditing();
   await refresh(undefined,true);
  }catch(err){setError(err instanceof Error?err.message:"Suppression impossible.")}
 }
 async function deleteForMe(message:Message){
  setActionMessageId(null);
  if(!window.confirm("Supprimer ce message uniquement pour toi ? Il restera visible pour ton partenaire."))return;
  try{
   await request("delete-for-me",{id:message.id});
   if(replyTarget?.id===message.id)setReplyTarget(null);
   if(editTarget?.id===message.id)cancelEditing();
   const url=mediaCache.current[message.id];
   if(url?.startsWith("blob:"))URL.revokeObjectURL(url);
   delete mediaCache.current[message.id];
   setMedia(prev=>{if(!prev[message.id])return prev;const next={...prev};delete next[message.id];return next});
   await refresh(undefined,true);
  }catch(err){setError(err instanceof Error?err.message:"Suppression pour moi impossible.")}
 }
 async function copyMessage(message:Message){
  setActionMessageId(null);
  if(!message.content||message.kind!=="text")return;
  try{await navigator.clipboard.writeText(message.content);setNotice("Message copié")}
  catch{setError("Copie indisponible sur ce téléphone.")}
 }
 function openMessageActions(message:Message){
  chatInput.current?.blur();
  setActionMessageId(message.id);
 }
 function chooseReply(message:Message){
  setReplyTarget(message);
  // Focus synchronously from the user's swipe gesture: iOS otherwise often
  // refuses to open the keyboard after an animation-frame delay.
  chatInput.current?.focus();
  requestAnimationFrame(scrollToLatest);
 }
 // A quick swipe right is Reply. Holding in place opens the action menu.
 // Moving vertically cancels both: chat scrolling never triggers actions.
 function resetSwipe(row?:HTMLDivElement){
  const gesture=swipe.current;
  if(gesture?.timer!==null&&gesture?.timer!==undefined)clearTimeout(gesture.timer);
  if(row){
   row.classList.remove("lr-swiping");
   row.style.removeProperty("--lr-reply-shift");
   row.style.removeProperty("--lr-reply-progress");
  }
  swipe.current=null;
 }
 function messagePointerDown(e:ReactPointerEvent<HTMLDivElement>,message:Message){
  if(e.pointerType==="mouse"&&e.button!==0)return;
  if((e.target as HTMLElement).closest("input[type=range],a,audio"))return;
  resetSwipe();
  const row=e.currentTarget;
  const gesture:{id:string;x:number;y:number;cancelled:boolean;held:boolean;timer:number|null}={
   id:message.id,x:e.clientX,y:e.clientY,cancelled:false,held:false,timer:null
  };
  gesture.timer=window.setTimeout(()=>{
   if(swipe.current!==gesture||gesture.cancelled)return;
   gesture.held=true;
   suppressHeldClickUntil.current=Date.now()+900;
   row.classList.remove("lr-swiping");
   row.style.removeProperty("--lr-reply-shift");
   openMessageActions(message);
   if("vibrate" in navigator)try{navigator.vibrate(12)}catch{/* optional */}
  },520);
  swipe.current=gesture;
 }
 function messagePointerMove(e:ReactPointerEvent<HTMLDivElement>){
  const g=swipe.current;if(!g||g.cancelled||g.held)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(Math.abs(dy)>Math.max(13,Math.abs(dx)*.9)||dx<-12){g.cancelled=true;resetSwipe(e.currentTarget);return}
  if(dx<=8)return;
  if(g.timer!==null){clearTimeout(g.timer);g.timer=null}
  const distance=Math.min(88,Math.max(0,dx));
  e.currentTarget.classList.add("lr-swiping");
  e.currentTarget.style.setProperty("--lr-reply-shift",distance+"px");
  e.currentTarget.style.setProperty("--lr-reply-progress",String(Math.min(1,distance/64)));
 }
 function messagePointerUp(e:ReactPointerEvent<HTMLDivElement>,message:Message){
  const g=swipe.current;if(!g||g.id!==message.id)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  const wasHeld=g.held,wasCancelled=g.cancelled;
  resetSwipe(e.currentTarget);
  if(!wasHeld&&!wasCancelled&&dx>=62&&Math.abs(dy)<34){
   if("vibrate" in navigator)try{navigator.vibrate(10)}catch{/* optional */}
   chooseReply(message);
  }
 }
 function jumpToQuote(id:string){
  const target=document.getElementById("lr-chat-message-"+id);
  if(target)target.scrollIntoView({behavior:"smooth",block:"center"});
 }
 async function upload(file:File,kind:"image"|"audio"){
  if(!token||!room?.partner){setError("Ton partenaire doit d’abord rejoindre l’espace.");return}
  const limit=kind==="image"?6_000_000:5_000_000;
  if(file.size>limit){setError("Fichier trop lourd : "+(kind==="image"?"6 Mo":"5 Mo")+" maximum.");return}
  setBusy(true);setError("");
  try{
   const form=new FormData();form.append("file",file);form.append("kind",kind);form.append("viewOnce",String(viewOnce));
   const res=await apiFetch("/api/media",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});
   const data=await res.json() as {ok:boolean;error?:string};
   if(!data.ok)throw new Error(data.error||"Envoi impossible.");
   setViewOnce(false);
   await refresh();
   requestAnimationFrame(()=>{if(chatScroller.current)chatScroller.current.scrollTop=chatScroller.current.scrollHeight});
  }catch(e){setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{setBusy(false)}
 }
 // Local first: a fresh recording is visible before any network request.
 async function sendQueuedVoice(entry:LocalVoice){
  if(!token||sendingVoiceIds.current.has(entry.id))return;
  sendingVoiceIds.current.add(entry.id);
  setVoiceOutbox(items=>items.map(v=>v.id===entry.id?{...v,status:"uploading",error:undefined}:v));
  try{
   const form=new FormData();
   form.append("file",entry.file);
   form.append("kind","audio");
   form.append("messageId",entry.id);
   form.append("viewOnce",String(entry.view_once));
   const response=await apiFetch("/api/media",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});
   const result=await response.json() as {ok:boolean;error?:string;id?:string;created_at?:number};
   if(!response.ok||!result.ok||result.id!==entry.id)throw Error(result.error||"Envoi vocal impossible.");
   setVoiceOutbox(items=>items.map(v=>v.id===entry.id?{...v,status:"sent",created_at:result.created_at||v.created_at}:v));
   void refresh(undefined,true);
  }catch(error){
   const message=error instanceof Error?error.message:"Échec de l'envoi vocal.";
   setVoiceOutbox(items=>items.map(v=>v.id===entry.id?{...v,status:"failed",error:message}:v));
  }finally{sendingVoiceIds.current.delete(entry.id)}
 }
 function enqueueVoice(file:File,once=viewOnceRecording.current){
  if(!room?.partner||!token)return;
  if(file.size===0){setError("Aucun son enregistré. Réessaie.");return}
  if(file.size>5_000_000){setError("Ce vocal dépasse 5 Mo. Réessaie avec un enregistrement plus court.");return}
  const entry:LocalVoice={id:crypto.randomUUID(),created_at:Date.now(),file,status:"uploading",view_once:once};
  if(!once){
   const url=URL.createObjectURL(file);
   mediaCache.current[entry.id]=url;
   setMedia(prev=>({...prev,[entry.id]:url}));
  }
  setViewOnce(false);
  setVoiceOutbox(prev=>[...prev,entry]);
  scrollToLatest();
  void sendQueuedVoice(entry);
 }
 async function onImageChange(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";
  if(file)await upload(file,"image");
 }
 async function toggleRecording(){
  if(recording&&recorder.current){if(recorder.current.state==="recording")recorder.current.stop();setRecording(false);return}
  if(busy||!room?.partner)return;
  if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Enregistrement vocal indisponible sur ce navigateur.");return}
  setError("");
  try{
   viewOnceRecording.current=viewOnce;
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   recordingStream.current=stream;
   const mime=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg"].find(type=>MediaRecorder.isTypeSupported(type));
   const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   const chunks:Blob[]=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   rec.onerror=()=>{
     discardRecording.current=true;
     recordingActive.current=false;
     void request("recording",{active:false}).catch(()=>{});
     setError("Enregistrement interrompu.");
    };
   rec.onstop=()=>{
    if(recordingTimer.current)clearTimeout(recordingTimer.current);
    stream.getTracks().forEach(t=>t.stop());recordingStream.current=null;setRecording(false);
     recordingActive.current=false;
     void request("recording",{active:false}).catch(()=>{});
    const type=rec.mimeType?.split(";")[0]||"audio/mp4";
    const ext=type.includes("webm")?"webm":type.includes("ogg")?"ogg":"m4a";
    const blob=new Blob(chunks,{type});
    if(blob.size>0&&!discardRecording.current){enqueueVoice(new File([blob],"vocal."+ext,{type}))}
    discardRecording.current=false;
   };
   discardRecording.current=false;
   rec.start(1000);recorder.current=rec;recordingActive.current=true;setRecording(true);
    setTyping(false);
    void request("recording",{active:true}).catch(()=>{});
   recordingTimer.current=setTimeout(()=>{if(rec.state==="recording")rec.stop()},45000);
  }catch{setError("Microphone refusé ou non disponible. Autorise le micro dans Safari.")}
 }
 async function shareCode(){
  const invite=publicInviteUrl(room?.code||"");
  const text="Rejoins-moi sur Love Radar ❤️\n"+invite+"\nCode : "+room?.code;
  try{if(navigator.share)await navigator.share({title:"Love Radar ❤️",text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);setNotice("Invitation copiée !")}else setNotice(text)}
  catch{setNotice("Utilise le code : "+room?.code)}
 }
 async function deleteRoom(){
  if(!window.confirm("Supprimer définitivement votre espace, toutes les conversations, photos et vocaux ? Cette action est irréversible."))return;
  setBusy(true);
  try{await request("delete");if(token)void stopPushOnExit(token);localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setTab("home");setNotice("Espace supprimé.")}
  catch(e){setError(e instanceof Error?e.message:"Suppression impossible.")}
  finally{setBusy(false);setMenu(false)}
 }
 function logout(){if(token)void stopPushOnExit(token);localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setMenu(false);setNotice("Tu t’es déconnecté(e).")}
 const partner=room?.partner||"Ton amour";
 const typingUntil=partnerActivity?.partnerTypingUntil??room?.partnerTypingUntil??0;
 const recordingUntil=partnerActivity?.partnerRecordingUntil??room?.partnerRecordingUntil??0;
 const lastSeen=partnerActivity?.partnerLastSeenAt??room?.partnerLastSeenAt??0;
 const partnerRecording=Boolean(recordingUntil>Date.now());
 const partnerTyping=Boolean(!partnerRecording&&typingUntil>Date.now());
 const partnerOnline=Boolean(lastSeen&&Date.now()-lastSeen<35000);
 const partnerActivityKind=partnerRecording?"recording":partnerTyping?"typing":null;
 useEffect(()=>{
  if(tab!=="chat"||!partnerActivityKind)return;
  if(chatFocused||chatAtBottomRef.current)scrollToLatest();
 },[tab,partnerActivityKind,chatFocused,scrollToLatest]);
 const images=room?.messages.filter(m=>m.kind==="image")||[];
 const lastOwnMessage=[...chatMessages].reverse().find(m=>m.sender_id===room?.user.id&&!voiceOutbox.some(v=>v.id===m.id&&v.status!=="sent"));
 const unreadCount=tab==="chat"&&document.visibilityState==="visible"?0:Math.max(0,Number(room?.unreadCount||0));
 const unreadLabel=unreadCount>99?"99+":String(unreadCount);
 return <div className={"lr-app "+(!room&&!initializing?"lr-welcome-mode ":"")+(room?"lr-app-locked ":"")+(tab==="chat"&&room?"lr-chat-mode ":"")+((tab==="ludo"||tab==="ludo-solo"||tab==="ludo-senegal"||tab==="ludo-senegal-solo")&&room?"lr-ludo-mode ":"")+(tab==="memory"&&room?"lr-memory-mode ":"")+(tab==="together"&&room?"lr-together-mode ":"")+((tab==="watch"||tab==="watch-tiktok")&&room?"lr-watch-mode ":"")+(tab==="puzzle"&&room?"lr-puzzle-mode ":"")+(tab==="reconcile"&&room?"lr-reconcile-mode ":"")+(chatFocused&&tab==="chat"?"lr-keyboard-open":"")}>
  <div className="lr-bg-decor lr-bg-1" aria-hidden="true">♡</div><div className="lr-bg-decor lr-bg-2" aria-hidden="true">✧</div>
  <header className="lr-header"><div className="lr-brand"><span className="lr-brand-emblem" aria-hidden="true">♥</span><span className="lr-brand-copy"><b>Love <span>Radar</span></b><small>UN MONDE RIEN QU’À DEUX</small></span></div>
   <div className="lr-header-end">{canInstall?<button type="button" className="lr-install-btn" onClick={installAndroid}>↓ Installer l’app</button>:null}{room?<><span className="lr-top-status"><i/> {room.partner?"À deux, c’est mieux":"Invitation en attente"}</span><button className="lr-header-avatar" aria-label="Options de mon espace" onClick={()=>setMenu(!menu)}>{room.user.name[0]?.toUpperCase()}</button>{menu?<div className="lr-menu"><b>Love Radar · Paramètres</b><span>{room.user.name} · Espace privé {room.code}</span><button type="button" className="lr-privacy-toggle" aria-pressed={privacyEnabled} onClick={()=>updatePrivacy(!privacyEnabled)}>
     {privacyEnabled?"🔐 Mode confidentialité : activé":"🔓 Mode confidentialité : désactivé"}
    </button>
    <small className="lr-privacy-menu-note">Photos privées révélées temporairement et filigrane. Aucun écran violet ne masque la lecture vidéo.</small>
    <button onClick={logout}>Se déconnecter</button>{room.user.owner?<button className="lr-danger" onClick={deleteRoom}>Supprimer l’espace</button>:null}</div>:null}</>:<span className="lr-badge-free">100% gratuit</span>}</div>
  </header>
  {showInstallHelp?<div className="lr-install-backdrop" onClick={()=>setShowInstallHelp(false)}><div className="lr-install-modal" role="dialog" aria-modal="true" aria-labelledby="lr-install-title" onClick={e=>e.stopPropagation()}><div className="lr-install-symbol">♥</div><h2 id="lr-install-title">Love Radar sur ton téléphone</h2><p>Installe l’application pour l’ouvrir en plein écran et recevoir des notifications.</p>{/iPhone|iPad|iPod/i.test(navigator.userAgent)?<ol><li>Ouvre ce site dans <strong>Safari</strong>.</li><li>Appuie sur <strong>Partager</strong> (le carré avec une flèche).</li><li>Choisis <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.</li><li>Ouvre Love Radar depuis sa nouvelle icône.</li></ol>:<ol><li>Ouvre le site dans <strong>Chrome Android</strong>.</li><li>Appuie sur <strong>⋮</strong> dans Chrome.</li><li>Choisis <strong>Installer l’application</strong> ou « Ajouter à l’écran d’accueil ».</li></ol>}<p className="lr-install-note">L’icône Love Radar apparaîtra parmi tes applications. Une connexion Internet est nécessaire pour jouer et échanger des messages.</p><button onClick={()=>setShowInstallHelp(false)}>J’ai compris ❤️</button></div></div>:null}
  {token&&room&&!isNativeApp?<div className="lr-notification-area">
   <div className="lr-notification-controls">
    <button type="button" className={"lr-notification-toggle "+(notificationsOn?"is-on":"")} onClick={()=>void enableNotifications(notificationsOn)} disabled={notificationsBusy||notificationsTesting}>
     {notificationsBusy?"Vérification…":notificationsOn?"🔔 Notifications activées · Réparer":"🔔 Activer les notifications"}
    </button>
    {notificationsOn?<button type="button" className="lr-notification-test" disabled={notificationsBusy||notificationsTesting} onClick={()=>void testNotifications()}>{notificationsTesting?"Test…":"Tester"}</button>:null}
    {notificationsOn?<button type="button" className="lr-notification-disable" disabled={notificationsBusy||notificationsTesting} onClick={()=>void disableNotifications()}>Désactiver</button>:null}
   </div>
   {notificationsHint?<div role="status" className="lr-notification-help">{notificationsHint}</div>:null}
  </div>:null}
  {watchInvite&&room&&tab!==watchInvite?<div className="lr-watch-invite" role="alert" aria-label="Invitation à regarder ensemble">
   <span className="lr-watch-invite-icon" aria-hidden="true">🎬</span>
   <span className="lr-watch-invite-copy"><strong>Ton amour regarde {watchInvite==="watch"?"YouTube":"TikTok"}</strong><small>Rejoins directement votre vidéo partagée ❤️</small></span>
   <button type="button" className="lr-watch-invite-join" onClick={()=>navigate(watchInvite)}>Regarder</button>
   <button type="button" className="lr-watch-invite-dismiss" onClick={()=>setWatchInvite(null)} aria-label="Ignorer l'invitation">×</button>
  </div>:null}
  {reconcileInvite&&room&&tab!=="reconcile"?<div className="lr-watch-invite" role="alert" aria-label="Invitation privée à se comprendre">
   <span className="lr-watch-invite-icon" aria-hidden="true">🕊️</span>
   <span className="lr-watch-invite-copy"><strong>Une invitation de ton amour ❤️</strong><small>Un espace privé pour mieux vous comprendre, sans pression.</small></span>
   <button type="button" className="lr-watch-invite-join" onClick={()=>navigate("reconcile")}>Découvrir</button>
   <button type="button" className="lr-watch-invite-dismiss" onClick={()=>setReconcileInvite(false)} aria-label="Ignorer l'invitation">×</button>
  </div>:null}
  {notice?<div className="lr-toast" onClick={()=>setNotice("")}>{notice} <span>×</span></div>:null}
  {error?<div className="lr-error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fermer">×</button></div>:null}
  {initializing?<main className="lr-loading">Un petit moment de magie… 💕</main>:!room?
   <main className="lr-auth lr-auth-simple">
     <section className="lr-auth-story" aria-label="Bienvenue sur Love Radar">
      <span className="lr-auth-heart" aria-hidden="true">♥</span>
      <span className="lr-eyebrow">UN ESPACE RIEN QU'À VOUS</span>
      <h1>Votre amour,<br/><em>même à distance.</em></h1>
      <p>Discutez, jouez et partagez vos moments à deux.</p>
     </section>
     <section className="lr-auth-panel" aria-label="Créer ou rejoindre votre espace privé">
      <div className="lr-panel-head"><h2>{joinMode?"Rejoins ton amour ♡":"Bienvenue à deux ♡"}</h2><p>{joinMode?"Entre ton prénom et votre code privé.":"Crée ton espace et invite ton partenaire."}</p></div>
      <div className="lr-auth-switch" role="group" aria-label="Créer ou rejoindre un espace">
       <button type="button" className={!joinMode?"active":""} aria-pressed={!joinMode} onClick={()=>setJoinMode(false)}>Créer mon espace</button>
       <button type="button" className={joinMode?"active":""} aria-pressed={joinMode} onClick={()=>setJoinMode(true)}>J’ai un code</button>
      </div>
      <form onSubmit={startRoom} className="lr-auth-form">
       <label htmlFor="lr-name">Ton prénom</label>
       <input id="lr-name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={30} placeholder="Entre ton prénom" autoComplete="given-name" autoCapitalize="words" required/>
       {joinMode?<><label htmlFor="lr-code">Code d’invitation</label><input id="lr-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={14} placeholder="Code reçu de ton partenaire" required autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></>:null}
       <button type="submit" disabled={busy}>{busy?"Connexion…":joinMode?"Rejoindre notre espace →":"Créer notre espace →"}</button>
      </form>
      <div className="lr-safe-copy"><span aria-hidden="true">🔒</span> Privé · Gratuit · Sur invitation</div>
      <div className="lr-made-by">Créé par <strong>Diao-Tech</strong></div>
     </section>
   </main>:
  <div className="lr-shell">
   <aside className="lr-sidebar"><div className="lr-sidebar-top"><span className="lr-side-label">VOTRE PETIT UNIVERS</span><div className="lr-couple"><Initials name={room.user.name}/><span className="lr-couple-mid">♥</span><Initials name={partner}/></div><h2>{room.user.name}<span> &amp; </span>{partner}</h2><p>{room.partner?"La belle aventure continue…":"En attente de ta moitié."}</p></div>
    <div className="lr-side-nav">{NAV.map(n=><button key={n.id} className={selectedNav(tab)===n.id?"active":""} aria-current={selectedNav(tab)===n.id?"page":undefined} onClick={()=>navigate(n.id)}><span className="lr-nav-symbol" aria-hidden="true"><NavGlyph tab={n.id}/></span>{n.label}{n.id==="chat"&&unreadCount>0?<b className="lr-side-unread" aria-hidden="true">{unreadLabel}</b>:null}</button>)}</div>
    <div className="lr-sidebar-bottom"><div className="lr-side-heart">♡</div>Vos messages et vos souvenirs, toujours à portée de main.</div>
   </aside>
   <main className="lr-main">
    {tab==="home"?<HomeDashboard room={room} token={token} media={media} privacyEnabled={privacyEnabled} onInvite={()=>void shareCode()} onNavigate={navigate}/>:null}
    {tab==="moment"?<DailyMoment token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} focusDay={noticeTarget?.kind==="daily-question"?noticeTarget.id:null}/>:null}
    {tab==="together"?<Together token={token} myName={room.user.name} partnerName={room.partner} mySeat={room.user.seat} onExit={()=>navigate("home")} onOpenMoment={()=>navigate("moment")} onOpenReunion={()=>navigate("reunion")} onOpenWatch={()=>navigate("watch")} onOpenPuzzle={()=>navigate("puzzle")} onOpenReconcile={()=>navigate("reconcile")} focusKind={noticeTarget?.kind==="love-signal"?noticeTarget.kind:null} focusId={noticeTarget?.kind==="love-signal"?noticeTarget.id:null}/>:null}
    {tab==="watch"?<WatchTogether token={token} myId={room.user.id} myName={room.user.name}
      partnerName={room.partner} messages={room.messages}
      onSendText={async text=>{await request("message",{text});await refresh()}}
      onOpenChat={()=>navigate("chat")} onOpenTikTok={()=>navigate("watch-tiktok")} onExit={()=>navigate("together")}/>:null}
    {tab==="watch-tiktok"?<TikTokTogether token={token} myId={room.user.id} myName={room.user.name}
      partnerName={room.partner} messages={room.messages}
      onSendText={async text=>{await request("message",{text});await refresh()}}
      onExit={()=>navigate("watch")} onOpenYouTube={()=>navigate("watch")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="story"||tab==="reunion"?<CoupleStory key={tab} token={token} mode={tab} privacyEnabled={privacyEnabled} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate(tab==="story"?"memories":"together")} onOpenStory={()=>navigate("story")} onOpenReunion={()=>navigate("reunion")}/>:null}
    {tab==="puzzle"?<SharedPuzzle token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")}/>:null}
     {tab==="reconcile"?<Reconcile token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="games"?<GamesHub onOpenGame={game=>navigate(game)} partnerName={room.partner}/>:null}
    {tab==="ludo"?<Ludo token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} challengeId={noticeTarget?.kind==="ludo-challenge"?noticeTarget.id:null}/>:null}
     {tab==="ludo-solo"?<SoloLudo myName={room.user.name} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null}
     {tab==="ludo-senegal"?<SenegalLudo mode="duo" token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null}
     {tab==="ludo-senegal-solo"?<SenegalLudo mode="solo" token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null}
    {tab==="memory"?<MemoryLove token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} challengeId={noticeTarget?.kind==="memory-challenge"?noticeTarget.id:null}/>:null}
    {tab==="chat"?<section className="lr-chat" aria-label={"Conversation avec "+partner}>
     <div className="lr-chat-head">
      <button type="button" className="lr-chat-back" aria-label="Revenir aux onglets" onClick={()=>navigate(chatReturnTab.current)}>
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div className="lr-chat-partner"><Initials name={partner} size="small"/>
       <div><h2>{partner}</h2><span className={"lr-chat-status "+(partnerOnline?"online":"offline")}>{!room.partner?"En attente de votre partenaire…":partnerOnline?"En ligne":"Hors ligne"}</span></div>
      </div>
      <div id="lr-voice-button-slot"/>
     </div>
     <div className="lr-chat-messages" ref={chatScroller} onScroll={e=>{const list=e.currentTarget;const near=list.scrollHeight-list.scrollTop-list.clientHeight<120;chatAtBottomRef.current=near;setChatAtBottom(prev=>prev===near?prev:near)}} role="log" aria-label="Messages" aria-live="off">
      {chatMessages.length===0?<div className="lr-chat-empty"><span>♡</span><h3>Votre conversation</h3><p>Écris ton premier message pour commencer.</p></div>:
      chatMessages.map((m,idx)=>{
       const mine=m.sender_id===room.user.id;
       const previous=chatMessages[idx-1], next=chatMessages[idx+1];
       const day=new Date(m.created_at).toDateString();
       const newDay=!previous||new Date(previous.created_at).toDateString()!==day;
       const groupedBefore=previous&&!newDay&&previous.sender_id===m.sender_id&&m.created_at-previous.created_at<5*60*1000;
       const groupedAfter=next&&next.sender_id===m.sender_id&&new Date(next.created_at).toDateString()===day&&next.created_at-m.created_at<5*60*1000;
       const time=new Date(m.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
       const date=new Date(m.created_at).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long"});
       return <Fragment key={m.id}>
        {newDay?<div className="lr-chat-day">{date}</div>:null}
        <div id={"lr-chat-message-"+m.id}
          className={"lr-bubble-row lr-reply-gesture "+(mine?"mine ":"other ")+(groupedBefore?"lr-grouped ":"")+(groupedAfter?"lr-group-next":"")}
          onPointerDown={e=>messagePointerDown(e,m)}
          onPointerMove={messagePointerMove}
          onPointerUp={e=>messagePointerUp(e,m)}
          onPointerCancel={e=>resetSwipe(e.currentTarget)}
          onContextMenu={e=>{e.preventDefault();resetSwipe(e.currentTarget);openMessageActions(m)}}
          onClickCapture={e=>{if(Date.now()<suppressHeldClickUntil.current){e.preventDefault();e.stopPropagation();suppressHeldClickUntil.current=0}}}
          onKeyDown={e=>{if(e.key==="Enter"||e.key==="ContextMenu"){e.preventDefault();openMessageActions(m)}}}
          tabIndex={0} role="group"
          aria-label={"Message de "+(mine?"vous":partner)+". Glisser pour répondre, maintenir pour les actions."}>
         <span className="lr-reply-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10 4 14l5 4"/><path d="M4 14h9a7 7 0 0 0 7-7"/></svg>
         </span>
         <div className={"lr-bubble-stack"+(m.kind==="image"?" lr-image-stack":"")}>
          <div className={"lr-bubble"+(m.kind==="audio"?" lr-bubble-audio":m.kind==="image"?" lr-bubble-image":"")}>
           {m.reply_to_id?<QuoteCard author={quoteAuthor(m.reply_sender_id,room.user.id,partner)}
            kind={m.reply_kind||"text"} content={m.reply_kind?m.reply_content:"Message supprimé"}
            onJump={chatMessages.some(item=>item.id===m.reply_to_id)?()=>jumpToQuote(m.reply_to_id!):undefined}/>:null}
           {m.kind==="text"?<p>{m.content}</p>:m.kind==="image"?
          media[m.id]?<PrivatePhoto key={m.id} src={media[m.id]} alt={"Photo envoyée "+(mine?"par toi":"par "+partner)} enabled={privacyEnabled} viewer={room.user.name} variant="chat" onImageError={()=>retryMedia(m)}/>:
          <div className="lr-photo-loading" role="status">
           <span aria-hidden="true">▧</span>
           <span>{mediaErrors[m.id]||"Chargement de la photo…"}</span>
           {mediaErrors[m.id]?<button type="button" onClick={()=>retryMedia(m)}>Réessayer</button>:null}
          </div>:
          media[m.id]?<VoiceMessage id={m.id} src={media[m.id]} mine={mine} time={time} delivery={mine&&m.id===lastOwnMessage?.id?((room.partnerReadAt||0)>=m.created_at?"read":"sent"):undefined} onOpenActions={()=>openMessageActions(m)}/>:
          <div className="lr-media-loading">Chargement du vocal…</div>}
           {voiceOutbox.some(v=>v.id===m.id&&v.status!=="sent")?
            <div className={"lr-audio-send-state "+(voiceOutbox.find(v=>v.id===m.id)?.status==="failed"?"failed":"uploading")} role="status">
             {voiceOutbox.find(v=>v.id===m.id)?.status==="failed"?<>
              <span>⚠ Envoi non terminé</span>
              <button type="button" onClick={()=>{const entry=voiceOutbox.find(v=>v.id===m.id);if(entry)void sendQueuedVoice(entry)}}>Réessayer</button>
             </>:<span>◌ Envoi en cours…</span>}
            </div>:null}
           </div>
          {m.reactions?.length?<div className="lr-message-reactions" aria-label="Réactions au message">
           {m.reactions.map(reaction=><button type="button" key={reaction.member_id}
            aria-label={"Réaction "+reaction.emoji+" de "+quoteAuthor(reaction.member_id,room.user.id,partner)}
            onClick={()=>void reactToMessage(m,reaction.emoji)}>{reaction.emoji}</button>)}
          </div>:null}
          {!groupedAfter&&m.kind!=="audio"?<time className="lr-message-time" dateTime={new Date(m.created_at).toISOString()}>{time}{m.edited_at?<span className="lr-edited-label"> · modifié</span>:null}</time>:null}
          {mine&&m.kind!=="audio"&&m.id===lastOwnMessage?.id?<span className={"lr-read-receipt "+((room.partnerReadAt||0)>=m.created_at?"is-read":"")} aria-label="Statut du dernier message">{(room.partnerReadAt||0)>=m.created_at?"✓✓ Vu":"✓ Envoyé"}</span>:null}
         </div>
        </div>
       </Fragment>
      })}
      {partnerActivityKind?<ChatActivity kind={partnerActivityKind}/>:null}
      <div ref={tail}/>
     </div>
     {actionMessage?<div className="lr-message-action-backdrop" onClick={()=>setActionMessageId(null)}>
      <div className="lr-message-action-sheet" role="dialog" aria-modal="true" aria-label="Actions sur le message" onClick={e=>e.stopPropagation()}>
       <div className="lr-message-action-heading">Message · {actionMessage.kind==="text"?"Texte":actionMessage.kind==="image"?"Photo":"Vocal"}</div>
       <div className="lr-message-reaction-picker" role="group" aria-label="Réagir au message">
        {CHAT_REACTIONS.map(emoji=><button key={emoji} type="button" aria-label={"Réagir "+emoji} onClick={()=>void reactToMessage(actionMessage,emoji)}>{emoji}</button>)}
       </div>
       <button type="button" className="lr-message-action-row" onClick={()=>{chooseReply(actionMessage);setActionMessageId(null)}}><span aria-hidden="true">↩</span> Répondre</button>
       {actionMessage.kind==="text"&&actionMessage.content?<button type="button" className="lr-message-action-row" onClick={()=>void copyMessage(actionMessage)}><span aria-hidden="true">⧉</span> Copier</button>:null}
       {actionMessage.sender_id===room.user.id&&actionMessage.kind==="text"?<button type="button" className="lr-message-action-row" onClick={()=>beginEditing(actionMessage)}><span aria-hidden="true">✎</span> Modifier le texte</button>:null}
       <button type="button" className="lr-message-action-row" onClick={()=>{setInfoMessageId(actionMessage.id);setActionMessageId(null)}}><span aria-hidden="true">ⓘ</span> Infos du message</button>
       <button type="button" className="lr-message-action-row" onClick={()=>void deleteForMe(actionMessage)}><span aria-hidden="true">⌫</span> Supprimer pour moi</button>
       {actionMessage.sender_id===room.user.id?<button type="button" className="lr-message-action-row is-danger" onClick={()=>void deleteOwnMessage(actionMessage)}><span aria-hidden="true">⌫</span> Supprimer pour tous</button>:null}
       <button type="button" className="lr-message-action-close" onClick={()=>setActionMessageId(null)}>Annuler</button>
      </div>
     </div>:null}
     {infoMessage?<div className="lr-message-action-backdrop" onClick={()=>setInfoMessageId(null)}>
      <div className="lr-message-action-sheet" role="dialog" aria-modal="true" aria-label="Informations du message" onClick={e=>e.stopPropagation()}>
       <strong>Informations du message</strong>
       <p>Envoyé par {quoteAuthor(infoMessage.sender_id,room.user.id,partner)}</p>
       <p>Le {new Date(infoMessage.created_at).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"})}</p>
       {infoMessage.edited_at?<p>Modifié le {new Date(infoMessage.edited_at).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"})}</p>:null}
       {infoMessage.sender_id===room.user.id?<p>{(room.partnerReadAt||0)>=infoMessage.created_at?"✓✓ Vu par ton partenaire":"✓ Envoyé"}</p>:null}
       <button type="button" className="lr-message-action-close" onClick={()=>setInfoMessageId(null)}>Fermer</button>
      </div>
     </div>:null}
     {!chatAtBottom&&!chatFocused?<button type="button" className="lr-chat-jump" onClick={scrollToLatest}>↓ Derniers messages</button>:null}
     <div className="lr-chat-compose">
      {editTarget?<div className="lr-reply-compose lr-edit-compose" role="status" aria-label="Modification du message">
       <span className="lr-edit-compose-label"><strong>✎ Modifier mon message</strong><small>{editTarget.content}</small></span>
       <button type="button" className="lr-reply-compose-close" aria-label="Annuler la modification" onClick={cancelEditing}>×</button>
      </div>:null}
      {!editTarget&&replyTarget?<div className="lr-reply-compose" role="status" aria-label="Réponse au message sélectionné">
       <QuoteCard variant="composer" author={quoteAuthor(replyTarget.sender_id,room.user.id,partner)}
        kind={replyTarget.kind} content={replyTarget.content}/>
       <button type="button" className="lr-reply-compose-close" aria-label="Annuler la réponse" onClick={()=>setReplyTarget(null)}>×</button>
      </div>:null}
      {recording?<div className="lr-recording"><span className="lr-record-dot"/> Enregistrement en cours…</div>:null}
      <form className={"lr-chat-form "+(chatFocused||draft.trim()?"is-writing ":"")+(recording?"is-recording":"")} onSubmit={sendMessage}>
       <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onImageChange}/>
       <button className="lr-attach" type="button" title="Envoyer une photo" aria-label="Ajouter une photo" onClick={()=>fileInput.current?.click()} disabled={!room.partner||busy}><span aria-hidden="true">+</span></button>
       <input ref={chatInput} aria-label="Écrire un message" type="text" enterKeyHint="send" autoComplete="off" value={draft} onFocus={()=>{firstPoll.current=true;setChatFocused(true);scrollToLatest()}} onBlur={()=>{setChatFocused(false);setTyping(false)}} onChange={e=>{setDraft(e.target.value);setTyping(e.target.value.trim().length>0)}} placeholder={room.partner?"Message…":"En attente de ton partenaire…"} disabled={!room.partner} maxLength={1600}/>
       <button className={"lr-mic "+(recording?"recording":"")} type="button" title={recording?"Arrêter le vocal":"Enregistrer un vocal"} aria-label={recording?"Arrêter le message vocal":"Enregistrer un message vocal"} onClick={toggleRecording} disabled={!room.partner||busy}>
        {recording?<span aria-hidden="true">■</span>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8 21h8"/></svg>}
       </button>
       <button className="lr-send" type="submit" aria-label={editTarget?"Enregistrer la modification":"Envoyer"} onPointerDown={e=>e.preventDefault()} disabled={!room.partner||!draft.trim()||busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg></button>
      </form>
     </div>
    </section>:null}
    {tab==="memories"?<><div className="lr-section-head"><span className="lr-eyebrow">✦ VOTRE ALBUM</span><h1>Nos petits souvenirs <em>♥</em></h1><p>Retrouvez les photos partagées dans votre conversation.</p></div><button type="button" className="lr-story-album-entry" onClick={()=>navigate("story")}><span aria-hidden="true">💑</span><span><strong>Notre histoire</strong><small>Notre photo, nos jours ensemble et nos souvenirs marquants.</small></span><b aria-hidden="true">→</b></button><div className="lr-memories-grid">{images.length===0?<div className="lr-memories-empty"><span>📸</span><h3>Votre album commence ici</h3><p>Partage une photo dans les messages pour la retrouver ici.</p><button onClick={()=>navigate("chat")}>Ouvrir la conversation →</button></div>:images.map(m=><div className="lr-memory" key={m.id}>{media[m.id]?<PrivatePhoto key={m.id} src={media[m.id]} alt="Souvenir du couple" enabled={privacyEnabled} viewer={room.user.name} variant="album"/>:<div>Photo en chargement…</div>}<span>{new Date(m.created_at).toLocaleDateString("fr-FR")}</span></div>)}</div></>:null}
   </main>
   {token&&room?<VoiceCall key={room.roomId+room.user.id} token={token} partner={partner} hasPartner={Boolean(room.partner)} showButton={tab==="chat"||tab==="watch"||tab==="watch-tiktok"||tab==="reconcile"} onOpenChat={()=>navigate("chat")}/>:null}
   {room&&token&&tab==="chat"&&noticeTarget?.id&&["message","photo","audio"].includes(noticeTarget.kind||"")?<div className="lr-push-focus-backdrop" role="dialog" aria-modal="true" aria-label="Contenu de la notification">
    <div className="lr-push-focus-card">
     <div className="lr-push-focus-header"><strong>{noticeTarget.kind==="photo"?"📸 Photo reçue":noticeTarget.kind==="audio"?"🎙️ Message vocal reçu":"💌 Message reçu"}</strong><button type="button" onClick={closeNotice} aria-label="Fermer le contenu">×</button></div>
     {focusLoading?<p>Ouverture du contenu…</p>:focusError?<p role="alert">{focusError}</p>:focusMessage?
       <div className="lr-push-focus-content">
        {focusMessage.kind==="text"?<p className="lr-push-focus-text">{focusMessage.content}</p>:focusMessage.kind==="image"?
         focusMedia?<PrivatePhoto key={focusMessage.id} src={focusMedia} alt="Photo reçue de ton partenaire" enabled={privacyEnabled} viewer={room.user.name} variant="focus"/>:<p>Chargement de la photo…</p>:
         focusMedia?<audio src={focusMedia} controls preload="metadata"/>:<p>Chargement du message vocal…</p>}
        <small>{new Date(focusMessage.created_at).toLocaleString("fr-FR",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}</small>
       </div>:<p>Ce contenu n’est pas disponible.</p>}
     <button type="button" className="lr-push-focus-open-chat" onClick={closeNotice}>Voir la conversation</button>
    </div>
   </div>:null}
      <nav className="lr-mobile-nav" aria-label="Navigation principale à cinq onglets">{NAV.map(n=><button key={n.id} type="button" className={selectedNav(tab)===n.id?"active":""} aria-current={selectedNav(tab)===n.id?"page":undefined} aria-label={n.id==="chat"&&unreadCount>0?"Messages, "+unreadCount+" non lus":n.label} onClick={()=>navigate(n.id)}><span className="lr-nav-symbol" aria-hidden="true"><NavGlyph tab={n.id}/></span>{n.id==="chat"&&unreadCount>0?<b className="lr-nav-unread" aria-hidden="true">{unreadLabel}</b>:null}<small>{n.label}</small></button>)}</nav>
  </div>}
 </div>;
}
