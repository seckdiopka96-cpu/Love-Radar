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
import {teamBoardAnimation,teamVisualPath,teamCaptureHome} from "../src/team-game-animation";
import {hasTeamResumeHint,setTeamResumeHint,TEAM_RESUME_KEY} from "../src/team-resume";
import {parseTeamInvite,cleanTeamCode,teamInviteUrl} from "../src/team-invite";
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
  "CREATE TABLE team_game_presence(game_id TEXT NOT NULL,member_id TEXT NOT NULL,last_seen INTEGER NOT NULL,PRIMARY KEY(game_id,member_id));"+
  "CREATE TABLE team_game_results(game_id TEXT NOT NULL,match_no INTEGER NOT NULL,host_room TEXT NOT NULL,"+
  "guest_room TEXT NOT NULL,kind TEXT NOT NULL,winner_team INTEGER NOT NULL,win_reason TEXT NOT NULL,"+
  "score_host INTEGER NOT NULL,score_guest INTEGER NOT NULL,finished_at INTEGER NOT NULL,"+
  "PRIMARY KEY(game_id,match_no))"
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

test("a shared 2v2 link opens the exact game, never a private couple account",()=>{
 const invite=teamInviteUrl("ABCD234567","https://love-radar-acd.pages.dev");
 assert.equal(invite,"https://love-radar-acd.pages.dev/?tab=team-games&invite=ABCD234567");
 assert.equal(parseTeamInvite(new URL(invite).search),"ABCD234567");
 assert.equal(cleanTeamCode("abcd234567"),"ABCD234567");
 assert.equal(parseTeamInvite("?tab=chat&invite=ABCD234567"),null);
 assert.equal(parseTeamInvite("?tab=team-games&invite=AAAAAAAAAA&token=my-secret"),"AAAAAAAAAA");
 for(const unsafe of ["","","abc","AAAAA!AAAA","ABCDEFGHIJ","AAAAAAAAAA%0D%0A"]){
  assert.equal(cleanTeamCode(unsafe),null);
  assert.throws(()=>teamInviteUrl(unsafe,"https://love-radar-acd.pages.dev"));
 }
 assert.equal(parseTeamInvite("?tab=team-games&invite=%3Cscript%3E"),null);
 const file=readFileSync("src/team-invite.ts","utf8");
 assert.ok(!file.includes("roomId"));
 assert.ok(!file.includes("token_hash"));
 assert.ok(!file.includes("localStorage"));
 const screen=readFileSync("src/TeamGames.tsx","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(screen.includes('const invited=parseTeamInvite(window.location.search)'));
 assert.ok(screen.includes('void act("join",{code:invited})'));
 assert.ok(screen.includes('navigator.share({title:"Défis entre couples · Love Radar"'));
 assert.ok(screen.includes('onClick={()=>void copyInvite(currentInvite,"Lien")}'));
 assert.ok(screen.includes('aria-label="Présence en direct des quatre joueurs"'));
 assert.ok(screen.includes('game.presence[i]?"En ligne":"En attente"'));
 assert.ok(app.includes('setTab(parseNotice(window.location.search)?.tab||"home")'),
  "registration must preserve the invite tab even when the account was absent");
});
test("one 2v2 invitation can be opened by both members of the guest couple, but not a third couple",async()=>{
 const {sqlite,request}=testDB();
 try{
  const host=(await request("a","create",{kind:"senegal"})).data.game;
  const link=teamInviteUrl(host.code,"https://love-radar-acd.pages.dev");
  const code=parseTeamInvite(new URL(link).search)!;
  const hostPartner=await request("b","join",{code});
  assert.equal(hostPartner.status,200);
  assert.equal(hostPartner.data.game.seat,2,"the host partner takes the second host-team seat");
  const guest=await request("c","join",{code});
  assert.equal(guest.status,200);
  assert.equal(guest.data.game.seat,1);
  assert.equal(guest.data.game.guestJoined,true);
  assert.deepEqual(guest.data.game.players.map((p:any)=>p?.name),["A","C","B","D"]);
  assert.equal(guest.data.game.presence[3],false,"the guest partner is still waiting");
  const guestPartner=await request("d","join",{code});
  assert.equal(guestPartner.status,200);
  assert.equal(guestPartner.data.game.seat,3);
  const joined=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(joined.state.status,"playing","match starts automatically once all four open the room");
  assert.deepEqual(joined.presence,[true,true,true,true]);
  assert.equal((await request("e","join",{code})).status,409,"third couple cannot join");
  assert.equal((await request("e",undefined,{},host.id)).status,403,"third couple cannot view match");
  const old=Date.now()-32000;
  sqlite.prepare("UPDATE team_game_presence SET last_seen=? WHERE member_id='d'").run(old);
  const view=(await request("a",undefined,{},host.id)).data.game;
  assert.deepEqual(view.presence,[true,true,true,false],
   "roster reflects the actual signed-in participants on the next poll");
  assert.equal(view.state.status,"playing","brief disconnections must not forfeit before 60s");
 }finally{sqlite.close()}
});

test("leaving an invitation lobby keeps the room available for all other players",async()=>{
 const {sqlite,request}=testDB();
 try{
  const host=(await request("a","create",{kind:"quiz"})).data.game;
  await request("b","join",{code:host.code});
  const left=await request("b","leave-lobby",{id:host.id,version:host.version});
  assert.equal(left.status,200);
  assert.equal(left.data.game.state.status,"waiting");
  assert.equal(left.data.game.presence[2],false,"leaving participant is removed from live roster");
  const other=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(other.state.status,"waiting","host keeps the same working invitation");
  assert.equal(other.code,host.code);
  const guest=await request("c","join",{code:host.code});
  assert.equal(guest.status,200,"other couple can still accept the invitation");
  await request("d","join",{code:host.code});
  const before=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(before.state.status,"waiting","absent host partner does not inadvertently start the match");
  const hostAgain=await request("b","join",{code:host.code});
  assert.equal(hostAgain.status,200);
  const ready=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(ready.state.status,"playing");
  const cannotLeave=await request("b","leave-lobby",{id:host.id});
  assert.equal(cannotLeave.status,409,"a started match cannot be silently abandoned");
  assert.equal((await request("c",undefined,{},host.id)).data.game.state.status,"playing");
 }finally{sqlite.close()}
});

test("a network outage longer than sixty seconds preserves a four-player Ludo match and all pawns",async()=>{
 const {sqlite,request}=testDB();
 try{
  const host=(await request("a","create",{kind:"classic"})).data.game;
  await request("c","join",{code:host.code});
  await request("b",undefined,{},host.id);
  await request("d",undefined,{},host.id);
  const started=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(started.state.status,"playing");
  const progress=structuredClone(started.state);
  progress.positions[0][0]={zone:"track",step:12,depth:0,gate:0,owner:0};
  progress.positions[1][1]={zone:"track",step:9,depth:0,gate:0,owner:1};
  progress.scores=[4,3];
  progress.updatedAt=Date.now();
  sqlite.prepare("UPDATE team_games SET state_json=? WHERE id=?")
   .run(JSON.stringify(progress),host.id);
  sqlite.prepare("UPDATE team_game_presence SET last_seen=? WHERE game_id=?")
   .run(Date.now()-180000,host.id);
  const recovered=(await request("a",undefined,{},host.id)).data.game;
  assert.equal(recovered.state.status,"playing","offline is never an automatic defeat");
  assert.equal(recovered.state.winner,null);
  assert.equal(recovered.state.winReason,null);
  assert.deepEqual(recovered.state.positions,progress.positions,"no pawn returns to base");
  assert.deepEqual(recovered.state.scores,[4,3],"the team score never resets");
  assert.deepEqual(recovered.presence,[true,false,false,false],
   "only the reconnected phone reports online; other phones stay absent");
  const other=(await request("c",undefined,{},host.id)).data.game;
  assert.equal(other.state.status,"playing");
  assert.deepEqual(other.state.positions,progress.positions);
  assert.deepEqual(other.state.scores,[4,3]);
  assert.equal((await request("e",undefined,{},host.id)).status,403,
   "recovery never allows access from an unrelated couple");
  const finished=await request("c","quit",{id:host.id});
  assert.equal(finished.data.game.state.status,"finished");
  assert.equal(finished.data.game.state.winReason,"abandon",
   "only an explicit quit awards a victory by abandonment");
 }finally{sqlite.close()}
});
test("boot-time resume probes do not falsely put users online or disclose game state",async()=>{
 const {sqlite,request}=testDB();
 try{
  const host=(await request("a","create",{kind:"senegal"})).data.game;
  await request("c","join",{code:host.code});
  await request("b",undefined,{},host.id);
  await request("d",undefined,{},host.id);
  await request("a",undefined,{},host.id);
  sqlite.prepare("UPDATE team_game_presence SET last_seen=?").run(Date.now()-200000);
  async function probe(member:string){
   const req=new Request("https://app.local/api/team-games?resume=1",{
    headers:{Authorization:"Bearer "+member.repeat(64)}
   });
   const res=await onRequestGet({request:req,env:{DB:(testDb as any)}});
   return {status:res.status,data:await res.json() as any};
  }
  // Obtain a portable test DB by running the authenticated API against the
  // same sqlite-backed D1 adapter as request().
  const dbAdapter={
   async exec(sql:string){sqlite.exec(sql)},
   prepare(sql:string){
    const bound=(args:unknown[])=>({
     async first(){return sqlite.prepare(sql).get(...args as [])??null},
     async all(){return {results:sqlite.prepare(sql).all(...args as [])}},
     async run(){const out=sqlite.prepare(sql).run(...args as []);return {meta:{changes:Number(out.changes)}}}
    });
    return {...bound([]),bind(...args:unknown[]){return bound(args)}};
   }
  } as any;
  const testDb=dbAdapter;
  const active=await probe("b");
  assert.equal(active.status,200);
  assert.deepEqual(active.data,{ok:true,resume:true,status:"playing"});
  assert.equal((sqlite.prepare("SELECT last_seen FROM team_game_presence WHERE member_id='b'").get() as any).last_seen< Date.now()-60000,true,
   "resume probe cannot mark someone present until they actually enter the game");
  const stranger=await probe("e");
  assert.deepEqual(stranger.data,{ok:true,resume:false,status:null});
  const quit=await request("a","quit",{id:host.id});
  assert.equal(quit.data.game.state.status,"finished");
  assert.deepEqual((await probe("b")).data,{ok:true,resume:false,status:null});
 }finally{sqlite.close()}
});
test("auto resume prefers unfinished tournaments and ignores a more recently touched completed match",async()=>{
 const {sqlite,request}=testDB();
 try{
  const older=(await request("a","create",{kind:"quiz"})).data.game;
  await request("a","quit",{id:older.id});
  const running=(await request("a","create",{kind:"classic"})).data.game;
  sqlite.prepare("UPDATE team_games SET updated_at=? WHERE id=?").run(Date.now()+60000,older.id);
  const fetched=(await request("a")).data.game;
  assert.equal(fetched.id,running.id);
  assert.equal(fetched.state.status,"waiting");
  assert.equal(fetched.code,running.code);
 }finally{sqlite.close()}
});
test("recovery marker stores no private data, and restoring the game respects explicit navigation",()=>{
 const marker=new Map<string,string>();
 const previous=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{
  getItem:(key:string)=>marker.get(key)??null,
  setItem:(key:string,value:string)=>{marker.set(key,value)},
  removeItem:(key:string)=>{marker.delete(key)}
 }});
 try{
  assert.equal(hasTeamResumeHint(),false);
  setTeamResumeHint(true);
  assert.equal(hasTeamResumeHint(),true);
  assert.deepEqual([...marker],[[TEAM_RESUME_KEY,"1"]],
   "never persist board, scores, token, invitation code or member data");
  setTeamResumeHint(false);
  assert.equal(hasTeamResumeHint(),false);
 }finally{
  if(previous)Object.defineProperty(globalThis,"localStorage",previous);
  else Reflect.deleteProperty(globalThis,"localStorage");
 }
 const ui=readFileSync("src/TeamGames.tsx","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const server=readFileSync("functions/api/team-games.ts","utf8");
 assert.ok(ui.includes("setTeamResumeHint(value.state.status==="));
 assert.ok(ui.includes("wasOffline.current"),"connectivity is tracked without deleting game state");
 assert.ok(ui.includes("setReconnecting(true)"));
 assert.ok(ui.includes("Reconnexion en cours"));
 assert.ok(app.includes("hasTeamResumeHint()"));
 assert.ok(app.includes('"/api/team-games?resume=1"'));
 assert.ok(app.includes("userNavigatedAfterBoot.current"),"a push or manual navigation beats background resume");
 assert.ok(app.includes('setTab("team-games")'));
 assert.ok(server.includes('if(params.get("resume")==="1")'));
 assert.ok(!server.includes("Date.now()-Number(last.get(p.id)||0)>60000"),
  "no network-based forfeit remains");
});

