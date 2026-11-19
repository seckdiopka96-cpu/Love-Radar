import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const call=readFileSync("src/VoiceCall.tsx","utf8");
const api=readFileSync("functions/api/call.ts","utf8");
const tiktok=readFileSync("src/tiktok-together.css","utf8");
const screen=readFileSync("src/TikTokTogether.tsx","utf8");
const youtubeStyle=readFileSync("src/watch-together.css","utf8");

test("Voice calls do not wait up to fourteen seconds for ICE gathering before signaling",()=>{
 assert.equal(call.includes("iceReady("),false,"ICE gathering wait must not block SDP exchange");
 assert.equal(call.includes("setTimeout(finish,14000)"),false);
 assert.ok(call.includes('await api("signal",{id:call.id,kind:"offer"'));
 assert.ok(call.includes('await api("signal",{id:call.id,kind:"answer"'));
 assert.ok(call.includes("sessionDescriptionSent.current=true"));
 assert.ok(call.includes('peer.onicecandidate='));
 assert.ok(call.includes('await api("signal",{id:callId,kind:"candidate",candidate})'));
 assert.ok(call.includes('await peer.addIceCandidate('));
});
test("Voice calls prewarm relay configuration and check signaling quickly during active calls",()=>{
 assert.ok(call.includes("if(hasPartner)void warmNetwork()"));
 assert.ok(call.includes("current.current?420:1800"));
 assert.ok(call.includes("void sync();"),"caller/callee can refresh immediately");
 assert.ok(call.includes("iceCandidatePoolSize:2"));
 assert.ok(call.includes("queuedCandidates.current=[]"));
 assert.ok(call.includes("queue===queuedCandidates.current"));
 assert.ok(call.includes("void flushCandidates(call.id)"));
});
test("Server limits candidate inputs and sends ordered SDP plus ICE fragments",()=>{
 assert.ok(api.includes('kind!=="offer"&&kind!=="answer"&&kind!=="candidate"&&kind!=="restart"'));
 assert.ok(api.includes("ice.candidate.startsWith"));
 assert.ok(api.includes("JSON.stringify({candidate:ice.candidate"));
 assert.ok(api.includes('kind=\'candidate\''));
 assert.ok(api.includes(">=192"));
 assert.ok(api.includes("ORDER BY id ASC LIMIT 40"));
 assert.ok(api.includes("status!==\"active\""));
});
test("TikTok does not scroll the entire iPhone screen or hide video sharing controls",()=>{
 assert.ok(tiktok.includes("overflow:hidden!important;overscroll-behavior:none!important;"));
 assert.ok(tiktok.includes(".tk-video-area.has-video .tk-video-container"));
 assert.ok(tiktok.includes(".tk-video-area.is-empty .tk-video-container"));
 assert.ok(tiktok.includes(".tk-share small{display:none!important}"));
 assert.ok(tiktok.includes(".tk-page:has(.tk-share input:focus,.tk-chat-send input:focus)"));
 assert.ok(screen.includes('tk-has-video'));
 assert.ok(screen.includes('tk-no-video'));
});

test("YouTube co-watch also keeps its player, link editor and conversation on a fixed mobile page",()=>{
 assert.ok(youtubeStyle.includes(".wt-body{display:flex!important;"));
 assert.ok(youtubeStyle.includes("overflow:hidden!important;overscroll-behavior:none!important;"));
 assert.ok(youtubeStyle.includes(".wt-screen-panel{display:flex!important;"));
 assert.ok(youtubeStyle.includes(".wt-screen{flex:1 1 0!important;"));
 assert.ok(youtubeStyle.includes(".wt-link-form{flex:0 0 auto!important;"));
 assert.ok(youtubeStyle.includes(".wt-conversation.is-open"));
 assert.ok(youtubeStyle.includes(".wt-page:has(.wt-link-line input:focus,.wt-chat-compose input:focus)"));
});

