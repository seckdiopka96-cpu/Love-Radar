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
 assert.equal((room.match(/<SingleLudoBoard\/>/g)||[]).length,1,"only one board is displayed at the entrance");
 assert.ok(room.includes('className="lr-ludo-room-mode-grid lr-ludo-room-unified-options"'));
 assert.ok(room.includes('Choisis ton <em>mode.</em>'));
 assert.ok(!room.includes('lr-ludo-room-mode-emblem'),"no repeated mini-board per card");
 for(const mode of ["Classique · Duo","Sénégal · Duo","Classique · Solo","Sénégal · Solo"])
  assert.ok(room.includes(mode),"one simple option per rule/opponent combination");
 const unified=read("public/ludo-unified-stage.css");
 assert.ok(unified.includes(".lr-unified-ludo-frame")&&unified.includes(".lr-unified-ludo-board"),
  "all four games share board framing and visual tokens");
 assert.ok(unified.includes(".lr-ludo-base.is-current-turn"),"the shared house glows on the active turn");
 assert.ok(unified.includes(".ludo-pawn.is-own-turn"),"Sénégal current player's pins are outlined");
 assert.ok(read("index.html").includes("/ludo-unified-stage.css"),"Sénégal app shares the same stylesheet");
 assert.ok(soloHTML.includes("/ludo-unified-stage.css")&&duoHTML.includes("/ludo-unified-stage.css"),
  "Solo and Duo classic share the same stylesheet");
 assert.ok(read("src/SenegalLudo.tsx").includes('<LudoDuoFrame variant="senegal"'),
  "Senegal mode renders the real Classic frame instead of duplicating the board");

});

test("classic Duo loads the newest shared board, never a cached legacy iframe",()=>{
 const duoVersion="ludo-room-20261119-v29";
 const soloVersion="ludo-room-20261119-v25";
 assert.ok(duoFrame.includes('/ludo-duo/index.html?v='+duoVersion));
 assert.ok(soloFrame.includes('&v='+soloVersion));
 assert.ok(duoHTML.includes('../ludo-solo/style.css?v='+duoVersion));
 assert.ok(duoHTML.includes('./script.js?v='+duoVersion));
 assert.ok(soloHTML.includes('./style.css?v='+soloVersion));
 assert.ok(soloHTML.includes("../ludo-effects.css"));
 assert.ok(duoHTML.includes("../ludo-effects.css"));
 assert.ok(!duoCSS.includes(".lr-ludo-duo-ui .app{"),"Duo must not replace the stable Solo stage with a purple skin");
 assert.ok(duoCSS.includes("Same blue background, board border"),"Duo inherits Solo board/frame and rail styles");
 assert.ok(read("public/sw.js").includes('love-radar-static-v151'));
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
 assert.ok(room.includes("<LudoMark compact/>"));
 for(const source of [soloHTML,duoHTML,read("src/Ludo.tsx")])
  assert.ok(source.includes("ludo-mark.svg"));
 assert.ok(soloCSS.includes(".game-screen .piece--moving .piece-svg"));
 assert.ok(soloCSS.includes(".game-screen .board-frame"));
 assert.ok(visual.includes(".ludo-experience .ludo-moving-pawn::before"));
 assert.ok(visual.includes(".ludo-experience .ludo-head-logo"));
 assert.ok(senegalCSS.includes(".ludo-experience.ludo-senegal-solo"));
 assert.ok(senegalCSS.includes(".ludo-experience.ludo-senegal-duo"));
 assert.ok(read("src/SenegalLudo.tsx").includes("<LudoDuoFrame"),"same Classic frame used in Sénégal");
 assert.ok(!duoCSS.includes(".lr-ludo-duo-ui .game-screen{"),"Duo keeps the Solo fixed stage layout");
});


test("Ludo room keeps back button clear of iPhone status bar and centers cards",()=>{
 assert.ok(room.includes('className="lr-ludo-room-back" onClick={onExit}'));
 assert.ok(css.includes('padding:max(66px, calc(env(safe-area-inset-top) + 12px))'),
  "room must reserve a real safe top area even in standalone iPhone mode");
 assert.ok(css.includes('justify-content:safe center'),
  "cards and header should sit at the screen center when space permits");
 assert.ok(css.includes('overflow-y:auto'),
  "short phone screens must scroll rather than clip the return button");
 assert.ok(css.includes('.lr-app.lr-ludo-mode .lr-ludo-room-back'));
 assert.ok(css.includes('min-height:44px'),"return target stays comfortably tappable");
 assert.equal((room.match(/onClick=\{\(\)=>onOpenMode\(mode.id\)\}/g)||[]).length,1,
  "each mode remains directly tappable");
});

