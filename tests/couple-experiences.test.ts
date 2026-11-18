import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {onRequestGet as lifeGet,onRequestPost as lifePost} from "../functions/api/couple-life";
import {onRequestGet as giftGet,onRequestPost as giftPost,onRequestDelete as giftDelete} from "../functions/api/couple-surprises";

type Json={ok:boolean;error?:string;[key:string]:any};
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(readFileSync("schema.sql","utf8"));
 const members=[["a","room-A"],["b","room-A"],["c","room-B"],["d","room-B"]];
 const tokens=members.map((_,i)=>String(i+1).repeat(64));
 for(let i=0;i<members.length;i++){
  const [id,room]=members[i];
  sqlite.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING")
   .run(room,"CODE"+room,room==="room-A"?"a":"c",Date.now());
  sqlite.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) VALUES(?,?,?,?,?,?)")
   .run(id,room,id,i%2,createHash("sha256").update(tokens[i]).digest("hex"),Date.now());
 }
 const prepare=(sql:string)=>({
  bind(...params:any[]){
   const statement=sqlite.prepare(sql);
   return {
    async first(){return (statement.get(...params) as Record<string,any>|undefined)||null},
    async all(){return {results:statement.all(...params)}},
    async run(){const result=statement.run(...params);return {meta:{changes:Number(result.changes)}}}
   };
  }
 });
 const objects=new Map<string,Uint8Array>();
 const env={DB:{prepare,async exec(sql:string){sqlite.exec(sql)}},STORAGE:{
  async put(key:string,buffer:Uint8Array){objects.set(key,buffer)},
  async get(key:string){const item=objects.get(key);return item?{arrayBuffer:async()=>item.slice().buffer}:null},
  async delete(keys:string|string[]){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)}
 }};
 const jobs:Promise<unknown>[]=[];
 const context=(idx:number,method:"GET"|"POST"|"DELETE",url:string,payload?:BodyInit,headers?:Record<string,string>)=>({
  request:new Request("https://love-radar-acd.pages.dev"+url,{
   method,headers:{Authorization:"Bearer "+tokens[idx],...headers},...(payload?{body:payload}:{})
  }),
  env,
  waitUntil(task:Promise<unknown>){jobs.push(task)}
 });
 const postLife=(idx:number,data:object)=>lifePost(context(idx,"POST","/api/couple-life",JSON.stringify(data)) as never);
 const postGift=(idx:number,data:FormData|object)=>giftPost(context(idx,"POST","/api/couple-surprises",data instanceof FormData?data:JSON.stringify(data),data instanceof FormData?{}:{"Content-Type":"application/json"}) as never);
 const getLife=(idx:number)=>lifeGet(context(idx,"GET","/api/couple-life") as never);
 const getGifts=(idx:number)=>giftGet(context(idx,"GET","/api/couple-surprises") as never);
 const media=(idx:number,id:string,kind:string)=>giftGet(context(idx,"GET","/api/couple-surprises?id="+id+"&media="+kind) as never);
 const removeGift=(idx:number,id:string)=>giftDelete(context(idx,"DELETE","/api/couple-surprises?id="+id) as never);
 return {sqlite,objects,context,postLife,postGift,getLife,getGifts,media,removeGift,jobs};
}
async function data(response:Response){return response.json() as Promise<Json>}
function jpeg(){
 return new File([new Uint8Array([255,216,255,...Array.from({length:120},()=>88)])],"memory.jpg",{type:"image/jpeg"});
}
function voice(){
 return new File([new Uint8Array([26,69,223,163,...Array.from({length:110},()=>0)])],"message.webm",{type:"audio/webm"});
}
test("mood check-ins are voluntarily shared by exactly one couple; clearing removes data",async()=>{
 const f=fixture();
 const added=await data(await f.postLife(0,{action:"mood_set",mood:"happy",note:"Tu me manques"}));
 assert.equal(added.ok,true,added.error);
 assert.equal(added.moods.length,1);
 assert.equal(added.moods[0].note,"Tu me manques");
 assert.equal((await data(await f.getLife(1))).moods[0].mood,"happy");
 assert.equal((await data(await f.getLife(2))).moods.length,0,"another couple must never see moods");
 assert.equal((await f.postLife(0,{action:"mood_set",mood:"hacked"})).status,400);
 assert.equal((await data(await f.postLife(0,{action:"mood_clear"}))).moods.length,0);
 f.sqlite.close();
});
test("shared dreams, dated invitation and weekly challenges enforce room membership",async()=>{
 const f=fixture();
 const dream=await data(await f.postLife(0,{action:"dream_add",title:"Voyager à Dakar",detail:"Une escapade à deux"}));
 assert.equal(dream.ok,true,dream.error);
 const dreamId=dream.dreams[0].id;
 assert.equal((await f.postLife(2,{action:"dream_toggle",id:dreamId})).status,404);
 assert.equal((await data(await f.postLife(1,{action:"dream_toggle",id:dreamId}))).dreams[0].doneAt>0,true);
 assert.equal((await data(await f.getLife(2))).dreams.length,0);
 const day=Date.now()+3*86400000;
 const invite=await data(await f.postLife(0,{action:"date_invite",activity:"movie",plannedAt:day}));
 assert.equal(invite.ok,true,invite.error);
 const id=invite.date.id;
 assert.equal(invite.date.acceptedBy,null);
 assert.equal((await f.postLife(0,{action:"date_accept",id})).status,409,"author cannot accept own invitation");
 assert.equal((await f.postLife(2,{action:"date_accept",id})).status,409,"other couple cannot accept");
 const accepted=await data(await f.postLife(1,{action:"date_accept",id}));
 assert.equal(accepted.date.acceptedBy,"b");
 assert.equal((await data(await f.getLife(2))).date,null);
 const week=await data(await f.postLife(0,{action:"challenge_toggle",key:"compliment"}));
 assert.equal(week.completions.length,1);
 assert.equal((await data(await f.getLife(1))).completions[0].key,"compliment");
 assert.equal((await data(await f.getLife(2))).completions.length,0);
 assert.equal((await data(await f.postLife(0,{action:"challenge_toggle",key:"compliment"}))).completions.length,0,"toggle must undo completion");
 f.sqlite.close();
});
test("hugs can be reciprocated once and cannot be sent in rapid succession",async()=>{
 const f=fixture();
 const hug=await data(await f.postLife(0,{action:"hug_send"}));
 assert.equal(hug.ok,true,hug.error);
 const id=hug.hugs[0].id;
 assert.equal((await f.postLife(0,{action:"hug_send"})).status,429);
 assert.equal((await f.postLife(0,{action:"hug_reply",id})).status,403);
 assert.equal((await f.postLife(2,{action:"hug_reply",id})).status,403);
 const reply=await data(await f.postLife(1,{action:"hug_reply",id}));
 assert.equal(reply.hugs[0].replyTo,id);
 assert.equal((await f.postLife(1,{action:"hug_reply",id})).status,429);
 assert.equal((await data(await f.getLife(2))).hugs.length,0);
 f.sqlite.close();
});
test("surprise texts and private files remain hidden until the intended recipient opens the box",async()=>{
 const f=fixture(),form=new FormData();
 form.append("title","La belle surprise");form.append("body","Je pense à toi");
 form.append("image",jpeg());form.append("audio",voice());
 const created=await data(await f.postGift(0,form));
 assert.equal(created.ok,true,created.error);
 assert.equal(created.gifts.length,1);
 const id=created.gifts[0].id;
 assert.equal(f.objects.size,2);
 const before=await data(await f.getGifts(1));
 assert.equal(before.gifts[0].body,null,"recipient must not receive the surprise body before opening");
 assert.equal((await f.media(1,id,"image")).status,403,"recipient cannot prefetch the photo");
 assert.equal((await f.media(2,id,"image")).status,404,"unrelated couple has no access");
 assert.equal((await data(await f.getGifts(2))).gifts.length,0);
 assert.equal((await f.postGift(0,{action:"open",id})).status,403,"sender cannot open as recipient");
 const opened=await data(await f.postGift(1,{action:"open",id}));
 assert.equal(opened.ok,true,opened.error);
 assert.equal(opened.gifts[0].body,"Je pense à toi");
 assert.equal(opened.gifts[0].openedAt>0,true);
 assert.equal((await f.media(1,id,"image")).status,200);
 assert.equal((await f.media(1,id,"audio")).status,200);
 assert.equal((await f.removeGift(1,id)).status,403);
 assert.equal((await f.removeGift(0,id)).status,200);
 assert.equal(f.objects.size,0,"removing the gift must erase both R2 objects");
 f.sqlite.close();
});
test("invalid gift audio never leaves an orphaned image in private object storage",async()=>{
 const f=fixture(),form=new FormData();
 form.append("title","Surprise");form.append("body","Je pense à toi");form.append("image",jpeg());
 form.append("audio",new File([new Uint8Array(Array(120).fill(4))],"bad.webm",{type:"audio/webm"}));
 const response=await f.postGift(0,form);
 assert.equal(response.status,400);
 assert.equal(f.objects.size,0);
 assert.equal((await data(await f.getGifts(0))).gifts.length,0);
 f.sqlite.close();
});
test("six experiences keep current app features, deep-linked notifications and room deletion",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const together=readFileSync("src/Together.tsx","utf8");
 const push=readFileSync("functions/lib/push.ts","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 const ui=readFileSync("src/CoupleExperiences.tsx","utf8");
 assert.match(app,/tab==="life"\?<CoupleExperiences/);
 assert.match(together,/onOpenLife/);
 assert.match(push,/"couple-gift"/);
 assert.match(push,/"life"/);
 assert.match(deletion,/"couple_moods","couple_dreams","couple_hugs","couple_weekly_challenges","couple_date_nights","couple_surprises"/);
 assert.match(deletion,/couple-gifts\//);
 for(const word of ["date","mood","dreams","hugs","challenges","gifts"])assert.ok(ui.includes('key:"'+word+'"'),word);
 for(const existing of ['tab==="chat"','tab==="watch"','tab==="ludo"'])assert.ok(app.includes(existing),"Existing experience "+existing+" must remain");
});
