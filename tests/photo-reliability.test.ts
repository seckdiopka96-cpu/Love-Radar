import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const photo=readFileSync("src/PrivatePhoto.tsx","utf8");
const css=readFileSync("src/photo-reliability.css","utf8");
const media=readFileSync("functions/api/media.ts","utf8");

test("chat photos are given fixed usable width instead of a collapsed thin strip",()=>{
 assert.ok(app.includes('m.kind==="image"?" lr-bubble-image"'));
 assert.ok(app.includes('m.kind==="image"?" lr-image-stack"'));
 assert.ok(css.includes(".lr-bubble-stack.lr-image-stack"));
 assert.ok(css.includes("width:min(280px,78vw)!important"));
 assert.ok(css.includes(".lr-bubble.lr-bubble-image"));
 assert.ok(css.includes(".lr-private-photo-chat.is-concealed"));
 assert.ok(css.includes(".lr-private-photo-reveal"));
 assert.ok(css.includes("display:flex!important"));
});
test("media errors never leave indefinitely blank images",()=>{
 assert.ok(app.includes("const [mediaErrors,setMediaErrors]"));
 assert.ok(app.includes("function retryMedia(item:Message)"));
 assert.ok(app.includes('role="status"'));
 assert.ok(app.includes('mediaErrors[m.id]||"Chargement de la photo…"'));
 assert.ok(app.includes('onClick={()=>retryMedia(m)}'));
 assert.ok(app.includes("mediaRetries.current[id]"));
 assert.ok(app.includes("Math.min(30000,2500*2**"));
 assert.ok(app.includes('cache:"no-store"'));
 assert.ok(css.includes(".lr-photo-loading"));
 assert.ok(css.includes(".lr-photo-loading button"));
});
test("invalid images are rejected rather than marked successfully fetched",()=>{
 assert.ok(app.includes('!mime.startsWith("image/")'));
 assert.ok(app.includes("const image=new Image();image.src=url"));
 assert.ok(app.includes("await image.decode()"));
 assert.ok(app.includes("URL.revokeObjectURL(url)"));
 assert.ok(photo.includes("onImageError?:()=>void"));
 assert.ok(photo.includes("onError={onImageError}"));
 assert.ok(app.includes("onImageError={()=>retryMedia(m)}"));
 assert.ok(media.includes("FROM messages m LEFT JOIN message_one_time"));
 assert.ok(media.includes('"Content-Type":record.mime'));
});

test("view once pictures are not prefetched, archived, or revealed by notification previews",()=>{
 const home=readFileSync("src/HomeDashboard.tsx","utf8");
 const viewer=readFileSync("src/OneTimeMedia.tsx","utf8");
 assert.ok(app.includes("if(!token||!item.object_key||item.view_once)return"));
 assert.ok(app.includes("if(!m||!m.object_key||m.view_once)return"));
 assert.ok(app.includes('m.kind==="image"&&!m.view_once'));
 assert.ok(home.includes('m.kind==="image"&&!m.view_once'));
 assert.ok(app.includes('<OneTimeMedia key={onceTarget.id}'));
 assert.ok(viewer.includes('res.status===410'));
 assert.ok(viewer.includes('URL.revokeObjectURL(blobUrl)'));
 assert.ok(viewer.includes('visibilitychange'));
 assert.ok(media.includes('UPDATE message_one_time SET opened_at=?'));
 assert.ok(media.includes('if(!claimed.meta.changes)'));
 assert.ok(media.includes('message_hidden h'));
});
