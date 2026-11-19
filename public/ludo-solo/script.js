/*
 * LOVE RADAR — LUDO SOLO, jeu complet en JavaScript pur.
 * Aucun framework, compte, serveur ni bibliothèque externe.
 *
 * Règles : 6 pour sortir, parcours des 52 cases communes, cinq cases de
 * couloir final puis arrivée exacte au centre, captures hors des refuges,
 * deux pions adverses formant un barrage, tour bonus sur 6/capture/arrivée,
 * trois 6 consécutifs faisant perdre le tour, premier à 4 pions gagnant.
 * Le moteur n'invente jamais de deuxième résultat pendant l'animation du dé.
 */
(() => {
  "use strict";
  document.documentElement.classList.add("lr-ludo-solo-ui");

  const COLORS = Object.freeze({ blue:"Bleu", red:"Rouge", green:"Vert", yellow:"Jaune" });
  // Camps diamétralement opposés sur le plateau (décalage de 26 cases).
  const CPU_COLOR = Object.freeze({ blue:"green", red:"yellow", green:"blue", yellow:"red" });
  // Conserver la progression des parties enregistrées avec l'ancien mauvais appariement.
  const LEGACY_CPU_COLOR = Object.freeze({ blue:"green", red:"blue", green:"yellow", yellow:"red" });
  const SPAWNS = Object.freeze({ blue:0, red:13, green:26, yellow:39 });
  const FINAL = 56;                  // 0..50 = piste, 51..55 = couloir, 56 = arrivée
  const HOME = -1;
  // Each Love Radar member gets private local solo progress, even on shared phones.
  const SCOPE = (new URLSearchParams(window.location.search).get("scope") || "guest").slice(0,160);
  const SAVE_KEY = "love-radar-ludo-solo-v2:"+SCOPE;
  const COLOR_KEY = "love-radar-ludo-color-v1:"+SCOPE;
  const SIDES = ["human", "cpu"];
  const PIPS = Object.freeze({1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]});

  // 52 cases de la boucle. Quelques changements de direction sont en diagonale
  // au coin des quatre maisons : ce sont des raccourcis de grille habituels.
  const TRACK = [
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
  if (TRACK.length !== 52) throw new Error("Erreur de parcours Ludo : 52 cases nécessaires.");

  const LANES = Object.freeze({
    blue:   [[13,7],[12,7],[11,7],[10,7],[9,7]],
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
    green:  [[1,7],[2,7],[3,7],[4,7],[5,7]],
    yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]]
  });
  // Eight visible protected cells: colored launches and four extra star refuges.
  const SAFE_KEYS = new Set([0,8,13,21,26,34,39,47].map(i=>TRACK[i].join(",")));

  const app = document.querySelector(".app");
  const selection = document.getElementById("choix-couleur");
  const playScreen = document.getElementById("plateau");
  const board = document.getElementById("ludo-board");
  const layer = document.getElementById("pieces-layer");
  const die = document.getElementById("dice-3d");
  const dieResult = document.getElementById("die-result");
  const rollButton = document.getElementById("roll-dice");
  const statusText = document.getElementById("turn-message");
  const statusMeta = document.getElementById("turn-meta");
  const gameFeedback = document.getElementById("game-feedback");
  const pawnChoices = document.getElementById("pawn-choices");
  const rulesDialog = document.getElementById("rules-dialog");
  const winDialog = document.getElementById("win-dialog");
  const resumeButton = document.getElementById("resume-game");
  const colorRadios = Array.from(document.querySelectorAll('input[name="player-color"]'));
  if (![app,selection,playScreen,board,layer,die,rollButton,statusText,pawnChoices,rulesDialog,winDialog].every(Boolean)) {
    throw new Error("Une section du jeu Ludo manque dans index.html.");
  }

  // Temporary pause: do not mount reaction buttons or floating stickers.

  // État : un entier par pion (-1 = maison, 0..55 = parcours, 56 = arrivé).
  let game = null;
  let busy = false;
  let generation = 0;              // Invalide les animations d'une ancienne partie.
  let computerTimer = null;
  let actionTimer = null;
  let movingToken = null;
  let lastRoll = 1;
  let rulesPause = false;
  // Love Radar already renders the main "LUDO SOLO" header above this iframe.
  // In embedded mode, retain the functional color/rules controls but place
  // them in the existing turn banner instead of painting a second header.
  if(window.parent!==window && new URLSearchParams(window.location.search).has("scope")){
    document.documentElement.classList.add("lr-ludo-solo-in-app");
    const turnBanner=playScreen.querySelector(".turn-banner");
    const colorButton=document.getElementById("choose-again");
    const rulesButton=document.getElementById("show-rules");
    if(turnBanner&&colorButton&&rulesButton){
      colorButton.classList.add("ludo-compact-colors");
      colorButton.textContent="↺";
      colorButton.title="Changer de couleur";
      colorButton.setAttribute("aria-label","Changer de couleur");
      turnBanner.prepend(colorButton);
      rulesButton.classList.add("ludo-compact-rules");
      turnBanner.append(rulesButton);
    }
  }
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  const sfx=window.LudoSfx;
  const boardArea=board.closest(".board-area");
  let pinnedBoardSize=0;
  function centerBoard(){
    if(!boardArea)return;
    const width=boardArea.clientWidth,height=boardArea.clientHeight;
    if(width<140||height<140)return;
    const size=Math.floor(Math.min(width-8,height-8,660));
    if(Math.abs(size-pinnedBoardSize)<12)return;
    pinnedBoardSize=size;
    boardArea.style.setProperty("--lr-solo-board-size",size+"px");
  }
  if(boardArea&&typeof ResizeObserver!=="undefined"){
    new ResizeObserver(centerBoard).observe(boardArea);
  }
  window.addEventListener("resize",centerBoard,{passive:true});

  const validColor = value => Object.hasOwn(CPU_COLOR,value);
  const opponent = side => side === "human" ? "cpu" : "human";
  const labelSide = side => side === "human" ? "Toi" : "L’ordinateur";
  const getColor = side => side === "human" ? game.playerColor : game.cpuColor;
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
  const isCurrent = generationNumber => generationNumber === generation && game !== null;

  /** Cryptographic RNG when available; 0–251 rejection eliminates modulo bias. */
  function getRoll() {
    if (window.crypto?.getRandomValues) {
      const byte = new Uint8Array(1);
      do { window.crypto.getRandomValues(byte); } while (byte[0] >= 252);
      return byte[0] % 6 + 1;
    }
    return Math.floor(Math.random()*6)+1;
  }

  /** Coordinate for every legal progress. Start positions rotate with color. */
  function coordinate(color,progress) {
    if (progress < 0) return null;
    if (progress === FINAL) {
      // Four slight offsets make finished pieces distinguishable at the center.
      const offset = {blue:[.43,.75],red:[.23,.42],green:[.42,.22],yellow:[.75,.43]}[color];
      return {row:7+offset[1], col:7+offset[0], finish:true};
    }
    if (progress >= 51) {
      const point = LANES[color][progress-51];
      return {row:point[0],col:point[1],finishLane:true};
    }
    const point = TRACK[(SPAWNS[color]+progress)%52];
    return {row:point[0],col:point[1],track:true};
  }

  function locationKey(color,progress) {
    const point = coordinate(color,progress);
    return point?.track ? point.row+","+point.col : null;
  }
  function safeSpot(color,progress) {
    const key = locationKey(color,progress);
    return key !== null && SAFE_KEYS.has(key);
  }

  function validMoves(side,dieValue) {
    if (!game || !Number.isInteger(dieValue)) return [];
    const color = getColor(side);
    const otherSide = opponent(side);
    const otherColor = getColor(otherSide);
    return game.pieces[side].flatMap((progress,index) => {
      if (progress === FINAL) return [];
      if (progress === HOME && dieValue !== 6) return [];
      const destination = progress === HOME ? 0 : progress + dieValue;
      if (destination > FINAL) return []; // arrivée EXACTE, pas de rebond
      // Two or more enemy pieces on a non-protected track square are a blockade.
      const begin = progress === HOME ? 0 : progress + 1;
      for (let step=begin; step<=destination; step++) {
        if (step > 50) continue;             // Own home lane is never shared.
        const square = locationKey(color,step);
        if (!square || safeSpot(color,step)) continue;
        const enemyCount = game.pieces[otherSide].filter(p=>locationKey(otherColor,p)===square).length;
        if (enemyCount >= 2) return [];
      }
      return [index];
    });
  }

  function scoreComputerMove(pieceIndex,dieValue) {
    const progress = game.pieces.cpu[pieceIndex];
    const next = progress === HOME ? 0 : progress + dieValue;
    const color = game.cpuColor;
    const destination = locationKey(color,next);
    let score = 10 + next*.18 + Math.random()*2;
    if (progress === HOME) score += 34;
    if (next >= 51) score += 31;
    if (next === FINAL) score += 180;
    if (destination && !safeSpot(color,next)) {
      const enemies = game.pieces.human.filter(p=>locationKey(game.playerColor,p)===destination);
      if (enemies.length === 1) score += 145;
      // Avoid exposed squares reachable by the player on the next roll.
      for (const humanProgress of game.pieces.human) {
        if (humanProgress < 0 || humanProgress >= FINAL) continue;
        for (let throwValue=1;throwValue<=6;throwValue++) {
          const future = humanProgress+throwValue;
          if (future<=50 && locationKey(game.playerColor,future)===destination) score -= 8;
        }
      }
    }
    return score;
  }

  function bestComputerPawn(candidates,dieValue) {
    return [...candidates].sort((a,b)=>scoreComputerMove(b,dieValue)-scoreComputerMove(a,dieValue))[0];
  }

  function makeGame(playerColor) {
    return {
      playerColor, cpuColor:CPU_COLOR[playerColor],
      pieces:{human:[-1,-1,-1,-1],cpu:[-1,-1,-1,-1]},
      turn:"human",phase:"roll",die:null,lastRoll:1,streak:{human:0,cpu:0},
      result:null,message:"À toi de jouer : lance le dé !",turnCount:1
    };
  }

  function gameIsValid(value) {
    return value && validColor(value.playerColor) && value.cpuColor===CPU_COLOR[value.playerColor] &&
      value.pieces && SIDES.every(side=>Array.isArray(value.pieces[side]) && value.pieces[side].length===4 &&
        value.pieces[side].every(progress=>Number.isInteger(progress)&&progress>=-1&&progress<=FINAL)) &&
      SIDES.includes(value.turn) && ["roll","choose","finished"].includes(value.phase) &&
      (value.die===null || Number.isInteger(value.die)&&value.die>=1&&value.die<=6) &&
      value.streak && SIDES.every(side=>Number.isInteger(value.streak[side])&&value.streak[side]>=0&&value.streak[side]<=2) &&
      (value.result===null||SIDES.includes(value.result)) &&
      typeof value.message==="string" && value.message.length<300 && Number.isInteger(value.turnCount) && value.turnCount>0;
  }

  function persist() {
    if (!game || !["roll","choose","finished"].includes(game.phase)) return;
    try { localStorage.setItem(SAVE_KEY,JSON.stringify(game)); } catch { /* Private navigation can disable storage. */ }
  }
  function savedGame() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
      if (gameIsValid(data)) return data;
      // The older Solo assigned red/green players to adjacent CPU camps.
      // Migrate only otherwise valid snapshots, retaining every pawn's progress.
      if (data && validColor(data.playerColor) &&
        data.cpuColor===LEGACY_CPU_COLOR[data.playerColor]) {
        const migrated={...data,cpuColor:CPU_COLOR[data.playerColor]};
        if (gameIsValid(migrated)) {
          try { localStorage.setItem(SAVE_KEY,JSON.stringify(migrated)); } catch {/* optional */}
          return migrated;
        }
      }
      return null;
    } catch {return null}
  }
  function clearTimers() {
    if (computerTimer !== null) {clearTimeout(computerTimer);computerTimer=null}
    if (actionTimer !== null) {clearTimeout(actionTimer);actionTimer=null}
  }

  function setColor(color) {
    if (!validColor(color)) return;
    app.dataset.player=color;
    app.dataset.computer=CPU_COLOR[color];
    for (const radio of colorRadios) radio.checked = radio.value===color;
    try { localStorage.setItem(COLOR_KEY,color); } catch {/* optional */}
  }

  function updateResumeButton() {
    const saved = savedGame();
    resumeButton.hidden=!saved || saved.phase==="finished";
    if (saved) resumeButton.textContent="↺ Reprendre la partie en "+COLORS[saved.playerColor].toLowerCase();
  }

  /** Six physical, accessible CSS 3D faces with a stable mapping to real results. */
  function makeDieFaces() {
    die.replaceChildren();
    for (let side=1;side<=6;side++) {
      const face = document.createElement("span");
      face.className="dice-face dice-face--"+side;
      for (let i=0;i<9;i++) {
        const spot=document.createElement("i");
        spot.className=PIPS[side].includes(i)?"pip":"";
        face.append(spot);
      }
      die.append(face);
    }
  }

  function createPawn(color,side,index,selectable) {
    const button = document.createElement("button");
    button.type="button";
    button.className="piece piece--"+color+(selectable?" piece--selectable":"");
    button.dataset.side=side;
    button.dataset.pawn=String(index);
    const state=game.pieces[side][index];
    button.setAttribute("aria-label",(side==="human"?"Ton pion ":"Pion adverse ")+(index+1)+" ("+COLORS[color]+")"+(selectable?" · toucher pour déplacer":""));
    button.title=selectable?"Déplacer ce pion":"Pion "+(index+1);
    button.disabled=!selectable;
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 58 74");
    svg.setAttribute("aria-hidden","true");
    svg.classList.add("piece-svg");
    const use=document.createElementNS("http://www.w3.org/2000/svg","use");
    use.setAttribute("href","#pin-shape");
    svg.append(use);button.append(svg);
    if (selectable) button.addEventListener("click",()=>{void movePiece(side,index)});
    return button;
  }

  /** Render pieces in the original HTML homes and a transparent board overlay. */
  function renderPawns() {
    document.querySelectorAll(".base").forEach(base=>{
      const color=[...base.classList].find(cls=>cls.startsWith("base--"))?.slice(6);
      const occupied=game.playerColor===color||game.cpuColor===color;
      base.setAttribute("aria-hidden",occupied?"false":"true");
      base.querySelectorAll(".base-spot").forEach(spot=>spot.replaceChildren());
    });
    layer.replaceChildren();
    if (movingToken) layer.append(movingToken);
    const playable=game.phase==="choose"&&game.turn==="human"?validMoves("human",game.die):[];
    const canChoose=playable.length>1;
    const placements=[];
    for (const side of SIDES) {
      const color=getColor(side);
      game.pieces[side].forEach((progress,index)=>{
        if (game.moving?.side===side&&game.moving?.index===index) return;
        const selectable=canChoose&&side==="human"&&playable.includes(index);
        const piece=createPawn(color,side,index,selectable);
        if (progress===HOME) {
          const slot=document.querySelector(".base--"+color+" .base-spot:nth-child("+(index+1)+")");
          if (slot) { piece.classList.add("piece--home");slot.append(piece); }
        } else {
          const point=coordinate(color,progress);
          placements.push({color,progress,index,side,point,piece});
        }
      });
    }
    const grouped=new Map();
    for (const place of placements) {
      const key=place.point.row.toFixed(2)+":"+place.point.col.toFixed(2);
      if (!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(place);
    }
    for (const group of grouped.values()) {
      group.forEach((place,offset)=>{
        const {row,col}=place.point;
        const piece=place.piece;
        const shift=(offset-(group.length-1)/2)*Math.min(3,7/group.length);
        piece.classList.add("piece--board");
        if (place.progress===FINAL) piece.classList.add("piece--finished");
        piece.style.left=((col+.5)/15*100)+"%";
        piece.style.top=((row+.5)/15*100)+"%";
        piece.style.setProperty("--pawn-shift",shift.toFixed(1)+"px");
        piece.style.zIndex=String(4+offset);
        layer.append(piece);
      });
    }
    // Selection happens by touching the real pawn in its home or on the track.
    // The old numbered buttons are deliberately never rendered.
    pawnChoices.replaceChildren();
    pawnChoices.hidden=true;
  }

  function render() {
    if (!game) return;
    const isHuman=game.turn==="human";
    const choices=game.phase==="choose"?validMoves("human",game.die):[];
    const humanCanRoll=game.phase==="roll"&&isHuman&&!busy&&!rulesPause;
    app.dataset.player=game.playerColor;
    app.dataset.diceColor=getColor(game.turn);
    app.dataset.computer=game.cpuColor;
    rollButton.disabled=!humanCanRoll;
    rollButton.classList.toggle("is-ready",humanCanRoll);
    rollButton.classList.toggle("is-busy",game.phase==="rolling");
    die.classList.toggle("is-rolling",game.phase==="rolling");
    die.dataset.face=String(lastRoll);
    die.dataset.side=game.turn;
    // The previous result is NOT a new playable roll. Show a replay icon
    // while the player must throw again, then the real numeric result.
    const needsNewRoll=game.phase==="roll"&&isHuman;
    dieResult.textContent=needsNewRoll?"↻":String(lastRoll);
    dieResult.value=needsNewRoll?"":String(lastRoll);
    dieResult.setAttribute("aria-label",needsNewRoll?"Lancer un nouveau dé":"Dernier lancer : "+lastRoll);
    rollButton.setAttribute("aria-label",humanCanRoll?"Lancer le dé":game.phase==="rolling"?"Le dé tourne":"Dé : "+lastRoll);
    document.getElementById("player-count").textContent=game.pieces.human.filter(p=>p===FINAL).length+" / 4 arrivés";
    document.getElementById("computer-count").textContent=game.pieces.cpu.filter(p=>p===FINAL).length+" / 4 arrivés";
    document.querySelector(".player--human").classList.toggle("is-turn",isHuman&&game.phase!=="finished");
    document.querySelector(".player--cpu").classList.toggle("is-turn",!isHuman&&game.phase!=="finished");
    document.getElementById("game-stat").textContent="Tour "+game.turnCount;
    const prompt = game.phase==="finished" ? "Partie terminée !" :
      game.phase==="rolling" ? "🎲 Le dé roule…" :
      game.phase==="moving" ? "Ton pion avance…" :
      game.phase==="no-move" ? "Aucun déplacement possible" :
      !isHuman ? "🤖 L’ordinateur joue…" :
      game.phase==="roll" ? "À toi de jouer : lance le dé !" :
      choices.length>1 ? "Touche le pion à déplacer" :
      choices.length===1 ? "Ton pion avance automatiquement…" : "À toi de jouer !";
    statusText.textContent=prompt;
    statusMeta.textContent=game.phase==="choose"&&game.die!==null ? "Dé : "+game.die :
      game.phase==="roll" ? (isHuman?"TOI":"ORDI") :"LUDO SOLO";
    gameFeedback.textContent=game.message;
    renderPawns();
  }

  function showScreen(showGame) {
    playScreen.classList.toggle("is-active",showGame);
    selection.classList.toggle("is-hidden",showGame);
    playScreen.setAttribute("aria-hidden",String(!showGame));
    selection.setAttribute("aria-hidden",String(showGame));
    if (showGame && game) {render();requestAnimationFrame(centerBoard);}
  }

  function openGame() {
    window.location.hash="plateau";
    showScreen(true);
    maybeComputer();
  }

  function startNewGame() {
    clearTimers();generation++;busy=false;movingToken=null;rulesPause=false;
    const selected=document.querySelector('input[name="player-color"]:checked')?.value||"blue";
    setColor(selected);
    game=makeGame(selected);lastRoll=1;
    persist();openGame();
    updateResumeButton();
  }

  function resumeGame() {
    const saved=savedGame();
    if (!saved) return;
    clearTimers();generation++;busy=false;movingToken=null;rulesPause=false;
    game=saved;
    lastRoll=game.die||((Number.isInteger(game.lastRoll)&&game.lastRoll>=1&&game.lastRoll<=6)?game.lastRoll:1);
    setColor(game.playerColor);
    openGame();
    if (game.phase==="choose") schedulePendingMove();
  }

  /** The actual board coordinates of a token are measured in % of the board. */
  function boardPosition(color,progress,pawnIndex) {
    if (progress!==HOME) {
      const point=coordinate(color,progress);
      return {x:(point.col+.5)/15*100,y:(point.row+.5)/15*100};
    }
    const spot=document.querySelector(".base--"+color+" .base-spot:nth-child("+(pawnIndex+1)+")");
    const rect=spot?.getBoundingClientRect();
    const bounds=board.getBoundingClientRect();
    if (!rect || !bounds.width) return {x:50,y:50};
    return {x:((rect.left+rect.width/2-bounds.left)/bounds.width)*100,
      y:((rect.top+rect.height/2-bounds.top)/bounds.height)*100};
  }

  async function animatePawn(side,pawnIndex,start,target,tokenGeneration) {
    const color=getColor(side);
    const pawn=createPawn(color,side,pawnIndex,false);
    pawn.classList.add("piece--board","piece--moving");
    const from=boardPosition(color,start,pawnIndex);
    pawn.style.left=from.x+"%";pawn.style.top=from.y+"%";
    movingToken=pawn;layer.append(pawn);
    // Keep a 2-frame layout barrier, so Safari sees start before destination.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const first=start===HOME?0:start+1;
    const totalSteps=start===HOME?1:target-start;
    const counter=document.createElement("b");
    counter.className="piece-step-counter";counter.setAttribute("aria-hidden","true");
    pawn.append(counter);
    for (let step=first;step<=target;step++) {
      if (!isCurrent(tokenGeneration)) return false;
      const point=boardPosition(color,step,pawnIndex);
      pawn.style.left=point.x+"%";pawn.style.top=point.y+"%";
      pawn.classList.remove("is-hopping");
      void pawn.offsetWidth; // Restart the bounce at every step on Safari.
      pawn.classList.add("is-hopping");
      counter.textContent=(step-first+1)+" / "+totalSteps;
      sfx?.play("step");
      // Deliberately slow, readable movement: each square gets its full
      // landing + hop animation before the next step begins.
      await sleep(start===HOME?520:540);
      pawn.classList.remove("is-hopping");
    }
    await sleep(100);
    if (!isCurrent(tokenGeneration)) return false;
    movingToken=null;pawn.remove();
    return true;
  }

  /** A captured pin retraces its track squares in reverse, then returns home. */
  async function animateCapture(side,pawnIndex,progress,tokenGeneration) {
    const color=getColor(side);
    const existing=layer.querySelector('.piece--board[data-side="'+side+'"][data-pawn="'+pawnIndex+'"]');
    const pawn=createPawn(color,side,pawnIndex,false);
    pawn.classList.add("piece--board","piece--moving","piece--captured");
    const point=boardPosition(color,progress,pawnIndex);
    pawn.style.left=point.x+"%";pawn.style.top=point.y+"%";
    if(existing)existing.style.visibility="hidden";
    layer.append(pawn);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    // Reverse the exact progress journey; do not jump diagonally across the board.
    // A fast 50ms square-by-square rewind returns even a distant pawn in under 3 seconds.
    for(let step=progress-1;step>=0;step--){
      if(!isCurrent(tokenGeneration)){pawn.remove();return false}
      const back=boardPosition(color,step,pawnIndex);
      pawn.style.left=back.x+"%";pawn.style.top=back.y+"%";
      await sleep(50);
    }
    if(!isCurrent(tokenGeneration)){pawn.remove();return false}
    const home=boardPosition(color,HOME,pawnIndex);
    pawn.style.left=home.x+"%";pawn.style.top=home.y+"%";
    await sleep(140);
    pawn.remove();
    return isCurrent(tokenGeneration);
  }

  function opponentBlockAtDestination(side,destinationProgress) {
    const color=getColor(side);
    const square=locationKey(color,destinationProgress);
    if (!square || safeSpot(color,destinationProgress)) return [];
    const otherSide=opponent(side);
    const otherColor=getColor(otherSide);
    return game.pieces[otherSide].flatMap((progress,index)=>
      locationKey(otherColor,progress)===square?[index]:[]);
  }

  function switchTurn() {
    game.turn=opponent(game.turn);
    game.turnCount++;
    game.phase="roll";
    game.die=null;
  }

  function endTurnWithoutMove(side,reason) {
    if (game.turn!==side) return;
    game.streak[side]=0;
    game.message=reason;
    switchTurn();persist();render();maybeComputer();
  }

  async function movePiece(side,pawnIndex) {
    if (!game || busy || rulesPause || game.turn!==side || game.phase!=="choose") return;
    if (!validMoves(side,game.die).includes(pawnIndex)) return;
    const tokenGeneration=generation;
    const from=game.pieces[side][pawnIndex];
    const face=game.die;
    const target=from===HOME?0:from+face;
    busy=true;game.phase="moving";game.moving={side,index:pawnIndex};render();
    if(from===HOME)sfx?.play("exit");
    const success=await animatePawn(side,pawnIndex,from,target,tokenGeneration);
    if (!success || !isCurrent(tokenGeneration)) return;
    game.pieces[side][pawnIndex]=target;
    delete game.moving;
    renderPawns();
    const captured=opponentBlockAtDestination(side,target);
    const otherSide=opponent(side);
    if(captured.length)sfx?.play("capture");
    if(captured.length){
      const oldPositions=captured.map(i=>game.pieces[otherSide][i]);
      const completed=await Promise.all(captured.map((i,j)=>
        animateCapture(otherSide,i,oldPositions[j],tokenGeneration)));
      if(completed.some(done=>!done)||!isCurrent(tokenGeneration))return;
    }
    for (const opponentPawn of captured) game.pieces[otherSide][opponentPawn]=HOME;
    // Show captured pawns in their original home positions, never delete them.
    if(captured.length)renderPawns();
    // Capture animation continues without opening a reaction picker.
    const finished=target===FINAL;
    const hasWon=game.pieces[side].every(p=>p===FINAL);
    const actor=labelSide(side);
    game.die=null;
    busy=false;
    if (hasWon) {
      if(side==="human")sfx?.play("win");
      game.result=side;game.phase="finished";
      game.message=side==="human"?"🏆 Bravo ! Tes quatre pions sont arrivés !":"L’ordinateur a amené ses quatre pions au centre.";
      persist();render();showVictory();return;
    }
    const bonus=face===6 || captured.length>0 || finished;
    const moveText=from===HOME?"sorti de la maison":finished?"arrivé au centre":
      "avancé de "+face+" case"+(face>1?"s":"");
    const special=captured.length?" Pion adverse capturé !":finished?" Arrivée réussie !":"";
    game.message=actor+" : pion "+(pawnIndex+1)+" "+moveText+"."+special+
      (bonus?" Nouveau lancer !":"");
    if (bonus) { game.phase="roll";game.die=null; }
    else {game.streak[side]=0;switchTurn()}
    persist();render();maybeComputer();
  }

  async function rollDie(side) {
    if (!game || busy || rulesPause || game.turn!==side || game.phase!=="roll") return;
    const tokenGeneration=generation;
    sfx?.unlock();sfx?.play("roll");
    busy=true;game.phase="rolling";
    game.message=(side==="human"?"Tu lances":"L’ordinateur lance")+" le dé…";
    render();
    await sleep(reducedMotion?80:240);
    if (!isCurrent(tokenGeneration)) return;
    const value=getRoll();
    lastRoll=value;
    game.die=value;
    game.lastRoll=value;
    game.streak[side]=value===6?game.streak[side]+1:0;
    if (game.streak[side]>=3) {
      busy=false;
      game.phase="no-move";
      game.message=labelSide(side)+" : trois 6 de suite ! Tour perdu.";
      render();
      actionTimer=setTimeout(()=>{
        if (!isCurrent(tokenGeneration)) return;
        actionTimer=null;
        endTurnWithoutMove(side,game.message);
      },reducedMotion?220:450);
      return;
    }
    const legal=validMoves(side,value);
    busy=false;
    if (legal.length===0) {
      game.phase="no-move";
      game.message=labelSide(side)+" : "+value+" · aucun pion ne peut avancer.";
      render();
      actionTimer=setTimeout(()=>{
        if (!isCurrent(tokenGeneration)) return;
        actionTimer=null;
        endTurnWithoutMove(side,game.message);
      },reducedMotion?220:450);
      return;
    }
    game.phase="choose";
    game.message=(side==="human"?"Tu as fait ":"L’ordinateur a fait ")+value+
      (side==="human"&&legal.length>1?". Choisis un pion.":". Le pion avance.");
    persist();render();
    schedulePendingMove();
  }

  function schedulePendingMove() {
    if (!game || game.phase!=="choose" || busy || rulesPause) return;
    const side=game.turn;
    const legal=validMoves(side,game.die);
    if (!legal.length) return;
    if (side==="human" && legal.length>1) return; // Real player choice.
    const chosen=side==="cpu"?bestComputerPawn(legal,game.die):legal[0];
    const tokenGeneration=generation;
    if (actionTimer!==null) clearTimeout(actionTimer);
    actionTimer=setTimeout(()=>{
      actionTimer=null;
      if (isCurrent(tokenGeneration)&&game.turn===side&&game.phase==="choose") void movePiece(side,chosen);
    },side==="cpu"?560:320);
  }

  function maybeComputer() {
    if (!game || busy || rulesPause || game.turn!=="cpu" || game.phase==="finished") return;
    if (game.phase==="choose") {schedulePendingMove();return}
    if (game.phase!=="roll" || computerTimer!==null) return;
    const tokenGeneration=generation;
    computerTimer=setTimeout(()=>{
      computerTimer=null;
      if (isCurrent(tokenGeneration)&&game.turn==="cpu"&&game.phase==="roll") void rollDie("cpu");
    },reducedMotion?220:480);
  }

  function showVictory() {
    const won=game.result==="human";
    document.getElementById("win-title").textContent=won?"Tu as gagné ! 🎉":"L’ordinateur a gagné";
    document.getElementById("win-text").textContent=won?
      "Bravo ! Tes quatre pions ont rejoint le centre du plateau.":
      "Cette fois, l’ordinateur a terminé le premier. Prêt pour la revanche ?";
    if (typeof winDialog.showModal==="function") winDialog.showModal();
    else winDialog.setAttribute("open","");
  }

  function closeDialog(dialog) {
    if (dialog.open && typeof dialog.close==="function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function returnToColors() {
    if (game && game.phase!=="finished" && !window.confirm("Choisir une nouvelle couleur ? Ta partie actuelle reste enregistrée, tu pourras la reprendre.")) return;
    generation++;clearTimers();busy=false;movingToken=null;rulesPause=false;
    game=null;
    window.location.hash="choix-couleur";
    showScreen(false);updateResumeButton();
  }

  // UI events ---------------------------------------------------------------
  rollButton.addEventListener("click",()=>{void rollDie("human")});
  document.getElementById("start-game").addEventListener("click",startNewGame);
  resumeButton.addEventListener("click",resumeGame);
  document.getElementById("choose-again").addEventListener("click",returnToColors);
  document.getElementById("new-game").addEventListener("click",()=>{
    if (!window.confirm("Recommencer une partie avec les mêmes couleurs ?")) return;
    closeDialog(winDialog);
    startNewGame();
  });
  document.getElementById("show-rules").addEventListener("click",()=>{
    rulesPause=true;clearTimers();
    if (typeof rulesDialog.showModal==="function") rulesDialog.showModal();
    else rulesDialog.setAttribute("open","");
  });
  document.getElementById("close-rules").addEventListener("click",()=>closeDialog(rulesDialog));
  rulesDialog.addEventListener("close",()=>{
    rulesPause=false;
    if (game?.phase==="choose") schedulePendingMove();
    else maybeComputer();
  });
  document.getElementById("play-again").addEventListener("click",()=>{
    closeDialog(winDialog);startNewGame();
  });
  document.getElementById("change-color-after-win").addEventListener("click",()=>{
    closeDialog(winDialog);
    generation++;clearTimers();busy=false;game=null;
    window.location.hash="choix-couleur";showScreen(false);updateResumeButton();
  });
  for (const radio of colorRadios) radio.addEventListener("change",()=>{
    if (radio.checked) setColor(radio.value);
  });
  window.addEventListener("hashchange",()=>{
    const playing=window.location.hash==="#plateau";
    if (playing&&!game) {
      const restored=savedGame();
      if (restored&&restored.phase!=="finished") {game=restored;setColor(restored.playerColor);lastRoll=restored.die||1}
      else {game=makeGame(app.dataset.player||"blue");persist()}
    }
    if (!playing) {clearTimers();generation++;busy=false;movingToken=null}
    showScreen(playing);
    if (playing) {maybeComputer();if (game.phase==="choose")schedulePendingMove()}
    else updateResumeButton();
  });

  // Resume only stable snapshots; starting a new game is always an explicit act.
  try {
    const oldColor=localStorage.getItem(COLOR_KEY);
    if (validColor(oldColor)) setColor(oldColor);
  } catch {/* unavailable */}
  makeDieFaces();updateResumeButton();
  const hashIsGame=window.location.hash==="#plateau";
  if (hashIsGame) {
    const restored=savedGame();
    game=restored?.phase!=="finished"&&restored?restored:makeGame(app.dataset.player||"blue");
    setColor(game.playerColor);
    lastRoll=game.die||1;
  }
  showScreen(hashIsGame);
  if (hashIsGame) {maybeComputer();if (game.phase==="choose")schedulePendingMove()}

  // Expose only pure game helpers for optional local tests; never player secrets.
  if (new URLSearchParams(window.location.search).has("test")) {
    window.LudoSoloTest={COLORS,CPU_COLOR,TRACK,LANES,SPAWNS,SAFE_KEYS,FINAL,
      coordinate,validMoves,makeGame,getRoll,locationKey,save:()=>game,
      assign:(value)=>{if(gameIsValid(value)){game=value;render()}},
      setRoller:(value)=>{ /* test helper that does not affect production randomness */
        if (Number.isInteger(value)&&value>=1&&value<=6) {lastRoll=value;render()}
      },
      startNewGame,rollDie,movePiece
    };
  }
})();
