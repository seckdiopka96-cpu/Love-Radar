#!/usr/bin/env node
// Idempotent permissions for generated Capacitor native projects.
import {readFileSync,writeFileSync,existsSync} from "node:fs";
const platform=process.argv[2]||"all";
const iosPath="ios/App/App/Info.plist",androidPath="android/app/src/main/AndroidManifest.xml";
function android(){
 if(!existsSync(androidPath))throw Error("Android project missing: run npx cap add android.");
 let xml=readFileSync(androidPath,"utf8");
 const permissions=["android.permission.RECORD_AUDIO","android.permission.ACCESS_COARSE_LOCATION","android.permission.ACCESS_FINE_LOCATION","android.permission.CAMERA"];
 const missing=permissions.filter(x=>!xml.includes('android:name="'+x+'"'));
 if(missing.length){
  if(!xml.includes("</manifest>"))throw Error("Unexpected AndroidManifest.xml");
  const lines=missing.map(name=>'    <uses-permission android:name="'+name+'" />').join("\n");
  xml=xml.replace("</manifest>",lines+"\n</manifest>");
  writeFileSync(androidPath,xml);
 }
 console.log("Android permissions checked.");
}
function ios(){
 if(!existsSync(iosPath))throw Error("iOS project missing: run npx cap add ios.");
 let xml=readFileSync(iosPath,"utf8");
 const descriptions={
  NSMicrophoneUsageDescription:"Love Radar utilise le microphone pour les appels vocaux et les messages audio.",
  NSCameraUsageDescription:"Love Radar permet de prendre une photo à partager avec ton partenaire.",
  NSPhotoLibraryUsageDescription:"Love Radar permet de sélectionner une photo privée à partager avec ton partenaire.",
  NSLocationWhenInUseUsageDescription:"Love Radar partage ta position seulement si tu l'autorises, pour une durée limitée."
 };
 const additions=Object.entries(descriptions).filter(([key])=>!xml.includes("<key>"+key+"</key>"))
 .map(([key,value])=>"    <key>"+key+"</key>\n    <string>"+value+"</string>").join("\n");
 if(additions){
  if(!xml.includes("<dict>"))throw Error("Unexpected iOS Info.plist");
  xml=xml.replace("<dict>","<dict>\n"+additions);
  writeFileSync(iosPath,xml);
 }
 console.log("iOS privacy permissions checked.");
}
if(platform==="android")android();
else if(platform==="ios")ios();
else if(platform==="all"){android();ios()}
else throw Error("Usage: node scripts/configure-native.mjs android|ios|all");
