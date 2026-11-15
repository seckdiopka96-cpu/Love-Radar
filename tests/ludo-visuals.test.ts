import test from "node:test";
import assert from "node:assert/strict";
import {TRACK,HOME,BASE,CELL,SAFE,key,pointForProgress,movementSteps,stackPosition} from "../src/ludo-visuals";

test("authentic 52-square outer path, six-square home, 225-cell board",()=>{
 assert.equal(TRACK.length,52);
 assert.equal(new Set(TRACK.map(([r,c])=>key(r,c))).size,52);
 assert.equal(CELL.length,225);
 assert.equal(HOME[0].length,6);
 assert.equal(HOME[1].length,6);
 assert.equal(SAFE.size,8);
});
test("progress follows one visible cell at a time, including entering and finishing",()=>{
 assert.deepEqual(movementSteps(-1,0),[0]);
 assert.deepEqual(movementSteps(4,10),[5,6,7,8,9,10]);
 assert.deepEqual(movementSteps(50,56),[51,52,53,54,55,56]);
 assert.deepEqual(movementSteps(51,57),[52,53,54,55,56,57]);
 assert.deepEqual(movementSteps(12,20),[]);
 assert.deepEqual(pointForProgress(0,0,-1),BASE[0][0]);
 assert.deepEqual(pointForProgress(1,2,-1),BASE[1][2]);
 assert.deepEqual(pointForProgress(0,0,0),TRACK[0]);
 assert.deepEqual(pointForProgress(1,0,0),TRACK[26]);
 assert.deepEqual(pointForProgress(0,0,57),[7,7]);
 assert.deepEqual(pointForProgress(1,3,56),HOME[1][5]);
});
test("1-4 pawns overlap in a centered cluster, and three form a triangle",()=>{
 for(let count=1;count<=4;count++){
  const coords=Array.from({length:count},(_,i)=>stackPosition(count,i));
  assert.equal(coords.length,count);
  for(const p of coords){assert.ok(p.x>28&&p.x<72);assert.ok(p.y>28&&p.y<75);assert.ok(p.scale>0.5&&p.scale<1)}
 }
 const tri=Array.from({length:3},(_,i)=>stackPosition(3,i));
 assert.notEqual(tri[0].y,tri[1].y);
 assert.notEqual(tri[1].x,tri[2].x);
 assert.equal(stackPosition(4,0).y,stackPosition(4,1).y);
 assert.equal(stackPosition(4,2).y,stackPosition(4,3).y);
});
