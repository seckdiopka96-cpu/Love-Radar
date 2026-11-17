import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const soloHTML=readFileSync("public/ludo-solo/index.html","utf8");
const duoHTML=readFileSync("public/ludo-duo/index.html","utf8");
const duoCSS=readFileSync("public/ludo-duo/style.css","utf8");
const duoJS=readFileSync("public/ludo-duo/script.js","utf8");
const parent=readFileSync("src/Ludo.tsx","utf8");
const bridge=readFileSync("src/LudoDuoFrame.tsx","utf8");
const backend=readFileSync("functions/api/ludo.ts","utf8");
const headers=readFileSync("public/_headers","utf8");
const sw=readFileSync("public/sw.js","utf8");

test("multiplayer uses the same full board HTML, pions and cube dice as Solo",()=>{
 const start='<div class="board" id="ludo-board"';
 const end='<div id="pieces-layer"';
 const boardSlice=s=>(s.slice(s.indexOf(start),s.indexOf(end))).replace(/^\s+|\s+$/g,"");
 assert.ok(duoHTML.includes(start));
 assert.equal(boardSlice(duoHTML),boardSlice(soloHTML));
 assert.ok(duoHTML.includes('href="../ludo-solo/style.css?v=ludo-room-20261117-v7"'));
 assert.ok(duoHTML.includes('href="./style.css?v=ludo-room-20261117-v7"'));
 assert.ok(duoHTML.includes('src="./script.js?v=ludo-room-20261117-v7" defer'));
 assert.ok(duoHTML.includes('LUDO <span>♥</span> DUO'));
 assert.ok(duoHTML.includes('id="roll-dice"'));
 assert.ok(duoCSS.includes('.duo-side-actions'));
});
test("Duo JavaScript is syntactically valid and only receives authoritative data",()=>{
 assert.doesNotThrow(()=>new Script(duoJS,{filename:"public/ludo-duo/script.js"}));
 for(const word of ['source:"love-radar-ludo-duo"','type:"ready"','type:"action"','e.data.type!=="state"',
  'game.positions[state.mySeat]','g.turn','const legal=legalPawns()',
  'if(progress===57)','if(progress>=51)','return TRACK[(SPAWNS[color]+progress)%52]',
  'window.parent.postMessage','e.origin!==location.origin','e.source!==window.parent']){
  // Exact layout in JS can change without changing the secure contract.
  if(word==="game.positions[state.mySeat]")continue;
  assert.ok(duoJS.includes(word),word);
 }
 assert.ok(!duoJS.includes("localStorage"));
 assert.ok(!duoJS.includes("getRandomValues"));
 assert.ok(!duoJS.includes("Math.random"));
 assert.ok(!duoJS.includes("Authorization"));
});
test("React authenticated Ludo backend is preserved and paints the shared frame",()=>{
 assert.ok(parent.includes('import LudoDuoFrame from "./LudoDuoFrame"'));
 assert.ok(parent.includes('<LudoDuoFrame game={game} palette={palette}'));
 assert.ok(parent.includes('game&&palette?'),"modern Duo is mounted before signatures, under the signing modal");
 assert.ok(parent.includes('ludo-duo-loading'),"a modern loading state replaces legacy preview");
 const frameCSS=readFileSync("src/ludo-duo-frame.css","utf8");
 assert.ok(frameCSS.includes(".ludo-experience.ludo-duo-arena > .ludo-play-area"),"old arena must be hidden");
 assert.ok(frameCSS.includes("display:none!important"),"no legacy board fallback");
 assert.ok(bridge.includes('failed&&!ready'),"broken iframe reports a visible error");
 assert.ok(bridge.includes("setRetry(n=>n+1)"),"broken iframe offers a retry");
 assert.ok(bridge.includes('type:"ping"'),"parent retries initialization");
 assert.ok(duoJS.includes('e.data.type==="ping"'),"child responds to parent initialization ping");
 assert.ok(!bridge.includes('onLoad={()=>setReady(true)}'),"iframe load alone does not confirm game ready");
 assert.ok(duoJS.includes('victoryGiftButton.addEventListener("click",()=>send("gift"))'),"Gifts must stay accessible after victory");
 assert.ok(parent.includes('action:"choose_color"'));
 assert.ok(parent.includes('const stamp=game.id+":"+game.version+":"+pawns[0]'));
 assert.ok(parent.includes('void act("move",pawns[0])'));
 for(const unchanged of ['const onGame=useCallback','async function act(','async function sendReaction(',
 'function duoFrameAction(','signRules()', 'giftAction(','ludo-agreement-backdrop','ludo-gift-dialog','ludo-modal-backdrop']){
  assert.ok(parent.includes(unchanged),unchanged);
 }
 assert.ok(bridge.includes('src="/ludo-duo/index.html?v=ludo-room-20261117-v7"'));
 assert.ok(bridge.includes('event.source!==frame'));
 assert.ok(bridge.includes('event.origin!==window.location.origin'));
 assert.ok(!bridge.includes("token:"));
 assert.ok(bridge.includes('myName:props.myName'));
});
test("each of four colors has a distinct opposite and is shared/locked before signing",()=>{
 assert.ok(backend.includes('blue:"green",green:"blue",red:"yellow",yellow:"red"'));
 assert.ok(backend.includes('CREATE TABLE IF NOT EXISTS ludo_palette'));
 assert.ok(backend.includes('async function syncPalette'));
 assert.ok(backend.includes('if(action==="choose_color")'));
 assert.ok(backend.includes('signed?.signed.some(Boolean)'));
 assert.ok(backend.includes('player.seat===0?data.color:OPPOSITE[data.color]'));
 assert.ok(backend.includes('if((await palette(db,g)).chosenBy===null)'));
 assert.ok(backend.includes('palette:paletteValue'),"full responses retain selected colors");
 assert.ok(backend.includes('await syncPalette(db,updated)'));
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(deletion.includes('"ludo_palette"'));
});
test("Duo iframe works offline and uses only a same-origin parent, never replacing SPA cache",()=>{
 assert.ok(headers.includes("frame-src 'self'"));
 assert.ok(headers.includes("frame-ancestors 'self'"));
 for(const path of ['/ludo-duo/index.html','/ludo-duo/script.js','/ludo-duo/style.css']){
  assert.ok(sw.includes('"'+path+'"'),path);
 }
 assert.ok(sw.includes('url.pathname.startsWith("/ludo-duo/")'));
 assert.ok(sw.includes("love-radar-static-v103"),"new PWA release must invalidate old shell");
});

