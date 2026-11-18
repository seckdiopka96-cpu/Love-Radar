import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {registerAutoTurn,MAX_AUTO_TURNS} from "../functions/lib/ludo-timeout";

const soloHTML=readFileSync("public/ludo-solo/index.html","utf8");
const duoHTML=readFileSync("public/ludo-duo/index.html","utf8");
const duoCSS=readFileSync("public/ludo-duo/style.css","utf8");
const duoJS=readFileSync("public/ludo-duo/script.js","utf8");
const parent=readFileSync("src/Ludo.tsx","utf8");
const bridge=readFileSync("src/LudoDuoFrame.tsx","utf8");
const backend=readFileSync("functions/api/ludo.ts","utf8");
const headers=readFileSync("public/_headers","utf8");
const sw=readFileSync("public/sw.js","utf8");

test("multiplayer uses the same full board HTML, pions and cube dice as Solo",()=>{
 const start='<div class="board" id="ludo-board"';
 const end='<div id="pieces-layer"';
 const boardSlice=s=>(s.slice(s.indexOf(start),s.indexOf(end))).replace(/^\s+|\s+$/g,"");
 assert.ok(duoHTML.includes(start));
 assert.equal(boardSlice(duoHTML),boardSlice(soloHTML));
 assert.ok(duoHTML.includes('href="../ludo-solo/style.css?v=ludo-room-20261118-v15"'));
 assert.ok(duoHTML.includes('href="./style.css?v=ludo-room-20261118-v15"'));
 assert.ok(duoHTML.includes('src="./script.js?v=ludo-room-20261118-v15" defer'));
 assert.ok(duoHTML.includes('LUDO <span>♥</span> DUO'));
 assert.ok(duoHTML.includes('id="roll-dice"'));
 assert.ok(duoCSS.includes('.duo-side-actions'));
});
test("Duo JavaScript is syntactically valid and only receives authoritative data",()=>{
 assert.doesNotThrow(()=>new Script(duoJS,{filename:"public/ludo-duo/script.js"}));
 for(const word of ['source:"love-radar-ludo-duo"','type:"ready"','type:"action"','e.data.type!=="state"',
  'game.positions[state.mySeat]','g.turn','const legal=legalPawns()',
  'if(progress===57)','if(progress>=51)','return TRACK[(SPAWNS[color]+progress)%52]',
  'window.parent.postMessage','e.origin!==location.origin','e.source!==window.parent']){
  // Exact layout in JS can change without changing the secure contract.
  if(word==="game.positions[state.mySeat]")continue;
  assert.ok(duoJS.includes(word),word);
 }
 assert.ok(!duoJS.includes("localStorage"));
 assert.ok(!duoJS.includes("getRandomValues"));
 assert.ok(!duoJS.includes("Math.random"));
 assert.ok(!duoJS.includes("Authorization"));
});
test("React authenticated Ludo backend is preserved and paints the shared frame",()=>{
 assert.ok(parent.includes('import LudoDuoFrame from "./LudoDuoFrame"'));
 assert.ok(parent.includes('<LudoDuoFrame game={game} palette={palette}'));
 assert.ok(parent.includes('game&&palette?'),"modern Duo is mounted before signatures, under the signing modal");
 assert.ok(parent.includes('ludo-duo-loading'),"a modern loading state replaces legacy preview");
 const frameCSS=readFileSync("src/ludo-duo-frame.css","utf8");
 assert.ok(frameCSS.includes(".ludo-experience.ludo-duo-arena > .ludo-play-area"),"old arena must be hidden");
 assert.ok(frameCSS.includes("display:none!important"),"no legacy board fallback");
 assert.ok(bridge.includes('failed&&!ready'),"broken iframe reports a visible error");
 assert.ok(bridge.includes("setRetry(n=>n+1)"),"broken iframe offers a retry");
 assert.ok(bridge.includes('type:"ping"'),"parent retries initialization");
 assert.ok(duoJS.includes('e.data.type==="ping"'),"child responds to parent initialization ping");
 assert.ok(!bridge.includes('onLoad={()=>setReady(true)}'),"iframe load alone does not confirm game ready");
 assert.ok(duoJS.includes('victoryGiftButton.addEventListener("click",()=>{closeVictory();send("gift")}'),
   "the gift dialog must open without a modal layered over it");
 assert.ok(parent.includes('action:"choose_color"'));
 assert.ok(parent.includes('const stamp=game.id+":"+game.version+":"+pawns[0]'));
 assert.ok(parent.includes('},1500)'),"a 1.5-second fallback leaves time to tap a single playable pawn");
 assert.ok(duoJS.includes("const selectable=seat===state.mySeat&&legal.includes(pawn)"),"the only legal pawn is clickable");
 assert.ok(parent.includes('void act("move",pawns[0])'));
 for(const unchanged of ['const onGame=useCallback','async function act(','async function sendReaction(',
 'function duoFrameAction(','signRules()', 'giftAction(','ludo-agreement-backdrop','ludo-gift-dialog','ludo-modal-backdrop']){
  assert.ok(parent.includes(unchanged),unchanged);
 }
 assert.ok(bridge.includes('src="/ludo-duo/index.html?v=ludo-room-20261118-v15"'));
 assert.ok(bridge.includes('event.source!==frame'));
 assert.ok(bridge.includes('event.origin!==window.location.origin'));
 assert.ok(!bridge.includes("token:"));
 assert.ok(bridge.includes('myName:props.myName'));
});
test("each of four colors has a distinct opposite and is shared/locked before signing",()=>{
 assert.ok(backend.includes('blue:"green",green:"blue",red:"yellow",yellow:"red"'));
 assert.ok(backend.includes('CREATE TABLE IF NOT EXISTS ludo_palette'));
 assert.ok(backend.includes('async function syncPalette'));
 assert.ok(backend.includes('if(action==="choose_color")'));
 assert.ok(backend.includes('signed?.signed.some(Boolean)'));
 assert.ok(backend.includes('player.seat===0?data.color:OPPOSITE[data.color]'));
 assert.ok(backend.includes('if((await palette(db,g)).chosenBy===null)'));
 assert.ok(backend.includes('palette:paletteValue'),"full responses retain selected colors");
 assert.ok(backend.includes('await syncPalette(db,updated)'));
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(deletion.includes('"ludo_palette"'));
});
test("Duo iframe works offline and uses only a same-origin parent, never replacing SPA cache",()=>{
 assert.ok(headers.includes("frame-src 'self'"));
 assert.ok(headers.includes("frame-ancestors 'self'"));
 for(const path of ['/ludo-duo/index.html','/ludo-duo/script.js','/ludo-duo/style.css']){
  assert.ok(sw.includes('"'+path+'"'),path);
 }
 assert.ok(sw.includes('url.pathname.startsWith("/ludo-duo/")'));
 assert.ok(sw.includes("love-radar-static-v142"),"new PWA release must invalidate old shell");
});


