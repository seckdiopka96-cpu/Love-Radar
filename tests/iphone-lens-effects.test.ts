import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(path,"utf8");
test("Camera remains full-screen with normal photos and videos but no effects",()=>{
 const camera=read("src/FunCamera.tsx");
 assert.ok(camera.includes("createPortal("));
 assert.ok(camera.includes("navigator.mediaDevices.getUserMedia"));
 assert.ok(camera.includes("new MediaRecorder("));
 assert.ok(camera.includes("canvas.toBlob("));
 assert.ok(!camera.includes("LensPicker"));
 assert.ok(!camera.includes("createLensProcessor"));
 assert.ok(!camera.includes("Suivi du visage"));
});
test("Video calls retain camera, microphone and camera switching but no effects UI",()=>{
 const call=read("src/VoiceCall.tsx");
 assert.ok(call.includes("toggleCamera()"));
 assert.ok(call.includes("switchCamera()"));
 assert.ok(!call.includes("lr-call-lens-trigger"));
 assert.ok(!call.includes("lr-call-lens-panel"));
 assert.ok(!call.includes("Effets caméra"));
});
