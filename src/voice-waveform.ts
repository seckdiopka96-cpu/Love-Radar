/** Stable, compact, phone-sized voice-note waveform while audio loads. */
export const VOICE_BARS=41;
export function voiceBars(seed:string,count=VOICE_BARS):number[]{
 let hash=2166136261;
 for(let i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619)}
 const heights:number[]=[];
 for(let i=0;i<count;i++){
  hash^=hash<<13;hash^=hash>>>17;hash^=hash<<5;
  const value=(hash>>>0)/4294967295;
  const position=i/(count-1);
  const middle=Math.exp(-Math.pow((position-.55)/.27,2));
  const wave=.25+.45*Math.abs(Math.sin(i*.47+.8))+.3*Math.abs(Math.cos(i*.18));
  heights.push(Math.round(12+88*Math.min(1,(.20+value*.6)*wave*(.35+middle*.9))));
 }
 return heights;
}
export function formatVoiceTime(seconds:number):string{
 if(!Number.isFinite(seconds)||seconds<0)return "0:00";
 const n=Math.floor(seconds);
 return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");
}
export function audioDuration(value:number):number{
 return Number.isFinite(value)&&value>0?value:0;
}