test("Ludo Duo joins are announced, stay live and resync from D1",()=>{
 const push=readFileSync("functions/lib/push.ts","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const presenceCSS=readFileSync("src/ludo-duo-color.css","utf8");
 const schema=readFileSync("schema.sql","utf8");
 const cleanup=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.ok(backend.includes("CREATE TABLE IF NOT EXISTS ludo_presence"),"backend creates presence table");
 assert.ok(backend.includes('if(action==="presence")'),"join and leave are authenticated actions");
 assert.ok(backend.includes('mode==="leave"'),"leaving clears only this device's row");
 assert.ok(backend.includes("AND session_id=?"),"late exits cannot clear new joins");
 assert.ok(backend.includes('kind:"ludo-joined",id:g.game_id'),"offline partner receives game deep link");
 assert.ok(backend.includes("!live[1-player.seat].online"),"avoid unnecessary push while partner is watching");
 assert.ok(backend.includes("presence:presenceValue"),"full snapshots include both players' statuses");
 assert.ok(backend.includes("last_seen>=recent"),"stale presence expires");
 assert.ok(backend.includes("previous.session_id===sessionId"),"rejoining through a new iPhone session is a new arrival");
 assert.ok(backend.includes("ludo_presence.session_id<>excluded.session_id"),"new join refreshes the join timestamp");
 assert.ok(parent.includes("previousPartnerJoin.current"),"in-game partner receives a fresh join indicator");
 assert.ok(parent.includes('body:JSON.stringify({action:"presence",mode,gameId,sessionId})'));
 assert.ok(parent.includes("window.setInterval(ping,7000)"),"heartbeat survives live play");
 assert.ok(parent.includes('void send("leave")'),"exit clears presence without forfeiting");
 assert.ok(parent.includes("Date.now()-lastFullRefresh.current<3200"),"full snapshots still arrive during active matches");
 assert.ok(parent.includes("presence[1-mySeat]?.online"),"both players see who actually joined");
 assert.ok(presenceCSS.includes(".ludo-presence-status"));
 assert.ok(push.includes('"ludo-joined"'));
 assert.ok(app.includes('notice.endsWith(":ludo-joined")'));
 assert.ok(app.includes('challengeId={noticeTarget?.kind==="ludo-challenge"||noticeTarget?.kind==="ludo-joined"?'));
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS ludo_presence"));
 assert.ok(cleanup.includes('"ludo_presence"'));
});
test("Duo iPhone frame keeps event subscription stable as snapshots tick",()=>{
 assert.ok(bridge.includes("const actionRef=useRef(props.onAction)"));
 assert.ok(bridge.includes("actionRef.current(data.action)"));
 assert.ok(bridge.includes("sendRef.current()"));
 assert.ok(bridge.includes("readyRef.current?.()"),"frame confirms real render readiness");
 assert.ok(parent.includes("frameReady&&!loading"),"Ludo tap waits for frame handshake");
 assert.ok(bridge.includes('if(data.type!=="action")return'));
 assert.ok(duoJS.includes("state.overlayOpen"),"the game still protects the agreement and modal");
 assert.ok(duoJS.includes("state.busy||state.rolling||state.overlayOpen"),"no moves behind a modal");
 assert.ok(!duoJS.includes("state.busy||state.rolling||state.animationBusy||state.overlayOpen"),
  "an animated pawn must not freeze the next turn");
});

test("Ludo invitations appear in app without push; pawn motion follows server time",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 assert.ok(backend.includes('searchParams.get("inbox")==="1"'),"lightweight authenticated in-app inbox");
 assert.ok(backend.includes('pending?.fromSeat===other'),"invitation is for the other player");
 assert.ok(backend.includes('live[other].online'),"arrival tracks real partner presence");
 assert.ok(app.includes('apiFetch("/api/ludo?inbox=1"'),"notification works with push disabled");
 assert.ok(app.includes('window.setInterval(()=>{void poll()},2800)'),"screen checks for new invites");
 assert.ok(app.includes('setNotice("lr-partner-push:"+incoming.kind)'),"one-tap invitation is visible");
 assert.ok(parent.includes('serverClockOffset.current-event.at'),"server timeline aligns both phones");
 assert.ok(parent.includes('const completedSteps=route.filter'),"slow devices skip old hop steps");
 assert.ok(parent.includes('Math.max(0,finish-elapsed)'),"pawn reaches square at aligned time");
});

