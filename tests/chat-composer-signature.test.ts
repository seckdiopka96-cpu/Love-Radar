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

test("all chat actions use one matching icon tint, background, and border",()=>{
 const selectors=["lr-attach","lr-sticker-trigger","lr-mic","lr-send"];
 const blocks=selectors.map(name=>css.match(new RegExp(
  "\\.lr-chat \\.lr-chat-form > \\."+name+"\\{([^}]+)\\}"
 ))?.[1]||"");
 for(const block of blocks){
  assert.ok(block.includes("color:var(--lr-composer-icon)!important"),"same icon color");
  assert.ok(block.includes("background:var(--lr-composer-icon-bg)!important"),"same button background");
  assert.ok(block.includes("border:1px solid var(--lr-composer-icon-border)!important"),"same outline");
 }
 assert.ok(css.includes("--lr-composer-icon:#f7dce8"));
 assert.ok(css.includes("--lr-composer-icon-bg:linear-gradient(145deg,#2b4051,#223747)"));
 assert.ok(blocks[0].includes("border-radius:50%"),"plus stays round");
 assert.ok(blocks[1].includes("border-radius:14px"),"sticker stays easy to recognize");
 assert.ok(blocks[2].includes("border-radius:50%"),"mic stays round");
 assert.ok(blocks[3].includes("border-radius:15px"),"send stays easy to recognize");
 assert.ok(css.includes(".lr-chat .lr-chat-form > .lr-send:disabled"),"disabled icon stays visibly subdued");
 assert.ok(css.includes(".lr-chat .lr-chat-form > .lr-mic.recording"),"recording mode remains indicated");
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
