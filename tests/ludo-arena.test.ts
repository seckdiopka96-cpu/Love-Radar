import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CELL,TRACK,HOME,BASE,pointForProgress,movementSteps,stackPosition} from "../src/ludo-visuals";
import {freshSoloGame,rollSolo,moveSolo,canSoloMove} from "../src/ludo-solo-engine";

const solo=readFileSync("src/SoloLudo.tsx","utf8");
const duo=readFileSync("src/Ludo.tsx","utf8");
const tutorial=readFileSync("src/LudoTutorial.tsx","utf8");
const style=readFileSync("src/ludo-arena.css","utf8");

test("arena styles replace appearance, not the 225-square board or two-player rules",()=>{
 assert.equal(CELL.length,225);
 assert.equal(TRACK.length,52);
 assert.equal(HOME.length,2);
 assert.equal(BASE.length,2);
 assert.equal(pointForProgress(0,0,-1).length,2);
 assert.equal(movementSteps(0,6).length,6);
 assert.equal(typeof canSoloMove,"function");
 assert.equal(typeof rollSolo,"function");
 assert.equal(typeof moveSolo,"function");
 const game=freshSoloGame();
 assert.equal(game.positions.length,2);
 assert.deepEqual(game.positions[0],[-1,-1,-1,-1]);
});
test("solo board shows 4-color classic orientation with blue player and green computer",()=>{
 assert.ok(solo.includes('className="ludo-experience ludo-solo ludo-arena"'));
 assert.ok(style.includes(".ludo-arena.ludo-solo .ludo-board{transform:rotate(-90deg)"));
 assert.ok(style.includes(".ludo-arena.ludo-solo .ludo-board .ludo-token-art{transform:rotate(90deg)"));
 assert.ok(style.includes(".ludo-arena.ludo-solo .ludo-red-base{background:var(--arena-blue)"));
 assert.ok(style.includes(".ludo-arena.ludo-solo .ludo-gold-base{background:var(--arena-green)"));
 assert.ok(style.includes(".ludo-arena.ludo-solo .ludo-pawn-red{--pawn-dark:"));
 assert.ok(style.includes(".ludo-arena.ludo-solo .ludo-pawn-gold{--pawn-dark:"));
 assert.ok(style.includes(".ludo-arena .ludo-yard::after"));
 assert.ok(style.includes(".ludo-arena .ludo-star"));
});
test("animated original 3D pawns still overlap compactly, not in horizontal rows",()=>{
 for(const count of [2,3,4]){
  const poses=Array.from({length:count},(_,i)=>stackPosition(count,i));
  assert.ok(poses.every(p=>p.scale>0.6));
  for(let i=1;i<poses.length;i++){
   assert.ok(Math.hypot(poses[i].x-poses[0].x,poses[i].y-poses[0].y)<20);
  }
 }
 assert.ok(solo.includes("ludo-moving-bounce"));
 assert.ok(duo.includes("ludo-captured-pawn"));
 assert.ok(duo.includes("movementSteps("));
 assert.ok(style.includes(".ludo-arena .ludo-moving-pawn{transition:left"));
 assert.ok(style.includes("@keyframes ludo-arena-dice-roll"));
});
test("game has a real die button and the player bar beneath the board",()=>{
 assert.ok(solo.includes('onClick={()=>performRoll(0)}'));
 assert.ok(solo.includes('onClick={()=>performMove(0,pawn)}'));
 assert.ok(duo.includes('onClick={()=>void act("roll")}'));
 assert.ok(duo.includes('onClick={()=>void act("move",item.pawn)}'));
 assert.ok(style.includes(".ludo-arena .ludo-players{\n order:3"));
 assert.ok(style.includes(".ludo-arena .ludo-play-area{\n order:2"));
 assert.ok(style.includes(".ludo-arena .ludo-die-holder .lr-die-face"));
 assert.ok(style.includes("width:100%!important;max-width:none!important;height:100%!important;"));
});
test("French interactive tutorial can be skipped and does not consume solo 15-second turn",()=>{
 assert.ok(tutorial.includes("Passer le tutoriel"));
 assert.ok(tutorial.includes("Choisis ton pion"));
 assert.ok(tutorial.includes("Lance le dé"));
 assert.ok(tutorial.includes('role="dialog" aria-modal="true"'));
 assert.ok(tutorial.includes("localStorage.setItem(KEY+mode"));
 assert.ok(solo.includes("game.positions.every(row=>row.every(pawn=>pawn===-1))"));
 assert.ok(solo.includes("||tutorialOpen)return;"));
 assert.ok(solo.includes("setGame(previous=>previous.turn===0?{...previous,updatedAt:Date.now()}:previous)"));
 assert.ok(duo.includes('const [tutorialOpen,setTutorialOpen]=useState(false)'));
 assert.ok(duo.includes('Boolean(agreement?.startedAt)'));
 assert.ok(style.includes("@media(prefers-reduced-motion:reduce)"));
});