test("two signed partners converge to the same started game even on slow iPhones",()=>{
 assert.ok(backend.includes("r?.signed_0_at!=null&&r.signed_1_at!=null&&r.started_at==null"),
  "server heals missed concurrent two-signature transition");
 assert.ok(backend.includes("AND signed_0_at IS NOT NULL AND signed_1_at IS NOT NULL"),
  "server may only start a match with both signatures");
 assert.ok(backend.includes('data.gameId!==g.game_id'),
  "a delayed phone may not sign the wrong match");
 assert.ok(parent.includes('gameId:game.id,acceptRules:true'),
  "signature is tied to the currently visible game");
 assert.ok(parent.includes('const agreementEpoch=useRef(0)'),
  "signatures invalidate in-flight old responses");
 assert.ok(parent.includes('epoch!==agreementEpoch.current||requestId<syncApplied.current'),
  "older polls cannot reopen the waiting screen");
 assert.ok(parent.includes('activeDuoGame.current=Boolean(received?.startedAt)'),
  "signing immediately updates the local game phase");
 assert.ok(parent.includes('const acceptAgreement=useCallback'),"keep signatures monotonic per game");
 assert.ok(parent.includes('startedAt:next.startedAt??old.startedAt'),"stale GET never hides a started match");
 assert.ok(parent.includes('data.game?.id||null'),"restarting a new game safely clears the previous signature");
 assert.ok(parent.includes('void load(true)'),"signing forces authoritative refresh");
 assert.ok(parent.includes('window.addEventListener("focus",visible)'),"iOS resume reloads agreements");
 assert.ok(parent.includes('↻ Vérifier maintenant'),"a visible recovery action exists if the network stalls");
});
test("real Duo base pawn sends one move after a playable six",()=>{
 const begin=duoJS.indexOf(" function legalPawns(){");
 const end=duoJS.indexOf(" /** Keep captured pins",begin);
 assert.ok(begin>=0&&end>begin,"extract actual runtime legalPawns and createPawn");
 const logic=duoJS.slice(begin,end);
 const execute=(turn:number,dice:number|null,overlayOpen=false,busy=false,rolling=false)=>{
  const setup=`
   const clicks=[];
   const fakeNode=()=>({
    dataset:{},disabled:false,className:"",title:"",
    handlers:{},classList:{add(){},remove(){}},
    setAttribute(){},append(){},
    addEventListener(type,handler){this.handlers[type]=handler},
    click(){this.handlers.click?.()}
   });
   const document={createElement:()=>fakeNode(),createElementNS:()=>fakeNode()};
   const label=()=> "Toi";
   const send=(action,pawn)=>clicks.push([action,pawn]);
   const state={mySeat:0,game:{status:"playing",turn:${turn},dice:${dice===null?"null":dice},
    positions:[[-1,-1,-1,-1],[-1,-1,-1,-1]]},busy:${busy},rolling:${rolling},overlayOpen:${overlayOpen}};
   ${logic}
   const legal=legalPawns();
   const pawn=createPawn("red",0,0,legal.includes(0));
   const initiallyEnabled=!pawn.disabled;
   pawn.click();pawn.click();
   ({legal,initiallyEnabled,clicks});
  `;
  return new Script(setup).runInNewContext();
 };
 const six=execute(0,6);
 assert.deepEqual(Array.from(six.legal),[0,1,2,3],"every base pawn is legal after a six");
 assert.equal(six.initiallyEnabled,true,"pin can be tapped on the board");
 assert.deepEqual(Array.from(six.clicks,values=>Array.from(values)),[["move",0]],"one server-authoritative move, never double");
 const single=execute(0,5);
 assert.deepEqual(Array.from(single.legal),[],"no base pawn moves without six");
 for(const blocked of [execute(1,6),execute(0,6,true),execute(0,6,false,true),execute(0,6,false,false,true)])
  assert.equal(blocked.initiallyEnabled,false,"opponent turn or modal/pending roll must not allow a move");
});
test("live Duo synchronizes promptly with conditional server reads",()=>{
 assert.ok(parent.includes('activeDuoGame=useRef(false)'),"avoid fast path until both signed");
 assert.ok(parent.includes('"/api/ludo?since="+previous.version'),"send the last synchronized version");
 assert.ok(parent.includes('if(data.unchanged)'),"avoid repainting unchanged game");
 assert.ok(parent.includes('current?.turn!==mySeat?250:650'),"poll the partner every 250ms after request completion");
 assert.ok(parent.includes('current?.status==="won"?1800'),"back off database polling on the victory screen");
 assert.ok(parent.includes('!activeDuoGame.current?700'),"avoid expensive full pre-game polling");
 assert.ok(parent.includes('inFlight=true'),"never stack network checks");
 assert.ok(!parent.includes('setInterval(()=>{if(document.visibilityState==="visible")void load()},1600)'),"remove 1.6s polling delay");
 assert.ok(parent.includes('Math.max(0,170-(Date.now()-actionStarted))'),"finish dice animation sooner");
 assert.ok(duoJS.includes('if(receivedState&&last.seat!==state.mySeat&&!state.rolling)animateRealDieRoll()'),"partner's dice has a physical, synchronized toss");
 const server=backend;
 assert.ok(server.includes('if(method==="GET"&&g?.status==="playing")'),"fast path only for active game");
 assert.ok(server.includes('params.get("game")===g.game_id'),"refuse stale game ids");
 assert.ok(server.includes('Number(since)===g.version'),"compare authoritative versions");
 assert.ok(server.includes('Math.max(g.updated_at,activeAgreement.startedAt)+TURN_MS'),"do not skip turn deadline");
 assert.ok(server.includes('unchanged:true'),"send small unchanged response");
 assert.ok(server.includes("delta:true"),"return small authoritative turn change snapshots");
 assert.ok(parent.includes("if(data.delta)"),"handle gameplay deltas without resetting agreement or palette");
 assert.ok(server.includes('const [moveEvent,lastRoll]=await Promise.all(['),"fetch motion and die state together");
 assert.ok(server.includes('updated.status==="playing"&&(action==="roll"||action==="move")'),"do not delay real rolls with secondary metadata");
 assert.ok(server.includes('if(updated&&action==="restart")'),"do not bootstrap tables on every roll");
 assert.ok(server.includes("if(!signed.startedAt)"),"read-only signed games skip redundant pre-action upserts");
 assert.ok(server.includes('const [members,existingGame]=await Promise.all(['),"parallelize independent room and game reads");
 assert.ok(server.includes("rollAndChallenge"),"cap simultaneous D1 read connections");

 assert.ok(server.includes('at:row.at'),"dice results keep unique timestamp");
});

