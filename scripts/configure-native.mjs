#!/usr/bin/env node
// Regenerate iOS/Android call capabilities after "npx cap add".
//
// All changes are idempotent and live in generated platform projects; the
// source of truth is this script and the native/call-session/ templates.
// No microphone capture is started unless a user accepts/initiates a call.
import {readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const platform=process.argv[2]||"all";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const androidPath="android/app/src/main/AndroidManifest.xml";
const iosPath="ios/App/App/Info.plist";
const template=name=>readFileSync(join(root,"native/call-session",name),"utf8");
const put=(file,body)=>{
 mkdirSync(dirname(file),{recursive:true});
 if(!existsSync(file)||readFileSync(file,"utf8")!==body)writeFileSync(file,body);
};
function insertPermissions(xml,names){
 const missing=names.filter(x=>!xml.includes('android:name="'+x+'"'));
 if(!missing.length)return xml;
 if(!xml.includes("</manifest>"))throw Error("Unexpected AndroidManifest.xml");
 return xml.replace("</manifest>",
  missing.map(name=>'    <uses-permission android:name="'+name+'" />').join("\n")+"\n</manifest>");
}
function android(){
 if(!existsSync(androidPath))throw Error("Android project missing: run npx cap add android.");
 let xml=readFileSync(androidPath,"utf8");
 xml=insertPermissions(xml,[
  "android.permission.RECORD_AUDIO",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.CAMERA"
 ]);
 if(!xml.includes('android:name=".NativeCallService"')){
  if(!xml.includes("</application>"))throw Error("Unexpected Android application section");
  xml=xml.replace("</application>",
   '    <service android:name=".NativeCallService" android:exported="false"'+
   ' android:foregroundServiceType="microphone" />\n    </application>');
 }
 put(androidPath,xml);
 const dir="android/app/src/main/java";
 const main=readdirSync(dir,{recursive:true}).filter(x=>String(x).replaceAll("\\","/").endsWith("MainActivity.java"));
 if(main.length!==1)throw Error("Unable to find generated Android MainActivity.");
 const mainPath=join(dir,String(main[0]));
 let java=readFileSync(mainPath,"utf8");
 const packageName=java.match(/\bpackage\s+([\w.]+)\s*;/)?.[1];
 if(!packageName||!java.includes("extends BridgeActivity"))throw Error("Unrecognized Capacitor Android activity");
 if(!java.includes("registerPlugin(NativeCallPlugin.class)")){
  if(!java.includes("public class MainActivity extends BridgeActivity"))throw Error("Unexpected Android MainActivity");
  java=java.replace("public class MainActivity extends BridgeActivity",
   "public class MainActivity extends BridgeActivity");
  if(!java.includes("import android.os.Bundle;"))
   java=java.replace(/(package [\w.]+;)/,"$1\nimport android.os.Bundle;");
  java=java.replace(/(public class MainActivity extends BridgeActivity\s*\{)/,
   '$1\n    @Override public void onCreate(Bundle savedInstanceState) {\n'+
   '        registerPlugin(NativeCallPlugin.class);\n'+
   '        super.onCreate(savedInstanceState);\n    }\n');
 }
 put(mainPath,java);
 const outputDir=dirname(mainPath);
 for(const file of ["NativeCallPlugin.java","NativeCallService.java"]){
  put(join(outputDir,file),template(file+".txt").replaceAll("__PACKAGE__",packageName));
 }
 console.log("Android foreground microphone service and Capacitor call bridge configured.");
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
 const additions=Object.entries(descriptions)
  .filter(([key])=>!xml.includes("<key>"+key+"</key>"))
  .map(([key,value])=>"    <key>"+key+"</key>\n    <string>"+value+"</string>").join("\n");
 if(additions){
  if(!xml.includes("<dict>"))throw Error("Unexpected iOS Info.plist");
  xml=xml.replace("<dict>","<dict>\n"+additions);
 }
 // PushKit VoIP is required to wake a terminated/native iOS app for CallKit.
 // UIBackgroundModes alone does not grant APNs: signed Apple capabilities
 // and APNs server credentials must be configured separately.
 const mode=xml.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/);
 const needed=["audio","voip","remote-notification"];
 if(mode){
  const missing=needed.filter(x=>!mode[1].includes("<string>"+x+"</string>"));
  if(missing.length)xml=xml.replace(mode[0],mode[0].replace("</array>",
   missing.map(x=>"    <string>"+x+"</string>").join("\n")+"\n</array>"));
 }else{
  xml=xml.replace("<dict>","<dict>\n    <key>UIBackgroundModes</key>\n    <array>"+needed.map(x=>"<string>"+x+"</string>").join("")+"</array>");
 }
 put(iosPath,xml);
 // AppDelegate.swift is already a compile-source in Capacitor's Xcode target.
 // Appending avoids fragile pbxproj edits for generated SPM projects.
 const delegate="ios/App/App/AppDelegate.swift";
 if(!existsSync(delegate))throw Error("Expected iOS AppDelegate.swift was not generated.");
 let swift=readFileSync(delegate,"utf8");
 if(!swift.includes("import Capacitor"))throw Error("Cannot bridge native call plugin without Capacitor");
 if(!swift.includes("// END LOVE RADAR NATIVE CALL")){
  swift+="\n"+template("ios-bridge.swift.txt");
 }
 if(!swift.includes("// END LOVE RADAR VOIP CALLKIT")){
  swift+="\n"+template("ios-voip.swift.txt");
 }
 if(!swift.includes("// END LOVE RADAR SCREENSHOT MONITOR")){
  swift+="\n"+template("ios-screenshot.swift.txt");
 }
 // The delegate starts PushKit before the web bridge is initialized so the
 // operating system can deliver VoIP pushes when Love Radar was terminated.
 const launch=swift.indexOf("didFinishLaunchingWithOptions");
 const launchReturn=swift.indexOf("return true",launch);
 if(launch<0||launchReturn<0)throw Error("Cannot locate native launch callback");
 if(!swift.slice(launch,launchReturn).includes("LoveRadarVoipManager.shared.start()")){
  swift=swift.slice(0,launchReturn)+"LoveRadarVoipManager.shared.start()\n        "+swift.slice(launchReturn);
 }
 // A previously generated iOS app is upgraded without repeating plugin registration.
 if(!swift.includes("bridge?.registerPluginInstance(LoveRadarVoipPlugin())")){
  const callRegistration="bridge?.registerPluginInstance(LoveRadarNativeCall())";
  if(!swift.includes(callRegistration))throw Error("Missing existing Capacitor call bridge registration");
  swift=swift.replace(callRegistration,callRegistration+"\n        bridge?.registerPluginInstance(LoveRadarVoipPlugin())");
 }
 if(!swift.includes("bridge?.registerPluginInstance(LoveRadarCapturePlugin())")){
  const callRegistration="bridge?.registerPluginInstance(LoveRadarVoipPlugin())";
  if(!swift.includes(callRegistration))throw Error("Missing existing Capacitor VoIP bridge registration");
  swift=swift.replace(callRegistration,callRegistration+"\n        bridge?.registerPluginInstance(LoveRadarCapturePlugin())");
 }
 put(delegate,swift);
 const entitlements="ios/App/App/App.entitlements";
 put(entitlements,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>aps-environment</key><string>$(APS_ENVIRONMENT)</string>
</dict></plist>
`);
 const pbxproj="ios/App/App.xcodeproj/project.pbxproj";
 if(!existsSync(pbxproj))throw Error("Cannot find generated Xcode project");
 let project=readFileSync(pbxproj,"utf8");
 let patched=0;
 project=project.replace(/(buildSettings = \{)([\s\S]*?)(\n\s*\};\s*name = (Debug|Release);\s*\};)/g,
  (block,head,settings,tail,configuration)=>{
   if(!settings.includes("INFOPLIST_FILE = App/Info.plist"))return block;
   patched++;
   const lines=(!settings.includes("CODE_SIGN_ENTITLEMENTS")?
    "\n                CODE_SIGN_ENTITLEMENTS = App/App.entitlements;":"")+
    (!settings.includes("APS_ENVIRONMENT")?
    "\n                APS_ENVIRONMENT = "+(configuration==="Release"?"production":"development")+";":"");
   return head+lines+settings+tail;
  });
 if(patched<2)throw Error("Could not configure iOS Debug and Release signing entitlements");
 put(pbxproj,project);
 // The initial view controller must be the plugin-registering subclass.
 const storyboard="ios/App/App/Base.lproj/Main.storyboard";
 if(!existsSync(storyboard))throw Error("Expected iOS Main.storyboard was not generated.");
 let story=readFileSync(storyboard,"utf8");
 if(!story.includes('customClass="LoveRadarBridgeViewController"')){
  const rx=/customClass="CAPBridgeViewController"(?:\s+customModule="Capacitor")?(?:\s+customModuleProvider="target")?/;
  if(!rx.test(story))throw Error("Unable to find Capacitor bridge controller in Main.storyboard");
  story=story.replace(rx,'customClass="LoveRadarBridgeViewController" customModule="App" customModuleProvider="target"');
 }
 put(storyboard,story);
 console.log("iOS PushKit, CallKit, background VoIP, per-build APNs entitlements and WebRTC bridge configured.");
}
if(platform==="android")android();
else if(platform==="ios")ios();
else if(platform==="all"){android();ios()}
else throw Error("Usage: node scripts/configure-native.mjs android|ios|all");