test("outgoing and incoming calls have audible repeating tones that stop on pickup or hangup",()=>{
 const ringtone=readFileSync("src/call-ringtone.ts","utf8");
 const focus=readFileSync("src/audio-focus.ts","utf8");
 assert.ok(ringtone.includes('export function startCallTone(kind:CallToneKind'));
 assert.ok(ringtone.includes('export function stopCallTone()'));
 assert.ok(ringtone.includes('export async function primeCallTone()'));
 assert.ok(ringtone.includes('ctx.createOscillator()'));
 assert.ok(ringtone.includes('pulse([440,480]'),"outgoing ringback is audible");
 assert.ok(ringtone.includes('pulse([587.33,783.99]'),"incoming chime is audible");
 assert.ok(ringtone.includes('window.setInterval('),"ring until accepted, not a single beep");
 assert.ok(ringtone.includes('tone.stop()'),"ringing nodes stop on end");
 assert.ok(ringtone.includes('if(generation!==token||activeKind!==kind)return'),"stale async ringing does not revive");
 assert.ok(call.includes('startCallTone(active.direction'));
 assert.ok(call.includes('if(!active||active.status!=="ringing"'),"active connected calls have no ringtone");
 assert.ok(call.includes('active.id==="preparing-video"'),"do not falsely ring before server acceptance");
 assert.ok(call.includes('stopCallTone();'),"stop immediately on pickup/end");
 assert.ok(call.includes('void primeCallTone();'),"outgoing ringtone gets iPhone user gesture");
 assert.ok(call.includes('document.addEventListener("pointerdown",unlock'),"incoming tone is primed by earlier gestures");
 assert.ok(call.includes('Activer la sonnerie'),"incoming fallback for autoplay-blocked iPhones");
 assert.ok(call.includes('Appel vocal sortant…'),"outgoing audio is not falsely labeled connected");
 assert.ok(focus.includes('target.dataset.lrCallVideo==="true"'),"do not pause the video while ringing");
 assert.ok(!/https?:\/\//.test(ringtone),"no external sound asset or data upload");
});

test("voice calling stays intact while HD video is added",()=>{
 const css=readFileSync("src/voice-call.css","utf8");
 const videoCss=readFileSync("src/video-call.css","utf8");
 assert.ok(call.includes('lr-call-sheet lr-call-facetime'));
 assert.ok(call.includes('className="lr-call-identity"'));
 assert.ok(call.includes('className="lr-call-initial"'));
 assert.ok(call.includes('className={"lr-call-actions"'));
 for(const cls of ["lr-call-speaker","lr-call-mute","lr-call-chat","lr-call-more","lr-call-hangup","lr-call-keypad"]){
  assert.ok(call.includes(cls),"Missing audio control "+cls);
 }
 for(const cls of ["lr-call-camera","lr-call-flip","lr-call-video-stage","lr-call-floating","lr-video-trigger"]){
  assert.ok(call.includes(cls),"Missing video element "+cls);
 }
 for(const marker of ["onClick={selectSpeaker}","onClick={toggleMute}","onClick={minimizeAndWrite}","onClick={hangup}","onOpenChat()","setMinimized(true)"]){
  assert.ok(call.includes(marker),"Existing behavior lost: "+marker);
 }
 assert.ok(call.includes('start("audio")'));
 assert.ok(call.includes('start("video")'));
 assert.ok(call.includes('}:false;'),"audio-only calls must never open the camera");
 assert.ok(call.includes('peer.addTransceiver("video"'));
 assert.ok(call.includes('offerToReceiveVideo:call.mode==="video"'));
 assert.ok(call.includes('sender.replaceTrack(track)'));
 assert.ok(css.includes('.lr-call-sheet.lr-call-facetime'));
 assert.ok(css.includes('height:100dvh'));
 assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
 assert.ok(css.includes('.lr-call-mini'));
 assert.ok(videoCss.includes('.lr-call-video-stage'));
 assert.ok(videoCss.includes('.lr-call-mini-video'));
});

test("iPhone shows local camera frames and can flip while the partner has not answered",()=>{
 const videoCss=readFileSync("src/video-call.css","utf8");
 assert.ok(call.includes('element.srcObject=new MediaStream([track])'),"self-preview uses video-only stream");
 assert.ok(call.includes('element.muted=true'));
 assert.ok(call.includes('data-lr-call-video="true"'));
 assert.ok(call.includes('await element.play()'));
 assert.ok(call.includes('onPlaying={revealLocalFrame}'));
 assert.ok(call.includes('className="lr-call-video-self-help"'));
 assert.ok(call.includes('className="lr-call-video-retry"'));
 assert.ok(call.includes('onClick={()=>void playLocalPreview()}'));
 assert.ok(call.includes('if(sender)await sender.replaceTrack(track)'),"camera switching must work before a peer sender exists");
 assert.ok(!call.includes('if(!sender||!existing)'),"do not confuse unanswered call with disabled camera");
 assert.ok(videoCss.includes('.lr-call-video-self .lr-call-video-self-help'));
 assert.ok(videoCss.includes('.lr-call-video-self .lr-call-video-retry'));
});

test("local camera is fullscreen before pickup and becomes PiP after partner video plays",()=>{
 const css=readFileSync("src/video-call.css","utf8");
 const focus=readFileSync("src/audio-focus.ts","utf8");
 assert.ok(call.includes('setActive({id:"preparing-video"'));
 assert.ok(call.includes('showPartnerFullscreen'));
 assert.ok(call.includes('" has-partner-video":" is-self-first"'));
 assert.ok(call.includes('onPlaying={()=>setRemoteVideoReady(true)}'));
 assert.ok(call.includes('onPlaying={revealLocalFrame}'));
 assert.ok(css.includes('Full-screen video calling v3'));
 assert.ok(css.includes('.lr-call-video-stage.has-partner-video .lr-call-video-self'));
 assert.ok(focus.includes('target.dataset.lrCallVideo==="true"'));
 assert.ok(focus.includes('if(mode!=="call")target.pause()'));
});
test("video Messages minimizes during outgoing ringing without ending the call",()=>{
 assert.ok(call.includes('call.status==="ringing"&&call.direction==="outgoing"'));
 assert.ok(call.includes('setCallPanel("none");setVideoControlsVisible(true);setMinimized(true)'));
 assert.ok(call.includes('onOpenChat()'));
 assert.ok(call.includes('active.status==="ringing"&&active.direction==="outgoing"'));
 assert.ok(call.includes('active.status==="ringing"&&active.direction==="incoming"'));
 assert.ok(call.includes('active.status==="ringing"?"Appel sortant…"'));
});
test("fullscreen video tap toggles overlays without interrupting microphone, camera or call",()=>{
 const videoCss=readFileSync("src/video-call.css","utf8");
 assert.ok(call.includes('const [videoControlsVisible,setVideoControlsVisible]=useState(true)'));
 assert.ok(call.includes('videoCanToggleControls=Boolean(isVideo&&active?.status==="active")'),
  "controls must never disappear before the incoming call is answered");
 assert.ok(call.includes("setVideoControlsVisible(visible=>!visible)"),
  "a screen tap must alternately hide and restore all call controls");
 assert.ok(call.includes("onClick={toggleVideoControls}"),"the full-screen video responds to taps");
 assert.ok(call.includes('event.target.closest("button,a,input")'),
  "camera retry and other buttons must keep their normal action");
 assert.ok(call.includes('tabIndex={videoCanToggleControls?0:undefined}'),
  "allow a keyboard user to toggle controls too");
 assert.ok(call.includes('event.key==="Enter"||event.key===" "'),"support Enter and Space");
 assert.ok(call.includes('is-controls-hidden'),"hide state applies to video calls only");
 assert.ok(videoCss.includes(".lr-video-call.is-controls-hidden .lr-call-upper"),
  "top buttons and caller identification fade away");
 assert.ok(videoCss.includes(".lr-video-call.is-controls-hidden .lr-call-actions"),
  "bottom controls fade away");
 assert.ok(videoCss.includes("visibility:hidden!important"),
  "hidden commands must not take taps from the video");
 assert.ok(videoCss.includes(".lr-video-call.is-controls-hidden .lr-call-video-retry"),
  "do not leave a floating retry button on top of the unobstructed video");
 assert.ok(call.includes("setVideoControlsVisible(true);setCallPanel"),"new calls restore controls");
 assert.ok(call.includes("setVideoControlsVisible(true);setMinimized(true)"),
  "minimizing and reopening restores visible controls");
 assert.ok(call.includes("const videoOptions=active&&isVideo&&callPanel"),
  "the full video options sheet remains available");
});

test("video Plus opens a usable independent overlay and video keypad is hidden",()=>{
 const videoCss=readFileSync("src/video-call.css","utf8");
 assert.ok(call.includes('const videoOptions=active&&isVideo&&callPanel!=="none"?createPortal('));
 assert.ok(call.includes('className="lr-video-options-backdrop"'));
 assert.ok(call.includes('role="dialog"'));
 assert.ok(call.includes('onClick={()=>setCallPanel("more")}'));
 assert.ok(call.includes('onClick={minimizeAndWrite}'));
 assert.ok(call.includes('{videoOptions}'));
 assert.ok(call.includes('!isVideo&&callPanel!=="none"'),"audio-only options remain intact");
 assert.ok(videoCss.includes('.lr-call-backdrop .lr-video-call .lr-call-keypad{display:none!important}'));
 assert.ok(videoCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
 assert.ok(videoCss.includes('.lr-video-options-sheet{'));
 assert.ok(videoCss.includes('z-index:2147483647'));
});

test("recover ICE on both sides without closing the call or recapturing camera",()=>{
 const rules=readFileSync("src/call-resilience.ts","utf8");
 assert.ok(call.includes("const attemptIceRecovery=useCallback(async(force=false)=>"));
 assert.ok(call.includes('peer.createOffer({iceRestart:true'));
 assert.ok(call.includes('if(typeof peer.restartIce==="function")peer.restartIce()'));
 assert.ok(call.includes('await api("signal",{id:call.id,kind:"restart"})'));
 assert.ok(call.includes('kind:"offer",sdp:peer.localDescription?.sdp||"",restart:true'));
 assert.ok(call.includes('kind:"answer",sdp:peer.localDescription?.sdp||"",restart:renegotiating'));
 assert.ok(call.includes('if(signal.kind==="restart"&&call.direction==="outgoing")'));
 assert.ok(call.includes('if(!sessionDescriptionSent.current&&peer.localDescription?.type==="answer")'),"retry unanswered SDP on unstable network");
 assert.ok(call.includes('if(signal.kind==="offer"&&call.direction==="incoming")'));
 assert.ok(call.includes('window.addEventListener("online",online)'));
 assert.ok(call.includes('window.addEventListener("offline",offline)'));
 assert.ok(call.includes('scheduleIceRecovery()'));
 assert.ok(call.includes('if(recoveryTimer.current!==null){window.clearTimeout(recoveryTimer.current);recoveryTimer.current=null}'));
 assert.ok(call.includes('Réessayer la connexion'));
 assert.ok(rules.includes('MAX_RECONNECT_ATTEMPTS=7'));
});
test("floating partner video is draggable over chat or Ludo, with safe controls",()=>{
 const css=readFileSync("src/floating-video.css","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(call.includes('ref={floatingBox}'));
 assert.ok(call.includes('className={"lr-call-floating"'));
 assert.ok(call.includes('onPointerDown={beginVideoDrag}'));
 assert.ok(call.includes('onPointerMove={moveVideoDrag}'));
 assert.ok(call.includes('onPointerUp={endVideoDrag}'));
 assert.ok(call.includes('onPointerCancel={endVideoDrag}'));
 assert.ok(call.includes('clampFloatingCall('));
 assert.ok(call.includes('ref={attachRemoteVideo} data-lr-call-video="true"'));
 assert.ok(call.includes('ref={attachLocalVideo} data-lr-call-video="true"'));
 assert.ok(call.includes('onClick={()=>setMinimized(false)}'));
 assert.ok(call.includes('onClick={toggleMute}'));
 assert.ok(call.includes('onClick={toggleCamera}'));
 assert.ok(call.includes('onClick={hangup}'));
 assert.ok(app.includes('<VoiceCall key={room.roomId+room.user.id}'));
 assert.ok(css.includes('position:fixed'));
 assert.ok(css.includes('touch-action:none'));
 assert.ok(css.includes('.lr-call-floating-actions'));
});

test("call signaling and microphone initialize in parallel to reduce time before ringing",()=>{
 assert.ok(call.includes("const micTask=microphone(mode)"));
 assert.ok(call.includes('const callTask=api("start",{mode})'));
 assert.ok(call.includes("Promise.all([callTask,micTask])"));
 assert.ok(call.includes('Promise.all([microphone(c.mode==="video"?"video":"audio"),warmNetwork()])'));
 assert.ok(call.includes('void api("end",{id:created.call.id})'));
 assert.ok(!call.includes('await microphone(); // Called immediately after the tap'));
 assert.ok(!call.includes('Love Radar audio'));
});


test("minimized calls can open every main Love Radar tab without hanging up",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const css=readFileSync("src/voice-call.css","utf8");
 const floating=readFileSync("src/floating-video.css","utf8");
 for(const section of ['home','memories','together','games','chat']){
  assert.ok(call.includes('id:"'+section+'"'),"in-call navigation exposes "+section);
 }
 assert.ok(call.includes('onNavigate:(destination:CallDestination)=>void'));
 assert.ok(app.includes('onNavigate={destination=>navigate(destination)}'));
 assert.ok(app.includes('<VoiceCall key={room.roomId+room.user.id}'),"call remains mounted outside the tab-specific pages");
 assert.ok(call.includes('function navigateDuringCall(destination:CallDestination)'));
 const navAction=call.slice(call.indexOf('function navigateDuringCall('),call.indexOf('function pressKey('));
 assert.ok(navAction.includes('setMinimized(true)'),"in-call page changes keep the call miniaturized");
 assert.ok(navAction.includes('onNavigate(destination)'),"destination stays inside the SPA");
 assert.ok(!navAction.includes('hangup('),"navigation must never end the call");
 assert.ok(!navAction.includes('endNativeCallSession('),"navigation must not terminate the native call session");
 assert.ok(call.includes('className="lr-call-mini-explore"'),"audio calls expose Explorer in the mini bar");
 assert.ok(call.includes('className="lr-call-floating-explore"'),"floating video calls expose Explorer as well");
 assert.ok(call.includes('className="lr-call-navigation-sheet"'));
 assert.ok(call.includes('setCallNavigationOpen(false)'),"the menu can close without leaving the app");
 assert.ok(css.includes('.lr-call-navigation-backdrop'),"menu is visible above the app");
 assert.ok(css.includes('env(safe-area-inset-bottom)'),"navigation respects iPhone safe areas");
 assert.ok(floating.includes('.lr-call-floating-actions'),"video window retains controls while browsing");
 assert.ok(call.includes('<audio ref={remote}'),"remote audio remains mounted during in-app navigation");
});
