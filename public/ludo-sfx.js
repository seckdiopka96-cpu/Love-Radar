/* Love Radar Ludo: original WebAudio dice-rattle and pawn-click effects.
   Procedural sound, generated offline; never modifies game randomness. */
(()=>{
 "use strict";
 let context=null,noise=null,lastStep=-1;
 const Audio=window.AudioContext||window.webkitAudioContext;
 const cues={
  exit:[[520,0,.075,"sine",.055],[690,.09,.115,"sine",.060],[880,.19,.09,"triangle",.033]],
  capture:[[630,0,.058,"square",.035],[390,.069,.083,"square",.036],[210,.154,.14,"triangle",.056]],
  win:[[523,0,.11,"triangle",.050],[659,.12,.11,"triangle",.054],[784,.24,.12,"triangle",.055],[1047,.38,.16,"sine",.071],[1318,.56,.29,"sine",.061]]
 };
 function unlock(){
  try{
   if(!Audio)return null;
   if(!context||context.state==="closed"){context=new Audio();noise=null}
   if(context.state==="suspended")void context.resume().catch(()=>{});
   return context;
  }catch{return null}
 }
 function getNoise(c){
  if(noise&&noise.sampleRate===c.sampleRate)return noise;
  const count=Math.floor(c.sampleRate*.052);
  noise=c.createBuffer(1,count,c.sampleRate);
  const samples=noise.getChannelData(0);
  // Short filtered friction / plastic taps: NOT pitched notes or a fake dice count.
  for(let i=0;i<count;i++){
   const fade=Math.pow(1-i/count,2.1);
   samples[i]=(Math.random()*2-1)*fade;
  }
  return noise;
 }
 function clack(c,at,pitch,loudness){
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  source.buffer=getNoise(c);
  filter.type="bandpass";filter.frequency.setValueAtTime(pitch,at);filter.Q.value=.75;
  gain.gain.setValueAtTime(loudness,at);
  gain.gain.exponentialRampToValueAtTime(.0001,at+.045);
  source.connect(filter);filter.connect(gain);gain.connect(c.destination);
  source.start(at);source.stop(at+.052);
 }
 function playRoll(c,start){
  // Distinct tactile clattering: quick shake, bounce, final tabletop contact.
  const contacts=[
   [0,1820,.20],[.029,2250,.19],[.061,1460,.23],
   [.096,2050,.23],[.137,1560,.27],[.186,1050,.35],[.226,1300,.40]
  ];
  for(const [offset,pitch,volume] of contacts)clack(c,start+offset,pitch,volume);
 }
 function playStep(c,start){
  // One crisp, soft tick PER reached square. No loud note on every hop.
  if(start-lastStep<.075)return;
  lastStep=start;
  clack(c,start,1270,.16);
 }
 function play(kind){
  const c=context||unlock();
  if(!c||c.state!=="running"||document.hidden)return;
  const start=c.currentTime+.007;
  try{
   if(kind==="roll"){playRoll(c,start);return}
   if(kind==="step"){playStep(c,start);return}
   const notes=cues[kind];
   if(!notes)return;
   for(const [hz,offset,duration,wave,volume] of notes){
    const osc=c.createOscillator(),gain=c.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(hz,start+offset);
    gain.gain.setValueAtTime(.0001,start+offset);
    gain.gain.exponentialRampToValueAtTime(volume,start+offset+.009);
    gain.gain.exponentialRampToValueAtTime(.0001,start+offset+duration);
    osc.connect(gain);gain.connect(c.destination);
    osc.start(start+offset);osc.stop(start+offset+duration+.012);
   }
  }catch{/* Sound permission never blocks a move. */}
 }
 // Genuine user gestures unlock sound on Safari and WKWebView.
 document.addEventListener("pointerdown",unlock,{passive:true});
 document.addEventListener("keydown",unlock);
 window.LudoSfx={unlock,play};
})();
