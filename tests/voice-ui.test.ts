import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {voiceBars,VOICE_BARS,formatVoiceTime,audioDuration} from "../src/voice-waveform";

test("voice note wave displays consistent phone-sized variation per message",()=>{
 const a=voiceBars("message-a"),again=voiceBars("message-a"),b=voiceBars("message-b");
 assert.equal(a.length,VOICE_BARS);
 assert.deepEqual(a,again);
 assert.notDeepEqual(a,b);
 assert.ok(a.every(n=>n>=12&&n<=100));
 assert.ok(new Set(a).size>8);
});
test("audio player handles short, long and unfinished durations safely",()=>{
 assert.equal(formatVoiceTime(4.8),"0:04");
 assert.equal(formatVoiceTime(66.8),"1:06");
 assert.equal(formatVoiceTime(3603),"60:03");
 assert.equal(formatVoiceTime(Infinity),"0:00");
 assert.equal(formatVoiceTime(NaN),"0:00");
 assert.equal(audioDuration(Infinity),0);
 assert.equal(audioDuration(-2),0);
 assert.equal(audioDuration(5.6),5.6);
});
test("real playable voice notes replace basic audio controls inside chat",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 const css=readFileSync("src/voice-message.css","utf8");
 assert.ok(app.includes('import VoiceMessage from "./VoiceMessage";'));
 assert.ok(app.includes('import "./voice-message.css";'));
 assert.ok(app.includes('m.kind==="audio"?" lr-bubble-audio"'));
 assert.ok(app.includes("media[m.id]?<VoiceMessage"));
 assert.ok(!app.includes('<div className="lr-voice"><span>Message vocal</span><audio controls'));
 assert.ok(player.includes("await element.play()"));
 assert.ok(player.includes("element.pause()"));
 assert.ok(player.includes("element.currentTime=time"));
 assert.ok(player.includes('onEnded={()=>'));
 assert.ok(player.includes('onLoadedMetadata={updateDuration}'));
 assert.ok(player.includes('type="range"'));
 assert.ok(player.includes('lr-voice-playing'));
 assert.ok(player.includes('lr-voice-note-fallback'));
 assert.ok(player.includes('delivery==="read"'));
 assert.ok(css.includes(".lr-bubble.lr-bubble-audio"));
 assert.ok(css.includes(".lr-voice-note-wave"));
 assert.ok(css.includes(".lr-voice-note-seek"));
 assert.ok(css.includes(".lr-voice-note.is-own"));
});
test("outgoing and incoming audio remain in existing conversation order with no repeated timestamp",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(app.includes('!groupedAfter&&m.kind!=="audio"'));
 assert.ok(app.includes('mine&&m.kind!=="audio"&&m.id===lastOwnMessage?.id'));
 assert.ok(app.includes('mine={mine} time={time}'));
 assert.ok(app.includes('chatMessages.map((m,idx)=>'));
});

test("every playable vocal exposes reactions and message actions without hijacking playback",()=>{
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const css=readFileSync("src/voice-message.css","utf8");
 const api=readFileSync("functions/api/love.ts","utf8");
 assert.ok(player.includes("onOpenActions?:()=>void"));
 assert.ok(player.includes('className="lr-voice-note-actions"'));
 assert.ok(player.includes('onClick={e=>{e.stopPropagation();onOpenActions()}}'));
 assert.ok(player.includes('onPointerDown={e=>e.stopPropagation()}'));
 assert.ok(app.includes("onOpenActions={()=>openMessageActions(m)}"));
 assert.ok(app.includes('onPointerDown={e=>messagePointerDown(e,m)}'));
 assert.ok(app.includes('onPointerUp={e=>messagePointerUp(e,m)}'));
 assert.ok(app.includes('CHAT_REACTIONS.map(emoji=>'));
 assert.ok(app.includes('onClick={()=>void deleteOwnMessage(actionMessage)}'));
 assert.ok(api.includes("kind IN ('text','image','audio')"));
 assert.ok(css.includes(".lr-voice-note-actions"));
});
