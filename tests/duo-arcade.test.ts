import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestGet,onRequestPost} from "../functions/api/duo-arcade";
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

function duoHarness(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,name TEXT NOT NULL,room_id TEXT NOT NULL,"+
  "seat INTEGER NOT NULL,token_hash TEXT NOT NULL)");
 for(const [letter,seat,room] of [["a",0,"room-A"],["b",1,"room-A"],["c",0,"room-B"],["d",1,"room-B"]] as const){
  sqlite.prepare("INSERT INTO members VALUES(?,?,?,?,?)").run(
   letter,letter.toUpperCase(),room,seat,createHash("sha256").update(letter.repeat(64)).digest("hex"));
 }
 const bound=(sql:string,args:unknown[])=>({
  async first(){return sqlite.prepare(sql).get(...args as [])??null},
  async all(){return {results:sqlite.prepare(sql).all(...args as [])}},
  async run(){const out=sqlite.prepare(sql).run(...args as []);return {meta:{changes:Number(out.changes)}}}
 });
 const db={async exec(sql:string){sqlite.exec(sql)},prepare(sql:string){
  return {...bound(sql,[]),bind(...args:unknown[]){return bound(sql,args)}};
 }} as unknown as D1Database;
 async function request(player:string,mode:"draw"|"escape",action?:string,extra:Record<string,unknown>={}){
  const req=new Request("https://example.org/api/duo-arcade?game="+mode,{
   method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+player.repeat(64)},
   ...(action?{body:JSON.stringify({action,...extra})}:{})
  });
  const res=await (action?onRequestPost({request:req,env:{DB:db}}):
   onRequestGet({request:req,env:{DB:db}}));
  return {status:res.status,data:await res.json() as any};
 }
 return {sqlite,request};
}
test("drawing game has an authoritative winner at ten, never a silent endless scoreboard",async()=>{
 const {sqlite,request}=duoHarness();
 try{
  const original=(await request("a","draw")).data.game;
  assert.equal(original.status,"playing");
  const row=sqlite.prepare("SELECT word_index FROM duo_draw_games WHERE room_id='room-A'")
   .get() as {word_index:number};
  const word=DRAW_WORDS[row.word_index].word;
  sqlite.prepare("UPDATE duo_draw_games SET scores_1=9,drawer=0,round=20 WHERE room_id='room-A'").run();
  const hidden=(await request("b","draw")).data.game;
  assert.equal(hidden.word,null,"guessing partner must not see the secret before the reveal");
  const wrong=await request("b","draw","guess",{gameId:original.id,round:20,guess:"une mauvaise réponse"});
  assert.equal(wrong.status,200);
  assert.equal(wrong.data.correct,false);
  assert.deepEqual(wrong.data.game.scores,[0,9]);
  const victory=await request("b","draw","guess",{gameId:original.id,round:20,guess:word});
  assert.equal(victory.status,200);
  assert.equal(victory.data.game.status,"finished");
  assert.equal(victory.data.game.matchWinner,1);
  assert.equal(victory.data.game.winScore,10);
  assert.deepEqual(victory.data.game.scores,[0,10]);
  const other=(await request("a","draw")).data.game;
  assert.equal(other.status,"finished");
  assert.equal(other.matchWinner,1);
  assert.deepEqual(other.scores,[0,10]);
  assert.equal(other.word,word,"winner screen reveals the last word to both");
  assert.equal((await request("a","draw","next",{gameId:original.id,round:20})).status,409,
   "another round is forbidden after a player reaches ten");
  assert.equal((await request("b","draw","guess",{gameId:original.id,round:20,guess:word})).status,409,
   "a finished match must not award additional points");
  const replay=await request("a","draw","restart",{gameId:original.id,round:20});
  assert.equal(replay.status,200);
  assert.equal(replay.data.game.status,"playing");
  assert.equal(replay.data.game.round,1);
  assert.deepEqual(replay.data.game.scores,[0,0]);
  assert.equal(replay.data.game.matchWinner,null);
  assert.notEqual(replay.data.game.id,original.id);
  assert.equal((await request("b","draw")).data.game.id,replay.data.game.id);
  assert.equal((await request("b","draw","guess",{gameId:original.id,round:20,guess:word})).status,409);
  assert.deepEqual((await request("c","draw")).data.game.scores,[0,0],
   "another couple's scoreboard is isolated");
 }finally{sqlite.close()}
});
test("old drawing matches with ten points are recognized as won on reopening",async()=>{
 const {sqlite,request}=duoHarness();
 try{
  const initial=(await request("a","draw")).data.game;
  sqlite.prepare("UPDATE duo_draw_games SET scores_0=10,status='revealed' WHERE room_id='room-A'").run();
  const migrated=(await request("b","draw")).data.game;
  assert.equal(migrated.id,initial.id);
  assert.equal(migrated.status,"finished");
  assert.equal(migrated.matchWinner,0);
  assert.deepEqual(migrated.scores,[10,0]);
 }finally{sqlite.close()}
});
test("Escape Room solves all stages exactly once, then freezes victory for both phones",async()=>{
 const {sqlite,request}=duoHarness();
 try{
  const first=(await request("a","escape")).data.game;
  const scene=ESCAPE_SCENES[first.scenario];
  let game=first;
  for(let stage=0;stage<scene.stages.length;stage++){
   const solution=await request(stage%2===0?"a":"b","escape","solve",{
    gameId:first.id,stage,answer:scene.stages[stage].answer});
   assert.equal(solution.status,200);
   assert.equal(solution.data.correct,true);
   game=solution.data.game;
   assert.equal(game.stage,stage+1);
  }
  assert.equal(game.status,"escaped");
  assert.equal((await request("b","escape")).data.game.status,"escaped");
  assert.equal((await request("a","escape","solve",{gameId:first.id,stage:2,answer:scene.stages[2].answer})).status,409,
   "solved mission cannot be scored twice");
  const newRoom=await request("a","escape","restart",{gameId:first.id});
  assert.equal(newRoom.status,200);
  assert.equal(newRoom.data.game.stage,0);
  assert.equal(newRoom.data.game.status,"playing");
 }finally{sqlite.close()}
});
test("drawing trophy and replay use the same fixed mobile game panel",()=>{
 const ui=readFileSync("src/DuoArcade.tsx","utf8");
 const api=readFileSync("functions/api/duo-arcade.ts","utf8");
 const css=readFileSync("src/duo-arcade.css","utf8");
 assert.ok(api.includes("const DRAW_WIN_SCORE=10;"));
 assert.ok(api.includes('status=CASE WHEN "+column+">=? THEN \'finished\' ELSE \'revealed\' END'));
 assert.ok(ui.includes('draw.status==="finished"?<div className="lr-duo-finish lr-duo-draw-victory"'));
 assert.ok(ui.includes('onClick={()=>void act("restart")}'));
 assert.ok(css.includes(".lr-duo-draw-victory"));
});
