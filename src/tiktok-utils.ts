/** TikTok's official embedded player works with a public numeric post ID. */
export const TIKTOK_VIDEO_ID=/^[0-9]{15,22}$/;
export type TikTokSnapshot={
 videoId:string;playing:boolean;position:number;syncedAt:number;updatedAt:number;
 updatedBy:string|null;version:number
};
function urlFromText(value:string):URL|null{
 const match=value.trim().match(/https?:\/\/[^\s<>]+/i);
 const candidate=match?match[0].replace(/[),.!?]+$/,""):value.trim();
 try{
  const url=new URL(candidate);
  return url.protocol==="https:"&&!url.username&&!url.password&&!url.port?url:null;
 }catch{return null}
}
export function parseTikTokId(raw:string):string|null{
 const input=raw.trim();
 if(TIKTOK_VIDEO_ID.test(input))return input;
 const url=urlFromText(input);
 if(!url)return null;
 const host=url.hostname.toLowerCase();
 if(host!=="tiktok.com"&&host!=="www.tiktok.com"&&host!=="m.tiktok.com")return null;
 const parts=url.pathname.split("/").filter(Boolean);
 const id=parts[0]?.startsWith("@")&&parts[1]==="video"&&parts.length===3?parts[2]:
  parts[0]==="player"&&parts[1]==="v1"&&parts.length===3?parts[2]:
  parts[0]==="video"&&parts.length===2?parts[1]:null;
 return id&&TIKTOK_VIDEO_ID.test(id)?id:null;
}
export function isTikTokShortLink(raw:string):boolean{
 const url=urlFromText(raw);
 if(!url)return false;
 const host=url.hostname.toLowerCase();
 return (host==="vm.tiktok.com"||host==="vt.tiktok.com")&&/^\/[a-zA-Z0-9_-]{3,48}\/?$/.test(url.pathname);
}
export function canonicalTikTokVideo(id:string):string{
 return "https://www.tiktok.com/player/v1/"+encodeURIComponent(id)+"?autoplay=0&loop=0&controls=1&description=0&music_info=0";
}
export function watchTikTokTime(snapshot:TikTokSnapshot,now:number):number{
 if(!snapshot.videoId)return 0;
 return Math.max(0,Math.min(86400,snapshot.position+
  (snapshot.playing?Math.max(0,now-snapshot.syncedAt)/1000:0)));
}
export function formatTikTokTime(value:number):string{
 const seconds=Math.floor(Math.max(0,Number.isFinite(value)?value:0));
 return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
}
