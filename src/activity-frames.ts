/** Pure animation frames — independent of CSS keyframe support on iOS PWAs. */
export const ACTIVITY_FRAMES=12;
export function typingDotFrame(frame:number,index:number){
 const active=Math.floor((frame%9)/3)===index;
 return {
  opacity:active?1:.32,
  transform:active?"translateY(-5px) scale(1.35)":"translateY(2px) scale(.78)",
  color:active?"#ffffff":"#a5bac7"
 };
}
export function microphoneFrame(frame:number){
 const active=frame%4<2;
 return {opacity:active?1:.62,transform:active?"scale(1.12)":"scale(.96)"};
}
export function voiceWaveFrame(frame:number,index:number){
 return {
  height:(6+Math.abs(Math.sin((frame+index*2)*.78))*15)+"px",
  opacity:((frame+index)%5<3)?1:.55
 };
}
