#!/usr/bin/env node
// Prepare a freshly generated Capacitor iPhone project for Apple TestFlight.
// All signing secrets stay in GitHub Actions secrets, never in the repo.
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";

export const BUNDLE_ID="com.diaotech.loveradar";
export const DEFAULT_PROFILE="AppStore "+BUNDLE_ID;
function check(value,regex,label){
 if(!regex.test(value))throw Error("Invalid "+label);
 return value;
}
export function exportOptions(teamId,profileName=DEFAULT_PROFILE){
 const team=check(teamId,/^[A-Z0-9]{10}$/,"Apple Team ID");
 const profile=check(profileName,/^[A-Za-z0-9_. -]{1,100}$/,"provisioning profile name");
 return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>teamID</key><string>${team}</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>provisioningProfiles</key>
  <dict><key>${BUNDLE_ID}</key><string>${profile}</string></dict>
</dict>
</plist>
`;
}
function run(program,args){
 const p=spawnSync(program,args,{encoding:"utf8"});
 if(p.error||p.status!==0)throw Error(program+" failed: "+(p.stderr||p.error||"exit code "+p.status));
}
export function prepare({root=process.cwd(),teamId,profileName=DEFAULT_PROFILE,dryRun=false}){
 const config=readFileSync(join(root,"capacitor.config.ts"),"utf8");
 if(!config.includes('appId:"'+BUNDLE_ID+'"'))throw Error("Capacitor bundle ID does not match "+BUNDLE_ID);
 const plist=exportOptions(teamId,profileName);
 if(dryRun)return {bundleId:BUNDLE_ID,profileName,exportPath:null};
 const ios=join(root,"ios/App/App");
 if(!existsSync(join(ios,"AppDelegate.swift")))throw Error("Generate iOS with npx cap add ios first.");
 const assets=join(ios,"Assets.xcassets","AppIcon.appiconset");
 const icon=join(root,"public","icons","icon-512.png");
 if(!existsSync(icon))throw Error("Love Radar source icon is missing.");
 mkdirSync(assets,{recursive:true});
 // App Store icons must be opaque. Flatten to JPEG, then convert back to
 // 1024x1024 PNG, retaining the existing Love Radar PWA artwork.
 const flattened=join(tmpdir(),"loveradar-icon-"+process.pid+".jpg");
 try{
  run("sips",["-s","format","jpeg","-s","formatOptions","best",icon,"--out",flattened]);
  run("sips",["-s","format","png","-z","1024","1024",flattened,"--out",join(assets,"AppIcon-1024.png")]);
 }finally{rmSync(flattened,{force:true})}
 writeFileSync(join(assets,"Contents.json"),JSON.stringify({
  images:[{filename:"AppIcon-1024.png",idiom:"universal",platform:"ios",size:"1024x1024"}],
  info:{author:"xcode",version:1}
 },null,2)+"\n");
 const exportPath=join(root,"ios/App/ExportOptions-TestFlight.plist");
 writeFileSync(exportPath,plist);
 console.log("Love Radar native iOS prepared:",BUNDLE_ID,"| App icon 1024px | manual distribution profile");
 return {bundleId:BUNDLE_ID,profileName,exportPath};
}
const direct=process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname);
if(direct){
 const result=prepare({
  teamId:process.env.APPSTORE_TEAM_ID||"",
  profileName:process.env.APPSTORE_PROFILE_NAME||DEFAULT_PROFILE,
  dryRun:process.argv.includes("--dry-run")
 });
 console.log(result);
}
