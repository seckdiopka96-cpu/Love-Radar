/** Only retry transient transport/server problems; never repeat rejected messages. */
export function isTransientMessageFailure(error:unknown):boolean{
 const status=Number((error as {httpStatus?:number}|null)?.httpStatus||0);
 if(status)return status>=500&&status<600;
 const message=error instanceof Error?error.message:String(error||"");
 return /load failed|failed to fetch|networkerror|network request failed|connection (?:reset|lost)|internet connection appears to be offline|connexion prend trop de temps|connexion trop lente|aborterror|timeout/i.test(message);
}
export function messageRetryDelayMs(attempt:number):number{
 return Math.min(60000,5000*2**Math.min(Math.max(0,attempt-1),4));
}
