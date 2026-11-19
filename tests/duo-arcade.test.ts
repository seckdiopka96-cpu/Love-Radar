import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DRAW_WORDS,ESCAPE_SCENES,normalizeGuess,validStroke} from "../functions/lib/duo-arcade-rules";

test("drawing answers ignore accents, casing, whitespace and punctuation",()=>{
 assert.equal(normalizeGuess("  Cœur !  "),"COEUR");
 assert.equal(normalizeGuess(" GÂTEAU "),"GATEAU");
 assert.equal(normalizeGuess(""),"");
 assert.equal(normalizeGuess(null),"");
 assert.ok(DRAW_WORDS.length>=15);
 assert.equal(new Set(DRAW_WORDS.map(word=>word.word)).size,DRAW_WORDS.length);
});
test("the server validates normalized, bounded brush paths",()=>{
 assert.equal(validStroke({points:[[20,30],[35,40]],color:"#ffb6d0",width:4}),true);
 assert.equal(validStroke({points:[[20,30]],color:"#ffb6d0",width:4}),false);
 assert.equal(validStroke({points:[[20,30],[1001,40]],color:"#ffb6d0",width:4}),false);
 assert.equal(validStroke({points:[[20,30],[35,40]],color:"red",width:4}),false);
 assert.equal(validStroke({points:[[20,30],[35,40]],color:"#ffb6d0",width:99}),false);
 assert.equal(validStroke({points:Array.from({length:121},()=>[10,20]),color:"#ffb6d0",width:2}),false);
});
test("three escape rooms contain three unique solvable steps and split clues",()=>{
 assert.equal(ESCAPE_SCENES.length,3);
 for(const scene of ESCAPE_SCENES){
  assert.equal(scene.stages.length,3);
  for(const stage of scene.stages){
   assert.equal(stage.clues.length,2);
   assert.notEqual(stage.clues[0],stage.clues[1]);
   assert.ok(normalizeGuess(stage.answer).length>=4);
   assert.ok(stage.title&&stage.intro&&stage.placeholder);
  }
 }
});
test("game route, join, private room checks and push navigation are wired",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const hub=readFileSync("src/GamesHub.tsx","utf8");
 const server=readFileSync("functions/api/duo-arcade.ts","utf8");
 const ui=readFileSync("src/DuoArcade.tsx","utf8");
 const push=readFileSync("functions/lib/push.ts","utf8");
 for(const mode of ["draw","escape"]){
  assert.ok(app.includes('tab==="'+mode+'"'));
  assert.ok(hub.includes('onOpenGame("'+mode+'")'));
  assert.ok(ui.includes('game="+mode'));
  assert.ok(push.includes('"'+mode+'"'));
  assert.ok(server.includes('mode!=="'+mode+'"'));
 }
 assert.ok(server.includes("member.room_id"));
 assert.ok(server.includes("token_hash"));
 assert.ok(server.includes("member.seat"));
 assert.ok(server.includes("word:isDrawer||row.status"));
 assert.ok(!ui.includes("DRAW_WORDS"));
 assert.ok(!ui.includes("ESCAPE_SCENES"));
});

test("Devine mon dessin stays on one iPhone screen without moving the drawing board",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const ui=readFileSync("src/DuoArcade.tsx","utf8");
 const css=readFileSync("src/duo-arcade.css","utf8");
 assert.ok(app.includes('tab==="draw"&&room?"lr-draw-mode ":""'),"only drawing mode gets the no-scroll class");
 assert.ok(ui.includes('mode==="draw"?" lr-duo-draw":" lr-duo-escape-game"'),"drawing and escape each keep independent viewport classes");
 assert.ok(ui.includes('lr-duo-canvas-stage'),"square drawing uses its own available stage");
 assert.ok(ui.includes('new ResizeObserver(measure)'),"the drawing square fits changes in height/width");
 assert.ok(ui.includes('Math.min(stage.clientWidth,stage.clientHeight)'),"the canvas always fits both dimensions");
 assert.ok(ui.includes('style={canvasSize>0?{width:canvasSize,height:canvasSize}:undefined}'));
 assert.ok(css.includes('.lr-app.lr-app-locked.lr-draw-mode .lr-main'));
 assert.ok(css.includes('overflow:hidden!important;overscroll-behavior:none!important'));
 assert.ok(css.includes('.lr-duo-canvas-stage'));
 assert.ok(css.includes('touch-action:none!important'),"painting a stroke must not drag the page");
 assert.ok(css.includes('.lr-duo-answer:focus-within'),"the input floats above the iPhone keyboard");
 assert.ok(ui.includes('onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}'),"drawing stays interactive");
 assert.ok(ui.includes('onClick={()=>void act("clear")}'),"erase remains available");
 assert.ok(ui.includes('onClick={()=>void act("skip")}'),"skip remains available");
});

test("Escape Room Duo uses one fixed iPhone viewport for both solving and time-expired states",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const ui=readFileSync("src/DuoArcade.tsx","utf8");
 const css=readFileSync("src/duo-arcade.css","utf8");
 assert.ok(app.includes('tab==="escape"&&room?"lr-escape-mode ":""'),
  "only the Escape tab opts into the fixed screen layout");
 assert.ok(ui.includes('mode==="draw"?" lr-duo-draw":" lr-duo-escape-game"'));
 assert.ok(ui.includes('escape?<div className={"lr-duo-panel lr-duo-escape"+(ended?" is-ended":" is-solving")}'),
  "active rooms and expired rooms keep the same one-screen panel");
 assert.ok(css.includes('.lr-app.lr-app-locked.lr-escape-mode .lr-main'),
  "main area no longer scrolls while Escape is open");
 assert.ok(css.includes('.lr-app.lr-escape-mode .lr-duo.lr-duo-escape-game'),
  "room height is bounded by the usable screen");
 assert.ok(css.includes('.lr-app.lr-escape-mode .lr-duo-escape-game .lr-duo-panel.lr-duo-escape'),
  "the scenario card shrinks instead of pushing its buttons below the dock");
 assert.ok(css.includes('overflow:hidden!important;overscroll-behavior:none!important'),
  "no page-level vertical drag is possible");
 assert.ok(css.includes('.lr-app.lr-escape-mode .lr-duo-escape-game .lr-duo-end .lr-duo-primary'),
  "retry and next-room actions stay visible without scrolling");
 assert.ok(css.includes('.lr-app.lr-escape-mode .lr-duo-escape-game .lr-duo-clue'),
  "personal clues are kept inside the fixed puzzle panel");
 assert.ok(css.includes('.lr-app.lr-escape-mode .lr-duo-escape-game .lr-duo-answer:focus-within'),
  "the answer field remains usable above the iPhone keyboard");
 assert.ok(css.includes('.lr-app.lr-escape-mode .lr-duo-escape-game .lr-duo-footer'),
  "invite and talk shortcuts remain on-screen in portrait");
 assert.ok(css.includes('@media(max-width:700px) and (max-height:630px)'),
  "very short screens have compact optional copy");
 assert.ok(ui.includes('onClick={()=>void act("restart")}'),
  "expired room can still be restarted");
 assert.ok(ui.includes('onOpenChat}'),"chat shortcut remains available");
 assert.ok(ui.includes('onSubmit={submit}'),"the puzzle submission still works");
});
