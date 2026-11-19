import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {newSenegalGame,stopSenegalGame,isSenegalGame,repairSenegalHomeShortcut,movesForPawn,applySenegalMove,rollSenegal,pointForPawn,trackIndex,
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
test("old reversed pawns are repaired to forward movement without losing legal homes",()=>{
 for(const seat of [0,1] as const){
  const old=newSenegalGame();
  old.positions[seat][0]=pawn("home",-5,5,-1,-1);
  old.positions[seat][1]=pawn("home",53,3,51,1);
  old.positions[seat][2]=pawn("home",-56,4,-53,-1);
  old.positions[seat][3]=pawn("finished",-7,7,-1,-1);
  const repaired=repairSenegalHomeShortcut(old);
  assert.notEqual(repaired,old);
  assert.equal(repaired.positions[seat][0].zone,"track");
  assert.equal(repaired.positions[seat][0].step,5,"old distance is preserved going forward");
  assert.equal(repaired.positions[seat][0].dir,1);
  assert.equal(repaired.positions[seat][3].zone,"track","illegitimate old finish is repaired");
  assert.equal(repaired.positions[seat][1].zone,"home","legitimate full lap remains valid");
  assert.equal(repaired.positions[seat][2].zone,"home","old full reverse lap stays earned");
  assert.equal(repaired.positions[seat][2].dir,1,"all saved directions are forward");
  assert.equal(repaired.dice,null);
  assert.ok(isSenegalGame(repaired));
  assert.equal(repairSenegalHomeShortcut(repaired),repaired);
 }
 const persisted=readFileSync("functions/api/ludo-senegal.ts","utf8");
 const screen=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(screen.includes("return repairSenegalHomeShortcut(game)"));
 assert.ok(persisted.includes("const repaired=repairSenegalHomeShortcut(state)"));
 assert.ok(persisted.includes("WHERE room_id=? AND game_id=? AND version=?"));
});
test("red and yellow move forward after leaving base, including on six, in Solo and Duo",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame();
  game.turn=seat;game.dice=6;
  const release=movesForPawn(game,seat,0).find(o=>o.action==="track");
  assert.ok(release);
  const outside=applySenegalMove(game,release!);
  assert.equal(outside?.game.positions[seat][0].step,0);
  const firstSix={...outside!.game,turn:seat,dice:6,streak:0};
  const choices=movesForPawn(firstSix,seat,0);
  assert.deepEqual(choices.map(o=>o.action),["track"],"six cannot reverse the outer path");
  assert.equal(choices[0].to.step,6);
  assert.equal(choices[0].to.dir,1);
  const bot=chooseSenegalBotMove(firstSix);
  assert.equal(bot?.action,"track","computer selects only a forward track move");
  assert.equal(bot?.to.dir,1,"computer never reverses, even if it releases another pawn");
  const played=applySenegalMove(firstSix,choices[0]);
  assert.equal(played?.game.positions[seat][0].step,6);
  assert.equal(played?.move.path.length,6);
  const follow={...played!.game,turn:seat,dice:3,streak:0};
  const onward=movesForPawn(follow,seat,0);
  assert.deepEqual(onward.map(o=>o.action),["track"]);
  assert.equal(onward[0].to.step,9);
  assert.equal(onward[0].to.dir,1);
 }
});
test("own home opens only after a full forward lap",()=>{
 for(const seat of [0,1] as const){
  const forward=newSenegalGame();forward.turn=seat;forward.dice=4;
  forward.positions[seat][0]=pawn("track",49);
  assert.ok(movesForPawn(forward,seat,0).some(o=>o.action==="home"&&o.to.depth===3));
  const backwards=newSenegalGame();backwards.turn=seat;backwards.dice=6;
  backwards.positions[seat][0]=pawn("track",-50,0,0,-1);
  const repaired=repairSenegalHomeShortcut(backwards);
  assert.equal(repaired.positions[seat][0].step,50);
  assert.equal(repaired.positions[seat][0].dir,1);
  assert.ok(movesForPawn({...repaired,dice:6},seat,0).some(o=>o.action==="home"));
  assert.ok(movesForPawn({...repaired,dice:6},seat,0).every(o=>o.action!=="turn"));
  const notYet=newSenegalGame();notYet.turn=seat;notYet.dice=6;
  notYet.positions[seat][0]=pawn("track",2);
  assert.ok(movesForPawn(notYet,seat,0).every(o=>o.action!=="home"));
  const later=newSenegalGame();later.turn=seat;later.dice=4;
  later.positions[seat][0]=pawn("track",101);
  assert.ok(movesForPawn(later,seat,0).some(o=>o.action==="home"));
 }
});
test("raiding the opponent's home lane cannot capture a protected home pawn",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame(),opponent=(1-seat) as 0|1;
  game.turn=seat;game.dice=5;
  game.positions[seat][0]=pawn("track",74);
  game.positions[opponent][0]=pawn("home",53,3,51);
  const invasion=movesForPawn(game,seat,0).find(o=>o.action==="enemy");
  assert.ok(invasion,"human can still choose an opponent-lane raid");
  assert.equal(invasion?.to.depth,3);
  const played=applySenegalMove(game,invasion!);
  assert.equal(played?.game.positions[seat][0].zone,"enemy");
  assert.equal(played?.game.positions[opponent][0].zone,"home","own home is untouchable");
  assert.equal(played?.game.positions[opponent][0].depth,3);
  assert.deepEqual(played?.move.captures,[],"no false capture animation");
  assert.equal(played?.move.path.length,5);
  assert.equal(chooseSenegalBotMove(game)?.action,"track",
   "computer does not invade a protected home for a fake capture");
 }
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
test("a six retreats exactly one square inside the enemy cage for Solo and Duo",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame();
  game.turn=seat;
  game.dice=6;
  game.positions[seat][0]=pawn("enemy",79,3,77,1);
  const retreat=movesForPawn(game,seat,0).find(o=>o.action==="exit");
  assert.ok(retreat);
  assert.equal(retreat!.to.zone,"enemy","one six does not immediately leave a deep cage");
  assert.equal(retreat!.to.depth,2,"only one cell backwards");
  assert.equal(retreat!.to.step,78);
  assert.equal(retreat!.to.dir,1);
  const move=applySenegalMove(game,retreat!);
  assert.ok(move);
  assert.equal(move!.move.path.length,1,"animate exactly one retreat step");
  assert.deepEqual(move!.move.path[0],pointForPawn(seat,0,retreat!.to));
  assert.equal(move!.game.positions[seat][0].depth,2);
  const anotherSix={...move!.game,dice:6,streak:0,turn:seat};
  const next=movesForPawn(anotherSix,seat,0).find(o=>o.action==="exit");
  assert.equal(next?.to.depth,1);
  assert.equal(next?.to.zone,"enemy");
  const atGate={...anotherSix,positions:anotherSix.positions.map((row,side)=>side===seat?
   row.map((p,i)=>i===0?next!.to:p):row) as SenegalGame["positions"]};
  const last=movesForPawn(atGate,seat,0).find(o=>o.action==="exit");
  assert.equal(last?.to.zone,"track");
  assert.equal(last?.to.step,76,"exit by one backwards square, not by six");
  assert.equal(last?.to.dir,1,"restore ordinary forward motion outside");
  const outside=applySenegalMove(atGate,last!);
  assert.equal(outside?.move.path.length,1);
  assert.equal(outside?.game.positions[seat][0].step,76);
  const normal={...outside!.game,turn:seat,dice:2};
  assert.equal(movesForPawn(normal,seat,0).find(o=>o.action==="track")?.to.step,78,
   "the next dice advances normally");
 }
});
test("six retreats one square in opponent cage, then normal travel is forward",()=>{
 const game=withTurn(pawn("enemy",76,2,77,-1),pawn("base",-1),6);
 const repaired=repairSenegalHomeShortcut(game);
 const retreat=movesForPawn({...repaired,dice:6},0,0).find(o=>o.action==="exit");
 assert.equal(retreat?.to.step,77);
 assert.equal(retreat?.to.depth,1);
 assert.equal(retreat?.to.dir,1);
 const gate={...repaired,dice:6,positions:[[retreat!.to,...repaired.positions[0].slice(1)],repaired.positions[1]] as SenegalGame["positions"]};
 const exit=movesForPawn(gate,0,0).find(o=>o.action==="exit");
 assert.equal(exit?.to.step,76);
 assert.equal(exit?.to.dir,1);
 assert.equal(movementPath(0,gate.positions[0][0],exit!.to,exit!.action).length,1);
 const normal={...gate,positions:[[exit!.to,...gate.positions[0].slice(1)],gate.positions[1]] as SenegalGame["positions"],dice:3};
 assert.equal(movesForPawn(normal,0,0).find(o=>o.action==="track")?.to.step,79);
});
test("even old backward saved track directions cannot reverse the next roll",()=>{
 const g=withTurn(pawn("track",73,0,0,-1),pawn("base",-1),3);
 const three=movesForPawn(g,0,0);
 assert.deepEqual(three.map(x=>x.action),["track"]);
 assert.equal(three[0].to.step,76);
 assert.equal(three[0].to.dir,1);
 const six=movesForPawn({...g,dice:6},0,0);
 assert.deepEqual(six.map(x=>x.action),["track","enemy"],"opponent cage is optional, never a U-turn");
 assert.equal(six[0].to.step,79);
 assert.equal(six[0].to.dir,1);
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
test("computer never tries to capture home-lane defenders",()=>{
 const game=withTurn(pawn("track",74),pawn("home",53,3,51),5);
 const selected=chooseSenegalBotMove(game);
 assert.equal(selected?.action,"track");
 const result=applySenegalMove(game,selected!);
 assert.equal(result?.move.captures.length,0);
 assert.equal(result?.game.positions[1][0].zone,"home");
});
test("a defender can still capture an unprotected invader in its own lane",()=>{
 for(const seat of [0,1] as const){
  const opponent=(1-seat) as 0|1;
  const g=newSenegalGame();g.turn=seat;g.dice=1;
  g.positions[seat][0]=pawn("home",52,2,51);
  g.positions[opponent][0]=pawn("enemy",79,3,77);
  const advance=movesForPawn(g,seat,0).find(o=>o.action==="home");
  assert.ok(advance);
  const result=applySenegalMove(g,advance!);
  assert.equal(result?.move.captures.length,1,"only invaders can be caught in my home");
  assert.equal(result?.game.positions[opponent][0].zone,"base");
  assert.equal(result?.game.positions[seat][0].zone,"home");
 }
});
test("a protected starting star and every star square prevent capture for both colors",()=>{
 const safe=[0,8,13,21,26,34,39,47];
 for(const seat of [0,1] as const){
  const opponent=(1-seat) as 0|1;
  for(const square of safe){
   const g=newSenegalGame();g.turn=seat;g.dice=1;
   const destination=(square-seat*26+52)%52+52;
   const targetStep=(square-opponent*26+52)%52;
   g.positions[seat][0]=pawn("track",destination-1);
   g.positions[opponent][0]=pawn("track",targetStep);
   const option=movesForPawn(g,seat,0).find(o=>o.action==="track");
   assert.ok(option);
   const res=applySenegalMove(g,option!);
   assert.equal(res?.move.captures.length,0,"protected square "+square);
   assert.equal(res?.game.positions[opponent][0].zone,"track");
   assert.equal(res?.game.positions[opponent][0].step,targetStep);
  }
 }
});
test("the SAME Classic renderer honours Senegal legal moves rather than Classic six-only maths",()=>{
 const code=readFileSync("public/ludo-duo/script.js","utf8");
 const start=code.indexOf(" function legalPawns(){");
 const end=code.indexOf(" function createPawn(",start);
 assert.ok(start>=0&&end>start);
 const logic=code.slice(start,end);
 const execute=(variant:"classic"|"senegal",dice:number,legal:number[],overlay=false)=>{
  const state={variant,mySeat:0,game:{status:"playing",turn:0,dice,positions:[[-1,-1,-1,-1],[-1,-1,-1,-1]]},
   legalPawns:legal,busy:false,rolling:false,overlayOpen:overlay};
  return Array.from(new Script(
   "const state="+JSON.stringify(state)+";const FINISH_PROGRESS=56;"+logic+";legalPawns()"
  ).runInNewContext() as number[]);
 };
 // Senegal allows choices that Classic's base-only 'six' rule would reject.
 assert.deepEqual(execute("senegal",5,[0]),[0],"server/local Senegal rules are authoritative");
 assert.deepEqual(execute("senegal",5,[0],true),[],"a required path-choice modal blocks old buttons");
 assert.deepEqual(execute("classic",5,[0]),[],"Classic keeps its own exit-six rule");
 assert.deepEqual(execute("classic",6,[]),[0,1,2,3],"Classic does not inherit Senegal moves");
});
test("Senegal shares the physical Classic 3D die and preserves its special paths",()=>{
 const ui=readFileSync("src/SenegalLudo.tsx","utf8");
 const bridge=readFileSync("src/LudoDuoFrame.tsx","utf8");
 const classic=readFileSync("public/ludo-duo/script.js","utf8");
 assert.ok(ui.includes('<LudoDuoFrame variant="senegal" opponent={solo?"solo":"duo"}'));
 assert.ok(ui.includes('boardPoints={boardPoints} legalPawns={legalPawns}'));
 assert.ok(ui.includes("pointForPawn(side as Seat,index,pawn)"));
 assert.ok(ui.includes('case "move":if(Number.isInteger(pawn))choose(pawn as number);'));
 assert.ok(ui.includes('sendAction({action:"move",pawn:option.pawn,moveKind:option.action'));
 assert.ok(ui.includes('game.dice??(lastFace?Number(lastFace[1]):face)'),
  "dice result comes from the rules engine or saved action");
 assert.ok(!ui.includes("setInterval(()=>setFace("),"no fake rolling numbers");
 assert.ok(!ui.includes("<LudoDie3D"),"Senegal does not render an independent die");
 assert.ok(bridge.includes("boardPoints:props.boardPoints"));
 assert.ok(bridge.includes("legalPawns:props.legalPawns"));
 assert.ok(classic.includes('if(state.variant==="senegal")return Array.isArray(state.legalPawns)'));
 assert.ok(classic.includes('state.variant==="senegal"?state.boardPoints'));
 assert.ok(classic.includes("animateRealDieRoll()"),"same physical throw animation");
});

test("capture return animation is bounded and cleared even after iOS callback suspension",()=>{
 const component=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(component.includes("const count=Math.min(10,Math.abs(from.step))"),
  "capture return cannot queue a full 52-cell loop");
 assert.ok(component.includes("captureDeadline.current=Date.now()+returnMs+350"),
  "a stuck capture has a fixed cleanup deadline");
 assert.ok(component.includes("now>=captureDeadline.current"),
  "250ms UI clock recovers after suspended iOS timers");
 assert.ok(component.includes("setCaptureBack([]);captureDeadline.current=0"),
  "capture overlay and input lock are always released");
 const board=readFileSync("public/ludo-duo/script.js","utf8");
 assert.ok(board.includes("if(!active.has(key))"),"stale captured pawn nodes are removed");
});
test("Sénégal exit movement is accepted by the server and shown in the board rules",()=>{
 const api=readFileSync("functions/api/ludo-senegal.ts","utf8");
 const sharedBoard=readFileSync("public/ludo-duo/script.js","utf8");
 assert.ok(api.includes('"track","home","enemy","exit","jump"'));
 assert.ok(sharedBoard.includes("un 6 fait reculer d’une seule case"));
 assert.ok(sharedBoard.includes("Barrage : deux pions"));
});

const trackPair=(game:SenegalGame,mover:0|1,start:number,blockedDistance:number)=>{
 const enemy=(1-mover) as 0|1;
 const target=trackIndex(mover,start+blockedDistance);
 const enemyStep=target-enemy*26;
 game.positions[enemy][0]=pawn("track",enemyStep);
 game.positions[enemy][1]=pawn("track",enemyStep);
 return {enemy,enemyStep};
};
test("two pawns make a real barricade that cannot be crossed without a six",()=>{
 for(const seat of [0,1] as const){
  const g=newSenegalGame();
  g.turn=seat;g.dice=3;
  g.positions[seat][0]=pawn("track",10);
  const {enemy,enemyStep}=trackPair(g,seat,10,1);
  assert.equal(movesForPawn(g,seat,0).find(o=>o.action==="track"),undefined);
  assert.equal(movesForPawn(g,seat,0).find(o=>o.action==="jump"),undefined);
  const blockedRoll=rollSenegal({...g,dice:null},3);
  assert.equal(blockedRoll.turn,enemy,"cannot simply pass an enemy barricade");
  g.dice=6;
  const jump=movesForPawn(g,seat,0).find(o=>o.action==="jump");
  assert.ok(jump,"six enables one barricade hop");
  assert.equal(jump!.to.step,12,"only one square beyond the barricade, not six");
  const path=movementPath(seat,g.positions[seat][0],jump!.to,jump!.action);
  assert.deepEqual(path,[pointForPawn(seat,0,pawn("track",12))],"skip the occupied square");
  const applied=applySenegalMove(g,jump!);
  assert.ok(applied);
  assert.equal(applied!.game.positions[seat][0].step,12);
  assert.equal(applied!.move.captures.length,0,"do not capture either barricade pawn");
  assert.equal(applied!.game.positions[enemy][0].step,enemyStep);
  assert.equal(applied!.game.positions[enemy][1].step,enemyStep);
  assert.equal(applied!.game.turn,seat,"a six keeps the normal bonus roll");
  g.positions[enemy][1]=pawn("base",-1);
  g.dice=3;
  assert.ok(movesForPawn(g,seat,0).some(o=>o.action==="track"&&o.to.step===13),
   "the blockade disappears as soon as one pawn leaves");
 }
});
test("jump stops one square after a distant barrage, not at the full six distance",()=>{
 const g=withTurn(pawn("track",10),pawn("base",-1),6);
 trackPair(g,0,10,3);
 const hop=movesForPawn(g,0,0).find(o=>o.action==="jump");
 assert.equal(hop?.to.step,14,"no remaining pips after crossing the wall");
 assert.deepEqual(movementPath(0,g.positions[0][0],hop!.to,hop!.action),
  [pointForPawn(0,0,pawn("track",11)),pointForPawn(0,0,pawn("track",12)),pointForPawn(0,0,pawn("track",14))]);
 const collision=withTurn(pawn("track",10),pawn("base",-1),6);
 trackPair(collision,0,10,3);
 const next=trackIndex(0,14)-26;
 collision.positions[1][2]=pawn("track",next);
 collision.positions[1][3]=pawn("track",next);
 assert.equal(movesForPawn(collision,0,0).find(o=>o.action==="jump"),undefined,
  "cannot jump onto a second adjacent barricade");
});
test("a barricade works on a safe star, whereas a single pawn never forms one",()=>{
 const g=withTurn(pawn("track",7),pawn("base",-1),6);
 trackPair(g,0,7,1); // track square 8 is protected by a star
 const jump=movesForPawn(g,0,0).find(o=>o.action==="jump");
 assert.equal(jump?.to.step,9,"safe squares may still hold a barricade");
 g.positions[1][1]=pawn("base",-1);
 g.dice=1;
 assert.ok(movesForPawn(g,0,0).some(o=>o.action==="track"&&o.to.step===8));
});
test("a defending pair in its own lane also blocks a raider",()=>{
 const g=withTurn(pawn("track",74),pawn("home",78,2,51),5);
 g.positions[1][1]=pawn("home",78,2,51);
 assert.equal(movesForPawn(g,0,0).find(o=>o.action==="enemy"),undefined,
  "cannot enter and capture both home defenders");
 g.dice=6;
 const hop=movesForPawn(g,0,0).find(o=>o.action==="jump"&&o.to.zone==="enemy");
 assert.equal(hop?.to.depth,3);
 const applied=applySenegalMove(g,hop!);
 assert.ok(applied);
 assert.equal(applied?.move.captures.length,0);
 assert.equal(applied?.game.positions[1][0].depth,2);
 assert.equal(applied?.game.positions[1][1].depth,2);
});
test("a double stack in your own home can still stop the opposing raider",()=>{
 const g=withTurn(pawn("enemy",78,2,77,1),pawn("home",78,2,51),5);
 g.positions[1][1]=pawn("home",78,2,51);
 assert.equal(movesForPawn(g,0,0).find(o=>o.action==="enemy"),undefined);
});

test("Quitting Senegal match freezes dice, moves and autoplay without granting a win",()=>{
 const game=withTurn(pawn("track",18),pawn("track",25),6);
 game.streak=1;
 const ended=stopSenegalGame(game,"Partenaire");
 assert.equal(ended.status,"ended");
 assert.equal(ended.winner,null,"quit is not an automatic loss");
 assert.equal(ended.dice,null,"pending throw is cancelled");
 assert.equal(ended.streak,0);
 assert.equal(ended.lastAction,"Partenaire a arrêté la partie.");
 assert.ok(isSenegalGame(ended),"stopped state is valid for persistent Duo games");
 assert.deepEqual(movesForPawn(ended,0,0),[]);
 assert.equal(rollSenegal(ended,6),ended,"no more dice rolls");
 assert.equal(autoplayTurn(ended).game,ended,"the computer can never restart a stopped game");
 assert.equal(stopSenegalGame(ended,"Toi"),ended,"a repeated stop is idempotent");
 const fresh=newSenegalGame();
 assert.equal(fresh.status,"playing","only a deliberately new match restarts the game");
 assert.equal(fresh.positions[0][0].zone,"base");
});
test("Duo quit is authenticated, game-ID-bound and ends a shared match regardless of turn",()=>{
 const backend=readFileSync("functions/api/ludo-senegal.ts","utf8");
 const ui=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(backend.includes('if(action==="quit")'));
 assert.ok(backend.includes('data.gameId!==game.id'),"a stale stop cannot terminate a newer game");
 assert.ok(backend.includes('stopSenegalGame(game.state,player.name)'),"server stops the shared state");
 assert.ok(backend.includes('DELETE FROM ludo_senegal_moves WHERE room_id=?'),"stale animations are cleared");
 assert.ok(backend.indexOf('if(action==="quit")')<backend.indexOf('if(!Number.isInteger(data.version)'),
  "quitting does not depend on the latest roll or whose turn it is");
 assert.ok(ui.includes('localStorage.removeItem(storage(storageKey))'),"Solo game is discarded");
 assert.ok(ui.includes('onClick={reset} disabled={busy||quitting}'),"restarting requires explicit action");
});
