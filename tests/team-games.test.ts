import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import type {D1Database} from "@cloudflare/workers-types";
import {RAPID_QUESTIONS} from "../src/couple-party-engine";
import {newTeamMatch,repairTeamClassic,teamIdleTurn,TEAM_TURN_MS,teamOf,TEAM_COLORS,TEAM_BASE,TEAM_HOME,movesForTeamPawn,
 teamRoll,teamMove,teamQuizAnswer,teamQuizTick,teamForfeit,teamPiecePoint,
 type TeamSeat
} from "../src/team-games-engine";
import {onRequestGet,onRequestPost} from "../functions/api/team-games";
import {teamSnapshotPolicy} from "../src/team-game-sync";

function testDB(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY, room_id TEXT NOT NULL, name TEXT NOT NULL,seat INTEGER NOT NULL,token_hash TEXT NOT NULL)");
 for(const [member,seat,room] of [["a",0,"room-host"],["b",1,"room-host"],["c",0,"room-guest"],["d",1,"room-guest"],["e",0,"other"],["f",1,"other"]] as const){
  const hash=createHash("sha256").update(member.repeat(64)).digest("hex");
  sqlite.prepare("INSERT INTO members VALUES(?,?,?,?,?)").run(member,room,member.toUpperCase(),seat,hash);
 }
 sqlite.exec(
  "CREATE TABLE team_games(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,host_room TEXT NOT NULL,guest_room TEXT,kind TEXT NOT NULL,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);"+
  "CREATE TABLE team_game_presence(game_id TEXT NOT NULL,member_id TEXT NOT NULL,last_seen INTEGER NOT NULL,PRIMARY KEY(game_id,member_id))"
 );
 const bound=(sql:string,params:unknown[])=>({
  async first(){return sqlite.prepare(sql).get(...params as [])??null},
  async all(){return {results:sqlite.prepare(sql).all(...params as [])}},
  async run(){const result=sqlite.prepare(sql).run(...params as []);return {meta:{changes:Number(result.changes)}}}
 });
 const db={
  async exec(sql:string){sqlite.exec(sql)},
  prepare(sql:string){return {...bound(sql,[]),bind(...params:unknown[]){return bound(sql,params)}}}
 } as unknown as D1Database;
 async function request(member:string,action?:string,args:Record<string,unknown>={},id=""){
  const req=new Request("https://app.local/api/team-games"+(id?"?id="+encodeURIComponent(id):""),{
   method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+member.repeat(64),...(action?{"Content-Type":"application/json"}:{})},
   ...(action?{body:JSON.stringify({action,...args})}:{})
  });
  const response=await (action?onRequestPost({request:req,env:{DB:db}}):onRequestGet({request:req,env:{DB:db}}));
  return {status:response.status,data:await response.json() as any};
 }
 return {sqlite,db,request};
}
test("the 4 real human seats alternate couples with 4 different colors",()=>{
 assert.deepEqual([0,1,2,3].map(x=>teamOf(x as TeamSeat)),[0,1,0,1]);
 assert.deepEqual(TEAM_COLORS,["red","green","yellow","blue"]);
 assert.equal(TEAM_BASE.length,4);
 assert.equal(TEAM_HOME.length,4);
 const game=newTeamMatch("classic","playing");
 assert.equal(game.positions.length,4);
 assert.ok(game.positions.every(row=>row.length===4&&row.every(p=>p.zone==="base")));
 assert.equal(new Set(game.positions.map((row,seat)=>teamPiecePoint(seat as TeamSeat,0,row[0]).join(","))).size,4);
});
test("classic: a 6 releases a piece and the turn cycles through all four players",()=>{
 let g=newTeamMatch("classic","playing");
 g=teamRoll(g,0,6);
 assert.equal(g.dice,6);
 assert.deepEqual(movesForTeamPawn(g,0,0).map(o=>o.action),["release"]);
 g=teamMove(g,0,0,"release")!;
 assert.equal(g.positions[0][0].zone,"track");
 assert.equal(g.turn,0,"6 awards another turn to this same human");
 g=teamRoll(g,0,3);
 g=teamMove(g,0,0,"track")!;
 assert.equal(g.turn,1,"next turn is on the other couple");
 g=teamRoll(g,1,6);g=teamMove(g,1,0,"release")!;
 g=teamRoll(g,1,3);g=teamMove(g,1,0,"track")!;
 assert.equal(g.turn,2,"host's other partner plays third");
 g=teamRoll(g,2,6);g=teamMove(g,2,0,"release")!;
 g=teamRoll(g,2,3);g=teamMove(g,2,0,"track")!;
 assert.equal(g.turn,3,"guest's other partner plays fourth");
});
test("Classic protects teammate pawns and victory requires BOTH teammates' eight pawns",()=>{
 const g=newTeamMatch("classic","playing");
 g.turn=0;g.dice=1;
 g.positions[0][0]={zone:"track",step:3,depth:0,gate:0,owner:0};
 // Seat 2 is teammate; its track index 26+30 == 4, the landing square.
 g.positions[2][0]={zone:"track",step:30,depth:0,gate:0,owner:2};
 const move=movesForTeamPawn(g,0,0).find(x=>x.action==="track");
 assert.deepEqual(move?.captures,[],"a player can never capture a teammate");
 const after=teamMove(g,0,0,"track")!;
 assert.equal(after.positions[2][0].zone,"track");
 assert.equal(after.status,"playing");
 for(const seat of [0,2] as TeamSeat[])for(let i=0;i<4;i++)
  after.positions[seat][i]={zone:"finished",step:56,depth:6,gate:51,owner:seat};
 after.positions[0][0]={zone:"home",step:55,depth:5,gate:51,owner:0};
 after.turn=0;after.dice=1;
 const victory=teamMove(after,0,0,"home")!;
 assert.equal(victory.status,"finished");
 assert.equal(victory.winner,0);
 assert.equal(victory.winReason,"pieces");
 assert.equal(teamRoll(victory,0,6),victory,"game is frozen after championship victory");
});
test("Classic 2v2 never uses Senegal barricades; regular dice move past a two-pawn stack",()=>{
 const game=newTeamMatch("classic","playing");
 game.turn=0;game.dice=3;
 game.positions[0][0]={zone:"track",step:4,depth:0,gate:0,owner:0};
 game.positions[1][0]={zone:"track",step:45,depth:0,gate:0,owner:1};
 game.positions[1][1]={zone:"track",step:45,depth:0,gate:0,owner:1};
 const choices=movesForTeamPawn(game,0,0);
 assert.deepEqual(choices.map(o=>o.action),["track"]);
 assert.equal(choices[0].to.step,7,"Classic is not blocked by Senegal rules");
 const played=teamMove(game,0,0,"track");
 assert.equal(played?.positions[0][0].step,7);
 assert.equal(played?.positions[1][0].zone,"track","passing over a stack does not capture");
 game.dice=6;
 const six=movesForTeamPawn(game,0,0);
 assert.deepEqual(six.map(o=>o.action),["track"],
  "Classic must never offer a jump over an opponent stack");
 assert.equal(six[0].to.step,10);
});
test("Classic 2v2 cannot run a second lap or bypass its five-square finishing corridor",()=>{
 for(const seat of [0,1,2,3] as TeamSeat[]){
  const g=newTeamMatch("classic","playing");
  g.turn=seat;
  g.dice=6;
  g.positions[seat][0]={zone:"track",step:50,depth:0,gate:0,owner:seat};
  const nearFinish=movesForTeamPawn(g,seat,0);
  assert.deepEqual(nearFinish.map(o=>o.action),["home"]);
  assert.equal(nearFinish[0].to.zone,"finished");
  assert.equal(nearFinish[0].to.depth,6);
  assert.deepEqual(teamPiecePoint(seat,0,nearFinish[0].to),[7,7]);
  g.dice=2;
  const home=movesForTeamPawn(g,seat,0);
  assert.deepEqual(home.map(o=>o.action),["home"]);
  assert.equal(home[0].to.depth,2);
  g.dice=6;
  g.positions[seat][0]={zone:"track",step:48,depth:0,gate:0,owner:seat};
  const approach=movesForTeamPawn(g,seat,0);
  assert.deepEqual(approach.map(o=>o.action),["home"]);
  assert.equal(approach[0].to.depth,4);
  g.positions[seat][0]={zone:"track",step:46,depth:0,gate:0,owner:seat};
  const stillTrack=movesForTeamPawn(g,seat,0);
  assert.deepEqual(stillTrack.map(o=>o.action),["home"]);
  assert.equal(stillTrack[0].to.depth,2);
 }
 const senegal=newTeamMatch("senegal","playing");
 senegal.turn=0;senegal.dice=6;
 senegal.positions[0][0]={zone:"track",step:50,depth:0,gate:0,owner:0};
 assert.ok(movesForTeamPawn(senegal,0,0).some(o=>o.action==="track"),
  "Sénégal alone retains the deliberate continue-lapping choice");
 assert.ok(movesForTeamPawn(senegal,0,0).some(o=>o.action==="home"));
});
test("previous Classic 2v2 saves with overrun tracks migrate without resetting pawns",()=>{
 const game=newTeamMatch("classic","playing");
 game.positions[0][0]={zone:"track",step:51,depth:0,gate:0,owner:0};
 game.positions[1][0]={zone:"track",step:54,depth:0,gate:0,owner:1};
 game.positions[2][0]={zone:"track",step:71,depth:0,gate:0,owner:2};
 const repaired=repairTeamClassic(game);
 assert.notEqual(repaired,game);
 assert.equal(repaired.positions[0][0].zone,"home");
 assert.equal(repaired.positions[0][0].depth,1);
 assert.equal(repaired.positions[1][0].depth,4);
 assert.equal(repaired.positions[2][0].depth,5,
  "extra laps cap at the fifth physical square; no unearned victory");
 assert.deepEqual(repaired.positions[3],game.positions[3]);
 assert.equal(repaired.status,"playing");
 assert.equal(repaired.winner,null);
 assert.equal(repairTeamClassic(repaired),repaired);
 const senegal=newTeamMatch("senegal","playing");
 senegal.positions[0][0]={zone:"track",step:71,depth:0,gate:0,owner:0};
 assert.equal(repairTeamClassic(senegal),senegal,"Sénégal must keep multiple laps");
 const api=readFileSync("functions/api/team-games.ts","utf8");
 assert.ok(api.includes("const repaired=repairTeamClassic(game)"));
 assert.ok(api.includes("row=await save(db,row,repaired)"),
  "migration is version-guarded on the server");
});
test("Senegal enemy lane is not a shortcut to winning, and six retreats one square",()=>{
 const g=newTeamMatch("senegal","playing");
 g.turn=0;g.dice=5;
 // Green opponent lane entrance occurs at progress 64 (12 + 52).
 g.positions[0][0]={zone:"track",step:62,depth:0,gate:0,owner:0};
 const routes=movesForTeamPawn(g,0,0);
 assert.ok(routes.some(x=>x.action==="enemy"&&x.to.owner===1));
 const invasion=teamMove(g,0,0,"enemy")!;
 assert.equal(invasion.positions[0][0].zone,"enemy");
 assert.equal(invasion.winner,null);
 invasion.turn=0;invasion.dice=6;
 const retreat=movesForTeamPawn(invasion,0,0).find(x=>x.action==="exit");
 assert.equal(retreat?.to.zone,"enemy");
 assert.equal(retreat?.to.depth,3,"six retreats exactly one inside enemy lane");
 assert.notDeepEqual(teamPiecePoint(0,0,retreat!.to),[7,7]);
});
test("Senegal two-piece opponent barricade blocks a standard die but six can jump",()=>{
 const g=newTeamMatch("senegal","playing");g.turn=0;g.dice=3;
 g.positions[0][0]={zone:"track",step:4,depth:0,gate:0,owner:0};
 for(let i=0;i<2;i++)g.positions[1][i]={zone:"track",step:45,depth:0,gate:0,owner:1}; // absolute 13+45=6
 assert.deepEqual(movesForTeamPawn(g,0,0),[],"3 cannot pass square 6");
 g.dice=6;
 const jump=movesForTeamPawn(g,0,0).find(x=>x.action==="jump");
 assert.ok(jump);
 assert.equal(jump?.to.step,7,"stops one square after the barrier");
 assert.deepEqual(jump?.captures,[],"never captures the defended stack");
});
test("four-person timed quiz: first correct point goes to their couple, first to 10 wins",()=>{
 let g=newTeamMatch("quiz","playing",1000);
 const time=g.startsAt+100;
 const answer=RAPID_QUESTIONS[g.questionIndex].answer;
 assert.equal(teamQuizAnswer(g,0,answer,g.startsAt-1),null,"cannot pre-answer before shared countdown");
 g=teamQuizAnswer(g,1,(answer+1)%4,time)!;
 assert.deepEqual(g.scores,[0,0]);
 g=teamQuizAnswer(g,2,answer,time+10)!;
 assert.deepEqual(g.scores,[1,0],"seat 2 and seat 0 are the same couple");
 assert.equal(g.phase,"result");
 assert.equal(teamQuizAnswer(g,1,answer,time+20),null,"too late to overtake first correct");
 g=teamQuizTick(g,g.deadlineAt+1);
 assert.equal(g.phase,"question");
 assert.equal(g.round,2);
 g.scores=[9,5];g.answered=[];g.startsAt=10000;g.deadlineAt=28000;
 g=teamQuizAnswer(g,0,RAPID_QUESTIONS[g.questionIndex].answer,11000)!;
 assert.equal(g.status,"finished");assert.equal(g.winner,0);
 assert.deepEqual(g.scores,[10,5]);
 assert.equal(teamQuizTick(g,99999),g);
 assert.equal(teamQuizAnswer(g,1,0,12000),null);
 const forfeited=teamForfeit(newTeamMatch("quiz","playing"),0);
 assert.equal(forfeited.winner,1);
 assert.equal(forfeited.winReason,"abandon");
});
test("the API admits ONLY two established couples and shows their four seats, never private data",async()=>{
 const {sqlite,request}=testDB();
 try{
  const unauthorized=await request("e","join",{code:"AAAAAAAAAA"});
  assert.equal(unauthorized.status,400);
  const created=await request("a","create",{kind:"senegal"});
  assert.equal(created.status,200);
  const host=created.data.game;
  assert.equal(host.state.status,"waiting");
  assert.equal(host.code.length,10);
  assert.equal(host.seat,0);
  assert.equal((await request("e",undefined,{},host.id)).status,403,
   "other couple cannot read a game with an ID");
  assert.equal((await request("a","join",{code:host.code})).status,200,
   "the host cannot accidentally assign itself as a guest couple");
  const guest=await request("c","join",{code:host.code});
  assert.equal(guest.status,200);
  assert.equal(guest.data.game.seat,1);
  assert.equal((await request("e","join",{code:host.code})).status,409,
   "the invite cannot admit a third couple");
  await request("b",undefined,{},host.id);
  await request("d",undefined,{},host.id);
  const started=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(started.state.status,"playing","all 4 must open the shared room");
  assert.deepEqual(started.players.map((x:any)=>x.name),["A","C","B","D"]);
  assert.deepEqual(started.players.map((x:any)=>x.team),[0,1,0,1]);
  assert.equal(started.presence.filter(Boolean).length,4);
  assert.equal(started.seat,0);
  const guestPlayer=(await request("d",undefined,{},host.id)).data.game;
  assert.equal(guestPlayer.seat,3);
  assert.equal(guestPlayer.team,1);
  assert.equal((await request("c","roll",{id:host.id,version:started.version})).status,403,
   "not the guest's turn");
  const abandoned=await request("c","quit",{id:host.id});
  assert.equal(abandoned.status,200);
  assert.equal(abandoned.data.game.state.status,"finished");
  assert.equal(abandoned.data.game.state.winner,0);
  assert.equal((await request("a",undefined,{},host.id)).data.game.state.winReason,"abandon");
  assert.ok(!JSON.stringify(started).includes("token_hash"),"never expose member credentials");
 }finally{sqlite.close()}
});
test("the 2v2 mode exposes only three game variants, with original private games unchanged",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const hub=readFileSync("src/GamesHub.tsx","utf8");
 const screen=readFileSync("src/TeamGames.tsx","utf8");
 const server=readFileSync("functions/api/team-games.ts","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(hub.includes('onOpenGame("team-games")'));
 assert.ok(app.includes('tab==="team-games"?<TeamGames'));
 assert.ok(app.includes('window.dispatchEvent(new Event("lr-team-leave"))'));
 assert.ok(screen.includes('["classic","🎲 Ludo Classique"'));
 assert.ok(screen.includes('["senegal","🇸🇳 Ludo Sénégal"'));
 assert.ok(screen.includes('["quiz","⚡ Questions rapides"'));
 assert.ok(!screen.includes("Pierre Papier Ciseaux"));
 assert.ok(server.includes("SELECT id,room_id,seat,name FROM members WHERE token_hash=?"));
 assert.ok(server.includes("WHERE host_room=? OR guest_room=?"));
 assert.ok(server.includes("if(!allowed(member,row))"),"cross couple privacy");
 assert.ok(deletion.includes("DELETE FROM team_games WHERE host_room=? OR guest_room=?"));
 assert.ok(deletion.includes("DELETE FROM team_game_presence WHERE game_id IN"));
});

