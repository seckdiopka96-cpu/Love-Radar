import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash,webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {onRequestGet,onRequestPost} from "../functions/api/call";
import {formatCallDuration} from "../src/CallHistoryBubble";
import type {D1Database} from "@cloudflare/workers-types";

const key=(char:string)=>char.repeat(64);
function setup(){
 if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL);");
 // Every isolated test DB mirrors the production call schema. The API also
 // initializes these tables lazily in a real Cloudflare D1 isolate.
 const schema=readFileSync("schema.sql","utf8");
 const callStart=schema.indexOf("CREATE TABLE IF NOT EXISTS voice_calls (");
 const callEnd=schema.indexOf("-- Two-player Ludo",callStart);
 assert.ok(callStart>=0&&callEnd>callStart);
 sqlite.exec(schema.slice(callStart,callEnd));
 const accounts:[string,string,string][]=[["alice","couple-1","a"],["bob","couple-1","b"],["carol","couple-2","c"]];
 for(const [name,room,character] of accounts){
  const digest=createHash("sha256").update(key(character)).digest("hex");
  sqlite.prepare("INSERT INTO members VALUES(?,?,?,?)").run(name,room,name,digest);
 }
 const command=(sql:string,values:unknown[])=>({
  async first(){return sqlite.prepare(sql).get(...values as [])??null},
  async all(){return {results:sqlite.prepare(sql).all(...values as [])}},
  async run(){const result=sqlite.prepare(sql).run(...values as []);return {meta:{changes:Number(result.changes)}}}
 });
 const db={async exec(sql:string){sqlite.exec(sql);return {}},prepare(sql:string){
  return {...command(sql,[]),bind(...params:unknown[]){return command(sql,params)}};
 }} as unknown as D1Database;
 async function invoke(method:"GET"|"POST",user:string,body?:Record<string,unknown>,history=false){
  const req=new Request("https://example.org/api/call"+(history?"?history=1":""),{
   method,headers:{"Authorization":"Bearer "+key(user),...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const ctx={request:req,env:{DB:db},waitUntil:(_task:Promise<unknown>)=>{}};
  const res=await (method==="GET"?onRequestGet(ctx):onRequestPost(ctx));
  return {status:res.status,data:await res.json() as any};
 }
 return {db,sqlite,invoke};
}
test("elapsed call duration has readable hours, minutes and seconds",()=>{
 assert.equal(formatCallDuration(0),"0 s");
 assert.equal(formatCallDuration(9),"9 s");
 assert.equal(formatCallDuration(62),"1 min 02 s");
 assert.equal(formatCallDuration(126),"2 min 06 s");
 assert.equal(formatCallDuration(3665),"1 h 01 min 05 s");
});
test("call history follows real server state and is strictly private to a couple",async()=>{
 const {sqlite,invoke}=setup();
 const original=await invoke("GET","a",undefined,true);
 assert.equal(original.status,200);
 assert.deepEqual(original.data.calls,[]);
 const callId="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
 const when=Date.now();
 sqlite.prepare("INSERT INTO voice_calls VALUES(?,?,?,?,?,?,?,?)")
  .run(callId,"couple-1","alice","bob","ringing",when-10000,when-10000,when+60000);
 // A successful accept starts the call-duration clock, not the ringing period.
 const answered=await invoke("POST","b",{action:"accept",id:callId});
 assert.equal(answered.status,200);
 const active=await invoke("GET","a",undefined,true);
 assert.equal(active.data.calls.length,1);
 assert.equal(active.data.calls[0].id,callId);
 assert.equal(active.data.calls[0].status,"active");
 assert.ok(active.data.calls[0].connectedAt>0);
 const other=await invoke("GET","c",undefined,true);
 assert.deepEqual(other.data.calls,[],"other room must never receive call metadata");
 sqlite.prepare("UPDATE voice_call_history SET connected_at=? WHERE call_id=?")
  .run(Date.now()-127000,callId);
 const ended=await invoke("POST","a",{action:"end",id:callId});
 assert.equal(ended.status,200);
 const done=await invoke("GET","b",undefined,true);
 assert.equal(done.data.calls.length,1);
 assert.equal(done.data.calls[0].status,"completed");
 assert.ok(done.data.calls[0].durationSeconds>=126&&done.data.calls[0].durationSeconds<=129);
 assert.ok(done.data.calls[0].endedAt>=done.data.calls[0].connectedAt);
 assert.equal((await invoke("GET","a",undefined,true)).data.calls[0].durationSeconds,
  done.data.calls[0].durationSeconds,"both partners see one authoritative duration");
 assert.equal((await invoke("GET","a",undefined,true)).data.calls.length,1,"ending does not duplicate the chat bubble");
 assert.equal((await invoke("GET","c",undefined,true)).data.calls.length,0);
 const forbidden=await invoke("POST","c",{action:"end",id:callId});
 assert.equal(forbidden.status,409,"another room cannot end this call");
 sqlite.close();
});
test("a declined call is not misreported as a completed conversation",async()=>{
 const {sqlite,invoke}=setup();
 await invoke("GET","a",undefined,true);
 const id="bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",at=Date.now();
 sqlite.prepare("INSERT INTO voice_calls VALUES(?,?,?,?,?,?,?,?)")
  .run(id,"couple-1","alice","bob","ringing",at,at,at+60000);
 const declined=await invoke("POST","b",{action:"decline",id});
 assert.equal(declined.status,200);
 const result=await invoke("GET","a",undefined,true);
 assert.equal(result.data.calls[0].status,"declined");
 assert.equal(result.data.calls[0].durationSeconds,0);
 sqlite.close();
});
test("video call intent persists to both partners and call history without affecting voice calls",async()=>{
 const {sqlite,invoke}=setup();
 const bad=await invoke("POST","a",{action:"start",mode:"screen-share"});
 assert.equal(bad.status,400);
 const launched=await invoke("POST","a",{action:"start",mode:"video"});
 assert.equal(launched.status,200);
 assert.equal(launched.data.call.mode,"video");
 const id=launched.data.call.id;
 const callee=await invoke("GET","b");
 assert.equal(callee.data.call.mode,"video");
 assert.equal(callee.data.call.direction,"incoming");
 const collision=await invoke("POST","b",{action:"start",mode:"audio"});
 assert.equal(collision.data.call.id,id);
 assert.equal(collision.data.call.mode,"video");
 assert.equal((await invoke("POST","b",{action:"accept",id})).status,200);
 const history=await invoke("GET","a",undefined,true);
 assert.equal(history.data.calls[0].mode,"video");
 assert.equal((await invoke("POST","a",{action:"end",id})).status,200);
 const voice=await invoke("POST","a",{action:"start",mode:"audio"});
 assert.equal(voice.status,200);
 assert.equal(voice.data.call.mode,"audio");
 assert.notEqual(voice.data.call.id,id);
 sqlite.close();
});

test("ICE reconnect signals stay private, bounded and allow renewed SDP without ending calls",async()=>{
 const {sqlite,invoke}=setup();
 const created=await invoke("POST","a",{action:"start",mode:"video"});
 assert.equal(created.status,200);
 const id=created.data.call.id;
 assert.equal((await invoke("POST","b",{action:"accept",id})).status,200);
 const sdpA="v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
 const sdpB="v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
 const sdpC="v=0\r\no=- 3 3 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
 assert.equal((await invoke("POST","a",{action:"signal",kind:"offer",sdp:sdpA,id})).status,200);
 const repeated=await invoke("POST","a",{action:"signal",kind:"offer",sdp:sdpA,restart:true,id});
 assert.equal(repeated.data.duplicate,true,"same SDP stays idempotent");
 const forbidden=await invoke("POST","a",{action:"signal",kind:"restart",id});
 assert.equal(forbidden.status,403,"caller cannot fabricate callee restart requests");
 assert.equal((await invoke("POST","b",{action:"signal",kind:"restart",id})).status,200);
 assert.equal((await invoke("POST","b",{action:"signal",kind:"restart",id})).data.duplicate,true);
 const stranger=await invoke("POST","c",{action:"signal",kind:"restart",id});
 assert.equal(stranger.status,409,"another couple cannot trigger renegotiation");
 sqlite.prepare("UPDATE voice_signals SET created_at=? WHERE call_id=? AND kind='offer'").run(Date.now()-2000,id);
 const refreshed=await invoke("POST","a",{action:"signal",kind:"offer",sdp:sdpB,restart:true,id});
 assert.equal(refreshed.status,200);
 assert.equal(refreshed.data.sent,true);
 const newer=sqlite.prepare("SELECT kind,payload FROM voice_signals WHERE call_id=? AND to_member='bob' ORDER BY id DESC LIMIT 1").get(id) as {kind:string;payload:string};
 assert.equal(newer.kind,"offer");
 assert.equal(newer.payload,sdpB);
 const noMarker=await invoke("POST","a",{action:"signal",kind:"offer",sdp:sdpC,id});
 assert.equal(noMarker.data.duplicate,true);
 assert.equal(sqlite.prepare("SELECT COUNT(*) as n FROM voice_signals WHERE call_id=? AND kind='offer'").get(id)?.n,2);
 assert.equal((await invoke("POST","a",{action:"heartbeat",id})).status,200);
 sqlite.close();
});

test("chat mixes call bubbles with messages and preserves current voice call controls",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const api=readFileSync("functions/api/call.ts","utf8");
 const ui=readFileSync("src/CallHistoryBubble.tsx","utf8");
 const call=readFileSync("src/VoiceCall.tsx","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(app.includes('apiFetch("/api/call?history=1"'));
 assert.ok(app.includes('chatTimeline.map((entry,feedIndex)=>'));
 assert.ok(app.includes("<CallHistoryBubble call={entry.call}"));
 assert.ok(api.includes("JOIN voice_call_history h"));
 assert.ok(api.includes("connected_at=COALESCE(connected_at,?)"));
 assert.ok(api.includes("ended_at=COALESCE(ended_at,?)"));
 assert.ok(ui.includes('"Appel en cours"'));
 assert.ok(ui.includes('"Durée de l’appel · "'));
 assert.ok(deletion.includes('"voice_call_history"'));
 assert.ok(call.includes('onClick={hangup}'));
 assert.ok(call.includes('beginNativeCallSession(callId,token)'));
});