test("Sénégal Solo and Duo reuse the exact Classic board, dice and pawn renderer",()=>{
 const senegal=read("src/SenegalLudo.tsx");
 const bridge=read("src/LudoDuoFrame.tsx");
 const renderer=read("public/ludo-duo/script.js");
 assert.ok(senegal.includes('import LudoDuoFrame from "./LudoDuoFrame"'));
 assert.ok(senegal.includes('<LudoDuoFrame variant="senegal" opponent={solo?"solo":"duo"}'));
 assert.ok(!senegal.includes('className="ludo-board lr-unified-ludo-board"'),
  "the old independent Senegal board is no longer rendered");
 assert.ok(!senegal.includes('<LudoDie3D'),"Senegal no longer rolls a separate die component");
 assert.ok(senegal.includes("movesForPawn(game,seat,pawn)"),"Senegal rules remain authoritative");
 assert.ok(senegal.includes("boardPoints={boardPoints} legalPawns={legalPawns}"));
 assert.ok(bridge.includes('variant:props.variant||"classic"'));
 assert.ok(renderer.includes('state.variant==="senegal"?state.boardPoints'));
 assert.ok(renderer.includes('if(state.variant==="senegal")return Array.isArray(state.legalPawns)'));
 assert.ok(renderer.includes("animateRealDieRoll()"),"the one physical Classic die is shared");
 for(const html of [soloHTML,duoHTML]){
  assert.ok(html.includes('class="board lr-unified-ludo-board"'));
  assert.ok(html.includes('../ludo-board-single.css?v=canonical-20261119-v3'));
 }
 assert.ok(read("public/sw.js").includes("love-radar-static-v151"));
});

test("one canonical vector board is literally the same artwork on all four screens and the lobby",()=>{
 const svg=read("public/ludo-board-art.svg");
 const single=read("public/ludo-board-single.css");
 const senegal=read("src/SenegalLudo.tsx");
 const room=read("src/LudoRoom.tsx");
 const sw=read("public/sw.js");
 assert.ok(svg.includes('viewBox="0 0 1500 1500"'),"the one board has a fixed square geometry");
 assert.equal((svg.match(/<rect x="/g)||[]).length,233,"225 cells plus 8 house panels");
 assert.equal((svg.match(/<polygon points="/g)||[]).length,12,"8 safe stars plus 4 center triangles");
 assert.ok(svg.includes("#a91e3e")&&svg.includes("#08734e")&&
  svg.includes("#155593")&&svg.includes("#ad7916"),"one common DARK palette");
 assert.ok(!room.includes("CELL.map"),"lobby no longer renders a separate grid");
 assert.ok(!room.includes("lr-ludo-preview-home"),"lobby no longer renders separate houses");
 assert.ok(room.includes("lr-ludo-unified-board-frame"),"lobby has the same framing as the game");
 assert.ok(single.includes('url("/ludo-board-art.svg?v=canonical-20261119-v3")'),
  "one SVG file is the source of all five boards");
 assert.ok(single.includes(".lr-unified-ludo-board > .lr-ludo-cell"),
  "old tile colors are transparent overlays");
 assert.ok(single.includes(".lr-ludo-base .base-spot"),"clickable pawn spots align with the art");
 assert.ok(single.includes(".lr-shared-center svg"),"legacy centers are hidden");
 assert.ok(senegal.includes('<LudoDuoFrame variant="senegal"'),
  "Sénégal is displayed inside the same iframe that loads the canonical board art");
 for(const file of [soloHTML,duoHTML]){
  assert.ok(file.includes('../ludo-board-single.css?v=canonical-20261119-v3'),
   "both HTML frames load exactly the same CSS/asset");
 }
 assert.ok(read("index.html").includes('/ludo-board-single.css?v=canonical-20261119-v3'));
 assert.ok(sw.includes('"/ludo-board-art.svg"')&&sw.includes('"/ludo-board-single.css"'),
  "offline installations receive the one shared board");
});
