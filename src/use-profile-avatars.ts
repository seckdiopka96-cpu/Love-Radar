import {useEffect,useState} from "react";
import {apiFetch} from "./api";

/** Keep a small notification thumbnail on THIS authenticated device only.
 * It is never uploaded to a public URL and never included in push provider payloads.
 * On iOS web push the system may ignore NotificationOptions.icon and show app icon. */
async function pushAvatarIcon(blob:Blob,memberId:string){
 if(!("serviceWorker" in navigator)||!/^[a-f0-9-]{36}$/i.test(memberId))return;
 try{
  const bitmap=await createImageBitmap(blob);
  const canvas=document.createElement("canvas");canvas.width=72;canvas.height=72;
  const context=canvas.getContext("2d");
  if(!context){bitmap.close();return}
  const side=Math.min(bitmap.width,bitmap.height);
  context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,72,72);
  bitmap.close();
  const iconData=canvas.toDataURL("image/jpeg",.68);
  if(iconData.length>16_000)return;
  const registration=await navigator.serviceWorker.ready;
  registration.active?.postMessage({type:"love-radar-avatar-icon",memberId,iconData});
 }catch{/* Avatar still works in the app even if notifications cannot show custom icons. */}
}
function clearPushAvatar(){
 if(!("serviceWorker" in navigator))return;
 void navigator.serviceWorker.ready.then(registration=>{
  registration.active?.postMessage({type:"love-radar-avatar-clear"});
 }).catch(()=>{});
}

/** Read room-scoped profile images only when their server version changes.
 * Object URLs are revoked when switching rooms, users or avatar versions. */
export function useProfileAvatars(
 token:string,meId:string|undefined,meVersion:number|undefined,
 partnerId:string|null|undefined,partnerVersion:number|undefined
){
 const [urls,setUrls]=useState<{mine:string;partner:string}>({mine:"",partner:""});
 useEffect(()=>{
  let alive=true;
  const created:string[]=[];
  setUrls({mine:"",partner:""});
  clearPushAvatar();
  async function fetchAvatar(member:string,version:number,slot:"mine"|"partner"){
   if(!token||!member||!version)return;
   try{
    const response=await apiFetch("/api/profile?member="+encodeURIComponent(member)+"&v="+version,{
     headers:{Authorization:"Bearer "+token},cache:"no-store"
    });
    if(!response.ok)return;
    const type=(response.headers.get("content-type")||"").toLowerCase();
    if(!type.startsWith("image/jpeg"))return;
    const blob=await response.blob();
    if(!alive||blob.size===0)return;
    const url=URL.createObjectURL(blob);
    created.push(url);
    setUrls(current=>({...current,[slot]:url}));
    if(slot==="partner")void pushAvatarIcon(blob,member);
   }catch{/* Fall back to the member initial when temporarily offline. */}
  }
  void fetchAvatar(meId||"",Number(meVersion||0),"mine");
  void fetchAvatar(partnerId||"",Number(partnerVersion||0),"partner");
  return()=>{alive=false;for(const url of created)URL.revokeObjectURL(url)};
 },[token,meId,meVersion,partnerId,partnerVersion]);
 return urls;
}
