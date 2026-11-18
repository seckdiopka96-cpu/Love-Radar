import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LOVE_LENSES,faceGeometry,drawLoveLens,isFaceLens} from "../src/love-lenses";

const read=(file:string)=>readFileSync(file,"utf8");
test("ten distinct love lenses include beauty, animated decorations and real face anchors",()=>{
 assert.equal(LOVE_LENSES.length,10);
 assert.equal(new Set(LOVE_LENSES.map(item=>item.id)).size,10);
 for(const value of ["none","beauty","rose","vintage","comic","hearts","sparkles","glasses","crown","puppy"])
  assert.ok(LOVE_LENSES.some(item=>item.id===value));
 assert.equal(isFaceLens("puppy"),true);
 assert.equal(isFaceLens("rose"),false);
});
test("face geometry uses live normalized eyes, forehead and chin landmarks, never external images",()=>{
 const points=Array.from({length:468},()=>({x:.5,y:.5,z:0}));
 points[33]={x:.35,y:.44,z:0};
 points[263]={x:.65,y:.45,z:0};
 points[10]={x:.5,y:.15,z:0};
 points[152]={x:.51,y:.85,z:0};
 const real=faceGeometry(points,640,480);
 assert.ok(real.width>250);
 assert.ok(real.height>300);
 assert.ok(real.angle>0);
 const fallback=faceGeometry(null,640,480);
 assert.equal(fallback.x,320);
 assert.equal(fallback.y,480*.48);
});
test("photo and outgoing video use the same canvas frames and overlays",()=>{
 const events:string[]=[];
 const gradient={addColorStop:(offset:number,color:string)=>events.push("gradient:"+offset+color)};
 const ctx={
  save:()=>events.push("save"),restore:()=>events.push("restore"),
  clearRect:()=>events.push("clear"),drawImage:()=>events.push("draw"),
  createLinearGradient:()=>gradient,fillRect:()=>events.push("tint"),
  fillText:(text:string)=>events.push("emoji:"+text),
  translate:()=>events.push("translate"),rotate:()=>events.push("rotate"),
  set filter(_:string){},set globalAlpha(_:number){},
  set font(_:string){},set textAlign(_:string){},set textBaseline(_:string){},
  set fillStyle(_:unknown){},set shadowColor(_:string){},set shadowBlur(_:number){}
 };
 const canvas={width:320,height:480};
 drawLoveLens(ctx as unknown as CanvasRenderingContext2D,{} as HTMLVideoElement,canvas as HTMLCanvasElement,"hearts",null,2500);
 assert.ok(events.includes("draw"));
 assert.ok(events.includes("tint"));
 assert.ok(events.some(x=>x.includes("💖")));
 events.length=0;
 drawLoveLens(ctx as unknown as CanvasRenderingContext2D,{} as HTMLVideoElement,canvas as HTMLCanvasElement,"crown",null,2500);
 assert.ok(events.includes("translate"));
 assert.ok(events.includes("emoji:👑"));
});
test("video call effects are sent through replaceTrack while audio, camera flip and cleanup stay intact",()=>{
 const call=read("src/VoiceCall.tsx");
 assert.ok(call.includes('import LensPicker from "./LensPicker"'));
 assert.ok(call.includes("async function chooseCallLens("));
 assert.ok(call.includes("await sender.replaceTrack(processed.track)"));
 assert.ok(call.includes("lensProcessor.current?.track||track"));
 assert.ok(call.includes("lensProcessor.current.track.enabled=!next"));
 assert.ok(call.includes("await lensProcessor.current.setSource(track)"));
 assert.ok(call.includes("lensProcessor.current?.stop()"));
 assert.ok(call.includes("setLensTray(false)"));
 assert.ok(call.includes('if(sender)await sender.replaceTrack(track)'));
 assert.ok(call.includes('start("audio")'));
 assert.ok(call.includes('start("video")'));
 assert.ok(call.includes('aria-label="Choisir un effet vidéo"'));
 assert.ok(call.includes('onClick={toggleVideoControls}'));
});
test("fun studio works outside calls and can send photos through existing encrypted media path",()=>{
 const app=read("src/App.tsx"),together=read("src/Together.tsx"),fun=read("src/FunCamera.tsx");
 assert.ok(app.includes('tab==="camera"?<FunCamera'));
 assert.ok(app.includes('onSendPhoto={async file=>upload(file,"image")}'));
 assert.ok(app.includes('onClick={()=>navigate("camera")}'));
 assert.ok(together.includes('className="lr-together-fun-feature"'));
 assert.ok(fun.includes("navigator.mediaDevices.getUserMedia"));
 assert.ok(fun.includes('createLensProcessor('));
 assert.ok(fun.includes("canvas.toBlob"));
 assert.ok(fun.includes("new MediaRecorder("));
 assert.ok(fun.includes("if(time>=20)stopRecording()"));
 assert.ok(fun.includes('onSendPhoto(file)'));
 assert.ok(fun.includes("navigator.share"));
 assert.ok(!fun.includes('fetch("/api/media"'),"media goes only through the existing authenticated uploader");
});
test("Face Mesh assets are first-party; WebAssembly permission is scoped and camera is allowed",()=>{
 const script=read("scripts/prepare-face-mesh.mjs"),pkg=JSON.parse(read("package.json"));
 const headers=read("public/_headers"),sw=read("public/sw.js");
 assert.equal(pkg.dependencies["@mediapipe/face_mesh"],"0.4.1633559619");
 assert.ok(pkg.scripts.prebuild.includes("prepare-face-mesh.mjs"));
 assert.ok(pkg.scripts.predev.includes("prepare-face-mesh.mjs"));
 assert.ok(script.includes("public"));
 assert.ok(script.includes("face_mesh_solution_packed_assets.data"));
 assert.ok(script.includes("face_mesh_solution_simd_wasm_bin.wasm"));
 assert.ok(read("src/love-lenses.ts").includes('"/face-mesh/"+file'));
 assert.ok(headers.includes("Permissions-Policy: camera=(self)"));
 assert.ok(headers.includes("'wasm-unsafe-eval'"));
 assert.ok(sw.includes("love-radar-static-v108"));
});
