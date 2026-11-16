import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nextConsecutiveVoiceId,nextVoiceSpeed,VOICE_SPEEDS,type VoiceSequenceMessage} from "../src/voice-sequence";

const audio=(id:string,sender_id="a"):VoiceSequenceMessage=>({id,sender_id,kind:"audio"});
const text=(id:string,sender_id="a"):VoiceSequenceMessage=>({id,sender_id,kind:"text"});

test("Three consecutive voice notes from one sender play in order, then stop",()=>{
 const messages=[text("hello"),audio("voice-1"),audio("voice-2"),audio("voice-3"),text("bye")];
 assert.equal(nextConsecutiveVoiceId(messages,1),"voice-2");
 assert.equal(nextConsecutiveVoiceId(messages,2),"voice-3");
 assert.equal(nextConsecutiveVoiceId(messages,3),null);
});
test("Voice autoplay doesn't skip texts/photos, cross sender boundaries or jump backward",()=>{
 const messages:VoiceSequenceMessage[]=[
  audio("a1"),text("interruption"),audio("a2"),audio("b1","b"),audio("b2","b"),
  {id:"photo",kind:"image",sender_id:"b"},audio("b3","b")
 ];
 assert.equal(nextConsecutiveVoiceId(messages,0),null,"text after a1 stops autoplay");
 assert.equal(nextConsecutiveVoiceId(messages,2),null,"different person stops autoplay");
 assert.equal(nextConsecutiveVoiceId(messages,3),"b2");
 assert.equal(nextConsecutiveVoiceId(messages,4),null,"image after b2 stops autoplay");
 assert.equal(nextConsecutiveVoiceId(messages,6),null,"last message ends sequence");
 assert.equal(nextConsecutiveVoiceId(messages,-1),null);
 assert.equal(nextConsecutiveVoiceId(messages,7),null);
 assert.equal(nextConsecutiveVoiceId(messages,1),null);
});
test("Speed picker cycles 1x → 1.5x → 2x → 1x",()=>{
 assert.deepEqual(VOICE_SPEEDS,[1,1.5,2]);
 assert.equal(nextVoiceSpeed(1),1.5);
 assert.equal(nextVoiceSpeed(1.5),2);
 assert.equal(nextVoiceSpeed(2),1);
});
test("Chat maintains pending automatic target while encrypted next media loads",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(app.includes("nextConsecutiveVoiceId(chatMessages,idx)"));
 assert.ok(app.includes("nextAutoVoiceId===m.id"));
 assert.ok(app.includes("media[m.id]?<VoiceMessage"),"voice component mounts once private media becomes available");
 assert.ok(app.includes("onFinished={()=>setNextAutoVoiceId("));
 assert.ok(app.includes("onManualPlay={()=>setNextAutoVoiceId(null)}"));
 assert.ok(app.includes("onAutoPlayConsumed={()=>setNextAutoVoiceId(null)}"));
 assert.ok(app.includes("setNextAutoVoiceId(null)},[tab,room?.roomId]"),"navigation and room change cancel queue");
 assert.ok(app.includes("speed={voiceSpeed} onSpeedChange={setVoiceSpeed}"),"rate persists throughout playlist");
});
test("Voice player autostarts only on naturally finished playback, respecting recorder/call focus",()=>{
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 const focus=readFileSync("src/audio-focus.ts","utf8");
 assert.ok(player.includes("if(!autoPlay)return"));
 assert.ok(player.includes("void playVoice(true)"));
 assert.ok(player.includes('if(hasExclusiveAudioCapture())'),"recording and calls block autoplay");
 assert.ok(player.includes("if(!claimMessagePlayback(id,element))"),"one sound at a time");
 assert.ok(player.includes("if(automatic)onAutoPlayConsumed?.()"),"queued target consumed on success or failure");
 assert.ok(player.includes("onEnded={()=>{setPlaying(false);setPosition(0);"));
 assert.ok(player.includes("onFinished?.()"),"advances only once natural end fired");
 assert.ok(player.includes("Lecture automatique bloquée par le téléphone."),"iOS policy failure is explained");
 assert.ok(player.includes("onEnded={()=>onFinished?.()}"),"fallback native player can advance too");
 assert.ok(player.includes("if(audio.current)audio.current.playbackRate=speed"));
 assert.ok(player.includes("element.playbackRate=speed"));
 assert.ok(player.includes('className="lr-voice-note-speed"'));
 assert.ok(player.includes('onPointerDown={e=>e.stopPropagation()}'));
 assert.ok(focus.includes("hasExclusiveAudioCapture()"));
});
test("Speed button remains readable inside compact voice bubble",()=>{
 const css=readFileSync("src/voice-message.css","utf8");
 assert.ok(css.includes(".lr-chat .lr-voice-note .lr-voice-note-speed"));
 assert.ok(css.includes("min-width:37px!important"));
 assert.ok(css.includes(".lr-voice-note-meta{gap:5px!important}"));
 assert.ok(css.includes("touch-action:manipulation"));
});
