import test from "node:test";
import assert from "node:assert/strict";
import {freshSoloGame,rollSolo,moveSolo,canSoloMove,chooseSoloBotPawn,isSoloGame,SOLO_TURN_MS,shouldAutoPlaySolo,type SoloGame} from "../src/ludo-solo-engine";

const position=(my:number[],cpu:number[],turn:0|1=0,dice:number|null=null):SoloGame=>({
 ...freshSoloGame(),positions:[my,cpu],turn,dice
});
test("single player can start immediately without a partner or API",()=>{
 const fresh=freshSoloGame();
 assert.equal(fresh.turn,0);
 assert.equal(fresh.status,"playing");
 assert.deepEqual(fresh.positions,[[-1,-1,-1,-1],[-1,-1,-1,-1]]);
 assert.ok(isSoloGame(JSON.parse(JSON.stringify(fresh))));
 assert.equal(isSoloGame({positions:[]}),false);
});
test("six leaves base; regular roll without playable piece switches to computer",()=>{
 const game=rollSolo(freshSoloGame(),6);
 assert.equal(game.dice,6);
 assert.equal(game.turn,0);
 const move=moveSolo(game,0);
 assert.equal(move?.game.positions[0][0],0);
 assert.equal(move?.game.turn,0); // Extra turn after 6.
 const noMove=rollSolo(freshSoloGame(),4);
 assert.equal(noMove.turn,1);
 assert.equal(noMove.dice,null);
 assert.ok(canSoloMove(-1,6));
 assert.equal(canSoloMove(-1,5),false);
});
test("three consecutive sixes lose the turn",()=>{
 const game={...freshSoloGame(),streak:2};
 const next=rollSolo(game,6);
 assert.equal(next.turn,1);
 assert.equal(next.streak,0);
 assert.equal(next.dice,null);
});
test("capture on unsafe square returns opponent to base and grants extra turn",()=>{
 // Red lands on track index 7; gold track index = 26+33 modulo 52 = 7.
 const game=position([5,-1,-1,-1],[33,-1,-1,-1],0,2);
 const result=moveSolo(game,0);
 assert.equal(result?.game.positions[0][0],7);
 assert.equal(result?.game.positions[1][0],-1);
 assert.equal(result?.game.turn,0);
 assert.equal(result?.move.captured.length,1);
});
test("safe square protects opponent and normal move passes turn",()=>{
 // Red index 8, yellow progress 34 => index 8; square 8 is safe.
 const game=position([7,-1,-1,-1],[34,-1,-1,-1],0,1);
 const result=moveSolo(game,0);
 assert.equal(result?.game.positions[1][0],34);
 assert.equal(result?.move.captured.length,0);
 assert.equal(result?.game.turn,1);
});
test("finishing exact move grants bonus and four completed pawns win",()=>{
 const game=position([56,57,57,57],[-1,-1,-1,-1],0,1);
 const result=moveSolo(game,0);
 assert.equal(result?.game.status,"won");
 assert.equal(result?.game.winner,0);
 assert.equal(result?.game.positions[0][0],57);
 assert.equal(moveSolo(position([56,-1,-1,-1],[-1,-1,-1,-1],0,2),0),null);
});
test("computer prioritizes capture and can move after its own six",()=>{
 const game=position([7,-1,-1,-1],[32,10,-1,-1],1,1);
 // Computer pawn at 32 + die 1 => index 26+33 => 7, red is on index 7.
 assert.equal(chooseSoloBotPawn(game),0);
 const moved=moveSolo(game,0);
 assert.equal(moved?.game.positions[0][0],-1);
 assert.equal(moved?.game.turn,1);
 const six=rollSolo(position([-1,-1,-1,-1],[-1,-1,-1,-1],1,null),6);
 assert.equal(chooseSoloBotPawn(six),0);
});

test("15-second inactivity guard triggers exactly at deadline for a human player",()=>{
 const game={...freshSoloGame(),updatedAt:1000};
 assert.equal(SOLO_TURN_MS,15000);
 assert.equal(shouldAutoPlaySolo(game,15999),false);
 assert.equal(shouldAutoPlaySolo(game,16000),true);
 assert.equal(shouldAutoPlaySolo({...game,turn:1},20000),false);
 assert.equal(shouldAutoPlaySolo({...game,status:"won"},20000),false);
});
test("an unusable six passes the turn immediately instead of waiting",()=>{
 const game=position([55,56,57,57],[-1,-1,-1,-1],0,null);
 const result=rollSolo(game,6);
 assert.equal(result.turn,1);
 assert.equal(result.dice,null);
 assert.equal(result.streak,0);
 assert.match(result.lastAction,/aucun déplacement possible/);
});
test("computer can choose a legal pawn for the human when the human is idle",()=>{
 const game=position([5,15,-1,-1],[33,-1,-1,-1],0,2);
 assert.equal(chooseSoloBotPawn(game),0);
 const moved=moveSolo(game,0);
 assert.equal(moved?.game.positions[1][0],-1);
 assert.equal(moved?.game.turn,0);
});
