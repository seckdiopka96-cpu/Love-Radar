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
test("pawns form a compact overlapping pile, never a triangle or horizontal row",()=>{
 for(let count=1;count<=8;count++){
  const positions=Array.from({length:count},(_,index)=>stackPosition(count,index));
  assert.equal(positions.length,count);
  for(const p of positions){
   assert.ok(p.x>=38&&p.x<=62);
   assert.ok(p.y>=36&&p.y<=64);
   assert.ok(p.scale>=0.7&&p.scale<1);
  }
  // Nearby centers and large pawn graphics yield visibly overlapping silhouettes.
  for(let i=1;i<positions.length;i++){
   const a=positions[i-1],b=positions[i];
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<20,"pawns must overlap rather than spread across the cell");
  }
 }
 const three=[0,1,2].map(index=>stackPosition(3,index));
 // Three distinct depths, one center, and diagonal layering instead of two in a bottom row.
 assert.ok(three[0].x<three[1].x&&three[1].x<three[2].x);
 assert.ok(three[0].y<three[1].y&&three[1].y<three[2].y);
 assert.equal(three[1].x,50);
 assert.ok(three.every(p=>p.scale>=0.8));
 assert.throws(()=>stackPosition(3,3));
});
