import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import type {D1Database} from "@cloudflare/workers-types";
import {RAPID_QUESTIONS} from "../src/couple-party-engine";
import {newTeamMatch,teamOf,TEAM_COLORS,TEAM_BASE,TEAM_HOME,movesForTeamPawn,
 teamRoll,teamMove,teamQuizAnswer,teamQuizTick,teamForfeit,teamPiecePoint,
 type TeamSeat
} from "../src/team-games-engine";
import {onRequestGet,onRequestPost} from "../functions/api/team-games";

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
 assert.equal(retreat?.to.depth,2,"six retreats exactly one inside enemy lane");
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
