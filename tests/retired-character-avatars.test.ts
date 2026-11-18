import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {quotePreview,readLegacyCoupleMoment} from "../src/message-quote";
const read=(p:string)=>readFileSync(p,"utf8");

test("Love Radar no longer exposes personalizable couple avatars anywhere",()=>{
 const app=read("src/App.tsx");
 const home=read("src/HomeDashboard.tsx");
 const settings=read("src/SettingsPage.tsx");
 assert.ok(!app.includes('type Tab = "avatars"'));
 assert.ok(app.includes('if(tab==="avatars")return {tab:"home",kind:null,id:null}'),
  "deep links from installed older versions safely return to Home");
 assert.ok(!app.includes("<CoupleAvatarStudio"));
 assert.ok(!app.includes("<CoupleAvatarDuo"));
 assert.ok(!app.includes("useCoupleAvatars("));
 assert.ok(!home.includes("lr-avatar-home-entry"));
 assert.ok(!home.includes("onNavigate(\"avatars\")"));
 assert.ok(!settings.includes("onOpenAvatars"));
 assert.ok(!settings.includes("Nos avatars amoureux"));
 assert.ok(!app.includes("sendAvatarSticker"));
 assert.ok(!app.includes("navigate(\"avatars\")"));
 assert.ok(!app.includes('lr-bubble-avatar'));
});

test("profile photos, messaging, calls and Ludo remain available",()=>{
 const app=read("src/App.tsx");
 const home=read("src/HomeDashboard.tsx");
 const settings=read("src/SettingsPage.tsx");
 assert.ok(app.includes("useProfileAvatars("));
 assert.ok(app.includes("myAvatar={avatars.mine} partnerAvatar={avatars.partner}"),
  "Ludo players retain real profile pictures");
 assert.ok(app.includes("<VoiceCall"));
 assert.ok(app.includes('tab==="chat"'));
 assert.ok(home.includes('aria-label="Modifier ma photo de profil"'));
 assert.ok(settings.includes("Photo de profil"));
 assert.ok(app.includes('<StickerArt'));
 assert.ok(app.includes('<GifMessage'));
 assert.ok(!app.includes("from \"./couple-avatar-model\""));
});

test("old encrypted avatar tokens display a neutral text history, never old artwork",()=>{
 for(const pose of ["main","calin","bisou","danse"]){
  const old="[couple-avatar:v1:"+pose+"]";
  assert.equal(readLegacyCoupleMoment(old),true);
  assert.equal(quotePreview("text",old),"💌 Ancien moment partagé");
 }
 assert.equal(readLegacyCoupleMoment("[couple-avatar:v1:unknown]"),false);
 assert.equal(readLegacyCoupleMoment("[couple-avatar:v1:main]<script>"),false);
 assert.equal(readLegacyCoupleMoment(null),false);
 const app=read("src/App.tsx");
 assert.ok(app.includes("<p>💌 Ancien moment partagé</p>"));
});

test("retired avatar studio, model storage endpoints and rendering modules are gone",()=>{
 const removed=[
  "src/CoupleAvatarStudio.tsx","src/CoupleAvatarDuo.tsx",
  "src/Avatar3DScene.tsx","src/Avaturn3DEditor.tsx",
  "src/Avatar3DQuickEditor.tsx","src/use-couple-avatars.ts",
  "src/couple-avatar-model.ts","functions/api/couple-avatars.ts",
  "functions/api/couple-avatar-model.ts"
 ];
 for(const path of removed)assert.equal(existsSync(path),false,path+" should not ship");
});