test("both players show the real app profile photos throughout Ludo Duo",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const css=readFileSync("public/ludo-duo/style.css","utf8");
 const hook=readFileSync("src/use-profile-avatars.ts","utf8");
 assert.ok(app.includes("myAvatar={avatars.mine} partnerAvatar={avatars.partner}"),
  "use the authenticated private profile pictures already loaded in the parent app");
 assert.ok(parent.includes("myAvatar={myAvatar} partnerAvatar={partnerAvatar}"),
  "Duo forwards both photos to the modern board");
 assert.ok(bridge.includes('myAvatar:props.myAvatar||""'));
 assert.ok(bridge.includes('partnerAvatar:props.partnerAvatar||""'));
 assert.ok(bridge.includes("props.myAvatar,props.partnerAvatar"),
  "photo changes are sent to the open board without leaving the game");
 assert.ok(duoHTML.includes('class="duo-profile-photo" alt="" hidden'),
  "both player slots need a photo and a safe fallback");
 assert.equal((duoHTML.match(/class="duo-profile-photo" alt="" hidden/g)||[]).length,2);
 assert.ok(duoJS.includes('renderProfilePhoto(".player--human",state.myAvatar)'));
 assert.ok(duoJS.includes('renderProfilePhoto(".player--cpu",state.partnerAvatar)'));
 assert.ok(duoJS.includes('src.startsWith("blob:")'),
  "private authenticated object URLs must work in HTTPS and native iOS WebView");
 assert.ok(duoJS.includes('picture.dataset.photoUrl===next'),
  "periodic multiplayer refresh must not reload the avatar on each poll");
 assert.ok(duoJS.includes("picture.onload="));
 assert.ok(duoJS.includes("picture.onerror="),"broken or removed photos show their original placeholders");
 assert.ok(css.includes(".avatar.has-photo .avatar-fallback"));
 assert.ok(css.includes("object-fit:cover"));
 assert.ok(hook.includes('URL.createObjectURL(blob)'),
  "do not fetch private media again or expose authentication tokens in the iframe");
 assert.ok(!duoJS.includes("Authorization"));
});

