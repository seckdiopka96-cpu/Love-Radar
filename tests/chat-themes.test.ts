import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {CHAT_WALLPAPERS,CHAT_COLORS,CHAT_BUBBLES,DEFAULT_CHAT_THEME,
 validChatTheme,parseChatTheme} from "../src/chat-themes";
const read=(path:string)=>readFileSync(path,"utf8");

test("The whole app is free: no subscription price, checkout or Plus upsell",()=>{
 const app=read("src/App.tsx");
 const home=read("src/HomeDashboard.tsx");
 const settings=read("src/SettingsPage.tsx");
 const discovery=read("src/DiscoveryMode.tsx");
 const api=read("functions/api/love.ts");
 for(const source of [app,home,settings,discovery]){
  assert.ok(!source.includes("Love Radar Plus"),"no Plus marketing in any UI");
  assert.ok(!source.includes("2,99"),"no price label remains");
  assert.ok(!source.includes("3,99"),"no old price label remains");
 }
 assert.ok(!app.includes('"/api/plus"'),"no Plus client fetches");
 assert.ok(!app.includes("plusActive"),"no client-side paid flags");
 assert.ok(!api.includes("getPlus(db"),"room deletion is free of billing restrictions");
 for(const path of ["src/LoveRadarPlus.tsx","functions/api/plus.ts","functions/api/stripe-webhook.ts",
  "functions/lib/plus-plan.ts","src/love-radar-plus.css","PLUS-SETUP.md"]){
  assert.equal(existsSync(path),false,path+" should be removed");
 }
 assert.ok(!read("package.json").includes("test:plus"));
 assert.ok(!read(".github/workflows/check.yml").includes("test:plus"));
 assert.ok(discovery.includes("Démonstration indépendante"),"the guest experience remains");
});
test("Four wallpapers, four colors and three bubble styles are safe allowlists",()=>{
 assert.deepEqual([...CHAT_WALLPAPERS],["minuit","constellation","aurore","coeurs"]);
 assert.deepEqual([...CHAT_COLORS],["rose","ocean","lavande","ambre"]);
 assert.deepEqual([...CHAT_BUBBLES],["classique","douce","compacte"]);
 assert.equal(validChatTheme(DEFAULT_CHAT_THEME),true);
 assert.equal(validChatTheme({...DEFAULT_CHAT_THEME,wallpaper:"../../secret"}),false);
 assert.equal(validChatTheme({...DEFAULT_CHAT_THEME,color:"javascript:alert(1)"}),false);
 assert.equal(validChatTheme({...DEFAULT_CHAT_THEME,bubble:"fake"}),false);
 assert.equal(validChatTheme({...DEFAULT_CHAT_THEME,animated:"true"}),false);
 assert.equal(validChatTheme({}),false);
 assert.equal(parseChatTheme(null).wallpaper,"minuit");
 assert.equal(parseChatTheme({...DEFAULT_CHAT_THEME,version:3}).version,3);
 assert.equal(parseChatTheme({...DEFAULT_CHAT_THEME,version:-9}).version,0);
});
test("Theme syncing is room-scoped and independent of chat messages",()=>{
 const api=read("functions/api/chat-theme.ts");
 const app=read("src/App.tsx");
 const picker=read("src/ChatThemePicker.tsx");
 const deletion=read("functions/lib/delete-room.ts");
 const schema=read("schema.sql");
 assert.ok(api.includes("onRequestGet"));
 assert.ok(api.includes("onRequestPost"));
 assert.ok(api.includes("Authorization"));
 assert.ok(api.includes("SELECT id,room_id FROM members WHERE token_hash=?"));
 assert.ok(api.includes("await auth(request,env.DB)"));
 assert.ok(api.includes("validChatTheme(raw)"));
 assert.ok(api.includes("version=chat_themes.version+1"),"version increments atomically");
 assert.ok(api.includes("member.room_id,raw.wallpaper"),"caller cannot set another room's theme");
 assert.ok(!api.includes("body.room_id"));
 assert.ok(deletion.includes('"chat_themes"'),"deletion removes shared theme records");
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS chat_themes"),"new rooms have safe schema");
 assert.ok(app.includes('<ChatThemePicker key={room.roomId}'));
 assert.ok(app.includes('onChange={setChatTheme}'));
 assert.ok(app.includes('chatTheme.wallpaper'));
 assert.ok(app.includes('chatTheme.bubble'));
 assert.ok(picker.includes("window.setInterval(()=>{void refresh()},8000)"),"partner update poll");
 assert.ok(picker.includes('document.addEventListener("visibilitychange",wake)'));
 assert.ok(picker.includes('if(latest.version>=versionRef.current)'),"stale server results cannot overwrite new changes");
 assert.ok(picker.includes("savingRef.current"));
 assert.ok(picker.includes("onChange(previous)"),"failed update rolls back its optimistic preview");
});
test("Animated wallpapers do not interfere with voice, video or reduced-motion settings",()=>{
 const css=read("src/chat-themes.css");
 const app=read("src/App.tsx");
 const picker=read("src/ChatThemePicker.tsx");
 assert.ok(css.includes("lr-conv-stars-drift"));
 assert.ok(css.includes("lr-conv-aurora-drift"));
 assert.ok(css.includes("lr-conv-hearts-drift"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
 assert.ok(css.includes(".lr-chat .lr-chat-messages"),"themes change chat only");
 assert.ok(css.includes("bubble:not(.lr-bubble-audio)"),"audio playback remains untouched");
 assert.ok(css.includes("bubble-image"),"photo appearance remains untouched");
 assert.ok(existsSync("public/chat-wallpaper-hearts.svg"));
 assert.ok(picker.includes("Fond de discussion"));
 assert.ok(picker.includes("Couleur des bulles"));
 assert.ok(picker.includes("Forme des messages"));
 assert.ok(picker.includes("Revenir au thème original"));
 assert.ok(app.includes("showButton={tab==="),"voice call controls remain");
});
