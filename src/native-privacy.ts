import {PrivacyScreen} from "@capacitor/privacy-screen";
import {Capacitor} from "@capacitor/core";
import {isNativeApp} from "./api";

/** Native privacy: always block Android screenshots with FLAG_SECURE;
 *  iOS uses an app-switcher overlay, not screenshot prevention.
 */
export async function setNativePrivacy(enabled:boolean){
 if(!isNativeApp)return;
 try{
  // Android FLAG_SECURE is mandatory in the native app. The photo privacy
  // switch must not accidentally disable screenshot protection.
  if(Capacitor.getPlatform()==="android"||enabled){
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