test("three automatic turns cause a loss for that player, regardless of bonus throws",()=>{
 assert.equal(MAX_AUTO_TURNS,3);
 let count:[number,number]=[0,0];
 for(const expected of [1,2]){
  const result=registerAutoTurn(count,0);
  count=result.counts;
  assert.deepEqual(count,[expected,0],"each takeover must be counted exactly once");
  assert.equal(result.forfeit,false);
 }
 const last=registerAutoTurn(count,0);
 assert.deepEqual(last.counts,[3,0]);
 assert.equal(last.forfeit,true,"third missed turn forfeits to the active partner");
 assert.deepEqual(registerAutoTurn([0,2],1),{counts:[0,3],forfeit:true},
  "both seats have independent penalties");
 assert.equal(registerAutoTurn([0,0],0).forfeit,false,
  "new matches start without penalties");
 assert.throws(()=>registerAutoTurn([0,0],2),/Invalid Ludo player seat/);
});

test("Duo persists inactivity penalties in D1 and resets them for a new match",()=>{
 const schema=readFileSync("schema.sql","utf8");
 assert.ok(backend.includes("ALTER TABLE ludo_games ADD COLUMN auto_counts"),
  "existing couples must be migrated without deleting games");
 assert.ok(backend.includes("PRAGMA table_info(ludo_games)"),"migration checks the real database");
 assert.ok(schema.includes("auto_counts TEXT NOT NULL DEFAULT '[0,0]'"));
 assert.ok(backend.includes("auto_counts TEXT NOT NULL DEFAULT '[0,0]'"),
  "new rooms must have a zeroed penalty column");
 assert.ok(backend.includes("JSON.stringify(g.auto_counts)"),
  "optimistic versioned game save must persist both counters");
 assert.ok(backend.includes("g.auto_counts=missed.counts"),
  "each server timeout increments the acting player only");
 assert.ok(backend.includes("if(missed.forfeit)"));
 assert.ok(backend.includes('g.status="won";g.winner=1-acting'),
  "the opponent wins on the third automatic takeover");
 assert.ok(backend.includes('autoRoll=botTurn(g,name)'),
  "the computer still plays the first two missed turns");
 assert.ok(backend.includes("g.auto_counts=[0,0]"),"restart clears both players' counters");
 assert.ok(backend.includes("autoCounts:g.auto_counts"),
  "both clients receive the same authoritative penalties");
 assert.ok(backend.includes("if(!await save(db,g))return await getGame(db,g.room_id)||g"),
  "concurrent client polls must not double-count the same timeout");
});