test("a 2v2 timed quiz records one win only once and a rematch creates a second result",async()=>{
 const {sqlite,request}=testDB();
 const kind="quiz";
 try{
  const created=(await request("a","create",{kind})).data.game;
  await request("c","join",{code:created.code});
  await request("b",undefined,{},created.id);
  await request("d",undefined,{},created.id);
  const first=(await request("a",undefined,{},created.id)).data.game;
  assert.equal(first.state.status,"playing");
  assert.equal(first.state.matchNo,1);
  const state=structuredClone(first.state);
  state.scores=[9,4];
  state.phase="question";
  state.startsAt=Date.now()-2000;
  state.deadlineAt=Date.now()+10000;
  state.answered=[];
  sqlite.prepare("UPDATE team_games SET state_json=? WHERE id=?").run(JSON.stringify(state),created.id);
  const victory=await request("a","answer",{
   id:created.id,version:first.version,round:state.round,
   choice:RAPID_QUESTIONS[state.questionIndex].answer
  });
  assert.equal(victory.status,200);
  assert.equal(victory.data.game.state.status,"finished");
  assert.equal(victory.data.game.state.winner,0);
  const recorded=()=>Number((sqlite.prepare("SELECT COUNT(*) AS n FROM team_game_results WHERE game_id=?")
   .get(created.id) as {n:number}).n);
  assert.equal(recorded(),1,"first victory counted once");
  for(let i=0;i<4;i++){
   const got=await request(i%2?"c":"a",undefined,{},created.id);
   assert.equal(got.data.game.state.status,"finished");
  }
  assert.equal(recorded(),1,"repeat polls must not add another victory");
  const statsUrl=(id:string)=>"https://app.local/api/team-games?stats=1&id="+encodeURIComponent(id);
  async function stats(member:string,id=created.id){
   const req=new Request(statsUrl(id),{headers:{Authorization:"Bearer "+member.repeat(64)}});
   const dbAdapter={
    async exec(sql:string){sqlite.exec(sql)},
    prepare(sql:string){
     const bound=(args:unknown[])=>({
      async first(){return sqlite.prepare(sql).get(...args as [])??null},
      async all(){return {results:sqlite.prepare(sql).all(...args as [])}},
      async run(){const out=sqlite.prepare(sql).run(...args as []);return {meta:{changes:Number(out.changes)}}}
     });
     return {...bound([]),bind(...args:unknown[]){return bound(args)}};
    }
   } as unknown as D1Database;
   const res=await onRequestGet({request:req,env:{DB:dbAdapter}});
   return {status:res.status,data:await res.json() as any};
  }
  const result=await stats("b");
  assert.equal(result.status,200);
  assert.deepEqual(result.data.stats.teams.map((t:any)=>[t.matches,t.wins,t.losses,t.winRate]),
   [[1,1,0,100],[1,0,1,0]]);
  assert.deepEqual(result.data.stats.teams[0].byKind,[{kind:"quiz",matches:1,wins:1}]);
  assert.deepEqual(result.data.stats.history.map((h:any)=>[h.winner_team,h.score_host,h.score_guest]),
   [[0,10,4]]);
  const guestView=await stats("d");
  assert.deepEqual(guestView.data.stats,result.data.stats,"both couples agree on the winner and score");
  assert.equal((await stats("e")).status,403,"no outsider can see the private ranking");
  const replay=await request("c","restart",{id:created.id});
  assert.equal(replay.status,200);
  assert.equal(replay.data.game.state.matchNo,2);
  assert.equal(replay.data.game.state.status,"waiting");
  assert.equal(recorded(),1);
  await request("a","join",{code:created.code});
  await request("b","join",{code:created.code});
  await request("d","join",{code:created.code});
  const started2=(await request("c",undefined,{},created.id)).data.game;
  assert.equal(started2.state.status,"playing");
  assert.equal(started2.state.matchNo,2);
  const quit=await request("a","quit",{id:created.id});
  assert.equal(quit.status,200);
  assert.equal(quit.data.game.state.winner,1);
  assert.equal(recorded(),2,"second match contributes exactly one new result");
  const after=await stats("a");
  assert.deepEqual(after.data.stats.teams.map((t:any)=>[t.matches,t.wins,t.losses,t.winRate]),
   [[2,1,1,50],[2,1,1,50]]);
  assert.equal(after.data.stats.history.length,2);
  assert.deepEqual(after.data.stats.history.map((t:any)=>t.winner_team),[1,0]);
  await stats("b");await stats("c");
  assert.equal(recorded(),2,"stats reads never double count wins");
 }finally{sqlite.close()}
});
test("private leaderboard does not count an unplayed lobby or leak opponent identities",async()=>{
 const {sqlite,request,db}=testDB();
 try{
  const host=(await request("a","create",{kind:"senegal"})).data.game;
  await request("a","quit",{id:host.id});
  assert.equal(Number((sqlite.prepare("SELECT COUNT(*) AS n FROM team_game_results").get() as any).n),0,
   "closing an invitation without a guest is not a win");
  const next=(await request("a","create",{kind:"classic"})).data.game;
  await request("c","join",{code:next.code});
  await request("b",undefined,{},next.id);
  await request("d",undefined,{},next.id);
  const running=(await request("a",undefined,{},next.id)).data.game;
  const state=structuredClone(running.state);
  for(const seat of [0,2] as TeamSeat[])for(let i=0;i<4;i++)
   state.positions[seat][i]={zone:"finished",step:56,depth:6,gate:51,owner:seat};
  state.positions[0][0]={zone:"home",step:55,depth:5,gate:51,owner:0};
  state.turn=0;state.dice=1;state.updatedAt=Date.now();
  sqlite.prepare("UPDATE team_games SET state_json=? WHERE id=?").run(JSON.stringify(state),next.id);
  const won=await request("a","move",{id:next.id,version:running.version,pawn:0,move:"home"});
  assert.equal(won.status,200);
  assert.equal(won.data.game.state.status,"finished");
  assert.equal(won.data.game.state.winReason,"pieces");
  assert.equal(Number((sqlite.prepare("SELECT COUNT(*) AS n FROM team_game_results").get() as any).n),1);
  const tracked=sqlite.prepare("SELECT * FROM team_game_results").get() as any;
  assert.equal(tracked.host_room,"room-host");
  assert.equal(tracked.guest_room,"room-guest");
  assert.equal(tracked.win_reason,"pieces");
  assert.ok(!Object.keys(tracked).some(x=>/message|token|name|avatar|secret/i.test(x)),
   "ledger stores outcome, no chat or member identity");
  assert.ok(!JSON.stringify(won.data).includes("team_game_results"));
  void db;
 }finally{sqlite.close()}
});

