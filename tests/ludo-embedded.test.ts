import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const host=readFileSync("src/LudoSoloEmbedded.tsx","utf8");
const css=readFileSync("src/ludo-solo-embedded.css","utf8");
const page=readFileSync("public/ludo-solo/index.html","utf8");
const gameCSS=readFileSync("public/ludo-solo/style.css","utf8");
const js=readFileSync("public/ludo-solo/script.js","utf8");
const headers=readFileSync("public/_headers","utf8");
const sw=readFileSync("public/sw.js","utf8");

test("Jeux > Ludo contre l'ordinateur opens the new complete HTML/CSS/JS game inside Love Radar",()=>{
 assert.ok(app.includes('import LudoSoloEmbedded from "./LudoSoloEmbedded";'));
 assert.ok(app.includes('tab==="ludo-solo"?<LudoSoloEmbedded scope={room.roomId+":"+room.user.id} onExit={()=>navigate("games")}/>:null'));
 assert.ok(!app.includes('tab==="ludo-solo"?<SoloLudo '),"old game no longer opens through this route");
 assert.ok(host.includes('src="/ludo-solo/index.html?scope="')||host.includes('const src="/ludo-solo/index.html?scope="'));
 assert.ok(host.includes('src={src}'));
 assert.ok(host.includes('onClick={onExit}'));
 assert.ok(host.includes('loading="eager"'));
 assert.ok(css.includes('height:100%!important'));
 assert.ok(css.includes('env(safe-area-inset-top)'));
});
test("complete standalone game is bundled as three first-party static files",()=>{
 assert.ok(page.startsWith("<!doctype html>"));
 assert.ok(page.includes('href="./style.css"'));
 assert.ok(page.includes('src="./script.js" defer'));
 assert.ok(page.includes('id="couleur-blue"'));
 assert.ok(page.includes('id="couleur-red"'));
 assert.ok(page.includes('id="couleur-green"'));
 assert.ok(page.includes('id="couleur-yellow"'));
 assert.ok(page.includes('id="roll-dice"'));
 assert.ok(page.includes('id="ludo-board"'));
 assert.ok(page.includes('id="pieces-layer"'));
 assert.ok(page.includes('id="win-dialog"'));
 assert.ok(gameCSS.length>20000);
 assert.ok(js.length>20000);
 assert.ok(!page.includes('<script>'),"game logic is a separate JavaScript file");
});
test("real classic rules, computer opponent and scoped save stay available",()=>{
 for(const text of ["function getRoll","function rollDie","function movePiece","function validMoves","function makeGame","function maybeComputer","function startNewGame"]){
  assert.ok(js.includes(text),text);
 }
 assert.ok(js.includes('const FINAL = 56'));
 assert.ok(js.includes('TRACK.length !== 52'));
 assert.ok(js.includes('const SCOPE = (new URLSearchParams(window.location.search).get("scope")'));
 assert.ok(js.includes('"love-radar-ludo-solo-v2:"+SCOPE'));
 assert.ok(js.includes('localStorage.setItem(SAVE_KEY'));
 assert.ok(js.includes('function save'));
 assert.ok(js.includes('CPU_COLOR'));
 assert.ok(!js.includes('document.cookie'),"game never accesses authentication cookies");
});
test("CSP permits only same-origin embedded games and the service worker cannot replace the app with Ludo",()=>{
 assert.ok(headers.includes("frame-src 'self'"));
 assert.ok(headers.includes("frame-ancestors 'self'"));
 assert.ok(!headers.includes("frame-ancestors *"));
 assert.ok(sw.includes('"/ludo-solo/index.html"'));
 assert.ok(sw.includes('"/ludo-solo/style.css"'));
 assert.ok(sw.includes('"/ludo-solo/script.js"'));
 assert.ok(sw.includes('url.pathname.startsWith("/ludo-solo/")'));
 assert.ok(sw.includes('url.pathname.startsWith("/ludo-duo/")'));
 assert.ok(sw.includes('if(url.pathname!=="/"&&url.pathname!=="/index.html")return'));
 assert.ok(sw.includes('if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return'));
});
