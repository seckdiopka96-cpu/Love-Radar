/** WebRTC recovery policy: bounded retries with no microphone/camera recapture. */
export const MAX_RECONNECT_ATTEMPTS=7;
export const RECONNECT_DELAYS_MS=[900,2200,4200,7000,10000,13000,16000] as const;
export function reconnectDelayMs(attempt:number):number{
 const index=Math.min(RECONNECT_DELAYS_MS.length-1,Math.max(0,Math.floor(attempt)));
 return RECONNECT_DELAYS_MS[index];
}
export function mustReconnect(connection:RTCPeerConnectionState,ice:RTCIceConnectionState):boolean{
 return connection==="failed"||connection==="disconnected"||
  ice==="failed"||ice==="disconnected";
}
/** PiP coordinates are contained in the viewport, including mobile keyboard resizes. */
export function clampFloatingCall(
 x:number,y:number,viewWidth:number,viewHeight:number,boxWidth:number,boxHeight:number
):{x:number;y:number}{
 const margin=8;
 const maxX=Math.max(margin,viewWidth-boxWidth-margin);
 const maxY=Math.max(margin,viewHeight-boxHeight-margin);
 return {
  x:Math.min(maxX,Math.max(margin,Math.round(x))),
  y:Math.min(maxY,Math.max(margin,Math.round(y)))
 };
}