test("2v2 Senegal inherits opponent-corridor captures while leaving finished pawns untouchable",()=>{
 for(const seat of [0,1] as TeamSeat[]){
  const opponent=(1-seat) as TeamSeat;
  const game=newTeamMatch("senegal","playing");
  game.turn=seat;game.dice=1;
  game.positions[seat][0]={zone:"enemy",step:78,depth:2,gate:77,owner:opponent};
  game.positions[opponent][0]={zone:"home",step:53,depth:3,gate:51,owner:opponent};
  const move=movesForTeamPawn(game,seat,0).find(o=>o.action==="enemy"&&o.to.depth===3);
  assert.ok(move);
  assert.equal(move!.captures.length,1);
  const played=teamMove(game,seat,0,"enemy");
  assert.equal(played?.positions[opponent][0].zone,"base");
  assert.equal(played?.turn,seat,"capture keeps the moving seat's turn");
  const protectedGame=newTeamMatch("senegal","playing");
  protectedGame.turn=seat;protectedGame.dice=1;
  protectedGame.positions[seat][0]={zone:"enemy",step:78,depth:2,gate:77,owner:opponent};
  protectedGame.positions[opponent][0]={zone:"finished",step:56,depth:6,gate:51,owner:opponent};
  const safe=movesForTeamPawn(protectedGame,seat,0).find(o=>o.action==="enemy");
  assert.deepEqual(safe?.captures,[]);
 }
});
test("the couples lobby header remains below the iPhone status bar and centers both buttons",()=>{
 const css=readFileSync("src/team-games.css","utf8");
 assert.ok(css.includes("grid-template-columns:54px minmax(0,1fr) 54px"),
  "the two buttons are symmetrically aligned around the title");
 assert.ok(css.includes("max(env(safe-area-inset-top,0px),44px)"),
  "reserve the real iPhone safe area plus fallback when reported as zero");
 assert.ok(css.includes("min-height:72px;padding:0 0 8px"),
  "controls sit in a centered header row rather than under the clock");
 assert.ok(css.includes("align-self:center;white-space:nowrap"));
});

