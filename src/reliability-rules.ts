/** Small, inspectable reliability rules used by network and media workflows. */
export const RELAY_REFRESH_AFTER_MS=45*60*1000;
export const RELAY_RETRY_AFTER_ERROR_MS=60*1000;
export const MEDIA_AUTO_RETRY_LIMIT=4;

/** TURN credentials are short lived: never reuse relay setup indefinitely. */
export function relayNeedsRefresh(warmedAt:number,now=Date.now(),maxAge=RELAY_REFRESH_AFTER_MS):boolean{
 return !Number.isFinite(warmedAt)||warmedAt<=0||now<warmedAt||now-warmedAt>=maxAge;
}

/** Four bounded retries with backoff. Avoid infinite requests for deleted media. */
export function mediaRetryDelay(attempts:number):number|null{
 if(!Number.isInteger(attempts)||attempts<1||attempts>MEDIA_AUTO_RETRY_LIMIT)return null;
 return Math.min(30000,2500*2**Math.min(attempts-1,4));
}
