import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {onRequestGet,onRequestPost,onRequestDelete} from "../functions/api/keepsakes";

function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec("CREATE TABLE members(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL);");
 const tokens=["a".repeat(64),"b".repeat(64),"c".repeat(64)];
 for(const [idx,id,room] of [["0","a","room-A"],["1","b","room-A"],["2","c","room-B"]]){
  const n=Number(idx);
  sqlite.prepare("INSERT INTO members(id,room_id,name,token_hash) VALUES(?,?,?,?)").run(id,room,id,createHash("sha256").update(tokens[n]).digest("hex"));
 }
 const prepare=(sql:string)=>({
  bind(...args:unknown[]){
   const statement=sqlite.prepare(sql);
   return {
    async run(){const value=statement.run(...args as []);return {meta:{changes:Number(value.changes)}}},
    async first(){return (statement.get(...args as []) as Record<string,unknown>|undefined)||null},
    async all(){return {results:statement.all(...args as [])}}
   };
  }
 });
 const db={prepare,async exec(sql:string){sqlite.exec(sql)}};
 const objects=new Map<string,Uint8Array>();
 const storage={
  async put(key:string,data:Uint8Array){objects.set(key,data)},
  async get(key:string){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.slice().buffer}:null},
  async delete(key:string){objects.delete(key)}
 };
 const env={DB:db,STORAGE:storage};
 const make=(member:number,method:"GET"|"POST"|"DELETE",kind:"album"|"letters",body?:BodyInit,params="")=>{
  const request=new Request("https://love-radar-acd.pages.dev/api/keepsakes?type="+kind+params,{
   method,headers:{Authorization:"Bearer "+tokens[member]},...(body?{body}:{})
  });
  return {request,env,waitUntil:(task:Promise<unknown>)=>{void task}};
 };
 return {sqlite,objects,make};
}
async function json(response:Response){return response.json() as Promise<{ok:boolean;error?:string;items?:Array<Record<string,unknown>>}>}
test("surprise letters stay server-redacted until unlock, and rooms stay isolated",async()=>{
 const fixture1=fixture(),{sqlite,make}=fixture1;
 const future=Date.now()+86400000;
 const created=await onRequestPost(make(0,"POST","letters",JSON.stringify({title:"Notre promesse",body:"Un mot secret pour nous.",unlockAt:future})) as never);
 assert.equal(created.status,200);
 const mine=await json(created);
 assert.equal(mine.items?.length,1);
 assert.equal(mine.items?.[0].body,null,"Locked body must never reach client");
 const id=String(mine.items?.[0].id);
 assert.equal((await json(await onRequestGet(make(1,"GET","letters") as never))).items?.[0].body,null);
 assert.equal((await json(await onRequestGet(make(2,"GET","letters") as never))).items?.length,0,"Other rooms cannot see letters");
 assert.equal((await onRequestDelete(make(1,"DELETE","letters",undefined,"&id="+id) as never)).status,403,"Only the author may remove a letter");
 sqlite.prepare("UPDATE keepsake_letters SET unlock_at=? WHERE id=?").run(Date.now()-1000,id);
 const opened=await json(await onRequestGet(make(1,"GET","letters") as never));
 assert.equal(opened.items?.[0].body,"Un mot secret pour nous.");
 assert.equal((await onRequestDelete(make(0,"DELETE","letters",undefined,"&id="+id) as never)).status,200);
 assert.equal((await json(await onRequestGet(make(1,"GET","letters") as never))).items?.length,0);
 sqlite.close();
});
test("album bytes are authorized, validated and purged",async()=>{
 // A new D1 instance can be used because the table creation is handled
 // independently by the schema setup in real deployments.
 const f=fixture(); const {sqlite,objects,make}=f;
 sqlite.exec("CREATE TABLE keepsake_album(id TEXT PRIMARY KEY,room_id TEXT,author_id TEXT,object_key TEXT,mime TEXT,caption TEXT,created_at INTEGER);CREATE INDEX idx_keepsake_album_room ON keepsake_album(room_id,created_at DESC);CREATE TABLE keepsake_letters(id TEXT PRIMARY KEY,room_id TEXT,author_id TEXT,title TEXT,body TEXT,unlock_at INTEGER,created_at INTEGER);CREATE INDEX idx_keepsake_letters_room ON keepsake_letters(room_id,created_at DESC);");
 const file=new File([new Uint8Array([255,216,255,...Array.from({length:120},()=>8)])],"souvenir.jpg",{type:"image/jpeg"});
 const form=new FormData();form.append("file",file);form.append("caption","Nous deux");
 const created=await json(await onRequestPost(make(0,"POST","album",form) as never));
 assert.equal(created.ok,true,created.error);
 const id=String(created.items?.[0].id);
 assert.equal(objects.size,1);
 assert.equal((await json(await onRequestGet(make(1,"GET","album") as never))).items?.length,1);
 assert.equal((await json(await onRequestGet(make(2,"GET","album") as never))).items?.length,0);
 assert.equal((await onRequestGet(make(2,"GET","album",undefined,"&media=1&id="+id) as never)).status,404);
 const read=await onRequestGet(make(1,"GET","album",undefined,"&media=1&id="+id) as never);
 assert.equal(read.status,200); assert.equal((await read.arrayBuffer()).byteLength,123);
 assert.equal((await onRequestDelete(make(1,"DELETE","album",undefined,"&id="+id) as never)).status,200);
 assert.equal(objects.size,0);
 sqlite.close();
});
test("keepsakes are linked to in-app memories and full room deletion",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.match(app,/SharedKeepsakes/);
 assert.match(deletion,/"keepsake_album","keepsake_letters"/);
 assert.match(deletion,/keepsake-album\/"/);
});
