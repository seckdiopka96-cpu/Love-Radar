/** Stable, naturally varied visual placeholder while an audio note is loading.
 * These bars are decorative, not a measurement of the recording's amplitudes.
 */
export const VOICE_BARS=41;
export function voiceBars(seed:string,count=VOICE_BARS):number[]{
 let hash=2166136261;
 for(let i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619)}
 const heights:number[]=[];
 let smooth=.44;
 for(let i=0;i<count;i++){
  hash^=hash<<13;hash^=hash>>>17;hash^=hash<<5;
  const noise=(hash>>>0)/4294967295;
  // Soft clusters with scattered quieter moments look more like speech than a sine wave.
  smooth=.60*smooth+.40*noise;
  const phrase=.58+.25*Math.sin(i*.34+.75)+.17*Math.cos(i*.17+1.5);
  const syllable=.72+.28*Math.abs(Math.sin(i*1.39+noise*1.8));
  const level=Math.max(0,Math.min(1,(smooth*.48+noise*.52)*phrase*syllable));
  heights.push(Math.round(17+78*level));
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
