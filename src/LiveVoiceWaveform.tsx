import {useEffect,useRef} from "react";
import "./live-voice-waveform.css";

type Props={stream:MediaStream|null;paused:boolean};
/**
 * Real microphone waveform: samples Web Audio amplitude every ~75ms.
 * Bars travel smoothly to the left (WhatsApp-style) instead of
 * repeatedly animating 17 fake bars. Never routes microphone to speakers.
 */
export default function LiveVoiceWaveform({stream,paused}:Props){
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const pausedRef=useRef(paused);
 pausedRef.current=paused;
 useEffect(()=>{
  if(!stream||!canvas.current)return;
  const el=canvas.current;
  const AudioContextCtor=window.AudioContext;
  if(!AudioContextCtor)return;
  const context=new AudioContextCtor();
  const analyser=context.createAnalyser();
  analyser.fftSize=1024;
  analyser.smoothingTimeConstant=.55;
  const source=context.createMediaStreamSource(stream);
  source.connect(analyser);
  if(context.state==="suspended")void context.resume().catch(()=>{});
  const waveform=new Uint8Array(analyser.fftSize);
  const samples:{at:number;height:number}[]=[];
  const sampleEvery=76,barStride=4.5,barWidth=2.8;
  let frame=0,lastAt=0,clock=0,lastSample=-sampleEvery;
  const draw=(now:number)=>{
   if(!el.isConnected)return;
   const delta=lastAt?Math.max(0,Math.min(100,now-lastAt)):0;
   lastAt=now;
   if(!pausedRef.current)clock+=delta;
   const bounds=el.getBoundingClientRect();
   const scale=Math.min(window.devicePixelRatio||1,2);
   const w=Math.max(1,Math.round(bounds.width*scale)),h=Math.max(1,Math.round(bounds.height*scale));
   if(el.width!==w||el.height!==h){el.width=w;el.height=h}
   const ctx=el.getContext("2d");
   if(ctx){
    ctx.setTransform(scale,0,0,scale,0,0);
    const width=w/scale,height=h/scale;
    ctx.clearRect(0,0,width,height);
    if(!pausedRef.current&&clock-lastSample>=sampleEvery){
     analyser.getByteTimeDomainData(waveform);
     let sum=0;
     for(let i=0;i<waveform.length;i+=2){
      const value=(waveform[i]-128)/128;
      sum+=value*value;
     }
     const rms=Math.sqrt(sum/(waveform.length/2));
     const amplitude=Math.min(1,Math.max(.06,Math.pow(rms*5,.77)));
     samples.push({at:clock,height:4+(height-6)*amplitude});
     if(samples.length>160)samples.splice(0,samples.length-160);
     lastSample=clock;
    }
    ctx.fillStyle=pausedRef.current?"rgba(237,170,197,.55)":"#f0a6c8";
    for(let i=samples.length-1;i>=0;i--){
     const age=(clock-samples[i].at)/sampleEvery;
     const x=width-4-age*barStride;
     if(x<0)break;
     const barH=samples[i].height;
     ctx.globalAlpha=Math.min(1,Math.max(.15,x/19));
     ctx.beginPath();
     ctx.roundRect(x,(height-barH)/2,barWidth,barH,1.4);
     ctx.fill();
    }
    ctx.globalAlpha=1;
   }
   frame=window.requestAnimationFrame(draw);
  };
  frame=window.requestAnimationFrame(draw);
  return()=>{
   window.cancelAnimationFrame(frame);
   try{source.disconnect();analyser.disconnect()}catch{/* Audio context may already be closed. */}
   void context.close().catch(()=>{});
  };
 },[stream]);
 return <canvas ref={canvas} className={"lr-live-voice-waveform"+(paused?" is-paused":"")}
  aria-label={paused?"Enregistrement en pause":"Niveau sonore du vocal en temps réel, défilement vers la gauche"}
  role="img"/>;
}
