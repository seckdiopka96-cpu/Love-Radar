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
 assert.ok(media.includes("SELECT object_key,mime FROM messages WHERE room_id=?"));
 assert.ok(media.includes('"Content-Type":record.mime'));
});
