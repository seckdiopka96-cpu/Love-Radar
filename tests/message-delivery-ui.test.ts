import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {receiptState,receiptGlyph,receiptDisplayLabel,receiptAccessibleLabel} from "../src/message-delivery";

test("receipts advance only from server timestamp to device delivery then explicit reading",()=>{
 const when=1760000000100;
 assert.equal(receiptState(when,0,0),"sent");
 assert.equal(receiptState(when,0,when-1),"sent");
 assert.equal(receiptState(when,0,when),"delivered");
 assert.equal(receiptState(when,when,when),"read");
 assert.equal(receiptState(when,when,0),"read");
 assert.equal(receiptState(when,when-1,when+10),"delivered");
});
test("three readable statuses use one tick, two ticks, then two read ticks",()=>{
 assert.deepEqual(["sent","delivered","read"].map(s=>receiptGlyph(s as "sent"|"delivered"|"read")),["✓","✓✓","✓✓"]);
 assert.deepEqual(["sent","delivered","read"].map(s=>receiptDisplayLabel(s as "sent"|"delivered"|"read")),["Envoyé","Distribué","Lu"]);
 assert.ok(receiptAccessibleLabel("read").startsWith("Lu"));
});
test("message receipts are shown for every sent bubble, including voice, never pending",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const voice=readFileSync("src/VoiceMessage.tsx","utf8");
 const css=readFileSync("src/delivery-status-ui.css","utf8");
 assert.ok(app.includes('textOutbox.every(v=>v.id!==m.id||v.status==="sent")'));
 assert.ok(app.includes('voiceOutbox.every(v=>v.id!==m.id||v.status==="sent")'));
 assert.ok(!app.includes('m.id===lastOwnMessage?.id'));
 assert.ok(voice.includes('receiptDisplayLabel(delivery)'));
 assert.ok(voice.includes('receiptGlyph(delivery)'));
 assert.ok(app.includes('receiptDisplayLabel(delivery)'));
 assert.ok(app.includes('receiptGlyph(delivery)'));
 assert.ok(css.includes('.lr-message-delivery-state.is-read'));
 assert.ok(css.includes('.lr-receipt-ticks'));
});
test("Diao-Tech signature is visible on loading, registration, private home and opening slate",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const home=readFileSync("src/HomeDashboard.tsx","utf8");
 const splash=readFileSync("src/LaunchSplash.tsx","utf8");
 const css=readFileSync("src/delivery-status-ui.css","utf8");
 assert.ok(app.includes('className="lr-loading-credit">Créé par <strong>Diao-Tech.com</strong>'));
 assert.ok(app.includes('className="lr-made-by">Créé par <strong>Diao-Tech.com</strong>'));
 assert.ok(home.includes('className="lr-home-made-by">Créé par <strong>Diao-Tech.com</strong>'));
 assert.ok(splash.includes('Créé par <strong>Diao-Tech.com</strong>'));
 assert.ok(css.includes('.lr-app .lr-loading-credit'));
});
