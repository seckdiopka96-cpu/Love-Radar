import test from "node:test";
import assert from "node:assert/strict";
import {parseYouTubeId,expectedPlaybackSeconds,formatWatchTime,type WatchSnapshot} from "../src/watch-utils";

const ID="M7lc1UVf-VE";
test("YouTube watch, shorts, live, embed and youtu.be links are accepted",()=>{
 const links=[
  "https://www.youtube.com/watch?v="+ID,
  "https://youtube.com/watch?feature=share&v="+ID+"&t=40",
  "https://m.youtube.com/watch?v="+ID,
  "https://music.youtube.com/watch?v="+ID,
  "https://www.youtube.com/shorts/"+ID,
  "https://youtube.com/live/"+ID,
  "https://www.youtube.com/embed/"+ID,
  "https://youtu.be/"+ID+"?si=test",
  "youtu.be/"+ID,
  ID
 ];
 for(const link of links)assert.equal(parseYouTubeId(link),ID,link);
});
test("strict YouTube allow-list prevents malicious URL domains and bad IDs",()=>{
 const bad=[
  "https://www.youtube.com.evil.com/watch?v="+ID,
  "https://youtu.be.evil.org/"+ID,
  "https://evil.com/watch?v="+ID,
  "https://youtube.com/watch?v=too-short",
  "https://youtube.com/watch?v="+ID+"bad",
  "https://youtu.be/"+ID+"/nested",
  "ftp://youtu.be/"+ID,
  "javascript:alert(1)",
  "https://youtube.com@evil.com/watch?v="+ID,
  "https://youtube.com/watch?v=%3Cscript%3E",
  ""
 ];
 for(const link of bad)assert.equal(parseYouTubeId(link),null,link);
});
test("shared video timestamp yields the current synchronized position",()=>{
 const s:WatchSnapshot={videoId:ID,playing:true,position:26.25,syncedAt:5000,updatedAt:5000,version:2,updatedBy:"A"};
 assert.equal(expectedPlaybackSeconds(s,9000),30.25);
 assert.equal(expectedPlaybackSeconds(s,1000),26.25);
 assert.equal(expectedPlaybackSeconds({...s,playing:false},9000),26.25);
 assert.equal(expectedPlaybackSeconds({...s,videoId:""},9000),0);
 assert.equal(expectedPlaybackSeconds({...s,position:86399},12000),86400);
});
test("human-readable timeline does not overflow time formatting",()=>{
 assert.equal(formatWatchTime(0),"0:00");
 assert.equal(formatWatchTime(69.8),"1:09");
 assert.equal(formatWatchTime(3661),"1:01:01");
 assert.equal(formatWatchTime(-12),"0:00");
});
