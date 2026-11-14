import type {CapacitorConfig} from "@capacitor/cli";

/**
 * Production keeps its own bundled Vite UI. No server.url:
 * Cloudflare hosts only the authenticated HTTPS API and web/PWA version.
 */
const config:CapacitorConfig={
 appId:"com.diaotech.loveradar",
 appName:"Love Radar",
 webDir:"dist",
 loggingBehavior:"none",
 backgroundColor:"#251526",
 server:{
  hostname:"localhost",
  iosScheme:"capacitor",
  androidScheme:"https",
  cleartext:false
 },
 android:{
  backgroundColor:"#251526",
  allowMixedContent:false
 },
 ios:{
  backgroundColor:"#251526",
  webContentsDebuggingEnabled:false
 }
};
export default config;
