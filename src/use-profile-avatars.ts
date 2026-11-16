import {useEffect,useState} from "react";
import {apiFetch} from "./api";

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
   }catch{/* Fall back to the member initial when temporarily offline. */}
  }
  void fetchAvatar(meId||"",Number(meVersion||0),"mine");
  void fetchAvatar(partnerId||"",Number(partnerVersion||0),"partner");
  return()=>{alive=false;for(const url of created)URL.revokeObjectURL(url)};
 },[token,meId,meVersion,partnerId,partnerVersion]);
 return urls;
}
