/** Sound level from the actual microphone's time-domain PCM samples. */
export function microphoneAmplitude(samples:Uint8Array):number{
 if(!samples.length)return .06;
 let sum=0;
 for(let i=0;i<samples.length;i+=2){
  const centered=(samples[i]-128)/128;
  sum+=centered*centered;
 }
 const rms=Math.sqrt(sum/Math.ceil(samples.length/2));
 return Math.min(1,Math.max(.06,Math.pow(rms*5,.77)));
}
