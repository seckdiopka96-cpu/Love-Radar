import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const solo=readFileSync("public/ludo-solo/script.js","utf8");
const duo=readFileSync("public/ludo-duo/script.js","utf8");
const soloCSS=readFileSync("public/ludo-solo/style.css","utf8");
const soloHTML=readFileSync("public/ludo-solo/index.html","utf8");
const duoHTML=readFileSync("public/ludo-duo/index.html","utf8");
const server=readFileSync("functions/api/ludo.ts","utf8");
const parent=readFileSync("src/Ludo.tsx","utf8");
const bridge=readFileSync("src/LudoDuoFrame.tsx","utf8");
const schema=readFileSync("schema.sql","utf8");

test("both complete vanilla games remain valid JavaScript",()=>{
 assert.doesNotThrow(()=>new Script(solo,{filename:"solo/script.js"}));
 assert.doesNotThrow(()=>new Script(duo,{filename:"duo/script.js"}));
});
test("actual 3D cube is not flattened by a Safari filter and all six faces are mapped",()=>{
 assert.ok(soloCSS.includes("filter:none!important;"));
 assert.ok(soloCSS.includes("transform-style:preserve-3d!important;"));
 assert.ok(soloCSS.includes("-webkit-transform-style:preserve-3d!important;"));
 assert.ok(soloCSS.includes("-webkit-backface-visibility:hidden!important;"));
 assert.ok(soloCSS.includes("perspective:360px"));
 for(let n=1;n<=6;n++){
  assert.ok(soloCSS.includes('data-face="'+n+'"'),"final cube face "+n);
 }
 assert.ok(soloCSS.includes("@keyframes dice-tumble-real"));
 assert.ok(soloCSS.includes(".dice-3d.is-rolling{"));
 assert.ok(soloCSS.includes("animation:dice-tumble-real"));
});
test("Solo and Duo both display the final real die result, separate from transient animation",()=>{
 for(const html of [soloHTML,duoHTML]){
  assert.ok(html.includes('id="die-result"'));
  assert.ok(html.includes('id="dice-3d"'));
 }
 assert.ok(solo.includes("game.lastRoll=value"));
 assert.ok(solo.includes("lastRoll=game.die||((Number.isInteger(game.lastRoll)"));
 assert.ok(solo.includes('dieResult.textContent=String(lastRoll)'));
 assert.ok(duo.includes("const diceValue=g.dice??last?.face??"));
 assert.ok(duo.includes('dieResult.textContent=rollingNow?"·":String(diceValue)'));
 assert.ok(duo.includes("lastAnimatedRoll"));
 assert.ok(duo.includes("remoteDieTimer"));
 assert.ok(duo.includes("receivedState"));
 assert.ok(!duo.includes("dé\\\\s"),"regexp must have real whitespace escapes");
});
test("Solo hops through every cell, shows step number and animates captures back to home",()=>{
 assert.ok(solo.includes("for (let step=first;step<=target;step++)"));
 assert.ok(solo.includes("counter.textContent=(step-first+1)+"));
 assert.ok(solo.includes("start===HOME?380:260"));
 assert.ok(solo.includes("async function animateCapture("));
 assert.ok(solo.includes("await Promise.all(captured.map("));
 assert.ok(solo.includes("renderPawns();\\n    const captured")||solo.includes("renderPawns();\n    const captured"));
 assert.ok(soloCSS.includes(".piece-step-counter"));
 assert.ok(soloCSS.includes(".piece--captured{z-index:25"));
 assert.ok(soloCSS.includes("transition:left .54s"));
});
test("Duo retains one moving DOM pawn across server hop frames and returns real die to both phones",()=>{
 assert.ok(duo.includes('movementLayer.className="pieces-layer ludo-duo-motion-overlay"'));
 assert.ok(duo.includes("let movingPawn=null,movingKey="));
 assert.ok(duo.includes("function drawMotion()"));
 assert.ok(duo.includes("if(!movingPawn||movingKey!==id)"));
 assert.ok(duo.includes("pawn.style.left=to.x"));
 assert.ok(duo.includes("pawn.style.top=to.y"));
 assert.ok(duo.includes('drawMotion();'));
 assert.ok(duo.includes('progress.textContent=')||duo.includes('marker.textContent='));
 assert.ok(bridge.includes("lastRoll:props.lastRoll"));
 assert.ok(parent.includes("lastRoll={lastRoll}"));
 assert.ok(parent.includes("setLastRoll(data.lastRoll||null)"));
 assert.ok(server.includes("CREATE TABLE IF NOT EXISTS ludo_last_rolls"));
 assert.ok(server.includes('getLastRoll(db,g)'));
 assert.ok(server.includes("await rememberLastRoll(db,updated,player.seat,thrownFace)"));
 assert.ok(server.includes("await rememberLastRoll(db,updated,acting,autoRoll)"));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS ludo_last_rolls"));
 const cleanup=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(cleanup.includes('"ludo_last_rolls"'));
});
