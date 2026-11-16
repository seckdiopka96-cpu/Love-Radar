import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 audioMode,claimRecordingAudio,releaseRecordingAudio,claimCallAudio,
 releaseCallAudio,claimMessagePlayback,hasExclusiveAudioCapture,
 isCallAudioActive,isRecordingAudioActive
} from "../src/audio-focus";

const read=(path:string)=>readFileSync(path,"utf8");
test("Audio focus: recording pauses playback and prevents any second source",()=>{
 assert.equal(audioMode(),"idle");
 assert.equal(claimMessagePlayback("voice-1"),true);
 assert.equal(claimRecordingAudio(),true);
 assert.equal(isRecordingAudioActive(),true);
 assert.equal(hasExclusiveAudioCapture(),true);
 assert.equal(claimMessagePlayback("voice-2"),false);
 assert.equal(claimRecordingAudio(),false,"cannot start two simultaneous mic recordings");
 releaseRecordingAudio();
 assert.equal(audioMode(),"idle");
 assert.equal(claimMessagePlayback("voice-3"),true);
});

test("Call wins over recording; the recorder cannot steal call microphone",()=>{
 assert.equal(claimRecordingAudio(),true);
 claimCallAudio();
 assert.equal(isCallAudioActive(),true);
 assert.equal(isRecordingAudioActive(),false);
 assert.equal(claimMessagePlayback("voice-1"),false);
 assert.equal(claimRecordingAudio(),false);
 releaseRecordingAudio(); // recorder onstop must never release the call focus
 assert.equal(audioMode(),"call");
 releaseCallAudio();
 assert.equal(audioMode(),"idle");
 assert.equal(claimRecordingAudio(),true);
 releaseRecordingAudio();
});

test("Real recording flow claims focus before mic permission and discards on call",()=>{
 const app=read("src/App.tsx");
 const voice=read("src/VoiceMessage.tsx");
 const call=read("src/VoiceCall.tsx");
 const focus=read("src/audio-focus.ts");
 assert.ok(app.includes("if(!claimRecordingAudio())"));
 assert.ok(app.indexOf("claimRecordingAudio()")<app.indexOf('navigator.mediaDevices.getUserMedia({audio:{'),"stop playback before iOS mic permission");
 assert.ok(app.includes("requestId!==recordingRequestId.current||isCallAudioActive()"),"cancel pending recording when call starts");
 assert.ok(app.includes('focus?.source!=="call"'),"listen for call interruption");
 assert.ok(app.includes("finishRecording(false)"),"discard interrupted recording");
 assert.ok(app.includes("releaseRecordingAudio();"),"release after stopping the mic");
 assert.ok(focus.includes('document.addEventListener("play",onPlay,true)'),"even native audio controls obey focus");
 assert.ok(focus.includes('pauseOtherMedia(except)'),"two audio elements never play together");
 assert.ok(voice.includes("if(hasExclusiveAudioCapture())"),"voice play rejects active call or mic");
 assert.ok(voice.includes('window.addEventListener("lr-audio-interrupt"'),"stop custom vocal player");
 assert.ok(voice.includes("fallbackAudio.current?.pause()"),"stop native fallback vocal player");
 assert.ok(call.includes("claimCallAudio()"),"calls stop competing playback");
 assert.ok(call.includes("releaseCallAudio()"),"hanging up releases focus");
 assert.ok(call.includes('data-lr-call-audio="true"'),"remote WebRTC stream remains audible during call");
});

test("Together video audio pauses locally for calls or recordings without pausing the partner",()=>{
 const youtube=read("src/WatchTogether.tsx");
 const tiktok=read("src/TikTokTogether.tsx");
 for(const [label,code] of [["YouTube",youtube],["TikTok",tiktok]]){
  assert.ok(code.includes("hasExclusiveAudioCapture()"),label+" respects a call/recording");
  assert.ok(code.includes('window.addEventListener("lr-audio-interrupt"'),label+" stops on focus change");
  assert.ok(code.includes('window.addEventListener("lr-audio-focus-released"'),label+" resumes after ending call");
  assert.ok(code.includes("claimMessagePlayback("),label+" stops any active voice note");
 }
 assert.ok(youtube.includes("ignorePlayerEventsUntil.current=Date.now()+4000"));
 assert.ok(tiktok.includes("suppressRef.current=Date.now()+4000"));
});

test("Partner avatar enlarges only the authenticated local picture with keyboard-accessible close",()=>{
 const app=read("src/App.tsx");
 const viewer=read("src/PartnerProfileViewer.tsx");
 const styles=read("src/partner-profile-viewer.css");
 assert.ok(app.includes('className="lr-partner-photo-trigger"'));
 assert.ok(app.includes('setPartnerPhotoOpen(true)'));
 assert.ok(app.includes("src={avatars.partner}"));
 assert.ok(app.includes("<PartnerProfileViewer"));
 assert.ok(viewer.includes('role="dialog"'));
 assert.ok(viewer.includes('aria-modal="true"'));
 assert.ok(viewer.includes('event.key==="Escape"'));
 assert.ok(viewer.includes('onClick={onClose}'));
 assert.ok(viewer.includes("src={src}"));
 assert.ok(!viewer.includes("fetch("),"no public photo URL or new unauthenticated endpoint");
 assert.ok(styles.includes("max-height:min(56dvh,400px)"));
});

test("Increase overall mobile icons/text moderately without scaling viewport",()=>{
 const css=read("src/comfortable-ui.css");
 const app=read("src/App.tsx");
 assert.ok(app.includes('import "./comfortable-ui.css"'));
 assert.ok(css.includes(".lr-mobile-nav button small"));
 assert.ok(css.includes("font-size:11px!important"));
 assert.ok(css.includes("width:26px!important;height:26px!important"));
 assert.ok(css.includes(".lr-home-quick strong"));
 assert.ok(css.includes("font-size:14px!important"));
 assert.ok(css.includes(".lr-chat-textbox > input[type=text]"));
 assert.ok(css.includes("font-size:17px!important"));
 assert.ok(css.includes("max-width:355px"),"avoid cramped narrow devices");
 assert.ok(!css.includes("scale(1."),"no whole-app zoom or transform");
});
