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

test("all visible chat action icons share Love Radar color, with stickers inside the text capsule",()=>{
 const selectors=["lr-attach","lr-mic","lr-send"];
 const blocks=selectors.map(name=>css.match(new RegExp(
  "\\.lr-chat \\.lr-chat-form > \\."+name+"\\{([^}]+)\\}"
 ))?.[1]||"");
 for(const block of blocks){
  assert.ok(block.includes("color:var(--lr-composer-icon)!important"),"same icon color");
  assert.ok(block.includes("background:var(--lr-composer-icon-bg)!important"),"same external button background");
  assert.ok(block.includes("border:1px solid var(--lr-composer-icon-border)!important"),"same outline");
 }
 const sticker=css.match(/\.lr-chat \.lr-chat-form > \.lr-chat-textbox > \.lr-sticker-trigger\{([^}]+)\}/)?.[1]||"";
 assert.ok(sticker.includes("color:var(--lr-composer-icon)!important"),"sticker uses the same icon tint");
 assert.ok(sticker.includes("background:transparent!important"),"sticker blends into the text capsule");
 assert.ok(sticker.includes("border:0!important"),"no sticker button border inside input");
 assert.ok(css.includes("--lr-composer-icon:#f7dce8"));
 assert.ok(css.includes("--lr-composer-icon-bg:linear-gradient(145deg,#2b4051,#223747)"));
 assert.ok(blocks[0].includes("border-radius:50%"),"plus stays round");
 assert.ok(blocks[1].includes("border-radius:50%"),"mic stays round");
 assert.ok(blocks[2].includes("border-radius:15px"),"send stays easy to recognize");
 assert.ok(css.includes(".lr-chat .lr-chat-form > .lr-send:disabled"));
 assert.ok(css.includes(".lr-chat .lr-chat-form > .lr-mic.recording"));
 assert.ok(css.includes(".lr-chat .lr-chat-form > button:focus-visible"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
});

test("iPhone composer keeps the plus outside, sticker inside, and send at the far right",()=>{
 const start=app.indexOf('className={"lr-chat-form ');
 const end=app.indexOf('</form>',start);
 const fragment=app.slice(start,end);
 const plus=fragment.indexOf('className="lr-attach"');
 const wrapper=fragment.indexOf('className="lr-chat-textbox"');
 const input=fragment.indexOf('ref={chatInput}');
 const sticker=fragment.indexOf('className={"lr-sticker-trigger"');
 const wrapperClose=fragment.indexOf('</div>',sticker);
 const send=fragment.indexOf('className="lr-send"');
 const mic=fragment.indexOf('className={"lr-mic "');
 assert.ok(plus>=0&&wrapper>plus&&input>wrapper&&sticker>input&&wrapperClose>sticker&&send>wrapperClose);
 assert.ok(mic>wrapperClose,"mic and send remain separate trailing alternatives");
 assert.ok(fragment.includes('onClick={toggleRecording}'));
 assert.ok(fragment.includes('onSubmit={sendMessage}'));
 assert.ok(fragment.includes('setStickerOpen(open=>!open)'));
 assert.ok(css.includes('.lr-chat .lr-chat-form > .lr-chat-textbox{'));
 assert.ok(css.includes('flex:1 1 0!important'),"text capsule takes remaining space");
 assert.ok(css.includes('@media(max-width:380px)'));
 assert.ok(css.includes('@media(max-width:340px)'));
 assert.ok(legacy.includes('.lr-chat-form.is-writing .lr-mic{display:none!important}'),"legacy rule is counteracted while blank text is focused");
 assert.ok(css.includes('.lr-chat .lr-chat-form.is-writing > .lr-attach'));
 assert.ok(css.includes('.lr-chat .lr-chat-form.is-writing > .lr-mic'));
 assert.ok(css.includes('.lr-app.lr-app-locked.lr-chat-mode.lr-keyboard-open .lr-chat .lr-chat-form.is-writing > .lr-attach'),"keyboard cannot hide plus");
 assert.ok(css.includes(':focus-within'),"whole capsule gets focus ring");
 assert.ok(css.includes('overflow:hidden'),"sticker stays clipped inside rounded capsule");
 assert.ok(!css.includes("display:none"),"visual layout never hides buttons");
});

test("empty WhatsApp-style input shows mic, not a disabled send button",()=>{
 const start=app.indexOf('className={"lr-chat-form ');
 const end=app.indexOf('</form>',start);
 const composer=app.slice(start,end);
 assert.ok(composer.includes('{draft.trim()?<button className="lr-send"'),"send only exists when text is nonblank");
 assert.ok(composer.includes('</button>:<button className={"lr-mic "'),"mic and send are mutually exclusive");
 assert.ok(composer.includes('type="submit"'),"a nonempty message remains sendable");
 assert.ok(composer.includes('disabled={!room.partner||busy}'),"send remains protected during requests");
 assert.ok(!composer.includes('disabled={!room.partner||!draft.trim()||busy}'),"no visible disabled send on empty input");
 assert.ok(composer.includes('onClick={toggleRecording}'),"empty input can still start a vocal");
 assert.ok(composer.includes('onPointerDown={e=>e.preventDefault()}'),"sending preserves iPhone keyboard focus");
 assert.ok(css.includes('flex:0 0 42px!important'),"send and mic occupy the same width and do not shift layout");
});
test("plus and sticker symbols use crisp accessible SVGs without emoji font fallback",()=>{
 assert.ok(app.includes('aria-label="Ajouter une photo"'));
 assert.ok(app.includes('M12 4v16M4 12h16'));
 assert.ok(app.includes('className={"lr-sticker-trigger"'));
 assert.ok(app.includes('aria-expanded={stickerOpen}'));
 assert.ok(app.includes('circle cx="9" cy="10"'));
});
