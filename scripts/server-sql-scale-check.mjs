#!/usr/bin/env node
// Reproducible LOCAL SQLite query-scale check; this is NOT a Cloudflare load test.
// Never contacts production, does not read tokens, does not modify user records.
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";

const rooms=1000,messagesPerRoom=60,readRounds=3;
const db=new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../schema.sql",import.meta.url),"utf8"));
db.exec("BEGIN TRANSACTION");
const room=db.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?)");
const member=db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) VALUES(?,?,?,?,?,?)");
const message=db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,'text',?,?)");
const presence=db.prepare("INSERT INTO chat_presence(room_id,member_id,last_seen_at) VALUES(?,?,?)");
const revision=db.prepare("INSERT INTO room_revisions(room_id,revision,updated_at) VALUES(?,0,0)");
for(let i=0;i<rooms;i++){
 const id="room-"+String(i).padStart(5,"0"),memberA="a-"+id,memberB="b-"+id;
 room.run(id,"INVITE"+String(i).padStart(8,"0"),memberA,1_000);
 member.run(memberA,id,"A",0,"a".repeat(60)+String(i).padStart(4,"0"),1_000);
 member.run(memberB,id,"B",1,"b".repeat(60)+String(i).padStart(4,"0"),1_000);
 presence.run(id,memberA,1_000);presence.run(id,memberB,1_000);
 revision.run(id);
 for(let j=0;j<messagesPerRoom;j++)
  message.run(id+"-msg-"+j,id,j%2===0?memberA:memberB,"local synthetic",1_000+j);
}
db.exec("COMMIT");
const q=db.prepare("SELECT id,room_id,created_at FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT 90");
const status=db.prepare("SELECT revision FROM room_revisions WHERE room_id=?");
const plans=db.prepare("EXPLAIN QUERY PLAN SELECT id,room_id,created_at FROM messages WHERE room_id=? ORDER BY created_at DESC LIMIT 90").all("room-00000");
const planDetails=plans.map(x=>String(x.detail||""));
if(!planDetails.some(x=>x.includes("idx_messages_room"))||planDetails.some(x=>/SCAN messages/i.test(x)))
 throw Error("Snapshot query no longer uses room-scoped message index.");
const samples=[];
let crossRoomLeaks=0,wrongRevisions=0;
for(let round=0;round<readRounds;round++)for(let i=0;i<rooms;i++){
 const id="room-"+String((i*173+round*211)%rooms).padStart(5,"0");
 const start=performance.now();
 const messages=q.all(id),rev=status.get(id);
 samples.push(performance.now()-start);
 if(messages.length!==messagesPerRoom||messages.some(m=>m.room_id!==id))crossRoomLeaks++;
 if(rev?.revision!==0)wrongRevisions++;
}
const sorted=samples.sort((a,b)=>a-b);
const percentile=p=>Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]*1000)/1000;
const result={
 mode:"LOCAL SQLITE DATA-SCALE ONLY — NO CLOUDFLARE TRAFFIC",
 couples:rooms,members:rooms*2,messages:rooms*messagesPerRoom,
 snapshotAndStatusReads:samples.length,crossRoomLeaks,wrongRevisions,
 indexUsed:true,p50QueryMs:percentile(.5),p95QueryMs:percentile(.95),
 caveat:"Not concurrent users, not Cloudflare D1/R2 latency or capacity"
};
console.log(JSON.stringify(result,null,2));
db.close();
if(crossRoomLeaks||wrongRevisions)process.exitCode=1;
