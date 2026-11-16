import type {D1Database} from "@cloudflare/workers-types";

/**
 * Room-scoped change counter for cheap, incremental client synchronization.
 * Every couple has a separate row; no conversation details cross a room boundary.
 * The counter only signals "refresh", never sends private content.
 */
let initialized:Promise<void>|null=null;
export async function ensureRoomRevision(db:D1Database){
 if(!initialized)initialized=db.exec(
  "CREATE TABLE IF NOT EXISTS room_revisions("+
  "room_id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,"+
  "updated_at INTEGER NOT NULL DEFAULT 0)"
 ).then(()=>{}).catch(error=>{initialized=null;throw error});
 await initialized;
}
export async function roomRevision(db:D1Database,roomId:string){
 await ensureRoomRevision(db);
 const row=await db.prepare("SELECT revision FROM room_revisions WHERE room_id=?")
  .bind(roomId).first<{revision:number}>();
 return row?.revision??0;
}
export async function markRoomChanged(db:D1Database,roomId:string){
 await ensureRoomRevision(db);
 await db.prepare("INSERT INTO room_revisions(room_id,revision,updated_at) VALUES(?,1,?)"+
  " ON CONFLICT(room_id) DO UPDATE SET revision=room_revisions.revision+1,updated_at=excluded.updated_at")
  .bind(roomId,Date.now()).run();
}
