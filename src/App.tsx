import {apiFetch,isNativeApp,publicInviteUrl} from "./api";
import {setNativePrivacy} from "./native-privacy";
import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import "./love-radar.css";
import VoiceCall from "./VoiceCall";
import Ludo from "./Ludo";
import SoloLudo from "./SoloLudo";
import SenegalLudo from "./SenegalLudo";
import MemoryLove from "./MemoryLove";
import DailyMoment from "./DailyMoment";
import Together from "./Together";
import LocationShare from "./LocationShare";
import HomeDashboard from "./HomeDashboard";
import GamesHub from "./GamesHub";
import CoupleStory from "./CoupleStory";
import PrivatePhoto from "./PrivatePhoto";

type AndroidInstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type Tab = "home" | "together" | "location" | "moment" | "reunion" | "games" | "ludo" | "ludo-solo" | "ludo-senegal" | "ludo-senegal-solo" | "memory" | "chat" | "memories" | "story";
type Message = {id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;object_key:string|null;mime:string|null;created_at:number};
type Room = {user:{id:string;name:string;seat:number;owner:boolean};code:string;roomId:string;partner:string|null;members:number;messages:Message[];unreadCount?:number;partnerReadAt?:number;partnerTypingUntil?:number;partnerLastSeenAt?:number};
type Result = {ok:boolean;error?:string;token?:string;code?:string}&Partial<Room>;


const NAV: {id:Tab;label:string;icon:string}[] = [
 {id:"home",label:"Accueil",icon:"⌂"},
 {id:"chat",label:"Messages",icon:"✉"},
 {id:"together",label:"Ensemble",icon:"♡"},
 {id:"games",label:"Jeux",icon:"🎮"},
 {id:"memories",label:"Souvenirs",icon:"✦"},
];
function selectedNav(tab:Tab):Tab {
 if(tab==="moment"||tab==="location"||tab==="reunion")return "together";
 if(tab==="story")return "memories";
 if(tab==="ludo"||tab==="ludo-solo"||tab==="ludo-senegal"||tab==="ludo-senegal-solo"||tab==="memory")return "games";
 return tab;
}
const HEARTS = ["♡","♥","✦","♡","♥"];

