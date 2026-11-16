import type {D1Database,ScheduledController,ExecutionContext} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../functions/lib/push";
import {ensureCareTables,localClock,loadDayTimings,isPrayerDue,PRAYERS,validTimezone,
 type PrayerSettings} from "../functions/lib/care-prayer";

/** Deploy as a separate scheduled Cloudflare Worker bound to the same D1.
 * No public HTTP endpoint, no source file containing credentials.
 * Cron is every minute, all local timezones are handled by Intl.
 */
type Env=PushEnv;
type Config=PrayerSettings & {name:string;partner_id:string};
export async function deliverPrayerReminders(db:D1Database,env:Env,time=Date.now()):Promise<number>{
 await ensureCareTables(db);
 let last="",sent=0;
 const oldestDay=new Date(time-5*86400000).toISOString().slice(0,10);
 for(let page=0;page<100;page++){
  const rows=await db.prepare(
   "SELECT s.*,m.name AS name,p.id AS partner_id"+
   " FROM care_prayer_settings s JOIN members m ON m.id=s.member_id AND m.room_id=s.room_id"+
   " JOIN members p ON p.room_id=s.room_id AND p.id<>s.member_id"+
   " WHERE s.enabled=1 AND s.member_id>? ORDER BY s.member_id LIMIT 100"
  ).bind(last).all<Config>();
  const people=rows.results||[];
  if(!people.length)break;
  for(const p of people){
   last=p.member_id;
   if(!validTimezone(p.timezone))continue;
   const clock=localClock(time,p.timezone);
   let timings;
   try{timings=await loadDayTimings(db,p,clock.day)}
   catch(err){console.warn("Prayer schedule temporarily unavailable",p.member_id,err);continue}
   if(!timings)continue;
   for(const prayer of PRAYERS){
    if(!isPrayerDue(clock.day,clock,timings[prayer]))continue;
    const claim=await db.prepare("INSERT OR IGNORE INTO care_prayer_sent"+
     "(member_id,room_id,day,prayer,sent_at) VALUES(?,?,?,?,?)")
     .bind(p.member_id,p.room_id,clock.day,prayer,time).run();
    if(claim.meta.changes!==1)continue;
    const label=prayer;
    // Stored inbox entry is private to the receiving partner, short-lived
    // and makes the reminder visible even if web push is disabled.
    await db.prepare("INSERT INTO care_notices"+
     "(id,room_id,sender_id,recipient_id,kind,label,created_at,expires_at)"+
     " VALUES(?,?,?,?,'prayer',?,?,?)")
     .bind(crypto.randomUUID(),p.room_id,p.member_id,p.partner_id,label,time,time+16*3600000).run();
    await notifyPartner(env,p.room_id,p.member_id,"🕌 Moment de prière",
     "C'est l'heure de "+label+" pour "+p.name.slice(0,35)+". Une petite pensée ?","care");
    sent++;
   }
  }
  if(people.length<100)break;
 }
 // Keep prayer-time caches and delivery deduplication bounded.
 await db.prepare("DELETE FROM care_notices WHERE expires_at<?").bind(time).run();
 await db.prepare("DELETE FROM care_prayer_cache WHERE day<?").bind(oldestDay).run();
 await db.prepare("DELETE FROM care_prayer_sent WHERE day<?").bind(oldestDay).run();
 return sent;
}
export default {
 async scheduled(_controller:ScheduledController,env:Env,_ctx:ExecutionContext){
  if(!env.DB)throw Error("Care scheduler DB binding is not configured");
  const count=await deliverPrayerReminders(env.DB,env);
  console.log("Love Radar care reminder tick",count);
 },
 async fetch(){
  return new Response("This worker accepts scheduled events only.",{status:405});
 }
};
