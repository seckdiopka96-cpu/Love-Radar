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
 assert.ok(api.includes('kind!=="offer"&&kind!=="answer"&&kind!=="candidate"'));
 assert.ok(api.includes("ice.candidate.startsWith"));
 assert.ok(api.includes("JSON.stringify({candidate:ice.candidate"));
 assert.ok(api.includes('kind=\'candidate\''));
 assert.ok(api.includes(">=64"));
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
 for(const cls of ["lr-call-camera","lr-call-flip","lr-call-video-stage","lr-call-mini-video","lr-video-trigger"]){
  assert.ok(call.includes(cls),"Missing video element "+cls);
 }
 for(const marker of ["onClick={selectSpeaker}","onClick={toggleMute}","onClick={minimizeAndWrite}","onClick={hangup}","onOpenChat()","setMinimized(true)"]){
  assert.ok(call.includes(marker),"Existing behavior lost: "+marker);
 }
 assert.ok(call.includes('start("audio")'));
 assert.ok(call.includes('start("video")'));
 assert.ok(call.includes('video:false'));
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
 assert.ok(call.includes('await element.play()'));
 assert.ok(call.includes('onPlaying={()=>{setLocalPreviewReady(true)'));
 assert.ok(call.includes('className="lr-call-video-self-help"'));
 assert.ok(call.includes('className="lr-call-video-retry"'));
 assert.ok(call.includes('onClick={()=>void playLocalPreview()}'));
 assert.ok(call.includes('if(sender)await sender.replaceTrack(track)'),"camera switching must work before a peer sender exists");
 assert.ok(!call.includes('if(!sender||!existing)'),"do not confuse unanswered call with disabled camera");
 assert.ok(videoCss.includes('.lr-call-video-self .lr-call-video-self-help'));
 assert.ok(videoCss.includes('.lr-call-video-self .lr-call-video-retry'));
});

test("video Messages minimizes during outgoing ringing without ending the call",()=>{
 assert.ok(call.includes('call.status==="ringing"&&call.direction==="outgoing"'));
 assert.ok(call.includes('setCallPanel("none");setMinimized(true)'));
 assert.ok(call.includes('onOpenChat()'));
 assert.ok(call.includes('active.status==="ringing"&&active.direction==="outgoing"'));
 assert.ok(call.includes('active.status==="ringing"&&active.direction==="incoming"'));
 assert.ok(call.includes('active.status==="ringing"?"Appel sortant…"'));
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

test("call signaling and microphone initialize in parallel to reduce time before ringing",()=>{
 assert.ok(call.includes("const micTask=microphone(mode)"));
 assert.ok(call.includes('const callTask=api("start",{mode})'));
 assert.ok(call.includes("Promise.all([callTask,micTask])"));
 assert.ok(call.includes('Promise.all([microphone(c.mode==="video"?"video":"audio"),warmNetwork()])'));
 assert.ok(call.includes('void api("end",{id:created.call.id})'));
 assert.ok(!call.includes('await microphone(); // Called immediately after the tap'));
 assert.ok(!call.includes('Love Radar audio'));
});
