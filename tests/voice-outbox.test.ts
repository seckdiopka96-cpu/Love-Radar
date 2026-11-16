import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mergeOptimisticMessages,shouldKeepVoiceDraft} from "../src/voice-outbox";

type Row={id:string;created_at:number;source:"server"|"local"};
test("outgoing audio appears immediately while the server has no matching message",()=>{
 const now=Date.now();
 const old:Row={id:"old",created_at:now-10000,source:"server"};
 const local:Row={id:"voice",created_at:now,source:"local"};
 assert.deepEqual(mergeOptimisticMessages([old],[local]),[old,local]);
 assert.equal(shouldKeepVoiceDraft("uploading",false),true);
 assert.equal(shouldKeepVoiceDraft("failed",false),true);
});
test("server acknowledgement never duplicates or hides the original voice bubble",()=>{
 const now=Date.now(),local:Row={id:"same",created_at:now,source:"local"};
 const server:Row={id:"same",created_at:now+70,source:"server"};
 const result=mergeOptimisticMessages([server],[local]);
 assert.equal(result.length,1);
 assert.equal(result[0].source,"server");
 assert.equal(shouldKeepVoiceDraft("sent",false),true,"do not remove before server snapshot");
 assert.equal(shouldKeepVoiceDraft("sent",true),false);
 assert.equal(shouldKeepVoiceDraft("failed",true),true);
});
test("local messages remain sorted with live partner replies",()=>{
 const base=1700000000000;
 const result=mergeOptimisticMessages<Row>(
  [{id:"other",created_at:base+10,source:"server"},{id:"new",created_at:base+100,source:"server"}],
  [{id:"local",created_at:base+40,source:"local"}]
 );
 assert.deepEqual(result.map(v=>v.id),["other","local","new"]);
});
test("upload is asynchronous with immediate playable local blob and safe retry",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const api=readFileSync("functions/api/media.ts","utf8");
 const css=readFileSync("src/voice-message.css","utf8");
 assert.ok(app.includes("const url=URL.createObjectURL(file)"));
 assert.ok(app.includes("setVoiceOutbox(prev=>[...prev,entry])"));
 assert.ok(app.includes("void sendQueuedVoice(entry)"));
 assert.ok(app.includes('form.append("messageId",entry.id)'));
 assert.ok(app.includes('enqueueVoice(new File([blob]'));
 assert.ok(app.includes('tab==="chat"?850:4500'));
 assert.ok(app.includes('onClick={()=>{const entry=voiceOutbox.find(v=>v.id===m.id);if(entry)void sendQueuedVoice(entry)}'));
 assert.ok(api.includes('form.get("messageId")'));
 assert.ok(api.includes('INSERT OR IGNORE INTO messages'));
 assert.ok(api.includes('duplicate:true'));
 assert.ok(api.includes('new Response(asset.body'));
 assert.ok(css.includes(".lr-audio-send-state.failed"));
});

test("voice notes always use the standard playable delivery, without temporary mode",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const api=readFileSync("functions/api/media.ts","utf8");
 assert.ok(app.includes("const url=URL.createObjectURL(file)"));
 assert.ok(!app.includes('form.append("viewOnce"'));
 assert.ok(!app.includes('lr-view-once-toggle'));
 assert.ok(api.includes('form.get("viewOnce")==="true"'));
 assert.ok(!api.includes('INSERT INTO message_one_time(room_id,message_id,opened_at)'));
});
