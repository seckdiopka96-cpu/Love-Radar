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
   assert.ok(Math.hypot(poses[i].x-poses[i-1].x,poses[i].y-poses[i-1].y)<17,"neighboring pieces form a readable overlapping pile");
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


test("retina-sharp 3D die has six physical faces and always shows the true game result",()=>{
 const die=readFileSync("src/LudoDie3D.tsx","utf8");
 const dieCss=readFileSync("src/ludo-die-3d.css","utf8");
 const pawn=readFileSync("src/LudoPawn.tsx","utf8");
 assert.ok(die.includes('([1,2,3,4,5,6] as const).map(number=>'));
 assert.ok(die.includes('const face=Number.isInteger(value)&&value>=1&&value<=6?value:1'));
 assert.ok(die.includes('data-result={face}'));
 assert.ok(die.includes('role="img"'));
 for(let n=1;n<=6;n++){
  assert.ok(dieCss.includes(".ludo-die-side-"+n+"{transform:"),"real 3D geometry for side "+n);
  assert.ok(dieCss.includes(".ludo-die-shows-"+n+"{--die-x:"),"correct face after stopping "+n);
 }
 assert.ok(dieCss.includes("transform-style:preserve-3d"));
 assert.ok(dieCss.includes("backface-visibility:hidden"));
 assert.ok(dieCss.includes("@keyframes ludo-die-tumble-3d"));
 assert.ok(dieCss.includes("@keyframes ludo-die-flying"));
 assert.ok(dieCss.includes("@media(prefers-reduced-motion:reduce)"));
 assert.ok(!die.includes("Math.random"),"the die visual must never generate a second outcome");
 assert.ok(solo.includes('<LudoDie3D value={face} color={game.turn===1?"green":"blue"} rolling={rolling}/>'));
 assert.ok(duo.includes('<LudoDie3D value={dice||0} color={myTurn?"blue":"green"} rolling={rolling}/>'));
 assert.ok(pawn.includes('viewBox="0 0 52 70"'));
 assert.ok(pawn.includes('linearGradient id={metal}'));
 assert.ok(pawn.includes('radialGradient id={orb}'));
 assert.ok(pawn.includes('useId()'));
 assert.ok(!pawn.includes("<image"),"pins stay vector sharp on Retina iPhones");
});
test("die sits between blue TOI and green ORDI without duplicate solo roll buttons",()=>{
 const playerStart=solo.indexOf('className="ludo-players ludo-arena-player-rail"');
 const dieInRail=solo.indexOf('className={"ludo-die-holder ludo-die-in-player-rail"',playerStart);
 const opponent=solo.indexOf('<strong>ORDI</strong>',playerStart);
 assert.ok(playerStart>0&&dieInRail>playerStart&&opponent>dieInRail);
 assert.ok(solo.includes('<strong>TOI</strong>'));
 assert.ok(solo.includes('onClick={()=>performRoll(0)}'));
 assert.ok(solo.includes('ludo-arena-roll-tip'));
 assert.ok(solo.includes('{canPick?<div className="ludo-pick-row"'));
 assert.equal((solo.match(/onClick=\{\(\)=>performRoll\(0\)\}/g)||[]).length,1,
  "one physical die is the single visible roll control");
 assert.ok(style.includes(".ludo-experience.ludo-arena.ludo-solo .ludo-arena-player-rail{"));
 assert.ok(style.includes("grid-template-columns:minmax(0,1fr) 70px minmax(0,1fr)!important"));
 assert.ok(style.includes(".ludo-arena-player-rail .ludo-die-in-player-rail{"));
 assert.ok(style.includes(".ludo-experience.ludo-arena .ludo-cell-pawns .ludo-pawn-stacked{"));
 assert.ok(style.includes("border:2px solid #a9c9e9!important"));
});
