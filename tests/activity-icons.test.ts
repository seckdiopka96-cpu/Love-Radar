import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ChatActivity from "../src/ChatActivity";

const app=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/chat-stability.css","utf8");

test("composing activity is a tiny three-dot bubble without visual words",()=>{
 const markup=renderToStaticMarkup(createElement(ChatActivity,{kind:"typing"}));
 assert.match(markup,/lr-activity-bubble lr-activity-typing/);
 assert.match(markup,/role="status"/);
 assert.match(markup,/aria-label="Ton partenaire est en train d’écrire"/);
 assert.match(markup,/<span class="lr-activity-dots" aria-hidden="true"><i><\/i><i><\/i><i><\/i><\/span>/);
 assert.doesNotMatch(markup,/>.*en train d’écrire/i);
});
test("voice recording activity is microphone plus animated waveform, no label text",()=>{
 const markup=renderToStaticMarkup(createElement(ChatActivity,{kind:"recording"}));
 assert.match(markup,/lr-activity-bubble lr-activity-recording/);
 assert.match(markup,/aria-label="Ton partenaire enregistre un message vocal"/);
 assert.match(markup,/class="lr-activity-recording-icon"/);
 assert.match(markup,/class="lr-activity-wave"/);
 assert.equal((markup.match(/<i><\/i>/g)||[]).length,4);
 assert.doesNotMatch(markup,/>.*enregistre un vocal/i);
});
test("header keeps presence online or offline while activity stays in latest messages",()=>{
 assert.ok(app.includes('partnerRecording?"recording":partnerTyping?"typing":null'));
 assert.ok(app.includes('<ChatActivity kind={partnerActivityKind}/>'));
 assert.ok(app.includes('"En ligne":"Hors ligne"'));
 assert.ok(!app.includes('En train d’écrire…'));
 assert.ok(!app.includes('Enregistre un vocal…'));
 assert.ok(app.includes('room.messages'));
});
test("iPhone keyboard keeps recent messages in view but never snaps a scrolled-up conversation back",()=>{
 assert.ok(app.includes("new ResizeObserver"));
 assert.ok(app.includes("chatFocused||chatAtBottomRef.current"));
 assert.ok(app.includes("if(chatFocused||chatAtBottomRef.current)scrollToLatest()"));
 assert.ok(app.includes('viewport?.addEventListener("scroll",sync)'));
 assert.ok(app.includes('viewport?.addEventListener("resize",syncWithChat)'));
 assert.ok(css.includes("lr-keyboard-open .lr-chat-messages"));
 assert.ok(css.includes("lr-keyboard-open .lr-chat-compose"));
 assert.ok(css.includes("lr-activity-dots"));
 assert.ok(css.includes("lr-activity-wave"));
 assert.ok(css.includes("prefers-reduced-motion"));
});
