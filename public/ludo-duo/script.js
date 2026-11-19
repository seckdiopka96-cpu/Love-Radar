/* Love Radar · Ludo Duo, exact classic Solo board and CSS.
 * The parent React component is the authenticated server client; this frame
 * is ONLY a renderer and a source of explicit roll/move button events.
 * No local random die, solo bot, local match engine, credentials or local saves.
 */
(()=>{
 "use strict";
 document.documentElement.classList.add("lr-ludo-duo-ui");
 const COLORS={blue:"Bleu",red:"Rouge",green:"Vert",yellow:"Jaune"};
 const SPAWNS={blue:0,red:13,green:26,yellow:39};
 const FINISH_PROGRESS=56; // Five coloured home squares (51–55), then the centre.
 const TRACK=[
   ...Array.from({length:5},(_,i)=>[13-i,6]),
   ...Array.from({length:6},(_,i)=>[8,5-i]),
   [7,0],[6,0],
   ...Array.from({length:5},(_,i)=>[6,1+i]),
   ...Array.from({length:6},(_,i)=>[5-i,6]),
   [0,7],[0,8],
   ...Array.from({length:5},(_,i)=>[1+i,8]),
   ...Array.from({length:6},(_,i)=>[6,9+i]),
   [7,14],[8,14],
   ...Array.from({length:5},(_,i)=>[8,13-i]),
   ...Array.from({length:6},(_,i)=>[9+i,8]),
   [14,7],[14,6]
 ];
 const LANES={
  blue:[[13,7],[12,7],[11,7],[10,7],[9,7]],
  red:[[7,1],[7,2],[7,3],[7,4],[7,5]],
  green:[[1,7],[2,7],[3,7],[4,7],[5,7]],
  yellow:[[7,13],[7,12],[7,11],[7,10],[7,9]]
 };
 const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
 const app=document.querySelector(".app");
 const screen=document.getElementById("plateau");
 const selection=document.getElementById("choix-couleur");
 const board=document.getElementById("ludo-board");
 const layer=document.getElementById("pieces-layer");
 const dice=document.getElementById("dice-3d");
 const dieResult=document.getElementById("die-result");
 const roll=document.getElementById("roll-dice");
 const feedback=document.getElementById("game-feedback");
 const choices=document.getElementById("pawn-choices");
 const rules=document.getElementById("rules-dialog");
 const victory=document.getElementById("win-dialog");
 const matchButton=document.getElementById("new-game");
 const duoActions=document.createElement("div");
 duoActions.className="duo-side-actions";
 const giftButton=document.createElement("button");
 giftButton.type="button";giftButton.className="duo-gift-button";giftButton.textContent="🎁 Cadeau";
 giftButton.addEventListener("click",()=>send("gift"));
 const leaveButton=document.createElement("button");
 leaveButton.type="button";leaveButton.className="duo-quit-match";
 leaveButton.textContent="↩ Quitter";
 leaveButton.setAttribute("aria-label","Quitter ou abandonner la partie");
 leaveButton.addEventListener("click",()=>send("exit"));
 duoActions.append(giftButton,leaveButton);
 document.querySelector(".game-actions")?.after(duoActions);
 const lastColor=document.getElementById("duo-colors-label");
 let state=null;
 let restartPending=false;
 let lastFinishedGameId="";
 const actionStatus=document.getElementById("win-action-status");
 const replayButton=document.getElementById("play-again");
 const colorButton=document.getElementById("change-color-after-win");
 let lastBoardKey="";
 let lastAnimatedRoll="",receivedState=false;
 let previousSoundGame="",previousSoundPositions=null,soundWinGame="";
 let activeCaptureSounds=new Set(),pendingCaptureSounds=new Set();
 let dieVisualTimer=null,dieVisualUntil=0;
 let lastTossVariant=-1;
 const DIE_TUMBLE_MS=430;
 // The backend alone decides the result. Show a physical 3D tumble even when
 // it answers in less than 170 ms, without holding back legal pawn moves.
 function animateRealDieRoll(){
  window.LudoSfx?.play("roll");
  dieVisualUntil=Date.now()+DIE_TUMBLE_MS;
  if(dieVisualTimer!==null)clearTimeout(dieVisualTimer);
  // Vary the PHYSICAL animation only. Never generate or alter the dice value:
  // the result always comes from the authenticated server's crypto RNG.
  lastTossVariant=(lastTossVariant+1)%3;
  dice.dataset.toss=String(lastTossVariant);
  dice.classList.remove("is-rolling");
  // Restart the CSS 3D toss even after a rapid extra turn following a six.
  void dice.offsetWidth;
  dice.classList.add("is-rolling");
  dieVisualTimer=setTimeout(()=>{
   dieVisualTimer=null;
   if(state)render();
  },DIE_TUMBLE_MS+8);
 }
 // Keep the moving pawn in its own layer. Redrawing its DOM on every square
 // prevents WebKit/iOS from animating the left/top transition.
 const movementLayer=document.createElement("div");
 movementLayer.className="pieces-layer ludo-duo-motion-overlay";
 movementLayer.setAttribute("aria-hidden","true");
 board.append(movementLayer);
 const captureLayer=document.createElement("div");
 captureLayer.className="pieces-layer ludo-duo-capture-overlay";
 captureLayer.setAttribute("aria-hidden","true");
 board.append(captureLayer);
 const capturePins=new Map();
 let movingPawn=null,movingKey="";
 const boardArea=board.closest(".board-area");
 let pinnedBoardSize=0,pinnedViewportWidth=0;
 // iOS can change the visible viewport by a few pixels while focus, toolbar
 // or the timer updates. Measure the reserved arena, not the changing HUD.
 // Only change the board's square dimensions on a real window/orientation resize.
 function pinBoardSize(){
  if(!boardArea)return;
  const width=boardArea.clientWidth,height=boardArea.clientHeight;
  if(width<=0||height<=0)return;
  const size=Math.floor(Math.min(width-8,height-8,660));
  if(size<140)return;
  if(pinnedBoardSize&&Math.abs(size-pinnedBoardSize)<26&&
     Math.abs(width-pinnedViewportWidth)<26)return;
  pinnedBoardSize=size;pinnedViewportWidth=width;
  boardArea.style.setProperty("--lr-duo-board-size",size+"px");
 }
 if(boardArea&&typeof ResizeObserver!=="undefined"){
  const arenaObserver=new ResizeObserver(pinBoardSize);
  arenaObserver.observe(boardArea);
 }
 function getPosition(color,progress,pawn){
  const pt=pointFor(color,progress);
  if(pt)return {x:(pt[1]+.5)/15*100,y:(pt[0]+.5)/15*100};
  const home=document.querySelector(".base--"+color+" .base-spot:nth-child("+(pawn+1)+")");
  const a=home?.getBoundingClientRect(),b=board.getBoundingClientRect();
  if(a&&b.width&&b.height)return {x:(a.left+a.width/2-b.left)/b.width*100,
   y:(a.top+a.height/2-b.top)/b.height*100};
  return {x:50,y:50};
 }
 function drawMotion(){
  const m=state?.motion;
  if(!m){movingPawn=null;movingKey="";movementLayer.replaceChildren();return}
  const id=state.game.id+":"+m.seat+":"+m.pawn+":"+m.from+":"+m.to;
  const c=color(m.seat);
  if(!movingPawn||movingKey!==id){
   movingKey=id;
   movingPawn=createPawn(c,m.seat,m.pawn,false);
   movingPawn.classList.add("piece--board","piece--moving","ludo-duo-moving-pin");
   const progress=document.createElement("b");
   progress.className="piece-step-counter";progress.setAttribute("aria-hidden","true");
   movingPawn.append(progress);
   const from=state.variant==="senegal"&&Array.isArray(m.point)
    ?{x:(m.point[1]+.5)/15*100,y:(m.point[0]+.5)/15*100}
    :getPosition(c,m.from,m.pawn);
   movingPawn.style.left=from.x+"%";movingPawn.style.top=from.y+"%";
   movingPawn.dataset.motionProgress=String(m.from);
   movementLayer.replaceChildren(movingPawn);
  }
  const progress=movingPawn.querySelector(".piece-step-counter");
  if(progress)progress.textContent=(m.index??Math.max(0,m.progress-m.from))+" / "+(m.length??Math.max(1,m.to-m.from));
  // Countdown and polling can send the same pawn location more than once.
  // Replaying that CSS transition causes a jitter that Solo never has.
  if(m.progress!==m.from&&movingPawn.dataset.motionProgress!==String(m.progress)){
   const pawn=movingPawn;
   pawn.dataset.motionProgress=String(m.progress);
   // One audible landing per real square, not on every poll/re-render.
   window.LudoSfx?.play("step");
   const to=state.variant==="senegal"&&Array.isArray(m.point)
    ?{x:(m.point[1]+.5)/15*100,y:(m.point[0]+.5)/15*100}
    :getPosition(c,m.progress,m.pawn);
   requestAnimationFrame(()=>{
    if(pawn!==movingPawn||pawn.dataset.motionProgress!==String(m.progress))return;
    pawn.classList.remove("is-hopping");
    void pawn.offsetWidth;
    pawn.classList.add("is-hopping");
    pawn.style.left=to.x+"%";pawn.style.top=to.y+"%";
   });
  }
 }
 const send=(action,pawn)=>window.parent.postMessage({source:"love-radar-ludo-duo",type:"action",action,...(pawn===undefined?{}:{pawn})},window.location.origin);
 function pointFor(color,progress){
  if(progress>=FINISH_PROGRESS){
   const p={blue:[7.24,6.8],red:[6.8,6.8],green:[6.8,7.24],yellow:[7.24,7.24]}[color];
   return p;
  }
  if(progress>=51){
   const lane=LANES[color][progress-51];
   if(lane)return lane;
   // A five-square lane goes straight to the centre, without a sixth cell.
   return null;
  }
  if(progress>=0)return TRACK[(SPAWNS[color]+progress)%52];
  return null;
 }
 function label(side){return side===state.mySeat?"Toi":"Ton partenaire"}
 function color(side){return state.palette.colors[side]}
 function legalPawns(){
  const g=state?.game;
  // The previous pawn's animation must never lock the NEXT legal turn.
  if(!g||g.status!=="playing"||g.turn!==state.mySeat||g.dice===null||state.busy||state.rolling||state.overlayOpen)return [];
  // Senegal legal choices belong to the Senegal engine, NOT Classic arithmetic.
  if(state.variant==="senegal")return Array.isArray(state.legalPawns)?state.legalPawns:[];
  return g.positions[state.mySeat].flatMap((p,i)=>(p===-1?g.dice===6:p>=0&&p<FINISH_PROGRESS&&p+g.dice<=FINISH_PROGRESS)?[i]:[]);
 }
 function createPawn(paletteColor,seat,index,selectable){
  const b=document.createElement("button");
  b.type="button";b.className="piece piece--"+paletteColor+
   (state?.game?.status==="playing"&&state.game.turn===state.mySeat&&seat===state.mySeat?" piece--owned-turn":"")+
   (selectable?" piece--selectable":"");
  b.dataset.seat=String(seat);b.dataset.pawn=String(index);
  b.setAttribute("aria-label",label(seat)+" : pion "+(index+1)+(selectable?", toucher pour déplacer":""));
  b.disabled=!selectable;b.title="Pion "+(index+1);
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 58 74");svg.setAttribute("aria-hidden","true");svg.classList.add("piece-svg");
  const use=document.createElementNS("http://www.w3.org/2000/svg","use");use.setAttribute("href","#pin-shape");
  svg.append(use);b.append(svg);
  if(selectable)b.addEventListener("click",()=>{
   if(b.disabled)return;
   // Freeze this button immediately: the React parent guards concurrent writes.
   b.disabled=true;b.classList.remove("piece--selectable");
   send("move",index);
  });
  return b;
 }
 /** Keep captured pins on the board, then return each one to its actual home
  * with a real 540ms position animation instead of teleporting. */
 function drawCaptured(){
  const active=new Set();
  for(const m of state?.capturedMotions||[]){
   const key=state.game.id+":"+m.seat+":"+m.pawn;
   active.add(key);
   let pawn=capturePins.get(key);
   const c=color(m.seat);
   if(!pawn){
    pawn=createPawn(c,m.seat,m.pawn,false);
    pawn.classList.add("piece--board","piece--captured","piece--moving");
    const pt=state.variant==="senegal"&&Array.isArray(m.point)
     ?{x:(m.point[1]+.5)/15*100,y:(m.point[0]+.5)/15*100}
     :getPosition(c,m.from,m.pawn);
    pawn.style.left=pt.x+"%";pawn.style.top=pt.y+"%";
    captureLayer.append(pawn);capturePins.set(key,pawn);
   }
   // Each server-authoritative reverse step moves this SAME DOM pawn.
   // Never teleport straight from the capture square to its home.
   if(m.returning)pawn.classList.add("is-returning");
   const nextProgress=state.variant==="senegal"&&Array.isArray(m.point)
    ?m.point.join(":"):(Number.isInteger(m.progress)?m.progress:m.from);
   if(pawn.dataset.reverseProgress!==String(nextProgress)){
    pawn.dataset.reverseProgress=String(nextProgress);
    const dest=state.variant==="senegal"&&Array.isArray(m.point)
     ?{x:(m.point[1]+.5)/15*100,y:(m.point[0]+.5)/15*100}
     :getPosition(c,Number(nextProgress),m.pawn);
    requestAnimationFrame(()=>{
     if(capturePins.get(key)!==pawn)return;
     pawn.style.left=dest.x+"%";pawn.style.top=dest.y+"%";
    });
   }
  }
  for(const [key,pawn] of capturePins)if(!active.has(key)){
   pawn.remove();capturePins.delete(key);
  }
 }
 function drawPawns(){
  if(!state?.game)return;
  const g=state.game,legal=legalPawns();
  for(const base of document.querySelectorAll(".base")){
   const c=[...base.classList].find(x=>x.startsWith("base--"))?.slice(6);
   base.querySelectorAll(".base-spot").forEach(spot=>spot.replaceChildren());
   base.setAttribute("aria-hidden",String(!state.palette.colors.includes(c)));
  }
  layer.replaceChildren();
  const placements=[];
  for(let seat=0;seat<2;seat++){
   const c=color(seat);
   for(let pawn=0;pawn<4;pawn++){
    const progress=g.positions[seat][pawn];
    const selectable=seat===state.mySeat&&legal.includes(pawn);
    // The original synchronized Ludo engine drives each animation frame.
    if(state.motion?.seat===seat&&state.motion?.pawn===pawn)continue;
    if(state.capturedMotions?.some(m=>m.seat===seat&&m.pawn===pawn))continue;
    const piece=createPawn(c,seat,pawn,selectable);
    if(progress===-1){
     const slot=document.querySelector(".base--"+c+" .base-spot:nth-child("+(pawn+1)+")");
     if(slot){piece.classList.add("piece--home");slot.append(piece)}
    }else{
     const pt=state.variant==="senegal"?state.boardPoints?.[seat]?.[pawn]:pointFor(c,progress);
     if(pt)placements.push({point:pt,piece,progress});
    }
   }
  }
  const groups=new Map();
  for(const item of placements){
   const key=item.point.map(v=>Number(v).toFixed(2)).join(":");
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(item);
  }
  for(const group of groups.values())group.forEach(({point,piece,progress},i)=>{
   const shift=(i-(group.length-1)/2)*Math.min(3,7/group.length);
   piece.classList.add("piece--board");
   if(progress>=FINISH_PROGRESS)piece.classList.add("piece--finished");
   piece.style.top=((point[0]+.5)/15*100)+"%";
   piece.style.left=((point[1]+.5)/15*100)+"%";
   piece.style.setProperty("--pawn-shift",shift.toFixed(1)+"px");
   piece.style.zIndex=String(4+i);layer.append(piece);
  });
  drawMotion();
  drawCaptured();
  // Touch the actual highlighted pawn; do not duplicate the four tokens below the board.
  choices.replaceChildren();choices.hidden=true;
 }
 function makeDice(){
  dice.replaceChildren();
  for(let face=1;face<=6;face++){
   const el=document.createElement("span");el.className="dice-face dice-face--"+face;
   for(let i=0;i<9;i++){
    const pip=document.createElement("i");pip.className=PIPS[face].includes(i)?"pip":"";
    el.append(pip);
   }dice.append(el);
  }
 }
 function showVictory(){
  if(!state?.game||state.game.status!=="won"||state.overlayOpen||restartPending)return;
  document.getElementById("win-title").textContent=state.game.winner===state.mySeat?"Tu as gagné ! 🎉":
   state.opponent==="solo"?"L’ordinateur a gagné":"Ton partenaire a gagné";
  document.getElementById("win-text").textContent=state.game.lastAction.includes("abandonné la partie")?state.game.lastAction:
   "La partie est terminée. Les défis et cadeaux restent disponibles dans Love Radar.";
  if(!victory.open){
   if(typeof victory.showModal==="function")victory.showModal();
   else victory.setAttribute("open","");
  }
 }
 function closeVictory(){
  if(victory.open&&typeof victory.close==="function")victory.close();
  else victory.removeAttribute("open");
 }
 function requestRematch(){
  if(restartPending||!state||state.game?.status!=="won"||state.busy)return;
  restartPending=true;
  replayButton.disabled=true;colorButton.disabled=true;
  actionStatus.textContent="Préparation de la nouvelle manche…";
  actionStatus.hidden=false;
  send("restart");
 }
 
  // The authenticated React parent already loaded private avatars. The
  // same-origin frame only displays those temporary object URLs; no tokens,
  // profile API calls or additional downloads on every multiplayer refresh.
  function renderProfilePhoto(playerSelector,src){
   const avatar=document.querySelector(playerSelector+" .avatar");
   const picture=avatar?.querySelector(".duo-profile-photo");
   if(!avatar||!picture)return;
   // Accept private object URLs created by the verified parent, including
   // Capacitor iOS blob:null URLs from WKWebView custom origins.
   const next=typeof src==="string"&&src.startsWith("blob:")?src:"";
   if(picture.dataset.photoUrl===next)return;
   picture.dataset.photoUrl=next;
   picture.hidden=true;
   avatar.classList.remove("has-photo");
   picture.onload=()=>{
    if(picture.dataset.photoUrl!==next)return;
    picture.hidden=false;
    avatar.classList.add("has-photo");
   };
   picture.onerror=()=>{
    if(picture.dataset.photoUrl!==next)return;
    picture.hidden=true;
    avatar.classList.remove("has-photo");
   };
   if(next)picture.src=next;
   else picture.removeAttribute("src");
  }
 function render(){
  if(!state?.game)return;
  const g=state.game,colors=state.palette.colors;
  const senegal=state.variant==="senegal",solo=state.opponent==="solo";
  // Sénégal uses the single visible Quitter action beside Cadeau.
  // Keep Classic's existing header button, but hide and disable it
  // for Sénégal so the title/logo never overlaps a duplicate action.
  document.documentElement.classList.toggle("lr-senegal-one-quit",senegal);
  const headerQuit=document.getElementById("choose-again");
  if(headerQuit){
   headerQuit.disabled=senegal;
   headerQuit.tabIndex=senegal?-1:0;
   headerQuit.setAttribute("aria-hidden",String(senegal));
  }
  if(senegal){
   const heading=document.querySelector(".game-title strong");
   const subtitle=document.querySelector(".game-title small");
   if(heading)heading.textContent="LUDO 🇸🇳 "+(solo?"SOLO":"DUO");
   if(subtitle)subtitle.textContent=solo?"TOI CONTRE L’ORDINATEUR · RÈGLES SÉNÉGALAISES":
    "TOI CONTRE TON PARTENAIRE · RÈGLES SÉNÉGALAISES";
   if(rules.dataset.variant!=="senegal"){
    rules.dataset.variant="senegal";
    const title=rules.querySelector("#rules-title");
    if(title)title.textContent="Règles du Ludo Sénégal 🇸🇳";
    const notes=[
     "Objectif : amener ses quatre pions au centre avant l’adversaire.",
     "Sortir : il faut un 6. Tu peux continuer plusieurs tours autour du plateau.",
     "Déplacer : suis le dé. Tu peux choisir de continuer ou d’entrer dans un couloir lorsque le moteur te le propose.",
     "Règle Sénégal : dans le couloir adverse, un 6 fait reculer d’une seule case. Dès la sortie, le pion reprend son déplacement normal.",
     "Barrage : deux pions sur la même case bloquent le passage. Un 6 permet de sauter le barrage et de s’arrêter une seule case après. Les étoiles protègent les pions.",
     "En Solo l’ordinateur peut jouer après le délai ; en Duo les actions restent synchronisées entre les deux téléphones."
    ];
    rules.querySelectorAll("p").forEach((el,i)=>{if(notes[i])el.textContent=notes[i]});
   }
  }
  if(previousSoundGame!==g.id){
   previousSoundGame=g.id;
   previousSoundPositions=g.positions.map(row=>row.slice());
   activeCaptureSounds=new Set();pendingCaptureSounds=new Set();soundWinGame="";
  }else if(previousSoundPositions){
   let captured=false,exited=false;
   const active=new Set((state.capturedMotions||[]).map(m=>m.seat+":"+m.pawn));
   for(const key of active)if(!activeCaptureSounds.has(key)){
    captured=true;pendingCaptureSounds.add(key);
   }
   activeCaptureSounds=active;
   for(let seat=0;seat<2;seat++)for(let pawn=0;pawn<4;pawn++){
    const key=seat+":"+pawn;
    const before=previousSoundPositions[seat]?.[pawn],after=g.positions[seat]?.[pawn];
    if(typeof before!=="number"||typeof after!=="number")continue;
    if(before>=0&&after===-1){
     if(!pendingCaptureSounds.has(key))captured=true;
     pendingCaptureSounds.delete(key);
    }
    if(before===-1&&after>=0&&after<FINISH_PROGRESS){
     exited=true;pendingCaptureSounds.delete(key);
    }
   }
   if(captured)window.LudoSfx?.play("capture");
   else if(exited)window.LudoSfx?.play("exit");
   previousSoundPositions=g.positions.map(row=>row.slice());
  }
  if(g.status==="won"&&g.winner===state.mySeat&&soundWinGame!==g.id){
   soundWinGame=g.id;window.LudoSfx?.play("win");
  }
  app.dataset.player=colors[state.mySeat];
  app.dataset.diceColor=colors[g.turn];
  app.dataset.computer=colors[1-state.mySeat];
  const me=color(state.mySeat),other=color(1-state.mySeat);
  renderProfilePhoto(".player--human",state.myAvatar);
  // Solo is an ordinary computer opponent: no robot avatar or partner photo.
  const opponentPlayer=document.querySelector(".player--cpu");
  opponentPlayer?.classList.toggle("is-solo",solo);
  if(!solo)renderProfilePhoto(".player--cpu",state.partnerAvatar);
  // Ring the active player's house; never transform the board or its grid.
  for(const el of board.querySelectorAll(".base")){
   const c=[...el.classList].find(x=>x.startsWith("base--"))?.slice(6);
   const active=g.status==="playing"&&c===colors[g.turn];
   el.classList.toggle("is-current-turn",active);
   el.classList.toggle("is-my-turn",active&&g.turn===state.mySeat);
   const human=el.querySelector(".base-label--human");
   const cpu=el.querySelector(".base-label--cpu");
   if(human){human.textContent="TOI";human.style.display=c===me?"block":"none"}
   if(cpu){cpu.textContent="PARTENAIRE";cpu.style.display=c===other?"block":"none"}
  }
  lastColor.textContent="Ta couleur : "+COLORS[me]+" · "+(solo?"Ordinateur":"Partenaire")+" : "+COLORS[other];
  document.querySelector(".player--human").classList.toggle("is-turn",g.turn===state.mySeat&&g.status==="playing");
  document.querySelector(".player--cpu").classList.toggle("is-turn",g.turn!==state.mySeat&&g.status==="playing");
  document.querySelector(".player--human b").textContent="TOI";
  document.querySelector(".player--cpu b").textContent=solo?"ORDI":"PARTENAIRE";
  const opponentIcon=document.querySelector(".player--cpu .avatar-fallback");
  if(opponentIcon)opponentIcon.textContent="♥";
  document.getElementById("player-count").textContent=g.positions[state.mySeat].filter(p=>p>=FINISH_PROGRESS).length+" / 4";
   document.getElementById("computer-count").textContent=g.positions[1-state.mySeat].filter(p=>p>=FINISH_PROGRESS).length+" / 4";
   const legal=legalPawns();
  const isMine=g.turn===state.mySeat,canRoll=isMine&&g.dice===null&&g.status==="playing"&&!state.busy&&!state.rolling&&!state.overlayOpen&&state.canRoll!==false;
  roll.disabled=!canRoll;
  roll.classList.toggle("is-ready",canRoll);
  roll.classList.toggle("is-busy",state.busy||state.rolling);
  const last=state.lastRoll;
  const stamp=last?g.id+":"+last.at:"";
  if(stamp&&lastAnimatedRoll!==stamp){
   lastAnimatedRoll=stamp;
   // Mirror the partner's throw once, ending on the authoritative face.
   if(receivedState&&last.seat!==state.mySeat&&!state.rolling)animateRealDieRoll();
  }
  const rollingNow=Boolean(state.rolling)||Date.now()<dieVisualUntil;
  dice.classList.toggle("is-rolling",rollingNow);
  // The game may clear g.dice immediately after a move; never fall back to
  // a fake "1" when the server has persisted the real last die result.
  const previousValue=/(?:lanc[eé]\s+un\s+|Dé\s*:\s*)([1-6])/.exec(g.lastAction||"");
  const diceValue=g.dice??last?.face??(previousValue?Number(previousValue[1]):1);
  dice.dataset.face=String(diceValue);
  dice.dataset.side=g.turn===state.mySeat?"human":"cpu";
  dieResult.textContent=rollingNow?"·":String(diceValue);
  dieResult.value=rollingNow?"":String(diceValue);
  dieResult.setAttribute("aria-label",rollingNow?"Le dé tourne":"Dernier lancer : "+diceValue);
  roll.setAttribute("aria-label",canRoll?"Lancer le dé":"Dé : "+diceValue);
  const isSix=g.dice===6;
  feedback.textContent=state.error||g.lastAction||"Jouez à deux en direct.";
  const turnBanner=document.getElementById("turn-message");
  if(turnBanner&&senegal)turnBanner.textContent=state.statusText||
   (isMine?"À TOI DE JOUER !":solo?"L’ordinateur joue…":"Ton partenaire joue…");
   matchButton.disabled=g.status!=="won";
  matchButton.textContent=g.status==="won"?"↺ Nouvelle manche":"♥ Partie en direct";
  const renderKey=JSON.stringify([g.id,g.version,g.positions,g.dice,g.turn,g.status,colors,state.motion,state.capturedMotions,legal,state.boardPoints]);
  if(renderKey!==lastBoardKey){lastBoardKey=renderKey;drawPawns()}
  receivedState=true;
  // Don't trap someone behind a win dialog when a rematch request failed.
  if(g.status!=="won"||(lastFinishedGameId&&lastFinishedGameId!==g.id)){
   restartPending=false;replayButton.disabled=false;colorButton.disabled=false;
   actionStatus.hidden=true;
  }else if(restartPending&&state.error){
   restartPending=false;replayButton.disabled=false;colorButton.disabled=false;
   actionStatus.textContent=state.error;actionStatus.hidden=false;
  }
  if(g.status==="won")lastFinishedGameId=g.id;
  if(g.status==="won"&&!state.overlayOpen)showVictory();else closeVictory();
 }
 window.addEventListener("message",e=>{
  if(e.origin!==location.origin||e.source!==window.parent)return;
  if(!e.data||e.data.source!=="love-radar-ludo-duo-parent")return;
  if(e.data.type==="ping"){
   window.parent.postMessage({source:"love-radar-ludo-duo",type:"ready"},location.origin);
   return;
  }
  if(e.data.type!=="state")return;
  const p=e.data;
  if(!p.game||!Array.isArray(p.game.positions)||p.game.positions.length!==2||!Array.isArray(p.palette?.colors))return;
  state=p;
  render();
 });
 roll.addEventListener("click",()=>{
  if(roll.disabled)return;
  // Show a response on tap; the authoritative dice result still comes from D1.
  roll.disabled=true;
  animateRealDieRoll();
  send("roll");
 });
 document.getElementById("choose-again").addEventListener("click",()=>send("exit"));
 matchButton.addEventListener("click",()=>{if(state?.game?.status==="won")send("restart")});
 document.getElementById("show-rules").addEventListener("click",()=>{
  if(typeof rules.showModal==="function")rules.showModal();
  else rules.setAttribute("open","");
 });
 document.getElementById("close-rules").addEventListener("click",()=>{
  if(rules.open&&typeof rules.close==="function")rules.close();
  else rules.removeAttribute("open");
 });
 const victoryGiftButton=document.createElement("button");
 victoryGiftButton.type="button";victoryGiftButton.className="dialog-secondary";
 victoryGiftButton.textContent="🎁 Voir le défi cadeau";
 victoryGiftButton.addEventListener("click",()=>{closeVictory();send("gift")});
 victory.querySelector("#change-color-after-win")?.after(victoryGiftButton);
 replayButton.addEventListener("click",requestRematch);
 // A new match returns to the consent/color selection screen.
 colorButton.addEventListener("click",requestRematch);
 document.getElementById("leave-after-win").addEventListener("click",()=>{
  closeVictory();
  send("leave");
 });
 makeDice();
 screen.classList.add("is-active");screen.setAttribute("aria-hidden","false");
 selection.classList.add("is-hidden");selection.setAttribute("aria-hidden","true");
 requestAnimationFrame(pinBoardSize);
 window.addEventListener("resize",pinBoardSize,{passive:true});
 // The app doesn't send a bearer token into a frame; server writes are always
 // mediated by the already-authenticated parent component.
 window.parent.postMessage({source:"love-radar-ludo-duo",type:"ready"},location.origin);
})();
