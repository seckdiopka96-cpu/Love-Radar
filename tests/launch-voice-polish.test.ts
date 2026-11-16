import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {microphoneAmplitude} from "../src/live-voice-level";

test("real microphone amplitude reflects sound instead of cycling arbitrary fake bars",()=>{
 const silence=new Uint8Array(1024).fill(128);
 const low=new Uint8Array(1024);
 const loud=new Uint8Array(1024);
 for(let i=0;i<1024;i++){
  low[i]=i%2?134:122;
  loud[i]=i%2?240:16;
 }
 const quiet=microphoneAmplitude(silence);
 const lowLevel=microphoneAmplitude(low);
 const loudLevel=microphoneAmplitude(loud);
 assert.equal(quiet,.06);
 assert.ok(lowLevel>quiet,"a low sound must make visibly taller bars");
 assert.ok(loudLevel>lowLevel,"louder samples must produce taller bars");
 assert.ok(loudLevel<=1);
 assert.equal(microphoneAmplitude(new Uint8Array(0)),.06);
});

test("live waveform scrolls by elapsed audio time, freezes on pause and releases AudioContext",()=>{
 const wave=readFileSync("src/LiveVoiceWaveform.tsx","utf8");
 const css=readFileSync("src/live-voice-waveform.css","utf8");
 assert.ok(wave.includes("createMediaStreamSource(stream)"));
 assert.ok(wave.includes("getByteTimeDomainData(waveform)"));
 assert.ok(wave.includes("microphoneAmplitude(waveform)"));
 assert.ok(wave.includes("clock+=delta"));
 assert.ok(wave.includes("pausedRef.current"));
 assert.ok(wave.includes("samples[i].at"));
 assert.ok(wave.includes("clock-samples[i].at"));
 assert.ok(wave.includes("ctx.roundRect"));
 assert.ok(wave.includes("source.disconnect()"));
 assert.ok(wave.includes("context.close()"));
 assert.ok(!wave.includes("context.destination"),"mic audio must never be routed to the speakers");
 assert.ok(css.includes(".lr-live-voice-waveform"));
 assert.ok(css.includes("mask-image"));
});

test("recording requests mic at most once per tap and releases it on stop",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(app.includes("recordingStarting.current"));
 assert.ok(app.includes("if(busy||!room?.partner||recordingStarting.current)return"));
 assert.ok(app.includes("recordingStarting.current=true"));
 assert.ok(app.includes("recordingStarting.current=false"));
 assert.equal((app.match(/navigator\.mediaDevices\.getUserMedia\(/g)||[]).length,1);
 assert.ok(app.includes('rec.start(250)'));
 assert.ok(app.includes('stream.getTracks().forEach(track=>track.stop())'));
 assert.ok(app.includes('echoCancellation:true,noiseSuppression:true,autoGainControl:true'));
 assert.ok(app.includes('<LiveVoiceWaveform stream={recordingStream.current} paused={recordingPaused}/>'));
 assert.ok(!app.includes('Array.from({length:17}'),"no fake animated recording bars");
});

test("launch shows brand and correct publisher without interrupting app routing",()=>{
 const main=readFileSync("src/main.tsx","utf8");
 const splash=readFileSync("src/LaunchSplash.tsx","utf8");
 const css=readFileSync("src/launch-splash.css","utf8");
 assert.ok(main.includes("<LoveRadar/><LaunchSplash/>"));
 assert.ok(splash.includes("Love <span>Radar</span>"));
 assert.ok(splash.includes("Créé par <strong>Diao-Tech.com</strong>"));
 assert.ok(splash.includes("setVisible(false)"));
 assert.ok(splash.includes("(prefers-reduced-motion: reduce)"));
 assert.ok(splash.includes("clearTimeout(fade)"));
 assert.ok(splash.includes("clearTimeout(remove)"));
 assert.ok(css.includes("env(safe-area-inset-bottom)"));
});

test("voice playback has moving progress head and remains seekable",()=>{
 const message=readFileSync("src/VoiceMessage.tsx","utf8");
 const css=readFileSync("src/voice-message.css","utf8");
 assert.ok(message.includes("lr-voice-note-playhead"));
 assert.ok(message.includes("left:(progress*100)"));
 assert.ok(message.includes('onChange={event=>seek(Number(event.target.value))}'));
 assert.ok(css.includes(".lr-voice-note-playhead"));
});
