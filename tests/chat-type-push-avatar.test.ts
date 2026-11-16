import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/chat-readable-type.css","utf8");
const photos=readFileSync("src/use-profile-avatars.ts","utf8");
const worker=readFileSync("public/sw.js","utf8");
const push=readFileSync("functions/lib/push.ts","utf8");

test("WhatsApp-sized chat text is 18px, readable and never changes colors or voice bubbles",()=>{
 assert.ok(app.includes('import "./chat-readable-type.css"'));
 assert.ok(css.includes("font-size:18px!important"),"mobile message font becomes 18px");
 assert.ok(css.includes("font-size:12px!important"),"time labels become readable");
 assert.ok(css.includes("lr-bubble-sticker"),"animated stickers stay unaffected");
 assert.ok(css.includes("lr-bubble-audio"),"audio controls stay unaffected");
 assert.ok(css.includes("lr-bubble-gif"),"GIF controls stay unaffected");
 assert.ok(css.includes("overflow-wrap:anywhere"),"long text wraps");
 assert.ok(!css.includes("background:linear-gradient(145deg,#bc547c"),"do not modify outgoing bubble color");
 assert.ok(css.includes(".lr-chat .lr-chat-head h2"),"name scales with message body");
});

test("Private partner avatar is resized locally and never exposes a public profile URL",()=>{
 assert.ok(photos.includes("createImageBitmap(blob)"));
 assert.ok(photos.includes('canvas.toDataURL("image/jpeg",.68)'));
 assert.ok(photos.includes("canvas.width=72"));
 assert.ok(photos.includes('type:"love-radar-avatar-icon"'));
 assert.ok(photos.includes('if(slot==="partner")void pushAvatarIcon(blob,member)'));
 assert.ok(photos.includes('type:"love-radar-avatar-clear"'));
 assert.ok(!photos.includes("https://storage"),"no public buckets");
 assert.ok(worker.includes('PRIVATE_AVATAR_CACHE="love-radar-private-notification-avatar-v1"'));
 assert.ok(worker.includes("/__lr_private_push_avatar__/"));
 assert.ok(worker.includes("const avatarIcon=await notificationAvatar(payload.senderId)"));
 assert.ok(worker.includes('body,icon:avatarIcon,badge:"/icons/icon-192.png"'));
 assert.ok(worker.includes('return "/icons/icon-192.png"'),"system icon fallback");
 assert.ok(worker.includes("data:image"),"private local image data supported");
 assert.ok(worker.includes("love-radar-avatar-clear"),"cache cleared on logout/change");
 assert.ok(!push.includes("iconData"),"never embed personal photo in remote push payload");
});

test("Push identifies partner without changing test, games or other alerts",()=>{
 assert.ok(push.includes("SELECT name FROM members WHERE room_id=? AND id=? LIMIT 1"));
 assert.ok(push.includes('privateChat?fromId:undefined'),"only real chat sends partner id");
 assert.ok(push.includes('privateChat=tab==="chat"'),"not for tests or games");
 assert.ok(push.includes("notificationTitle=String(sender?.name"));
 assert.ok(push.includes('notificationBody=target!.kind==="photo"'));
 assert.ok(push.includes('target!.kind==="audio"'));
 assert.ok(app.includes('className={"lr-toast"+(notice.startsWith("lr-partner-push:")'));
 assert.ok(app.includes("avatars.partner?<img src={avatars.partner}"));
 assert.ok(app.includes("navigate(\"chat\")"),"in-app toast opens chat");
});
