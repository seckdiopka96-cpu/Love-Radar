import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LOVE_LENSES,faceGeometry,drawLoveLens,isFaceLens} from "../src/love-lenses";
const read=(p:string)=>readFileSync(p,"utf8");
test("six genuine face-anchored lenses and natural mode, no color-only filters",()=>{
 assert.deepEqual(LOVE_LENSES.map(l=>l.id),["none","glasses","crown","puppy","hearts","sparkles","halo"]);
 for(const lens of LOVE_LENSES.slice(1))assert.equal(isFaceLens(lens.id),true);
 assert.equal(isFaceLens("none"),false);
});
test("face geometry requires real landmarks; no simulated central face",()=>{
 assert.equal(faceGeometry(null,640,480),null);
 const p=Array.from({length:468},()=>({x:.5,y:.5,z:0}));
 p[33]={x:.35,y:.44,z:0};p[263]={x:.65,y:.45,z:0};
 p[10]={x:.5,y:.15,z:0};p[152]={x:.51,y:.85,z:0};
 const face=faceGeometry(p,640,480);
 assert.ok(face&&face.width>250&&face.height>300&&face.angle>0);
});
test("AR stickers never appear without a detected face",()=>{
 const log:string[]=[];
 const ctx={save(){},restore(){},clearRect(){},drawImage(){log.push("video")},translate(){log.push("face")},rotate(){},fillText(v:string){log.push(v)},set font(v:string){},set textAlign(v:string){},set textBaseline(v:string){},set shadowColor(v:string){},set shadowBlur(v:number){},set globalAlpha(v:number){}};
 const canvas={width:640,height:480};
 drawLoveLens(ctx as unknown as CanvasRenderingContext2D,{} as CanvasImageSource,canvas as HTMLCanvasElement,"crown",null,0);
 assert.deepEqual(log,["video"]);
});
test("video calls preserve microphone, camera flip, controls and WebRTC when supported",()=>{
 const call=read("src/VoiceCall.tsx");
 for(const value of ["await sender.replaceTrack(processed.track)","await lensProcessor.current.setSource(track)","lensProcessor.current?.stop()",'start("audio")','start("video")','onClick={toggleVideoControls}','aria-label="Choisir un effet vidéo"'])assert.ok(call.includes(value),value);
});
test("standalone camera keeps existing authenticated image uploader and stable preview",()=>{
 const app=read("src/App.tsx"),fun=read("src/FunCamera.tsx"),css=read("src/fun-camera.css");
 assert.ok(app.includes('tab==="camera"?<FunCamera'));
 assert.ok(app.includes('onSendPhoto={async file=>upload(file,"image")}'));
 assert.ok(fun.includes("navigator.mediaDevices.getUserMedia"));
 assert.ok(fun.includes("canvas.toBlob"));
 assert.ok(fun.includes("trackingStatus()"));
 assert.ok(css.includes("aspect-ratio:3/4"));
});
test("face tracking is served from the app origin and PWA cache updates",()=>{
 const pkg=JSON.parse(read("package.json"));
 assert.equal(pkg.dependencies["@mediapipe/face_mesh"],"0.4.1633559619");
 assert.ok(read("src/love-lenses.ts").includes('"/face-mesh/"+file'));
 assert.ok(read("public/_headers").includes("'wasm-unsafe-eval'"));
});
