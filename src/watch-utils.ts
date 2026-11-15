/** Accept only real YouTube watch, short, live or embed URLs; never embed arbitrary sites. */
export function parseYouTubeId(raw:string):string|null{
 const value=raw.trim();
 if(/^[a-zA-Z0-9_-]{11}$/.test(value))return value;
 try{
  const url=new URL(/^https?:\/\//i.test(value)?value:"https://"+value);
  if(url.protocol!=="https:"&&url.protocol!=="http:")return null;
  if(url.username||url.password)return null;
  const hostname=url.hostname.toLowerCase().replace(/^www\./,"");
  const paths=url.pathname.split("/").filter(Boolean);
  let id:string|null=null;
  if(hostname==="youtu.be")id=paths.length===1?paths[0]:null;
  else if(["youtube.com","m.youtube.com","music.youtube.com","youtube-nocookie.com"].includes(hostname)){
   if(paths[0]==="watch")id=url.searchParams.get("v");
   else if(["shorts","live","embed","v"].includes(paths[0])&&paths.length===2)id=paths[1];
  }
  return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null;}
}
export type WatchSnapshot={videoId:string;playing:boolean;position:number;syncedAt:number;updatedAt:number;version:number;updatedBy:string|null};
export function expectedPlaybackSeconds(state:WatchSnapshot,nowMs:number):number{
 if(!state.videoId)return 0;
 return Math.max(0,Math.min(86400,state.position+(state.playing?Math.max(0,nowMs-state.syncedAt)/1000:0)));
}
export function formatWatchTime(s:number):string{
 if(!Number.isFinite(s)||s<0)return "0:00";
 const n=Math.floor(s),hours=Math.floor(n/3600),m=Math.floor(n%3600/60),secs=n%60;
 return hours>0?[hours,String(m).padStart(2,"0"),String(secs).padStart(2,"0")].join(":"):
  m+":"+String(secs).padStart(2,"0");
}
