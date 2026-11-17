import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/clean-home-chat.css","utf8");
const home=readFileSync("src/HomeDashboard.tsx","utf8");

test("minimal design is scoped to home and chat and loaded after older legacy styling",()=>{
 const importTheme=app.indexOf('import "./clean-home-chat.css";');
 assert.ok(importTheme>app.indexOf('import "./premium-design-polish.css";'));
 assert.ok(importTheme>app.indexOf('import "./message-context-premium.css";'));
 assert.ok(app.includes('tab==="home"&&room?"lr-home-mode ":""'));
 assert.ok(app.includes('tab==="chat"&&room?"lr-chat-mode ":""'));
 assert.ok(css.includes('.lr-app.lr-app-locked.lr-home-mode'));
 assert.ok(css.includes('.lr-app.lr-app-locked.lr-chat-mode'));
 assert.ok(!css.includes('display:none!important' + '\n.lr-call-'),"no active call control hidden");
});
test("home cards have a consistent flat color, text scale and no decorative border",()=>{
 assert.ok(home.includes('className="lr-home-couple"'));
 assert.ok(home.includes('className="lr-home-quick"'));
 assert.ok(home.includes('className="lr-home-essentials"'));
 assert.ok(css.includes('background:var(--lr-clean-surface)!important'));
 assert.ok(css.includes('border:none!important;border-radius:17px!important'));
 assert.ok(css.includes('.lr-home-compact .lr-home-welcome h2'));
 assert.ok(css.includes('.lr-home-essentials .lr-home-daily-content strong'));
 assert.ok(css.includes('.lr-home-compact .lr-home-quick-icon svg'));
 assert.ok(css.includes('.lr-home-compact .lr-home-made-by'));
 assert.ok(css.includes('font-family:inherit!important'));
});
test("chat has flat bubbles, unboxed dates, quiet call history and retains all controls",()=>{
 assert.ok(css.includes('.lr-chat .lr-chat-day'));
 assert.ok(css.includes('background:transparent!important;border:0!important'));
 assert.ok(css.includes('.lr-bubble-row.mine .lr-bubble:not('));
 assert.ok(css.includes('background:#d77398!important;color:#fff!important'));
 assert.ok(css.includes('.lr-bubble-row.other .lr-bubble:not('));
 assert.ok(css.includes('background:#21394a!important'));
 assert.ok(css.includes('.lr-call-chat-row.mine .lr-call-chat-card'));
 assert.ok(css.includes('.lr-chat-form > .lr-chat-textbox'));
 assert.ok(css.includes('.lr-chat-form > .lr-attach'));
 assert.ok(css.includes('.lr-chat-form > .lr-mic'));
 assert.ok(css.includes('.lr-chat-form > .lr-send'));
 assert.ok(css.includes('.lr-chat .lr-message-delivery-state.is-read'));
 assert.ok(app.includes('className="lr-chat-messages"'));
 assert.ok(app.includes('onPointerDown={e=>messagePointerDown(e,m)}'));
 assert.ok(app.includes('onPointerMove={messagePointerMove}'));
 assert.ok(app.includes('<VoiceCall key={room.roomId+room.user.id}'));
});
test("timeline shows a new date only once when a call precedes the next message",()=>{
 assert.ok(app.includes('const newDay=!preceding||new Date(preceding.createdAt).toDateString()!==day;'));
 assert.ok(!app.includes('const newDay=!previous||new Date(previous.created_at).toDateString()!==day;'));
 assert.ok(app.includes('const groupedBefore=previous&&!newDay'));
 assert.ok(app.includes('const showCallDay=!preceding||new Date(preceding.createdAt).toDateString()!==callDay'));
});