test("players can quit from the visible Duo board or abandon immediately",()=>{
 assert.ok(duoHTML.includes('aria-label="Quitter ou abandonner la partie"'));
 assert.ok(duoHTML.includes('‹ Quitter'));
 assert.ok(duoJS.includes('className="duo-quit-match"'));
 assert.ok(duoJS.includes('leaveButton.addEventListener("click",()=>send("exit"))'));
 assert.ok(duoCSS.includes(".duo-side-actions .duo-quit-match"));
 assert.ok(parent.includes('if(action==="exit"||action==="menu"){setMenu(true);return}'));
 assert.ok(parent.includes('act("forfeit").then('));
 assert.ok(backend.includes('if(action==="forfeit")'));
 assert.ok(backend.includes('g.status="won";g.winner=1-player.seat'),
  "voluntary surrender should award the opponent a win immediately");
 assert.ok(parent.includes("après 3 tours joués par l’ordinateur à ta place"),
  "leaving the screen alone must not falsely promise to stop the timer");
 assert.ok(duoJS.includes('g.autoCounts?.[state.mySeat]'),
  "show player-specific 0/3 count on the visible match screen");
 assert.ok(duoJS.includes("un prochain retard te fera perdre"),
  "show a clear warning on the second missed turn");
 assert.ok(duoJS.includes('state.game.lastAction.includes("Défaite automatique")'),
  "winner panel states explicitly that the game ended by inactivity");
});