type NoticeKind="message"|"photo"|"audio"|"call"|"ludo-challenge"|"memory-challenge"|"daily-question"|"love-signal"|"draw-invite"|"location-request";
type NoticeTarget={tab:Tab;kind:NoticeKind|null;id:string|null};
const NOTICE_KINDS=new Set(["message","photo","audio","call","ludo-challenge","memory-challenge","daily-question","love-signal","draw-invite","location-request"]);
function parseNotice(search:string):NoticeTarget|null{
 const q=new URLSearchParams(search);
 const tab=q.get("tab");
 if(tab!=="home"&&tab!=="moment"&&tab!=="together"&&tab!=="location"&&tab!=="reunion"&&tab!=="story"&&tab!=="chat"&&tab!=="games"&&tab!=="ludo"&&tab!=="ludo-solo"&&tab!=="ludo-senegal"&&tab!=="ludo-senegal-solo"&&tab!=="memory"&&tab!=="memories")return null;
 const kind=q.get("kind"),id=q.get("id");
 if(!kind||!NOTICE_KINDS.has(kind)||!id||!(/^[0-9a-f-]{36}$/i.test(id)||(kind==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(id))))return {tab,kind:null,id:null};
 return {tab:kind==="ludo-challenge"?"ludo":kind==="memory-challenge"?"memory":kind==="daily-question"?"moment":kind==="love-signal"||kind==="draw-invite"?"together":kind==="location-request"?"location":"chat",kind:kind as NoticeKind,id};
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
 function navigate(tab:Tab,feature?:"heart"|"draw"){
  closeNotice();
  setTab(tab);
  const url=new URL(window.location.href);
  url.searchParams.set("tab",tab);
  url.searchParams.delete("kind");url.searchParams.delete("id");url.searchParams.delete("mode");
  if(tab==="together"&&feature)url.searchParams.set("mode",feature);
  window.history.replaceState(null,"",url.pathname+url.search);
  firstPoll.current=true;
 }
 const [draft,setDraft]=useState("");
 const [chatFocused,setChatFocused]=useState(false);
 const chatScroller=useRef<HTMLDivElement|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [media,setMedia]=useState<Record<string,string>>({});
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
 const lastTypingSent=useRef(0);
 const typingActive=useRef(false);
 useEffect(()=>{
  const viewport=window.visualViewport;
  const sync=()=>{
   document.documentElement.style.setProperty("--lr-visible-height",Math.round(viewport?.height||window.innerHeight)+"px");
   document.documentElement.style.setProperty("--lr-visible-top",Math.round(viewport?.offsetTop||0)+"px");
  };
  sync();viewport?.addEventListener("resize",sync);viewport?.addEventListener("scroll",sync);
  window.addEventListener("resize",sync);
  return()=>{
   viewport?.removeEventListener("resize",sync);viewport?.removeEventListener("scroll",sync);
   window.removeEventListener("resize",sync);
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
 const [privacyCurtain,setPrivacyCurtain]=useState(false);
 // An immediate CSS screen cover supplements React state during iOS app-switcher snapshots.
 // It cannot block OS screenshots; iOS does not guarantee event ordering at capture time.
 useEffect(()=>{
  const html=document.documentElement;
  const conceal=()=>{
   if(!privacyEnabled||!token)return;
   html.classList.add("lr-private-background-cover");
   setPrivacyCurtain(true);
  };
  const foreground=()=>{html.classList.remove("lr-private-background-cover")};
  const visibility=()=>{if(document.visibilityState==="hidden")conceal();else foreground()};
  window.addEventListener("blur",conceal);
  window.addEventListener("pagehide",conceal);
  window.addEventListener("focus",foreground);
  window.addEventListener("pageshow",foreground);
  document.addEventListener("visibilitychange",visibility);
  return()=>{
   window.removeEventListener("blur",conceal);window.removeEventListener("pagehide",conceal);
   window.removeEventListener("focus",foreground);window.removeEventListener("pageshow",foreground);
   document.removeEventListener("visibilitychange",visibility);
   foreground();
  };
 },[privacyEnabled,token]);
 function updatePrivacy(enabled:boolean){
  setPrivacyEnabled(enabled);
  try{localStorage.setItem("love-radar-privacy-mode",enabled?"on":"off")}catch{/* Device preference may not persist in private browsing. */}
  void setNativePrivacy(enabled);
  if(!enabled){document.documentElement.classList.remove("lr-private-background-cover");setPrivacyCurtain(false)}
 }
 const [notificationsOn,setNotificationsOn]=useState(false);
 const [notificationsBusy,setNotificationsBusy]=useState(false);
 const [notificationsHint,setNotificationsHint]=useState("");
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
     setTab(dest.tab);firstPoll.current=true;
    }
   }else if(["chat","games","ludo","ludo-solo","ludo-senegal","ludo-senegal-solo","memory","moment","together","location","reunion","story","home","memories"].includes(data?.tab)){
    const dest=data.tab as Tab;
    setTab(dest);setNoticeTarget({tab:dest,kind:null,id:null});firstPoll.current=true;
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
  if(!m||!m.object_key)return;
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
 const refresh=useCallback(async(key?:string)=>{
  const t=key||token;
  if(!t)return;
  try{
   const res=await apiFetch("/api/love",{headers:{Authorization:"Bearer "+t},cache:"no-store"});
   if(res.status===401){
    localStorage.removeItem("love-radar-token");setToken("");setRoom(null);setError("Ton accès a expiré. Rejoins un espace.");return;
   }
   const data=await res.json() as Result;
   if(!data.ok)throw new Error(data.error||"Actualisation impossible.");
   setRoom(data as unknown as Room);
  }catch(e){setError(e instanceof Error?e.message:"Connexion impossible.")}
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
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void refresh()},tab==="chat"?1900:4500);
  const onFocus=()=>{void refresh()};
  window.addEventListener("focus",onFocus);
  return()=>{clearInterval(interval);window.removeEventListener("focus",onFocus)};
 },[token,refresh,tab]);
 useEffect(()=>{
  if(tab!=="chat"||!token||!room||document.visibilityState!=="visible")return;
  const newest=[...room.messages].reverse().find(m=>m.sender_id!==room.user.id);
  if(!newest||newest.created_at<=lastReadSent.current)return;
  lastReadSent.current=newest.created_at;
  void request("read").catch(()=>{lastReadSent.current=0});
 },[tab,room?.messages,room?.user.id,token,request]);
 useEffect(()=>{
  if(tab!=="chat"&&typingActive.current){
   typingActive.current=false;
   void request("typing",{active:false}).catch(()=>{});
  }
 },[tab,request]);
 useEffect(()=>{
  if(!room||!token)return;
  const candidates=room.messages.filter(m=>m.object_key&&!mediaCache.current[m.id]);
  for(const item of candidates){
   mediaCache.current[item.id]="pending";
   void apiFetch("/api/media?id="+encodeURIComponent(item.object_key!),{headers:{Authorization:"Bearer "+token}})
    .then(r=>{if(!r.ok)throw new Error("media inaccessible");return r.blob()})
    .then(blob=>{const url=URL.createObjectURL(blob);mediaCache.current[item.id]=url;setMedia(prev=>({...prev,[item.id]:url}))})
    .catch(()=>{delete mediaCache.current[item.id]});
  }
 },[room?.messages,token]);
 useEffect(()=>()=>{for(const url of Object.values(mediaCache.current)){if(url.startsWith("blob:"))URL.revokeObjectURL(url)}},[]);
 useEffect(()=>{
  if(tab!=="chat")return;
  const list=chatScroller.current;
  if(!list)return;
  const closeToBottom=list.scrollHeight-list.scrollTop-list.clientHeight<210;
  if(firstPoll.current||closeToBottom)list.scrollTop=list.scrollHeight;
  firstPoll.current=false;
 },[room?.messages,tab,chatFocused]);
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
  const original=draft;setDraft("");setTyping(false);setBusy(true);setError("");
  try{await request("message",{text:original});await refresh();requestAnimationFrame(()=>{if(chatScroller.current)chatScroller.current.scrollTop=chatScroller.current.scrollHeight})}
  catch(e){setDraft(original);setError(e instanceof Error?e.message:"Échec de l’envoi.")}
  finally{setBusy(false)}
 }
 async function upload(file:File,kind:"image"|"audio"){
  if(!token||!room?.partner){setError("Ton partenaire doit d’abord rejoindre l’espace.");return}
  const limit=kind==="image"?6_000_000:5_000_000;
  if(file.size>limit){setError("Fichier trop lourd : "+(kind==="image"?"6 Mo":"5 Mo")+" maximum.");return}
  setBusy(true);setError("");
  try{
   const form=new FormData();form.append("file",file);form.append("kind",kind);
   const res=await apiFetch("/api/media",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});
   const data=await res.json() as {ok:boolean;error?:string};
   if(!data.ok)throw new Error(data.error||"Envoi impossible.");
   await refresh();
   requestAnimationFrame(()=>{if(chatScroller.current)chatScroller.current.scrollTop=chatScroller.current.scrollHeight});
  }catch(e){setError(e instanceof Error?e.message:"Envoi impossible.")}
  finally{setBusy(false)}
 }
 async function onImageChange(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";
  if(file)await upload(file,"image");
 }
 async function toggleRecording(){
  if(recording&&recorder.current){recorder.current.stop();setRecording(false);return}
  if(busy||!room?.partner)return;
  if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Enregistrement vocal indisponible sur ce navigateur.");return}
  setError("");
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   recordingStream.current=stream;
   const mime=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg"].find(type=>MediaRecorder.isTypeSupported(type));
   const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
   const chunks:Blob[]=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   rec.onerror=()=>setError("Enregistrement interrompu.");
   rec.onstop=()=>{
    if(recordingTimer.current)clearTimeout(recordingTimer.current);
    stream.getTracks().forEach(t=>t.stop());recordingStream.current=null;setRecording(false);
    const type=rec.mimeType?.split(";")[0]||"audio/mp4";
    const ext=type.includes("webm")?"webm":type.includes("ogg")?"ogg":"m4a";
    const blob=new Blob(chunks,{type});
    if(blob.size>0){void upload(new File([blob],"vocal."+ext,{type}),"audio")}
   };
   rec.start(1000);recorder.current=rec;setRecording(true);
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
 const partnerTyping=Boolean(room?.partnerTypingUntil&&room.partnerTypingUntil>Date.now());
 const partnerOnline=Boolean(room?.partnerLastSeenAt&&Date.now()-room.partnerLastSeenAt<35000);
 const images=room?.messages.filter(m=>m.kind==="image")||[];
 const lastOwnMessage=[...(room?.messages||[])].reverse().find(m=>m.sender_id===room?.user.id);
 const unreadCount=tab==="chat"&&document.visibilityState==="visible"?0:Math.max(0,Number(room?.unreadCount||0));
 const unreadLabel=unreadCount>99?"99+":String(unreadCount);
 return <div className={"lr-app "+(!room&&!initializing?"lr-welcome-mode ":"")+(room?"lr-app-locked ":"")+(tab==="chat"&&room?"lr-chat-mode ":"")+((tab==="ludo"||tab==="ludo-solo"||tab==="ludo-senegal"||tab==="ludo-senegal-solo")&&room?"lr-ludo-mode ":"")+(tab==="memory"&&room?"lr-memory-mode ":"")+(tab==="together"&&room?"lr-together-mode ":"")+(tab==="location"&&room?"lr-location-mode ":"")+(chatFocused&&tab==="chat"?"lr-keyboard-open":"")}>
  <div className="lr-bg-decor lr-bg-1" aria-hidden="true">♡</div><div className="lr-bg-decor lr-bg-2" aria-hidden="true">✧</div>
  <header className="lr-header"><div className="lr-brand"><b>Love Radar</b></div>
   <div className="lr-header-end">{canInstall?<button type="button" className="lr-install-btn" onClick={installAndroid}>↓ Installer l’app</button>:null}{room?<><span className="lr-top-status"><i/> {room.partner?"À deux, c’est mieux":"Invitation en attente"}</span><button className="lr-header-avatar" aria-label="Options de mon espace" onClick={()=>setMenu(!menu)}>{room.user.name[0]?.toUpperCase()}</button>{menu?<div className="lr-menu"><b>Love Radar · Paramètres</b><span>{room.user.name} · Espace privé {room.code}</span><button type="button" className="lr-privacy-toggle" aria-pressed={privacyEnabled} onClick={()=>updatePrivacy(!privacyEnabled)}>
     {privacyEnabled?"🔐 Mode confidentialité : activé":"🔓 Mode confidentialité : désactivé"}
    </button>{privacyEnabled?<button type="button" onClick={()=>{setMenu(false);setPrivacyCurtain(true)}}>🙈 Masquer l'écran maintenant</button>:null}
    <small className="lr-privacy-menu-note">Masquage au changement d’app, photos révélées temporairement et filigrane. Les captures d'écran restent possibles.</small>
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
    <div className="lr-side-nav">{NAV.map(n=><button key={n.id} className={selectedNav(tab)===n.id?"active":""} aria-current={selectedNav(tab)===n.id?"page":undefined} onClick={()=>navigate(n.id)}><span aria-hidden="true">{n.icon}</span>{n.label}{n.id==="chat"&&unreadCount>0?<b className="lr-side-unread" aria-hidden="true">{unreadLabel}</b>:null}</button>)}</div>
    <div className="lr-sidebar-bottom"><div className="lr-side-heart">♡</div>Vos messages et vos souvenirs, toujours à portée de main.</div>
   </aside>
   <main className="lr-main">
    {tab==="home"?<HomeDashboard room={room} token={token} media={media} privacyEnabled={privacyEnabled} onInvite={()=>void shareCode()} onNavigate={navigate}/>:null}
    {tab==="moment"?<DailyMoment token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} focusDay={noticeTarget?.kind==="daily-question"?noticeTarget.id:null}/>:null}
    {tab==="together"?<Together token={token} myName={room.user.name} partnerName={room.partner} mySeat={room.user.seat} onExit={()=>navigate("home")} onOpenMoment={()=>navigate("moment")} onOpenReunion={()=>navigate("reunion")} onOpenLocation={()=>navigate("location")} focusKind={noticeTarget?.kind==="love-signal"||noticeTarget?.kind==="draw-invite"?noticeTarget.kind:null} focusId={noticeTarget?.kind==="love-signal"||noticeTarget?.kind==="draw-invite"?noticeTarget.id:null}/>:null}
    {tab==="story"||tab==="reunion"?<CoupleStory key={tab} token={token} mode={tab} privacyEnabled={privacyEnabled} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate(tab==="story"?"memories":"together")} onOpenStory={()=>navigate("story")} onOpenReunion={()=>navigate("reunion")}/>:null}
    {tab==="location"?<LocationShare token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} focusId={noticeTarget?.kind==="location-request"?noticeTarget.id:null}/>:null}
    {tab==="games"?<GamesHub onOpenGame={game=>navigate(game)} partnerName={room.partner}/>:null}
    {tab==="ludo"?<Ludo token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} challengeId={noticeTarget?.kind==="ludo-challenge"?noticeTarget.id:null}/>:null}
     {tab==="ludo-solo"?<SoloLudo myName={room.user.name} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null}
     {tab==="ludo-senegal"?<SenegalLudo mode="duo" token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null}
     {tab==="ludo-senegal-solo"?<SenegalLudo mode="solo" token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null}
    {tab==="memory"?<MemoryLove token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} challengeId={noticeTarget?.kind==="memory-challenge"?noticeTarget.id:null}/>:null}
    {tab==="chat"?<section className="lr-chat" aria-label={"Conversation avec "+partner}>
     <div className="lr-chat-head">
      <div className="lr-chat-partner"><Initials name={partner} size="small"/>
       <div><h2>{partner}</h2><span className={"lr-chat-status "+(partnerTyping?"typing":partnerOnline?"online":"offline")} aria-live="polite">{partnerTyping?"En train d’écrire…":!room.partner?"En attente de votre partenaire…":partnerOnline?"En ligne":"Hors ligne"}</span></div>
      </div>
      <div id="lr-voice-button-slot"/>
     </div>
     <div className="lr-chat-messages" ref={chatScroller} role="log" aria-label="Messages" aria-live="off">
      {room.messages.length===0?<div className="lr-chat-empty"><span>♡</span><h3>Votre conversation</h3><p>Écris ton premier message pour commencer.</p></div>:
      room.messages.map((m,idx)=>{
       const mine=m.sender_id===room.user.id;
       const previous=room.messages[idx-1], next=room.messages[idx+1];
       const day=new Date(m.created_at).toDateString();
       const newDay=!previous||new Date(previous.created_at).toDateString()!==day;
       const groupedBefore=previous&&!newDay&&previous.sender_id===m.sender_id&&m.created_at-previous.created_at<5*60*1000;
       const groupedAfter=next&&next.sender_id===m.sender_id&&new Date(next.created_at).toDateString()===day&&next.created_at-m.created_at<5*60*1000;
       const time=new Date(m.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
       const date=new Date(m.created_at).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long"});
       return <Fragment key={m.id}>
        {newDay?<div className="lr-chat-day">{date}</div>:null}
        <div className={"lr-bubble-row "+(mine?"mine ":"other ")+(groupedBefore?"lr-grouped ":"")+(groupedAfter?"lr-group-next":"")}>
         <div className="lr-bubble-stack">
          <div className="lr-bubble">{m.kind==="text"?<p>{m.content}</p>:m.kind==="image"?
          media[m.id]?<PrivatePhoto key={m.id} src={media[m.id]} alt={"Photo envoyée "+(mine?"par toi":"par "+partner)} enabled={privacyEnabled} viewer={room.user.name} variant="chat"/>:
          <div className="lr-media-loading">Chargement de la photo…</div>:
          media[m.id]?<div className="lr-voice"><span>Message vocal</span><audio controls preload="metadata" src={media[m.id]}/></div>:
          <div className="lr-media-loading">Chargement du vocal…</div>}</div>
          {!groupedAfter?<time className="lr-message-time" dateTime={new Date(m.created_at).toISOString()}>{time}</time>:null}
          {mine&&m.id===lastOwnMessage?.id?<span className={"lr-read-receipt "+((room.partnerReadAt||0)>=m.created_at?"is-read":"")} aria-label="Statut du dernier message">{(room.partnerReadAt||0)>=m.created_at?"✓✓ Vu":"✓ Envoyé"}</span>:null}
         </div>
        </div>
       </Fragment>
      })}
      {partnerTyping?<div className="lr-typing" role="status"><span>{partner} écrit</span><div className="lr-typing-dots" aria-label="En train d’écrire"><i/><i/><i/></div></div>:null}
      <div ref={tail}/>
     </div>
     <div className="lr-chat-compose">
      {recording?<div className="lr-recording"><span className="lr-record-dot"/> Enregistrement en cours…</div>:null}
      <form className={"lr-chat-form "+(chatFocused||draft.trim()?"is-writing ":"")+(recording?"is-recording":"")} onSubmit={sendMessage}>
       <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onImageChange}/>
       <button className="lr-attach" type="button" title="Envoyer une photo" aria-label="Ajouter une photo" onClick={()=>fileInput.current?.click()} disabled={!room.partner||busy}><span aria-hidden="true">+</span></button>
       <input aria-label="Écrire un message" type="text" enterKeyHint="send" autoComplete="off" value={draft} onFocus={()=>setChatFocused(true)} onBlur={()=>{setChatFocused(false);setTyping(false)}} onChange={e=>{setDraft(e.target.value);setTyping(e.target.value.trim().length>0)}} placeholder={room.partner?"Message…":"En attente de ton partenaire…"} disabled={!room.partner} maxLength={1600}/>
       <button className={"lr-mic "+(recording?"recording":"")} type="button" title={recording?"Arrêter le vocal":"Enregistrer un vocal"} aria-label={recording?"Arrêter le message vocal":"Enregistrer un message vocal"} onClick={toggleRecording} disabled={!room.partner||busy}>
        {recording?<span aria-hidden="true">■</span>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8 21h8"/></svg>}
       </button>
       <button className="lr-send" type="submit" aria-label="Envoyer" onPointerDown={e=>e.preventDefault()} disabled={!room.partner||!draft.trim()||busy}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg></button>
      </form>
     </div>
    </section>:null}
    {tab==="memories"?<><div className="lr-section-head"><span className="lr-eyebrow">✦ VOTRE ALBUM</span><h1>Nos petits souvenirs <em>♥</em></h1><p>Retrouvez les photos partagées dans votre conversation.</p></div><button type="button" className="lr-story-album-entry" onClick={()=>navigate("story")}><span aria-hidden="true">💑</span><span><strong>Notre histoire</strong><small>Notre photo, nos jours ensemble et nos souvenirs marquants.</small></span><b aria-hidden="true">→</b></button><div className="lr-memories-grid">{images.length===0?<div className="lr-memories-empty"><span>📸</span><h3>Votre album commence ici</h3><p>Partage une photo dans les messages pour la retrouver ici.</p><button onClick={()=>navigate("chat")}>Ouvrir la conversation →</button></div>:images.map(m=><div className="lr-memory" key={m.id}>{media[m.id]?<PrivatePhoto key={m.id} src={media[m.id]} alt="Souvenir du couple" enabled={privacyEnabled} viewer={room.user.name} variant="album"/>:<div>Photo en chargement…</div>}<span>{new Date(m.created_at).toLocaleDateString("fr-FR")}</span></div>)}</div></>:null}
   </main>
   {token&&room?<VoiceCall key={room.roomId+room.user.id} token={token} partner={partner} hasPartner={Boolean(room.partner)} showButton={tab==="chat"} onOpenChat={()=>navigate("chat")}/>:null}
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
   {token&&room&&privacyEnabled&&privacyCurtain?<div className="lr-private-curtain" role="dialog" aria-modal="true" aria-label="Écran masqué par le mode confidentialité">
    <span className="lr-private-curtain-lock" aria-hidden="true">🔒</span>
    <h2>Votre espace est masqué</h2>
    <p>Love Radar protège l'affichage quand tu quittes l'application.</p>
    <button type="button" onClick={()=>setPrivacyCurtain(false)}>♡ Reprendre Love Radar</button>
    <small>Cette protection n'empêche pas les captures d'écran du système.</small>
   </div>:null}
   <nav className="lr-mobile-nav" aria-label="Navigation principale à cinq onglets">{NAV.map(n=><button key={n.id} type="button" className={selectedNav(tab)===n.id?"active":""} aria-current={selectedNav(tab)===n.id?"page":undefined} aria-label={n.id==="chat"&&unreadCount>0?"Messages, "+unreadCount+" non lus":n.label} onClick={()=>navigate(n.id)}><span aria-hidden="true">{n.icon}</span>{n.id==="chat"&&unreadCount>0?<b className="lr-nav-unread" aria-hidden="true">{unreadLabel}</b>:null}<small>{n.label}</small></button>)}</nav>
  </div>}
 </div>;
}
