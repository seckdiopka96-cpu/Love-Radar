import {apiFetch,isNativeApp,publicInviteUrl} from "./api";
import {connectionErrorMessage} from "./network-recovery";
import {isTransientMessageFailure,messageRetryDelayMs} from "./message-network";
import {recoverSavedSession,persistSessionToken,clearSessionToken,hadPreviousSession} from "./session-persistence";
import {ensureIdentity,loadIdentity,loadRecoveredRoomKey,encryptedBackupFor,restoreIdentityBackup,fingerprint,makeContext,verifyPartner,isPartnerVerified,encryptText,encryptMedia,decryptMedia,isEncryptedMedia,isEncryptedText,type CryptoContext} from "./e2ee";
import {revealMessages} from "./e2ee-room";
import {setNativePrivacy} from "./native-privacy";
import {watchNativeScreenshots,screenshotDetectionAvailable} from "./native-screenshot";
import "./screenshot-events.css";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {createPortal} from "react-dom";
import "./love-radar.css";
import VoiceCall from "./VoiceCall";
import FunCamera from "./FunCamera";
import CallHistoryBubble,{type CallHistoryEvent} from "./CallHistoryBubble";
import Ludo from "./Ludo";
import LudoSoloEmbedded from "./LudoSoloEmbedded";
import SenegalLudo from "./SenegalLudo";
import MemoryLove from "./MemoryLove";
import DailyMoment from "./DailyMoment";
import Together from "./Together";
import CoupleCare from "./CoupleCare";
import WatchTogether from "./WatchTogether";
import TikTokTogether from "./TikTokTogether";
import SharedPuzzle from "./SharedPuzzle";
import Reconcile from "./Reconcile";
import HomeDashboard from "./HomeDashboard";
import DiscoveryMode from "./DiscoveryMode";
import LoveRadarPlus,{type PlusTheme} from "./LoveRadarPlus";
import SettingsPage from "./SettingsPage";
import RecoveryCodeDialog from "./RecoveryCodeDialog";
import GamesHub from "./GamesHub";
import LudoRoom from "./LudoRoom";
import RpsDuo from "./RpsDuo";
import DuoArcade from "./DuoArcade";
import CoupleParty from "./CoupleParty";
import CoupleStory from "./CoupleStory";
import SharedKeepsakes from "./SharedKeepsakes";
import CoupleExperiences from "./CoupleExperiences";
import PrivatePhoto from "./PrivatePhoto";
import ProfilePhotoEditor from "./ProfilePhotoEditor";
import {useProfileAvatars} from "./use-profile-avatars";
import PartnerRecoveryClaim from "./PartnerRecoveryClaim";
import {claimRecordingAudio,releaseRecordingAudio,isCallAudioActive,installAudioPlaybackGuard,type AudioInterrupt} from "./audio-focus";
import PartnerProfileViewer from "./PartnerProfileViewer";
import PartnerPresenceDetails from "./PartnerPresenceDetails";
import VoiceMessage from "./VoiceMessage";
import {nextConsecutiveVoiceId,type VoiceSpeed} from "./voice-sequence";
import LiveVoiceWaveform from "./LiveVoiceWaveform";
import StickerArt from "./StickerArt";
import StickerPicker from "./StickerPicker";
import GifMessage from "./GifMessage";
import AnimatedEmojiText,{emojiOnlyText} from "./AnimatedEmojiText";
import "./animated-stickers.css";
import {encodeGif,readGifId} from "./gif-provider";
import {encodeSticker,isSticker,readStickerId} from "./stickers";
import {mediaRetryDelay,MEDIA_AUTO_RETRY_LIMIT} from "./reliability-rules";
import ChatActivity from "./ChatActivity";
import QuoteCard from "./QuoteCard";
import {quoteAuthor,type QuoteKind} from "./message-quote";
import {mergeOptimisticMessages,shouldKeepVoiceDraft,type AudioOutboxStatus} from "./voice-outbox";
import {formatPartnerLastSeen} from "./last-seen";
import {receiptState,receiptGlyph,receiptDisplayLabel,receiptAccessibleLabel} from "./message-delivery";
import "./redesign.css";
import "./redesign-features.css";
import "./chat-stability.css";
import "./voice-message.css";
import "./immersive-chat.css";
import "./message-replies.css";
import "./message-actions.css";
import "./photo-reliability.css";
import "./premium-navigation.css";
import "./polished-shell.css";
import "./recording-composer.css";
import "./refined-universe.css";
import "./premium-dock.css";
import "./together-premium.css";
import "./live-voice-waveform.css";
import "./chat-composer-signature.css";
import "./chat-readable-type.css";
import "./comfortable-ui.css";
import "./auth-reconnect.css";
import "./voice-alignment.css";
import "./premium-design-polish.css";
import "./call-history.css";
import "./message-context-premium.css";
import "./clean-home-chat.css";
import "./delivery-status-ui.css";

type AndroidInstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type Tab = "plus" | "home" | "together" | "camera" | "life" | "watch" | "watch-tiktok" | "puzzle" | "reconcile" | "moment" | "reunion" | "care" | "games" | "ludo-room" | "rps" | "draw" | "escape" | "rapid" | "truth" | "ludo" | "ludo-solo" | "ludo-senegal" | "ludo-senegal-solo" | "memory" | "chat" | "memories" | "story" | "settings";
type EncryptionState={mine:string|null;partner:string|null;required:boolean};
type ScreenshotEvent={id:string;member_id:string;created_at:number};
type ChatTimelineItem = {type:"message";message:Message;index:number;createdAt:number}|{type:"call";call:CallHistoryEvent;createdAt:number}|{type:"screenshot";event:ScreenshotEvent;createdAt:number};
type Message = {id:string;sender_id:string;kind:"text"|"image"|"audio";content:string|null;object_key:string|null;mime:string|null;created_at:number;
 reply_to_id?:string|null;reply_kind?:QuoteKind|null;reply_content?:string|null;reply_sender_id?:string|null;
 edited_at?:number;reactions?:{member_id:string;emoji:string}[];view_once?:number|boolean};
type RecentReaction={message_id:string;member_id:string;emoji:string;updated_at:number;kind:"text"|"image"|"audio";content:string|null};
type Room = {revision?:number;e2ee?:EncryptionState;recentReaction?:RecentReaction|null;user:{id:string;name:string;seat:number;owner:boolean;avatarVersion?:number};code:string;roomId:string;partner:string|null;partnerId?:string|null;partnerAvatarVersion?:number;members:number;messages:Message[];unreadCount?:number;partnerReadAt?:number;partnerDeliveredAt?:number;partnerTypingUntil?:number;partnerRecordingUntil?:number;partnerLastSeenAt?:number};
type Result = {ok:boolean;error?:string;token?:string;code?:string;recoveryCode?:string;id?:string}&Partial<Room>;
type LocalVoice={id:string;created_at:number;file:File;status:AudioOutboxStatus;error?:string};
type LocalText={id:string;created_at:number;text:string;wireText?:string;replyToId?:string;replyKind?:QuoteKind|null;replyContent?:string|null;replySenderId?:string|null;status:"sending"|"failed"|"sent";error?:string;retryable?:boolean;attempts?:number;retryAt?:number};


const NAV: {id:Tab;label:string}[] = [
 {id:"home",label:"Accueil"},
 {id:"memories",label:"Souvenirs"},
 {id:"together",label:"Nous deux"},
 {id:"games",label:"Jeux"},
 {id:"chat",label:"Messages"},
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
 if(tab==="camera"||tab==="life"||tab==="care"||tab==="moment"||tab==="puzzle"||tab==="reconcile"||tab==="reunion"||tab==="watch"||tab==="watch-tiktok")return "together";
 if(tab==="story")return "memories";
 if(tab==="plus")return "home";
 if(tab==="ludo-room"||tab==="ludo"||tab==="ludo-solo"||tab==="ludo-senegal"||tab==="ludo-senegal-solo"||tab==="memory"||tab==="rps"||tab==="draw"||tab==="escape"||tab==="rapid"||tab==="truth")return "games";
 return tab;
}
const HEARTS = ["♡","♥","✦","♡","♥"];
const CHAT_REACTIONS=["👍","❤️","😂","😮","😢","🙏","👏"];
const EXTRA_CHAT_REACTIONS=["🥰","😍","😘","💗","🔥","🎉","💯","🤗","😎","💐","🤲","😅"];

type NoticeKind="message"|"photo"|"audio"|"call"|"ludo-challenge"|"memory-challenge"|"rps-challenge"|"daily-question"|"love-signal"|"love-letter"|"album-memory"|"couple-date"|"couple-mood"|"couple-dream"|"couple-hug"|"couple-challenge"|"couple-gift";
type NoticeTarget={tab:Tab;kind:NoticeKind|null;id:string|null};
const NOTICE_KINDS=new Set(["message","photo","audio","call","ludo-challenge","memory-challenge","rps-challenge","daily-question","love-signal","love-letter","album-memory","couple-date","couple-mood","couple-dream","couple-hug","couple-challenge","couple-gift"]);
function parseNotice(search:string):NoticeTarget|null{
 const q=new URLSearchParams(search);
 const tab=q.get("tab");
 if(tab==="location")return {tab:"together",kind:null,id:null};
 if(tab!=="plus"&&tab!=="settings"&&tab!=="home"&&tab!=="life"&&tab!=="care"&&tab!=="moment"&&tab!=="together"&&tab!=="watch"&&tab!=="watch-tiktok"&&tab!=="puzzle"&&tab!=="reconcile"&&tab!=="reunion"&&tab!=="story"&&tab!=="chat"&&tab!=="games"&&tab!=="ludo-room"&&tab!=="ludo"&&tab!=="ludo-solo"&&tab!=="ludo-senegal"&&tab!=="ludo-senegal-solo"&&tab!=="memory"&&tab!=="rps"&&tab!=="draw"&&tab!=="escape"&&tab!=="rapid"&&tab!=="truth"&&tab!=="memories")return null;
 const kind=q.get("kind"),id=q.get("id");
 if(!kind||!NOTICE_KINDS.has(kind)||!id||!(/^[0-9a-f-]{36}$/i.test(id)||(kind==="daily-question"&&/^\d{4}-\d{2}-\d{2}$/.test(id))))return {tab,kind:null,id:null};
 return {tab:kind==="ludo-challenge"?"ludo":kind==="memory-challenge"?"memory":kind==="rps-challenge"?"rps":kind==="daily-question"?"moment":kind==="love-signal"?"together":kind==="love-letter"||kind==="album-memory"?"memories":kind.startsWith("couple-")?"life":"chat",kind:kind as NoticeKind,id};
}
function noticeUrl(target:NoticeTarget){
 const q=new URLSearchParams({tab:target.tab});
 if(target.kind&&target.id){q.set("kind",target.kind);q.set("id",target.id)}
 return "/?"+q.toString();
}