test("finished Duo has an unblocked escape route and a visible rematch state",()=>{
 assert.ok(duoHTML.includes('id="leave-after-win"'),"result dialog has a Leave button");
 assert.ok(duoHTML.includes("← Quitter le Ludo"));
 assert.ok(duoHTML.includes('id="win-action-status"'),"replay feedback is readable");
 assert.ok(duoJS.includes('send("leave")'),"the iframe can request immediate exit");
 assert.ok(bridge.includes('case "leave"'),"parent accepts the same-origin finished-game exit action");
 assert.ok(parent.includes('if(action==="leave"){if(game?.status==="won")onExit();else setMenu(true);return}'),
  "leaving a finished match does not demand another confirmation");
 assert.ok(duoJS.includes('restartPending=true'),"slow restart is not a silent freeze");
 assert.ok(duoJS.includes('replayButton.disabled=true;colorButton.disabled=true'));
 assert.ok(duoJS.includes('actionStatus.textContent="Préparation de la nouvelle manche…"'));
 assert.ok(duoJS.includes('else if(restartPending&&state.error)'),
  "a failed restart re-enables controls and gives a readable error");
 assert.ok(duoJS.includes('colorButton.addEventListener("click",requestRematch)'),
  "choosing a different color starts the next signing/color screen");
 assert.ok(parent.includes('overlayOpen={menu||giftOpen||rules||mustSign}'),
  "game-over dialog never sits above gift/menu/rules overlays");
 assert.ok(duoJS.includes('!state.overlayOpen'));
 assert.ok(duoCSS.includes(".duo-win-leave"));
 assert.ok(duoCSS.includes(".duo-win-action-status"));
});

test("Solo and Duo share a stable stage, and dice respond in under a half-second",()=>{
 const soloJS=readFileSync("public/ludo-solo/script.js","utf8");
 const soloCSS=readFileSync("public/ludo-solo/style.css","utf8");
 const soloFrame=readFileSync("src/LudoSoloEmbedded.tsx","utf8");
 assert.ok(soloJS.includes("await sleep(reducedMotion?120:330)"),
  "solo dice animation is fast but still reveals the real RNG value");
 assert.ok(parent.includes("Math.max(0,170-(Date.now()-actionStarted))"),
  "Duo never waits 690ms just to stop the local spinning die");
 assert.ok(duoJS.includes("const DIE_TUMBLE_MS=460"),
  "Duo roll must visibly tumble before landing, even on a very fast server response");
 assert.ok(duoJS.includes("if(receivedState&&last.seat!==state.mySeat&&!state.rolling)animateRealDieRoll()"),
  "partner rolls have the same visible physical toss");
 assert.ok(duoJS.includes("Date.now()<dieVisualUntil"),
  "the physical animation does not replace the server's actual result");
 assert.ok(soloCSS.includes("animation:dice-tumble-real .43s"),
  "both dice inherit the same short 3D animation");
 assert.ok(soloCSS.includes(".game-screen .board-area{"),
  "the board remains in a fixed container on both screens");
 assert.ok(!duoCSS.includes(".lr-ludo-duo-ui .app{"),
  "Duo does not overwrite Solo's stable blue theme");
 assert.ok(!duoCSS.includes(".lr-ludo-duo-ui .game-screen{"),
  "Duo does not move or resize the game stage with a different theme");
 assert.ok(soloFrame.includes("ludo-room-20261118-v6"));
 assert.ok(bridge.includes("ludo-room-20261118-v15"));
});

