import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SAFE,TRACK} from "../src/ludo-visuals";

const read=(file:string)=>readFileSync(file,"utf8");
const room=read("src/LudoRoom.tsx");
const app=read("src/App.tsx");
const games=read("src/GamesHub.tsx");
const css=read("src/ludo-room.css");
const visual=read("src/ludo-immersive.css");
const senegalCSS=read("src/ludo-senegal.css");
const duoCSS=read("public/ludo-duo/style.css");
const soloCSS=read("public/ludo-solo/style.css");
const soloHTML=read("public/ludo-solo/index.html");
const duoHTML=read("public/ludo-duo/index.html");
const soloJS=read("public/ludo-solo/script.js");
const duoFrame=read("src/LudoDuoFrame.tsx");
const soloFrame=read("src/LudoSoloEmbedded.tsx");

test("one visible Ludo entrance opens the room with all four games",()=>{
 assert.ok(games.includes('onOpenGame("ludo-room")'));
 assert.equal((games.match(/className="lr-games-choice lr-games-ludo/g)||[]).length,1);
 assert.ok(app.includes('import LudoRoom from "./LudoRoom"'));
 assert.ok(app.includes('tab==="ludo-room"?<LudoRoom'));
 const modes=["ludo-solo","ludo","ludo-senegal-solo","ludo-senegal"];
 for(const mode of modes){
  assert.ok(room.includes('id:"'+mode+'"'),"Room links to "+mode);
  assert.ok(app.includes('tab==="'+mode+'"?'),"App preserves "+mode);
 }
 assert.ok(app.includes('onExit={()=>navigate("ludo-room")}'));
 assert.ok(room.includes('onOpenMode(mode.id)'));
 assert.ok(css.includes(".lr-ludo-room-mode-grid"));
});

test("classic Duo loads the newest shared board, never a cached legacy iframe",()=>{
 const duoVersion="ludo-room-20261117-v9";
 const soloVersion="ludo-room-20261117-v5";
 assert.ok(duoFrame.includes('/ludo-duo/index.html?v='+duoVersion));
 assert.ok(soloFrame.includes('&v='+soloVersion));
 assert.ok(duoHTML.includes('../ludo-solo/style.css?v='+duoVersion));
 assert.ok(duoHTML.includes('./script.js?v='+duoVersion));
 assert.ok(soloHTML.includes('./style.css?v='+soloVersion));
 assert.ok(duoCSS.includes(".lr-ludo-duo-ui .app"));
 assert.ok(duoCSS.includes(".lr-ludo-duo-ui .board-frame"));
 assert.ok(read("public/sw.js").includes('love-radar-static-v116'));
});

test("the eight classic safe cells each have a visible star on both boards",()=>{
 assert.deepEqual([...SAFE],[0,8,13,21,26,34,39,47]);
 assert.equal(new Set([...SAFE].map(i=>TRACK[i].join(","))).size,8);
 const extra=[[9,3],[3,7],[7,13],[13,9]];
 for(const html of [soloHTML,duoHTML]){
  assert.equal((html.match(/<span class="star">★<\/span>/g)||[]).length,8);
  assert.equal((html.match(/cell--entry cell--safe/g)||[]).length,4);
  assert.equal((html.match(/cell--safe cell--refuge/g)||[]).length,4);
  for(const [row,col] of extra)assert.ok(html.includes('--row:'+row+';--col:'+col+'"'),"Missing starred refuge "+row+":"+col);
 }
 assert.ok(soloJS.includes('new Set([0,8,13,21,26,34,39,47].map'));
 assert.ok(read("functions/api/ludo.ts").includes('const SAFE=new Set([0,8,13,21,26,34,39,47])'));
});

test("all modes have a prominent shared Ludo logo, stronger shadows, and distinct skins",()=>{
 assert.ok(read("public/ludo-mark.svg").startsWith("<svg"));
 assert.ok(room.includes("<LudoMark/>"));
 for(const source of [soloHTML,duoHTML,read("src/Ludo.tsx"),read("src/SenegalLudo.tsx")])
  assert.ok(source.includes("ludo-mark.svg"));
 assert.ok(soloCSS.includes(".game-screen .piece--moving .piece-svg"));
 assert.ok(soloCSS.includes(".game-screen .board-frame"));
 assert.ok(visual.includes(".ludo-experience .ludo-moving-pawn::before"));
 assert.ok(visual.includes(".ludo-experience .ludo-head-logo"));
 assert.ok(senegalCSS.includes(".ludo-experience.ludo-senegal-solo"));
 assert.ok(senegalCSS.includes(".ludo-experience.ludo-senegal-duo"));
 assert.ok(duoCSS.includes(".lr-ludo-duo-ui .game-screen"));
});
