import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {newSenegalGame,stopSenegalGame,isSenegalGame,repairSenegalHomeShortcut,ENEMY_LANE_LENGTH,senegalGateChoice,movesForPawn,applySenegalMove,rollSenegal,pointForPawn,trackIndex,
 movementPath,autoplayTurn,TURN_MS,movesForSeat,chooseSenegalBotMove,type Pawn,type SenegalGame} from "../src/ludo-senegal-engine";
const pawn=(zone:Pawn["zone"],step:number,depth=0,gate=0,dir:1|-1=1):Pawn=>({zone,step,depth,gate,dir});
const withTurn=(red:Pawn,yellow:Pawn,face:number,seat:0|1=0):SenegalGame=>{
 const g=newSenegalGame();g.positions[0][0]=red;g.positions[1][0]=yellow;g.dice=face;g.turn=seat;return g;
};
test("each pawn must make its OWN entrance choice on the same throw (Solo and Duo)",()=>{
 for(const seat of [0,1] as const){
  const original=newSenegalGame();original.turn=seat;original.dice=3;
  // Pawn 1 is approaching the opponent's entrance; pawn 2 its OWN entrance.
  original.positions[seat][0]=pawn("track",24);
  original.positions[seat][1]=pawn("track",49);
  assert.equal(senegalGateChoice(original,seat,0),"enemy");
  assert.equal(senegalGateChoice(original,seat,1),"home");
  const first=movesForPawn(original,seat,0);
  const second=movesForPawn(original,seat,1);
  assert.deepEqual(first.map(x=>x.action),["track","enemy"]);
  assert.deepEqual(second.map(x=>x.action),["track","home"]);
  assert.equal(first.every(option=>option.pawn===0),true);
  assert.equal(second.every(option=>option.pawn===1),true);
  // Choosing Enter for pawn 1 changes only that pawn. Pawn 2 must STILL
  // be offered both Continue and Enter next time it is selected.
  const entered=applySenegalMove(original,first.find(x=>x.action==="enemy")!);
  assert.ok(entered);
  assert.equal(entered!.game.positions[seat][0].zone,"enemy");
  assert.equal(entered!.game.positions[seat][1].zone,"track");
  const secondTurn={...entered!.game,turn:seat,dice:3,streak:0};
  assert.equal(senegalGateChoice(secondTurn,seat,1),"home");
  assert.deepEqual(movesForPawn(secondTurn,seat,1).map(o=>o.action),["track","home"]);
  const continued=applySenegalMove(secondTurn,movesForPawn(secondTurn,seat,1).find(x=>x.action==="track")!);
  assert.ok(continued);
  assert.equal(continued!.game.positions[seat][1].zone,"track");
  assert.equal(continued!.game.positions[seat][0].zone,"enemy",
   "continued pawn 2 must not alter pawn 1");
  assert.equal(continued!.game.positions[seat][1].step,52);
 }
});
test("a later entrance of the same pawn must ask again instead of remembering the choice",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame();game.turn=seat;game.dice=3;
  game.positions[seat][0]=pawn("track",24);
  assert.equal(senegalGateChoice(game,seat,0),"enemy");
  const continued=applySenegalMove(game,movesForPawn(game,seat,0).find(o=>o.action==="track")!);
  assert.equal(continued?.game.positions[seat][0].zone,"track");
  // A later lap reaches the next entrance; previous Continue was not saved.
  const next={...continued!.game,turn:seat,dice:3};
  next.positions=[[...next.positions[0]],[...next.positions[1]]];
  next.positions[seat][0]=pawn("track",76);
  assert.equal(senegalGateChoice(next,seat,0),"enemy");
  assert.deepEqual(movesForPawn(next,seat,0).map(o=>o.action),["track","enemy"]);
 }
});
test("entrance choice remains visible even when the die makes Enter unavailable",()=>{
 for(const seat of [0,1] as const){
  const g=newSenegalGame();g.turn=seat;g.dice=6;
  g.positions[seat][0]=pawn("track",24);
  // A six would overshoot the five opponent home squares, so Enter is not
  // legal, but the human should still be explicitly told the choice exists.
  assert.equal(senegalGateChoice(g,seat,0),"enemy");
  assert.deepEqual(movesForPawn(g,seat,0).map(o=>o.action),["track"]);
  g.positions[seat][1]=pawn("track",49);
  assert.equal(senegalGateChoice(g,seat,1),"home");
  assert.ok(movesForPawn(g,seat,1).some(o=>o.action==="home"));
  const untouched=newSenegalGame();untouched.turn=seat;untouched.dice=2;
  untouched.positions[seat][0]=pawn("track",10);
  assert.equal(senegalGateChoice(untouched,seat,0),null);
 }
});
test("Senegal UI never silently applies another pawn's route choice",()=>{
 const component=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(component.includes("const gate=senegalGateChoice(game,seat,pawn)"));
 assert.ok(component.includes("if(options.length===1&&!gate)"),"route gate prompts even for one legal path");
 assert.ok(component.includes("if(options.length)setChosen(options)"),"decision belongs to selected pawn");
 assert.ok(component.includes("if(chosen||busy||rolling"),"other pawn taps cannot overwrite the current prompt");
 assert.ok(component.includes("Ce choix concerne uniquement le pion"),"make scope clear");
 assert.ok(component.includes("Tu devras choisir à nouveau pour chaque autre pion"));
 assert.ok(component.includes('gateDecision==="home"?"🏠 Entrer dans ma maison"'));
 assert.ok(component.includes('gateDecision==="enemy"?"😈 Entrer dans sa cage ou continuer ?"'));
 assert.ok(component.includes('if(!solo||game.status!=="playing"||game.turn!==0||assisted||busy||rolling||motion||captureBack.length||chosen'),
  "Solo cannot auto-choose while the user is answering the route prompt");
 const css=readFileSync("src/ludo-senegal-shared.css","utf8");
 assert.ok(css.includes(".ludo-senegal-route-enter"));
 assert.ok(css.includes(".ludo-senegal-route-continue"));
});
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
test("Sénégal Duo and Solo: invading an opponent's colored lane captures its unfinished pawn",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame(),opponent=(1-seat) as 0|1;
  game.turn=seat;game.dice=5;
  game.positions[seat][0]=pawn("track",74);
  game.positions[opponent][0]=pawn("home",53,3,51);
  const invasion=movesForPawn(game,seat,0).find(o=>o.action==="enemy");
  assert.ok(invasion,"both players can choose to raid the opponent's lane");
  assert.equal(invasion?.to.depth,3);
  const played=applySenegalMove(game,invasion!);
  assert.equal(played?.game.positions[seat][0].zone,"enemy");
  assert.equal(played?.game.positions[opponent][0].zone,"base",
   "an unfinished home-lane pawn must be captured on the exact arrival square");
  assert.equal(played?.game.positions[opponent][0].step,-1);
  assert.equal(played?.move.captures.length,1,"capture animation is reported");
  assert.equal(played?.move.captures[0].from.zone,"home");
  assert.equal(played?.move.captures[0].seat,opponent);
  assert.equal(played?.game.turn,seat,"capturing awards the bonus turn");
  assert.equal(played?.move.path.length,5);
  assert.equal(chooseSenegalBotMove(game)?.action,"enemy",
   "the computer may also take a legal opponent-lane capture");
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
test("enemy corridor cannot qualify a pawn at the center after a three",()=>{
 assert.equal(ENEMY_LANE_LENGTH,5,"only five colored enemy corridor squares exist");
 for(const seat of [0,1] as const){
  const opponent=(1-seat) as 0|1;
  const g=newSenegalGame();g.turn=seat;g.dice=3;
  g.positions[seat][0]=pawn("enemy",79,3,77);
  const options=movesForPawn(g,seat,0);
  assert.equal(options.length,0,"3 from enemy depth 3 would land on the forbidden center");
  assert.equal(applySenegalMove(g,{pawn:0,action:"enemy",
    to:pawn("enemy",82,6,77),label:"Invalid finish"}),null,
   "an illegal move cannot grant victory or show a false qualification");
  const rolled=rollSenegal({...g,dice:null},3);
  assert.equal(rolled.turn,opponent,"unplayable roll passes the turn");
  assert.equal(rolled.positions[seat][0].zone,"enemy");
  assert.equal(rolled.positions[seat][0].depth,3);
  assert.equal(rolled.status,"playing");
  assert.equal(rolled.winner,null);
  const next={...g,dice:6};
  const retreat=movesForPawn(next,seat,0).find(o=>o.action==="exit");
  assert.equal(retreat?.to.zone,"enemy","6 retreats one step; it is not a qualification");
  assert.equal(retreat?.to.depth,2);
 }
});
test("enemy corridor stops on its fifth cell; the sixth is never a win",()=>{
 for(const seat of [0,1] as const){
  const g=newSenegalGame();g.turn=seat;g.dice=3;
  g.positions[seat][0]=pawn("enemy",78,2,77);
  const next=movesForPawn(g,seat,0);
  assert.equal(next.length,1);
  assert.equal(next[0].to.zone,"enemy");
  assert.equal(next[0].to.depth,5);
  const played=applySenegalMove(g,next[0]);
  assert.ok(played);
  assert.equal(played!.game.status,"playing");
  assert.equal(played!.game.winner,null);
  assert.equal(played!.game.positions[seat][0].zone,"enemy");
  assert.notDeepEqual(pointForPawn(seat,0,played!.game.positions[seat][0]),[7,7],
   "the opponent's finishing center is not accessible");
  assert.equal(played!.move.path.at(-1)?.join(","),pointForPawn(seat,0,played!.game.positions[seat][0]).join(","));
  const one={...played!.game,dice:1,turn:seat};
  assert.equal(movesForPawn(one,seat,0).length,0,
   "the pawn cannot advance a sixth step into the finish");
  const six={...played!.game,dice:6,turn:seat};
  const back=movesForPawn(six,seat,0).find(o=>o.action==="exit");
  assert.equal(back?.to.zone,"enemy");
  assert.equal(back?.to.depth,4,"6 moves exactly one cell back in the enemy corridor");
  const justBefore=newSenegalGame();justBefore.turn=seat;justBefore.dice=6;
  justBefore.positions[seat][0]=pawn("track",76);
  assert.ok(movesForPawn(justBefore,seat,0).every(o=>o.action!=="enemy"),
   "cannot enter an opposing corridor at depth six from the outer track");
  assert.ok(movesForPawn(justBefore,seat,0).some(o=>o.action==="track"),
   "moving forward on the outer track remains legal");
 }
});
test("old Solo and Duo enemy-depth-six saves are repaired away from the finish",()=>{
 for(const seat of [0,1] as const){
  const g=newSenegalGame();
  g.positions[seat][0]=pawn("enemy",82,6,77);
  assert.notDeepEqual(pointForPawn(seat,0,g.positions[seat][0]),[7,7],
   "even before migration the visual position must never be the central finish");
  const repaired=repairSenegalHomeShortcut(g);
  assert.notEqual(repaired,g);
  assert.equal(repaired.positions[seat][0].zone,"enemy");
  assert.equal(repaired.positions[seat][0].depth,5);
  assert.equal(repaired.positions[seat][0].step,81);
  assert.equal(repaired.status,"playing");
  assert.equal(repaired.winner,null);
  assert.equal(repairSenegalHomeShortcut(repaired),repaired,"only one migration is needed");
  assert.ok(isSenegalGame(repaired));
 }
 const solo=readFileSync("src/SenegalLudo.tsx","utf8");
 const duo=readFileSync("functions/api/ludo-senegal.ts","utf8");
 assert.ok(solo.includes("repairSenegalHomeShortcut(game)"),"solo migrates old save");
 assert.ok(duo.includes("repairSenegalHomeShortcut(state)"),"duo migrates server save");
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
test("capture inside an opponent's lane also works after the raider is already inside",()=>{
 for(const seat of [0,1] as const){
  const opp=(1-seat) as 0|1;
  const g=newSenegalGame();g.turn=seat;g.dice=1;
  g.positions[seat][0]=pawn("enemy",78,2,77);
  g.positions[opp][0]=pawn("home",53,3,51);
  const move=movesForPawn(g,seat,0).find(o=>o.action==="enemy"&&o.to.depth===3);
  assert.ok(move);
  const outcome=applySenegalMove(g,move!);
  assert.equal(outcome?.move.captures.length,1);
  assert.equal(outcome?.move.captures[0].from.zone,"home");
  assert.equal(outcome?.game.positions[opp][0].zone,"base");
  assert.equal(outcome?.game.positions[seat][0].depth,3);
 }
});
test("four qualified pawns immediately end Senegal Duo and reject all further moves",()=>{
 for(const seat of [0,1] as const){
  const game=newSenegalGame();game.turn=seat;game.dice=1;
  game.positions[seat][0]=pawn("home",55,6,51);
  for(let i=1;i<4;i++)game.positions[seat][i]=pawn("finished",57,7,51);
  const winning=movesForPawn(game,seat,0).find(o=>o.action==="home");
  assert.ok(winning);
  const result=applySenegalMove(game,winning!);
  assert.equal(result?.game.status,"won");
  assert.equal(result?.game.winner,seat);
  assert.equal(result?.game.dice,null);
  assert.equal(result?.game.positions[seat].filter(p=>p.zone==="finished").length,4);
  assert.equal(rollSenegal(result!.game,6),result!.game,"the die is frozen after win");
  assert.deepEqual(movesForSeat(result!.game,seat),[]);
  assert.deepEqual(movesForSeat(result!.game,(1-seat) as 0|1),[]);
  assert.equal(applySenegalMove(result!.game,winning!),null,"no post-win move allowed");
  assert.equal(autoplayTurn(result!.game).game,result!.game,"the bot cannot resume a finished match");
  assert.equal(stopSenegalGame(result!.game,"Personne"),result!.game);
 }
 const ui=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(ui.includes('game.status==="won"?<div className="ludo-senegal-overlay"'),
  "both phones show the same victory overlay");
 assert.ok(ui.includes("Le match est arrêté pour vous deux."));
 assert.ok(ui.includes('if(from.zone==="enemy"||from.zone==="home")'),
  "captured home-lane pawns animate to their real base");
});
test("an already fully finished Duo match is reconciled and frozen when reopened",()=>{
 for(const seat of [0,1] as const){
  const old=newSenegalGame();
  for(let i=0;i<4;i++)old.positions[seat][i]=pawn("finished",57,7,51);
  assert.equal(old.status,"playing");
  const repaired=repairSenegalHomeShortcut(old);
  assert.equal(repaired.status,"won");
  assert.equal(repaired.winner,seat);
  assert.equal(repaired.dice,null);
  assert.equal(repairSenegalHomeShortcut(repaired),repaired);
  assert.deepEqual(movesForSeat(repaired,seat),[]);
  assert.ok(isSenegalGame(repaired));
  const half=newSenegalGame();
  for(let i=0;i<4;i++)half.positions[seat][i]=pawn("home",55,5,51);
  const pending=repairSenegalHomeShortcut(half);
  assert.equal(pending.status,"playing","being in the five entry squares is not finishing");
 }
});
test("ordinary roll without legal move immediately passes the turn",()=>{
 const g=newSenegalGame();
 const next=rollSenegal(g,2);
 assert.equal(next.turn,1);
 assert.equal(next.dice,null);
 assert.equal(TURN_MS,15000);
});
test("bot follows the legal capture rule for an unfinished lane defender",()=>{
 const g=withTurn(pawn("track",74),pawn("home",53,3,51),5);
 const option=chooseSenegalBotMove(g);
 assert.equal(option?.action,"enemy");
 const applied=applySenegalMove(g,option!);
 assert.equal(applied?.game.positions[1][0].zone,"base");
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
test("center-qualified pawns can NEVER be captured by an enemy-lane raid",()=>{
 for(const seat of [0,1] as const){
  const opponent=(1-seat) as 0|1;
  const game=newSenegalGame();game.turn=seat;game.dice=5;
  game.positions[seat][0]=pawn("track",74);
  game.positions[opponent][0]=pawn("finished",57,7,51);
  const raid=movesForPawn(game,seat,0).find(o=>o.action==="enemy");
  assert.ok(raid);
  const result=applySenegalMove(game,raid!);
  assert.equal(result?.game.positions[opponent][0].zone,"finished");
  assert.deepEqual(result?.move.captures,[]);
 }
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


test("Solo AI recovers after a capture animation and plays its bonus six",()=>{
 // Yellow captures red with its first six on a non-star square.
 const g=newSenegalGame();
 g.turn=1;g.dice=6;g.streak=1;
 g.positions[0][0]=pawn("track",33);
 g.positions[1][0]=pawn("track",1);
 g.positions[1][1]=pawn("track",11);
 const capture=movesForPawn(g,1,0).find(x=>x.action==="track"&&x.to.step===7);
 assert.ok(capture);
 const caught=applySenegalMove(g,capture!);
 assert.ok(caught);
 assert.equal(caught!.move.captures.length,1);
 assert.equal(caught!.game.positions[0][0].zone,"base");
 assert.equal(caught!.game.turn,1,"capturing player keeps the next turn");
 assert.equal(caught!.game.dice,null);
 const next=rollSenegal(caught!.game,6);
 assert.equal(next.turn,1,"yellow keeps playing after its next six");
 assert.equal(next.dice,6);
 assert.ok(movesForSeat(next,1).length>0,"a six always offers a legal yellow move");
 const botChoice=chooseSenegalBotMove(next);
 assert.ok(botChoice,"computer must choose a pawn instead of stalling");
 assert.ok(applySenegalMove(next,botChoice!),"computer can legally complete the turn");
 const ui=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(ui.includes('},[solo,game,rolling,motion,captureBack.length,busy,chosen,confirmReset,assisted]);'),
  "capture overlay clearing must rerun the Solo computer effect");
 assert.ok(ui.includes("now>=captureDeadline.current"),
  "iPhone suspended capture cleanup must also trigger this effect");
});
test("capture return animation is bounded and cleared even after iOS callback suspension",()=>{
 const component=readFileSync("src/SenegalLudo.tsx","utf8");
 assert.ok(component.includes("const count=Math.min(10,Math.abs(from.step))"),
  "capture return cannot queue a full 52-cell loop");
 assert.ok(component.includes("captureDeadline.current=Date.now()+returnMs+350"),
  "a stuck capture has a fixed cleanup deadline");
 assert.ok(component.includes("now>=captureDeadline.current"),
  "250ms UI clock recovers after suspended iOS timers");
 assert.ok(component.includes("now>=motionDeadline.current"),
  "a suspended pawn movement cannot block the next turn");
 assert.ok(component.includes("motionGeneration.current++"),
  "late animation callbacks cannot resurrect an already cleared pawn");
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
