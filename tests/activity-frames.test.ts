import test from "node:test";
import assert from "node:assert/strict";
import {ACTIVITY_FRAMES,typingDotFrame,microphoneFrame,voiceWaveFrame} from "../src/activity-frames";

test("typing indicator actually cycles across three different dots",()=>{
 const activePositions=Array.from({length:9},(_,frame)=>[0,1,2].find(i=>typingDotFrame(frame,i).opacity===1));
 assert.deepEqual(activePositions,[0,0,0,1,1,1,2,2,2]);
 assert.notEqual(typingDotFrame(0,0).transform,typingDotFrame(4,0).transform);
});
test("microphone pulses and wave heights visibly change over real frames",()=>{
 assert.notDeepEqual(microphoneFrame(0),microphoneFrame(2));
 for(let index=0;index<4;index++){
  const heights=Array.from({length:ACTIVITY_FRAMES},(_,frame)=>voiceWaveFrame(frame,index).height);
  assert.ok(new Set(heights).size>=5,"voice bar "+index+" should move visibly");
  assert.ok(heights.every(v=>Number.parseFloat(v)>=6&&Number.parseFloat(v)<=21));
 }
});
