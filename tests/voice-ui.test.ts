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
 assert.ok(app.includes('mine&&m.kind!=="audio"&&textOutbox.every(v=>v.id!==m.id||v.status==="sent")'),"every confirmed outgoing bubble has its own receipt");
 assert.ok(app.includes('mine={mine} time={time}'));
 assert.ok(app.includes('chatTimeline.map((entry,feedIndex)=>'),"Call events and messages are rendered by chronology");
 assert.ok(app.includes('const m=entry.message,idx=entry.index;'),"Voice sequence still uses original message index");
});

test("voice notes open the same message actions via long press without a visible three-dot button",()=>{
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const css=readFileSync("src/voice-message.css","utf8");
 const api=readFileSync("functions/api/love.ts","utf8");
 assert.ok(!player.includes('className="lr-voice-note-actions"'),"no action icon over the waveform");
 assert.ok(!player.includes("onOpenActions"),"action menu is owned by the outer chat message");
 assert.ok(!app.includes("onOpenActions={()=>openMessageActions(m)}"));
 assert.ok(!css.includes(".lr-voice-note-actions"),"no old floating button styles");
 assert.ok(app.includes('onPointerDown={e=>messagePointerDown(e,m)}'));
 assert.ok(app.includes('onPointerUp={e=>messagePointerUp(e,m)}'));
 assert.ok(app.includes("window.setTimeout(()=>"),"long hold timer remains active");
 assert.ok(app.includes("openMessageActions(message)"),"hold opens existing menu");
 assert.ok(app.includes('const holdOnly=Boolean((e.target as HTMLElement).closest("input[type=range]"))'),"waveform is holdable");
 assert.ok(app.includes("if(g.holdOnly){if(Math.abs(dx)>10||Math.abs(dy)>10)resetSwipe(e.currentTarget);return}"),"dragging waveform cancels long hold");
 assert.ok(app.includes("!g.holdOnly&&dx>=62"),"waveform scrubbing never triggers swipe reply");
 assert.ok(app.includes('CHAT_REACTIONS.map(emoji=>'));
 assert.ok(app.includes('onClick={()=>void deleteOwnMessage(actionMessage)}'));
 assert.ok(api.includes("kind IN ('text','image','audio')"));
});

test("voice notes use live member profile photos, clickable profile and in-place playback speed",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 const css=readFileSync("src/voice-message.css","utf8");
 assert.ok(app.includes("avatarSrc={mine?avatars.mine:avatars.partner}"),"uses private room avatar URLs");
 assert.ok(app.includes("avatarName={mine?room.user.name:partner}"),"uses the message sender's identity");
 assert.ok(app.includes('onOpenProfile={mine?()=>navigate("settings"):()=>setPartnerPhotoOpen(true)}'),"opens the appropriate member profile");
 assert.ok(player.includes("{avatarSrc?<img src={avatarSrc}"),"renders actual photo when available");
 assert.ok(player.includes("lr-voice-note-avatar-initial"),"falls back to initials without a profile photo");
 assert.ok(player.includes("{mine?avatarControl:null}"),"sender photo sits to left of waveform");
 assert.ok(player.includes("{!mine?avatarControl:null}"),"receiver photo sits to right of waveform");
 assert.ok(player.includes('playing?<button type="button" className="lr-voice-note-speed"'),"playback replaces photo slot with speed selector");
 assert.ok(player.includes("changeSpeed()"),"speed control changes actual playback rate");
 assert.ok(css.includes(".lr-chat .lr-voice-note-identity"),"voice avatar has its own stable flex cell");
 assert.ok(css.includes(".lr-chat .lr-voice-note-mic"),"microphone badge is attached to the member photo");
});

