import {PrivacyScreen} from "@capacitor/privacy-screen";
import {isNativeApp} from "./api";

/** Native privacy: Android FLAG_SECURE, iOS secure app-switcher overlay. */
export async function setNativePrivacy(enabled:boolean){
 if(!isNativeApp)return;
 try{
  if(enabled){
   await PrivacyScreen.enable({
    android:{dimBackground:true,privacyModeOnActivityHidden:"splash"},
    ios:{blurEffect:"dark"}
   });
  }else await PrivacyScreen.disable();
 }catch(err){console.error("Love Radar: protection native indisponible",err)}
}
export function initializeNativePrivacy(){
 if(!isNativeApp)return;
 let enabled=true;
 try{enabled=localStorage.getItem("love-radar-privacy-mode")!=="off"}catch{/* default secure */}
 void setNativePrivacy(enabled);
}
