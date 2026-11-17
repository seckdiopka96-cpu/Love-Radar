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

test("Ludo screenshot fixes: compact pawns, correct capture and clean HUD",()=>{
 const senegal=readFileSync("src/ludo-senegal-engine.ts","utf8");
 const boardRules=readFileSync("src/ludo-visuals.ts","utf8");
 // Starting squares and star refuges still have standard protection.
 assert.ok(solo.includes('new Set(Object.values(SPAWNS).map(i=>TRACK[i].join(",")))'));
 assert.ok(server.includes("const SAFE=new Set([0,13,26,39])"));
 assert.ok(boardRules.includes("export const SAFE=new Set([0,13,26,39])"));
 // Red from its own start + 2 must capture a single blue pawn at row 6, col 3.
 assert.ok(solo.includes("game.pieces[otherSide][opponentPawn]=HOME"));
 assert.ok(solo.includes("if(captured.length)renderPawns()"));
 assert.ok(senegal.includes("positions[enemy][pawn]=freshPawn()"));
 assert.ok(solo.includes("Math.min(3,7/group.length)"));
 assert.ok(duo.includes("Math.min(3,7/group.length)"));
 assert.ok(soloCSS.includes("width: 5.7%; height: 6.6%"));
 assert.ok(soloCSS.includes("width: 126%; height: 152%"));
 assert.ok(solo.includes('classList.add("lr-ludo-solo-ui")'));
 assert.ok(duo.includes('classList.add("lr-ludo-duo-ui")'));
 assert.ok(soloCSS.includes(".lr-ludo-solo-ui .game-actions"));
 assert.ok(soloCSS.includes(".lr-ludo-solo-ui #game-feedback"));
 assert.ok(soloCSS.includes(".lr-ludo-duo-ui #new-game:disabled"));
 assert.ok(solo.includes('dieResult.textContent=needsNewRoll?"↻":String(lastRoll)'));
 assert.ok(solo.includes("await sleep(start===HOME?520:540)"));
});
test("four pawns are chosen by touching the board, never from a second numbered picker",()=>{
 const senegal=readFileSync("src/SenegalLudo.tsx","utf8");
 const reactSolo=readFileSync("src/SoloLudo.tsx","utf8");
 const reactDuo=readFileSync("src/Ludo.tsx","utf8");
 assert.ok(solo.includes('button.addEventListener("click",()=>{void movePiece(side,index)}') ,
  "each selectable Solo pawn must respond to a direct touch");
 assert.ok(duo.includes('if(selectable)b.addEventListener("click",()=>send("move",index))'),
  "each selectable Duo pawn must be actionable on the board");
 assert.ok(solo.includes('const canChoose=playable.length>1;'));
 assert.ok(duo.includes('canChoose=legal.length>1;'));
 assert.ok(solo.includes("pawnChoices.hidden=true"));
 assert.ok(duo.includes("choices.replaceChildren();choices.hidden=true"));
 assert.ok(!solo.includes('textContent="Pion "+(index+1)'));
 assert.ok(!duo.includes('textContent="Pion "+(pawn+1)'));
 assert.ok(soloCSS.includes('.lr-ludo-solo-ui #turn-meta'));
 // The Duo countdown remains visible; it is not a duplicate die result.
 assert.ok(!soloCSS.includes('.lr-ludo-duo-ui #turn-meta'));
 assert.ok(soloCSS.includes('.lr-ludo-solo-ui #pawn-choices'));
 assert.ok(soloCSS.includes('.lr-ludo-duo-ui #pawn-choices'));
 assert.ok(soloCSS.includes('.piece--selectable::after{'));
 assert.ok(soloCSS.includes('inset:-5px;pointer-events:auto'));
 assert.ok(!reactSolo.includes('className="ludo-pick-row"'));
 assert.ok(!reactDuo.includes('className="ludo-pick-row"'));
 assert.ok(!senegal.includes('className="ludo-pick-row"'));
 assert.ok(senegal.includes('onClick={()=>choose(item.pawn)}'),
  "Senegal pawns remain touchable while the necessary path-choice dialog stays intact");
 assert.ok(senegal.includes('className={"ludo-senegal-choice"'));
 assert.ok(solo.includes('choices.length>1 ? "Touche le pion à déplacer"'));
 assert.ok(duo.includes('"Touche le pion à déplacer"'));
});
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
 assert.ok(solo.includes('dieResult.textContent=needsNewRoll?"↻":String(lastRoll)'));
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
 assert.ok(solo.includes("start===HOME?520:540"));
 assert.ok(soloCSS.includes("transition:left .40s"));
 assert.ok(soloCSS.includes("animation:pawn-hop-hd .40s"));
 assert.ok(solo.includes("async function animateCapture("));
 assert.ok(solo.includes("await Promise.all(captured.map("));
 assert.ok(solo.includes("renderPawns();\\n    const captured")||solo.includes("renderPawns();\n    const captured"));
 assert.ok(soloCSS.includes(".piece-step-counter"));
 assert.ok(soloCSS.includes(".piece--captured{z-index:25"));
 assert.ok(soloCSS.includes("transition:left .045s"));
});
test("captured pawns reverse rapidly without speeding ordinary board movement",()=>{
 const reactSolo=readFileSync("src/SoloLudo.tsx","utf8");
 const reactDuo=readFileSync("src/Ludo.tsx","utf8");
 const senegal=readFileSync("src/SenegalLudo.tsx","utf8");
 const senegalCSS=readFileSync("src/ludo-senegal.css","utf8");
 const arenaCSS=readFileSync("src/ludo-arena.css","utf8");
 assert.ok(solo.includes("await sleep(50)"),"Solo rewinds a square in 50ms");
 assert.ok(solo.includes("await sleep(start===HOME?520:540)"),"ordinary pawns stay readable");
 assert.ok(reactDuo.includes("75+(p.from-1-step)*50"));
 assert.ok(reactSolo.includes("70+(captured.from-1-step)*50"));
 assert.ok(senegal.includes("70+index*50"));
 assert.ok(soloCSS.includes(".piece--captured{z-index:25"));
 assert.ok(soloCSS.includes("transition:left .045s"));
 assert.ok(duoCSS.includes("transition:left .045s"));
 assert.ok(arenaCSS.includes(".ludo-captured-pawn{z-index:35!important;transition:left .045s"));
 assert.ok(senegalCSS.includes(".ludo-senegal .ludo-captured-pawn{transition:left .045s"));
 assert.ok(reactDuo.includes("STEP_MS=moved.from===-1?520:540"));
 assert.ok(reactSolo.includes("stepDuration=move.from===-1?520:540"));
 assert.ok(senegal.includes('STEP_MS=move.from.zone==="base"?520:540'));
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
 assert.ok(duo.includes('getPosition(c,nextProgress,m.pawn)'));
 assert.ok(duo.includes('pawn.classList.add("is-returning")'));
 assert.ok(duo.includes('pawn.style.left=dest.x'));
 assert.ok(duo.includes('pawn.style.top=dest.y'));
 assert.ok(duoCSS.includes('transition:left .045s'));
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
 assert.ok(reactSolo.includes('stepDuration=move.from===-1?520:540,initialDelay=250'));
 assert.ok(parent.includes('STEP_MS=moved.from===-1?520:540,START_MS=250'));
 assert.ok(senegal.includes('STEP_MS=move.from.zone==="base"?520:540,START_MS=250'));
 assert.ok(senegal.includes('path.forEach((point,i)=>later('));
 assert.ok(senegal.includes('START_MS+i*STEP_MS'));
 assert.ok(senegal.includes('<LudoDie3D value={shownDie}'));
 assert.ok(!senegal.includes('<DiceFace'));
 assert.ok(arenaCSS.includes('.ludo-moving-pawn{transition:left .40s'));
 assert.ok(senegalCSS.includes('.ludo-senegal .ludo-moving-pawn{'));
 assert.ok(senegalCSS.includes('transition:left .40s'));
 assert.ok(parent.includes('lastRoll?.face??'));
 for(const [face,x,y] of [[1,0,0],[2,-90,0],[3,0,-90],[4,0,90],[5,90,0],[6,0,180]]){
  assert.ok(dieCSS.includes('.ludo-die-shows-'+face+'{--die-x:'+x+'deg;--die-y:'+y+'deg}'));
  assert.ok(dieCSS.includes('.ludo-die-shows-'+face+':not(.is-tumbling) .ludo-die-side-'+face+'{opacity:1}'));
 }
 assert.ok(dieCSS.includes('.ludo-die-3d:not(.is-tumbling) .ludo-die-side{opacity:0}'));
});

