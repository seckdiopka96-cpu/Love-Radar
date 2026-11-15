import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {quoteAuthor,quotePreview} from "../src/message-quote";
import QuoteCard from "../src/QuoteCard";

const app=readFileSync("src/App.tsx","utf8");
const api=readFileSync("functions/api/love.ts","utf8");
const css=readFileSync("src/message-replies.css","utf8");

test("quoted text is compact; photo and voice have readable labels",()=>{
 assert.equal(quotePreview("image",null),"📷 Photo");
 assert.equal(quotePreview("audio",null),"🎙️ Message vocal");
 assert.equal(quotePreview("text"," Hello\n  my love  "),"Hello my love");
 assert.ok(quotePreview("text","long".repeat(100)).length<=95);
 assert.equal(quoteAuthor("me","me","Baby"),"Vous");
 assert.equal(quoteAuthor("other","me","Baby"),"Baby");
});
test("quoted replies render partner name and quoted preview",()=>{
 const markup=renderToStaticMarkup(createElement(QuoteCard,{author:"Baby",kind:"text",content:"Je pense à toi"}));
 assert.match(markup,/Baby/);
 assert.match(markup,/Je pense à toi/);
 assert.match(markup,/lr-quote-card is-bubble/);
 const voice=renderToStaticMarkup(createElement(QuoteCard,{author:"Vous",kind:"audio",content:null,variant:"composer"}));
 assert.match(voice,/Message vocal/);
 assert.match(voice,/lr-quote-card is-composer/);
});
test("swipe is the only touch gesture for replying; long press does not select",()=>{
 assert.ok(app.includes('onPointerDown={e=>messagePointerDown(e,m)}'));
 assert.ok(app.includes('onPointerMove={messagePointerMove}'));
 assert.ok(app.includes('onPointerUp={e=>messagePointerUp(e,m)}'));
 assert.ok(app.includes('onPointerCancel={e=>resetSwipe(e.currentTarget)}'));
 assert.ok(app.includes('dx>=62&&Math.abs(dy)<34'));
 assert.ok(app.includes('chooseReply(message)'));
 assert.ok(app.includes('e.currentTarget.style.setProperty("--lr-reply-shift"'));
 assert.ok(!app.includes("selectedMessageId"));
 assert.ok(!app.includes("setSelectedMessageId"));
 assert.ok(!app.includes("onContextMenu={"));
 assert.ok(!app.includes("messagePointerDown" + "LongPress"));
 assert.ok(css.includes("touch-action:pan-y"));
 assert.ok(css.includes(".lr-reply-arrow"));
});
test("reply composition is cancellable and real send includes referenced message UUID",()=>{
 assert.ok(app.includes('replyTarget?<div className="lr-reply-compose"'));
 assert.ok(app.includes('onClick={()=>setReplyTarget(null)}'));
 assert.ok(app.includes('ref={chatInput}'));
 assert.ok(app.includes('chatInput.current?.focus()'));
 assert.ok(app.includes('replyTo:quoted.id'));
 assert.ok(app.includes('if(quoted)setReplyTarget(quoted)'));
 assert.ok(app.includes('m.reply_to_id?<QuoteCard'));
 assert.ok(app.includes('quoteAuthor(m.reply_sender_id,room.user.id,partner)'));
 assert.ok(app.includes("jumpToQuote"));
});
test("back end validates same-room reference and inserts both records atomically",()=>{
 assert.ok(api.includes('CREATE TABLE IF NOT EXISTS message_replies'));
 assert.ok(api.includes('quoted=await db.prepare("SELECT id FROM messages WHERE room_id=? AND id=?'));
 assert.ok(api.includes('if(!quoted)return fail("Ce message n’appartient pas à votre conversation."'));
 assert.ok(api.includes("await db.batch(["));
 assert.ok(api.includes("INSERT INTO message_replies(room_id,message_id,target_id,created_at)"));
 assert.ok(api.includes("r.target_id AS reply_to_id"));
 assert.ok(api.includes("p.kind AS reply_kind"));
 assert.ok(api.includes("p.content AS reply_content"));
 assert.ok(api.includes("p.sender_id AS reply_sender_id"));
 assert.ok(api.includes('DELETE FROM message_replies WHERE room_id=?'));
});
