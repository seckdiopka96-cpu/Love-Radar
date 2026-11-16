import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {findBuiltInSpeaker,isSpeakerLabel,audioRouteHelp} from "../src/audio-output";

const voice=readFileSync("src/VoiceCall.tsx","utf8");
const api=readFileSync("functions/api/love.ts","utf8");
const chat=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/chat-stability.css","utf8");

test("choose the speaker, not a handset receiver or Bluetooth headset",()=>{
 assert.equal(isSpeakerLabel("Built-in Speaker"),true);
 assert.equal(isSpeakerLabel("Haut-parleur intégré"),true);
 assert.equal(isSpeakerLabel("iPhone Receiver"),false);
 assert.equal(isSpeakerLabel("AirPods Bluetooth Headphones"),false);
 assert.equal(isSpeakerLabel("Handset earpiece"),false);
 assert.equal(findBuiltInSpeaker([
  {kind:"audiooutput",label:"iPhone Receiver",deviceId:"ear"},
  {kind:"audiooutput",label:"Built-in Speaker",deviceId:"speaker"},
  {kind:"audiooutput",label:"Bluetooth Headphones",deviceId:"bt"}
 ]),"speaker");
 assert.equal(findBuiltInSpeaker([{kind:"audioinput",label:"Built-in Speaker",deviceId:"mic"}]),null);
 assert.match(audioRouteHelp(true),/iPhone/);
});
test("speaker is a two-way route control, with truthful iPhone fallback",()=>{
 assert.ok(voice.includes("previousSinkId.current=output.sinkId"));
 assert.ok(voice.includes("await output.setSinkId(speakerId)"));
 assert.ok(voice.includes("await output.setSinkId(previousSinkId.current)"));
 assert.ok(voice.includes("selectAudioOutput"));
 assert.ok(voice.includes("setSpeakerSelected(false)"));
 assert.ok(voice.includes("audioRouteHelp(isIOS)"));
 assert.ok(voice.includes("speakerBusy"));
 assert.ok(voice.includes("lr-call-mini-speaker"));
 assert.ok(voice.includes('audioSession.type="play-and-record"'));
});
test("chat server migrates recording presence and never exposes message drafts",()=>{
 assert.ok(api.includes('["last_seen_at","recording_until","last_reaction_read_at"]'));
 assert.ok(api.includes('op==="typing"||op==="recording"'));
 assert.ok(api.includes("recording_until INTEGER NOT NULL DEFAULT 0"));
 assert.ok(api.includes('get("status")==="1"'));
 assert.ok(api.includes("WHERE room_id=? AND member_id<>? LIMIT 1"));
 assert.ok(api.includes("partnerRecordingUntil"));
 assert.ok(api.includes("now+8500"));
 assert.equal(api.includes("console.log(body)"),false);
});
test("composing and voice recording presence do not expire during pauses",()=>{
 assert.ok(chat.includes('request("typing",{active:true})'));
 assert.ok(chat.includes('request("recording",{active:true})'));
 assert.ok(chat.includes('request("recording",{active:false})'));
 assert.ok(chat.includes('window.setInterval(heartbeat,2800)'));
 assert.ok(chat.includes("/api/love?status=1"));
 assert.ok(chat.includes("partnerRecording?"));
 assert.ok(chat.includes('<ChatActivity kind={partnerActivityKind}/>'));
 assert.ok(chat.includes('partnerRecording?"recording":partnerTyping?"typing":null'));
 assert.ok(!chat.includes('partner+" enregistre un vocal"'));
 assert.ok(!chat.includes('partner+" écrit"'));
});
test("typing focuses last message and keyboard remains in safe iPhone viewport",()=>{
 assert.ok(chat.includes("snapshotStarted.current"));
 assert.ok(chat.includes("sequence<snapshotApplied.current"));
 assert.ok(chat.includes("const scrollToLatest=useCallback"));
 assert.ok(chat.includes('onClick={scrollToLatest}'));
 assert.ok(chat.includes('onFocus={()=>{setStickerOpen(false);firstPoll.current=true;setChatFocused(true);scrollToLatest()}'));
 assert.ok(chat.includes("syncWithChat"));
 assert.ok(chat.includes("new ResizeObserver"));
 assert.ok(chat.includes("chatAtBottomRef.current"));
 assert.ok(chat.includes('viewport?.addEventListener("scroll",sync)'));
 assert.ok(!chat.includes('viewport?.addEventListener("scroll",syncWithChat)'));
 assert.ok(chat.includes("discardRecording.current=true"));
 assert.ok(chat.includes("!discardRecording.current"));
 assert.ok(chat.includes('if(active.state==="recording")'));
 assert.ok(css.includes("lr-keyboard-open .lr-chat-head"));
 assert.ok(css.includes("padding:max(55px, env(safe-area-inset-top))"));
 assert.ok(css.includes("overflow-y:auto!important"));
 assert.ok(css.includes("lr-chat-jump"));
 assert.ok(css.includes("lr-chat-form input[type=text]"));
});

