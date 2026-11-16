import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EMOJIS,EMOJI_CATEGORIES,filterEmojis} from "../src/emoji-catalog";
import {STICKERS,MOTION_STICKERS,encodeSticker,readStickerId} from "../src/stickers";
import {validGifUrl,readGifResults,readGifId,encodeGif} from "../src/gif-provider";

test("Emoji catalog has categorized offline keyboard, search and recent entries",()=>{
 assert.ok(EMOJIS.length>=230,"emoji keyboard should not be a token 20 emoji sample");
 assert.ok(EMOJI_CATEGORIES.length>=7);
 assert.ok(EMOJIS.includes("😂"));
 assert.ok(EMOJIS.includes("❤️"));
 assert.ok(filterEmojis("amour","all").includes("❤️"));
 assert.ok(filterEmojis("bonjour","all").includes("☀️"));
 assert.deepEqual(filterEmojis("","recent",["❤️","😂"]),["❤️","😂"]);
 assert.equal(filterEmojis("intentionally-no-match","all").length,0);
});

test("32 original animated stickers are valid shareable first-party sticker tokens",()=>{
 assert.equal(MOTION_STICKERS.length,32);
 const keys=new Set<string>();
 for(const sticker of MOTION_STICKERS){
  assert.ok(sticker.motion,"every animated item has a predefined motion");
  assert.ok(!keys.has(sticker.id),"unique IDs");
  keys.add(sticker.id);
  assert.equal(readStickerId(encodeSticker(sticker.id)),sticker.id);
  assert.ok(STICKERS.some(s=>s.id===sticker.id),"recipient can render sticker from catalog");
 }
 const art=readFileSync("src/StickerArt.tsx","utf8");
 const css=readFileSync("src/animated-stickers.css","utf8");
 assert.ok(art.includes('sticker.motion?" lr-motion-"'));
 assert.ok(css.includes(".lr-sticker-art.lr-motion-heartbeat"));
 assert.ok(css.includes(".lr-sticker-art.lr-motion-shake"));
 assert.ok(css.includes(".lr-sticker-art.lr-motion-kiss"));
 assert.ok(css.includes("(prefers-reduced-motion:reduce)"));
});

test("GIF URLs and malformed provider results are rejected before any download",()=>{
 assert.ok(validGifUrl("https://media.giphy.com/media/abc/giphy.gif"));
 assert.ok(validGifUrl("https://media2.giphy.com/media/abc/giphy.gif"));
 for(const value of ["http://media.giphy.com/media/abc/giphy.gif",
  "https://evil.giphy.com/a.gif","https://giphy.com.evil.org/gif",
  "javascript:alert(1)","https://media.giphy.com.evil.org/test.gif"]){
  assert.equal(validGifUrl(value),false,value);
 }
 const result=readGifResults({data:[
  {id:"ABC123",title:"Hello",images:{fixed_width:{url:"https://media.giphy.com/media/abc/giphy.gif"},
   downsized:{url:"https://media2.giphy.com/media/abc/giphy.gif"}}},
  {id:"unsafe!",images:{fixed_width:{url:"https://example.com/a.gif"}}}
 ]});
 assert.equal(result.length,1);
 assert.equal(result[0].id,"ABC123");
 assert.deepEqual(readGifResults({bad:true}),[]);
});

test("external GIFs use only client-side GIPHY API and send encrypted ID tokens",()=>{
 const provider=readFileSync("src/gif-provider.ts","utf8");
 const renderer=readFileSync("src/GifMessage.tsx","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const server=readFileSync("functions/api/love.ts","utf8");
 const expected=encodeGif("ABC123");
 assert.equal(expected,"[gif:v1:ABC123]");
 assert.equal(readGifId(expected),"ABC123");
 assert.equal(readGifId("[gif:v1:!!]"),null);
 assert.ok(provider.includes("VITE_GIPHY_API_KEY"));
 assert.ok(provider.includes('cache:"no-store"'),"no API response caching");
 assert.ok(!provider.includes("fetchGifFile"),"no downloading or R2 copying GIPHY media");
 assert.ok(renderer.includes("gifById(id,controller.signal)"),"recipient fetches directly");
 assert.ok(renderer.includes("Powered By GIPHY"),"mandatory provider attribution");
 assert.ok(app.includes("onSendGif={sendGif}"));
 assert.ok(app.includes("text=encodeGif(id)"),"send as encrypted text message");
 assert.ok(app.includes("readGifId(m.content)?<GifMessage"),"render GIPHY ID without exposing raw token");
 assert.ok(!app.includes('onSendGif={file=>upload(file,"image")}'),"no third party media rehosting");
 assert.ok(server.includes("isGifToken"),"push notification does not reveal GIF ID");
});

test("Picker has GIF, Stickers and Emojis with search, favorites, recents and legacy send behavior",()=>{
 const picker=readFileSync("src/StickerPicker.tsx","utf8");
 const css=readFileSync("src/sticker-picker-premium.css","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 for(const text of ["Émojis","GIF","Stickers","Récents","Favoris","Rechercher un GIF",
  "Rechercher un emoji","onSendEmoji","onSendGif","gifsByIds","Powered By GIPHY"]){
  assert.ok(picker.includes(text),text);
 }
 assert.ok(picker.includes("onSend(id)"),"preserve sender transport");
 assert.ok(picker.includes("onSendEmoji(emoji)"),"emoji insert callback wired");
 assert.ok(picker.includes("onSendGif(item.id)"),"GIF IDs sent through text, no third party media saved");
 assert.ok(app.includes("function insertEmoji(emoji:string)"));
 assert.ok(app.includes('chatInput.current?.setSelectionRange(position,position)'));
 assert.ok(app.includes("function sendSticker(id:string)"));
 assert.ok(app.includes('onSend={sendSticker}'));
 assert.ok(css.includes("lr-emoji-grid"));
 assert.ok(css.includes("lr-gif-grid"));
 assert.ok(css.includes("height:clamp(275px,53dvh,510px)"));
});
