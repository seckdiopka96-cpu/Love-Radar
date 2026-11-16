import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mediaRetryDelay,relayNeedsRefresh,RELAY_REFRESH_AFTER_MS,RELAY_RETRY_AFTER_ERROR_MS,MEDIA_AUTO_RETRY_LIMIT} from "../src/reliability-rules";

const app=readFileSync("src/App.tsx","utf8");
const calls=readFileSync("src/VoiceCall.tsx","utf8");
const media=readFileSync("functions/api/media.ts","utf8");
const server=readFileSync("functions/api/love.ts","utf8");

test("relay credentials are refreshed before they expire instead of being cached forever",()=>{
 const now=1731000000000;
 assert.equal(RELAY_REFRESH_AFTER_MS,45*60*1000);
 assert.equal(RELAY_RETRY_AFTER_ERROR_MS,60*1000);
 assert.equal(relayNeedsRefresh(0,now),true);
 assert.equal(relayNeedsRefresh(now,now),false);
 assert.equal(relayNeedsRefresh(now,now+RELAY_REFRESH_AFTER_MS-1),false);
 assert.equal(relayNeedsRefresh(now,now+RELAY_REFRESH_AFTER_MS),true);
 assert.equal(relayNeedsRefresh(now,now+RELAY_RETRY_AFTER_ERROR_MS,RELAY_RETRY_AFTER_ERROR_MS),true);
 assert.equal(relayNeedsRefresh(now,now-1),true);
 assert.ok(calls.includes("relayNeedsRefresh(networkWarmedAt.current,Date.now(),networkMaxAge.current)"));
 assert.ok(calls.includes("networkMaxAge.current=data.relay?RELAY_REFRESH_AFTER_MS:RELAY_RETRY_AFTER_ERROR_MS"));
 assert.ok(calls.includes("await networkTask;"));
});

test("media failures use finite backoff and do not retry permanently",()=>{
 assert.equal(MEDIA_AUTO_RETRY_LIMIT,4);
 assert.deepEqual([1,2,3,4,5].map(mediaRetryDelay),[2500,5000,10000,20000,null]);
 assert.equal(mediaRetryDelay(0),null);
 assert.equal(mediaRetryDelay(-1),null);
 assert.equal(mediaRetryDelay(1.5),null);
 assert.ok(app.includes("const delay=mediaRetryDelay(attempts);"));
 assert.ok(app.includes('if(document.visibilityState==="visible")void fetchMedia(item,true);'));
 assert.ok(app.includes('window.addEventListener("online",resumeMedia)'));
 assert.ok(app.includes("controller.abort(),12000"));
 assert.ok(app.includes("window.clearTimeout(timeout)"));
 assert.ok(app.includes('onClick={()=>retryMedia(m)}'),"Manual retries remain available");
 assert.ok(media.includes('WHERE m.room_id=?'),"Media remains room-scoped");
});

test("chat and call discovery cannot hang forever on a stalled mobile connection",()=>{
 assert.ok(app.includes("controller.abort(),15000"),"POST requests have a timeout");
 assert.ok(app.includes("controller.abort(),12000"),"Full chat snapshots have a timeout");
 assert.ok(app.includes("controller?.abort(),6500"),"Presence polling has a timeout");
 assert.ok(app.includes('if(snapshotInFlight.current===t)snapshotInFlight.current=""'),"Snapshot slot is released");
 assert.ok(calls.includes("controller.abort(),8000"),"WebRTC signaling fetch timeout");
 assert.ok(calls.includes("controller.abort(),5000"),"TURN discovery timeout");
 assert.ok(calls.includes('current.current?420:1800'),"Lower idle call polling load");
 assert.ok(server.includes("roomRevision(session.db,session.user.room_id)"),"Chat events remain isolated per room");
});
