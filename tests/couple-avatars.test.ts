import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {SKINS,HAIRS,HAIR_COLORS,OUTFITS,ACCESSORIES,COUPLE_POSES,POSE_LABEL,
 DEFAULT_AVATAR,validAvatarStyle,validCouplePose,avatarMessage,readAvatarMessage,safeCoupleAvatarState}
 from "../src/couple-avatar-model";
const read=(file:string)=>readFileSync(file,"utf8");

test("avatar presets include six skin tones, six haircuts, five hair colors, five outfits and four accessories",()=>{
 assert.equal(SKINS.length,6);assert.equal(HAIRS.length,6);
 assert.equal(HAIR_COLORS.length,5);assert.equal(OUTFITS.length,5);assert.equal(ACCESSORIES.length,4);
 assert.deepEqual([...COUPLE_POSES],["main","calin","bisou","danse"]);
 assert.ok(COUPLE_POSES.every(pose=>Boolean(POSE_LABEL[pose])));
 assert.equal(validAvatarStyle(DEFAULT_AVATAR),true);
 assert.equal(validAvatarStyle({...DEFAULT_AVATAR,skin:"<script>"}),false);
 assert.equal(validAvatarStyle({...DEFAULT_AVATAR,hair:"../../../secret"}),false);
 assert.equal(validAvatarStyle({...DEFAULT_AVATAR,outfit:"red; background:url(evil)"}),false);
 assert.equal(validAvatarStyle(null),false);
 assert.equal(validCouplePose("hug"),false);
 assert.equal(validCouplePose("bisou"),true);
});
test("avatar sticker tokens have an exact, safe format and do not contain arbitrary markup",()=>{
 for(const pose of COUPLE_POSES){
  const token=avatarMessage(pose);
  assert.equal(readAvatarMessage(token),pose);
  assert.equal(token,"[couple-avatar:v1:"+pose+"]");
 }
 assert.equal(readAvatarMessage("[couple-avatar:v1:unknown]"),null);
 assert.equal(readAvatarMessage("[couple-avatar:v1:main]<script>"),null);
 assert.equal(readAvatarMessage("[sticker:v1:hug]"),null);
 assert.equal(readAvatarMessage(null),null);
 assert.throws(()=>avatarMessage("evil" as never));
 assert.deepEqual(safeCoupleAvatarState(null),{mine:null,partner:null,pose:"main",version:0});
 assert.equal(safeCoupleAvatarState({mine:{},partner:{},pose:"hacker",version:-1}).pose,"main");
});
test("only authenticated partners may save their own avatar and update the room pose",()=>{
 const api=read("functions/api/couple-avatars.ts");
 assert.ok(api.includes("onRequestGet"));
 assert.ok(api.includes("onRequestPost"));
 assert.ok(api.includes("SELECT id,room_id FROM members WHERE token_hash=?"));
 assert.ok(api.includes("await authorize(request,env.DB)"));
 assert.ok(api.includes("validAvatarStyle(input.style)"));
 assert.ok(api.includes("validCouplePose(input.pose)"));
 assert.ok(api.includes("member.room_id,member.id,saved.skin"));
 assert.ok(api.includes("version=couple_avatar_rooms.version+1"));
 assert.ok(!api.includes("input.memberId"));
 assert.ok(!api.includes("input.roomId"));
 assert.ok(!api.includes("input.member_id"));
 assert.ok(api.includes("private, no-store"));
 assert.ok(api.includes("body.length>400"));
});
test("avatars are rendered on home and in chat, and pose stickers use encrypted text outbox",()=>{
 const app=read("src/App.tsx"),home=read("src/HomeDashboard.tsx");
 const studio=read("src/CoupleAvatarStudio.tsx");
 const art=read("src/CoupleAvatarDuo.tsx");
 const messages=read("src/message-quote.ts");
 assert.ok(app.includes('type Tab = "avatars"'));
 assert.ok(app.includes('tab==="avatars"?<CoupleAvatarStudio'));
 assert.ok(app.includes('useCoupleAvatars(token,room?.roomId)'));
 assert.ok(home.includes("lr-avatar-home-entry"));
 assert.ok(home.includes('onNavigate("avatars")'));
 assert.ok(app.includes("readAvatarMessage(m.content)"));
 assert.ok(app.includes("sendAvatarSticker(pose)"));
 assert.ok(app.includes("void sendQueuedText(entry)"));
 assert.ok(app.includes("async function encryptedOutgoing"));
 assert.ok(studio.includes("onSaveStyle(draft)"));
 assert.ok(studio.includes("onSavePose(value)"));
 assert.ok(studio.includes("onSend(posePreview)"));
 assert.ok(studio.includes("Cré"));
 assert.ok(art.includes("AvatarCharacter"));
 assert.ok(messages.includes("readAvatarMessage(content)"));
 assert.ok(read("functions/api/love.ts").includes("isAvatarToken"));
});
test("native and PWA animations are motion-aware with no outside media required",()=>{
 const css=read("src/couple-avatars.css");
 const art=read("src/CoupleAvatarDuo.tsx");
 const studio=read("src/CoupleAvatarStudio.tsx");
 assert.ok(css.includes("lr-avatar-hug-left"));
 assert.ok(css.includes("lr-avatar-kiss-right"));
 assert.ok(css.includes("lr-avatar-dance-left"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
 assert.ok(studio.includes("100 % GRATUIT"));
 assert.ok(!studio.includes("$"));
 assert.ok(!art.includes("<img"));
 assert.ok(!art.includes("https://"));
});
test("room erasure deletes avatar styles and shared pose together with the rest of the couple data",()=>{
 const deletion=read("functions/lib/delete-room.ts");
 const schema=read("schema.sql");
 assert.ok(deletion.includes('"couple_avatar_styles"'));
 assert.ok(deletion.includes('"couple_avatar_rooms"'));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS couple_avatar_styles"));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS couple_avatar_rooms"));
 assert.ok(read("src/use-couple-avatars.ts").includes("document.addEventListener"));
 assert.ok(existsSync("src/CoupleAvatarStudio.tsx"));
});

