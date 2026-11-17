import test from "node:test";
import assert from "node:assert/strict";
import {newSenegalGame,movesForPawn,applySenegalMove,rollSenegal,pointForPawn,
 movementPath,autoplayTurn,TURN_MS,chooseSenegalBotMove,type Pawn,type SenegalGame} from "../src/ludo-senegal-engine";
const pawn=(zone:Pawn["zone"],step:number,depth=0,gate=0,dir:1|-1=1):Pawn=>({zone,step,depth,gate,dir});
const withTurn=(red:Pawn,yellow:Pawn,face:number,seat:0|1=0):SenegalGame=>{
 const g=newSenegalGame();g.positions[0][0]=red;g.positions[1][0]=yellow;g.dice=face;g.turn=seat;return g;
};
test("Senegal pawn can skip its own home and keep going around second and third laps",()=>{
 const g=withTurn(pawn("track",49),pawn("base",-1),4);
 const options=movesForPawn(g,0,0);
 assert.ok(options.some(o=>o.action==="home"));
 const onward=options.find(o=>o.action==="track");
 assert.equal(onward?.to.step,53);
 const next=applySenegalMove(g,onward!);
 assert.equal(next?.game.positions[0][0].zone,"track");
 assert.deepEqual(pointForPawn(0,0,next!.game.positions[0][0]),pointForPawn(0,0,pawn("track",1)));
 const another=withTurn(pawn("track",101),pawn("base",-1),5);
 assert.ok(movesForPawn(another,0,0).some(o=>o.action==="home"));
});
test("player can choose invading enemy home on crossing step 77",()=>{
 const g=withTurn(pawn("track",74),pawn("home",77,3,51),5);
 const invasion=movesForPawn(g,0,0).find(o=>o.action==="enemy");
 assert.ok(invasion);
 assert.equal(invasion?.to.depth,3);
 const played=applySenegalMove(g,invasion!);
 assert.equal(played?.game.positions[0][0].zone,"enemy");
 assert.equal(played?.game.positions[1][0].zone,"base");
 assert.equal(played?.move.captures.length,1);
 assert.equal(played?.game.turn,0);
 assert.equal(played?.move.path.length,5);
});
test("Senegal captured pawn returns to its base when landing on the ordinary track",()=>{
 const state=withTurn(pawn("track",13),pawn("track",41),2);
 const option=movesForPawn(state,0,0).find(move=>move.action==="track");
 assert.ok(option);
 const captured=applySenegalMove(state,option!);
 assert.equal(captured?.move.captures.length,1);
 assert.equal(captured?.game.positions[1][0].zone,"base");
 assert.equal(captured?.game.positions[1][0].step,-1);
});
test("inside opponent lane cannot reverse with ordinary roll, but six exits backward without teleporting",()=>{
 const g=withTurn(pawn("enemy",79,3,77,1),pawn("base",-1),2);
 assert.ok(movesForPawn(g,0,0).every(o=>o.action!=="reverse"));
 const six={...g,dice:6};
 const reverse=movesForPawn(six,0,0).find(o=>o.action==="reverse");
 assert.ok(reverse);
 assert.equal(reverse?.to.zone,"track");
 assert.equal(reverse?.to.step,73);
 assert.equal(reverse?.to.dir,-1);
 assert.equal(movementPath(0,g.positions[0][0],reverse!.to,"reverse").length,6);
});
test("every new u-turn requires six, can run backwards on track then choose another reversal",()=>{
 const g=withTurn(pawn("track",73,0,0,-1),pawn("base",-1),3);
 assert.deepEqual(movesForPawn(g,0,0).map(x=>x.action),["track"]);
 const six={...g,dice:6};
 assert.ok(movesForPawn(six,0,0).some(x=>x.action==="turn"&&x.to.dir===1&&x.to.step===79));
});
test("home entry then exact home finish still wins with four pawns",()=>{
 const g=withTurn(pawn("home",55,6,51),pawn("base",-1),1);
 for(let i=1;i<4;i++)g.positions[0][i]=pawn("finished",57,7,51);
 const option=movesForPawn(g,0,0).find(o=>o.action==="home");
 assert.ok(option);
 const played=applySenegalMove(g,option!);
 assert.equal(played?.game.status,"won");
 assert.equal(played?.game.winner,0);
 assert.equal(played?.move.path.length,1);
});
test("ordinary roll without legal move immediately passes the turn",()=>{
 const g=newSenegalGame();
 const next=rollSenegal(g,2);
 assert.equal(next.turn,1);
 assert.equal(next.dice,null);
 assert.equal(TURN_MS,15000);
});
test("bot picks a legal strategic option and cannot alter classic game state",()=>{
 const g=withTurn(pawn("track",74),pawn("home",77,3,51),5);
 const option=chooseSenegalBotMove(g);
 assert.ok(option);
 assert.equal(option?.action,"enemy");
 const result=autoplayTurn({...newSenegalGame(),turn:1});
 assert.equal(result.game.turn,0);
});

test("players are always offered both continue and invade when crossing an EMPTY enemy cage",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame();
  game.turn=seat;
  game.dice=5;
  game.positions[seat][0]=pawn("track",74);
  // The other player has all pieces in its base, not in its home lane.
  const options=movesForPawn(game,seat,0);
  assert.ok(options.some(o=>o.action==="enemy"),"a human must still be allowed to take the risk");
  assert.ok(options.some(o=>o.action==="track"),"a human must be able to continue instead");
  const onward=chooseSenegalBotMove(game);
  assert.equal(onward?.action,"track","AI must not invade an empty cage for seat "+seat);
  const continued=applySenegalMove(game,onward!);
  assert.equal(continued?.game.positions[seat][0].zone,"track");
  assert.equal(continued?.game.positions[seat][0].step,79);
 }
});
test("AI may raid the cage when an opposing pawn is there to capture",()=>{
 const game=withTurn(pawn("track",74),pawn("home",77,3,51),5);
 const selected=chooseSenegalBotMove(game);
 assert.equal(selected?.action,"enemy");
 const result=applySenegalMove(game,selected!);
 assert.equal(result?.move.captures.length,1);
 assert.equal(result?.game.positions[1][0].zone,"base");
});
