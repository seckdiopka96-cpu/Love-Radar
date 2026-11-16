/** Format a partner's last known foreground activity in the viewer's local time zone. */
export function formatPartnerLastSeen(lastSeenAt:number,now=Date.now()):string{
 if(!Number.isFinite(lastSeenAt)||lastSeenAt<=0)return "Hors ligne";
 const last=new Date(lastSeenAt),current=new Date(now);
 if(!Number.isFinite(last.getTime()))return "Hors ligne";
 const hour=last.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 const sameDay=(a:Date,b:Date)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
 if(sameDay(last,current))return "Dernière vue aujourd’hui à "+hour;
 const yesterday=new Date(current);yesterday.setDate(current.getDate()-1);
 if(sameDay(last,yesterday))return "Dernière vue hier à "+hour;
 const date=last.toLocaleDateString("fr-FR",{day:"numeric",month:"short",...(last.getFullYear()===current.getFullYear()?{}:{year:"numeric" as const})});
 return "Dernière vue le "+date+" à "+hour;
}
