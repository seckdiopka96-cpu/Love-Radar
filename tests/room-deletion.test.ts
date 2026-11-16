import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {deleteCoupleRoom,ROOM_DATA_TABLES,MEMBER_DATA_TABLES,buildRoomDeletionBatch} from "../functions/lib/delete-room";

type Bound={sql:string;params:unknown[];run:()=>Promise<{meta:{changes:number}}>;first:()=>Promise<Record<string,unknown>|null>;all:()=>Promise<{results:Record<string,unknown>[]}>};
function localD1(){
 const sqlite=new DatabaseSync(":memory:");
 // This adapter executes actual SQLite SQL and uses a real BEGIN/ROLLBACK
 // transaction, as Cloudflare D1's batch() does.
 const bound=(sql:string,params:unknown[]):Bound=>({
  sql,params,
  async run(){
   const result=sqlite.prepare(sql).run(...params as []);
   return {meta:{changes:Number(result.changes)}};
  },
  async first(){
   return (sqlite.prepare(sql).get(...params as []) as Record<string,unknown>|undefined)??null;
  },
  async all(){
   return {results:sqlite.prepare(sql).all(...params as []) as Record<string,unknown>[]};
  }
 });
 // Cloudflare D1 accepts both db.prepare(sql).all() and .bind(...).all().
 const prepare=(sql:string)=>({
  ...bound(sql,[]),
  bind(...params:unknown[]){return bound(sql,params)}
 });
 const db={
  prepare,
  async batch(commands:Bound[]){
   sqlite.exec("BEGIN TRANSACTION");
   try{
    const results=[];
    for(const cmd of commands)results.push(await cmd.run());
    sqlite.exec("COMMIT");
    return results;
   }catch(error){sqlite.exec("ROLLBACK");throw error}
  }
 };
 return {sqlite,db:db as unknown as Parameters<typeof deleteCoupleRoom>[0]};
}
function seed({sqlite}:{sqlite:DatabaseSync},withOptional=true){
 sqlite.exec("CREATE TABLE rooms(id TEXT PRIMARY KEY);CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL);");
 sqlite.prepare("INSERT INTO rooms(id) VALUES(?)").run("room-A");
 sqlite.prepare("INSERT INTO rooms(id) VALUES(?)").run("room-B");
 for(const [id,room] of [["a1","room-A"],["a2","room-A"],["b1","room-B"]]){
  sqlite.prepare("INSERT INTO members(id,room_id) VALUES(?,?)").run(id,room);
 }
 if(!withOptional)return;
 for(const table of ROOM_DATA_TABLES){
  if(table==="messages")sqlite.exec("CREATE TABLE messages(room_id TEXT,object_key TEXT,payload TEXT);");
  else if(table==="profile_photos")sqlite.exec("CREATE TABLE profile_photos(room_id TEXT,object_key TEXT);");
  else if(table==="couple_stories")sqlite.exec("CREATE TABLE couple_stories(room_id TEXT,photo_key TEXT);");
  else if(table==="couple_reconciliations")sqlite.exec("CREATE TABLE couple_reconciliations(room_id TEXT,id TEXT,payload TEXT);");
  else sqlite.exec("CREATE TABLE "+table+"(room_id TEXT,payload TEXT);");
  if(table==="messages"){
   const insert=sqlite.prepare("INSERT INTO messages(room_id,object_key,payload) VALUES(?,?,?)");
   for(let n=0;n<222;n++)insert.run("room-A",String(n).padStart(4,"0")+"-A","chat");
   insert.run("room-B","private-B","chat");
  }else if(table==="profile_photos"){
   sqlite.prepare("INSERT INTO profile_photos(room_id,object_key) VALUES(?,?)").run("room-A","profile/room-A/a1/photo1");
   sqlite.prepare("INSERT INTO profile_photos(room_id,object_key) VALUES(?,?)").run("room-B","profile/room-B/b1/photo");
  }else if(table==="couple_stories"){
   sqlite.prepare("INSERT INTO couple_stories(room_id,photo_key) VALUES(?,?)").run("room-A","couple-story/room-A/photo");
   sqlite.prepare("INSERT INTO couple_stories(room_id,photo_key) VALUES(?,?)").run("room-B","couple-story/room-B/photo");
  }else if(table==="couple_reconciliations"){
   sqlite.prepare("INSERT INTO couple_reconciliations(room_id,id,payload) VALUES(?,?,?)").run("room-A","secret-session-A","secret");
   sqlite.prepare("INSERT INTO couple_reconciliations(room_id,id,payload) VALUES(?,?,?)").run("room-B","session-B","keep");
  }else{
   sqlite.prepare("INSERT INTO "+table+"(room_id,payload) VALUES(?,?)").run("room-A","secret");
   sqlite.prepare("INSERT INTO "+table+"(room_id,payload) VALUES(?,?)").run("room-B","keep");
  }
 }
 sqlite.exec("CREATE TABLE couple_reconciliation_entries(session_id TEXT,member_id TEXT,pain TEXT,needs TEXT,message TEXT);");
 sqlite.prepare("INSERT INTO couple_reconciliation_entries VALUES(?,?,?,?,?)").run("secret-session-A","a1","private pain","private need","private message");
 sqlite.prepare("INSERT INTO couple_reconciliation_entries VALUES(?,?,?,?,?)").run("orphaned-session-A","a2","old pain","old need","old message");
 sqlite.prepare("INSERT INTO couple_reconciliation_entries VALUES(?,?,?,?,?)").run("session-B","b1","other pain","other need","other message");
 sqlite.exec("CREATE TABLE member_recovery(member_id TEXT,code_hash TEXT);CREATE TABLE push_test_throttle(member_id TEXT,last_test_at INTEGER);CREATE TABLE abuse_counters(scope TEXT,actor TEXT);");
 for(const id of ["a1","a2","b1"]){
  sqlite.prepare("INSERT INTO member_recovery VALUES(?,?)").run(id,"secret-"+id);
  sqlite.prepare("INSERT INTO push_test_throttle VALUES(?,?)").run(id,1234);
  sqlite.prepare("INSERT INTO abuse_counters VALUES(?,?)").run("message","member:"+id);
 }
 sqlite.prepare("INSERT INTO abuse_counters VALUES(?,?)").run("public","ip:unrelated");
}
function privateBucket(fail=false){
 const objects=new Set<string>();
 for(let n=0;n<222;n++)objects.add(String(n).padStart(4,"0")+"-A");
 objects.add("private-B");
 objects.add("profile/room-A/a1/photo1");
 objects.add("profile/room-A/a1/old-photo");
 objects.add("profile/room-B/b1/photo");
 objects.add("couple-story/room-A/photo");
 objects.add("couple-story/room-A/old-photo");
 objects.add("couple-story/room-B/photo");
 let deleteCalls=0;
 const storage={
  async delete(keys:string|string[]){
   deleteCalls++;
   if(fail)throw Error("R2 temporarily unavailable");
   for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);
  },
  async list({prefix,limit}:{prefix:string;limit:number}){
   const keys=[...objects].filter(k=>k.startsWith(prefix)).sort().slice(0,limit);
   return {objects:keys.map(key=>({key})),truncated:false};
  }
 };
 return {objects,storage:storage as unknown as Parameters<typeof deleteCoupleRoom>[1],calls:()=>deleteCalls};
}
function rowCount(sqlite:DatabaseSync,table:string,where:string,...args:string[]){
 return Number((sqlite.prepare("SELECT COUNT(*) AS n FROM "+table+" WHERE "+where).get(...args) as {n:number}).n);
}