test("one playable pawn exits its base on tap and die gives clear turn feedback",()=>{
 assert.ok(duoJS.includes('const selectable=seat===state.mySeat&&legal.includes(pawn)'),"do not disable the only valid base pawn");
 assert.ok(!duoJS.includes('canChoose=legal.length>1'),"previous Duo selection bug cannot return");
 assert.ok(duoJS.includes('if(selectable)b.addEventListener("click"'),"real home pawn handles tap");
 assert.ok(duoJS.includes('b.disabled=true;b.classList.remove("piece--selectable")'),"rapid repeated taps are guarded");
 assert.ok(duoJS.includes("6 ! Touche un pion de ta base"),"show what to do after a six");
 assert.ok(duoJS.includes("C'est le tour de ton partenaire"),"other player's six cannot control your pin");
 assert.ok(!duoJS.includes('&&!state.animationBusy&&!state.overlayOpen'),"previous motion does not freeze your new turn");
 assert.ok(parent.includes('},1500)'),"autoplay waits long enough for a manual tap");
 assert.ok(parent.includes('STEP_MS=moved?.from===-1?220:240,START_MS=90'),"Duo-only pawn movement is responsive");
 assert.ok(duoCSS.includes('animation-duration:.46s!important'),"Duo die has a quick physical tumble");
});
test("synced Duo never restarts the same animated pawn hop on a clock tick",()=>{
 assert.ok(duoJS.includes("movingPawn.dataset.motionProgress=String(m.from)"));
 assert.ok(duoJS.includes('movingPawn.dataset.motionProgress!==String(m.progress)'));
 assert.ok(duoJS.includes("pawn.dataset.motionProgress=String(m.progress)"));
 assert.ok(duoJS.includes("pawn.dataset.motionProgress!==String(m.progress)"));
 assert.ok(duoJS.includes('if(pawn!==movingPawn||pawn.dataset.motionProgress!==String(m.progress))return'));
 assert.ok(duoJS.includes('roll.disabled=true;'));
 assert.ok(duoJS.includes('dice.classList.add("is-rolling")'));
 assert.ok(duoJS.includes('send("roll")'));
 // No local random result; the server remains the only dice authority.
 assert.ok(!duoJS.includes("Math.random()*6"));
 assert.ok(!duoJS.includes("crypto.getRandomValues"));
 assert.ok(backend.includes("function die(){"));
});

test("Duo draws an active home ring without moving its board",()=>{
 assert.ok(duoJS.includes('const active=g.status==="playing"&&c===colors[g.turn]'),
  "the active cage always matches the server-authoritative current seat");
 assert.ok(duoJS.includes('el.classList.toggle("is-current-turn",active)'));
 assert.ok(duoJS.includes('el.classList.toggle("is-my-turn",active&&g.turn===state.mySeat)'));
 assert.ok(duoCSS.includes(".lr-ludo-duo-ui .board .base.is-current-turn::after"),
  "the active yard has a visible ring");
 assert.ok(duoCSS.includes("pointer-events:none"),
  "the ring must never block a player touching a pawn");
 assert.ok(duoCSS.includes("height:54px!important;min-height:54px!important;max-height:54px!important;"),
  "turn text cannot shift the board vertically");
 assert.ok(duoCSS.includes("transform:none!important;transition:none!important;animation:none!important;"),
  "the board stays rigid while dice and pawns animate");
});