test("voice recording replaces the typing keyboard with a full-width iPhone composer",()=>{
 const styles=readFileSync("src/recording-composer.css","utf8");
 assert.ok(chat.includes('import "./recording-composer.css";'));
 const start=chat.indexOf("async function toggleRecording(){");
 const blur=chat.indexOf("chatInput.current?.blur();",start);
 const startMic=chat.indexOf("navigator.mediaDevices.getUserMedia({audio:true})",start);
 assert.ok(blur>start&&blur<startMic,"Input loses focus before microphone acquisition");
 assert.ok(chat.includes("setChatFocused(false);"));
 assert.ok(chat.includes("setStickerOpen(false);"));
 assert.ok(chat.includes('lr-recording-mode'));
 assert.ok(chat.includes('{recording?<div className="lr-voice-recording-composer"'));
 assert.ok(chat.includes('aria-label="Supprimer le vocal"'));
 assert.ok(chat.includes('aria-label="Envoyer le vocal"'));
 assert.ok(chat.includes('pauseOrResumeRecording'));
 assert.ok(chat.includes("active.pause();setRecordingPaused(true)"));
 assert.ok(chat.includes("active.resume();recordingStartedAt.current=Date.now()"));
 assert.ok(chat.includes('finishRecording(false)'));
 assert.ok(chat.includes('finishRecording(true)'));
 assert.ok(chat.includes('if(blob.size>0&&!discardRecording.current)'));
 assert.ok(chat.includes("if(recorder.current?.state!==\"inactive\")recorder.current?.stop()"));
 assert.ok(styles.includes(".lr-voice-recording-actions"));
 assert.ok(styles.includes(".lr-voice-recording-wave"));
 assert.ok(styles.includes("env(safe-area-inset-bottom)"));
 assert.ok(styles.includes("@media(prefers-reduced-motion:reduce)"));
});

test("voice recorder stays a compact single row with accessible controls",()=>{
 const styles=readFileSync("src/recording-composer.css","utf8");
 assert.ok(styles.includes("grid-template-columns:minmax(0,1fr) auto"));
 assert.ok(styles.includes("align-items:center;gap:9px"));
 assert.ok(styles.includes("min-height:61px"));
 assert.ok(styles.includes(".lr-voice-recording-actions .lr-voice-rec-pause"));
 assert.ok(styles.includes(".lr-voice-recording-actions .lr-voice-rec-send"));
 assert.ok(styles.includes(".lr-voice-recording-actions .lr-voice-rec-delete"));
 assert.ok(styles.includes("env(safe-area-inset-bottom)"));
 assert.ok(chat.includes('Array.from({length:17}'),"Waveform stays simple");
 assert.ok(chat.includes('aria-label="Supprimer le vocal"'));
 assert.ok(chat.includes('aria-label="Envoyer le vocal"'));
});
