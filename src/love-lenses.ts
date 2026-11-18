/** Real face-anchored AR effects. No color filters or guessed face positions. */
export const LOVE_LENSES=[
 {id:"none",name:"Naturel",icon:"◯",category:"normal"},
 {id:"glasses",name:"Lunettes",icon:"🕶️",category:"face"},
 {id:"crown",name:"Couronne",icon:"👑",category:"face"},
 {id:"puppy",name:"Petit chien",icon:"🐶",category:"face"},
 {id:"hearts",name:"Cœurs",icon:"💗",category:"face"},
 {id:"sparkles",name:"Étoiles",icon:"🌟",category:"face"},
 {id:"halo",name:"Halo",icon:"😇",category:"face"}
] as const;
export type LoveLensId=typeof LOVE_LENSES[number]["id"];
export type FacePoint={x:number;y:number;z?:number};
export const isFaceLens=(lens:LoveLensId)=>lens!=="none";
export type LensProcessor={
 readonly track:MediaStreamTrack;readonly stream:MediaStream;readonly canvas:HTMLCanvasElement;
 readonly isTransmittable:boolean;
 readonly trackingStatus:()=> "loading"|"ready"|"missing"|"unavailable";
 setLens:(lens:LoveLensId)=>void;setSource:(source:MediaStreamTrack)=>Promise<void>;stop:()=>void;
};
type Face={x:number;y:number;width:number;height:number;angle:number};
const bounded=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
/** Return null unless a real MediaPipe face was found. No fake center-face fallback. */
export function faceGeometry(points:FacePoint[]|null,w:number,h:number):Face|null{
 if(!points||!points[33]||!points[263]||!points[10]||!points[152])return null;
 const le=points[33],re=points[263],top=points[10],bottom=points[152];
 const dx=(re.x-le.x)*w,dy=(re.y-le.y)*h,eyeDist=Math.hypot(dx,dy);
 const faceHeight=Math.hypot((bottom.x-top.x)*w,(bottom.y-top.y)*h);
 if(eyeDist<6||faceHeight<10)return null;
 return {x:(le.x+re.x)*w*.5,y:(top.y+bottom.y)*h*.5,
  width:bounded(eyeDist*2.55,w*.15,w*.85),height:bounded(faceHeight,h*.2,h*.9),
  angle:Math.atan2(dy,dx)};
}
function emoji(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,size:number){
 ctx.font=Math.max(10,Math.round(size))+'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
 ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(value,x,y);
}
export function drawLoveLens(ctx:CanvasRenderingContext2D,video:CanvasImageSource,
 canvas:HTMLCanvasElement,lens:LoveLensId,points:FacePoint[]|null,now:number){
 const w=canvas.width,h=canvas.height;if(!w||!h)return;
 ctx.save();ctx.clearRect(0,0,w,h);ctx.drawImage(video,0,0,w,h);
 const face=faceGeometry(points,w,h);
 if(!face||lens==="none"){ctx.restore();return}
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
  emoji(ctx,"🐶",0,-fh*.62,fw*.78);
  emoji(ctx,"🐽",0,fh*.10,fw*.26);
 }else if(lens==="halo"){
  ctx.shadowColor="rgba(255,226,123,.85)";ctx.shadowBlur=fw*.14;
  emoji(ctx,"😇",0,-fh*.65,fw*.68);
 }else if(lens==="hearts"||lens==="sparkles"){
  const symbol=lens==="hearts"?"💖":"✨";
  for(let i=0;i<9;i++){
   const angle=(i/9)*Math.PI*2+now/2600;
   const radiusX=fw*(.58+.06*Math.sin(now/500+i));
   const radiusY=fh*(.57+.06*Math.cos(now/650+i));
   const x=Math.cos(angle)*radiusX,y=Math.sin(angle)*radiusY;
   ctx.globalAlpha=.68+.3*Math.sin(now/500+i);
   emoji(ctx,symbol,x,y,fw*(.15+.03*(i%3)));
  }
  ctx.globalAlpha=1;
 }
 ctx.restore();
}
export async function createLensProcessor(initial:MediaStreamTrack,lens:LoveLensId,options?:{previewOnly?:boolean}):Promise<LensProcessor>{
 if(initial.kind!=="video"||initial.readyState!=="live")throw Error("Caméra indisponible.");
 const video=document.createElement("video");
 video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute("playsinline","");
 const canvas=document.createElement("canvas");canvas.width=540;canvas.height=720;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx)throw Error("Les effets graphiques ne sont pas compatibles avec cet appareil.");
 const previewOnly=Boolean(options?.previewOnly);
 if(!previewOnly&&typeof canvas.captureStream!=="function")
  throw Error("Cet appareil ne permet pas de transmettre les filtres vidéo en direct.");
 const stream=previewOnly?new MediaStream():canvas.captureStream(24);
 const track=previewOnly?initial:stream.getVideoTracks()[0];
 if(!track)throw Error("Cet appareil ne permet pas la création d'effets vidéo.");
 let stopped=false,lensId=lens,frame=0,points:FacePoint[]|null=null;
 let trackingPending=false,detectorReady=false,detectorFailed=false,detecting=false,lastDetection=0,detectorSeen=0;
 let closeDetector:(()=>void)|null=null;
 let sendFrame:((image:HTMLVideoElement)=>Promise<void>)|null=null;
 function setDimensions(){
  const vw=video.videoWidth,vh=video.videoHeight;if(!vw||!vh)return;
  const scale=Math.min(1,540/Math.max(vw,vh));
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
   closeDetector=()=>{void Promise.resolve(mesh.close()).catch(()=>{})};
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
  if(!previewOnly)stream.getTracks().forEach(t=>t.stop());video.srcObject=null;
  throw Error("Impossible de démarrer le filtre vidéo : "+(error instanceof Error?error.message:"caméra bloquée"));
 }
 return {
  track,stream,canvas,isTransmittable:!previewOnly,
  trackingStatus(){return detectorFailed?"unavailable":!detectorReady?"loading":points?"ready":"missing"},
  setLens(value){lensId=value;if(isFaceLens(value)&&!detectorReady)void startDetector()},
  async setSource(source){
   if(stopped)throw Error("Effets fermés.");
   if(source.readyState!=="live")throw Error("Caméra indisponible.");
   video.pause();video.srcObject=new MediaStream([source]);points=null;
   await video.play();
  },
  stop(){
   if(stopped)return;stopped=true;cancelAnimationFrame(frame);
   if(!previewOnly)stream.getTracks().forEach(t=>t.stop());
   video.pause();video.srcObject=null;
   if(closeDetector)closeDetector();points=null;
  }
 };
}