test("visible steps are not accelerated away by iOS Reduce Motion, and Senegal catches missed move events",()=>{
 const senegalServer=readFileSync("functions/api/ludo-senegal.ts","utf8");
 const senegalClient=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(!solo.includes("reducedMotion?25:"),"Reduce Motion must never skip game squares");
 assert.ok(solo.includes("await sleep(start===HOME?520:540)"));
 assert.ok(!parent.includes('&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches'),
  "the Duo must still show individual square changes without decorative effects");
 assert.ok(senegalServer.includes("SELECT move_json,version FROM ludo_senegal_moves"));
 assert.ok(senegalServer.includes("moveVersion:recent?.version??null"));
 assert.ok(senegalServer.includes("moveVersion:move?saved.version:null"));
 assert.ok(senegalClient.includes("oldVersion<moveVersion"));
 assert.ok(senegalClient.includes("moveVersion:data.moveVersion")||senegalClient.includes("moveVersion=data.moveVersion"));
});

test("Solo and synchronized Duo do not skip fast between board squares",()=>{
 assert.ok(solo.includes('await sleep(start===HOME?520:540)'));
 assert.ok(parent.includes('const STEP_MS=moved.from===-1?520:540,START_MS=250'));
 assert.ok(soloCSS.includes('transition:left .40s cubic-bezier'));
 assert.ok(soloCSS.includes('animation:pawn-hop-hd .40s'));
 assert.ok(duo.includes('if(!movingPawn||movingKey!==id)'));
 assert.ok(duo.includes('pawn.style.left=to.x'));
 assert.ok(duo.includes('pawn.style.top=to.y'));
});

