/** Love Radar animation preference. The user can pause motion inside the app
 * independent of iOS's system-level Reduce Motion setting. */
const KEY="love-radar-animations-v1";
export function getMotionEnabled():boolean{
 try{return localStorage.getItem(KEY)!=="off"}catch{return true}
}
export function applyMotionMode(enabled:boolean):void{
 if(typeof document==="undefined")return;
 document.documentElement.classList.toggle("lr-animations-on",enabled);
 document.documentElement.classList.toggle("lr-animations-off",!enabled);
}
export function setMotionEnabled(enabled:boolean):void{
 try{localStorage.setItem(KEY,enabled?"on":"off")}catch{/* Storage can be unavailable in private mode. */}
 applyMotionMode(enabled);
}
export function initializeMotionMode():void{
 applyMotionMode(getMotionEnabled());
}
