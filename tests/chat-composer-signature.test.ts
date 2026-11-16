import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/chat-composer-signature.css","utf8");
const legacy=readFileSync("src/chat-stability.css","utf8");

test("Love Radar chat composer styles are loaded after legacy chat/voice styles",()=>{
 const oldStyle=app.indexOf('import "./live-voice-waveform.css";');
 const newStyle=app.indexOf('import "./chat-composer-signature.css";');
 assert.ok(oldStyle>0&&newStyle>oldStyle,"signature overrides must load after legacy styles");
 assert.ok(css.includes("Midnight & Rose"));
});

test("each visible chat action has its own distinct background, shape and contrast",()=>{
 const plus=css.match(/\.lr-chat \.lr-chat-form > \.lr-attach\{([^}]+)\}/)?.[1]||"";
 const sticker=css.match(/\.lr-chat \.lr-chat-form > \.lr-sticker-trigger\{([^}]+)\}/)?.[1]||"";
 const mic=css.match(/\.lr-chat \.lr-chat-form > \.lr-mic\{([^}]+)\}/)?.[1]||"";
 const send=css.match(/\.lr-chat \.lr-chat-form > \.lr-send\{([^}]+)\}/)?.[1]||"";
 const all=[plus,sticker,mic,send];
 for(const block of all)assert.ok(block.includes("background:linear-gradient"),"each action needs a distinct premium surface");
 assert.ok(new Set(all.map(block=>block.match(/background:linear-gradient\([^;]+/)?.[0])).size===4,"no reused button backgrounds");
 assert.ok(plus.includes("border-radius:50%"),"plus outlined and round");
 assert.ok(sticker.includes("border-radius:14px"),"sticker rounded square");
 assert.ok(mic.includes("border-radius:50%"),"microphone round");
 assert.ok(send.includes("border-radius:15px"),"send is distinct and visible");
 assert.ok(css.includes(".lr-chat .lr-chat-form > .lr-send:disabled"));
 assert.ok(css.includes(".lr-chat .lr-chat-form > button:focus-visible"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
});

test("iPhone composer keeps full-width input and all four original actions",()=>{
 const fragment=app.slice(app.indexOf('className={"lr-chat-form '),app.indexOf('className={"lr-chat-form ')+3200);
 assert.ok(fragment.includes('className="lr-attach"'),"photo attachment remains wired");
 assert.ok(fragment.includes('className={"lr-sticker-trigger"'),"sticker picker remains wired");
 assert.ok(fragment.includes('className={"lr-mic "'),"voice button remains wired");
 assert.ok(fragment.includes('className="lr-send"'),"send remains wired");
 assert.ok(fragment.includes('onClick={toggleRecording}'));
 assert.ok(fragment.includes('onSubmit={sendMessage}'));
 assert.ok(fragment.includes('setStickerOpen(open=>!open)'));
 assert.ok(css.includes("flex:1 1 0!important"),"input takes remaining width");
 assert.ok(css.includes("@media(max-width:380px)"));
 assert.ok(css.includes("@media(max-width:340px)"));
 assert.ok(legacy.includes(".lr-chat-form.is-writing .lr-mic{display:none!important}"),"typing icon hiding remains intact");
 assert.ok(!css.includes("display:none"),"visual polish cannot hide any actions");
});

test("plus and sticker symbols use crisp accessible SVGs without emoji font fallback",()=>{
 assert.ok(app.includes('aria-label="Ajouter une photo"'));
 assert.ok(app.includes('M12 4v16M4 12h16'));
 assert.ok(app.includes('className={"lr-sticker-trigger"'));
 assert.ok(app.includes('aria-expanded={stickerOpen}'));
 assert.ok(app.includes('circle cx="9" cy="10"'));
});