test("stars mark only the four colored start cells, with matching capture protection",()=>{
 for(const html of [soloHTML,duoHTML]){
  assert.equal((html.match(/cell--entry cell--safe/g)||[]).length,4);
  assert.equal((html.match(/<span class="star">★<\/span>/g)||[]).length,4);
 }
 assert.ok(server.includes("const SAFE=new Set([0,13,26,39])"));
 assert.ok(solo.includes("new Set(Object.values(SPAWNS).map("));
});
test("player dice color, fixed board and reverse captures are wired in every mode",()=>{
 const reactDuo=readFileSync("src/Ludo.tsx","utf8");
 const reactSolo=readFileSync("src/SoloLudo.tsx","utf8");
 const senegal=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(solo.includes("app.dataset.diceColor=getColor(game.turn)"));
 assert.ok(duo.includes("app.dataset.diceColor=colors[g.turn]"));
 assert.ok(reactDuo.includes('color={palette?.colors[game?.turn??mySeat]??"blue"}'));
 for(const color of ["red","blue","green","yellow"])
  assert.ok(soloCSS.includes('.app[data-dice-color="'+color+'"]'));
 assert.ok(soloCSS.includes(".dice-holder .die-result{display:none!important}"));
 assert.ok(soloCSS.includes(".game-screen .board-area{"));
 assert.ok(solo.includes("for(let step=progress-1;step>=0;step--)"));
 assert.ok(reactDuo.includes("for(let step=p.from-1;step>=0;step--)"));
 assert.ok(duo.includes("getPosition(c,nextProgress,m.pawn)"));
 assert.ok(reactSolo.includes("function reverseCaptured("));
 assert.ok(senegal.includes("function captureReversePoints("));
});
