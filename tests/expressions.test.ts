import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {EMOJIS,EMOJI_CATEGORIES,filterEmojis} from "../src/emoji-catalog";
import {STICKERS,MOTION_STICKERS,encodeSticker,readStickerId} from "../src/stickers";
import {validGifUrl,readGifResults,readGiphyPage,GIPHY_PAGE_SIZE,readGifId,encodeGif} from "../src/gif-provider";

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
 assert.ok(art.includes("sticker.motion??motions["),"all stickers get a deterministic motion, not only the first 32");
 assert.ok(css.includes(".lr-sticker-art.lr-motion-heartbeat"));
 assert.ok(css.includes(".lr-sticker-art.lr-motion-shake"));
 assert.ok(css.includes(".lr-sticker-art.lr-motion-kiss"));
 assert.ok(css.includes("html.lr-animations-on"),"native and PWA sticker motion enabled by default");
 assert.ok(css.includes("html.lr-animations-off"),"user can pause motion");
});

test("Emoji messages animate on both sides without changing the transported text",()=>{
 const renderer=readFileSync("src/AnimatedEmojiText.tsx","utf8");
 const css=readFileSync("src/animated-emoji.css","utf8");
 const picker=readFileSync("src/StickerPicker.tsx","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(renderer.includes("emojiOnlyText"),"detect emoji-only messages");
 assert.ok(renderer.includes("content.split(emojiRegExp)"),"animate each emoji in ordinary text too");
 assert.ok(renderer.includes("emojiMotionClass(part)"),"attach animation classes");
 assert.ok(css.includes("@keyframes lr-emoji-heartbeat"));
 assert.ok(css.includes("@keyframes lr-emoji-shake"));
 assert.ok(css.includes("html.lr-animations-on"),"emoji animation enabled even in iOS PWA");
 assert.ok(css.includes("html.lr-animations-off"),"user can pause emoji animation");
 assert.ok(picker.includes("emojiMotionClass(emoji)"),"emoji picker visibly animates");
 assert.ok(picker.includes("toggleMotion"),"user can toggle motion directly in the picker");
 const motion=readFileSync("src/motion-mode.ts","utf8");
 const main=readFileSync("src/main.tsx","utf8");
 assert.ok(motion.includes("lr-animations-on"));
 assert.ok(motion.includes("lr-animations-off"));
 assert.ok(main.includes("initializeMotionMode()"));
 assert.ok(app.includes("emojiOnlyText(m.content)"),"solo emoji gets a larger chat bubble");
 assert.ok(app.includes('<AnimatedEmojiText content={m.content||""}/>'),"both sender and receiver use the same component");
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
 assert.ok(renderer.includes('className="lr-chat-gif-brand"'),"sent GIF shows a small source watermark");
 assert.ok(renderer.includes('GIPHY</figcaption>'),"GIF source mark is concise");
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
 for(const text of ["Émojis","GIF","Stickers","Récents","Rechercher un GIF",
  "Rechercher un emoji","onSendEmoji","onSendGif","GiphyCatalogue"]){
  assert.ok(picker.includes(text),text);
 }
 assert.ok(picker.includes("onSend(id)"),"preserve sender transport");
 assert.ok(picker.includes("onSendEmoji(emoji)"),"emoji insert callback wired");
 assert.ok(readFileSync("src/GiphyCatalogue.tsx","utf8").includes("onSendGif(item.id)"),"GIF IDs sent through text, no third party media saved");
 assert.ok(app.includes("function insertEmoji(emoji:string)"));
 assert.ok(app.includes('chatInput.current?.setSelectionRange(position,position)'));
 assert.ok(app.includes("function sendSticker(id:string)"));
 assert.ok(app.includes('onSend={sendSticker}'));
 assert.ok(css.includes("lr-emoji-grid"));
 assert.ok(css.includes("lr-gif-grid"));
 assert.ok(css.includes("height:clamp(275px,53dvh,510px)"));
});


test("GIF provider is the default expression tab only when a GIPHY key is configured",()=>{
 const picker=readFileSync("src/StickerPicker.tsx","utf8");
 assert.ok(picker.includes('useState<Mode>(GIPHY_KEY?"gif":"stickers")'));
 assert.ok(picker.includes('<GiphyCatalogue key="gif" kind="gif"'));
 assert.ok(picker.includes('<GiphyCatalogue key="sticker" kind="sticker"'));
 assert.ok(picker.includes('<GiphyCatalogue key="emoji" kind="emoji"'));
});

test("Pages CSP allows GIPHY API requests and animated media without opening other origins",()=>{
 const headers=readFileSync("public/_headers","utf8");
 const csp=headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]||"";
 assert.ok(csp,"Cloudflare Pages must publish a CSP");
 const rules=Object.fromEntries(csp.split(";").map(part=>part.trim().split(/\s+/))
  .filter(parts=>parts.length>1).map(([directive,...sources])=>[directive,sources]));
 const connections=rules["connect-src"]||[];
 const images=rules["img-src"]||[];
 assert.ok(connections.includes("https://api.giphy.com"),"Safari fetch must be permitted by connect-src");
 assert.ok(images.includes("https://*.giphy.com"),"GIF thumbnails from media0..N.giphy.com must be permitted");
 assert.ok(!connections.includes("*")&&!images.includes("*"),"CSP must stay narrowly scoped");
 assert.ok((rules["default-src"]||[]).includes("'self'"));
 const provider=readFileSync("src/gif-provider.ts","utf8");
 assert.ok(provider.includes('new URL("https://api.giphy.com/v1/gifs"+path)'),"CSP matches direct provider requests");
 assert.ok(provider.includes('response.status===429'),"explain rate-limit problems");
 assert.ok(provider.includes('response.status===401||response.status===403'),"explain invalid API key");
 assert.ok(provider.includes('Connexion à GIPHY impossible.'),"avoid raw WebKit Load failed errors");
});

