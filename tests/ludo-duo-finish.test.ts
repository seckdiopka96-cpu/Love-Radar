import test from "node:test";
import assert from "node:assert/strict";
import {DUO_FINISH,canAdvanceDuo,advanceDuo,isDuoFinished} from "../src/ludo-duo-finish";
import {pointForProgress,movementSteps,HOME} from "../src/ludo-visuals";
import {readFileSync} from "node:fs";

test("fifth coloured home square reaches center on exactly one",()=>{
 assert.equal(DUO_FINISH,56);
 assert.equal(HOME[0].length,5);
 assert.equal(HOME[1].length,5);
 assert.deepEqual(pointForProgress(0,0,55),HOME[0][4]);
 assert.deepEqual(pointForProgress(1,0,55),HOME[1][4]);
 for(const player of [0,1]){
  assert.equal(canAdvanceDuo(55,1),true);
  assert.equal(advanceDuo(55,1),56);
  assert.deepEqual(pointForProgress(player,0,56),[7,7]);
  assert.deepEqual(movementSteps(55,56),[56]);
  for(const tooMany of [2,3,4,5,6]){
   assert.equal(canAdvanceDuo(55,tooMany),false);
   assert.equal(advanceDuo(55,tooMany),null);
  }
 }
});

test("the exact count applies throughout the five-colour home lane",()=>{
 for(let square=51;square<=55;square++){
  const needed=56-square;
  assert.equal(canAdvanceDuo(square,needed),true);
  assert.equal(advanceDuo(square,needed),56);
  for(let die=needed+1;die<=6;die++){
   assert.equal(canAdvanceDuo(square,die),false);
  }
 }
 assert.deepEqual(movementSteps(50,56),[51,52,53,54,55,56]);
 assert.equal(canAdvanceDuo(50,6),true);
 assert.equal(advanceDuo(50,6),56);
 assert.equal(canAdvanceDuo(-1,6),true);
 assert.equal(advanceDuo(-1,6),0);
 assert.equal(canAdvanceDuo(-1,5),false);
});

test("all four pieces need to finish; legacy 57 is still completed",()=>{
 assert.equal(isDuoFinished(55),false);
 assert.equal(isDuoFinished(56),true);
 assert.equal(isDuoFinished(57),true);
 assert.equal(canAdvanceDuo(56,1),false);
 assert.equal(canAdvanceDuo(57,1),false);
 assert.equal([56,56,56,55].every(isDuoFinished),false);
 assert.equal([56,56,56,56].every(isDuoFinished),true);
 assert.equal([57,56,57,56].every(isDuoFinished),true);
});

test("server, animated Duo board and React use the same finish rule",()=>{
 const server=readFileSync("functions/api/ludo.ts","utf8");
 const frame=readFileSync("public/ludo-duo/script.js","utf8");
 const react=readFileSync("src/Ludo.tsx","utf8");
 assert.ok(server.includes('const movable=canAdvanceDuo;'));
 assert.ok(server.includes('const next=advanceDuo(current,roll)!;'));
 assert.ok(server.includes('g.positions[player.seat].every(isDuoFinished)'));
 assert.ok(server.includes('g.positions[seat].every(isDuoFinished)'));
 assert.ok(server.includes('const bonus=roll===6||captures>0||next===DUO_FINISH'));
 assert.ok(frame.includes('const FINISH_PROGRESS=56'));
 assert.ok(frame.includes('if(progress>=FINISH_PROGRESS)'));
 assert.ok(frame.includes('p<FINISH_PROGRESS&&p+g.dice<=FINISH_PROGRESS'));
 assert.ok(react.includes('dice!==null&&canAdvanceDuo(progress,dice)'));
});
