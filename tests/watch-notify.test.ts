import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const yt=readFileSync("functions/api/watch-together.ts","utf8");
const tk=readFileSync("functions/api/tiktok-together.ts","utf8");
const push=readFileSync("functions/lib/push.ts","utf8");
const sw=readFileSync("public/sw.js","utf8");
const app=readFileSync("src/App.tsx","utf8");
const together=readFileSync("src/Together.tsx","utf8");

test("YouTube play starts one server-side partner invitation on paused to playing transition",()=>{
 assert.match(yt,/const wasPaused=current\.playing===0;/);
 assert.match(yt,/if\(data\.action==="play"&&playing===1&&wasPaused\)/);
 assert.match(yt,/ctx\.waitUntil\(notifyPartner\(ctx\.env,user\.room_id,user\.id,/);
 assert.match(yt,/"watch"\)\)/);
 assert.ok(yt.includes("current=await session(db,user.room_id);"));
});
test("TikTok play notifies the other room member, not every poll, pause or remote sync",()=>{
 assert.match(tk,/const wasPaused=current\.playing===0;/);
 assert.match(tk,/if\(data\.action==="play"&&playing===1&&wasPaused\)/);
 assert.match(tk,/ctx\.waitUntil\(notifyPartner\(ctx\.env,user\.room_id,user\.id,/);
 assert.match(tk,/"watch-tiktok"\)\)/);
});
test("notification deep links open the exact Youtube or TikTok watch room",()=>{
 assert.match(push,/type Tab=[^;]*"watch"\|"watch-tiktok"/);
 assert.match(sw,/SUPPORTED_TABS[^;]*"watch","watch-tiktok"/);
 assert.ok(app.includes('tab==="watch"')&&app.includes('tab==="watch-tiktok"'));
 assert.ok(app.includes('data.tab==="watch"||data.tab==="watch-tiktok"'));
 assert.ok(app.includes('onClick={()=>navigate(watchInvite)}'));
});
test("Together has one prominent watch entry and compact separate shortcuts",()=>{
 assert.ok(together.includes('className="tg-watch-feature" onClick={onOpenWatch}'));
 assert.equal((together.match(/className="tg-watch-link"/g)||[]).length,0);
 assert.ok(together.includes('className="tg-moment-link"'));
 assert.ok(together.includes('className="tg-reunion-link"'));
 assert.ok(together.includes('className="tg-puzzle-open"'));
 assert.ok(!together.includes('className="tg-location-link"'));
 assert.ok(!together.includes("Dessiner ensemble"));
 assert.ok(together.includes("tg-feed-empty"));
});
