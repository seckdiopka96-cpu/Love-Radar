import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {spawnSync} from "node:child_process";

const root=resolve(".");
const configure=join(root,"scripts/configure-native.mjs");
const sampleAndroid='<?xml version="1.0" encoding="utf-8"?><manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Love Radar"><activity android:name=".MainActivity"/></application></manifest>';
const sampleJava='package com.diaotech.loveradar;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {\n}\n';
const samplePlist='<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleName</key><string>App</string></dict></plist>';
const sampleSwift='import UIKit\nimport Capacitor\n@UIApplicationMain\nclass AppDelegate: UIResponder, UIApplicationDelegate {}\n';
const sampleStoryboard='<storyboard><viewController customClass="CAPBridgeViewController" customModule="Capacitor" customModuleProvider="target"/></storyboard>';

function write(path:string,data:string){
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);
}
test("generated Android and iOS background-call installation is repeatable and private",()=>{
 const dir=mkdtempSync(join(tmpdir(),"love-radar-native-call-"));
 try{
  const files={
   manifest:"android/app/src/main/AndroidManifest.xml",
   activity:"android/app/src/main/java/com/diaotech/loveradar/MainActivity.java",
   plist:"ios/App/App/Info.plist",
   appDelegate:"ios/App/App/AppDelegate.swift",
   storyboard:"ios/App/App/Base.lproj/Main.storyboard"
  };
  write(join(dir,files.manifest),sampleAndroid);
  write(join(dir,files.activity),sampleJava);
  write(join(dir,files.plist),samplePlist);
  write(join(dir,files.appDelegate),sampleSwift);
  write(join(dir,files.storyboard),sampleStoryboard);
  const run=()=>spawnSync(process.execPath,[configure,"all"],{cwd:dir,encoding:"utf8"});
  const first=run();
  assert.equal(first.status,0,first.stderr);
  const read=(path:string)=>readFileSync(join(dir,path),"utf8");
  const manifest=read(files.manifest);
  const plist=read(files.plist);
  const activity=read(files.activity);
  const delegate=read(files.appDelegate);
  const storyboard=read(files.storyboard);
  const nativePlugin=read("android/app/src/main/java/com/diaotech/loveradar/NativeCallPlugin.java");
  const service=read("android/app/src/main/java/com/diaotech/loveradar/NativeCallService.java");
  assert.ok(manifest.includes('android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"'));
  assert.ok(manifest.includes('android:name="android.permission.FOREGROUND_SERVICE"'));
  assert.ok(manifest.includes('android:foregroundServiceType="microphone"'));
  assert.ok(manifest.includes('android:exported="false"'));
  assert.ok(activity.includes("registerPlugin(NativeCallPlugin.class)"));
  assert.ok(activity.indexOf("registerPlugin(NativeCallPlugin.class)")<activity.indexOf("super.onCreate(savedInstanceState)"));
  assert.ok(nativePlugin.includes('@CapacitorPlugin(name = "NativeCall")'));
  assert.ok(nativePlugin.includes("getContext().startForegroundService(service)"));
  assert.ok(nativePlugin.includes("Manifest.permission.RECORD_AUDIO"));
  assert.ok(service.includes("FOREGROUND_SERVICE_TYPE_MICROPHONE"));
  assert.ok(service.includes("return START_NOT_STICKY"));
  assert.ok(service.includes("HttpURLConnection"));
  assert.ok(service.includes("notification"));
  assert.ok(!service.includes("SharedPreferences"),"Do not persist session tokens");
  assert.ok(plist.includes("<key>UIBackgroundModes</key>"));
  assert.ok(plist.includes("<string>audio</string>"));
  assert.ok(delegate.includes("AVAudioSession.sharedInstance()"));
  assert.ok(delegate.includes("mode: .voiceChat"));
  assert.ok(delegate.includes("bridge?.registerPluginInstance(LoveRadarNativeCall())"));
  assert.ok(storyboard.includes('customClass="LoveRadarBridgeViewController"'));
  assert.ok(!storyboard.includes('customClass="CAPBridgeViewController"'));
  const before=[...Object.values(files),
   "android/app/src/main/java/com/diaotech/loveradar/NativeCallPlugin.java",
   "android/app/src/main/java/com/diaotech/loveradar/NativeCallService.java"].map(read);
  const again=run();
  assert.equal(again.status,0,again.stderr);
  const after=[...Object.values(files),
   "android/app/src/main/java/com/diaotech/loveradar/NativeCallPlugin.java",
   "android/app/src/main/java/com/diaotech/loveradar/NativeCallService.java"].map(read);
  assert.deepEqual(after,before,"Generator must not duplicate or rewrite registrations");
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test("native call lifecycle does not promise background calling in a PWA",()=>{
 const app=readFileSync(join(root,"src/VoiceCall.tsx"),"utf8");
 const bridge=readFileSync(join(root,"src/native-call-session.ts"),"utf8");
 assert.ok(app.includes("beginNativeCallSession(callId,token)"));
 assert.ok(app.includes("endNativeCallSession()"));
 assert.ok(app.includes("nativeCallSessionRunning(active.id)"));
 assert.ok(app.includes('document.visibilityState==="hidden"&&!isNativeApp'));
 assert.ok(bridge.includes("if(!isNativeApp)return false"));
 assert.ok(bridge.includes('registerPlugin<CallBridge>("NativeCall")'));
 assert.ok(bridge.includes("let operations:Promise<unknown>=Promise.resolve()"),"Transitions must be serialized");
 assert.ok(bridge.includes("if(desired!==id)"));
});
