import type {D1Database} from "@cloudflare/workers-types";

/** Location-sharing was retired; discard previously stored coordinate sessions. */
const cleaned=new Set<string>();
export async function purgeRetiredLocation(db:D1Database,roomId:string):Promise<void>{
 if(cleaned.has(roomId))return;
 try{
  await db.prepare("DELETE FROM couple_location_requests WHERE room_id=?").bind(roomId).run();
  if(cleaned.size>256)cleaned.clear();
  cleaned.add(roomId);
 }catch(error){
  // New rooms never had the old table, and D1 rejects DELETE if it doesn't exist.
  if(!(error instanceof Error)||!/no such table/i.test(error.message))
   console.error("Location legacy data purge",error);
 }
}
