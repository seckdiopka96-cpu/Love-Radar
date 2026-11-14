/* Calendar days, not milliseconds, keep dates meaningful across time zones. */
export type StoryEvent={id:string;date:string;title:string;note:string;annual:boolean;createdAt:number};
export type StoryProfile={meetingDate:string|null;reunionDate:string|null;reunionPlace:string;hasPhoto:boolean;photoVersion:string|null;updatedAt:number};
export type StoryData={ok:boolean;error?:string;profile:StoryProfile;events:StoryEvent[];serverNow:number};
export const emptyProfile:StoryProfile={meetingDate:null,reunionDate:null,reunionPlace:"",hasPhoto:false,photoVersion:null,updatedAt:0};
export function todayLocal(){
 const date=new Date();
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export function dateNumber(iso:string){
 const [year,month,day]=iso.split("-").map(Number);
 return Date.UTC(year,month-1,day)/86400000;
}
export function daysTo(iso:string,today=todayLocal()){return dateNumber(iso)-dateNumber(today)}
export function formatDate(iso:string,full=false){
 const [year,month,day]=iso.split("-").map(Number);
 return new Date(year,month-1,day).toLocaleDateString("fr-FR",{day:"numeric",month:"long",...(full?{weekday:"long" as const}:{}),year:"numeric"});
}
export function nextAnnual(iso:string,today=todayLocal()){
 const [y,m,d]=iso.split("-").map(Number);
 const currentYear=Number(today.slice(0,4));
 function occurrence(year:number){
  // A February 29 anniversary falls on February 28 in non-leap years.
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const day=m===2&&d===29&&!leap?28:d;
  return [String(year).padStart(4,"0"),String(m).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
 }
 const first=occurrence(Math.max(currentYear,y));
 return first>=today?first:occurrence(Math.max(currentYear+1,y+1));
}
export function upcomingDates(profile:StoryProfile,events:StoryEvent[],today=todayLocal()){
 const entries:{id:string;date:string;label:string;annual:boolean;sourceDate:string}[]=[];
 if(profile.meetingDate)entries.push({id:"meeting",date:nextAnnual(profile.meetingDate,today),label:"Notre anniversaire ❤️",annual:true,sourceDate:profile.meetingDate});
 for(const event of events){
  const date=event.annual?nextAnnual(event.date,today):event.date;
  if(date>=today)entries.push({id:event.id,date,label:event.title,annual:event.annual,sourceDate:event.date});
 }
 return entries.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label)).slice(0,15);
}