test("premium avatars use full illustrated selectors instead of emoji placeholders",()=>{
 const studio=read("src/CoupleAvatarStudio.tsx");
 const vector=read("src/CoupleAvatarDuo.tsx");
 const css=read("src/couple-avatars.css");
 assert.ok(studio.includes('AvatarCharacter style={preview}'),"each option previews the actual selected hairstyle, outfit and accessory");
 assert.ok(studio.includes('portrait={category!=="outfit"}'),"outfits show the whole silhouette");
 assert.ok(vector.includes("useId()"),"SVG gradients have unique IDs across both partners and all previews");
 assert.ok(vector.includes("linearGradient"),"characters include lighting and shaded skin, hair and clothes");
 assert.ok(!studio.includes('option.id==="hijab"?"🧕"'),"no generic emoji masquerades as hair styles");
 assert.ok(!vector.includes('pose==="bisou"?"💋"'),"no floating lip emoji pasted on the face");
 assert.ok(css.includes("lr-avatar-duo-mine")&&css.includes("lr-avatar-duo-partner"));
 assert.ok(css.includes("Reserved head distance is larger than the face diameter"),"two portraits remain individually visible");
 assert.ok(css.includes("lr-avatar-studio-options"),"responsive gallery exists");
});
test("iPhone avatar page gets its own full-screen scroller without an overlaying bottom dock",()=>{
 const app=read("src/App.tsx");
 const css=read("src/couple-avatars.css");
 const dock=read("src/premium-dock.css");
 const shell=read("src/polished-shell.css");
 assert.ok(app.includes('tab==="avatars"&&room?"lr-avatar-mode ":""'));
 assert.ok(css.includes(".lr-app.lr-app-locked.lr-avatar-mode .lr-mobile-nav{display:none!important}"));
 assert.ok(css.includes(".lr-app.lr-app-locked.lr-avatar-mode > .lr-header{display:none!important}"));
 assert.ok(css.includes("env(safe-area-inset-top)"));
 assert.ok(css.includes("env(safe-area-inset-bottom)"));
 assert.ok(dock.includes(":not(.lr-avatar-mode)"));
 assert.ok(shell.includes(":not(.lr-avatar-mode)"));
});
test("a brand-new partner can save their default avatar and preview remains scoped to their own style",()=>{
 const studio=read("src/CoupleAvatarStudio.tsx");
 assert.ok(studio.includes('!data.mine?"Créer mon avatar"'));
 assert.ok(studio.includes("Boolean(data.mine)"));
 assert.ok(studio.includes("partner={data.partner||DEFAULT_PARTNER_AVATAR}"));
 assert.ok(studio.includes("await onSaveStyle(draft)"));
});
