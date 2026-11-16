import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 newShuffledTiles,isPuzzleTiles,puzzleSolved,swapTiles,PUZZLE_TILE_COUNT,
 tileBackgroundPosition,PUZZLE_THEMES,isPuzzleTheme,puzzleImage
} from "../src/puzzle-utils";

test("three by three puzzle shuffles nine distinct pieces and never starts solved",()=>{
 assert.equal(PUZZLE_TILE_COUNT,9);
 const unsolved=newShuffledTiles(()=>0);
 assert.equal(isPuzzleTiles(unsolved),true);
 assert.equal(puzzleSolved(unsolved),false);
 for(let i=0;i<60;i++){
  const tiles=newShuffledTiles();
  assert.equal(isPuzzleTiles(tiles),true);
  assert.equal(puzzleSolved(tiles),false);
 }
});
test("both players may swap any two pieces but cannot corrupt board",()=>{
 const tiles=[0,1,2,3,4,5,6,8,7];
 const swapped=swapTiles(tiles,7,8);
 assert.equal(puzzleSolved(swapped),true);
 assert.deepEqual(tiles,[0,1,2,3,4,5,6,8,7],"original not mutated");
 assert.throws(()=>swapTiles(tiles,9,0));
 assert.throws(()=>swapTiles(tiles,0,0));
 assert.throws(()=>swapTiles([0,0,1,2,3,4,5,6,7],0,1));
 assert.equal(isPuzzleTiles([0,0,1,2,3,4,5,6,7]),false);
 assert.equal(puzzleSolved([0,1,2,3,4,5,6,7,9]),false);
});
test("all tiles use exact 3x3 image crop positions",()=>{
 assert.deepEqual(tileBackgroundPosition(0),{x:"0%",y:"0%"});
 assert.deepEqual(tileBackgroundPosition(4),{x:"50%",y:"50%"});
 assert.deepEqual(tileBackgroundPosition(8),{x:"100%",y:"100%"});
 assert.throws(()=>tileBackgroundPosition(-1));
 assert.throws(()=>tileBackgroundPosition(9));
 for(const theme of PUZZLE_THEMES){
  assert.equal(isPuzzleTheme(theme),true);
  assert.match(puzzleImage(theme),/^\/puzzles\/[a-z]+\.svg$/);
  assert.ok(readFileSync("public"+puzzleImage(theme),"utf8").includes("<svg"));
 }
 assert.equal(isPuzzleTheme("danger"),false);
});
test("puzzle is server-authoritative and room-isolated; removed location/drawing cannot run",()=>{
 const backend=readFileSync("functions/api/puzzle.ts","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const together=readFileSync("src/Together.tsx","utf8");
 const home=readFileSync("src/HomeDashboard.tsx","utf8");
 const affection=readFileSync("functions/api/together.ts","utf8");
 assert.ok(backend.includes("room_id=? AND version=?"),"optimistic locking required");
 assert.ok(backend.includes('data.action==="presence"'),"live partner indicator");
 assert.ok(backend.includes('data.action==="swap"')||backend.includes('data.action!=="swap"'));
 assert.ok(backend.includes('notifyPartner(ctx.env'),"invite partner on new puzzle");
 assert.ok(app.includes('tab==="puzzle"'));
 assert.ok(together.includes('onOpenPuzzle'));
 assert.ok(together.includes("Puzzle à deux"),"Puzzle remains in Nous deux after simplifying home");
 assert.ok(!home.includes("Notre position"));
 assert.ok(!together.includes("Dessiner ensemble"));
 assert.ok(!affection.includes("canvasState"));
 assert.ok(!affection.includes("invite_draw"));
 assert.ok(app.includes('if(tab==="location")return {tab:"together",kind:null,id:null}'),"old location bookmarks should redirect safely");
 assert.ok(!app.includes("LocationShare"));
});
