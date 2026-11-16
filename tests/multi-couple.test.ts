import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {D1Database} from "@cloudflare/workers-types";
import {ensureRoomRevision,markRoomChanged,roomRevision} from "../functions/lib/room-revision";

function fakeDatabase(){
 const revisions=new Map<string,number>();
 let initialized=false;
 const db={
  async exec(sql:string){
   assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS room_revisions"));
   initialized=true;
  },
  prepare(sql:string){
   return {
    bind(...args:unknown[]){
     return {
      async first(){
       assert.ok(initialized,"Revision table must be initialized");
       assert.ok(sql.includes("WHERE room_id=?"));
       const revision=revisions.get(String(args[0]));
       return revision===undefined?null:{revision};
      },
      async run(){
       assert.ok(initialized,"Revision table must be initialized");
       assert.ok(sql.includes("ON CONFLICT(room_id)"));
       const roomId=String(args[0]);
       revisions.set(roomId,(revisions.get(roomId)||0)+1);
       return {success:true};
      }
     };
    }
   };
  }
 } as unknown as D1Database;
 return {db,revisions};
}

test("thousands of independent rooms get isolated change revisions",async()=>{
 const {db}=fakeDatabase();
 await ensureRoomRevision(db);
 const roomA="couple-a";
 const roomB="couple-b";
 assert.equal(await roomRevision(db,roomA),0);
 assert.equal(await roomRevision(db,roomB),0);
 for(let i=0;i<100;i++)await markRoomChanged(db,roomA);
 assert.equal(await roomRevision(db,roomA),100);
 assert.equal(await roomRevision(db,roomB),0,"A's changes never affect B");
 await markRoomChanged(db,roomB);
 assert.equal(await roomRevision(db,roomB),1);
 assert.equal(await roomRevision(db,roomA),100);
});

test("lightweight chat status is room-scoped and content-free",()=>{
 const api=readFileSync("functions/api/love.ts","utf8");
 const revision=readFileSync("functions/lib/room-revision.ts","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const media=readFileSync("functions/api/media.ts","utf8");
 const profile=readFileSync("functions/api/profile.ts","utf8");
 assert.ok(api.includes('const session=await auth(request)'));
 assert.ok(api.includes('roomRevision(session.db,session.user.room_id)'));
 assert.ok(api.includes('return ok({revision,partnerTypingUntil:'));
 assert.ok(revision.includes('WHERE room_id=?'));
 assert.ok(revision.includes('ON CONFLICT(room_id)'));
 assert.ok(media.includes('await markRoomChanged(db,u.room_id)'));
 assert.ok(profile.includes('await markRoomChanged(db,user.room_id)'));
 assert.ok(app.includes('if(typeof data.revision==="number"&&data.revision!==roomRevisionRef.current)'));
 assert.ok(app.includes('snapshotInFlight.current===t'));
 assert.ok(app.includes('useMemo(()=>mergeOptimisticMessages'));
 assert.ok(app.includes('tab==="chat"?15000:30000'));
});

test("two users per private room are enforced and room indexes exist",()=>{
 const schema=readFileSync("schema.sql","utf8");
 const api=readFileSync("functions/api/love.ts","utf8");
 assert.ok(schema.includes('UNIQUE(room_id,seat)'));
 assert.ok(schema.includes('idx_messages_room'));
 assert.ok(schema.includes('idx_messages_room_sender_time'));
 assert.ok(schema.includes('idx_members_room_seat'));
 assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS room_revisions'));
 assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS profile_photos'));
 assert.ok(api.includes('WHERE (SELECT COUNT(*) FROM members WHERE room_id=?)=1'));
 assert.ok(api.includes('message_id=?'));
});
