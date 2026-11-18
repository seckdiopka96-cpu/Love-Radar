import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {onRequestGet,onRequestPost} from "../functions/api/favorites";
type Resp={ok:boolean;error?:string;favorites?:{id:string;content:string|null;kind:string}[]};
const TOKEN=["a".repeat(64),"b".repeat(64),"c".repeat(64)];
function fixture(){
 const sql=new DatabaseSync(":memory:");
 sql.exec(readFileSync("schema.sql","utf8"));
 sql.exec("CREATE TABLE IF NOT EXISTS message_hidden(room_id TEXT NOT NULL,message_id TEXT NOT NULL,member_id TEXT NOT NULL,hidden_at INTEGER NOT NULL,PRIMARY KEY(room_id,message_id,member_id));CREATE TABLE IF NOT EXISTS message_one_time(room_id TEXT NOT NULL,message_id TEXT PRIMARY KEY,opened_by TEXT,opened_at INTEGER NOT NULL DEFAULT 0)");
 sql.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?)").run("room-A","CODEAA","uA",Date.now());
 sql.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?)").run("room-B","CODEBB","uC",Date.now());
 for(const [i,id,room,seat] of [[0,"uA","room-A",0],[1,"uB","room-A",1],[2,"uC","room-B",0]] as const)
  sql.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) VALUES(?,?,?,?,?,?)")
   .run(id,room,id,seat,createHash("sha256").update(TOKEN[i]).digest("hex"),Date.now());
 const bind=(sqlString:string,params:unknown[])=>{
  const statement=sql.prepare(sqlString);
  return {
   async first(){return statement.get(...params as [])||null},
   async all(){return {results:statement.all(...params as [])}},
   async run(){const result=statement.run(...params as []);return {meta:{changes:Number(result.changes)}}}
  };
 };
 const db={prepare:(q:string)=>({bind:(...params:unknown[])=>bind(q,params)}),exec:async(q:string)=>sql.exec(q)};
 const request=(idx:number,method:"GET"|"POST",body?:object)=>({
  request:new Request("https://love-radar-acd.pages.dev/api/favorites",{
   method,headers:{Authorization:"Bearer "+TOKEN[idx],"Content-Type":"application/json"},
   ...(body?{body:JSON.stringify(body)}:{})
  }),
  env:{DB:db}
 });
 const get=(idx:number)=>onRequestGet(request(idx,"GET") as never);
 const post=(idx:number,action:"add"|"remove",id:string)=>onRequestPost(request(idx,"POST",{action,id}) as never);
 const addMessage=(id:string,sender="uA",kind="text",body="Je pense à toi ❤️")=>{
  sql.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,?,?,?)")
   .run(id,sender==="uC"?"room-B":"room-A",sender,kind,body,Date.now());
 };
 return {sql,request,get,post,addMessage};
}
async function json(response:Response){return response.json() as Promise<Resp>}
test("favorites are per-user, room-isolated, survive reload and never duplicate plaintext",async()=>{
 const f=fixture(),id=randomUUID();
 f.addMessage(id);
 const created=await json(await f.post(0,"add",id));
 assert.equal(created.ok,true,created.error);
 assert.equal(created.favorites?.length,1);
 assert.equal(created.favorites?.[0].content,"Je pense à toi ❤️");
 assert.equal((await json(await f.get(1))).favorites?.length,0,"partner must not see my personal stars");
 assert.equal((await json(await f.get(2))).favorites?.length,0,"another couple cannot see them");
 assert.equal((await f.post(2,"add",id)).status,404,"another couple cannot bookmark another room's message");
 assert.equal((await json(await f.post(0,"add",id))).favorites?.length,1,"adding twice is idempotent");
 const row=f.sql.prepare("SELECT * FROM message_favorites WHERE message_id=?").get(id) as Record<string,unknown>;
 assert.equal(row.message_id,id);
 assert.equal(row.content,undefined,"bookmark table stores no conversation text");
 assert.equal((await json(await f.post(0,"remove",id))).favorites?.length,0);
 f.sql.close();
});
test("bookmarks include old voice IDs while protecting hidden and one-time media",async()=>{
 const f=fixture(),voice=randomUUID(),temporary=randomUUID(),hidden=randomUUID();
 f.addMessage(voice,"uB","audio",null as unknown as string);
 f.addMessage(temporary,"uB","image",null as unknown as string);
 f.addMessage(hidden,"uB","text","Confidentiel");
 f.sql.prepare("INSERT INTO message_one_time(room_id,message_id,opened_at) VALUES(?,?,0)").run("room-A",temporary);
 f.sql.prepare("INSERT INTO message_hidden(room_id,message_id,member_id,hidden_at) VALUES(?,?,?,?)").run("room-A",hidden,"uA",Date.now());
 assert.equal((await json(await f.post(0,"add",voice))).favorites?.[0].kind,"audio");
 assert.equal((await f.post(0,"add",temporary)).status,404);
 assert.equal((await f.post(0,"add",hidden)).status,404);
 assert.equal((await json(await f.post(1,"add",hidden))).favorites?.length,1,"visible to other partner");
 f.sql.prepare("DELETE FROM messages WHERE id=?").run(voice);
 assert.equal((await json(await f.get(0))).favorites?.length,0,"deleted messages removed from favorites");
 assert.equal(Number((f.sql.prepare("SELECT COUNT(*) n FROM message_favorites WHERE message_id=?").get(voice) as {n:number}).n),0);
 f.sql.close();
});
test("encrypted text stays opaque in favorites storage and is not indexed server-side",async()=>{
 const f=fixture(),id=randomUUID(),ciphertext="lre1.opaque-payload-that-only-the-client-can-decrypt";
 f.addMessage(id,"uB","text",ciphertext);
 assert.equal((await json(await f.post(0,"add",id))).favorites?.[0].content,ciphertext);
 const raw=f.sql.prepare("SELECT * FROM message_favorites WHERE message_id=?").get(id) as Record<string,unknown>;
 assert.ok(!Object.values(raw).some(v=>typeof v==="string"&&v.includes("opaque-payload")));
 f.sql.close();
});
test("search panel includes saved voices, more history and on-device text filtering",()=>{
 const ui=readFileSync("src/ChatFavorites.tsx","utf8");
 assert.match(ui,/Rechercher un mot, un prénom ou un ancien vocal/);
 assert.match(ui,/Écouter le vocal/);
 assert.match(ui,/Chercher aussi dans les messages plus anciens/);
 assert.match(ui,/normalize\(item\.content\|\|""\)\.includes\(q\)/);
 assert.match(ui,/onLoadMedia\(item\)/);
 assert.match(ui,/favoritesIds\.has\(item\.id\)/);
});
test("favorite entry remains in long press menu and is erased when couple data is removed",()=>{
 const app=readFileSync("src/App.tsx","utf8"),deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(app.includes('className="lr-chat-archive-tools"'));
 assert.ok(app.includes("Ajouter aux favoris"));
 assert.ok(app.includes('onClick={()=>void toggleFavorite(actionMessage)}'));
 assert.ok(app.includes('onLoadMedia={message=>void fetchMedia(message)}'));
 assert.ok(deletion.includes('"message_favorites"'));
});
