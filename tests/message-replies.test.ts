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
test("swipe right replies while a stationary long press opens the action menu",()=>{
 assert.ok(app.includes('onPointerDown={e=>messagePointerDown(e,m)}'));
 assert.ok(app.includes('onPointerMove={messagePointerMove}'));
 assert.ok(app.includes('onPointerUp={e=>messagePointerUp(e,m)}'));
 assert.ok(app.includes('onPointerCancel={e=>resetSwipe(e.currentTarget)}'));
 assert.ok(app.includes('dx>=62&&Math.abs(dy)<34'));
 assert.ok(app.includes('chooseReply(message)'));
 assert.ok(app.includes('e.currentTarget.style.setProperty("--lr-reply-shift"'));
 assert.ok(!app.includes("selectedMessageId"));
 assert.ok(!app.includes("setSelectedMessageId"));
 assert.ok(app.includes("onContextMenu={"));
 assert.ok(app.includes("window.setTimeout(()=>"));
 assert.ok(app.includes("openMessageActions(message)"));
 assert.ok(app.includes("gesture.held=true"));
 assert.ok(app.includes("if(g.timer!==null){clearTimeout(g.timer);g.timer=null}"));
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

test("long press menu offers real server-backed edit, reaction, copy, details and deletion",()=>{
 const menu=readFileSync("src/message-actions.css","utf8");
 assert.ok(app.includes('setActionMessageId(message.id)'));
 assert.ok(app.includes('role="dialog" aria-modal="true" aria-label="Actions sur le message"'));
 assert.ok(app.includes('CHAT_REACTIONS.map(emoji=>'));
 assert.ok(app.includes('"react-message"'));
 assert.ok(app.includes('"edit-message"'));
 assert.ok(app.includes('"delete-message"'));
 assert.ok(app.includes('copyMessage(actionMessage)'));
 assert.ok(app.includes('beginEditing(actionMessage)'));
 assert.ok(app.includes('setInfoMessageId(actionMessage.id)'));
 assert.ok(app.includes('Supprimer pour tous'));
 assert.ok(app.includes('sender_id===room.user.id&&actionMessage.kind==="text"'));
 assert.ok(app.includes('onClick={cancelEditing}'));
 assert.ok(menu.includes(".lr-message-action-sheet"));
 assert.ok(menu.includes(".lr-message-reaction-picker"));
 assert.ok(menu.includes(".lr-edit-compose"));
});
test("D1 edits/deletions are restricted to author and room, reactions to the same private chat",()=>{
 assert.ok(api.includes("CREATE TABLE IF NOT EXISTS message_edits"));
 assert.ok(api.includes("CREATE TABLE IF NOT EXISTS message_reactions"));
 assert.ok(api.includes('op==="edit-message"'));
 assert.ok(api.includes('op==="react-message"'));
 assert.ok(api.includes('op==="delete-message"'));
 assert.ok(api.includes('kind=\'text\''));
 assert.ok(api.includes("Tu peux modifier uniquement tes propres textes."));
 assert.ok(api.includes("Tu peux supprimer uniquement tes propres messages."));
 assert.ok(api.includes('INSERT INTO message_edits(room_id,message_id,edited_at)'));
 assert.ok(api.includes('INSERT INTO message_reactions(room_id,message_id,member_id,emoji,updated_at)'));
 assert.ok(api.includes('DELETE FROM message_reactions WHERE room_id=?'));
 assert.ok(api.includes('COALESCE(ed.edited_at,0) AS edited_at'));
 assert.ok(api.includes('reactions:reactionsById.get(String(row.id))'));
});

test("reactions appear as latest activity, send push alerts and count as unread",()=>{
 const home=readFileSync("src/HomeDashboard.tsx","utf8");
 assert.ok(api.includes("recentReaction:recentReaction||null"));
 assert.ok(api.includes("last_reaction_read_at"));
 assert.ok(api.includes("unreadReactions"));
 assert.ok(api.includes('Réaction à ton message ❤️'));
 assert.ok(api.includes('notifyPartner(env,u.room_id,u.id'));
 assert.ok(api.includes('kind:"message",id:body.id'));
 assert.ok(home.includes('Vous avez réagi par '));
 assert.ok(home.includes('reaction.updated_at>=last.created_at'));
 assert.ok(app.includes('room.recentReaction?.updated_at'));
});

test("delete-for-me never removes partner copies, while author delete-for-all removes both",()=>{
 assert.ok(api.includes('op==="delete-for-me"'));
 assert.ok(api.includes('INSERT OR IGNORE INTO message_hidden'));
 assert.ok(api.includes('SELECT 1 FROM message_hidden'));
 assert.ok(api.includes('AS view_once'));
 assert.ok(api.includes('AS once_opened_at'));
 assert.ok(api.includes('DELETE FROM message_one_time WHERE room_id=? AND message_id=?'));
 assert.ok(app.includes('request("delete-for-me",{id:message.id})'));
 assert.ok(app.includes('onClick={()=>void deleteForMe(actionMessage)}'));
 assert.ok(app.includes('onClick={()=>void deleteOwnMessage(actionMessage)}'));
 assert.ok(app.includes('Supprimer pour moi'));
 assert.ok(app.includes('Supprimer pour tous'));
});