test("GIPHY picker credits provider subtly above results and sent GIFs have an overlaid source mark",()=>{
 const picker=readFileSync("src/StickerPicker.tsx","utf8");
 const catalog=readFileSync("src/GiphyCatalogue.tsx","utf8");
 const pickerStyles=readFileSync("src/sticker-picker-premium.css","utf8");
 const render=readFileSync("src/GifMessage.tsx","utf8");
 const renderStyles=readFileSync("src/gif-message.css","utf8");
 assert.ok(catalog.includes('className="lr-gif-attribution" aria-label="Powered By GIPHY"'));
 assert.ok(catalog.includes("Powered by <strong>GIPHY</strong>"));
 assert.ok(!catalog.includes('className="lr-sticker-footer"><strong>Powered By GIPHY</strong>'),
  "picker does not waste space with a bottom GIPHY attribution bar");
 assert.ok(pickerStyles.includes(".lr-expressive-picker .lr-gif-attribution"));
 assert.ok(render.includes('className="lr-chat-gif-media"'));
 assert.ok(render.includes('className="lr-chat-gif-brand"'));
 assert.ok(renderStyles.includes("position:absolute;left:9px;bottom:8px"));
 assert.ok(renderStyles.includes("pointer-events:none"));
});

test("GIPHY API supports 50 results, raw pagination offsets and distinct sticker/emoji endpoints",()=>{
 assert.equal(GIPHY_PAGE_SIZE,50);
 const fake=Array.from({length:50},(_,i)=>({
  id:"TEST"+String(i).padStart(3,"0"),
  title:"GIF "+i,
  images:{fixed_width:{url:"https://media.giphy.com/media/example/giphy.gif"},
   downsized:{url:"https://media2.giphy.com/media/example/giphy.gif"}}
 }));
 assert.equal(readGifResults({data:fake}).length,50);
 const page=readGiphyPage({data:fake,pagination:{count:50,total_count:125}},0);
 assert.equal(page.items.length,50);
 assert.equal(page.nextOffset,50);
 assert.equal(page.hasMore,true);
 const next=readGiphyPage({data:fake,pagination:{count:50,total_count:125}},50);
 assert.equal(next.nextOffset,100);
 const last=readGiphyPage({data:fake.slice(0,25),pagination:{count:25,total_count:125}},100);
 assert.equal(last.hasMore,false);
 assert.equal(last.nextOffset,125);
 assert.equal(readGiphyPage({data:[],pagination:{count:0,total_count:0}},0).hasMore,false);
 const provider=readFileSync("src/gif-provider.ts","utf8");
 assert.ok(provider.includes('new URL("https://api.giphy.com/v1/stickers"+path)'));
 assert.ok(provider.includes('new URL("https://api.giphy.com/v2/emoji")'));
 assert.ok(provider.includes('new URL("https://api.giphy.com/v1/gifs"+path)'));
 assert.ok(provider.includes('limit:String(GIPHY_PAGE_SIZE)'));
 assert.ok(provider.includes('offset:String(safeOffset)'));
 assert.ok(provider.includes('q:value'),"send exact user search term");
 assert.ok(provider.includes('cache:"no-store"'),"do not cache provider responses");
});

test("GIPHY collections paginate only near end, avoid stale results and send opaque IDs",()=>{
 const catalog=readFileSync("src/GiphyCatalogue.tsx","utf8");
 const picker=readFileSync("src/StickerPicker.tsx","utf8");
 const css=readFileSync("src/sticker-picker-premium.css","utf8");
 assert.ok(catalog.includes("onScroll={onScroll}"));
 assert.ok(catalog.includes("element.scrollTop+element.clientHeight>=element.scrollHeight-220"));
 assert.ok(catalog.includes("browseGiphy(kind,effectiveQuery,nextOffset,controller.signal)"));
 assert.ok(catalog.includes("pagingBusy.current=true"));
 assert.ok(catalog.includes("pagingController.current?.abort()"));
 assert.ok(catalog.includes("generation.current!==epoch"));
 assert.ok(catalog.includes("!known.has(item.id)"));
 assert.ok(catalog.includes("onSendGif(item.id)"));
 assert.ok(catalog.includes('localStorage.setItem(key,JSON.stringify(ids))'));
 assert.ok(!catalog.includes("preview:"));
 assert.ok(picker.includes('Stickers GIPHY'));
 assert.ok(picker.includes('Émojis GIPHY'));
 assert.ok(picker.includes('Classiques'));
 assert.ok(css.includes(".lr-giphy-source-switch"));
 assert.ok(css.includes(".lr-giphy-emoji .lr-gif-grid"));
});
