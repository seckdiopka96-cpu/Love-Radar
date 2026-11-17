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
 assert.ok(solo.includes("start===HOME?800:760"));
 assert.ok(soloCSS.includes("transition:left .64s"));
 assert.ok(soloCSS.includes("animation:pawn-hop-hd .65s"));
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


test("Duo captures visibly return through a stable animation overlay",()=>{
 const duoCSS=readFileSync("public/ludo-duo/style.css","utf8");
 assert.ok(duo.includes('captureLayer.className="pieces-layer ludo-duo-capture-overlay"'));
 assert.ok(duo.includes("const capturePins=new Map()"));
 assert.ok(duo.includes("function drawCaptured()"));
 assert.ok(duo.includes('getPosition(c,-1,m.pawn)'));
 assert.ok(duo.includes('pawn.classList.add("is-returning")'));
 assert.ok(duo.includes('pawn.style.left=dest.x'));
 assert.ok(duo.includes('pawn.style.top=dest.y'));
 assert.ok(duoCSS.includes('transition:left .54s'));
});


test("3D die settles with exactly one face facing the viewer for all six values",()=>{
 const expected={1:[0,0],2:[-90,0],3:[0,-90],4:[0,90],5:[90,0],6:[0,180]};
 for(const [face,[x,y]] of Object.entries(expected)){
  const selector='.dice-3d:not(.is-rolling)[data-face="'+face+'"]';
  const angle='transform:rotateX('+x+'deg) rotateY('+y+'deg)!important';
  assert.ok(soloCSS.includes(selector+'{'+angle+'}'),"only face "+face+" should point toward the player");
  assert.ok(soloCSS.includes(selector+' .dice-face--'+face),"die face "+face+" should remain visible");
 }
 assert.ok(soloCSS.includes('.dice-3d:not(.is-rolling) .dice-face{opacity:0}'),
  "side faces must disappear after rolling");
 assert.ok(soloCSS.includes('animation:dice-tumble-real'),
  "physical tumble animation must remain");
});

test("React Solo, Duo and Senegal use a single-face die and readable movement",()=>{
 const reactSolo=readFileSync("src/SoloLudo.tsx","utf8");
 const senegal=readFileSync("src/SenegalLudo.tsx","utf8");
 const dieCSS=readFileSync("src/ludo-die-3d.css","utf8");
 const arenaCSS=readFileSync("src/ludo-arena.css","utf8");
 const senegalCSS=readFileSync("src/ludo-senegal.css","utf8");
 assert.ok(reactSolo.includes('stepDuration=move.from===-1?850:780,initialDelay=530'));
 assert.ok(parent.includes('STEP_MS=moved.from===-1?850:780,START_MS=530'));
 assert.ok(senegal.includes('STEP_MS=move.from.zone==="base"?850:780,START_MS=530'));
 assert.ok(senegal.includes('path.forEach((point,i)=>later('));
 assert.ok(senegal.includes('START_MS+i*STEP_MS'));
 assert.ok(senegal.includes('<LudoDie3D value={shownDie}'));
 assert.ok(!senegal.includes('<DiceFace'));
 assert.ok(arenaCSS.includes('.ludo-moving-pawn{transition:left .64s'));
 assert.ok(senegalCSS.includes('.ludo-senegal .ludo-moving-pawn{'));
 assert.ok(senegalCSS.includes('transition:left .64s'));
 assert.ok(parent.includes('lastRoll?.face??'));
 for(const [face,x,y] of [[1,0,0],[2,-90,0],[3,0,-90],[4,0,90],[5,90,0],[6,0,180]]){
  assert.ok(dieCSS.includes('.ludo-die-shows-'+face+'{--die-x:'+x+'deg;--die-y:'+y+'deg}'));
  assert.ok(dieCSS.includes('.ludo-die-shows-'+face+':not(.is-tumbling) .ludo-die-side-'+face+'{opacity:1}'));
 }
 assert.ok(dieCSS.includes('.ludo-die-3d:not(.is-tumbling) .ludo-die-side{opacity:0}'));
});

test("Solo and synchronized Duo do not skip fast between board squares",()=>{
 assert.ok(solo.includes('await sleep(reducedMotion?25:(start===HOME?800:760))'));
 assert.ok(parent.includes('const STEP_MS=moved.from===-1?850:780,START_MS=530'));
 assert.ok(soloCSS.includes('transition:left .64s cubic-bezier'));
 assert.ok(soloCSS.includes('animation:pawn-hop-hd .65s'));
 assert.ok(duo.includes('if(!movingPawn||movingKey!==id)'));
 assert.ok(duo.includes('pawn.style.left=to.x'));
 assert.ok(duo.includes('pawn.style.top=to.y'));
});
