import type {D1Database,R2Bucket,D1PreparedStatement} from "@cloudflare/workers-types";

/**
 * Every persisted room-scoped table is explicitly allowlisted here.
 * Newly added game/relationship tables must be added here as well.
 * D1 databases created before some features existed won't have every table.
 */
export const ROOM_DATA_TABLES=[
 "message_replies","message_reactions","message_edits","message_hidden",
 "message_one_time","messages","e2ee_keys","chat_presence","voice_signals","voice_calls","voice_call_history","voice_call_modes","native_voip_devices","native_android_devices",
 "profile_photos","couple_story_events","couple_stories",
 "screenshot_events","care_notices","care_period_preferences","care_prayer_settings","care_prayer_cache","care_prayer_sent",
 "couple_location_requests","couple_canvas_presence","couple_canvas_events",
 "couple_canvas_invites","affection_signals","daily_moments",
 "memory_challenges","memory_gifts","memory_agreements","memory_games",
 "ludo_challenges","ludo_agreements","ludo_gifts","ludo_reactions",
 "ludo_reaction_events","ludo_move_events","ludo_games",
 "ludo_senegal_moves","ludo_senegal_games",
 "rps_games","couple_party_games","couple_puzzles","couple_puzzle_presence",
 "couple_watch_presence","couple_watch_sessions",
 "couple_tiktok_presence","couple_tiktok_watch",
 "couple_reconciliations","push_subscriptions","room_revisions","partner_recovery"
] as const;
export const MEMBER_DATA_TABLES=["member_recovery","push_test_throttle","care_share_throttle","screenshot_throttle"] as const;

/**
 * Build a single D1 transaction for the entire couple, including sensitive
 * reconciliation texts whose table has no room_id (only session/member IDs).
 * Table names come exclusively from this code, never from user input.
 */
export function buildRoomDeletionBatch(db:D1Database,roomId:string,existing:Set<string>):D1PreparedStatement[]{
 const statements:D1PreparedStatement[]=[];
 if(existing.has("couple_reconciliation_entries")){
  const membership="SELECT id FROM members WHERE room_id=?";
  if(existing.has("couple_reconciliations")){
   statements.push(db.prepare(
    "DELETE FROM couple_reconciliation_entries WHERE session_id IN"+
    " (SELECT id FROM couple_reconciliations WHERE room_id=?)"+
    " OR member_id IN ("+membership+")"
   ).bind(roomId,roomId));
  }else{
   statements.push(db.prepare(
    "DELETE FROM couple_reconciliation_entries WHERE member_id IN ("+membership+")"
   ).bind(roomId));
  }
 }
 // Tokens and member-scoped records are removed while membership still exists.
 for(const table of MEMBER_DATA_TABLES){
  if(existing.has(table))statements.push(db.prepare(
   "DELETE FROM "+table+" WHERE member_id IN (SELECT id FROM members WHERE room_id=?)"
  ).bind(roomId));
 }
 if(existing.has("abuse_counters")){
  statements.push(db.prepare(
   "DELETE FROM abuse_counters WHERE actor IN (SELECT 'member:'||id FROM members WHERE room_id=?)"
  ).bind(roomId));
 }
 for(const table of ROOM_DATA_TABLES){
  if(existing.has(table))statements.push(db.prepare("DELETE FROM "+table+" WHERE room_id=?").bind(roomId));
 }
 // Keep these last: ownership verification and active sessions depend on them.
 statements.push(db.prepare("DELETE FROM members WHERE room_id=?").bind(roomId));
 statements.push(db.prepare("DELETE FROM rooms WHERE id=?").bind(roomId));
 return statements;
}

async function findTables(db:D1Database){
 const rows=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all<{name:string}>();
 return new Set((rows.results||[]).map(row=>row.name));
}

/** Delete database-linked R2 keys in bounded batches (large chat histories too).
 * R2 deletion occurs before the D1 transaction: failed object removal aborts
 * while the owner can still retry, rather than losing the last authenticated
 * route to leaked private files. On D1 failure, the owner can also retry.
 */
async function purgeReferencedObjects(db:D1Database,storage:R2Bucket|undefined,roomId:string,existing:Set<string>){
 let removed=0;
 const remove=async(keys:string[])=>{
  const unique=[...new Set(keys.filter(Boolean))];
  if(!unique.length)return;
  if(!storage)throw Error("Private R2 storage is not configured");
  for(let i=0;i<unique.length;i+=100){
   await storage.delete(unique.slice(i,i+100));
   removed+=Math.min(100,unique.length-i);
  }
 };
 if(existing.has("profile_photos")){
  const rows=await db.prepare("SELECT object_key FROM profile_photos WHERE room_id=?")
   .bind(roomId).all<{object_key:string}>();
  await remove((rows.results||[]).map(x=>x.object_key));
 }
 if(existing.has("couple_stories")){
  const row=await db.prepare("SELECT photo_key FROM couple_stories WHERE room_id=?")
   .bind(roomId).first<{photo_key:string|null}>();
  if(row?.photo_key)await remove([row.photo_key]);
 }
 if(existing.has("messages")){
  let last="";
  while(true){
   // Keyset pagination; D1 must not load a couple's complete media history.
   const rows=await db.prepare(
    "SELECT DISTINCT object_key FROM messages WHERE room_id=?"+
    " AND object_key IS NOT NULL AND object_key>?"+
    " ORDER BY object_key ASC LIMIT 100"
   ).bind(roomId,last).all<{object_key:string}>();
   if(!rows.results?.length)break;
   const keys=rows.results.map(x=>x.object_key);
   await remove(keys);
   last=keys[keys.length-1];
   if(keys.length<100)break;
  }
 }
 // Also purge obsolete/replaced pictures whose paths remain in the private
 // bucket but are no longer referenced by current profile/story rows.
 if(storage){
  for(const prefix of ["profile/"+roomId+"/","couple-story/"+roomId+"/"]){
   // Always scan the first page again after deleting it: opaque R2 cursors
   // may skip objects if earlier entries have been removed.
   for(let page=0;page<10000;page++){
    const objects=await storage.list({prefix,limit:1000});
    if(!objects.objects?.length)break;
    await remove(objects.objects.map(x=>x.key));
    if(page===9999)throw Error("Too many legacy R2 profile objects");
   }
  }
 }
 return removed;
}

export async function deleteCoupleRoom(db:D1Database,storage:R2Bucket|undefined,roomId:string){
 const existing=await findTables(db);
 if(!existing.has("rooms")||!existing.has("members"))throw Error("Room schema missing");
 const found=await db.prepare("SELECT id FROM rooms WHERE id=?").bind(roomId).first<{id:string}>();
 if(!found)return {deleted:false,objectsDeleted:0};
 const objectsDeleted=await purgeReferencedObjects(db,storage,roomId,existing);
 const statements=buildRoomDeletionBatch(db,roomId,existing);
 // Cloudflare D1 batch is a transaction: an error rolls back every statement.
 const results=await db.batch(statements);
 if(results[results.length-1]?.meta.changes!==1)throw Error("Room deletion was not committed");
 return {deleted:true,objectsDeleted};
}
