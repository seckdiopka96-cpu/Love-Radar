import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {quoteAuthor,quotePreview} from "../src/message-quote";
import StickerArt from "../src/StickerArt";
import {STICKERS,STICKER_GROUPS,encodeSticker,getSticker,readStickerId} from "../src/stickers";
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
 assert.ok(app.includes('replyTo:entry.replyToId'));
 assert.ok(app.includes('replyToId:quoted?.id'));
 assert.ok(app.includes('status:"failed" as const'));;
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

test("text messages render immediately without waiting for HTTP and support retry with the same id",()=>{
 assert.ok(app.includes("type LocalText="));
 assert.ok(app.includes("setTextOutbox(items=>[...items,entry])"));
 assert.ok(app.includes('void sendQueuedText(entry)'));
 assert.ok(app.includes('messageId:entry.id'));
 assert.ok(app.includes('result.id!==entry.id'));
 assert.ok(app.includes('status:"failed" as const'));
 assert.ok(app.includes('Réessayer l’envoi du message'));
 assert.ok(app.includes('role="status"'));
 assert.ok(app.includes('received.has(item.id)'));
 assert.ok(!app.includes('setBusy(true);setError("");\n  try{\n   await request("message"'));
 assert.ok(api.includes('const requestedId=body.messageId'));
 assert.ok(api.includes('duplicate:true'));
 assert.ok(api.includes('id:messageId'));
});
test("premium native-style bottom dock replaces the old heavy navigation",()=>{
 const css=readFileSync("src/premium-navigation.css","utf8");
 const manifest=readFileSync("public/manifest.webmanifest","utf8");
 assert.ok(app.includes('import "./premium-navigation.css"'));
 assert.ok(css.includes('backdrop-filter:blur(26px)'));
 assert.ok(css.includes('.lr-mobile-nav button.active .lr-nav-symbol'));
 assert.ok(css.includes('env(safe-area-inset-bottom)'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
 assert.ok(css.includes('.lr-text-send-state.failed'));
 assert.ok(!app.includes('Love <span>Radar'));
 assert.ok(!app.includes('Love Radar · Paramètres'));
 assert.ok(!manifest.includes('"short_name": "Love Radar"'));
});

test("original local stickers have unique IDs and survive message encoding",()=>{
 assert.ok(STICKERS.length>=150,"Sticker gallery has a diverse variety");
 assert.equal(new Set(STICKERS.map(sticker=>sticker.id)).size,STICKERS.length);
 assert.ok(STICKER_GROUPS.length>=12,"Sticker packs include comedy, animals and more");
 assert.ok(STICKERS.length>=150,"Large diverse sticker library");
 for(const sticker of STICKERS){
  assert.equal(readStickerId(encodeSticker(sticker.id)),sticker.id);
  assert.equal(getSticker(sticker.id)?.label,sticker.label);
  assert.ok(sticker.caption.length>0);
 }
 assert.equal(readStickerId("[sticker:v1:missing]"),null);
 assert.equal(readStickerId("[sticker:v1:love-you] hello"),null);
 assert.equal(quotePreview("text",encodeSticker("love-you")),"🎟️ Sticker · Je t’aime");
 const markup=renderToStaticMarkup(createElement(StickerArt,{id:"love-you"}));
 assert.ok(markup.includes("lr-sticker-art"));
 assert.ok(markup.includes("JE T’AIME"));
});
test("stickers picker supports live search, categories, favorites and recent sends",()=>{
 const picker=readFileSync("src/StickerPicker.tsx","utf8");
 const css=readFileSync("src/stickers.css","utf8");
 const home=readFileSync("src/HomeDashboard.tsx","utf8");
 assert.ok(picker.includes('type="search"'));
 assert.ok(picker.includes('role="tablist"'));
 assert.ok(picker.includes("STICKER_GROUPS"));
 assert.ok(picker.includes("favorites.includes(id)"));
 assert.ok(picker.includes("RECENT_KEY+storageKey"));
 assert.ok(picker.includes("FAV_KEY+storageKey"));
 assert.ok(picker.includes("onSend(id)"));
 assert.ok(css.includes(".lr-sticker-grid"));
 assert.ok(css.includes(".lr-bubble-sticker"));
 assert.ok(css.includes(".lr-sticker-trigger"));
 assert.ok(app.includes("setStickerOpen(open=>!open)"));
 assert.ok(app.includes("<StickerPicker storageKey="));
 assert.ok(app.includes('void sendQueuedText(entry)'));
 assert.ok(app.includes("<StickerArt id={readStickerId(m.content)!}"));
 assert.ok(app.includes('!isSticker(actionMessage.content)'));
 assert.ok(api.includes('message.startsWith("[sticker:v1:")'));
 assert.ok(api.includes("un sticker"));
 assert.ok(home.includes('quotePreview("text",last.content,95)'));
});

test("comedy, memes and culturally varied sticker packs stay searchable and renderable",()=>{
 const groups=new Set(STICKER_GROUPS.map(group=>group.id));
 for(const category of ["comedie","memes","animaux","sport","food","voyage","afrique","humeur"]){
  assert.ok(groups.has(category as typeof STICKER_GROUPS[number]["id"]),category+" is in the sticker picker");
  assert.ok(STICKERS.filter(sticker=>sticker.category===category).length>=12,category+" has at least twelve options");
 }
 for(const id of ["clown-face","rofl","comic-dramatic","meme-dead","animal-cat","sn-nanga","sport-football","food-pizza"]){
  assert.ok(getSticker(id),"sticker exists "+id);
  assert.equal(readStickerId(encodeSticker(id)),id);
 }
});

test("stickers render small and lightweight without inflating chat bubble spacing",()=>{
 const css=readFileSync("src/stickers.css","utf8");
 assert.ok(css.includes("width:106px;height:101px"),"Sticker is compact");
 assert.ok(css.includes("width:110px!important"),"Chat bubble only reserves a compact footprint");
 assert.ok(css.includes("width:104px;height:99px"),"Sticker art fits chat bubble");
 assert.ok(css.includes("margin-top:5px!important"),"Sticker messages no longer create large vertical gaps");
 assert.ok(css.includes("border:1.5px solid #ffffffa8"),"Subtle outline replaces heavy sticker frame");
 assert.ok(!css.includes("width:155px;height:146px"),"Old oversized sticker art is removed");
 assert.ok(!css.includes("border:4px solid #fff7f7"),"Old thick bright border is removed");
});
