import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";

test("PWA refreshes its offline shell and always validates Cloudflare Pages HTML",()=>{
 const worker=readFileSync("public/sw.js","utf8");
 const headers=readFileSync("public/_headers","utf8");
 assert.match(worker,/const CACHE="love-radar-static-v118";/);
 assert.match(worker,/key\.startsWith\("love-radar-static-"\)/);
 assert.match(worker,/cache\.put\("\/",response\.clone\(\)\)/);
 assert.match(worker,/event\.respondWith\(fetch\(request\)\.then/);
 assert.match(worker,/url\.pathname\.startsWith\("\/api\/"\)/);
 assert.match(headers,/\/sw\.js\s+Cache-Control: no-cache, no-store, must-revalidate/);
 assert.match(headers,/\/index\.html\s+Cache-Control: no-cache, max-age=0, must-revalidate/);
});

test("the favorites UI, API and tests are absent while existing chat remains available",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(!app.includes("ChatFavorites"));
 assert.ok(!app.includes("favoriteMessages"));
 assert.ok(!app.includes("lr-chat-archive-tools"));
 assert.ok(!app.includes("Ajouter aux favoris"));
 assert.ok(!deletion.includes('"message_favorites"'));
 for(const path of ["functions/api/favorites.ts","src/ChatFavorites.tsx","src/chat-favorites.css"]){
  assert.equal(existsSync(path),false,"removed feature must not ship: "+path);
 }
 assert.ok(app.includes('tab==="chat"'));
 assert.ok(app.includes("VoiceMessage"));
 assert.ok(app.includes("CoupleExperiences"));
});
