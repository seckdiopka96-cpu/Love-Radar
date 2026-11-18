import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LOVE_LENSES,faceGeometry,drawLoveLens} from "../src/love-lenses";
const read=(p:string)=>readFileSync(p,"utf8");
test("iPhone sees only genuine face effects, no brightness, rose, vintage or pop",()=>{
 assert.equal(LOVE_LENSES.length,7);
 for(const name of ["beauty","rose","vintage","comic"])assert.ok(!LOVE_LENSES.some(l=>l.id===name));
 const src=read("src/love-lenses.ts");
 assert.ok(!src.includes("applyLovePixelFilter"));
 assert.ok(!src.includes("ctx.filter="));
});
test("without a real face the app never invents a mask in the center",()=>{
 assert.equal(faceGeometry(null,320,480),null);
 const events:string[]=[];
 const ctx={save(){},restore(){},clearRect(){},drawImage(){events.push("camera")},translate(){events.push("fake mask")}};
 drawLoveLens(ctx as unknown as CanvasRenderingContext2D,{} as CanvasImageSource,{width:320,height:480} as HTMLCanvasElement,"puppy",null,0);
 assert.deepEqual(events,["camera"]);
});
test("camera frame is fixed and tells user when face tracking is unavailable",()=>{
 const fun=read("src/FunCamera.tsx"),css=read("src/fun-camera.css");
 assert.ok(css.includes("aspect-ratio:3/4"));
 assert.ok(fun.includes("Suivi du visage indisponible sur cet appareil."));
 assert.ok(fun.includes("Place ton visage dans le cadre."));
 assert.ok(fun.includes("Effet fixé sur ton visage"));
 assert.ok(fun.includes("createLensProcessor(source.current.getVideoTracks()[0],value,{previewOnly:true})"));
});
test("chat header remains clean and call video keeps optional processed track",()=>{
 const app=read("src/App.tsx"),call=read("src/VoiceCall.tsx");
 assert.ok(!app.includes("lr-chat-fun-trigger"));
 assert.ok(call.includes("processed.isTransmittable"));
 assert.ok(call.includes("if(sender)await sender.replaceTrack(processed.track)"));
 assert.ok(call.includes("lensCanvasHost.current?.replaceChildren()"));
});

test("Snap-style camera takes over viewport and hides app navigation via body portal",()=>{
 const fun=read("src/FunCamera.tsx"),css=read("src/fun-camera.css");
 assert.ok(fun.includes('import {createPortal} from "react-dom"'));
 assert.ok(fun.includes('return createPortal(<section className="lr-fun-camera"'));
 assert.ok(fun.includes("</section>,document.body)"));
 assert.ok(css.includes("body>.lr-fun-camera{"));
 assert.ok(css.includes("position:fixed!important;inset:0!important"));
 assert.ok(css.includes("height:100dvh!important"));
 assert.ok(css.includes("bottom:calc(env(safe-area-inset-bottom) + 126px)"));
 assert.ok(!fun.includes("10 looks · en direct"));
 assert.ok(!fun.includes("lr-fun-privacy"));
});