test("real SQLite transaction deletes every feature and private R2 key for one couple only",async()=>{
 const local=localD1();seed(local);
 const privateStore=privateBucket();
 const result=await deleteCoupleRoom(local.db,privateStore.storage,"room-A");
 assert.equal(result.deleted,true);
 assert.ok(result.objectsDeleted>=225,"222 media and private photos deleted");
 assert.ok(privateStore.calls()>3,"Large history is processed in bounded pages");
 for(const table of ROOM_DATA_TABLES){
  assert.equal(rowCount(local.sqlite,table,"room_id=?","room-A"),0,table+" must be cleared");
  assert.equal(rowCount(local.sqlite,table,"room_id=?","room-B"),1,table+" must not cross couples");
 }
 for(const table of MEMBER_DATA_TABLES){
  assert.equal(rowCount(local.sqlite,table,"member_id IN ('a1','a2')"),0,table+" cleared");
  assert.equal(rowCount(local.sqlite,table,"member_id='b1'"),1,table+" preserved");
 }
 assert.equal(rowCount(local.sqlite,"couple_reconciliation_entries","member_id IN ('a1','a2')"),0);
 assert.equal(rowCount(local.sqlite,"couple_reconciliation_entries","member_id='b1'"),1);
 assert.equal(rowCount(local.sqlite,"abuse_counters","actor LIKE 'member:a%'"),0);
 assert.equal(rowCount(local.sqlite,"abuse_counters","actor='member:b1'"),1);
 assert.equal(rowCount(local.sqlite,"abuse_counters","actor='ip:unrelated'"),1);
 assert.equal(rowCount(local.sqlite,"rooms","id='room-A'"),0);
 assert.equal(rowCount(local.sqlite,"rooms","id='room-B'"),1);
 assert.equal(rowCount(local.sqlite,"members","room_id='room-A'"),0);
 assert.equal(rowCount(local.sqlite,"members","room_id='room-B'"),1);
 assert.ok(![...privateStore.objects].some(k=>k.endsWith("-A")||k.includes("/room-A/")));
 assert.ok(privateStore.objects.has("private-B"));
 assert.ok(privateStore.objects.has("profile/room-B/b1/photo"));
 local.sqlite.close();
});