test("2v2 physical die always shows the actual server face even on a missed turn",()=>{
 const g=newTeamMatch("classic","playing",1000);
 const miss=teamRoll(g,0,2,2000);
 assert.equal(miss.dice,null);
 assert.equal(miss.turn,1);
 assert.deepEqual(miss.lastRoll,{seat:0,face:2,at:2000});
 assert.equal(g.lastRoll,null,"a visual roll must never mutate its predecessor");
 const release=teamRoll(newTeamMatch("senegal","playing",1000),0,6,2100);
 assert.equal(release.dice,6);
 assert.deepEqual(release.lastRoll,{seat:0,face:6,at:2100});
 release.dice=null;release.sixStreak=2;
 const third=teamRoll(release,0,6,2200);
 assert.equal(third.lastRoll?.face,6);
 assert.equal(third.turn,1,"third six still ends the same legal turn");
 const screen=readFileSync("src/TeamGames.tsx","utf8");
 assert.ok(screen.includes("active!.dice||active!.lastRoll?.face||1"));
 assert.ok(screen.includes("playSound(\"roll\")"));
 assert.ok(screen.includes('className="lr-team-die-cube"'));
 assert.ok(!screen.includes('Math.random()*6'),"clients cannot invent a die face");
});
test("animation follows every authentic server-confirmed square without moving the board",()=>{
 const initial=newTeamMatch("classic","playing",1000);
 initial.turn=0;initial.dice=6;
 const released=teamMove(initial,0,0,"release",1010)!;
 const enter=teamBoardAnimation(initial,released);
 assert.ok(enter);
 assert.equal(enter!.path.length,1);
 assert.deepEqual(enter!.mover.point,TEAM_BASE[0][0]);
 assert.deepEqual(enter!.path.at(-1),teamPiecePoint(0,0,released.positions[0][0]));
 const afterRoll={...released,dice:3,turn:0};
 const walked=teamMove(afterRoll,0,0,"track",1100)!;
 const frames=teamBoardAnimation(afterRoll,walked);
 assert.ok(frames);
 assert.equal(frames!.path.length,3);
 assert.deepEqual(frames!.path,[
  teamPiecePoint(0,0,{zone:"track",step:1,depth:0,gate:0,owner:0}),
  teamPiecePoint(0,0,{zone:"track",step:2,depth:0,gate:0,owner:0}),
  teamPiecePoint(0,0,{zone:"track",step:3,depth:0,gate:0,owner:0})
 ]);
 assert.equal(teamBoardAnimation(initial,{...initial,dice:4}),null,"die changes are not piece moves");
 assert.equal(teamBoardAnimation(newTeamMatch("quiz","playing"),newTeamMatch("quiz","playing")),null);
 assert.equal(teamBoardAnimation(walked,newTeamMatch("classic","playing")),null,"a rematch isn't a move");
});
test("Senegal's opponent-home capture visibly returns the defeated piece to its own base",()=>{
 const game=newTeamMatch("senegal","playing",1000);
 game.turn=0;game.dice=1;
 game.positions[0][0]={zone:"enemy",step:78,depth:2,gate:77,owner:1};
 game.positions[1][0]={zone:"home",step:53,depth:3,gate:51,owner:1};
 const next=teamMove(game,0,0,"enemy",1100);
 assert.ok(next);
 const fx=teamBoardAnimation(game,next!);
 assert.ok(fx);
 assert.equal(fx!.mover.seat,0);
 assert.equal(fx!.mover.pawn,0);
 assert.deepEqual(fx!.captures,[{seat:1,pawn:0,point:TEAM_HOME[1][2]}]);
 assert.deepEqual(teamCaptureHome(1,0),TEAM_BASE[1][0]);
 assert.deepEqual(fx!.path,[TEAM_HOME[1][2]]);
 assert.equal(next!.positions[1][0].zone,"base");
 assert.equal(next!.turn,0);
 const css=readFileSync("src/team-games.css","utf8");
 assert.ok(css.includes(".lr-team-effect-pin.is-captured"));
 assert.ok(css.includes(".lr-team-confetti"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
 const unified=readFileSync("public/ludo-effects.css","utf8");
 assert.ok(unified.includes(".piece--captured::after"));
 assert.ok(unified.includes(".victory-dialog[open]::before"));
 const senegal=readFileSync("src/ludo-senegal-shared.css","utf8");
 assert.ok(senegal.includes('aria-label="Victoire au Ludo Sénégal"'));
});
test("the 2v2 visual engine keeps a finishing pawn at the true center and never replays a restored match",()=>{
 const from={zone:"home",step:55,depth:5,gate:51,owner:0} as const;
 const finish={...from,zone:"finished" as const,step:56,depth:6};
 assert.deepEqual(teamVisualPath(0,0,from,finish),[[7,7]]);
 const full=newTeamMatch("classic","playing");
 const win={...full,status:"finished" as const};
 win.positions[0][0]={...finish};
 assert.equal(teamBoardAnimation(win,full),null);
 assert.equal(teamBoardAnimation({...full,status:"waiting"},win),null);
 const label=readFileSync("src/TeamGames.tsx","utf8");
 assert.ok(label.includes("previous.version<value.version"),"stale polling cannot restart a visual effect");
 assert.ok(label.includes("effectTimers.current.forEach(window.clearTimeout)"),
  "all pending effects cancel when the game changes or unmounts");
});
