import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyLovePixelFilter,drawLoveLens,type LoveLensId} from "../src/love-lenses";

const file=(p:string)=>readFileSync(p,"utf8");
const original=[92,140,182,255,201,130,65,210];
const lenses:LoveLensId[]=["beauty","rose","vintage","comic"];
test("iPhone color effects alter real photo pixels without unsupported ctx.filter",()=>{
 for(const lens of lenses){
  const image={data:new Uint8ClampedArray(original)} as ImageData;
  const result=applyLovePixelFilter(image,lens);
  assert.equal(result,image);
  assert.notDeepEqual([...image.data],original,"Lens "+lens+" must visually change pixels on Safari.");
  assert.equal(image.data[3],255,"Alpha unchanged");
  assert.equal(image.data[7],210,"Alpha unchanged");
 }
 const unchanged={data:new Uint8ClampedArray(original)} as ImageData;
 applyLovePixelFilter(unchanged,"none");
 assert.deepEqual([...unchanged.data],original);
});
test("drawLoveLens applies the pixel result into the same canvas saved for a photo",()=>{
 const calls:string[]=[];
 const ctx={
  save(){calls.push("save")},restore(){calls.push("restore")},clearRect(){calls.push("clear")},
  drawImage(){calls.push("draw")},
  getImageData(){calls.push("read");return {data:new Uint8ClampedArray(original)}},
  putImageData(data:{data:Uint8ClampedArray}){calls.push("written-"+data.data[0])}
 };
 const canvas={width:2,height:1};
 drawLoveLens(ctx as unknown as CanvasRenderingContext2D,{} as HTMLVideoElement,canvas as HTMLCanvasElement,"rose",null,0);
 assert.deepEqual(calls,["save","clear","draw","read","written-126","restore"]);
});
test("star button is absent from chat header but live effects remain accessible elsewhere",()=>{
 const app=file("src/App.tsx");
 const together=file("src/Together.tsx");
 const call=file("src/VoiceCall.tsx");
 assert.ok(!app.includes("lr-chat-fun-trigger"),"remove the sparkle shortcut from chat header");
 assert.ok(!app.includes('title="Effets caméra" onClick={()=>navigate("camera")}'));
 assert.ok(app.includes('tab==="camera"?<FunCamera'));
 assert.ok(together.includes('onClick={onOpenCamera}'));
 assert.ok(call.includes("async function chooseCallLens("));
 assert.ok(call.includes('aria-label="Choisir un effet vidéo"'));
});
test("standalone camera shows real filtered canvas on iPhone; no native canvas stream needed",()=>{
 const fun=file("src/FunCamera.tsx"),css=file("src/fun-camera.css"),engine=file("src/love-lenses.ts");
 assert.ok(fun.includes('const canvasHost=useRef<HTMLDivElement|null>(null)'));
 assert.ok(fun.includes("canvasHost.current?.replaceChildren()"));
 assert.ok(fun.includes("mountCanvas();"));
 assert.ok(fun.includes("createLensProcessor(source.current.getVideoTracks()[0],value,{previewOnly:true})"));
 assert.ok(fun.includes('className={"lr-fun-processed-frame"'));
 assert.ok(css.includes(".lr-fun-processed-frame canvas"));
 assert.ok(css.includes(".lr-fun-processed-frame.mirrored canvas"));
 assert.ok(engine.includes("const stream=previewOnly?new MediaStream():canvas.captureStream(24)"));
 assert.ok(engine.includes("ctx.putImageData(applyLovePixelFilter(pixels,lens),0,0)"));
 assert.ok(!engine.includes('ctx.filter=lens==="beauty"'),"WebKit disables ctx.filter");
});
test("a video call draws local effects even if canvas video transfer is unsupported",()=>{
 const call=file("src/VoiceCall.tsx"),css=file("src/fun-camera.css");
 assert.ok(call.includes('className="lr-call-processed-frame"'));
 assert.ok(css.includes(".lr-call-processed-frame canvas"));
 assert.ok(call.includes('createLensProcessor(raw,id,{previewOnly:true})'));
 assert.ok(call.includes("processed.isTransmittable"));
 assert.ok(call.includes("if(sender)await sender.replaceTrack(processed.track)"),"apply an actual filtered outbound video when supported");
 assert.ok(call.includes("lensProcessor.current?.isTransmittable?lensProcessor.current.track:track"),"raw video used when iPhone cannot transmit effect");
 assert.ok(call.includes("lensCanvasHost.current?.replaceChildren()"));
 assert.ok(call.includes("setCallLens(\"none\")"));
 assert.ok(call.includes("if(lensProcessor.current)lensProcessor.current.track.enabled=!next"),"camera off must disable filter too");
 assert.ok(call.includes('start("audio")'),"audio calls preserved");
});
