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
  assert.ok(server.includes('mode==="'+mode+'"'));
 }
 assert.ok(server.includes("member.room_id"));
 assert.ok(server.includes("token_hash"));
 assert.ok(server.includes("member.seat"));
 assert.ok(server.includes("word:isDrawer||row.status"));
 assert.ok(!ui.includes("DRAW_WORDS"));
 assert.ok(!ui.includes("ESCAPE_SCENES"));
});
