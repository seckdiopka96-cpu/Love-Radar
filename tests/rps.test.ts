import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestGet,onRequestPost} from "../functions/api/rps";
import {RPS_MOVES,isRpsMove,rpsWinner,rpsEmoji,rpsName} from "../src/rps-engine";
const api=readFileSync("functions/api/rps.ts","utf8");
const app=readFileSync("src/App.tsx","utf8");
const screen=readFileSync("src/RpsDuo.tsx","utf8");
const hub=readFileSync("src/GamesHub.tsx","utf8");
const push=readFileSync("functions/lib/push.ts","utf8");
const sw=readFileSync("public/sw.js","utf8");
test("all nine outcomes follow the correct rules without bias",()=>{
 const ids=RPS_MOVES.map(item=>item.id);
 assert.deepEqual(ids,["rock","paper","scissors"]);
 for(const first of ids)for(const second of ids){
  const outcome=rpsWinner(first,second);
  if(first===second)assert.equal(outcome,null);
  else assert.equal(outcome===0, rpsWinner(second,first)===1);
 }
 assert.equal(rpsWinner("rock","scissors"),0);
 assert.equal(rpsWinner("scissors","paper"),0);
 assert.equal(rpsWinner("paper","rock"),0);
 assert.equal(rpsWinner("scissors","rock"),1);
 assert.equal(rpsWinner("paper","scissors"),1);
 assert.equal(rpsWinner("rock","paper"),1);
 assert.equal(isRpsMove("rock"),true);
 assert.equal(isRpsMove("lizard"),false);
 assert.equal(rpsEmoji("rock"),"✊");
 assert.equal(rpsName("paper"),"Papier");
});
test("server only accepts authenticated room members and protects secret choices",()=>{
 assert.ok(api.includes("SELECT id,room_id,seat,name FROM members WHERE token_hash=?"));
 assert.ok(api.includes("room_id TEXT PRIMARY KEY"));
 assert.ok(api.includes('if(members!==2)return no'));
 assert.ok(api.includes('row.status==="revealed"||row.status==="finished"?partner:null'));
 assert.ok(api.includes("partnerPicked:partner!==null"));
 assert.ok(api.includes("if(!isRpsMove(data.move))"));
 assert.ok(api.includes('data.round!==game.round'));
 assert.ok(api.includes('data.gameId!==game.game_id'));
 assert.ok(api.includes("AND move_0=? AND move_1=?"));
 assert.ok(api.includes("AND status='choosing' AND "));
 assert.ok(api.includes("WHERE room_id=? AND game_id=? AND round=? AND status='revealed' AND ready_0=1 AND ready_1=1"));
 assert.ok(api.includes("score_0=score_0+?,score_1=score_1+?,ties=ties+?"));
 assert.ok(api.includes("const winner=rpsWinner"));
});
test("game screen synchronizes both clients, supports replay and is reachable from the app",()=>{
 assert.ok(screen.includes('window.setInterval(()=>{void refresh()},900)'));
 assert.ok(screen.includes("visibilitychange"));
 assert.ok(screen.includes('apiFetch("/api/rps"'));
 assert.ok(screen.includes("aria-label=\"Choisir Pierre Papier ou Ciseaux\""));
 assert.ok(screen.includes('act("choose",option.id)'));
 assert.ok(!screen.includes('act("next")'),"no repeated ready button every round");
 assert.ok(screen.includes("Nouvelle manche automatique"));
 assert.ok(api.includes("const RESULT_DISPLAY_MS=4500"));
 assert.ok(api.includes("revealed_at<=?"));
 assert.ok(screen.includes('act("invite")'));
 assert.ok(screen.includes('game.partnerPicked?"Choix enregistré":"Choix secret"'));
 assert.ok(hub.includes('onOpenGame("rps")'));
 assert.ok(app.includes('import RpsDuo from "./RpsDuo"'));
 assert.ok(app.includes('tab==="rps"?<RpsDuo'));
 assert.ok(app.includes('kind==="rps-challenge"?"rps"'));
 assert.ok(push.includes('"rps-challenge"'));
 assert.ok(push.includes('"rps"'));
 assert.ok(sw.includes('"rps-challenge"'));
 assert.ok(sw.includes('"rps-challenge":"rps"'),"the push route maps to the exact RPS game");
 assert.ok(sw.includes('"rps"'));
 const css=readFileSync("src/rps-duo.css","utf8");
 assert.ok(css.includes("@media(max-width:450px)"));
 assert.ok(css.includes("prefers-reduced-motion:reduce"));
 assert.ok(app.includes('tab==="rps"&&room?"lr-rps-mode "'),"only RPS opts into fixed layout");
 assert.ok(css.includes(".lr-app.lr-app-locked.lr-rps-mode .lr-main"),"the RPS page has its own non-scrolling main area");
 assert.ok(css.includes("overflow:hidden!important;overscroll-behavior:none!important"),"the game cannot scroll behind the dock");
 assert.ok(css.includes("grid-template-rows:minmax(0,1fr) auto auto auto"),"arena, options, and actions fit on one screen");
 assert.ok(css.includes(".lr-rps-mode .lr-rps-bottom-actions button"),"invite and message controls stay visible");
 assert.ok(css.includes(".lr-rps-mode .lr-rps-modal{max-height:"),"rules remain independently scrollable");
});

