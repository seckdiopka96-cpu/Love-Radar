/* Love Radar Ludo: original lightweight WebAudio cues, no external files. */
(()=>{
 "use strict";
 let context=null;
 const Audio=window.AudioContext||window.webkitAudioContext;
 const cues={
  roll:[[420,0,.038,"triangle",.032],[340,.048,.038,"triangle",.028],[490,.097,.045,"triangle",.035]],
  exit:[[520,0,.075,"sine",.055],[690,.09,.115,"sine",.060],[880,.19,.09,"triangle",.033]],
  capture:[[630,0,.058,"square",.035],[390,.069,.083,"square",.036],[210,.154,.14,"triangle",.056]],
  win:[[523,0,.11,"triangle",.050],[659,.12,.11,"triangle",.054],[784,.24,.12,"triangle",.055],[1047,.38,.16,"sine",.071],[1318,.56,.29,"sine",.061]]
 };
 function unlock(){
  try{
   if(!Audio)return null;
   if(!context||context.state==="closed")context=new Audio();
   if(context.state==="suspended")void context.resume().catch(()=>{});
   return context;
  }catch{return null}
 }
 function play(kind){
  const c=context||unlock(),notes=cues[kind];
  if(!c||c.state!=="running"||!notes||document.hidden)return;
  const start=c.currentTime+.008;
  try{
   for(const [hz,offset,duration,wave,volume] of notes){
    const osc=c.createOscillator(),gain=c.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(hz,start+offset);
    gain.gain.setValueAtTime(.0001,start+offset);
    gain.gain.exponentialRampToValueAtTime(volume,start+offset+.009);
    gain.gain.exponentialRampToValueAtTime(.0001,start+offset+duration);
    osc.connect(gain);gain.connect(c.destination);
    osc.start(start+offset);osc.stop(start+offset+duration+.012);
   }
  }catch{/* Sound permissions must never affect gameplay. */}
 }
 // Unlock on an actual user gesture, including iOS Safari and WKWebView.
 document.addEventListener("pointerdown",unlock,{passive:true});
 document.addEventListener("keydown",unlock);
 window.LudoSfx={unlock,play};
})();
