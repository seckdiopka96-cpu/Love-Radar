import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const app=readFileSync("src/App.tsx","utf8");
const host=readFileSync("src/LudoSoloEmbedded.tsx","utf8");
const css=readFileSync("src/ludo-solo-embedded.css","utf8");
const page=readFileSync("public/ludo-solo/index.html","utf8");
const gameCSS=readFileSync("public/ludo-solo/style.css","utf8");
const js=readFileSync("public/ludo-solo/script.js","utf8");
const headers=readFileSync("public/_headers","utf8");
const sw=readFileSync("public/sw.js","utf8");

test("Jeux > Ludo contre l'ordinateur opens the new complete HTML/CSS/JS game inside Love Radar",()=>{
 assert.ok(app.includes('import LudoSoloEmbedded from "./LudoSoloEmbedded";'));
 assert.ok(app.includes('tab==="ludo-solo"?<LudoSoloEmbedded scope={room.roomId+":"+room.user.id} onExit={()=>navigate("ludo-room")}/>:null'));
 assert.ok(!app.includes('tab==="ludo-solo"?<SoloLudo '),"old game no longer opens through this route");
 assert.ok(host.includes('src="/ludo-solo/index.html?scope="')||host.includes('const src="/ludo-solo/index.html?scope="'));
 assert.ok(host.includes('src={src}'));
 assert.ok(host.includes('onClick={onExit}'));
 assert.ok(host.includes('loading="eager"'));
 assert.ok(css.includes('height:100%!important'));
 assert.ok(css.includes('env(safe-area-inset-top)'));
});
test("complete standalone game is bundled as three first-party static files",()=>{
 assert.ok(page.startsWith("<!doctype html>"));
 assert.ok(page.includes('href="./style.css?v=ludo-room-20261118-v22"'));
 assert.ok(page.includes('src="./script.js?v=ludo-room-20261118-v22" defer'));
 assert.ok(page.includes('id="couleur-blue"'));
 assert.ok(page.includes('id="couleur-red"'));
 assert.ok(page.includes('id="couleur-green"'));
 assert.ok(page.includes('id="couleur-yellow"'));
 assert.ok(page.includes('id="roll-dice"'));
 assert.ok(page.includes('id="ludo-board"'));
 assert.ok(page.includes('id="pieces-layer"'));
 assert.ok(page.includes('id="win-dialog"'));
 assert.ok(gameCSS.length>20000);
 assert.ok(js.length>20000);
 assert.ok(!page.includes('<script>'),"game logic is a separate JavaScript file");
});
test("real classic rules, computer opponent and scoped save stay available",()=>{
 for(const text of ["function getRoll","function rollDie","function movePiece","function validMoves","function makeGame","function maybeComputer","function startNewGame"]){
  assert.ok(js.includes(text),text);
 }
 assert.ok(js.includes('const FINAL = 56'));
 assert.ok(js.includes('TRACK.length !== 52'));
 assert.ok(js.includes('const SCOPE = (new URLSearchParams(window.location.search).get("scope")'));
 assert.ok(js.includes('"love-radar-ludo-solo-v2:"+SCOPE'));
 assert.ok(js.includes('localStorage.setItem(SAVE_KEY'));
 assert.ok(js.includes('function save'));
 assert.ok(js.includes('CPU_COLOR'));
 assert.ok(!js.includes('document.cookie'),"game never accesses authentication cookies");
});

test("Solo always places the two players in opposing physical camps",()=>{
 const cpuDecl=js.match(/^\s*const CPU_COLOR = Object.freeze\((\{[^\n]+\})\);/m);
 const spawnsDecl=js.match(/^\s*const SPAWNS = Object.freeze\((\{[^\n]+\})\);/m);
 assert.ok(cpuDecl&&spawnsDecl,"solo needs one authoritative color and spawn mapping");
 const cpu=runInNewContext("("+cpuDecl[1]+")") as Record<string,string>;
 const spawn=runInNewContext("("+spawnsDecl[1]+")") as Record<string,number>;
 assert.deepEqual(JSON.parse(JSON.stringify(cpu)),{
  blue:"green",red:"yellow",green:"blue",yellow:"red"
 });
 for(const [player,opponent] of Object.entries(cpu)){
  assert.notEqual(player,opponent);
  assert.equal((spawn[opponent]-spawn[player]+52)%52,26,
   player+" vs "+opponent+" should begin 26 squares apart");
 }
 assert.ok(js.includes('cpuColor:CPU_COLOR[playerColor]'),"actual game uses the opposing CPU camp");
 assert.ok(js.includes('app.dataset.computer=game.cpuColor'),"the board uses the same opponent color");
});

test("old saved Solo games migrate from adjacent computer camps without resetting pawns",()=>{
 const decl=name=>{
  const found=js.match(new RegExp("^\\s*const "+name+" = Object\\.freeze\\(\\{[^\\n]+\\}\\);","m"));
  assert.ok(found,name+" declaration missing");
  return found[0];
 };
 const validation=js.slice(js.indexOf("  function gameIsValid(value) {"),js.indexOf("  function persist() {"));
 const restore=js.slice(js.indexOf("  function savedGame() {"),js.indexOf("  function clearTimers() {"));
 assert.ok(validation.includes("value.cpuColor===CPU_COLOR[value.playerColor]"));
 assert.ok(restore.includes("LEGACY_CPU_COLOR"),"saved legacy games need a migration");
 for(const [player,previousCpu,newCpu] of [["green","yellow","blue"],["red","blue","yellow"]] as const){
  const original={
   playerColor:player,cpuColor:previousCpu,
   pieces:{human:[18,-1,-1,-1],cpu:[25,-1,-1,-1]},
   turn:"cpu",phase:"roll",die:null,lastRoll:3,
   streak:{human:0,cpu:0},result:null,message:"Partie en cours",turnCount:5
  };
  let stored=JSON.stringify(original);
  const context={
   localStorage:{getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value}},
   result:null as unknown
  };
  const code=[
   decl("CPU_COLOR"),decl("LEGACY_CPU_COLOR"),
   'const SIDES=["human","cpu"]; const FINAL=56; const SAVE_KEY="test";',
   'const validColor = value => Object.hasOwn(CPU_COLOR,value);',
   validation,restore,'result=savedGame();'
  ].join("\n");
  runInNewContext(code,context);
  const migrated=context.result as typeof original;
  assert.equal(migrated.cpuColor,newCpu);
  assert.equal(JSON.parse(stored).cpuColor,newCpu,"saved data should be migrated once");
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.pieces)),original.pieces);
  assert.equal(migrated.turn,original.turn);
 }
});

test("CSP permits only same-origin embedded games and the service worker cannot replace the app with Ludo",()=>{
 assert.ok(headers.includes("frame-src 'self'"));
 assert.ok(headers.includes("frame-ancestors 'self'"));
 assert.ok(!headers.includes("frame-ancestors *"));
 assert.ok(sw.includes('"/ludo-solo/index.html"'));
 assert.ok(sw.includes('"/ludo-solo/style.css"'));
 assert.ok(sw.includes('"/ludo-solo/script.js"'));
 assert.ok(sw.includes('url.pathname.startsWith("/ludo-solo/")'));
 assert.ok(sw.includes('url.pathname.startsWith("/ludo-duo/")'));
 assert.ok(sw.includes('if(url.pathname!=="/"&&url.pathname!=="/index.html")return'));
 assert.ok(sw.includes('if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return'));
});
