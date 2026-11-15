/**
 * Overlay locally recorded audio into a server conversation without flicker.
 * The server message wins once its UUID is visible; retries reuse the same id.
 */
export function mergeOptimisticMessages<T extends {id:string;created_at:number}>(server:readonly T[],outbox:readonly T[]):T[]{
 const merged=new Map<string,T>();
 for(const local of outbox)merged.set(local.id,local);
 for(const authoritative of server)merged.set(authoritative.id,authoritative);
 return [...merged.values()].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id));
}
export type AudioOutboxStatus="uploading"|"failed"|"sent";
export function shouldKeepVoiceDraft(status:AudioOutboxStatus,serverHasId:boolean):boolean{
 return status!=="sent"||!serverHasId;
}
