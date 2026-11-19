import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import type {D1Database} from "@cloudflare/workers-types";
import {onRequestGet,onRequestPost} from "../functions/api/couple-party";
import {
 RAPID_QUESTIONS,TRUTH_PROMPTS,ACTION_PROMPTS,
 nextPartyIndex,nextUnseenPartyIndex,validChoice,partyChallenge,validChallengeKind
} from "../src/couple-party-engine";

const token=(letter:string)=>letter.repeat(64);
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
function harness(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,name TEXT NOT NULL,seat INTEGER NOT NULL,token_hash TEXT NOT NULL)");
 // Each isolated fake D1 database starts with the deployed table schema.
 const schema=readFileSync("schema.sql","utf8");
 const start=schema.indexOf("CREATE TABLE IF NOT EXISTS couple_party_games");
 assert.ok(start>=0);
 sqlite.exec(schema.slice(start,schema.indexOf(";",start)+1));
 const historyStart=schema.indexOf("CREATE TABLE IF NOT EXISTS couple_party_prompt_history");
 assert.ok(historyStart>=0);
 sqlite.exec(schema.slice(historyStart,schema.indexOf(";",historyStart)+1));
 const presenceStart=schema.indexOf("CREATE TABLE IF NOT EXISTS couple_party_presence");
 assert.ok(presenceStart>=0);
 sqlite.exec(schema.slice(presenceStart,schema.indexOf(";",presenceStart)+1));
 for(const [name,room,seat,letter] of [
  ["Alice","room-A",0,"a"],["Benoît","room-A",1,"b"],
  ["Dina","room-B",0,"c"],["Eric","room-B",1,"d"]
 ] as const){
  sqlite.prepare("INSERT INTO members VALUES(?,?,?,?,?)").run(name,room,name,seat,hash(token(letter)));
 }
 const prepared=(sql:string,params:unknown[])=>({
  async first(){return sqlite.prepare(sql).get(...params as [])??null},
  async all(){return {results:sqlite.prepare(sql).all(...params as [])}},
  async run(){const result=sqlite.prepare(sql).run(...params as []);return {meta:{changes:Number(result.changes)}}}
 });
 const db={
  async exec(sql:string){sqlite.exec(sql)},
  prepare(sql:string){
   return {...prepared(sql,[]),bind(...params:unknown[]){return prepared(sql,params)}};
  }
 } as unknown as D1Database;
 async function request(mode:"rapid"|"truth",user:string,action?:string,fields:Record<string,unknown>={}){
  const url="https://example.org/api/couple-party?mode="+mode;
  const body=action?JSON.stringify({action,...fields}):undefined;
  const req=new Request(url,{method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+token(user),...(action?{"Content-Type":"application/json"}:{})},
   ...(body?{body}:{})});
  const ctx={request:req,env:{DB:db}};
  const res=await(action?onRequestPost(ctx):onRequestGet(ctx));
  return {status:res.status,data:await res.json() as any};
 }
 return {sqlite,db,request};
}
test("original question and challenge collections are substantial and safe",()=>{
 assert.ok(RAPID_QUESTIONS.length>=30);
 assert.ok(TRUTH_PROMPTS.length>=40);
 assert.ok(ACTION_PROMPTS.length>=45);
 assert.equal(new Set(TRUTH_PROMPTS).size,TRUTH_PROMPTS.length,"truths must not repeat");
 assert.equal(new Set(ACTION_PROMPTS).size,ACTION_PROMPTS.length,"actions must not repeat");
 assert.ok(TRUTH_PROMPTS.every(card=>card.trim().endsWith("?")),"truths are questions");
 assert.ok(ACTION_PROMPTS.every(card=>!card.trim().endsWith("?")),"actions are things to do");
 for(const q of RAPID_QUESTIONS){
  assert.ok(q.question.length>=12);
  assert.equal(q.options.length,4);
  assert.equal(new Set(q.options).size,4);
  assert.ok(validChoice(q.answer));
 }
 for(let n=0;n<100;n++){
  const next=nextPartyIndex(RAPID_QUESTIONS.length,4,n/100);
  assert.ok(next>=0&&next<RAPID_QUESTIONS.length&&next!==4);
 }
 assert.equal(nextUnseenPartyIndex(4,[0,1,2],2,.9),3,"finish unused cards before reshuffling");
 assert.notEqual(nextUnseenPartyIndex(4,[0,1,2,3],2,.4),2,"avoid last card at reshuffle");
 assert.ok(validChallengeKind("truth"));
 assert.ok(validChallengeKind("action"));
 assert.equal(validChallengeKind("private"),false);
 assert.equal(partyChallenge("truth",0),TRUTH_PROMPTS[0]);
 assert.equal(partyChallenge("action",0),ACTION_PROMPTS[0]);
});
test("server keeps quiz answers secret, scores once, rejects unauthorized moves and isolates couples",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {sqlite,request}=harness();
 const roomA=await request("rapid","a");
 assert.equal(roomA.status,200);
 assert.equal(roomA.data.members,2);
 const game=roomA.data.game;
 assert.equal(game.phase,"ready");
 assert.equal(game.question,null,"the question stays secret until both players are ready");
 assert.equal(game.correct,null,"never reveal the correct answer before the result");
 assert.equal(game.partnerChoice,null,"do not reveal the other player's answer");
 assert.equal(roomA.data.seat,0);
 await request("rapid","b"); // Both game screens must actually be open.
 const roomB=await request("rapid","c");
 assert.equal(roomB.data.game.scores[0],0);
 assert.notEqual(roomB.data.game.id,game.id);
 const firstReady=await request("rapid","a","ready",{gameId:game.id,round:game.round});
 assert.equal(firstReady.status,200);
 assert.equal(firstReady.data.game.phase,"ready","one ready player cannot trigger the countdown");
 assert.equal(firstReady.data.game.myReady,true);
 const secondReady=await request("rapid","b","ready",{gameId:game.id,round:game.round});
 assert.equal(secondReady.status,200);
 assert.equal(secondReady.data.game.phase,"question");
 const q=RAPID_QUESTIONS.find(item=>item.question===secondReady.data.game.question);
 assert.ok(q);
 const early=await request("rapid","a","answer",{gameId:game.id,round:game.round,choice:q.answer});
 assert.equal(early.status,409,"cannot answer before the countdown completes");
 const now=Date.now();
 sqlite.prepare("UPDATE couple_party_games SET started_at=?,deadline_at=? WHERE room_id='room-A' AND mode='rapid'")
  .run(now-500,now+18000);
 const [left,right]=await Promise.all([
  request("rapid","a","answer",{gameId:game.id,round:game.round,choice:q.answer}),
  request("rapid","b","answer",{gameId:game.id,round:game.round,choice:q.answer})
 ]);
 assert.equal([left.status,right.status].filter(x=>x===200).length,1,"only one correct request wins");
 const outcome=(await request("rapid","a")).data.game;
 assert.equal(outcome.phase,"result");
 assert.equal(outcome.scores[0]+outcome.scores[1],1);
 assert.equal(outcome.correct,q.answer,"answer becomes visible after the first score");
 assert.ok(outcome.winner===0||outcome.winner===1);
 assert.equal((await request("rapid","c")).data.game.scores[0],0,"other couples cannot see this score");
 const forged=await request("rapid","c","next",{gameId:game.id,round:game.round});
 assert.equal(forged.status,409,"a different room cannot manipulate the game");
 const follow=await request("rapid","a","next",{gameId:game.id,round:game.round});
 assert.equal(follow.status,200);
 assert.equal(follow.data.game.round,2);
 assert.equal(follow.data.game.phase,"question","the room stays active without another ready prompt");
 assert.ok(follow.data.game.question,"the next question is prepared automatically");
 assert.ok(follow.data.game.startAt>Date.now(),"both partners get a fresh countdown");
 assert.equal(follow.data.game.myChoice,null,"the new question accepts a fresh answer");
 const partnerFollow=(await request("rapid","b")).data.game;
 assert.equal(partnerFollow.id,game.id,"the original duo room remains fixed");
 assert.equal(partnerFollow.round,2);
 assert.equal(partnerFollow.startAt,follow.data.game.startAt,"both partners share the same countdown");
 assert.equal((await request("rapid","b","ready",{gameId:game.id,round:2})).status,409,"ready is only allowed before round one");
 assert.equal(follow.data.game.correct,null,"new answer is hidden again");
 assert.equal(follow.data.game.scores[0]+follow.data.game.scores[1],1);
 const replay=await request("rapid","b","next",{gameId:game.id,round:game.round});
 assert.equal(replay.status,409,"old-round replay must be ignored");
});
test("legacy active rooms no longer get stuck on a ready screen after round one",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {sqlite,request}=harness();
 const initial=(await request("rapid","a")).data.game;
 sqlite.prepare("UPDATE couple_party_games SET round=11,phase='ready',picked_0=1,picked_1=NULL,started_at=0,deadline_at=0 WHERE room_id='room-A' AND mode='rapid'").run();
 const resumed=(await request("rapid","a")).data.game;
 const partner=(await request("rapid","b")).data.game;
 assert.equal(resumed.id,initial.id,"the existing room must be preserved");
 assert.equal(resumed.round,11);
 assert.equal(resumed.phase,"question");
 assert.equal(partner.phase,"question");
 assert.equal(partner.startAt,resumed.startAt,"refreshes cannot create separate countdowns");
 assert.equal(resumed.correct,null);
 assert.equal(resumed.scores[0]+resumed.scores[1],0);
});
test("Questions rapides: exactly ten points end the match for both partners, no phantom rounds",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {sqlite,request}=harness();
 const first=(await request("rapid","a")).data.game;
 await request("rapid","b");
 sqlite.prepare("UPDATE couple_party_games SET phase='question',round=11,score_0=9,score_1=3,started_at=?,deadline_at=? WHERE room_id='room-A' AND mode='rapid'")
  .run(Date.now()-1000,Date.now()+18000);
 const match=(await request("rapid","a")).data.game;
 const q=RAPID_QUESTIONS.find(item=>item.question===match.question);
 assert.ok(q);
 const won=await request("rapid","a","answer",{gameId:first.id,round:11,choice:q.answer});
 assert.equal(won.status,200);
 assert.equal(won.data.game.phase,"finished");
 assert.equal(won.data.game.matchWinner,0);
 assert.equal(won.data.game.winner,0);
 assert.deepEqual(won.data.game.scores,[10,3]);
 assert.equal(won.data.game.correct,q.answer,"finished match reveals the right answer");
 const other=(await request("rapid","b")).data.game;
 assert.equal(other.id,first.id);
 assert.equal(other.phase,"finished");
 assert.equal(other.matchWinner,0);
 assert.deepEqual(other.scores,[10,3]);
 assert.equal((await request("rapid","b","next",{gameId:first.id,round:11})).status,409);
 assert.equal((await request("rapid","b","answer",{gameId:first.id,round:11,choice:q.answer})).status,409);
 assert.equal((await request("rapid","c")).data.game.scores[0],0);
 // The victory remains visible even if the other participant changes games.
 sqlite.prepare("UPDATE couple_party_presence SET last_seen_at=0 WHERE room_id='room-A' AND member_id='Benoît' AND mode='rapid'").run();
 const absentWinner=await request("rapid","a");
 assert.equal(absentWinner.data.partnerHere,false);
 assert.equal(absentWinner.data.game.phase,"finished");
 const restart=await request("rapid","a","restart",{gameId:first.id,round:11});
 assert.equal(restart.status,200,"a rematch should not require the opponent to be online");
 assert.notEqual(restart.data.game.id,first.id);
 assert.equal(restart.data.game.phase,"ready","a new match requires consent once");
 assert.deepEqual(restart.data.game.scores,[0,0]);
 assert.equal(restart.data.game.round,1);
 assert.equal((await request("rapid","b")).data.game.id,restart.data.game.id);
 assert.equal((await request("rapid","b","answer",{gameId:first.id,round:11,choice:q.answer})).status,409);
});
test("Rapid respects score ten for player B and migrates older rooms",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {sqlite,request}=harness();
 const first=(await request("rapid","a")).data.game;
 await request("rapid","b");
 sqlite.prepare("UPDATE couple_party_games SET phase='question',round=23,score_0=7,score_1=9,started_at=?,deadline_at=? WHERE room_id='room-A' AND mode='rapid'")
  .run(Date.now()-1000,Date.now()+18000);
 const next=(await request("rapid","b")).data.game;
 const q=RAPID_QUESTIONS.find(item=>item.question===next.question);
 assert.ok(q);
 const won=await request("rapid","b","answer",{gameId:first.id,round:23,choice:q.answer});
 assert.equal(won.data.game.phase,"finished");
 assert.equal(won.data.game.matchWinner,1);
 assert.deepEqual(won.data.game.scores,[7,10]);
 const legacy=(await request("rapid","c")).data.game;
 sqlite.prepare("UPDATE couple_party_games SET phase='result',score_0=10,score_1=8 WHERE room_id='room-B' AND mode='rapid'").run();
 const migrated=(await request("rapid","c")).data.game;
 assert.equal(migrated.id,legacy.id);
 assert.equal(migrated.phase,"finished");
 assert.equal(migrated.matchWinner,0);
 assert.equal(migrated.scores[0],10);
});
test("short connection gaps do not falsely mark a partner absent from the rapid room",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {sqlite,request}=harness();
 await request("rapid","a");await request("rapid","b");
 sqlite.prepare("UPDATE couple_party_presence SET last_seen_at=? WHERE room_id='room-A' AND mode='rapid' AND member_id='Benoît'").run(Date.now()-9000);
 assert.equal((await request("rapid","a")).data.partnerHere,true);
 sqlite.prepare("UPDATE couple_party_presence SET last_seen_at=? WHERE room_id='room-A' AND mode='rapid' AND member_id='Benoît'").run(Date.now()-36000);
 assert.equal((await request("rapid","a")).data.partnerHere,false);
 const ui=readFileSync("src/CoupleParty.tsx","utf8");
 assert.ok(ui.includes("Être connecté(e) à Love Radar ou dans un autre jeu ne signifie pas être dans cette partie."));
 assert.ok(ui.includes('rapid?.phase==="finished"?<div'));
 assert.ok(ui.includes('onClick={()=>void post("restart")}'));
});
test("when the timer expires without a correct answer, both partners see the same result",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {sqlite,request}=harness();
 const initial=await request("rapid","a");
 await request("rapid","b");
 await request("rapid","a","ready",{gameId:initial.data.game.id,round:1});
 const original=await request("rapid","b","ready",{gameId:initial.data.game.id,round:1});
 assert.equal(original.data.game.phase,"question");
 sqlite.prepare("UPDATE couple_party_games SET started_at=?,deadline_at=? WHERE room_id='room-A' AND mode='rapid'")
  .run(Date.now()-30000,Date.now()-1000);
 const a=await request("rapid","a"),b=await request("rapid","b");
 assert.equal(original.data.game.phase,"question");
 assert.equal(a.data.game.phase,"result");
 assert.equal(b.data.game.phase,"result");
 assert.equal(a.data.game.winner,null);
 assert.equal(b.data.game.scores[0]+b.data.game.scores[1],0);
});
test("truth or action alternates turns; a pass is never scored; only active player can act",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {request}=harness();
 const initial=(await request("truth","a")).data.game;
 await request("truth","b");
 await request("truth","a","ready",{gameId:initial.id,round:1});
 await request("truth","b","ready",{gameId:initial.id,round:1});
 assert.equal(initial.turn,0);
 assert.equal(initial.phase,"choose");
 // Only the player whose turn it is may draw, even in round one.
 const tooEarly=await request("truth","b","pick",{gameId:initial.id,round:1,kind:"truth"});
 assert.equal(tooEarly.status,409);
 const picked=await request("truth","a","pick",{gameId:initial.id,round:1,kind:"truth"});
 assert.equal(picked.status,200);
 assert.equal(picked.data.game.kind,"truth");
 assert.ok(TRUTH_PROMPTS.includes(picked.data.game.prompt));
 const duplicate=await request("truth","b","pick",{gameId:initial.id,round:1,kind:"action"});
 assert.equal(duplicate.status,409,"the first selected card is authoritative");
 assert.ok(picked.data.game.prompt?.length>12);
 assert.equal((await request("truth","b")).data.game.prompt,picked.data.game.prompt);
 const finished=await request("truth","a","finish",{gameId:initial.id,round:1});
 assert.equal(finished.status,200);
 assert.equal(finished.data.game.phase,"choose");
 assert.equal(finished.data.game.turn,1);
 assert.equal(finished.data.game.scores[0],1);
 const wrongTurn=await request("truth","a","pick",{gameId:initial.id,round:2,kind:"action"});
 assert.equal(wrongTurn.status,409,"later rounds alternate turns");
 const pickedB=await request("truth","b","pick",{gameId:initial.id,round:2,kind:"action"});
 assert.equal(pickedB.status,200);
 assert.equal(pickedB.data.game.kind,"action");
 assert.ok(ACTION_PROMPTS.includes(pickedB.data.game.prompt),"action cannot silently become truth");
 assert.equal((await request("truth","a")).data.game.prompt,pickedB.data.game.prompt,"the same action is shown to both");
 const pass=await request("truth","b","pass",{gameId:initial.id,round:2});
 assert.equal(pass.status,200);
 assert.equal(pass.data.game.turn,0);
 assert.equal(pass.data.game.scores[1],0);
});
test("surprise alternates real actions and truths without overriding a manual choice",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {request}=harness();
 let game=(await request("truth","a")).data.game;
 await request("truth","b");
 await request("truth","a","ready",{gameId:game.id,round:1});
 await request("truth","b","ready",{gameId:game.id,round:1});
 let picked=await request("truth","a","pick",{gameId:game.id,round:game.round,kind:"action"});
 assert.equal(picked.data.game.kind,"action");
 game=(await request("truth","a","finish",{gameId:game.id,round:game.round})).data.game;
 picked=await request("truth","b","pick",{gameId:game.id,round:game.round,kind:"surprise"});
 assert.equal(picked.data.game.kind,"truth","surprise should balance the previous action");
 assert.equal((await request("truth","a")).data.game.kind,"truth");
 game=(await request("truth","b","finish",{gameId:game.id,round:game.round})).data.game;
 picked=await request("truth","a","pick",{gameId:game.id,round:game.round,kind:"surprise"});
 assert.equal(picked.data.game.kind,"action","surprise should balance the previous truth");
 game=(await request("truth","a","finish",{gameId:game.id,round:game.round})).data.game;
 picked=await request("truth","b","pick",{gameId:game.id,round:game.round,kind:"truth"});
 assert.equal(picked.data.game.kind,"truth","manual choice must remain available");
});
test("the room remembers each action and truth card until its own deck is exhausted",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {request,sqlite}=harness();
 let game=(await request("truth","a")).data.game;
 await request("truth","b");
 await request("truth","a","ready",{gameId:game.id,round:1});
 await request("truth","b","ready",{gameId:game.id,round:1});
 for(const [kind,cards] of [["action",ACTION_PROMPTS],["truth",TRUTH_PROMPTS]] as const){
  const seen=new Set<string>();
  for(let i=0;i<cards.length;i++){
   const user=game.turn===0?"a":"b";
   const drawn=await request("truth",user,"pick",{gameId:game.id,round:game.round,kind});
   assert.equal(drawn.status,200);
   assert.equal(drawn.data.game.kind,kind);
   assert.ok(cards.includes(drawn.data.game.prompt));
   assert.ok(!seen.has(drawn.data.game.prompt),"the "+kind+" deck must not repeat before exhaustion");
   seen.add(drawn.data.game.prompt);
   const next=await request("truth",user,"pass",{gameId:game.id,round:game.round});
   assert.equal(next.status,200);
   game=next.data.game;
  }
  assert.equal(seen.size,cards.length);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM couple_party_prompt_history WHERE room_id='room-A' AND kind=?").get(kind)?.n,cards.length);
  const user=game.turn===0?"a":"b";
  const next=await request("truth",user,"pick",{gameId:game.id,round:game.round,kind});
  assert.equal(next.status,200,"the deck can reshuffle after all cards were played");
  assert.notEqual(next.data.game.prompt,Array.from(seen)[seen.size-1],"reshuffle must avoid an immediate duplicate");
  game=(await request("truth",user,"pass",{gameId:game.id,round:game.round})).data.game;
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM couple_party_prompt_history WHERE room_id='room-A' AND kind=?").get(kind)?.n,1);
 }
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM couple_party_prompt_history WHERE room_id='room-B'").get()?.n,0,"other couples never share a deck");
});
test("offline partner never counts as an active game player",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {request,sqlite}=harness();
 const alone=await request("rapid","a");
 assert.equal(alone.data.members,2);
 assert.equal(alone.data.partnerHere,false,"registration does not mean in-game presence");
 assert.equal((await request("rapid","a","ready",{gameId:alone.data.game.id,round:1})).status,409);
 assert.equal((await request("rapid","b")).data.partnerHere,true);
 assert.equal((await request("rapid","a")).data.partnerHere,true);
 sqlite.prepare("UPDATE couple_party_presence SET last_seen_at=0 WHERE room_id='room-A' AND mode='rapid' AND member_id='Benoît'").run();
 assert.equal((await request("rapid","a")).data.partnerHere,false);
 assert.equal((await request("rapid","a","ready",{gameId:alone.data.game.id,round:1})).status,409);
});
test("truth game asks for confirmation only once before the first turn",async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const {request}=harness();
 const initial=(await request("truth","a")).data.game;
 await request("truth","b");
 assert.equal((await request("truth","a","pick",{gameId:initial.id,round:1,kind:"action"})).status,409);
 const first=await request("truth","a","ready",{gameId:initial.id,round:1});
 assert.equal(first.data.game.myReady,true);
 assert.equal(first.data.game.partnerReady,false);
 assert.equal((await request("truth","a","pick",{gameId:initial.id,round:1,kind:"action"})).status,409);
 const second=await request("truth","b","ready",{gameId:initial.id,round:1});
 assert.equal(second.data.game.myReady,true);
 assert.equal(second.data.game.partnerReady,true);
 assert.equal((await request("truth","a","pick",{gameId:initial.id,round:1,kind:"action"})).status,200);
 const next=await request("truth","a","finish",{gameId:initial.id,round:1});
 assert.equal(next.data.game.round,2);
 assert.equal(next.data.game.myReady,true);
 assert.equal(next.data.game.partnerReady,true);
 assert.equal((await request("truth","b","pick",{gameId:initial.id,round:2,kind:"truth"})).status,200);
});
test("both new games are accessible, authenticated, and erased with room deletion",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const hub=readFileSync("src/GamesHub.tsx","utf8");
 const api=readFileSync("functions/api/couple-party.ts","utf8");
 const push=readFileSync("functions/lib/push.ts","utf8");
 const sw=readFileSync("public/sw.js","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 const schema=readFileSync("schema.sql","utf8");
 const ui=readFileSync("src/CoupleParty.tsx","utf8");
 assert.ok(hub.includes('onOpenGame("rapid")'));
 assert.ok(hub.includes('onOpenGame("truth")'));
 assert.ok(app.includes('tab==="rapid"||tab==="truth"?<CoupleParty'));
 assert.ok(api.includes("SELECT id,room_id,seat,name FROM members WHERE token_hash=?"));
 assert.ok(api.includes("PRIMARY KEY(room_id,mode)"));
 assert.ok(api.includes("AND phase='question' AND started_at<=?"));
 assert.ok(api.includes('deadline_at>? AND "+col+" IS NULL'),"a player can only submit once before the deadline");
 assert.ok(!api.includes("correct:q.answer"));
 assert.ok(push.includes('"rapid"|"truth"'));
 assert.ok(sw.includes('"rps","draw","escape","rapid","truth"'));
 assert.ok(deletion.includes('"couple_party_games"'));
 assert.ok(deletion.includes('"couple_party_prompt_history"'),"deleting a room deletes its prompt history");
 assert.ok(deletion.includes('"couple_party_presence"'),"room deletion clears the game heartbeat");
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS couple_party_presence"));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS couple_party_prompt_history"));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS couple_party_games"));
 assert.ok(ui.includes('window.setInterval(()=>void refresh(true),900)'));
 assert.ok(ui.includes('onClick={()=>void post("ready")}'));
 assert.ok(api.includes('AND phase=\'ready\' AND picked_0=1 AND picked_1=1'));
 assert.ok(ui.includes('onClick={()=>void post("finish")}'));
 assert.ok(ui.includes('onClick={()=>void post("pass")}'));
 assert.ok(ui.includes('kind:"surprise"'),"the balanced surprise draw is accessible");
});
