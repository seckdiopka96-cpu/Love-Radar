import test from "node:test";
import assert from "node:assert/strict";
import {parseYouTubeId,expectedPlaybackSeconds,formatWatchTime,type WatchSnapshot} from "../src/watch-utils";
import {parseTikTokId,isTikTokShortLink,watchTikTokTime,canonicalTikTokVideo,formatTikTokTime,type TikTokSnapshot} from "../src/tiktok-utils";

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


test("Official public TikTok video links and numeric posts are accepted",()=>{
 const id="6718335390845095173";
 const links=[
  "https://www.tiktok.com/@scout2015/video/"+id,
  "https://m.tiktok.com/@scout2015/video/"+id+"?is_from_webapp=1",
  "https://www.tiktok.com/player/v1/"+id,
  "https://www.tiktok.com/video/"+id,
  id,
  "Check this TikTok! https://www.tiktok.com/@scout2015/video/"+id
 ];
 for(const link of links)assert.equal(parseTikTokId(link),id,link);
 assert.equal(canonicalTikTokVideo(id),"https://www.tiktok.com/player/v1/"+id+"?autoplay=0&loop=0&controls=1&description=0&music_info=0");
});
test("TikTok link restrictions prevent fake hosts, insecure URLs and profiles",()=>{
 for(const value of [
  "https://tiktok.com.evil.net/@abc/video/6718335390845095173",
  "https://www.evil.com/@abc/video/6718335390845095173",
  "http://www.tiktok.com/@abc/video/6718335390845095173",
  "https://www.tiktok.com/@abc",
  "https://www.tiktok.com/@abc/video/not-valid",
  "https://www.tiktok.com/@abc/video/6718335390845095173/extra",
  "https://user:pass@www.tiktok.com/@abc/video/6718335390845095173",
  "https://www.tiktok.com:8443/@abc/video/6718335390845095173",
  "ftp://www.tiktok.com/@abc/video/6718335390845095173"
 ])assert.equal(parseTikTokId(value),null,value);
 assert.equal(isTikTokShortLink("https://vm.tiktok.com/ZMqABC12/"),true);
 assert.equal(isTikTokShortLink("See this https://vt.tiktok.com/ZSqABCD12/"),true);
 assert.equal(isTikTokShortLink("https://vm.tiktok.com.evil.net/abc"),false);
 assert.equal(isTikTokShortLink("https://vm.tiktok.com/"),false);
});
test("TikTok co-watch timeline follows shared play and pause",()=>{
 const state:TikTokSnapshot={videoId:"6718335390845095173",playing:true,position:5.5,
  syncedAt:10000,updatedAt:10000,updatedBy:"Test",version:2};
 assert.equal(watchTikTokTime(state,12500),8);
 assert.equal(watchTikTokTime({...state,playing:false},12500),5.5);
 assert.equal(watchTikTokTime({...state,videoId:""},12500),0);
 assert.equal(formatTikTokTime(0),"0:00");
 assert.equal(formatTikTokTime(65),"1:05");
});
