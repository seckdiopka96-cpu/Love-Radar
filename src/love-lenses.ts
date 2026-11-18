/**
 * Love Radar playful camera lenses. Frames stay on-device.
 * Face Mesh weights and WASM are hosted on our own Pages origin.
 */
export const LOVE_LENSES=[
 {id:"none",name:"Naturel",icon:"◯",category:"normal"},
 {id:"beauty",name:"Éclat",icon:"✨",category:"color"},
 {id:"rose",name:"Rose",icon:"🌸",category:"color"},
 {id:"vintage",name:"Vintage",icon:"🎞️",category:"color"},
 {id:"comic",name:"Pop",icon:"🎨",category:"color"},
 {id:"hearts",name:"Cœurs",icon:"💗",category:"effect"},
 {id:"sparkles",name:"Étoiles",icon:"🌟",category:"effect"},
 {id:"glasses",name:"Lunettes",icon:"🕶️",category:"face"},
 {id:"crown",name:"Couronne",icon:"👑",category:"face"},
 {id:"puppy",name:"Petit chien",icon:"🐶",category:"face"}
] as const;
export type LoveLensId=typeof LOVE_LENSES[number]["id"];
export type FacePoint={x:number;y:number;z?:number};
export function isFaceLens(lens:LoveLensId){return lens==="glasses"||lens==="crown"||lens==="puppy"}
export type LensProcessor={
 readonly track:MediaStreamTrack;readonly stream:MediaStream;readonly canvas:HTMLCanvasElement;
 setLens:(lens:LoveLensId)=>void;setSource:(source:MediaStreamTrack)=>Promise<void>;stop:()=>void;
};
type Face={x:number;y:number;width:number;height:number;angle:number};
const bounded=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export function faceGeometry(points:FacePoint[]|null,w:number,h:number):Face{
 if(!points||!points[33]||!points[263]||!points[10]||!points[152])
  return {x:w*.5,y:h*.48,width:w*.46,height:h*.52,angle:0};
 const le=points[33],re=points[263],top=points[10],bottom=points[152];
 const dx=(re.x-le.x)*w,dy=(re.y-le.y)*h;
 const eyeDist=Math.hypot(dx,dy);
 const faceHeight=Math.hypot((bottom.x-top.x)*w,(bottom.y-top.y)*h);
 return {x:(le.x+re.x)*w*.5,y:(top.y+bottom.y)*h*.5,
  width:bounded(eyeDist*2.55,w*.15,w*.85),height:bounded(faceHeight,h*.2,h*.9),
  angle:Math.atan2(dy,dx)};
}
function emoji(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,size:number){
 ctx.font=Math.max(10,Math.round(size))+'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
 ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(value,x,y);
}
function dance(ctx:CanvasRenderingContext2D,w:number,h:number,now:number,kind:"💖"|"✨"){
 const count=kind==="💖"?12:17;
 for(let i=0;i<count;i++){
  const cycle=(now/4800+i*0.174)%1;
  const x=(.09+((i*.281+Math.sin(now/2500+i)*.045)%0.83))*w;
  const y=(1.13-cycle*1.37)*h;
  ctx.globalAlpha=.36+.52*Math.sin(cycle*Math.PI);
  emoji(ctx,kind,x,y,Math.min(w,h)*(.042+(i%4)*.008));
 }
 ctx.globalAlpha=1;
}
export function drawLoveLens(ctx:CanvasRenderingContext2D,video:CanvasImageSource,
 canvas:HTMLCanvasElement,lens:LoveLensId,points:FacePoint[]|null,now:number){
 const w=canvas.width,h=canvas.height;if(!w||!h)return;
 ctx.save();ctx.clearRect(0,0,w,h);
 ctx.filter=lens==="beauty"?"brightness(1.07) saturate(1.11) contrast(.97)":
  lens==="rose"?"brightness(1.055) sepia(.12) saturate(1.29)":
  lens==="vintage"?"sepia(.49) saturate(.78) contrast(1.06)":
  lens==="comic"?"contrast(1.34) saturate(1.75)":"none";
 ctx.drawImage(video,0,0,w,h);ctx.filter="none";
 if(lens==="rose"||lens==="hearts"){
  const fade=ctx.createLinearGradient(0,0,w,h);
  fade.addColorStop(0,"rgba(246,119,189,0.13)");
  fade.addColorStop(1,"rgba(111,83,188,0.07)");
  ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);
 }
 if(lens==="hearts"||lens==="sparkles")dance(ctx,w,h,now,lens==="hearts"?"💖":"✨");
 if(isFaceLens(lens)){
  const face=faceGeometry(points,w,h);
  ctx.translate(face.x,face.y);ctx.rotate(face.angle);
  const fw=face.width,fh=face.height;
  if(lens==="glasses"){
   ctx.shadowColor="rgba(0,0,0,.4)";ctx.shadowBlur=fw*.08;
   emoji(ctx,"🕶️",0,-fh*.14,fw*.95);
  }else if(lens==="crown"){
   ctx.shadowColor="rgba(255,196,92,.6)";ctx.shadowBlur=fw*.15;
   emoji(ctx,"👑",0,-fh*.59,fw*.85);
  }else if(lens==="puppy"){
   ctx.shadowColor="rgba(32,16,15,.3)";ctx.shadowBlur=fw*.05;
   emoji(ctx,"🐕",0,-fh*.59,fw*.66);
   emoji(ctx,"🐽",0,fh*.10,fw*.26);
   ctx.globalAlpha=.85;emoji(ctx,"💗",0,fh*.34,fw*.22);
  }
 }
 ctx.restore();
}
export async function createLensProcessor(initial:MediaStreamTrack,lens:LoveLensId):Promise<LensProcessor>{
 if(initial.kind!=="video"||initial.readyState!=="live")throw Error("Caméra indisponible.");
 const video=document.createElement("video");
 video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute("playsinline","");
 const canvas=document.createElement("canvas");canvas.width=540;canvas.height=720;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx)throw Error("Les effets graphiques ne sont pas compatibles avec cet appareil.");
 if(typeof canvas.captureStream!=="function")throw Error("Les effets vidéo ne sont pas disponibles sur cet appareil.");
 const stream=canvas.captureStream(24),track=stream.getVideoTracks()[0];
 if(!track)throw Error("Cette caméra ne permet pas la création d'effets vidéo.");
 let stopped=false,lensId=lens,frame=0,points:FacePoint[]|null=null;
 let trackingPending=false,detectorReady=false,detectorFailed=false,detecting=false,lastDetection=0,detectorSeen=0;
 let closeDetector:(()=>void)|null=null;
 let sendFrame:((image:HTMLVideoElement)=>Promise<void>)|null=null;
 function setDimensions(){
  const vw=video.videoWidth,vh=video.videoHeight;if(!vw||!vh)return;
  const scale=Math.min(1,720/Math.max(vw,vh));
  const w=Math.max(2,Math.round(vw*scale/2)*2),h=Math.max(2,Math.round(vh*scale/2)*2);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 }
 async function startDetector(){
  if(stopped||trackingPending||detectorReady||detectorFailed)return;
  trackingPending=true;
  try{
   const {FaceMesh}=await import("@mediapipe/face_mesh");
   if(stopped)return;
   const mesh=new FaceMesh({locateFile:file=>"/face-mesh/"+file});
   mesh.setOptions({maxNumFaces:1,refineLandmarks:false,minDetectionConfidence:.5,minTrackingConfidence:.52});
   mesh.onResults(results=>{
    if(stopped)return;
    const current=results.multiFaceLandmarks?.[0]||null;
    points=current?.map(pt=>({x:pt.x,y:pt.y,z:pt.z}))||null;
    detectorSeen=performance.now();
   });
   closeDetector=()=>{void mesh.close().catch(()=>{})};
   sendFrame=async image=>{await mesh.send({image})};
   detectorReady=true;
  }catch{
   detectorFailed=true;points=null;
  }finally{trackingPending=false}
 }
 function tick(now:number){
  if(stopped)return;
  if(video.readyState>=2&&video.videoWidth>0){
   setDimensions();
   const current=points&&now-detectorSeen<1100?points:null;
   try{drawLoveLens(ctx!,video,canvas,lensId,current,now)}catch{/* A frame cannot break a call. */}
   if(isFaceLens(lensId)){
    if(!detectorReady&&!trackingPending&&!detectorFailed)void startDetector();
    if(detectorReady&&sendFrame&&!detecting&&now-lastDetection>145){
     detecting=true;lastDetection=now;
     void sendFrame(video).catch(()=>{detectorFailed=true;detectorReady=false;points=null})
      .finally(()=>{detecting=false});
    }
   }
  }
  frame=requestAnimationFrame(tick);
 }
 try{
  video.srcObject=new MediaStream([initial]);
  await video.play();
  frame=requestAnimationFrame(tick);
 }catch(error){
  stream.getTracks().forEach(t=>t.stop());video.srcObject=null;
  throw Error("Impossible de démarrer le filtre vidéo : "+(error instanceof Error?error.message:"caméra bloquée"));
 }
 return {
  track,stream,canvas,
  setLens(value){lensId=value;if(isFaceLens(value)&&!detectorReady)void startDetector()},
  async setSource(source){
   if(stopped)throw Error("Effets fermés.");
   if(source.readyState!=="live")throw Error("Caméra indisponible.");
   video.pause();video.srcObject=new MediaStream([source]);points=null;
   await video.play();
  },
  stop(){
   if(stopped)return;stopped=true;cancelAnimationFrame(frame);
   stream.getTracks().forEach(t=>t.stop());
   video.pause();video.srcObject=null;
   if(closeDetector)closeDetector();points=null;
  }
 };
}
