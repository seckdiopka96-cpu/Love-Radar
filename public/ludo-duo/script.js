/* Love Radar · Ludo Duo, exact classic Solo board and CSS.
 * The parent React component is the authenticated server client; this frame
 * is ONLY a renderer and a source of explicit roll/move button events.
 * No local random die, solo bot, local match engine, credentials or local saves.
 */
(()=>{
 "use strict";
 const COLORS={blue:"Bleu",red:"Rouge",green:"Vert",yellow:"Jaune"};
 const SPAWNS={blue:0,red:13,green:26,yellow:39};
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
 const status=document.getElementById("turn-message");
 const statusMeta=document.getElementById("turn-meta");
 const feedback=document.getElementById("game-feedback");
 const choices=document.getElementById("pawn-choices");
 const rules=document.getElementById("rules-dialog");
 const victory=document.getElementById("win-dialog");
 const matchButton=document.getElementById("new-game");
 const duoActions=document.createElement("div");
 duoActions.className="duo-side-actions";
 const giftButton=document.createElement("button");
 giftButton.type="button";giftButton.textContent="🎁 Cadeau";
 giftButton.addEventListener("click",()=>send("gift"));
 const emojiButton=document.createElement("button");
 emojiButton.type="button";emojiButton.textContent="💬 Réactions";
 emojiButton.setAttribute("aria-expanded","false");
 const emojiTray=document.createElement("div");emojiTray.className="duo-side-emotes";emojiTray.hidden=true;
 for(const emoji of ["❤️","😂","🔥","👏","😍","💋","😱"]){
  const b=document.createElement("button");b.type="button";b.textContent=emoji;
  b.setAttribute("aria-label","Réagir avec "+emoji);
  b.addEventListener("click",()=>{send("react",undefined,emoji);emojiTray.hidden=true;emojiButton.setAttribute("aria-expanded","false")});
  emojiTray.append(b);
 }
 emojiButton.addEventListener("click",()=>{
  emojiTray.hidden=!emojiTray.hidden;
  emojiButton.setAttribute("aria-expanded",String(!emojiTray.hidden));
 });
 duoActions.append(giftButton,emojiButton);
 document.querySelector(".game-actions")?.after(duoActions,emojiTray);
 const lastColor=document.getElementById("duo-colors-label");
 let state=null;
 let lastBoardKey="";
 let lastAnimatedRoll="",remoteDieTimer=null;
 // Keep the moving pawn in its own layer. Redrawing its DOM on every square
 // prevents WebKit/iOS from animating the left/top transition.
 const movementLayer=document.createElement("div");
 movementLayer.className="pieces-layer ludo-duo-motion-overlay";
 movementLayer.setAttribute("aria-hidden","true");
 board.append(movementLayer);
 let movingPawn=null,movingKey="";
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
   const from=getPosition(c,m.from,m.pawn);
   movingPawn.style.left=from.x+"%";movingPawn.style.top=from.y+"%";
   movementLayer.replaceChildren(movingPawn);
  }
  const to=getPosition(c,m.progress,m.pawn);
  const progress=movingPawn.querySelector(".piece-step-counter");
  if(progress)progress.textContent=Math.max(0,m.progress-m.from)+" / "+Math.max(1,m.to-m.from);
  if(m.progress!==m.from){
   const pawn=movingPawn;
   requestAnimationFrame(()=>{
    if(pawn!==movingPawn)return;
    pawn.classList.remove("is-hopping");
    void pawn.offsetWidth;
    pawn.classList.add("is-hopping");
    pawn.style.left=to.x+"%";pawn.style.top=to.y+"%";
   });
  }
 }
 const send=(action,pawn,emoji)=>window.parent.postMessage({source:"love-radar-ludo-duo",type:"action",action,...(pawn===undefined?{}:{pawn}),...(emoji===undefined?{}:{emoji})},window.location.origin);
 function pointFor(color,progress){
  if(progress===57){
   const p={blue:[7.24,6.8],red:[6.8,6.8],green:[6.8,7.24],yellow:[7.24,7.24]}[color];
   return p;
  }
  if(progress>=51){
   const lane=LANES[color][progress-51];
   if(lane)return lane;
   // The server has six final steps (51-56), whereas the classical board
   // has five colored cells; the sixth is the step adjacent to the center.
   return {blue:[8,7],red:[7,6],green:[6,7],yellow:[7,8]}[color];
  }
  if(progress>=0)return TRACK[(SPAWNS[color]+progress)%52];
  return null;
 }
 function label(side){return side===state.mySeat?"Toi":"Ton partenaire"}
 function color(side){return state.palette.colors[side]}
 function legalPawns(){
  const g=state?.game;
  if(!g||g.status!=="playing"||g.turn!==state.mySeat||g.dice===null||state.busy||state.rolling||state.animationBusy)return [];
  return g.positions[state.mySeat].flatMap((p,i)=>(p===-1?g.dice===6:p>=0&&p<57&&p+g.dice<=57)?[i]:[]);
 }
 function createPawn(paletteColor,seat,index,selectable){
  const b=document.createElement("button");
  b.type="button";b.className="piece piece--"+paletteColor+(selectable?" piece--selectable":"");
  b.dataset.seat=String(seat);b.dataset.pawn=String(index);
  b.setAttribute("aria-label",label(seat)+" : pion "+(index+1)+(selectable?", toucher pour déplacer":""));
  b.disabled=!selectable;b.title="Pion "+(index+1);
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 58 74");svg.setAttribute("aria-hidden","true");svg.classList.add("piece-svg");
  const use=document.createElementNS("http://www.w3.org/2000/svg","use");use.setAttribute("href","#pin-shape");
  svg.append(use);b.append(svg);
  if(selectable)b.addEventListener("click",()=>send("move",index));
  return b;
 }
 function drawPawns(){
  if(!state?.game)return;
  const g=state.game,legal=legalPawns(),canChoose=legal.length>1;
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
    const selectable=canChoose&&seat===state.mySeat&&legal.includes(pawn);
    // The original synchronized Ludo engine drives each animation frame.
    if(state.motion?.seat===seat&&state.motion?.pawn===pawn)continue;
    if(state.capturedMotions?.some(m=>m.seat===seat&&m.pawn===pawn))continue;
    const piece=createPawn(c,seat,pawn,selectable);
    if(progress===-1){
     const slot=document.querySelector(".base--"+c+" .base-spot:nth-child("+(pawn+1)+")");
     if(slot){piece.classList.add("piece--home");slot.append(piece)}
    }else{
     const pt=pointFor(c,progress);
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
   const shift=(i-(group.length-1)/2)*Math.min(8,23/group.length);
   piece.classList.add("piece--board");
   if(progress===57)piece.classList.add("piece--finished");
   piece.style.top=((point[0]+.5)/15*100)+"%";
   piece.style.left=((point[1]+.5)/15*100)+"%";
   piece.style.setProperty("--pawn-shift",shift.toFixed(1)+"px");
   piece.style.zIndex=String(4+i);layer.append(piece);
  });
  drawMotion();
  // Captured opponents keep their original square until the return phase.
  for(const m of state.capturedMotions||[]){
   const c=color(m.seat),p=m.returning?null:pointFor(c,m.from);
   const piece=createPawn(c,m.seat,m.pawn,false);
   if(m.returning){
    const home=document.querySelector(".base--"+c+" .base-spot:nth-child("+(m.pawn+1)+")");
    if(home){piece.classList.add("piece--home","piece--captured");home.append(piece)}
   }else if(p){
    piece.classList.add("piece--board","piece--captured");
    piece.style.top=((p[0]+.5)/15*100)+"%";
    piece.style.left=((p[1]+.5)/15*100)+"%";
    layer.append(piece);
   }
  }
  choices.replaceChildren();choices.hidden=!canChoose;
  if(canChoose){
   const title=document.createElement("span");title.textContent="Choisis ton pion";
   choices.append(title);
   for(const pawn of legal){
    const b=document.createElement("button");b.type="button";b.textContent="Pion "+(pawn+1);
    b.addEventListener("click",()=>send("move",pawn));choices.append(b);
   }
  }
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
  if(!state?.game||state.game.status!=="won")return;
  document.getElementById("win-title").textContent=state.game.winner===state.mySeat?"Tu as gagné ! 🎉":"Ton partenaire a gagné";
  document.getElementById("win-text").textContent="La partie est terminée. Les défis et cadeaux restent disponibles dans Love Radar.";
  if(!victory.open){
   if(typeof victory.showModal==="function")victory.showModal();
   else victory.setAttribute("open","");
  }
 }
 function closeVictory(){
  if(victory.open&&typeof victory.close==="function")victory.close();
  else victory.removeAttribute("open");
 }
 function updateClock(){
  if(!state)return;
  const remaining=state.remaining;
  if(statusMeta){
   statusMeta.textContent=remaining===null||remaining===undefined?"LUDO DUO":remaining+" s";
  }
 }
 function render(){
  if(!state?.game)return;
  const g=state.game,colors=state.palette.colors;
  app.dataset.player=colors[state.mySeat];
  app.dataset.computer=colors[1-state.mySeat];
  const me=color(state.mySeat),other=color(1-state.mySeat);
  // Label the two occupied houses, leave the other two empty.
  for(const el of board.querySelectorAll(".base")){
   const c=[...el.classList].find(x=>x.startsWith("base--"))?.slice(6);
   const human=el.querySelector(".base-label--human");
   const cpu=el.querySelector(".base-label--cpu");
   if(human){human.textContent="TOI";human.style.display=c===me?"block":"none"}
   if(cpu){cpu.textContent="PARTENAIRE";cpu.style.display=c===other?"block":"none"}
  }
  lastColor.textContent="Ta couleur : "+COLORS[me]+" · Partenaire : "+COLORS[other];
  document.querySelector(".player--human").classList.toggle("is-turn",g.turn===state.mySeat&&g.status==="playing");
  document.querySelector(".player--cpu").classList.toggle("is-turn",g.turn!==state.mySeat&&g.status==="playing");
  document.querySelector(".player--human b").textContent="TOI";
  document.querySelector(".player--cpu b").textContent="PARTENAIRE";
  document.getElementById("player-count").textContent=g.positions[state.mySeat].filter(p=>p===57).length+" / 4 arrivés";
  document.getElementById("computer-count").textContent=g.positions[1-state.mySeat].filter(p=>p===57).length+" / 4 arrivés";
  const legal=legalPawns();
  const isMine=g.turn===state.mySeat,canRoll=isMine&&g.dice===null&&g.status==="playing"&&!state.busy&&!state.rolling&&!state.animationBusy;
  roll.disabled=!canRoll;
  roll.classList.toggle("is-ready",canRoll);
  roll.classList.toggle("is-busy",state.busy||state.rolling);
  const last=state.lastRoll;
  const stamp=last?g.id+":"+last.at:"";
  if(stamp&&lastAnimatedRoll!==stamp){
   const previous=lastAnimatedRoll;
   lastAnimatedRoll=stamp;
   // Recreate a short dice roll for the partner, once per actual server roll.
   if(previous&&last.seat!==state.mySeat&&!state.rolling){
    if(remoteDieTimer!==null)clearTimeout(remoteDieTimer);
    remoteDieTimer=setTimeout(()=>{remoteDieTimer=null;render()},750);
   }
  }
  const rollingNow=Boolean(state.rolling)||remoteDieTimer!==null;
  dice.classList.toggle("is-rolling",rollingNow);
  // The game may clear g.dice immediately after a move; never fall back to
  // a fake "1" when the server has persisted the real last die result.
  const previousValue=/(?:lanc[eé]|dé\\s*:)\\s*(?:un\\s*)?([1-6])/.exec(g.lastAction||"");
  const diceValue=g.dice??last?.face??(previousValue?Number(previousValue[1]):1);
  dice.dataset.face=String(diceValue);
  dice.dataset.side=(last?.seat??g.turn)===state.mySeat?"human":"cpu";
  dieResult.textContent=rollingNow?"·":String(diceValue);
  dieResult.value=rollingNow?"":String(diceValue);
  dieResult.setAttribute("aria-label",rollingNow?"Le dé tourne":"Dernier lancer : "+diceValue);
  roll.setAttribute("aria-label",canRoll?"Lancer le dé":"Dé : "+diceValue);
  const only=legal.length===1;
  status.textContent=g.status==="won"?"Partie terminée":
    state.rolling?"🎲 Le dé roule…":
    state.motion?"Un pion avance…":
    g.dice!==null&&isMine?(only?"Ton pion avance automatiquement…":"Choisis un pion qui brille"):
    g.dice!==null?"Ton partenaire joue son pion…":
    isMine?"À toi de jouer : lance le dé !":"Au tour de ton partenaire…";
  feedback.textContent=state.error||g.lastAction||"Jouez à deux en direct.";
  matchButton.disabled=g.status!=="won";
  matchButton.textContent=g.status==="won"?"↺ Nouvelle manche":"♥ Partie en direct";
  const renderKey=JSON.stringify([g.id,g.version,g.positions,g.dice,g.turn,g.status,colors,state.motion,state.capturedMotions,legal]);
  if(renderKey!==lastBoardKey){lastBoardKey=renderKey;drawPawns()}
  updateClock();
  if(g.status==="won")showVictory();else closeVictory();
 }
 window.addEventListener("message",e=>{
  if(e.origin!==location.origin||e.source!==window.parent)return;
  if(!e.data||e.data.source!=="love-radar-ludo-duo-parent"||e.data.type!=="state")return;
  const p=e.data;
  if(!p.game||!Array.isArray(p.game.positions)||p.game.positions.length!==2||!Array.isArray(p.palette?.colors))return;
  state=p;
  render();
 });
 roll.addEventListener("click",()=>{if(!roll.disabled)send("roll")});
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
 document.getElementById("play-again").addEventListener("click",()=>send("restart"));
 document.getElementById("change-color-after-win").addEventListener("click",()=>send("restart"));
 const gameDialog=document.getElementById("win-dialog");
 if(gameDialog)gameDialog.addEventListener("close",()=>{});
 makeDice();
 screen.classList.add("is-active");screen.setAttribute("aria-hidden","false");
 selection.classList.add("is-hidden");selection.setAttribute("aria-hidden","true");
 // The app doesn't send a bearer token into a frame; server writes are always
 // mediated by the already-authenticated parent component.
 window.parent.postMessage({source:"love-radar-ludo-duo",type:"ready"},location.origin);
})();
