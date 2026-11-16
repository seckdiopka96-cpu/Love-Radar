import type {D1Database} from "@cloudflare/workers-types";

export const PRAYERS=["Fajr","Dhuhr","Asr","Maghrib","Isha"] as const;
export type Prayer=typeof PRAYERS[number];
export type PrayerTimes=Record<Prayer,string>;
export const PRAYER_LABELS:Record<Prayer,string>={
 Fajr:"Fajr",Dhuhr:"Dhuhr",Asr:"Asr",Maghrib:"Maghrib",Isha:"Isha"
};
export type PrayerSettings={member_id:string;room_id:string;latitude:number;longitude:number;
 timezone:string;method:number;enabled:number;updated_at:number};
export type PrayerDay={member_id:string;day:string;times_json:string;updated_at:number};
export const ALLOWED_METHODS=[2,3,4,5,12,21] as const;
const HHMM=/^([01]\d|2[0-3]):[0-5]\d$/;

export function validTimezone(timezone:unknown):timezone is string{
 if(typeof timezone!=="string"||timezone.length>70||!timezone.includes("/"))return false;
 try{new Intl.DateTimeFormat("en-US",{timeZone:timezone}).format(new Date());return true}
 catch{return false}
}
export function localClock(now:number,timezone:string):{day:string;time:string}{
 const fields=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",
  day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(now));
 const p=Object.fromEntries(fields.map(f=>[f.type,f.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function validLocation(lat:unknown,lon:unknown):lat is number{
 return typeof lat==="number"&&Number.isFinite(lat)&&Math.abs(lat)<=90&&
 typeof lon==="number"&&Number.isFinite(lon)&&Math.abs(lon)<=180;
}
export function roundLocation(n:number):number{return Math.round(n*10)/10}
export function validMethod(m:unknown):m is number{
 return typeof m==="number"&&ALLOWED_METHODS.some(x=>x===m);
}
export function parseTimings(value:unknown):PrayerTimes|null{
 if(!value||typeof value!=="object")return null;
 const obj=value as Record<string,unknown>;
 const pairs=PRAYERS.map(p=>[p,String(obj[p]||"").slice(0,5)] as const);
 if(!pairs.every(([_,time])=>HHMM.test(time)))return null;
 return Object.fromEntries(pairs) as PrayerTimes;
}
export function isPrayerDue(day:string,local:{day:string;time:string},
 prayerTime:string):boolean{
 if(day!==local.day||!HHMM.test(prayerTime))return false;
 const [h,m]=prayerTime.split(":").map(Number);
 const [ch,cm]=local.time.split(":").map(Number);
 const delay=(ch*60+cm)-(h*60+m);
 return delay>=0&&delay<=3; // Bound unavoidable cron delays, never notify hours late.
}
export async function ensureCareTables(db:D1Database){
 await db.exec(
  "CREATE TABLE IF NOT EXISTS care_notices("+
  "id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,"+
  "recipient_id TEXT NOT NULL,kind TEXT NOT NULL,label TEXT,"+
  "created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,read_at INTEGER);"+
  "CREATE INDEX IF NOT EXISTS idx_care_notice_inbox ON care_notices(recipient_id,expires_at);"+
  "CREATE TABLE IF NOT EXISTS care_share_throttle("+
  "member_id TEXT NOT NULL,kind TEXT NOT NULL,last_at INTEGER NOT NULL,"+
  "PRIMARY KEY(member_id,kind));"+
  // Nothing is inferred from a name or an avatar: each member opts in.
  "CREATE TABLE IF NOT EXISTS care_period_preferences("+
  "member_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,"+
  "updated_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_care_period_room ON care_period_preferences(room_id);"+
  "CREATE TABLE IF NOT EXISTS care_prayer_settings("+
  "member_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,latitude REAL NOT NULL,"+
  "longitude REAL NOT NULL,timezone TEXT NOT NULL,method INTEGER NOT NULL,"+
  "enabled INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_care_prayer_room ON care_prayer_settings(room_id);"+
  "CREATE TABLE IF NOT EXISTS care_prayer_cache("+
  "member_id TEXT NOT NULL,room_id TEXT NOT NULL,day TEXT NOT NULL,"+
  "times_json TEXT NOT NULL,updated_at INTEGER NOT NULL,"+
  "PRIMARY KEY(member_id,day));"+
  "CREATE TABLE IF NOT EXISTS care_prayer_sent("+
  "member_id TEXT NOT NULL,room_id TEXT NOT NULL,day TEXT NOT NULL,"+
  "prayer TEXT NOT NULL,sent_at INTEGER NOT NULL,"+
  "PRIMARY KEY(member_id,day,prayer));"
 );
}
export async function loadDayTimings(db:D1Database,settings:PrayerSettings,day:string,refresh=false):Promise<PrayerTimes|null>{
 const cached=await db.prepare("SELECT times_json FROM care_prayer_cache WHERE member_id=? AND day=?")
  .bind(settings.member_id,day).first<{times_json:string}>();
 if(cached&&!refresh){
  try{return parseTimings(JSON.parse(cached.times_json))}catch{/* Refetch invalid cache. */}
 }
 const date=day.split("-").reverse().join("-");
 const u=new URL("https://api.aladhan.com/v1/timings/"+date);
 u.searchParams.set("latitude",String(settings.latitude));
 u.searchParams.set("longitude",String(settings.longitude));
 u.searchParams.set("method",String(settings.method));
 u.searchParams.set("school","0");
 const res=await fetch(u.toString(),{signal:AbortSignal.timeout(8000)});
 if(!res.ok)throw Error("Prayer times provider unavailable");
 const data=await res.json() as {code?:number;data?:{timings?:unknown;meta?:{timezone?:string}}};
 if(data.code!==200)return null;
 // A method/location calculation with another timezone cannot be delivered safely.
 const sourceTz=data.data?.meta?.timezone;
 if(sourceTz&&sourceTz!==settings.timezone)return null;
 const timings=parseTimings(data.data?.timings);
 if(!timings)return null;
 await db.prepare("INSERT INTO care_prayer_cache(member_id,room_id,day,times_json,updated_at)"+
  " VALUES(?,?,?,?,?) ON CONFLICT(member_id,day) DO UPDATE SET times_json=excluded.times_json,updated_at=excluded.updated_at")
 .bind(settings.member_id,settings.room_id,day,JSON.stringify(timings),Date.now()).run();
 return timings;
}