test("voice speed, play icon and waveform sit on the same row in both directions",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const theme=readFileSync("src/voice-alignment.css","utf8");
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 assert.ok(app.includes('import "./voice-alignment.css";'),"Final alignment overrides older mobile voice rules");
 assert.ok(theme.includes("grid-template-rows:32px 18px;"),"Playback controls and time have separate rows");
 assert.ok(theme.includes("display:contents!important;"),"Waveform and time become direct grid children");
 assert.ok(theme.includes("grid-template-columns:42px 34px minmax(0,1fr);"),"Outgoing notes start with the avatar/speed slot");
 assert.ok(theme.includes("grid-template-columns:34px minmax(0,1fr) 42px;"),"Incoming notes end with the avatar/speed slot");
 assert.ok(theme.includes(".lr-voice-note-identity.is-active"),"Speed pill aligns with top playback row");
 assert.ok(theme.includes(".lr-voice-note.is-own .lr-voice-note-play{grid-column:2!important}"));
 assert.ok(theme.includes(".lr-voice-note.is-partner .lr-voice-note-play{grid-column:1!important}"));
 assert.ok(theme.includes(".lr-voice-note-wave-wrap{"),"Waveform follows play control");
 assert.ok(theme.includes(".lr-voice-note-meta{"),"Duration and timestamp remain beneath waveform");
 assert.ok(player.includes("onClick={toggle}"),"Play/pause still works");
 assert.ok(player.includes("onClick={event=>{event.stopPropagation();changeSpeed()}}"),"Speed still changes without triggering reply");
 assert.ok(player.includes("onChange={event=>seek(Number(event.target.value))}"),"Scrubbing still works");
});

test("decorative voice waveform is legible and naturally varied without changing seek controls",()=>{
 const source=readFileSync("src/voice-waveform.ts","utf8");
 const style=readFileSync("src/premium-design-polish.css","utf8");
 const player=readFileSync("src/VoiceMessage.tsx","utf8");
 const first=voiceBars("expressive-voice");
 assert.ok(new Set(first).size>=12,"speech-like placeholder shows many different levels");
 assert.ok(first.some(h=>h<=32)&&first.some(h=>h>=48),"small and tall bars remain visible");
 assert.ok(source.includes("decorative, not a measurement")||source.includes("decorative, not a measurement of the recording"),"placeholder is not mistaken for real audio amplitudes");
 assert.ok(style.includes(".lr-app .lr-chat .lr-voice-note-wave>span"),"wave strokes have final visual polish");
 assert.ok(style.includes("background:#ffd0dd!important;"),"rose notes retain a contrasting unplayed waveform");
 assert.ok(style.includes("background:#fff!important;"),"played waveform remains white");
 assert.ok(player.includes('onChange={event=>seek(Number(event.target.value))}'),"seeking remains functional");
});

test("received voice bubbles use their original grey while outgoing voices stay pink",()=>{
 const css=readFileSync("src/voice-message.css","utf8");
 assert.match(css,/\.lr-app\.lr-chat-mode \.lr-chat \.lr-bubble-row\.other \.lr-bubble\.lr-bubble-audio\s*\{\s*background:#242729!important;/);
 assert.match(css,/\.lr-app\.lr-chat-mode \.lr-chat \.lr-bubble-row\.other \.lr-voice-note-wave>span\s*\{\s*background:#c9d8e2!important;/);
 assert.match(css,/\.lr-app\.lr-chat-mode \.lr-chat \.lr-bubble-row\.other \.lr-voice-note-time\s*\{\s*color:#cfd8df!important;/);
 assert.ok(css.includes(".lr-chat .lr-bubble-row.mine .lr-bubble.lr-bubble-audio"));
 assert.ok(css.includes("background:#bd2763!important"),"sent voice bubbles retain the pink design");
});

 test("received voice grey survives final stylesheet and cache refresh",()=>{
  const finalCss=readFileSync("src/delivery-status-ui.css","utf8");
  const voiceCss=readFileSync("src/voice-message.css","utf8");
  const app=readFileSync("src/App.tsx","utf8");
  const sw=readFileSync("public/sw.js","utf8");
  assert.ok(app.indexOf('import "./delivery-status-ui.css"')>app.indexOf('import "./voice-message.css"'));
  assert.match(finalCss,/\.lr-app\.lr-chat-mode \.lr-chat \.lr-chat-messages \.lr-bubble-row\.other \.lr-bubble\.lr-bubble-audio\s*\{\s*background:#242729!important;/);
  assert.ok(finalCss.includes("background-image:none!important"));
  assert.ok(finalCss.includes("border-color:#33393b!important"));
  assert.ok(voiceCss.includes("background:#bd2763!important"),"pink outgoing voices unchanged");
  assert.ok(sw.includes('love-radar-static-v132'),"refresh older PWA cache");
 });
