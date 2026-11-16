import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ChatActivity from "../src/ChatActivity";

const app=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/chat-stability.css","utf8");
const immersive=readFileSync("src/immersive-chat.css","utf8");

test("composing activity is a tiny three-dot bubble without visual words",()=>{
 const markup=renderToStaticMarkup(createElement(ChatActivity,{kind:"typing"}));
 assert.match(markup,/lr-activity-bubble lr-activity-typing/);
 assert.match(markup,/role="status"/);
 assert.match(markup,/aria-label="Ton partenaire est en train d’écrire"/);
 assert.match(markup,/class="lr-activity-dots"/);
 assert.equal((markup.match(/<i(?:\s[^>]*)?><\/i>/g)||[]).length,3);
 assert.match(markup,/data-activity-frame="0"/);
 assert.doesNotMatch(markup,/>.*en train d’écrire/i);
});
test("voice recording activity is microphone plus animated waveform, no label text",()=>{
 const markup=renderToStaticMarkup(createElement(ChatActivity,{kind:"recording"}));
 assert.match(markup,/lr-activity-bubble lr-activity-recording/);
 assert.match(markup,/aria-label="Ton partenaire enregistre un message vocal"/);
 assert.match(markup,/class="lr-activity-recording-icon"/);
 assert.match(markup,/class="lr-activity-wave"/);
 assert.equal((markup.match(/<i(?:\s[^>]*)?><\/i>/g)||[]).length,4);
 assert.doesNotMatch(markup,/>.*enregistre un vocal/i);
});
test("header shows online or last-seen presence while activity stays in latest messages",()=>{
 assert.ok(app.includes('partnerRecording?"recording":partnerTyping?"typing":null'));
 assert.ok(app.includes('<ChatActivity kind={partnerActivityKind}/>'));
 assert.ok(app.includes('partnerOnline?"En ligne":formatPartnerLastSeen(lastSeen,presenceNow)'));
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

test("all application chrome disappears inside phone Messages, not just when keyboard is open",()=>{
 assert.ok(app.includes('className="lr-chat-back"'));
 assert.ok(app.includes('onClick={()=>navigate(chatReturnTab.current)}'));
 assert.ok(app.includes('if(tab==="chat"&&currentTab.current!=="chat")chatReturnTab.current=currentTab.current'));
 assert.ok(app.includes('import "./immersive-chat.css";'));
 assert.ok(immersive.includes(".lr-app.lr-app-locked.lr-chat-mode > .lr-header"));
 assert.ok(immersive.includes(".lr-app.lr-app-locked.lr-chat-mode > .lr-notification-area"));
 assert.ok(immersive.includes(".lr-app.lr-app-locked.lr-chat-mode .lr-mobile-nav"));
 assert.ok(immersive.includes("display:none!important;visibility:hidden!important"));
 assert.ok(immersive.includes(".lr-app.lr-app-locked.lr-chat-mode .lr-shell"));
 assert.ok(immersive.includes("padding:0!important"));
 assert.ok(immersive.includes(".lr-app.lr-app-locked.lr-chat-mode .lr-chat-back"));
 assert.ok(immersive.includes(".lr-app.lr-app-locked.lr-chat-mode .lr-chat-compose"));
 assert.ok(immersive.includes("env(safe-area-inset-bottom)"));
});
test("typing and microphone show unmistakable staggered motion on mobile",()=>{
 assert.ok(immersive.includes("@keyframes lr-whats-typing"));
 assert.ok(immersive.includes("@keyframes lr-whats-voice"));
 assert.ok(immersive.includes("@keyframes lr-whats-mic"));
 assert.ok(immersive.includes(".lr-activity-dots i:nth-child(1)"));
 assert.ok(immersive.includes(".lr-activity-dots i:nth-child(2)"));
 assert.ok(immersive.includes(".lr-activity-dots i:nth-child(3)"));
 assert.ok(immersive.includes(".lr-activity-wave i:nth-child(4)"));
 assert.ok(immersive.includes("will-change:transform,opacity"));
 assert.ok(immersive.includes("prefers-reduced-motion:reduce"));
});

test("real iPhone status animation advances through JS frames, not CSS keyframes alone",()=>{
 const source=readFileSync("src/ChatActivity.tsx","utf8");
 const overrides=readFileSync("src/message-actions.css","utf8");
 assert.ok(source.includes("useState(0)"));
 assert.ok(source.includes("window.setInterval(()=>setFrame"));
 assert.ok(source.includes("data-activity-frame={frame}"));
 assert.ok(source.includes('"--lr-js-transform"'));
 assert.ok(source.includes('"--lr-js-height"'));
 assert.ok(overrides.includes("animation:none!important"));
 assert.ok(overrides.includes("var(--lr-js-transform"));
 assert.ok(overrides.includes("var(--lr-js-height"));
 assert.ok(overrides.includes("@media(prefers-reduced-motion:reduce)"));
});
