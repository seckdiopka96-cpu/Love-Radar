import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import {DEFAULT_COUPLE_AVATARS,safeCoupleAvatarState,validAvatarStyle,validCouplePose,
 type CoupleAvatarState,type AvatarStyle,type CouplePose} from "./couple-avatar-model";

type Result={avatars?:unknown;ok?:boolean;error?:string};
export function useCoupleAvatars(token:string,roomId:string|undefined){
 const [avatars,setAvatars]=useState<CoupleAvatarState>(DEFAULT_COUPLE_AVATARS);
 const [saving,setSaving]=useState(false);
 const version=useRef(0);
 const busy=useRef(false);
 const latestRoom=useRef(roomId);
 useEffect(()=>{
  latestRoom.current=roomId;
  version.current=0;
  busy.current=false;
  setSaving(false);
  setAvatars(DEFAULT_COUPLE_AVATARS);
  if(!token||!roomId)return;
  let alive=true,pending=false;
  async function refresh(){
   if(!alive||pending||busy.current||document.visibilityState==="hidden")return;
   pending=true;
   try{
    const response=await apiFetch("/api/couple-avatars",{
     cache:"no-store",headers:{"Authorization":"Bearer "+token}
    });
    if(!response.ok)throw Error("Lecture indisponible");
    const result=await response.json() as Result;
    if(!alive||busy.current)return;
    const data=safeCoupleAvatarState(result.avatars);
    if(data.version>=version.current){version.current=data.version;setAvatars(data)}
   }catch{/* Retain last confirmed avatars across intermittent connectivity */}
   finally{pending=false}
  }
  void refresh();
  const poll=window.setInterval(()=>{void refresh()},12000);
  const resume=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",resume);
  window.addEventListener("focus",resume);
  return()=>{
   alive=false;window.clearInterval(poll);
   document.removeEventListener("visibilitychange",resume);
   window.removeEventListener("focus",resume);
  };
 },[token,roomId]);
 const update=useCallback(async(payload:{kind:"style";style:AvatarStyle}|{kind:"pose";pose:CouplePose})=>{
  if(!token||!roomId||latestRoom.current!==roomId||busy.current)throw Error("Patiente un instant.");
  if(payload.kind==="style"&&!validAvatarStyle(payload.style))throw Error("Personnage inconnu.");
  if(payload.kind==="pose"&&!validCouplePose(payload.pose))throw Error("Pose inconnue.");
  busy.current=true;setSaving(true);
  try{
   const response=await apiFetch("/api/couple-avatars",{
    method:"POST",cache:"no-store",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
   });
   const result=await response.json() as Result;
   if(!response.ok||!result.ok||!result.avatars)throw Error(result.error||"Enregistrement impossible.");
   const saved=safeCoupleAvatarState(result.avatars);
   if(latestRoom.current===roomId&&saved.version>=version.current){
    version.current=saved.version;setAvatars(saved);
   }
   return saved;
  }finally{busy.current=false;setSaving(false)}
 },[token,roomId]);
 const saveStyle=useCallback((style:AvatarStyle)=>update({kind:"style",style}),[update]);
 const savePose=useCallback((pose:CouplePose)=>update({kind:"pose",pose}),[update]);
 return {avatars,saving,saveStyle,savePose};
}