function Initials({name,size="normal",src}:{name:string;size?:"normal"|"small";src?:string}) {
 return <div className={"lr-avatar "+(size==="small"?"lr-avatar-sm":"")}>{src?<img src={src} alt={"Photo de "+name}/>:name.trim().slice(0,1).toUpperCase()||"♡"}</div>;
}
export default function LoveRadar(){
 const [token,setToken]=useState("");
 const [room,setRoom]=useState<Room|null>(null);
 const [demoOpen,setDemoOpen]=useState(false);
 const [plusActive,setPlusActive]=useState(false);
 const [plusTheme,setPlusTheme]=useState<PlusTheme>("classic");
 useEffect(()=>{
  let alive=true;
  setPlusActive(false);setPlusTheme("classic");
  if(!token||!room?.roomId)return;
  const currentRoom=room.roomId;
  try{
   const stored=localStorage.getItem("lr-plus-theme-v1:"+currentRoom);
   if(stored==="starlight"||stored==="rose")setPlusTheme(stored);
  }catch{/* Private mode */}
  void apiFetch("/api/plus",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
   .then(async response=>{
    const body=await response.json() as {ok?:boolean;active?:boolean};
    if(alive&&response.ok&&body.ok)setPlusActive(body.active===true);
   }).catch(()=>{if(alive)setPlusActive(false)});
  return()=>{alive=false};
 },[token,room?.roomId]);
 function changePlusTheme(theme:PlusTheme){
  if(!plusActive||!room)return;
  setPlusTheme(theme);
  try{localStorage.setItem("lr-plus-theme-v1:"+room.roomId,theme)}catch{}
 }
 const [e2eeBusy,setE2eeBusy]=useState(false);
 const [e2eeBackup,setE2eeBackup]=useState("");
 const [e2eeOwnCode,setE2eeOwnCode]=useState("");
 const [e2eePartnerCode,setE2eePartnerCode]=useState("");
 const [e2eeDeviceReady,setE2eeDeviceReady]=useState(false);
 const [e2eeVerified,setE2eeVerified]=useState(false);
 const avatars=useProfileAvatars(token,room?.user.id,room?.user.avatarVersion,room?.partnerId,room?.partnerAvatarVersion);
 useEffect(()=>{
  let alive=true;
  setE2eeBackup("");
  const memberId=room?.user.id;
  if(memberId)void encryptedBackupFor(memberId).then(v=>{if(alive)setE2eeBackup(v||"")}).catch(()=>{});
  return()=>{alive=false};
 },[room?.user.id]);
 useEffect(()=>{
  let alive=true;const rm=room;
  if(!rm?.e2ee?.mine){setE2eeOwnCode("");setE2eePartnerCode("");setE2eeDeviceReady(false);setE2eeVerified(false);return}
  void (async()=>{
   const identity=await loadIdentity(rm.user.id);
   const own=await fingerprint(rm.e2ee!.mine!);
   const partner=rm.e2ee!.partner?await fingerprint(rm.e2ee!.partner):"";
   if(!alive)return;
   const recovered=rm.partnerId&&rm.e2ee?.partner?
    await loadRecoveredRoomKey({roomId:rm.roomId,mineId:rm.user.id,partnerId:rm.partnerId,
     minePublicKey:rm.e2ee.mine!,partnerPublicKey:rm.e2ee.partner}):null;
   setE2eeDeviceReady(Boolean(identity&&identity.publicKey===rm.e2ee!.mine||recovered));
   setE2eeOwnCode(own);setE2eePartnerCode(partner);
   setE2eeVerified(Boolean(partner&&rm.partnerId&&isPartnerVerified(rm.roomId,rm.partnerId,partner)));
  })().catch(()=>{if(alive){setE2eeDeviceReady(false);setE2eeVerified(false)}});
  return()=>{alive=false};
 },[room?.roomId,room?.user.id,room?.partnerId,room?.e2ee?.mine,room?.e2ee?.partner]);
 const profilePicker=useRef<HTMLInputElement|null>(null);
 const [profileFile,setProfileFile]=useState<File|null>(null);
 const [partnerPhotoOpen,setPartnerPhotoOpen]=useState(false);
 const [partnerPresenceOpen,setPartnerPresenceOpen]=useState(false);
 const partnerPresenceTrigger=useRef<HTMLButtonElement|null>(null);
 const closePartnerPresence=useCallback(()=>setPartnerPresenceOpen(false),[]);
 const [profileBusy,setProfileBusy]=useState(false);
 const [profileError,setProfileError]=useState("");
 const [initializing,setInitializing]=useState(true);
 const [joinMode,setJoinMode]=useState(false);
 const [name,setName]=useState("");
 const [code,setCode]=useState("");
 const [recoverMode,setRecoverMode]=useState(false);
 const [recoverInput,setRecoverInput]=useState("");
 const [recoveryCode,setRecoveryCode]=useState("");
 const [recoveryBusy,setRecoveryBusy]=useState(false);
 const [tab,setTab]=useState<Tab>(()=>parseNotice(window.location.search)?.tab||"home");
 const [nextAutoVoiceId,setNextAutoVoiceId]=useState<string|null>(null);
 const [voiceSpeed,setVoiceSpeed]=useState<VoiceSpeed>(1);
 const [callHistory,setCallHistory]=useState<CallHistoryEvent[]>([]);
 const [screenshotHistory,setScreenshotHistory]=useState<ScreenshotEvent[]>([]);
 const [callClockOffset,setCallClockOffset]=useState(0);
 // A recovered/different private room must never see the previous couple's call cards.
 useEffect(()=>{setCallHistory([]);setCallClockOffset(0);setScreenshotHistory([])},[room?.roomId,token]);
 // Leave chat / switch couple: never auto-start an old private message.
 useEffect(()=>{setNextAutoVoiceId(null)},[tab,room?.roomId]);
 useEffect(()=>{setPartnerPresenceOpen(false)},[tab,room?.roomId]);
 const currentTab=useRef(tab);
 currentTab.current=tab;
 const chatReturnTab=useRef<Tab>("home");
 const [noticeTarget,setNoticeTarget]=useState<NoticeTarget|null>(()=>parseNotice(window.location.search));
 const lastHandledNotice=useRef<string>("");
 const lastMessageJump=useRef<string>("");
 const [focusMessage,setFocusMessage]=useState<Message|null>(null);
 const [focusLoading,setFocusLoading]=useState(false);
 const [focusError,setFocusError]=useState("");
 const [focusMedia,setFocusMedia]=useState("");
 const focusAsset=useRef("");
 function closeNotice(){
  lastMessageJump.current="";
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
  setPartnerPhotoOpen(false);
  setStickerOpen(false);
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
 const [stickerOpen,setStickerOpen]=useState(false);
 const [replyTarget,setReplyTarget]=useState<Message|null>(null);
 const [actionMessageId,setActionMessageId]=useState<string|null>(null);
 const [extraReactionsOpen,setExtraReactionsOpen]=useState(false);
 const [actionPosition,setActionPosition]=useState<{left:number;top:number}|null>(null);
 const actionPopoverRef=useRef<HTMLDivElement|null>(null);
 const [infoMessageId,setInfoMessageId]=useState<string|null>(null);
 const [editTarget,setEditTarget]=useState<Message|null>(null);
 const composerBeforeEdit=useRef<{draft:string;reply:Message|null}|null>(null);
 const chatInput=useRef<HTMLInputElement|null>(null);
 const swipe=useRef<{id:string;x:number;y:number;cancelled:boolean;held:boolean;holdOnly:boolean;timer:number|null}|null>(null);
 const suppressHeldClickUntil=useRef(0);
 const [chatFocused,setChatFocused]=useState(false);
 const [chatAtBottom,setChatAtBottom]=useState(true);
 const chatAtBottomRef=useRef(true);
 const [partnerActivity,setPartnerActivity]=useState<{partnerTypingUntil:number;partnerRecordingUntil:number;partnerLastSeenAt:number}|null>(null);
 const [presenceNow,setPresenceNow]=useState(()=>Date.now());
 const chatScroller=useRef<HTMLDivElement|null>(null);
 const snapshotStarted=useRef(0);
 const snapshotApplied=useRef(0);
 const snapshotInFlight=useRef("");
 const roomRevisionRef=useRef(0);
 roomRevisionRef.current=Number(room?.revision||0);
 const scrollFrame=useRef<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [olderMessages,setOlderMessages]=useState<Message[]>([]);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [historyMore,setHistoryMore]=useState(true);
 const [historyError,setHistoryError]=useState("");
 const historyScrollAnchor=useRef<{height:number;top:number}|null>(null);
 useEffect(()=>{setOlderMessages([]);setHistoryMore(true);setHistoryError("")},[token,room?.roomId]);
 useEffect(()=>{
  if(!historyScrollAnchor.current||!chatScroller.current)return;
  const prior=historyScrollAnchor.current;historyScrollAnchor.current=null;
  chatScroller.current.scrollTop=prior.top+(chatScroller.current.scrollHeight-prior.height);
 },[olderMessages]);
 const [media,setMedia]=useState<Record<string,string>>({});
 const [mediaErrors,setMediaErrors]=useState<Record<string,string>>({});
 const mediaRetries=useRef<Record<string,number>>({});
 const mediaRetryTimers=useRef<Record<string,number>>({});
 const mediaFailures=useRef<Record<string,number>>({});
 const [voiceOutbox,setVoiceOutbox]=useState<LocalVoice[]>([]);
 const [textOutbox,setTextOutbox]=useState<LocalText[]>([]);
 const sendingVoiceIds=useRef(new Set<string>());
 const sendingTextIds=useRef(new Set<string>());
 const chatMessages=useMemo(()=>mergeOptimisticMessages([...olderMessages,...(room?.messages||[])],[
  ...voiceOutbox.map(entry=>({
   id:entry.id,sender_id:room?.user.id||"",kind:"audio" as const,
   content:null,object_key:entry.id,mime:entry.file.type,created_at:entry.created_at
  })),
  ...textOutbox.map(entry=>({
   id:entry.id,sender_id:room?.user.id||"",kind:"text" as const,
   content:entry.text,object_key:null,mime:null,created_at:entry.created_at,
   reply_to_id:entry.replyToId||null,reply_kind:entry.replyKind||null,
   reply_content:entry.replyContent||null,reply_sender_id:entry.replySenderId||null
  }))
 ]),[olderMessages,room?.messages,room?.user.id,voiceOutbox,textOutbox]);
 const chatTimeline=useMemo<ChatTimelineItem[]>(()=>[
  ...chatMessages.map((message,index)=>({type:"message" as const,message,index,createdAt:message.created_at})),
  ...callHistory.map(call=>({type:"call" as const,call,createdAt:call.createdAt})),
  ...screenshotHistory.map(event=>({type:"screenshot" as const,event,createdAt:event.created_at}))
 ].sort((a,b)=>a.createdAt-b.createdAt),[chatMessages,callHistory,screenshotHistory]);
 // These are room-scoped server events, not fabricated chat messages.
 useEffect(()=>{
  if(!token||!room?.roomId){setCallHistory([]);return}
  if(tab!=="chat")return;
  let stopped=false,inFlight=false;
  const poll=async()=>{
   if(inFlight||document.visibilityState==="hidden")return;
   inFlight=true;
   try{
    const res=await apiFetch("/api/call?history=1",{
     headers:{Authorization:"Bearer "+token},cache:"no-store"
    });
    if(!res.ok)return;
    const payload=await res.json() as {ok:boolean;calls?:CallHistoryEvent[];serverNow?:number};
    if(!stopped&&payload.ok&&Array.isArray(payload.calls)){
     const calls=payload.calls.filter(item=>typeof item.id==="string"&&typeof item.createdAt==="number");
     setCallHistory(prev=>JSON.stringify(prev)===JSON.stringify(calls)?prev:calls);
     if(typeof payload.serverNow==="number")setCallClockOffset(payload.serverNow-Date.now());
    }
   }catch{/* The existing chat and call are still usable during a temporary log outage. */}
   finally{inFlight=false}
  };
  void poll();
  const interval=window.setInterval(()=>void poll(),2400);
  const onVisible=()=>{if(document.visibilityState==="visible")void poll()};
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("focus",onVisible);
  return()=>{stopped=true;window.clearInterval(interval);
   document.removeEventListener("visibilitychange",onVisible);
   window.removeEventListener("focus",onVisible)};
 },[token,room?.roomId,tab]);
 // Native iPhone screenshots are observed AFTER capture. Android uses
 // FLAG_SECURE to block captures; Safari PWA cannot report them.
 useEffect(()=>{
  if(!token||!room?.roomId||!screenshotDetectionAvailable())return;
  let closed=false;
  let stop:(()=>void)|null=null;
  const onTaken=()=>{
   if(closed)return;
   const id=crypto.randomUUID();
   void apiFetch("/api/screenshot",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"taken",id})
   }).then(async res=>{
    const data=await res.json() as {ok:boolean;saved?:boolean;error?:string};
    if(closed)return;
    if(res.ok&&data.ok&&data.saved){
     setNotice("📸 Capture signalée à ton partenaire.");
     if(currentTab.current==="chat")void refresh(undefined,true);
    }else if(res.status!==429){
     setNotice("📸 Capture détectée, mais le signalement n'a pas pu être envoyé.");
    }
   }).catch(()=>{
    if(!closed)setNotice("📸 Capture détectée hors connexion : partenaire non averti.");
   });
  };
  void watchNativeScreenshots(onTaken).then(cleanup=>{
   if(closed)cleanup();
   else stop=cleanup;
  }).catch(err=>console.warn("Screenshot detection unavailable",err));
  return()=>{closed=true;stop?.()};
 },[token,room?.roomId]);

 // Screenshot notices are server-owned event cards, not screenshot images and
 // not user-editable messages. Each partner sees the same private timeline.
 useEffect(()=>{
  if(!token||!room?.roomId){setScreenshotHistory([]);return}
  if(tab!=="chat")return;
  let disposed=false,busy=false;
  const poll=async()=>{
   if(disposed||busy||document.visibilityState==="hidden")return;
   busy=true;
   try{
    const res=await apiFetch("/api/screenshot",{
     headers:{Authorization:"Bearer "+token},cache:"no-store"
    });
    if(!res.ok)return;
    const result=await res.json() as {ok:boolean;events?:ScreenshotEvent[]};
    if(!disposed&&result.ok&&Array.isArray(result.events)){
     const events=result.events.filter(item=>typeof item.id==="string"&&
      typeof item.member_id==="string"&&typeof item.created_at==="number");
     setScreenshotHistory(prev=>JSON.stringify(prev)===JSON.stringify(events)?prev:events);
    }
   }catch{/* Ordinary messaging still works if private events are unavailable. */}
   finally{busy=false}
  };
  void poll();
  const id=window.setInterval(()=>void poll(),3200);
  const onVisible=()=>{if(document.visibilityState==="visible")void poll()};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{disposed=true;window.clearInterval(id);document.removeEventListener("visibilitychange",onVisible)};
 },[token,room?.roomId,tab]);

 const actionMessage=chatMessages.find(m=>m.id===actionMessageId)||null;
 // The long-press menu follows the selected chat bubble, not the bottom dock.
 // Measure the rendered popover so it remains fully visible near both edges
 // of the iPhone viewport and after a rotation or keyboard dismissal.
 useLayoutEffect(()=>{
  if(!actionMessageId)return;
  let frame:number|undefined;
  const place=()=>{
   const popup=actionPopoverRef.current;
   const row=document.getElementById("lr-chat-message-"+actionMessageId);
   const selected=row?.querySelector(".lr-bubble-stack") as HTMLElement|null;
   if(!popup)return;
   const visual=window.visualViewport;
   const viewportLeft=visual?.offsetLeft??0;
   const viewportTop=visual?.offsetTop??0;
   const viewportWidth=visual?.width??window.innerWidth;
   const viewportHeight=visual?.height??window.innerHeight;
   const bounds=(selected||row)?.getBoundingClientRect();
   const popupRect=popup.getBoundingClientRect();
   const margin=12;
   const mine=Boolean(row?.classList.contains("mine"));
   const leftEdge=viewportLeft+margin;
   const rightEdge=viewportLeft+viewportWidth-margin-popupRect.width;
   const desiredLeft=bounds?(mine?bounds.right-popupRect.width:bounds.left):
    viewportLeft+(viewportWidth-popupRect.width)/2;
   const left=Math.max(leftEdge,Math.min(Math.max(leftEdge,rightEdge),desiredLeft));
   const topEdge=viewportTop+Math.max(14,viewportHeight*.035);
   const bottomEdge=viewportTop+viewportHeight-margin-popupRect.height;
   const desiredTop=bounds?bounds.top-63:viewportTop+(viewportHeight-popupRect.height)/2;
   const top=Math.max(topEdge,Math.min(Math.max(topEdge,bottomEdge),desiredTop));
   setActionPosition(prev=>prev&&Math.abs(prev.left-left)<.6&&Math.abs(prev.top-top)<.6?prev:{left,top});
  };
  const schedule=()=>{if(frame!==undefined)cancelAnimationFrame(frame);frame=requestAnimationFrame(place)};
  // Place synchronously so iOS cannot remain in an invisible menu state.
  place();
  window.addEventListener("resize",schedule);
  window.visualViewport?.addEventListener("resize",schedule);
  window.visualViewport?.addEventListener("scroll",schedule);
  return()=>{
   if(frame!==undefined)cancelAnimationFrame(frame);
   window.removeEventListener("resize",schedule);
   window.visualViewport?.removeEventListener("resize",schedule);
   window.visualViewport?.removeEventListener("scroll",schedule);
  };
 },[actionMessageId,extraReactionsOpen]);
 const infoMessage=chatMessages.find(m=>m.id===infoMessageId)||null;
 const [recording,setRecording]=useState(false);
 const [recordingPaused,setRecordingPaused]=useState(false);
 const [recordingElapsed,setRecordingElapsed]=useState(0);
 const recordingStartedAt=useRef<number|null>(null);
 const recordingAccumulatedMs=useRef(0);
 const recorder=useRef<MediaRecorder|null>(null);
 const recordingStream=useRef<MediaStream|null>(null);
 const recordingStarting=useRef(false);
 const recordingRequestId=useRef(0);
 const recordingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const mediaCache=useRef<Record<string,string>>({});
 const tail=useRef<HTMLDivElement|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const firstPoll=useRef(true);
 const lastReadSent=useRef(0);
 const lastDeliveredSent=useRef(0);
 useEffect(()=>{lastReadSent.current=0;lastDeliveredSent.current=0},[token]);
 useEffect(()=>()=>{if(swipe.current?.timer!==null&&swipe.current?.timer!==undefined)clearTimeout(swipe.current.timer)},[]);
 const lastTypingSent=useRef(0);
 const typingActive=useRef(false);
 const recordingActive=useRef(false);
 const discardRecording=useRef(false);
 useEffect(()=>{
  const uninstall=installAudioPlaybackGuard();
  const onInterrupt=(event:Event)=>{
   const focus=(event as CustomEvent<AudioInterrupt>).detail;
   if(focus?.source!=="call")return;
   recordingRequestId.current+=1; // Cancel a pending getUserMedia result too.
   if(recorder.current&&recorder.current.state!=="inactive")finishRecording(false);
  };
  window.addEventListener("lr-audio-interrupt",onInterrupt);
  return()=>{
   window.removeEventListener("lr-audio-interrupt",onInterrupt);
   uninstall();
   recordingRequestId.current+=1;
   discardRecording.current=true;
   if(recorder.current?.state!=="inactive")try{recorder.current?.stop()}catch{}
   recordingStream.current?.getTracks().forEach(track=>track.stop());
   releaseRecordingAudio();
  };
 },[]);

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
 function chooseProfileFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  if(file.size>12_000_000){setProfileError("Choisis une photo de moins de 12 Mo.");return}
  if(!file.type.startsWith("image/")){setProfileError("Sélectionne une photo valide.");return}
  setProfileError("");setProfileFile(file);
 }
 async function saveProfilePhoto(photo:File){
  if(!token||profileBusy)return;
  setProfileBusy(true);setProfileError("");
  try{
   const body=new FormData();body.append("photo",photo);
   const response=await apiFetch("/api/profile",{
    method:"POST",headers:{Authorization:"Bearer "+token},body
   });
   const result=await response.json() as {ok:boolean;error?:string};
   if(!response.ok||!result.ok)throw Error(result.error||"Impossible d’enregistrer la photo.");
   setProfileFile(null);
   await refresh(undefined,true);
   setNotice("Ta nouvelle photo de profil est enregistrée.");
  }catch(err){
   const message=err instanceof Error?err.message:"Enregistrement impossible.";
   setProfileError(message);
   throw Error(message);
  }finally{setProfileBusy(false)}
 }
 async function removeProfilePhoto(){
  if(!token||!room?.user.avatarVersion||profileBusy)return;
  if(!window.confirm("Supprimer ta photo de profil ? Ton initiale sera affichée à la place."))return;
  setProfileBusy(true);setProfileError("");
  try{
   const response=await apiFetch("/api/profile",{method:"DELETE",headers:{Authorization:"Bearer "+token}});
   const result=await response.json() as {ok:boolean;error?:string};
   if(!response.ok||!result.ok)throw Error(result.error||"Impossible de supprimer la photo.");
   await refresh(undefined,true);
   setNotice("Photo de profil supprimée.");
  }catch(err){setProfileError(err instanceof Error?err.message:"Suppression impossible.")}
  finally{setProfileBusy(false)}
 }
 async function adjustProfilePhoto(){
  if(!avatars.mine||profileBusy)return;
  try{
   const blob=await (await fetch(avatars.mine)).blob();
   setProfileFile(new File([blob],"photo-de-profil.jpg",{type:"image/jpeg"}));setProfileError("");
  }catch{setProfileError("Photo momentanément indisponible. Choisis-la à nouveau.")}
 }
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
    if(result.outcome==="accepted"){setCanInstall(false);setNotice("Installation lancée ❤️")}
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
     setNotice("lr-partner-push:"+String(data.kind||"message"));
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
     // ACK only after React has accepted this exact destination. The SW
     // retains it until acknowledgment, even if iOS first opens home.
     const routeId=typeof data.routeId==="string"?data.routeId:"";
     if(routeId){
      (event.source as ServiceWorker|null)?.postMessage({
       type:"love-radar-ack-notification",routeId
      });
      if(lastHandledNotice.current===routeId)return;
      lastHandledNotice.current=routeId;
     }
     window.history.replaceState(null,"",noticeUrl(dest));
     setNoticeTarget(dest);
     setTab(dest.tab);setWatchInvite(null);setReconcileInvite(false);firstPoll.current=true;
    }
   }else if(["chat","watch","watch-tiktok","games","ludo-room","ludo","ludo-solo","ludo-senegal","ludo-senegal-solo","memory","rps","draw","escape" ,"moment","together","life","puzzle","reconcile","reunion","story","home","memories"].includes(data?.tab)){
    const dest=data.tab as Tab;
    setTab(dest);setNoticeTarget({tab:dest,kind:null,id:null});if(dest==="reconcile")setReconcileInvite(false);firstPoll.current=true;
   }
  };
  const onRoute=()=>{
   const dest=parseNotice(window.location.search);
   if(dest){setNoticeTarget(dest);setTab(dest.tab);firstPoll.current=true}
  };
  const requestPendingNotification=()=>{
   navigator.serviceWorker?.controller?.postMessage({type:"love-radar-request-pending-notification"});
  };
  const onPageShow=()=>{
   onRoute();
   requestPendingNotification();
  };
  navigator.serviceWorker?.addEventListener("message",onMessage);
  window.addEventListener("popstate",onRoute);
  window.addEventListener("pageshow",onPageShow);
  // On a cold iOS PWA launch the manifest can reopen "/" despite a push deep
  // link. The worker hands over the tapped destination after React mounts.
  requestPendingNotification();
  void navigator.serviceWorker?.ready.then(reg=>{
   (navigator.serviceWorker?.controller||reg.active)?.postMessage({
    type:"love-radar-request-pending-notification"
   });
  }).catch(()=>{});
  return()=>{
   navigator.serviceWorker?.removeEventListener("message",onMessage);
   window.removeEventListener("popstate",onRoute);
   window.removeEventListener("pageshow",onPageShow);
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
    if(!cancelled){
     let context:CryptoContext|null=null;
     if(room?.e2ee?.required)try{context=await cryptoFor(room)}catch{/* No key yet. */}
     const [message]=await revealMessages([data.focusMessage],context);
     setFocusMessage(message);
    }
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
   .then(async blob=>{
    if(isEncryptedMedia(m.mime)){
     if(!room)throw Error("Clé manquante");
     blob=await decryptMedia(await cryptoFor(room),blob,m.kind as "image"|"audio",m.id,m.sender_id);
    }
    return blob;
   })
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
   setNotificationsHint("Les notifications push ne sont pas disponibles sur ce navigateur. Utilise Chrome sur Android ou ajoute l’application à l’écran d’accueil de l’iPhone.");
   return;
  }
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent)&&!isStandalone()){
   setNotificationsHint("Sur iPhone : Safari → Partager → Sur l’écran d’accueil. Ouvre ensuite l’application depuis son icône, puis active les notifications.");
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
   setNotificationsHint("Test accepté par le service push. Vérifie la notification sur ton téléphone, même lorsque l’application est fermée.");
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
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),15000);
  try{
   const res=await apiFetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json",...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...body}),signal:controller.signal});
   const data=await res.json() as Result;
   if(!res.ok||!data.ok){
    const failure=new Error(data.error||"Une erreur est survenue.") as Error&{httpStatus?:number};
    failure.httpStatus=res.status;
    throw failure;
   }
   return data;
  }catch(error){
   if(controller.signal.aborted)throw Error("La connexion prend trop de temps. Réessaie.");
   throw error;
  }finally{window.clearTimeout(timeout)}
 },[token]);

 async function cryptoFor(rm:Room):Promise<CryptoContext>{
  if(!rm.e2ee?.mine||!rm.e2ee.partner||!rm.partnerId||!rm.e2ee.required)
   throw Error("Les deux partenaires doivent activer le chiffrement.");
  return makeContext({roomId:rm.roomId,mineId:rm.user.id,partnerId:rm.partnerId,
   minePublicKey:rm.e2ee.mine,partnerPublicKey:rm.e2ee.partner});
 }
 async function encryptedOutgoing(text:string,id:string,rm:Room):Promise<string>{
  if(rm.e2ee?.mine&&!rm.e2ee?.required)
   throw Error("Le chiffrement est activé pour toi. Attends que ton partenaire l’active aussi.");
  if(!rm.e2ee?.required)return text;
  return encryptText(await cryptoFor(rm),text,id);
 }

 async function enableE2EE(passphrase:string){
  const rm=room;if(!rm||e2eeBusy||rm.e2ee?.mine)return;
  setE2eeBusy(true);setError("");
  try{
   const created=await ensureIdentity(rm.user.id,passphrase);
   setE2eeBackup(created.encryptedBackup);
   setNotice("Clé privée créée. Télécharge sa sauvegarde et conserve la phrase secrète avant l’activation.");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de préparer la clé chiffrée.")}
  finally{setE2eeBusy(false)}
 }
 async function completeE2EE(){
  const rm=room;if(!rm||e2eeBusy||rm.e2ee?.mine)return;
  setE2eeBusy(true);setError("");
  try{
   const identity=await loadIdentity(rm.user.id);
   const backup=await encryptedBackupFor(rm.user.id);
   if(!identity||!backup)throw Error("Sauvegarde préalable obligatoire.");
   await request("enable-e2ee",{publicKey:identity.publicKey});
   await refresh(undefined,true);
   setNotice("Chiffrement activé sur ce téléphone. Ton partenaire doit aussi activer sa clé.");
  }catch(e){setError(e instanceof Error?e.message:"Activation impossible.")}
  finally{setE2eeBusy(false)}
 }
 async function restoreE2EE(file:File,passphrase:string){
  const rm=room;
  if(!rm?.e2ee?.mine||e2eeBusy)return;
  setE2eeBusy(true);setError("");
  try{
   if(file.size>4000)throw Error("Sauvegarde trop volumineuse.");
   const encrypted=await file.text();
   await restoreIdentityBackup(rm.user.id,encrypted,passphrase,rm.e2ee.mine);
   setE2eeBackup(encrypted);setE2eeDeviceReady(true);
   await refresh(undefined,true);
   setNotice("Clé privée restaurée sur ce téléphone.");
  }catch(e){setError(e instanceof Error?e.message:"Restauration de clé impossible.")}
  finally{setE2eeBusy(false)}
 }
 async function approvePartnerKey(){
  const rm=room,code=e2eePartnerCode;
  if(!rm?.partnerId||!code||e2eeBusy)return;
  if(!window.confirm("As-tu comparé cette empreinte complète avec ton partenaire en personne ou lors d’un appel ? Ne confirme pas sans comparaison réelle.\\n\\n"+code))return;
  try{verifyPartner(rm.roomId,rm.partnerId,code);setE2eeVerified(true);await refresh(undefined,true)}
  catch{setError("Impossible de sauvegarder la vérification sur cet appareil.")}
 }
 async function sendBackgroundText(text:string){
  const rm=room;if(!rm)throw Error("Espace indisponible.");
  const id=crypto.randomUUID();
  await request("message",{text:await encryptedOutgoing(text,id,rm),messageId:id});
  await refresh(undefined,true);
 }
 const refresh=useCallback(async(key?:string,silent=false)=>{
  const t=key||token;
  if(!t||snapshotInFlight.current===t)return;
  snapshotInFlight.current=t;
  const sequence=++snapshotStarted.current;
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),12000);
  try{
   const res=await apiFetch("/api/love",{headers:{Authorization:"Bearer "+t},cache:"no-store",signal:controller.signal});
   if(res.status===401){
    if(sequence>=snapshotApplied.current){
     snapshotApplied.current=sequence;
     clearSessionToken();setToken("");setRoom(null);setJoinMode(false);setRecoverMode(true);
     setError("Cette connexion n’est plus valide. Utilise ton code personnel de secours pour retrouver TON espace, sans en créer un nouveau.");
    }
    return;
   }
   const data=await res.json() as Result;
   if(!res.ok||!data.ok)throw Error(data.error||"Actualisation impossible.");
   // Overlapping network requests may complete out of order. Never replace
   // a newer conversation with an older response.
   if(sequence<snapshotApplied.current)return;
   snapshotApplied.current=sequence;
   const nextRoom=data as unknown as Room;
   let context:CryptoContext|null=null;
   if(nextRoom.e2ee?.required)try{context=await cryptoFor(nextRoom)}catch{/* No plaintext fallback. */}
   nextRoom.messages=await revealMessages(nextRoom.messages||[],context);
   if(nextRoom.recentReaction?.content&&isEncryptedText(nextRoom.recentReaction.content))
    nextRoom.recentReaction={...nextRoom.recentReaction,content:"Message chiffré"};
   // Ignore unchanged snapshots so polling cannot redraw the whole interface.
   setRoom(previous=>previous&&JSON.stringify(previous)===JSON.stringify(nextRoom)?previous:nextRoom);
   if(!silent)setError("");
  }catch(e){if(!silent)setError(connectionErrorMessage(e,controller.signal.aborted,typeof navigator!=="undefined"&&navigator.onLine===false))}
  finally{
   window.clearTimeout(timeout);
   if(snapshotInFlight.current===t)snapshotInFlight.current="";
  }
 },[token]);
 useEffect(()=>{
  let active=true;
  const q=new URLSearchParams(window.location.search);
  const invite=q.get("join");
  if(invite){setJoinMode(true);setCode(invite.toUpperCase())}
  void recoverSavedSession().then(saved=>{
   if(!active)return;
   if(saved){
    setToken(saved);
    void refresh(saved).finally(()=>{if(active)setInitializing(false)});
   }else{
    // Returning members should NOT be encouraged to create a second couple.
    if(hadPreviousSession()&&!invite)setRecoverMode(true);
    setInitializing(false);
   }
  }).catch(()=>{
   if(active){if(hadPreviousSession()&&!invite)setRecoverMode(true);setInitializing(false)}
  });
  return()=>{active=false};
 },[]);
 // The saved session is valid until the server explicitly says 401.
 // A mobile data handoff (Wi-Fi -> 4G) or iOS resume must not strand partners
 // on a permanent "Load failed" page: retry without deleting any credentials.
 useEffect(()=>{
  if(!token||room||initializing||recoverMode)return;
  const retry=()=>{
   if(document.visibilityState==="visible")void refresh(undefined,false);
  };
  const startupRetry=window.setTimeout(retry,4000);
  const interval=window.setInterval(retry,15000);
  window.addEventListener("online",retry);
  window.addEventListener("pageshow",retry);
  document.addEventListener("visibilitychange",retry);
  return()=>{
   window.clearTimeout(startupRetry);
   window.clearInterval(interval);
   window.removeEventListener("online",retry);
   window.removeEventListener("pageshow",retry);
   document.removeEventListener("visibilitychange",retry);
  };
 },[token,room,initializing,recoverMode,refresh]);
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
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void refresh(undefined,true)},tab==="chat"?15000:30000);
  const onFocus=()=>{void refresh(undefined,true)};
  window.addEventListener("focus",onFocus);
  return()=>{clearInterval(interval);window.removeEventListener("focus",onFocus)};
 },[token,refresh,tab]);
 // Lightweight status-only fetch avoids reloading 90 messages just to see
 // the typing or voice-recording indicator on the partner's iPhone.
 useEffect(()=>{
  if((tab!=="chat"&&tab!=="home")||!token||!room?.roomId){setPartnerActivity(null);return}
  let stopped=false,controller:AbortController|null=null,timer:number|null=null;
  const poll=async()=>{
   if(stopped)return;
   if(document.visibilityState==="visible"){
    controller=new AbortController();
    const timeout=window.setTimeout(()=>controller?.abort(),6500);
    try{
     const res=await apiFetch("/api/love?status=1",{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal});
     const data=await res.json() as Result;
     if(!stopped&&res.ok&&data.ok){
      const next={
       partnerTypingUntil:Number(data.partnerTypingUntil||0),
       partnerRecordingUntil:Number(data.partnerRecordingUntil||0),
       partnerLastSeenAt:Number(data.partnerLastSeenAt||0)
      };
      setPartnerActivity(previous=>previous&&previous.partnerTypingUntil===next.partnerTypingUntil&&
       previous.partnerRecordingUntil===next.partnerRecordingUntil&&previous.partnerLastSeenAt===next.partnerLastSeenAt?previous:next);
      // Refresh a chat only after a change to this couple's room, not every second.
      if(typeof data.revision==="number"&&data.revision!==roomRevisionRef.current)
       void refresh(undefined,true);
     }
    }catch{/* Temporary status failures are retried; the last presence expires naturally. */}
    finally{window.clearTimeout(timeout);controller=null}
   }
   if(!stopped)timer=window.setTimeout(poll,tab==="chat"?1750:4800);
  };
  void poll();
  return()=>{stopped=true;controller?.abort();if(timer!==null)clearTimeout(timer)};
 },[tab,token,room?.roomId,room?.partner,refresh]);
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
 // A single check means stored on the server; two checks require a receipt
 // from the partner's visible app. Simply being "online" is not proof of delivery.
 useEffect(()=>{
  if(!token||!room)return;
  const acknowledge=()=>{
   if(document.visibilityState!=="visible")return;
   const newest=[...room.messages].reverse().find(m=>m.sender_id!==room.user.id);
   if(!newest||newest.created_at<=lastDeliveredSent.current)return;
   lastDeliveredSent.current=newest.created_at;
   void request("delivered",{messageId:newest.id}).catch(()=>{lastDeliveredSent.current=0});
  };
  acknowledge();
  const retry=window.setInterval(acknowledge,12000);
  document.addEventListener("visibilitychange",acknowledge);
  return()=>{window.clearInterval(retry);document.removeEventListener("visibilitychange",acknowledge)};
 },[room?.messages,room?.user.id,token,request]);
 useEffect(()=>{
  if(tab!=="chat"||!token||!room)return;
  const acknowledgeRead=()=>{
   if(document.visibilityState!=="visible")return;
   const newest=[...room.messages].reverse().find(m=>m.sender_id!==room.user.id);
   const latestReaction=room.recentReaction?.member_id!==room.user.id?Number(room.recentReaction?.updated_at||0):0;
   const latestIncoming=Math.max(newest?.created_at||0,latestReaction);
   if(latestIncoming<=lastReadSent.current)return;
   lastReadSent.current=latestIncoming;
   void request("read").catch(()=>{lastReadSent.current=0});
  };
  acknowledgeRead();
  const retry=window.setInterval(acknowledgeRead,12000);
  document.addEventListener("visibilitychange",acknowledgeRead);
  return()=>{window.clearInterval(retry);document.removeEventListener("visibilitychange",acknowledgeRead)};
 },[tab,room?.messages,room?.recentReaction?.updated_at,room?.recentReaction?.member_id,room?.user.id,token,request]);
 useEffect(()=>{
  if(tab!=="chat"&&typingActive.current){
   typingActive.current=false;
   void request("typing",{active:false}).catch(()=>{});
  }
  if(tab!=="chat"&&recordingActive.current){
   discardRecording.current=true;
   if(recorder.current?.state!=="inactive")recorder.current?.stop();
   recordingActive.current=false;
   void request("recording",{active:false}).catch(()=>{});
  }
 },[tab,request]);
 async function loadEarlierHistory(){
  if(!room||!token||historyBusy||!historyMore)return;
  const all=[...olderMessages,...room.messages].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id));
  const first=all[0];if(!first)return;
  setHistoryBusy(true);setHistoryError("");
  const element=chatScroller.current;
  historyScrollAnchor.current=element?{height:element.scrollHeight,top:element.scrollTop}:null;
  try{
   const cursor=first.created_at+":"+first.id;
   const res=await apiFetch("/api/love?historyBefore="+encodeURIComponent(cursor),{
    headers:{Authorization:"Bearer "+token},cache:"no-store"
   });
   const data=await res.json() as {ok:boolean;error?:string;messages?:Message[];hasMore?:boolean};
   if(!res.ok||!data.ok)throw Error(data.error||"Impossible de charger les anciens messages.");
   let context:CryptoContext|null=null;
   if(room.e2ee?.required)try{context=await cryptoFor(room)}catch{/* preserve locked placeholders */}
   const decoded=await revealMessages(data.messages||[],context);
   setOlderMessages(items=>{
    const combined=new Map(items.map(m=>[m.id,m]));
    for(const item of decoded)combined.set(item.id,item);
    return [...combined.values()].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id));
   });
   setHistoryMore(Boolean(data.hasMore));
  }catch(e){
   historyScrollAnchor.current=null;
   setHistoryError(e instanceof Error?e.message:"Chargement de l’historique impossible.");
  }finally{setHistoryBusy(false)}
 }
 // Verify that a media response actually contains decodable image bytes. A
 // failed photo used to disappear silently, leaving an empty narrow rectangle.
 async function fetchMedia(item:Message,force=false){
  if(!token||!item.object_key||item.view_once)return;
  const id=item.id;
  // A permanently missing file is retried only when the user explicitly taps
  // Retry. New messages must not restart an exhausted background retry loop.
  if(!force&&(mediaFailures.current[id]||0)>MEDIA_AUTO_RETRY_LIMIT)return;
  if(mediaCache.current[id])return;
  if(!force&&Date.now()<(mediaRetries.current[id]||0))return;
  mediaCache.current[id]="pending";
  const controller=new AbortController();
  // A disconnected iPhone must not leave photo/audio loading permanently pending.
  const timeout=window.setTimeout(()=>controller.abort(),12000);
  try{
   const response=await apiFetch("/api/media?id="+encodeURIComponent(item.object_key),{
    headers:{Authorization:"Bearer "+token},cache:"no-store",signal:controller.signal
   });
   if(!response.ok)throw new Error("HTTP "+response.status);
   let mime=(response.headers.get("content-type")||"").toLowerCase();
   let blob=await response.blob();
   if(isEncryptedMedia(item.mime)){
    if(!isEncryptedMedia(mime)||!room)throw Error("Média chiffré indisponible.");
    blob=await decryptMedia(await cryptoFor(room),blob,item.kind as "image"|"audio",item.id,item.sender_id);
    mime=blob.type;
   }
   if(item.kind==="image"&&!mime.startsWith("image/"))throw new Error("Incorrect photo MIME");
   if(item.kind==="audio"&&!mime.startsWith("audio/")&&!mime.startsWith("video/"))throw new Error("Incorrect sound MIME");
   if(blob.size===0)throw new Error("Empty file");
   const url=URL.createObjectURL(blob);
   if(item.kind==="image"){
    const image=new Image();image.src=url;
    try{await image.decode()}catch{URL.revokeObjectURL(url);throw new Error("Unable to decode photo")}
   }
   if(mediaCache.current[id]!=="pending"){URL.revokeObjectURL(url);return}
   mediaCache.current[id]=url;
   if(mediaRetryTimers.current[id]){
    window.clearTimeout(mediaRetryTimers.current[id]);delete mediaRetryTimers.current[id];
   }
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
   const delay=mediaRetryDelay(attempts);
   if(delay!==null){
    mediaRetries.current[id]=Date.now()+delay;
    if(!mediaRetryTimers.current[id]){
     mediaRetryTimers.current[id]=window.setTimeout(()=>{
      delete mediaRetryTimers.current[id];
      if(document.visibilityState==="visible")void fetchMedia(item,true);
     },delay);
    }
   }
   if(item.kind==="image")
    setMediaErrors(prev=>prev[id]?prev:{...prev,[id]:"Photo indisponible pour le moment."});
  }finally{window.clearTimeout(timeout)}
 }
 function retryMedia(item:Message){
  if(mediaRetryTimers.current[item.id]){
   window.clearTimeout(mediaRetryTimers.current[item.id]);delete mediaRetryTimers.current[item.id];
  }
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
 useEffect(()=>{
  if(!room||!token)return;
  for(const item of olderMessages){
   if(item.object_key&&!item.view_once&&!mediaCache.current[item.id])void fetchMedia(item);
  }
 },[olderMessages,token]);
 useEffect(()=>{
  const resumeMedia=()=>{
   if(document.visibilityState!=="visible")return;
   for(const item of room?.messages||[]){
    if(!item.object_key||item.view_once||mediaCache.current[item.id])continue;
    if((mediaFailures.current[item.id]||0)>0){
     if(mediaRetryTimers.current[item.id]){
      window.clearTimeout(mediaRetryTimers.current[item.id]);delete mediaRetryTimers.current[item.id];
     }
     // Recover once on reconnection; do not start infinite retry loops.
     if(mediaRetryDelay(mediaFailures.current[item.id])!==null)
      void fetchMedia(item,true);
    }
   }
  };
  const onVisible=()=>{if(document.visibilityState==="visible")resumeMedia()};
  window.addEventListener("online",resumeMedia);
  document.addEventListener("visibilitychange",onVisible);
  return()=>{window.removeEventListener("online",resumeMedia);document.removeEventListener("visibilitychange",onVisible)};
 },[room?.messages,token]);
 useEffect(()=>()=>{for(const timer of Object.values(mediaRetryTimers.current))window.clearTimeout(timer);mediaRetryTimers.current={}},[token]);
 // Retire the local item only once the matching server row is visible.
 useEffect(()=>{
  if(!room)return;
  const received=new Set(room.messages.map(m=>m.id));
  setVoiceOutbox(items=>{
   if(!items.some(item=>!shouldKeepVoiceDraft(item.status,received.has(item.id))))return items;
   return items.filter(item=>shouldKeepVoiceDraft(item.status,received.has(item.id)));
  });
 },[room?.messages,voiceOutbox]);
 // A sent text remains locally visible until its UUID appears in a server snapshot.
 useEffect(()=>{
  if(!room)return;
  const received=new Set(room.messages.map(message=>message.id));
  setTextOutbox(items=>{
   if(!items.some(item=>received.has(item.id)))return items;
   // Server truth supersedes even a failed local send whose acknowledgement was lost.
   return items.filter(item=>!received.has(item.id));
  });
 },[room?.messages]);
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
  const notified=noticeTarget?.id&&["message","photo","audio"].includes(noticeTarget.kind||"");
  if(!notified&&(firstPoll.current||chatFocused||closeToBottom))scrollToLatest();
  firstPoll.current=false;
 },[chatMessages.at(-1)?.id,callHistory.at(-1)?.id,callHistory.at(-1)?.status,tab,chatFocused,scrollToLatest,noticeTarget?.id,noticeTarget?.kind]);
 // A push to a recent message should land on its actual chat bubble, not
 // cover the entire conversation with a separate message popup.
 useEffect(()=>{
  const id=noticeTarget?.id;
  if(tab!=="chat"||!id||!["message","photo","audio"].includes(noticeTarget?.kind||""))return;
  if(!room?.messages.some(message=>message.id===id))return;
  if(lastMessageJump.current===id)return;
  const target=document.getElementById("lr-chat-message-"+id);
  if(!target)return;
  lastMessageJump.current=id;
  const frame=window.requestAnimationFrame(()=>{
   target.scrollIntoView({block:"center",behavior:"auto"});
  });
  return()=>window.cancelAnimationFrame(frame);
 },[tab,noticeTarget?.id,noticeTarget?.kind,room?.messages]);
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

 function finishApprovedPartnerRecovery(newToken:string){
  setError("");setToken(newToken);setRecoverMode(false);setRecoverInput("");
  setTab("chat");
  void refresh(newToken).then(()=>{
   setNotice("Compte retrouvé ! Tes anciens messages disponibles sur le serveur sont de nouveau accessibles.");
  });
 }
 async function issueRecoveryCode(){
  if(!token||recoveryBusy)return;
  setRecoveryBusy(true);setError("");
  try{
   const res=await apiFetch("/api/recovery",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"issue"})});
   const data=await res.json() as {ok:boolean;recoveryCode?:string;error?:string};
   if(!res.ok||!data.ok||!data.recoveryCode)throw Error(data.error||"Création du code impossible.");
   setRecoveryCode(data.recoveryCode);
  }catch(e){setError(e instanceof Error?e.message:"Création du code impossible.")}
  finally{setRecoveryBusy(false)}
 }
 async function restoreAccount(event:FormEvent){
  event.preventDefault();
  if(recoveryBusy||!recoverInput.trim())return;
  setRecoveryBusy(true);setError("");
  try{
   const res=await apiFetch("/api/recovery",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"recover",code:recoverInput})});
   const data=await res.json() as {ok:boolean;token?:string;recoveryCode?:string;error?:string};
   if(!res.ok||!data.ok||!data.token||!data.recoveryCode)
    throw Error(data.error||"Ce code de secours est incorrect ou a déjà servi.");
   persistSessionToken(data.token);
   setToken(data.token);
   await refresh(data.token);
   setRecoverInput("");setRecoverMode(false);setTab("home");
   setRecoveryCode(data.recoveryCode);
   setNotice("Compte retrouvé ! Ton ancien appareil est déconnecté.");
  }catch(e){setError(e instanceof Error?e.message:"Récupération impossible.")}
  finally{setRecoveryBusy(false)}
 }
 async function startRoom(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  try{
   const result=await request(joinMode?"join":"create",{name:name.trim(),...(joinMode?{code:code.trim().toUpperCase()}:{})},"");
   const newToken=result.token!;
   persistSessionToken(newToken);
   setToken(newToken);
   await refresh(newToken);
   if(result.recoveryCode)setRecoveryCode(result.recoveryCode);
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
 async function sendQueuedText(entry:LocalText){
  if(sendingTextIds.current.has(entry.id))return;
  sendingTextIds.current.add(entry.id);
  setTextOutbox(items=>items.map(item=>item.id===entry.id?{...item,status:"sending" as const,error:undefined,retryable:false,retryAt:undefined}:item));
  try{
   if(!room)throw Error("Espace indisponible.");
   const wire=entry.wireText||await encryptedOutgoing(entry.text,entry.id,room);
   entry.wireText=wire;
   setTextOutbox(items=>items.map(v=>v.id===entry.id?{...v,wireText:wire}:v));
   const result=await request("message",{text:wire,messageId:entry.id,...(entry.replyToId?{replyTo:entry.replyToId}:{})});
   if(result.id!==entry.id)throw Error("Confirmation d'envoi incorrecte.");
   setTextOutbox(items=>items.map(item=>item.id===entry.id?{...item,status:"sent" as const}:item));
   void refresh(undefined,true);
  }catch(err){
   const message=err instanceof Error?err.message:"Échec de l’envoi.";
   const retryable=isTransientMessageFailure(err);
   const attempts=(entry.attempts||0)+1;
   setTextOutbox(items=>items.map(item=>item.id===entry.id?{
    ...item,status:"failed" as const,error:message,retryable,attempts,
    retryAt:retryable?Date.now()+messageRetryDelayMs(attempts):undefined
   }:item));
  }finally{sendingTextIds.current.delete(entry.id)}
 }
 // iOS mobile connections can fail while the app stays open. Keep the UUID and
 // encrypted wire payload intact across retries: the server deduplicates by ID.
 useEffect(()=>{
  if(!room||!token)return;
  const resume=()=>{
   if(document.visibilityState!=="visible"||navigator.onLine===false)return;
   const now=Date.now();
   for(const item of textOutbox)
    if(item.status==="failed"&&item.retryable&&now>=(item.retryAt||0))
     void sendQueuedText(item);
  };
  const interval=window.setInterval(resume,3500);
  window.addEventListener("online",resume);
  window.addEventListener("focus",resume);
  document.addEventListener("visibilitychange",resume);
  return()=>{
   window.clearInterval(interval);
   window.removeEventListener("online",resume);
   window.removeEventListener("focus",resume);
   document.removeEventListener("visibilitychange",resume);
  };
 },[token,room?.roomId,room?.user.id,textOutbox]);
 async function sendMessage(e:FormEvent){
  e.preventDefault();if(!draft.trim()||busy||!room?.partner)return;
  if(editTarget){
   const text=draft.trim(),id=editTarget.id;
   setBusy(true);setError("");
   try{
    if(!room)throw Error("Espace indisponible.");
    await request("edit-message",{id,text:await encryptedOutgoing(text,id,room)});
    cancelEditing();
    await refresh(undefined,true);
   }catch(err){setError(err instanceof Error?err.message:"Impossible de modifier ce message.")}
   finally{setBusy(false)}
   return;
  }
  const quoted=replyTarget;
  const entry:LocalText={
   id:crypto.randomUUID(),created_at:Date.now(),text:draft.trim(),
   replyToId:quoted?.id,replyKind:quoted?.kind,replyContent:quoted?.content,
   replySenderId:quoted?.sender_id,status:"sending"
  };
  // The bubble appears before the request starts; other messages can be typed meanwhile.
  setTextOutbox(items=>[...items,entry]);
  setDraft("");setReplyTarget(null);typingActive.current=false;setError("");
  // Sending the message also clears typing server-side; avoid a redundant POST.
  requestAnimationFrame(scrollToLatest);
  void sendQueuedText(entry);
 }
 function insertEmoji(emoji:string){
  if(!room?.partner||busy||recording)return;
  const field=chatInput.current;
  const caret=field?.selectionStart??draft.length;
  const end=field?.selectionEnd??caret;
  const next=(draft.slice(0,caret)+emoji+draft.slice(end)).slice(0,1600);
  setDraft(next);setStickerOpen(false);setChatFocused(true);
  const position=Math.min(1600,caret+emoji.length);
  requestAnimationFrame(()=>{
   chatInput.current?.focus();
   try{chatInput.current?.setSelectionRange(position,position)}catch{/* Safari cursor fallback */}
  });
 }
 function sendGif(id:string){
  if(!room?.partner||busy||recording)return;
  let text:string;
  try{text=encodeGif(id)}catch{return}
  const quoted=replyTarget;
  const entry:LocalText={
   id:crypto.randomUUID(),created_at:Date.now(),text,
   replyToId:quoted?.id,replyKind:quoted?.kind,replyContent:quoted?.content,
   replySenderId:quoted?.sender_id,status:"sending"
  };
  setTextOutbox(items=>[...items,entry]);
  setReplyTarget(null);typingActive.current=false;setError("");
  requestAnimationFrame(scrollToLatest);
  void sendQueuedText(entry);
 }
 function sendSticker(id:string){
  if(!room?.partner||busy||recording)return;
  let text:string;
  try{text=encodeSticker(id)}catch{return}
  const quoted=replyTarget;
  const entry:LocalText={
   id:crypto.randomUUID(),created_at:Date.now(),text,
   replyToId:quoted?.id,replyKind:quoted?.kind,replyContent:quoted?.content,
   replySenderId:quoted?.sender_id,status:"sending"
  };
  setTextOutbox(items=>[...items,entry]);
  setReplyTarget(null);typingActive.current=false;setError("");
  requestAnimationFrame(scrollToLatest);
  void sendQueuedText(entry);
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
  if(!message.content||message.kind!=="text"||isSticker(message.content))return;
  try{await navigator.clipboard.writeText(message.content);setNotice("Message copié")}
  catch{setError("Copie indisponible sur ce téléphone.")}
 }
 function openMessageActions(message:Message){
  if(textOutbox.some(entry=>entry.id===message.id))return;
  chatInput.current?.blur();
  setExtraReactionsOpen(false);
  setActionPosition(null);
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
  if((e.target as HTMLElement).closest("a,audio"))return;
  // Holding a waveform opens actions; dragging it must remain normal audio seeking.
  const holdOnly=Boolean((e.target as HTMLElement).closest("input[type=range]"));
  if(holdOnly&&message.kind!=="audio")return;
  resetSwipe();
  const row=e.currentTarget;
  const gesture:{id:string;x:number;y:number;cancelled:boolean;held:boolean;holdOnly:boolean;timer:number|null}={
   id:message.id,x:e.clientX,y:e.clientY,cancelled:false,held:false,holdOnly,timer:null
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
  // Range slider movement is a scrub, never a swipe-to-reply.
  if(g.holdOnly){if(Math.abs(dx)>10||Math.abs(dy)>10)resetSwipe(e.currentTarget);return}
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
  if(!wasHeld&&!wasCancelled&&!g.holdOnly&&dx>=62&&Math.abs(dy)<34){
   if("vibrate" in navigator)try{navigator.vibrate(10)}catch{/* optional */}
   chooseReply(message);
  }
 }
 function jumpToQuote(id:string){
  const target=document.getElementById("lr-chat-message-"+id);
  if(target)target.scrollIntoView({behavior:"smooth",block:"center"});
 }
 async function upload(file:File,kind:"image"|"audio"):Promise<boolean>{
  if(!token||!room?.partner){setError("Ton partenaire doit d’abord rejoindre l’espace.");return false}
  const limit=kind==="image"?6_000_000:5_000_000;
  if(file.size>limit){setError("Fichier trop lourd : "+(kind==="image"?"6 Mo":"5 Mo")+" maximum.");return false}
  setBusy(true);setError("");
  try{
   if(!room)throw Error("Espace indisponible.");
   if(room.e2ee?.mine&&!room.e2ee?.required)throw Error("Ton partenaire doit activer le chiffrement avant l’envoi.");
   const id=crypto.randomUUID();
   const sendFile=room.e2ee?.required?await encryptMedia(await cryptoFor(room),file,kind,id):file;
   const form=new FormData();form.append("file",sendFile);form.append("kind",kind);form.append("messageId",id);
   const res=await apiFetch("/api/media",{method:"POST",headers:{Authorization:"Bearer "+token},body:form});
   const data=await res.json() as {ok:boolean;error?:string};
   if(!data.ok)throw new Error(data.error||"Envoi impossible.");
   await refresh();
   requestAnimationFrame(()=>{if(chatScroller.current)chatScroller.current.scrollTop=chatScroller.current.scrollHeight});
   return true;
  }catch(e){setError(e instanceof Error?e.message:"Envoi impossible.");return false}
  finally{setBusy(false)}
 }
 // Local first: a fresh recording is visible before any network request.
 async function sendQueuedVoice(entry:LocalVoice){
  if(!token||sendingVoiceIds.current.has(entry.id))return;
  sendingVoiceIds.current.add(entry.id);
  setVoiceOutbox(items=>items.map(v=>v.id===entry.id?{...v,status:"uploading",error:undefined}:v));
  try{
   const form=new FormData();
   if(!room)throw Error("Espace indisponible.");
   if(room.e2ee?.mine&&!room.e2ee?.required)throw Error("Ton partenaire doit activer le chiffrement avant l’envoi.");
   const sendFile=room.e2ee?.required?await encryptMedia(await cryptoFor(room),entry.file,"audio",entry.id):entry.file;
   form.append("file",sendFile);
   form.append("kind","audio");
   form.append("messageId",entry.id);
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
 function enqueueVoice(file:File){
  if(!room?.partner||!token)return;
  if(file.size===0){setError("Aucun son enregistré. Réessaie.");return}
  if(file.size>5_000_000){setError("Ce vocal dépasse 5 Mo. Réessaie avec un enregistrement plus court.");return}
  const entry:LocalVoice={id:crypto.randomUUID(),created_at:Date.now(),file,status:"uploading"};
  const url=URL.createObjectURL(file);
  mediaCache.current[entry.id]=url;
  setMedia(prev=>({...prev,[entry.id]:url}));
  setVoiceOutbox(prev=>[...prev,entry]);
  scrollToLatest();
  void sendQueuedVoice(entry);
 }
 async function onImageChange(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";
  if(file)await upload(file,"image");
 }
 function finishRecording(shouldSend=true){
  const active=recorder.current;
  if(!active)return;
  discardRecording.current=!shouldSend;
  // Stop from both recording and paused states; onstop releases the microphone.
  if(active.state!=="inactive"){
   active.stop();
  }else{
   recordingStream.current?.getTracks().forEach(track=>track.stop());
   recordingStream.current=null;
   setRecording(false);
   releaseRecordingAudio();
  }
  setRecordingPaused(false);
 }
 function pauseOrResumeRecording(){
  const active=recorder.current;
  if(!active||!recording)return;
  if(active.state==="recording"){
   recordingAccumulatedMs.current+=Date.now()-(recordingStartedAt.current||Date.now());
   recordingStartedAt.current=null;
   active.pause();setRecordingPaused(true);
   void request("recording",{active:false}).catch(()=>{});
  }else if(active.state==="paused"){
   active.resume();recordingStartedAt.current=Date.now();setRecordingPaused(false);
   void request("recording",{active:true}).catch(()=>{});
  }
 }
 // Update the visible timer independently of chat polling; paused time is excluded.
 useEffect(()=>{
  if(!recording)return;
  const tick=()=>{
   const live=recordingStartedAt.current===null?0:Date.now()-recordingStartedAt.current;
   const ms=recordingAccumulatedMs.current+live;
   const seconds=Math.floor(ms/1000);
   setRecordingElapsed(previous=>previous===seconds?previous:seconds);
   if(ms>=45000&&recorder.current&&recorder.current.state!=="inactive")finishRecording(true);
  };
  tick();
  const interval=window.setInterval(tick,200);
  return()=>window.clearInterval(interval);
 },[recording]);
 async function toggleRecording(){
  if(recording&&recorder.current){finishRecording(true);return}
  if(busy||!room?.partner||recordingStarting.current)return;
  if(typeof navigator==="undefined"||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Enregistrement vocal indisponible sur ce navigateur.");return}
  if(!claimRecordingAudio()){setError("Termine d’abord l’appel ou le vocal en cours.");return}
  const requestId=++recordingRequestId.current;
  // A rapid double tap must not create two concurrent iOS microphone permission requests.
  recordingStarting.current=true;
  // Immediately dismiss the iPhone keyboard, before requesting microphone access.
  // Unmounting the text input while recording prevents it from stealing focus again.
  chatInput.current?.blur();
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  setChatFocused(false);
  setStickerOpen(false);
  setTyping(false);
  setError("");
  try{
   // The browser/OS retains a previously granted permission when supported.
   // Never leave a microphone stream running while the user is not recording.
   const stream=await navigator.mediaDevices.getUserMedia({audio:{
    echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1
   }});
   // If a WebRTC call began during the permission prompt, discard this mic stream.
   if(requestId!==recordingRequestId.current||isCallAudioActive()){
    stream.getTracks().forEach(track=>track.stop());
    throw new Error("Appel en cours.");
   }
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
    releaseRecordingAudio();
   };
   rec.onstop=()=>{
    if(recordingTimer.current)clearTimeout(recordingTimer.current);
    recordingTimer.current=null;
    stream.getTracks().forEach(track=>track.stop());
    recordingStream.current=null;
    releaseRecordingAudio();
    if(recorder.current===rec)recorder.current=null;
    recordingStartedAt.current=null;
    recordingAccumulatedMs.current=0;
    setRecording(false);setRecordingPaused(false);setRecordingElapsed(0);
    recordingActive.current=false;
    void request("recording",{active:false}).catch(()=>{});
    const type=rec.mimeType?.split(";")[0]||"audio/mp4";
    const ext=type.includes("webm")?"webm":type.includes("ogg")?"ogg":"m4a";
    const blob=new Blob(chunks,{type});
    if(blob.size>0&&!discardRecording.current){enqueueVoice(new File([blob],"vocal."+ext,{type}))}
    discardRecording.current=false;
   };
   discardRecording.current=false;
   rec.start(250);
   recorder.current=rec;
   recordingStartedAt.current=Date.now();
   recordingAccumulatedMs.current=0;
   setRecordingElapsed(0);setRecordingPaused(false);
   recordingActive.current=true;setRecording(true);
   void request("recording",{active:true}).catch(()=>{});
  }catch(err){
   recordingStream.current?.getTracks().forEach(track=>track.stop());
   recordingStream.current=null;
   setRecording(false);setRecordingPaused(false);
   releaseRecordingAudio();
   const denied=err instanceof DOMException&&(err.name==="NotAllowedError"||err.name==="PermissionDeniedError");
   setError(denied?
    "Microphone bloqué. Autorise le micro pour Love Radar dans les réglages Safari ou de ton téléphone.":
    isCallAudioActive()?"Un appel utilise déjà le microphone.":"Impossible de démarrer l’enregistrement. Vérifie le micro et réessaie.");
  }finally{
   recordingStarting.current=false;
  }
 }
 async function shareCode(){
  const invite=publicInviteUrl(room?.code||"");
  const text="Rejoins-moi dans notre espace ❤️\n"+invite+"\nCode : "+room?.code;
  try{if(navigator.share)await navigator.share({title:"Notre espace ❤️",text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);setNotice("Invitation copiée !")}else setNotice(text)}
  catch{setNotice("Utilise le code : "+room?.code)}
 }
 async function deleteRoom(){
  if(!window.confirm("Supprimer définitivement votre espace, toutes les conversations, photos et vocaux ? Cette action est irréversible."))return;
  setBusy(true);
  try{await request("delete");if(token)void stopPushOnExit(token);clearSessionToken();setToken("");setRoom(null);setTab("home");setNotice("Espace supprimé.")}
  catch(e){setError(e instanceof Error?e.message:"Suppression impossible.")}
  finally{setBusy(false)}
 }
 function logout(){if(token)void stopPushOnExit(token);clearSessionToken();setToken("");setRoom(null);setTab("home");setNotice("Tu t’es déconnecté(e).")}
 const partner=room?.partner||"Ton amour";
 const typingUntil=partnerActivity?.partnerTypingUntil??room?.partnerTypingUntil??0;
 const recordingUntil=partnerActivity?.partnerRecordingUntil??room?.partnerRecordingUntil??0;
 const lastSeen=partnerActivity?.partnerLastSeenAt??room?.partnerLastSeenAt??0;
 const partnerRecording=Boolean(recordingUntil>Date.now());
 const partnerTyping=Boolean(!partnerRecording&&typingUntil>Date.now());
 useEffect(()=>{
  if(tab!=="chat")return;
  setPresenceNow(Date.now());
  const ticker=window.setInterval(()=>setPresenceNow(Date.now()),10000);
  return()=>window.clearInterval(ticker);
 },[tab]);
 const partnerOnline=Boolean(lastSeen&&presenceNow-lastSeen<35000);
 const partnerStatusText=!room?.partner?"En attente de votre partenaire…":partnerOnline?"En ligne":formatPartnerLastSeen(lastSeen,presenceNow);
 const partnerActivityKind=partnerRecording?"recording":partnerTyping?"typing":null;
 useEffect(()=>{
  if(tab!=="chat"||!partnerActivityKind)return;
  if(chatFocused||chatAtBottomRef.current)scrollToLatest();
 },[tab,partnerActivityKind,chatFocused,scrollToLatest]);
 const images=room?.messages.filter(m=>m.kind==="image"&&!m.view_once)||[];
 // Each outgoing message displays its own receipt, not just the most recent one.
 const unreadCount=tab==="chat"&&document.visibilityState==="visible"?0:Math.max(0,Number(room?.unreadCount||0));
 const unreadLabel=unreadCount>99?"99+":String(unreadCount);
 return <div className={"lr-app "+(!room&&!initializing?"lr-welcome-mode ":"")+(demoOpen&&!room&&!token?"lr-discovery-mode ":"")+(plusActive&&room&&plusTheme!=="classic"?"lr-plus-theme-"+plusTheme+" ":"")+(room?"lr-app-locked ":"")+(tab==="home"&&room?"lr-home-mode ":"")+(tab==="chat"&&room?"lr-chat-mode ":"")+((tab==="ludo-room"||tab==="ludo"||tab==="ludo-solo"||tab==="ludo-senegal"||tab==="ludo-senegal-solo")&&room?"lr-ludo-mode ":"")+(tab==="memory"&&room?"lr-memory-mode ":"")+((tab==="together"||tab==="life"||tab==="camera")&&room?"lr-together-mode ":"")+((tab==="watch"||tab==="watch-tiktok")&&room?"lr-watch-mode ":"")+(tab==="puzzle"&&room?"lr-puzzle-mode ":"")+(tab==="reconcile"&&room?"lr-reconcile-mode ":"")+(chatFocused&&tab==="chat"&&!recording?"lr-keyboard-open ":"")+(recording&&tab==="chat"?"lr-recording-mode":"")}>
  {recoveryCode?<RecoveryCodeDialog code={recoveryCode} onClose={()=>setRecoveryCode("")}/>:null}
  <div className="lr-bg-decor lr-bg-1" aria-hidden="true">♡</div><div className="lr-bg-decor lr-bg-2" aria-hidden="true">✧</div>
  <header className="lr-header"><div className="lr-header-context" aria-label="Espace privé"><span>ESPACE PRIVÉ</span><strong>{tab==="settings"?"Paramètres":room?.partner?"Notre univers":"Bienvenue"}</strong></div>
   <div className="lr-header-end">
    <input ref={profilePicker} type="file" hidden accept="image/*" onChange={chooseProfileFile}/>
    {canInstall?<button type="button" className="lr-install-btn" onClick={installAndroid}>↓ Installer l’app</button>:null}
    {room?<><span className="lr-top-status"><i/> {room.partner?"À deux, c’est mieux":"Invitation en attente"}</span>
     <button className="lr-header-avatar" type="button" aria-label={tab==="settings"?"Retour à l’accueil":"Ouvrir les paramètres"} aria-current={tab==="settings"?"page":undefined}
      onClick={()=>navigate(tab==="settings"?"home":"settings")}>
      {avatars.mine?<img src={avatars.mine} alt="Ma photo de profil"/>:room.user.name[0]?.toUpperCase()}
     </button></>:<span className="lr-badge-free">100% gratuit</span>}
   </div>
  </header>
  {showInstallHelp?<div className="lr-install-backdrop" onClick={()=>setShowInstallHelp(false)}><div className="lr-install-modal" role="dialog" aria-modal="true" aria-labelledby="lr-install-title" onClick={e=>e.stopPropagation()}><div className="lr-install-symbol">♥</div><h2 id="lr-install-title">Installer sur ton téléphone</h2><p>Installe l’application pour l’ouvrir en plein écran et recevoir des notifications.</p>{/iPhone|iPad|iPod/i.test(navigator.userAgent)?<ol><li>Ouvre ce site dans <strong>Safari</strong>.</li><li>Appuie sur <strong>Partager</strong> (le carré avec une flèche).</li><li>Choisis <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.</li><li>Ouvre l’application depuis sa nouvelle icône.</li></ol>:<ol><li>Ouvre le site dans <strong>Chrome Android</strong>.</li><li>Appuie sur <strong>⋮</strong> dans Chrome.</li><li>Choisis <strong>Installer l’application</strong> ou « Ajouter à l’écran d’accueil ».</li></ol>}<p className="lr-install-note">L’icône de l’application apparaîtra parmi tes applications. Une connexion Internet est nécessaire pour jouer et échanger des messages.</p><button onClick={()=>setShowInstallHelp(false)}>J’ai compris ❤️</button></div></div>:null}
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
  {notice?<div className={"lr-toast"+(notice.startsWith("lr-partner-push:")?" lr-push-avatar-toast":"")}
   role="status" onClick={()=>{if(notice.startsWith("lr-partner-push:"))navigate("chat");setNotice("")}}>
   {notice.startsWith("lr-partner-push:")?<><span className="lr-push-avatar-thumb" aria-hidden="true">
    {avatars.partner?<img src={avatars.partner} alt=""/>:(room?.partner||"♡").slice(0,1).toUpperCase()}
   </span><span className="lr-push-avatar-copy"><strong>{room?.partner||"Ton partenaire"}</strong>
    <small>{notice.endsWith(":audio")?"🎙️ Nouveau message vocal":notice.endsWith(":photo")?"📷 Nouvelle photo":"💌 Nouveau message"}</small></span></>:notice}
   <span className="lr-push-toast-x" aria-hidden="true">×</span>
  </div>:null}
  {error&&room?<div className="lr-error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Fermer">×</button></div>:null}
  {initializing?<main className="lr-loading">
    <span className="lr-loading-message">Un petit moment de magie… 💕</span>
    <div className="lr-loading-credit">Créé par <strong>Diao-Tech.com</strong></div>
   </main>:!room&&token&&!recoverMode?
   <main className="lr-auth lr-auth-simple">
    <section className="lr-auth-story" aria-label="Reconnexion à votre espace">
     <span className="lr-auth-heart" aria-hidden="true">♥</span>
     <span className="lr-eyebrow">VOTRE ESPACE EXISTE DÉJÀ</span>
     <h1>On se retrouve,<br/><em>tout simplement.</em></h1>
     <p>Vos messages et souvenirs ne sont pas effacés.</p>
    </section>
    <section className="lr-auth-panel lr-reconnect-panel">
     <div className="lr-panel-head"><h2>Retrouver notre espace ♡</h2>
      <p>Cette connexion est enregistrée sur ton téléphone.</p></div>
     {error?<div className="lr-inline-auth-error" role="alert"><span>{error}</span>
      <button type="button" onClick={()=>setError("")} aria-label="Fermer le message">×</button></div>:null}
     <button type="button" className="lr-reconnect-retry" disabled={busy}
      onClick={()=>{setError("");void refresh(token,false)}}>
      Réessayer la connexion →</button>
     <button type="button" className="lr-reconnect-recovery" onClick={()=>{setError("");setRecoverMode(true)}}>
      Utiliser mon code personnel de secours</button>
     <p className="lr-reconnect-hint">Ne recrée pas un espace. Love Radar réessaie automatiquement en 4G/5G et en Wi-Fi. Ton code personnel reste disponible si nécessaire.</p>
    </section>
   </main>:!room&&!token&&demoOpen?
   <DiscoveryMode onClose={()=>setDemoOpen(false)}
    onCreate={()=>{setDemoOpen(false);setJoinMode(false);setRecoverMode(false)}}
    onJoin={()=>{setDemoOpen(false);setJoinMode(true);setRecoverMode(false)}}/>:!room?
   <main className="lr-auth lr-auth-simple">
     <section className="lr-auth-story" aria-label="Bienvenue dans votre espace">
      <span className="lr-auth-heart" aria-hidden="true">♥</span>
      <span className="lr-eyebrow">UN ESPACE RIEN QU'À VOUS</span>
      <h1>Votre amour,<br/><em>même à distance.</em></h1>
      <p>Discutez, jouez et partagez vos moments à deux.</p>
     </section>
     <section className="lr-auth-panel" aria-label="Créer ou rejoindre votre espace privé">
      <div className="lr-panel-head"><h2>{recoverMode?"Retrouver mon compte 🔐":joinMode?"Rejoins ton amour ♡":"Bienvenue à deux ♡"}</h2><p>{recoverMode?"Utilise ton code personnel de secours, ou demande l’aide de ton partenaire connecté.":joinMode?"Entre ton prénom et votre code privé.":"Crée ton espace et invite ton partenaire."}</p></div>
      {error?<div className="lr-inline-auth-error" role="alert"><span>{error}</span>
       <button type="button" onClick={()=>setError("")} aria-label="Fermer le message">×</button></div>:null}
      {recoverMode?<div className="lr-recovery-entry">
       <p>Entre le code personnel reçu à ton inscription. Le code d’invitation de ton partenaire ne permet pas de récupérer un compte.</p>
       <form onSubmit={restoreAccount}>
        <label htmlFor="lr-recovery-input">Code personnel de secours</label>
        <input id="lr-recovery-input" value={recoverInput} onChange={e=>setRecoverInput(e.target.value.toUpperCase())}
         maxLength={40} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} required/>
        <button type="submit" disabled={recoveryBusy}>{recoveryBusy?"Vérification…":"Retrouver mon compte"}</button>
       </form>
       <PartnerRecoveryClaim onRecovered={finishApprovedPartnerRecovery}/>
       <button type="button" onClick={()=>setRecoverMode(false)}>Retour à l’inscription</button>
      </div>:<>
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
      </>}
      {!recoverMode?<button type="button" className="lr-discovery-entry" onClick={()=>{setDemoOpen(true);setError("")}}>✨ Découvrir Love Radar sans compte →</button>:null}
      {!recoverMode?<button type="button" className="lr-recovery-toggle" onClick={()=>{setRecoverMode(true);setError("")}}>J’ai perdu mon accès</button>:null}
      <div className="lr-safe-copy"><span aria-hidden="true">🔒</span> Privé · Gratuit · Sur invitation</div>
      <div className="lr-made-by">Créé par <strong>Diao-Tech.com</strong></div>
     </section>
   </main>:
  <div className="lr-shell">
   <aside className="lr-sidebar"><div className="lr-sidebar-top"><span className="lr-side-label">VOTRE PETIT UNIVERS</span><div className="lr-couple"><Initials name={room.user.name} src={avatars.mine}/><span className="lr-couple-mid">♥</span><Initials name={partner} src={avatars.partner}/></div><h2>{room.user.name}<span> &amp; </span>{partner}</h2><p>{room.partner?"La belle aventure continue…":"En attente de ta moitié."}</p></div>
    <div className="lr-side-nav">{NAV.map(n=><button key={n.id} className={selectedNav(tab)===n.id?"active":""} aria-current={selectedNav(tab)===n.id?"page":undefined} onClick={()=>navigate(n.id)}><span className="lr-nav-symbol" aria-hidden="true"><NavGlyph tab={n.id}/></span>{n.label}{n.id==="chat"&&unreadCount>0?<b className="lr-side-unread" aria-hidden="true">{unreadLabel}</b>:null}</button>)}</div>
    <div className="lr-sidebar-bottom"><div className="lr-side-heart">♡</div>Vos messages et vos souvenirs, toujours à portée de main.</div>
   </aside>
   <main className="lr-main">
    {tab==="settings"?<SettingsPage
     name={room.user.name} code={room.code} owner={room.user.owner} token={token} avatarSrc={avatars.mine} avatarVersion={room.user.avatarVersion}
     profileBusy={profileBusy} profileError={profileError} recoveryBusy={recoveryBusy} onGenerateRecovery={()=>void issueRecoveryCode()} privacyEnabled={privacyEnabled}
     recoveryRoomId={room.roomId} recoveryMemberId={room.user.id} recoveryPartnerId={room.partnerId||null}
     notificationsOn={notificationsOn} notificationsBusy={notificationsBusy} notificationsTesting={notificationsTesting} notificationsHint={notificationsHint}
     e2ee={room.e2ee} e2eeBusy={e2eeBusy} e2eeBackup={e2eeBackup} e2eeOwnCode={e2eeOwnCode} e2eePartnerCode={e2eePartnerCode}
     e2eeDeviceReady={e2eeDeviceReady} e2eeVerified={e2eeVerified}
     onEnableE2EE={phrase=>void enableE2EE(phrase)} onFinishE2EE={()=>void completeE2EE()}
     onRestoreE2EE={(file,phrase)=>void restoreE2EE(file,phrase)} onVerifyPartnerKey={()=>void approvePartnerKey()}
     nativeApp={isNativeApp} plusActive={plusActive} onOpenPlus={()=>navigate("plus")} onBack={()=>navigate("home")}
     onChoosePhoto={()=>profilePicker.current?.click()}
     onAdjustPhoto={()=>void adjustProfilePhoto()} onRemovePhoto={()=>void removeProfilePhoto()}
     onPrivacyChange={updatePrivacy}
     onEnableNotifications={()=>void enableNotifications(notificationsOn)}
     onTestNotifications={()=>void testNotifications()} onDisableNotifications={()=>void disableNotifications()}
     onShareInvite={()=>void shareCode()} onLogout={logout} onDeleteRoom={()=>void deleteRoom()}/>:null}
    {tab==="plus"?<LoveRadarPlus token={token} roomId={room.roomId} partnerName={room.partner}
     nativeApp={isNativeApp} theme={plusTheme} onThemeChange={changePlusTheme}
     onEntitlementChange={setPlusActive} onBack={()=>navigate("home")}/>:null}
    {tab==="home"?<HomeDashboard plusActive={plusActive} room={room} token={token} media={media} privacyEnabled={privacyEnabled} mineAvatar={avatars.mine} partnerAvatar={avatars.partner} onEditProfile={()=>profilePicker.current?.click()} onInvite={()=>void shareCode()} onNavigate={navigate}/>:null}
    {tab==="moment"?<DailyMoment token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} focusDay={noticeTarget?.kind==="daily-question"?noticeTarget.id:null}/>:null}
    {tab==="care"?<CoupleCare key={room.roomId+":"+room.user.id} token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="together"?<Together token={token} myName={room.user.name} partnerName={room.partner} mySeat={room.user.seat} onExit={()=>navigate("home")} onOpenMoment={()=>navigate("moment")} onOpenReunion={()=>navigate("reunion")} onOpenWatch={()=>navigate("watch")} onOpenPuzzle={()=>navigate("puzzle")} onOpenReconcile={()=>navigate("reconcile")} onOpenCare={()=>navigate("care")} onOpenLife={()=>navigate("life")} onOpenCamera={()=>navigate("camera")} focusKind={noticeTarget?.kind==="love-signal"?noticeTarget.kind:null} focusId={noticeTarget?.kind==="love-signal"?noticeTarget.id:null}/>:null}
    {tab==="camera"?<FunCamera key={room.roomId+":"+room.user.id} partner={room.partner} onBack={()=>navigate("together")}
      onSendPhoto={async file=>upload(file,"image")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="life"?<CoupleExperiences token={token} myId={room.user.id} myName={room.user.name} partnerName={room.partner} privacyEnabled={privacyEnabled} onExit={()=>navigate("together")} onChat={()=>navigate("chat")} onWatch={()=>navigate("watch")} onGames={()=>navigate("games")} onMoment={()=>navigate("moment")} focusKind={noticeTarget?.kind} focusId={noticeTarget?.id}/>:null}
     {tab==="watch"?<WatchTogether token={token} myId={room.user.id} myName={room.user.name}
      partnerName={room.partner} messages={room.messages}
      onSendText={async text=>{await sendBackgroundText(text)}}
      onOpenChat={()=>navigate("chat")} onOpenTikTok={()=>navigate("watch-tiktok")} onExit={()=>navigate("together")}/>:null}
    {tab==="watch-tiktok"?<TikTokTogether token={token} myId={room.user.id} myName={room.user.name}
      partnerName={room.partner} messages={room.messages}
      onSendText={async text=>{await sendBackgroundText(text)}}
      onExit={()=>navigate("watch")} onOpenYouTube={()=>navigate("watch")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="story"||tab==="reunion"?<CoupleStory key={tab} token={token} mode={tab} privacyEnabled={privacyEnabled} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate(tab==="story"?"memories":"together")} onOpenStory={()=>navigate("story")} onOpenReunion={()=>navigate("reunion")}/>:null}
    {tab==="puzzle"?<SharedPuzzle token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")}/>:null}
     {tab==="reconcile"?<Reconcile token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("together")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="games"?<GamesHub onOpenGame={game=>navigate(game)} partnerName={room.partner}/>:null}
    {tab==="ludo-room"?<LudoRoom partnerName={room.partner} onExit={()=>navigate("games")} onOpenMode={mode=>navigate(mode)}/>:null}
    {tab==="rps"?<RpsDuo key={room.roomId+":"+room.user.id} token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} onOpenChat={()=>navigate("chat")}/>:null}
     {tab==="draw"||tab==="escape"?<DuoArcade key={room.roomId+":"+room.user.id+":"+tab} mode={tab} token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="rapid"||tab==="truth"?<CoupleParty key={room.roomId+":"+room.user.id+":"+tab} mode={tab} token={token} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} onOpenChat={()=>navigate("chat")}/>:null}
    {tab==="ludo"?<Ludo token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} myAvatar={avatars.mine} partnerAvatar={avatars.partner} onExit={()=>navigate("ludo-room")} challengeId={noticeTarget?.kind==="ludo-challenge"?noticeTarget.id:null}/>:null}
     {tab==="ludo-solo"?<LudoSoloEmbedded scope={room.roomId+":"+room.user.id} onExit={()=>navigate("ludo-room")}/>:null}
     {tab==="ludo-senegal"?<SenegalLudo mode="duo" token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("ludo-room")}/>:null}
     {tab==="ludo-senegal-solo"?<SenegalLudo mode="solo" token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} storageKey={room.roomId+":"+room.user.id} onExit={()=>navigate("ludo-room")}/>:null}
    {tab==="memory"?<MemoryLove token={token} mySeat={room.user.seat} myName={room.user.name} partnerName={room.partner} onExit={()=>navigate("games")} challengeId={noticeTarget?.kind==="memory-challenge"?noticeTarget.id:null}/>:null}
    {tab==="chat"?<section className="lr-chat" aria-label={"Conversation avec "+partner}>
     <div className="lr-chat-head">
      <button type="button" className="lr-chat-back" aria-label="Revenir aux onglets" onClick={()=>navigate(chatReturnTab.current)}>
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div className="lr-chat-partner"><button type="button" className="lr-partner-photo-trigger"
        aria-label={"Agrandir la photo de profil de "+partner} title={"Photo de profil de "+partner}
        onClick={()=>setPartnerPhotoOpen(true)}><Initials name={partner} size="small" src={avatars.partner}/></button>
       <div><h2>{partner}</h2><button ref={partnerPresenceTrigger} type="button" className="lr-chat-status-trigger"
          disabled={!room.partner} aria-label={"Voir les détails de présence de "+partner+". "+partnerStatusText}
          aria-haspopup="dialog" aria-expanded={partnerPresenceOpen}
          onClick={()=>setPartnerPresenceOpen(true)}>
          <span className={"lr-chat-status "+(partnerOnline?"online":"offline")}>{partnerStatusText}</span>
         </button></div>
      </div>
      <div id="lr-voice-button-slot"/>
     </div>
     <div className="lr-chat-messages" ref={chatScroller} onScroll={e=>{const list=e.currentTarget;const near=list.scrollHeight-list.scrollTop-list.clientHeight<120;chatAtBottomRef.current=near;setChatAtBottom(prev=>prev===near?prev:near)}} role="log" aria-label="Messages" aria-live="off">
      {room.messages.length>=90&&historyMore?<div className="lr-history-loader">
       <button type="button" disabled={historyBusy} onClick={()=>void loadEarlierHistory()}>
        {historyBusy?"Chargement de l’historique…":"↑ Afficher les anciens messages"}</button>
      </div>:null}
      {historyError?<p className="lr-history-error" role="alert">{historyError}</p>:null}
      {chatTimeline.length===0?<div className="lr-chat-empty"><span>♡</span><h3>Votre conversation</h3><p>Écris ton premier message pour commencer.</p></div>:
      chatTimeline.map((entry,feedIndex)=>{
       const preceding=chatTimeline[feedIndex-1];
       if(entry.type==="call"){
        const callDay=new Date(entry.call.createdAt).toDateString();
        const showCallDay=!preceding||new Date(preceding.createdAt).toDateString()!==callDay;
        const callDate=new Date(entry.call.createdAt).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long"});
        return <Fragment key={"call-"+entry.call.id}>
         {showCallDay?<div className="lr-chat-day">{callDate}</div>:null}
         <CallHistoryBubble call={entry.call} mine={entry.call.callerId===room.user.id}
          partner={partner} serverOffset={callClockOffset}/>
        </Fragment>;
       }
       if(entry.type==="screenshot"){
        const date=new Date(entry.event.created_at).toDateString();
        const showDay=!preceding||new Date(preceding.createdAt).toDateString()!==date;
        const label=new Date(entry.event.created_at).toLocaleDateString("fr-FR",{
         weekday:"short",day:"numeric",month:"long"
        });
        const mine=entry.event.member_id===room.user.id;
        return <Fragment key={"screenshot-"+entry.event.id}>
         {showDay?<div className="lr-chat-day">{label}</div>:null}
         <div className="lr-chat-screenshot-event" role="note" aria-label="Alerte de capture d'écran">
          <span className="lr-screenshot-symbol" aria-hidden="true">📸</span>
          <div><strong>Capture d’écran</strong>
           <p>{mine?"Tu as fait une capture d’écran dans Love-Radar.":
            partner+" a fait une capture d’écran dans Love-Radar."}</p>
           <time dateTime={new Date(entry.event.created_at).toISOString()}>
            {new Date(entry.event.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
           </time></div>
         </div>
        </Fragment>;
       }
       const m=entry.message,idx=entry.index;
       const mine=m.sender_id===room.user.id;
       const previous=preceding?.type==="message"?preceding.message:undefined;
       const following=chatTimeline[feedIndex+1];
       const next=following?.type==="message"?following.message:undefined;
       const day=new Date(m.created_at).toDateString();
       const newDay=!preceding||new Date(preceding.createdAt).toDateString()!==day;
       const groupedBefore=previous&&!newDay&&previous.sender_id===m.sender_id&&m.created_at-previous.created_at<5*60*1000;
       const groupedAfter=next&&next.sender_id===m.sender_id&&new Date(next.created_at).toDateString()===day&&next.created_at-m.created_at<5*60*1000;
       const time=new Date(m.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
       const delivery=receiptState(m.created_at,room.partnerReadAt||0,room.partnerDeliveredAt||0);
       const date=new Date(m.created_at).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"long"});
       return <Fragment key={m.id}>
        {newDay?<div className="lr-chat-day">{date}</div>:null}
        <div id={"lr-chat-message-"+m.id}
          className={"lr-bubble-row lr-reply-gesture "+(mine?"mine ":"other ")+(groupedBefore?"lr-grouped ":"")+(groupedAfter?"lr-group-next":"")+(m.kind==="audio"&&previous?.kind==="audio"&&!newDay?" lr-voice-after-voice":"")+(noticeTarget?.id===m.id&&tab==="chat"?" lr-notified-bubble":"")}
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
          <div className={"lr-bubble"+(m.kind==="audio"?" lr-bubble-audio":m.kind==="image"?" lr-bubble-image":m.kind==="text"&&isSticker(m.content)?" lr-bubble-sticker":m.kind==="text"&&readGifId(m.content)?" lr-bubble-gif":m.kind==="text"&&emojiOnlyText(m.content)?" lr-bubble-emoji":"")}>
           {m.reply_to_id?<QuoteCard author={quoteAuthor(m.reply_sender_id,room.user.id,partner)}
            kind={m.reply_kind||"text"} content={m.reply_kind?m.reply_content:"Message supprimé"}
            onJump={chatMessages.some(item=>item.id===m.reply_to_id)?()=>jumpToQuote(m.reply_to_id!):undefined}/>:null}
           {m.view_once?<div className="lr-legacy-expired" role="note">Ancien média temporaire indisponible</div>:m.kind==="text"?(readStickerId(m.content)?<StickerArt id={readStickerId(m.content)!}/>:readGifId(m.content)?<GifMessage id={readGifId(m.content)!}/>:<p><AnimatedEmojiText content={m.content||""}/></p>):m.kind==="image"?
          media[m.id]?<PrivatePhoto key={m.id} src={media[m.id]} alt={"Photo envoyée "+(mine?"par toi":"par "+partner)} enabled={privacyEnabled} viewer={room.user.name} variant="chat" onImageError={()=>retryMedia(m)}/>:
          <div className="lr-photo-loading" role="status">
           <span aria-hidden="true">▧</span>
           <span>{mediaErrors[m.id]||"Chargement de la photo…"}</span>
           {mediaErrors[m.id]?<button type="button" onClick={()=>retryMedia(m)}>Réessayer</button>:null}
          </div>:
          media[m.id]?<VoiceMessage id={m.id} src={media[m.id]} mine={mine} time={time}
           avatarSrc={mine?avatars.mine:avatars.partner} avatarName={mine?room.user.name:partner}
           onOpenProfile={mine?()=>navigate("settings"):()=>setPartnerPhotoOpen(true)}
           delivery={mine&&voiceOutbox.every(v=>v.id!==m.id||v.status==="sent")?delivery:undefined}
           speed={voiceSpeed} onSpeedChange={setVoiceSpeed}
           autoPlay={nextAutoVoiceId===m.id}
           onAutoPlayConsumed={()=>setNextAutoVoiceId(null)}
           onManualPlay={()=>setNextAutoVoiceId(null)}
           onFinished={()=>setNextAutoVoiceId(nextConsecutiveVoiceId(chatMessages,idx))}/>:
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
          {m.kind==="text"&&textOutbox.some(v=>v.id===m.id&&v.status!=="sent")?<div className={"lr-text-send-state "+(textOutbox.find(v=>v.id===m.id)?.status||"sending")} role="status">
           {textOutbox.find(v=>v.id===m.id)?.status==="failed"?<>
            <span>{textOutbox.find(v=>v.id===m.id)?.retryable?"Connexion instable · nouvelle tentative automatique":"Échec de l’envoi"}</span>
            <button type="button" aria-label="Réessayer l’envoi du message" onClick={()=>{const entry=textOutbox.find(v=>v.id===m.id);if(entry)void sendQueuedText(entry)}}>Réessayer</button>
           </>:<span>{textOutbox.find(v=>v.id===m.id)?.status==="sent"?"✓":"◌ Envoi…"}</span>}
          </div>:null}
          {!groupedAfter&&m.kind!=="audio"?<time className="lr-message-time" dateTime={new Date(m.created_at).toISOString()}>{time}{m.edited_at?<span className="lr-edited-label"> · modifié</span>:null}</time>:null}
          {mine&&m.kind!=="audio"&&textOutbox.every(v=>v.id!==m.id||v.status==="sent")?
            <span className={"lr-read-receipt lr-message-delivery-state "+(delivery==="read"?"is-read":delivery==="delivered"?"is-delivered":"is-sent")} aria-label={receiptAccessibleLabel(delivery)} title={receiptAccessibleLabel(delivery)}>
             <span className="lr-receipt-ticks" aria-hidden="true">{receiptGlyph(delivery)}</span><span className="lr-receipt-word">{receiptDisplayLabel(delivery)}</span>
            </span>:null}
         </div>
        </div>
       </Fragment>
      })}
      {partnerActivityKind?<ChatActivity kind={partnerActivityKind}/>:null}
      <div ref={tail}/>
     </div>
     {actionMessage&&typeof document!=="undefined"?createPortal(<div className="lr-chat lr-chat-context-root"><div className="lr-message-action-backdrop lr-message-context-backdrop" onClick={()=>setActionMessageId(null)}>
      <div ref={actionPopoverRef} className={"lr-message-action-popover "+(actionMessage.sender_id===room.user.id?"is-own":"is-partner")}
       role="dialog" aria-modal="true" aria-label="Actions sur le message"
       style={actionPosition?{left:actionPosition.left,top:actionPosition.top}:{left:12,top:Math.max(18,Math.round((window.visualViewport?.height??window.innerHeight)*.17))}}
       onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setActionMessageId(null)}}}>
       <div className="lr-message-reaction-picker" role="group" aria-label="Réagir au message">
        {CHAT_REACTIONS.map(emoji=><button key={emoji} type="button" aria-label={"Réagir "+emoji} onClick={()=>void reactToMessage(actionMessage,emoji)}>{emoji}</button>)}
        <button type="button" className="lr-reaction-more" aria-label={extraReactionsOpen?"Masquer les autres réactions":"Plus de réactions"}
         aria-expanded={extraReactionsOpen} onClick={()=>setExtraReactionsOpen(v=>!v)}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v10M7 12h10" strokeLinecap="round"/></svg>
        </button>
       </div>
       {extraReactionsOpen?<div className="lr-message-reaction-more" role="group" aria-label="Autres réactions">
        {EXTRA_CHAT_REACTIONS.map(emoji=><button key={emoji} type="button" aria-label={"Réagir "+emoji}
         onClick={()=>void reactToMessage(actionMessage,emoji)}>{emoji}</button>)}
       </div>:null}
       <div className="lr-message-action-preview" aria-label="Message sélectionné">
        {actionMessage.kind==="text"&&!isSticker(actionMessage.content)&&!readGifId(actionMessage.content)?
         <span>{actionMessage.content}</span>:actionMessage.kind==="audio"?
         <span>🎤 Message vocal</span>:actionMessage.kind==="image"?
         <span>▧ Photo</span>:<span>{isSticker(actionMessage.content)?"💗 Sticker":"✦ GIF"}</span>}
       </div>
       <div className="lr-message-action-sheet">
        <button type="button" className="lr-message-action-row" onClick={()=>{chooseReply(actionMessage);setActionMessageId(null)}}>
         <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 8 4 12l6 4"/><path d="M4 12h9a7 7 0 0 1 7 7"/></svg></span>Répondre
        </button>
        {actionMessage.kind==="text"&&actionMessage.content&&!isSticker(actionMessage.content)&&!readGifId(actionMessage.content)?<button type="button" className="lr-message-action-row" onClick={()=>void copyMessage(actionMessage)}>
         <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></span>Copier
        </button>:null}
        {actionMessage.sender_id===room.user.id&&actionMessage.kind==="text"&&!isSticker(actionMessage.content)&&!readGifId(actionMessage.content)?<button type="button" className="lr-message-action-row" onClick={()=>beginEditing(actionMessage)}>
         <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="m13 5 6 6M4 20l4.2-1 11.1-11.1a2 2 0 0 0-2.8-2.8L5.3 16.2Z"/></svg></span>Modifier le texte
        </button>:null}
        <button type="button" className="lr-message-action-row" onClick={()=>{setInfoMessageId(actionMessage.id);setActionMessageId(null)}}>
         <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg></span>Infos du message
        </button>
        <button type="button" className="lr-message-action-row is-danger" onClick={()=>void deleteForMe(actionMessage)}>
         <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg></span>Supprimer pour moi
        </button>
        {actionMessage.sender_id===room.user.id?<button type="button" className="lr-message-action-row is-danger" onClick={()=>void deleteOwnMessage(actionMessage)}>
         <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg></span>Supprimer pour tous
        </button>:null}
       </div>
       <button type="button" className="lr-message-action-close" onClick={()=>setActionMessageId(null)}>Annuler</button>
      </div>
     </div></div>,document.body):null}
     {infoMessage?<div className="lr-message-action-backdrop" onClick={()=>setInfoMessageId(null)}>
      <div className="lr-message-action-sheet" role="dialog" aria-modal="true" aria-label="Informations du message" onClick={e=>e.stopPropagation()}>
       <strong>Informations du message</strong>
       <p>Envoyé par {quoteAuthor(infoMessage.sender_id,room.user.id,partner)}</p>
       <p>Le {new Date(infoMessage.created_at).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"})}</p>
       {infoMessage.edited_at?<p>Modifié le {new Date(infoMessage.edited_at).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"})}</p>:null}
       {infoMessage.sender_id===room.user.id?<p>{receiptAccessibleLabel(receiptState(infoMessage.created_at,room.partnerReadAt||0,room.partnerDeliveredAt||0))}</p>:null}
       <button type="button" className="lr-message-action-close" onClick={()=>setInfoMessageId(null)}>Fermer</button>
      </div>
     </div>:null}
     {!chatAtBottom&&!chatFocused?<button type="button" className="lr-chat-jump" onClick={scrollToLatest}>↓ Derniers messages</button>:null}
     <div className="lr-chat-compose">
       {stickerOpen&&room.partner?<StickerPicker storageKey={room.roomId+":"+room.user.id} onSend={sendSticker}
        onSendEmoji={insertEmoji} onSendGif={sendGif}
        onClose={()=>{setStickerOpen(false);setChatFocused(false)}} onSearchFocus={()=>setChatFocused(true)} onSearchBlur={()=>setChatFocused(false)}/>:null}
      {editTarget?<div className="lr-reply-compose lr-edit-compose" role="status" aria-label="Modification du message">
       <span className="lr-edit-compose-label"><strong>✎ Modifier mon message</strong><small>{editTarget.content}</small></span>
       <button type="button" className="lr-reply-compose-close" aria-label="Annuler la modification" onClick={cancelEditing}>×</button>
      </div>:null}
      {!editTarget&&replyTarget?<div className="lr-reply-compose" role="status" aria-label="Réponse au message sélectionné">
       <QuoteCard variant="composer" author={quoteAuthor(replyTarget.sender_id,room.user.id,partner)}
        kind={replyTarget.kind} content={replyTarget.content}/>
       <button type="button" className="lr-reply-compose-close" aria-label="Annuler la réponse" onClick={()=>setReplyTarget(null)}>×</button>
      </div>:null}
      {recording?<div className="lr-voice-recording-composer" role="group" aria-label="Enregistrement d’un message vocal">
       <div className="lr-voice-recording-status" role="status" aria-live="off">
        <span className={"lr-voice-recording-led"+(recordingPaused?" is-paused":"")} aria-hidden="true"/>
        <time className="lr-voice-recording-clock">{Math.floor(recordingElapsed/60)}:{String(recordingElapsed%60).padStart(2,"0")}</time>
        <span className={"lr-voice-recording-wave"+(recordingPaused?" is-paused":"")}><LiveVoiceWaveform stream={recordingStream.current} paused={recordingPaused}/></span>
       </div>
       <div className="lr-voice-recording-actions">
        <button type="button" className="lr-voice-rec-delete" aria-label="Supprimer le vocal" title="Supprimer le vocal" onClick={()=>finishRecording(false)}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>
        </button>
        <button type="button" className="lr-voice-rec-pause" aria-label={recordingPaused?"Reprendre le vocal":"Mettre le vocal en pause"} title={recordingPaused?"Reprendre":"Pause"} aria-pressed={recordingPaused} onClick={pauseOrResumeRecording}>
         {recordingPaused?<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 8v8M15 8v8"/></svg>}
        </button>
        <button type="button" className="lr-voice-rec-send" aria-label="Envoyer le vocal" title="Envoyer le vocal" onClick={()=>finishRecording(true)}>
         <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m3.5 3.5 18 8.5-18 8.5 2-7.2L15 12 5.5 10.7 3.5 3.5Z"/></svg>
        </button>
       </div>
      </div>:<form className={"lr-chat-form "+(chatFocused||draft.trim()?"is-writing ":"")+(recording?"is-recording":"")} onSubmit={sendMessage}>
       <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onImageChange}/>
       <button className="lr-attach" type="button" title="Ajouter une photo" aria-label="Ajouter une photo" onClick={()=>fileInput.current?.click()} disabled={!room.partner||busy}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
       </button>
       <div className="lr-chat-textbox">
        <input ref={chatInput} aria-label="Écrire un message" type="text" enterKeyHint="send" autoComplete="off" value={draft} onFocus={()=>{setStickerOpen(false);firstPoll.current=true;setChatFocused(true);scrollToLatest()}} onBlur={()=>{setChatFocused(false);setTyping(false)}} onChange={e=>{setDraft(e.target.value);setTyping(e.target.value.trim().length>0)}} placeholder={room.partner?"Message…":"En attente de ton partenaire…"} disabled={!room.partner} maxLength={1600}/>
        <button className={"lr-sticker-trigger"+(stickerOpen?" is-open":"")} type="button"
         aria-label={stickerOpen?"Fermer les stickers":"Ouvrir les stickers"}
         aria-expanded={stickerOpen} title="Stickers" disabled={!room.partner||busy||recording||Boolean(editTarget)}
         onClick={()=>{chatInput.current?.blur();setChatFocused(false);setStickerOpen(open=>!open);requestAnimationFrame(scrollToLatest)}}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5.5 3.5h13a2 2 0 0 1 2 2V15l-5.5 5.5h-9.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/>
          <path d="M15 20.5V15h5.5"/><circle cx="9" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r=".8" fill="currentColor" stroke="none"/><path d="M8.5 13c1.8 2 4.5 2 6.3 0"/>
         </svg>
        </button>
       </div>
        {draft.trim()?<button className="lr-send" type="submit" aria-label={editTarget?"Enregistrer la modification":"Envoyer"} onPointerDown={e=>e.preventDefault()} disabled={!room.partner||busy}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg>
        </button>:<button className={"lr-mic "+(recording?"recording":"")} type="button" title={recording?"Arrêter le vocal":"Enregistrer un vocal"} aria-label={recording?"Arrêter le message vocal":"Enregistrer un message vocal"} onClick={toggleRecording} disabled={!room.partner||busy}>
         {recording?<span aria-hidden="true">■</span>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8 21h8"/></svg>}
        </button>}
      </form>}
     </div>
    </section>:null}
    {tab==="memories"?<><div className="lr-section-head"><span className="lr-eyebrow">✦ VOTRE ALBUM</span><h1>Nos petits souvenirs <em>♥</em></h1><p>Notre album privé, nos lettres et notre histoire à deux.</p></div><button type="button" className="lr-story-album-entry" onClick={()=>navigate("story")}><span aria-hidden="true">💑</span><span><strong>Notre histoire</strong><small>Notre photo, nos jours ensemble et nos souvenirs marquants.</small></span><b aria-hidden="true">→</b></button><SharedKeepsakes token={token} myId={room.user.id} myName={room.user.name} partnerName={room.partner} privacyEnabled={privacyEnabled} focusKind={noticeTarget?.kind} focusId={noticeTarget?.id}/><div className="lr-section-head"><span className="lr-eyebrow">PHOTOS DE NOS MESSAGES</span><p>Photos conservées dans votre conversation.</p></div><div className="lr-memories-grid">{images.length===0?<div className="lr-memories-empty"><span>📸</span><h3>Votre album commence ici</h3><p>Partage une photo dans les messages pour la retrouver ici.</p><button onClick={()=>navigate("chat")}>Ouvrir la conversation →</button></div>:images.map(m=><div className="lr-memory" key={m.id}>{media[m.id]?<PrivatePhoto key={m.id} src={media[m.id]} alt="Souvenir du couple" enabled={privacyEnabled} viewer={room.user.name} variant="album"/>:<div>Photo en chargement…</div>}<span>{new Date(m.created_at).toLocaleDateString("fr-FR")}</span></div>)}</div></>:null}
   </main>
      {partnerPresenceOpen&&tab==="chat"&&room?.partner&&typeof document!=="undefined"?
       createPortal(<PartnerPresenceDetails partner={partner} lastSeenAt={lastSeen}
        online={partnerOnline} now={presenceNow} onClose={closePartnerPresence}
        returnFocusTo={partnerPresenceTrigger}/>,document.body):null}
      {partnerPhotoOpen&&token&&room?.partner?<PartnerProfileViewer
       name={partner} src={avatars.partner} onClose={()=>setPartnerPhotoOpen(false)}/>:null}
      {profileFile?<ProfilePhotoEditor key={profileFile.name+":"+profileFile.lastModified+":"+profileFile.size} file={profileFile} onCancel={()=>{if(!profileBusy){setProfileFile(null);setProfileError("")}}} onSave={saveProfilePhoto}/>:null}
   {token&&room?<VoiceCall key={room.roomId+room.user.id} token={token} partner={partner} avatarSrc={avatars.partner} hasPartner={Boolean(room.partner)} showButton={tab==="life"||tab==="chat"||tab==="watch"||tab==="watch-tiktok"||tab==="reconcile"} onOpenChat={()=>navigate("chat")}/>:null}
   {room&&token&&tab==="chat"&&noticeTarget?.id&&!room.messages.some(m=>m.id===noticeTarget.id)&&["message","photo","audio"].includes(noticeTarget.kind||"")?<div className="lr-push-focus-backdrop" role="dialog" aria-modal="true" aria-label="Contenu de la notification">
    <div className="lr-push-focus-card">
     <div className="lr-push-focus-header"><strong>{noticeTarget.kind==="photo"?"📸 Photo reçue":noticeTarget.kind==="audio"?"🎙️ Message vocal reçu":"💌 Message reçu"}</strong><button type="button" onClick={closeNotice} aria-label="Fermer le contenu">×</button></div>
     {focusLoading?<p>Ouverture du contenu…</p>:focusError?<p role="alert">{focusError}</p>:focusMessage?
       <div className="lr-push-focus-content">
        {focusMessage.view_once?<p className="lr-legacy-expired">Ancien média temporaire indisponible.</p>:focusMessage.kind==="text"?<p className="lr-push-focus-text">{focusMessage.content}</p>:focusMessage.kind==="image"?
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