test("out-of-order polling cannot roll back newer game version, current turn or completed match",()=>{
 const base={id:"game-A",version:14};
 assert.equal(teamSnapshotPolicy(null,base),"replace");
 assert.equal(teamSnapshotPolicy({id:"game-A",version:15},base),"ignore",
  "a slow response from a previous poll cannot revert the current board");
 assert.equal(teamSnapshotPolicy(base,{id:"game-A",version:14}),"presence-only",
  "equal-version polling may refresh presence without replacing pawn positions");
 assert.equal(teamSnapshotPolicy(base,{id:"game-A",version:16}),"replace");
 assert.equal(teamSnapshotPolicy(base,{id:"game-B",version:1}),"ignore",
  "a delayed room switch request must not resurrect a prior lobby");
 assert.equal(teamSnapshotPolicy(base,{id:"game-B",version:1},true),"replace",
  "a deliberate create/join is allowed to switch rooms");
 const ui=readFileSync("src/TeamGames.tsx","utf8");
 assert.ok(ui.includes("teamSnapshotPolicy(previous,value,allowRoomSwitch)"));
 assert.ok(ui.includes('const merged={...previous,players:value.players,presence:value.presence}'),
  "equal-version presence refresh keeps the authoritative board");
 assert.ok(ui.includes("pollInFlight.current||lock.current"),"GET polls never overlap with actions");
 assert.ok(ui.includes('window.addEventListener("focus",onResume)'));
 assert.ok(ui.includes('window.addEventListener("online",onResume)'));
 assert.ok(ui.includes("if(payload.game)receive(payload.game"),"409 snapshots reconcile without stale inputs");
});
test("two simultaneous players with a stale revision receive the newest authoritative board",async()=>{
 const {sqlite,request}=testDB();
 try{
  const host=(await request("a","create",{kind:"classic"})).data.game;
  await request("c","join",{code:host.code});
  await request("b",undefined,{},host.id);
  await request("d",undefined,{},host.id);
  const started=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(started.state.status,"playing");
  const rolled=await request("a","roll",{id:host.id,version:started.version});
  assert.equal(rolled.status,200);
  assert.ok(rolled.data.game.version>started.version);
  const outdated=await request("a","roll",{id:host.id,version:started.version});
  assert.equal(outdated.status,409);
  assert.equal(outdated.data.ok,false);
  assert.equal(outdated.data.game.id,host.id);
  assert.equal(outdated.data.game.version,rolled.data.game.version);
  assert.deepEqual(outdated.data.game.state,rolled.data.game.state,
   "the conflicting phone must see the same dice and positions as the winning request");
  const other=(await request("c",undefined,{},host.id)).data.game;
  assert.equal(other.version,rolled.data.game.version);
  assert.deepEqual(other.state,rolled.data.game.state);
 }finally{sqlite.close()}
});

