#!/usr/bin/env node
// Set a Google Play version in a freshly generated Capacitor Android project.
import {readFileSync,writeFileSync} from "node:fs";

const path="android/app/build.gradle";
const code=Number(process.env.ANDROID_VERSION_CODE??"1");
const name=process.env.ANDROID_VERSION_NAME??"1.0.0";
if(!Number.isSafeInteger(code)||code<1||code>2100000000)
 throw Error("versionCode must be between 1 and 2100000000.");
if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(name))
 throw Error("Invalid versionName.");
const variables=readFileSync("android/variables.gradle","utf8");
const target=Number(variables.match(/\btargetSdkVersion\s*=\s*(\d+)/)?.[1]);
if(!Number.isInteger(target)||target<36)
 throw Error("Google Play requires Android target API 36 or later.");
let gradle=readFileSync(path,"utf8");
if(!/applicationId\s+["']com\.diaotech\.loveradar["']/.test(gradle))
 throw Error("Unexpected applicationId (expected com.diaotech.loveradar).");
if([...gradle.matchAll(/\bversionCode\s+\d+/g)].length!==1 ||
   [...gradle.matchAll(/\bversionName\s+["'][^"']+["']/g)].length!==1)
 throw Error("Unrecognized Android version settings.");
gradle=gradle.replace(/\bversionCode\s+\d+/,"versionCode "+code)
 .replace(/\bversionName\s+["'][^"']+["']/,'versionName "'+name+'"');
writeFileSync(path,gradle);
console.log("Android "+name+" ("+code+"), target API "+target);