test("optional feature tables may not exist for earlier couples",async()=>{
 const local=localD1();seed(local,false);
 const result=await deleteCoupleRoom(local.db,undefined,"room-A");
 assert.equal(result.deleted,true);
 assert.equal(rowCount(local.sqlite,"members","room_id='room-A'"),0);
 assert.equal(rowCount(local.sqlite,"rooms","id='room-B'"),1);
 local.sqlite.close();
});

test("R2 failure never revokes the user's session or erases D1 history",async()=>{
 const local=localD1();seed(local);
 const failing=privateBucket(true);
 await assert.rejects(deleteCoupleRoom(local.db,failing.storage,"room-A"),/R2 temporarily unavailable/);
 assert.equal(rowCount(local.sqlite,"rooms","id='room-A'"),1);
 assert.equal(rowCount(local.sqlite,"members","room_id='room-A'"),2);
 assert.equal(rowCount(local.sqlite,"messages","room_id='room-A'"),222);
 local.sqlite.close();
});

test("D1 batch failure rolls back all feature and account deletions",async()=>{
 const local=localD1();seed(local);
 local.sqlite.exec("CREATE TRIGGER refuse_delete BEFORE DELETE ON rps_games WHEN OLD.room_id='room-A' BEGIN SELECT RAISE(ABORT,'simulated D1 failure'); END;");
 const storage=privateBucket();
 await assert.rejects(deleteCoupleRoom(local.db,storage.storage,"room-A"),/simulated D1 failure/);
 assert.equal(rowCount(local.sqlite,"rooms","id='room-A'"),1);
 assert.equal(rowCount(local.sqlite,"members","room_id='room-A'"),2);
 assert.equal(rowCount(local.sqlite,"rps_games","room_id='room-A'"),1);
 assert.equal(rowCount(local.sqlite,"couple_reconciliations","room_id='room-A'"),1);
 assert.equal(rowCount(local.sqlite,"couple_reconciliation_entries","member_id='a1'"),1);
 local.sqlite.close();
});

test("new private database tables must always be added to room deletion inventory",()=>{
 const handled=new Set<string>([
  ...ROOM_DATA_TABLES,...MEMBER_DATA_TABLES,
  "rooms","members","abuse_salt","abuse_counters","couple_reconciliation_entries"
 ]);
 for(const filename of readdirSync("functions/api")){
  if(!filename.endsWith(".ts"))continue;
  const source=readFileSync("functions/api/"+filename,"utf8");
  for(const match of source.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z_0-9]*)/g)){
   assert.ok(handled.has(match[1]),filename+" creates an untracked private table "+match[1]);
  }
 }
 const source=readFileSync("functions/api/love.ts","utf8");
 assert.ok(source.includes("deleteCoupleRoom(db,bindings().STORAGE,u.room_id)"));
 const statements=buildRoomDeletionBatch(localD1().db,"room-A",new Set(["members","rooms","couple_reconciliations","couple_reconciliation_entries"]));
 assert.ok(statements.length>=4);
});