test("2v2 Ludo cannot stay blocked forever when one phone stops taking turns",()=>{
 const now=100000;
 assert.equal(TEAM_TURN_MS,15000);
 for(const kind of ["classic","senegal"] as const){
  const game=newTeamMatch(kind,"playing",now);
  game.turn=3;game.updatedAt=now;
  const early=teamIdleTurn(game,now+14999);
  assert.equal(early,game,"playing at 14.999s must not be penalized");
  const passed=teamIdleTurn(game,now+15000);
  assert.equal(passed.turn,0,"last player wraps to the first");
  assert.equal(passed.dice,null);
  assert.equal(passed.sixStreak,0);
  assert.equal(passed.updatedAt,now+15000);
  assert.match(passed.lastAction,/15 secondes sans action/);
  assert.equal(teamIdleTurn(passed,now+15001),passed,
   "a network duplicate must not skip the next player's fresh turn");
  const midTurn={...game,turn:1 as const,dice:6,sixStreak:2};
  const midPassed=teamIdleTurn(midTurn,now+15000);
  assert.equal(midPassed.turn,2);
  assert.equal(midPassed.dice,null,"pending six cannot keep an inactive player's turn");
  assert.equal(midPassed.sixStreak,0);
  assert.equal(teamIdleTurn({...game,status:"finished"},now+20000).status,"finished");
 }
 const quiz=newTeamMatch("quiz","playing",now);
 assert.equal(teamIdleTurn(quiz,now+120000),quiz,"quiz timer is managed independently");
 const waiting=newTeamMatch("classic","waiting",now);
 assert.equal(teamIdleTurn(waiting,now+120000),waiting,"the lobby cannot auto-play before four arrive");
 const ui=readFileSync("src/TeamGames.tsx","utf8");
 assert.ok(ui.includes("const turnLeft=Math.max(0"));
 assert.ok(ui.includes('Tour adverse"} · {turnLeft}s'));
});
test("the four-player server advances exactly one idle turn on the next authenticated poll",async()=>{
 const {sqlite,request}=testDB();
 try{
  const host=(await request("a","create",{kind:"classic"})).data.game;
  await request("c","join",{code:host.code});
  await request("b",undefined,{},host.id);
  await request("d",undefined,{},host.id);
  const running=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(running.state.status,"playing");
  const outdated={...running.state,turn:0,dice:6,sixStreak:1,updatedAt:Date.now()-16000};
  sqlite.prepare("UPDATE team_games SET state_json=? WHERE id=?").run(JSON.stringify(outdated),host.id);
  const auto=await request("b",undefined,{},host.id);
  assert.equal(auto.status,200);
  assert.equal(auto.data.game.state.turn,1);
  assert.equal(auto.data.game.state.dice,null);
  assert.equal(auto.data.game.state.sixStreak,0);
  assert.equal(auto.data.game.version,running.version+1);
  const immediate=await request("d",undefined,{},host.id);
  assert.equal(immediate.data.game.version,auto.data.game.version,
   "another phone's poll cannot count the same timeout twice");
  assert.equal(immediate.data.game.state.turn,1);
  const old=await request("a","move",{id:host.id,version:running.version,pawn:0,move:"release"});
  assert.equal(old.status,409,"pending actions from an old turn must not override the timeout");
  assert.equal(old.data.game.version,auto.data.game.version);
  assert.equal(old.data.game.state.turn,1);
 }finally{sqlite.close()}
});