test("both players see a trophy at 10 points, no extra rounds and an explicit replay",()=>{
 assert.ok(api.includes("const WIN_SCORE=10;"));
 assert.ok(api.includes("status=CASE WHEN score_0+?>=? OR score_1+?>=? THEN 'finished'"));
 assert.ok(api.includes('if(data.action==="restart")'),"the winner does not auto-reset the match");
 assert.ok(api.includes('game.status!=="finished"'),"restart is only possible after winning");
 assert.ok(api.includes('" WHERE room_id=? AND game_id=? AND status=\'finished\'"'),
  "a delayed replay cannot replace a newer match");
 assert.ok(screen.includes('game.status==="finished"?<div className="lr-rps-match-finished"'));
 assert.ok(screen.includes('onClick={()=>void act("restart")}'));
 assert.ok(screen.includes("Score final :"));
 assert.ok(screen.includes("Le premier joueur à 10 points gagne le match"));
 const css=readFileSync("src/rps-duo.css","utf8");
 assert.ok(css.includes(".lr-rps-match-finished"));
});

function matchHarness(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,name TEXT NOT NULL,seat INTEGER NOT NULL,token_hash TEXT NOT NULL)");
 for(const [letter,seat,room] of [["a",0,"match-A"],["b",1,"match-A"],["c",0,"match-B"],["d",1,"match-B"]] as const){
  const raw=letter.repeat(64),hash=createHash("sha256").update(raw).digest("hex");
  sqlite.prepare("INSERT INTO members VALUES(?,?,?,?,?)").run(letter,room,letter,seat,hash);
 }
 sqlite.exec("CREATE TABLE rps_games(room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,round INTEGER NOT NULL DEFAULT 1,"+
  "version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'choosing',move_0 TEXT,move_1 TEXT,"+
  "score_0 INTEGER NOT NULL DEFAULT 0,score_1 INTEGER NOT NULL DEFAULT 0,ties INTEGER NOT NULL DEFAULT 0,"+
  "winner INTEGER,ready_0 INTEGER NOT NULL DEFAULT 0,ready_1 INTEGER NOT NULL DEFAULT 0,"+
  "updated_at INTEGER NOT NULL,revealed_at INTEGER,last_invite_at INTEGER NOT NULL DEFAULT 0)");
 const bound=(sql:string,params:unknown[])=>({
  async first(){return sqlite.prepare(sql).get(...params as [])??null},
  async all(){return {results:sqlite.prepare(sql).all(...params as [])}},
  async run(){const result=sqlite.prepare(sql).run(...params as []);return {meta:{changes:Number(result.changes)}}}
 });
 const db={async exec(sql:string){sqlite.exec(sql)},prepare(sql:string){
  return {...bound(sql,[]),bind(...params:unknown[]){return bound(sql,params)}};
 }} as unknown as D1Database;
 async function request(letter:string,action?:string,fields:Record<string,unknown>={}){
  const token=letter.repeat(64);
  const request=new Request("https://example.org/api/rps",{
   method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+token},
   ...(action?{body:JSON.stringify({action,...fields})}:{})
  });
  const ctx={request,env:{DB:db}};
  const response=await(action?onRequestPost(ctx):onRequestGet(ctx));
  return {status:response.status,data:await response.json() as any};
 }
 return {sqlite,request};
}
test("actual RPS API: a nine-to-ten score ends the match and both see the same winner",async()=>{
 const {sqlite,request}=matchHarness();
 const first=(await request("a")).data.game;
 await request("b");
 sqlite.prepare("UPDATE rps_games SET score_0=9,score_1=7,round=17 WHERE room_id='match-A'").run();
 assert.equal((await request("a","choose",{gameId:first.id,round:17,move:"rock"})).status,200);
 const won=await request("b","choose",{gameId:first.id,round:17,move:"scissors"});
 assert.equal(won.status,200);
 assert.equal(won.data.game.status,"finished");
 assert.equal(won.data.game.matchWinner,0);
 assert.equal(won.data.game.winScore,10);
 assert.deepEqual(won.data.game.scores,[10,7]);
 assert.equal(won.data.game.round,17);
 const other=(await request("a")).data.game;
 assert.equal(other.id,won.data.game.id);
 assert.equal(other.status,"finished");
 assert.equal(other.matchWinner,0);
 assert.deepEqual(other.scores,[10,7]);
 const rejected=await request("b","choose",{gameId:first.id,round:17,move:"paper"});
 assert.equal(rejected.status,409,"no more choices after championship victory");
 assert.equal((await request("a","next",{gameId:first.id,round:17})).status,409);
 sqlite.prepare("UPDATE rps_games SET revealed_at=? WHERE room_id='match-A'").run(Date.now()-60000);
 assert.equal((await request("b")).data.game.round,17,"no automatic new round after victory");
 const rematch=await request("a","restart",{gameId:first.id,round:17});
 assert.equal(rematch.status,200);
 assert.equal(rematch.data.game.status,"choosing");
 assert.deepEqual(rematch.data.game.scores,[0,0]);
 assert.equal(rematch.data.game.round,1);
 assert.notEqual(rematch.data.game.id,first.id);
 assert.equal((await request("b")).data.game.id,rematch.data.game.id);
 assert.equal((await request("b","choose",{gameId:first.id,round:17,move:"paper"})).status,409,
  "a stale request cannot interfere with the new match");
 assert.equal((await request("c")).data.game.scores[0],0,"other rooms remain isolated");
});
test("actual RPS API: ties do not award points, and partner B can win at ten",async()=>{
 const {sqlite,request}=matchHarness();
 const original=(await request("a")).data.game;
 await request("b");
 sqlite.prepare("UPDATE rps_games SET score_0=8,score_1=9,round=24 WHERE room_id='match-A'").run();
 const tiedA=await request("a","choose",{gameId:original.id,round:24,move:"rock"});
 const tiedB=await request("b","choose",{gameId:original.id,round:24,move:"rock"});
 assert.equal(tiedA.status,200);assert.equal(tiedB.status,200);
 assert.equal(tiedB.data.game.status,"revealed");
 assert.deepEqual(tiedB.data.game.scores,[8,9]);
 assert.equal(tiedB.data.game.ties,1);
 sqlite.prepare("UPDATE rps_games SET revealed_at=? WHERE room_id='match-A'").run(Date.now()-8000);
 const newRound=(await request("a")).data.game;
 assert.equal(newRound.status,"choosing");
 assert.equal(newRound.round,25);
 assert.equal((await request("a","choose",{gameId:original.id,round:25,move:"rock"})).status,200);
 const final=await request("b","choose",{gameId:original.id,round:25,move:"paper"});
 assert.equal(final.data.game.status,"finished");
 assert.equal(final.data.game.matchWinner,1);
 assert.deepEqual(final.data.game.scores,[8,10]);
});