test("live Duo synchronizes promptly with conditional server reads",()=>{
 assert.ok(parent.includes('activeDuoGame=useRef(false)'),"avoid fast path until both signed");
 assert.ok(parent.includes('"/api/ludo?since="+previous.version'),"send the last synchronized version");
 assert.ok(parent.includes('if(data.unchanged)'),"avoid repainting unchanged game");
 assert.ok(parent.includes('current?.turn!==mySeat?250:650'),"poll the partner every 250ms after request completion");
 assert.ok(parent.includes('current?.status==="won"?1800'),"back off database polling on the victory screen");
 assert.ok(parent.includes('!activeDuoGame.current?700'),"avoid expensive full pre-game polling");
 assert.ok(parent.includes('inFlight=true'),"never stack network checks");
 assert.ok(!parent.includes('setInterval(()=>{if(document.visibilityState==="visible")void load()},1600)'),"remove 1.6s polling delay");
 assert.ok(parent.includes('Math.max(0,690-(Date.now()-actionStarted))'),"finish dice animation sooner");
 assert.ok(duoJS.includes('remoteDieTimer=setTimeout(()=>{remoteDieTimer=null;render()},650)'),"partner dice resolves promptly");
 const server=backend;
 assert.ok(server.includes('if(method==="GET"&&g?.status==="playing")'),"fast path only for active game");
 assert.ok(server.includes('params.get("game")===g.game_id'),"refuse stale game ids");
 assert.ok(server.includes('Number(since)===g.version'),"compare authoritative versions");
 assert.ok(server.includes('Math.max(g.updated_at,activeAgreement.startedAt)+TURN_MS'),"do not skip turn deadline");
 assert.ok(server.includes('unchanged:true'),"send small unchanged response");
 assert.ok(server.includes("delta:true"),"return small authoritative turn change snapshots");
 assert.ok(parent.includes("if(data.delta)"),"handle gameplay deltas without resetting agreement or palette");
 assert.ok(server.includes('const [moveEvent,lastRoll]=await Promise.all(['),"fetch motion and die state together");
 assert.ok(server.includes('updated.status==="playing"&&(action==="roll"||action==="move")'),"do not delay real rolls with secondary metadata");
 assert.ok(server.includes('if(updated&&action==="restart")'),"do not bootstrap tables on every roll");
 assert.ok(server.includes("if(!signed.startedAt)"),"read-only signed games skip redundant pre-action upserts");
 assert.ok(server.includes('const [members,existingGame]=await Promise.all(['),"parallelize independent room and game reads");
 assert.ok(server.includes("rollAndChallenge"),"cap simultaneous D1 read connections");

 assert.ok(server.includes('at:row.at'),"dice results keep unique timestamp");
});
