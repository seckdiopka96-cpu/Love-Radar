import {BASE,HOME,SAFE,TRACK,type Point} from "./ludo-visuals";

/**
 * Ludo Sénégal — original implementation of the house rules described by
 * players: optional home entry, multiple laps, enemy home-lane raids,
 * one-square retreats on a six inside the enemy lane, and two-pawn
 * barricades that can only be jumped with a six (one square beyond).
 *
 * Track steps are unbounded lap counters, not classic 0..50 progression.
 * Outside the opponent's home lane all pawns travel FORWARD on the outer
 * track, including after a six. A six NEVER makes a track pawn turn around.
 */
export type Seat=0|1;
export type Zone="base"|"track"|"home"|"enemy"|"finished";
export type Pawn={zone:Zone;step:number;depth:number;gate:number;dir:1|-1};
export type Action="track"|"home"|"enemy"|"exit"|"jump";
export type MoveOption={pawn:number;action:Action;to:Pawn;label:string};
export type SenegalGame={
 positions:[Pawn[],Pawn[]];turn:Seat;dice:number|null;streak:number;
 status:"playing"|"won"|"ended";winner:Seat|null;updatedAt:number;lastAction:string;
};
export type Capture={seat:Seat;pawn:number;from:Pawn};
export type SenegalMove={seat:Seat;pawn:number;action:Action;from:Pawn;to:Pawn;captures:Capture[];path:Point[]};
export const TURN_MS=15000;
export const MAX_STEPS=520;
export const freshPawn=():Pawn=>({zone:"base",step:-1,depth:0,gate:0,dir:1});
const other=(seat:Seat):Seat=>(1-seat) as Seat;
const mod=(n:number,m:number)=>((n%m)+m)%m;
const homePoint=(owner:Seat,depth:number):Point=>HOME[owner][depth-1]||[7,7];
export const trackIndex=(seat:Seat,step:number)=>mod(seat*26+step,52);
export const pointForPawn=(seat:Seat,index:number,pawn:Pawn):Point=>{
 if(pawn.zone==="base")return BASE[seat][index];
 if(pawn.zone==="finished")return [7,7];
 if(pawn.zone==="track")return TRACK[trackIndex(seat,pawn.step)];
 if(pawn.zone==="home")return homePoint(seat,pawn.depth);
 return homePoint(other(seat),pawn.depth);
};
export function newSenegalGame():SenegalGame{
 return {positions:[[0,1,2,3].map(()=>freshPawn()),[0,1,2,3].map(()=>freshPawn())],
  turn:0,dice:null,streak:0,status:"playing",winner:null,updatedAt:Date.now(),
  lastAction:"Ludo Sénégal 🇸🇳 : à toi de lancer le dé !"};
}
/** Quitting ends the match for both players without awarding a false victory.
 * The ended match stays ended on reconnect until a deliberate new game. */
export function stopSenegalGame(game:SenegalGame,playerName:string):SenegalGame{
 if(game.status!=="playing")return game;
 const name=playerName.trim().slice(0,25)||"Un joueur";
 return {...game,status:"ended",winner:null,dice:null,streak:0,updatedAt:Date.now(),
  lastAction:name+" a arrêté la partie."};
}
/** Repair past games that used the accidental reverse-track rule.
 * Already-started pawns retain the number of squares travelled, but use
 * forward-only progress from now on. Only the invalid gate -1 home shortcut
 * resets a previously claimed victory. */
export function repairSenegalHomeShortcut(game:SenegalGame):SenegalGame{
 let changed=false,invalidHome=false;
 const positions=game.positions.map(row=>row.map(piece=>{
  if((piece.zone==="home"||piece.zone==="finished")&&piece.gate===-1){
   changed=true;invalidHome=true;
   return {...piece,zone:"track" as const,step:Math.abs(piece.step),
    depth:0,gate:0,dir:1 as const};
  }
  if(piece.zone==="track"&&(piece.dir===-1||piece.step<0)){
   changed=true;
   return {...piece,step:Math.abs(piece.step),dir:1 as const,depth:0,gate:0};
  }
  if(piece.zone==="enemy"&&(piece.dir===-1||piece.gate<0)){
   changed=true;
   const gate=77+52*Math.max(0,Math.round((Math.abs(piece.gate)-77)/52));
   return {...piece,gate,step:gate+piece.depth-1,dir:1 as const};
  }
  if(piece.zone==="home"&&piece.dir===-1){
   changed=true;
   return {...piece,step:50+piece.depth,gate:51,dir:1 as const};
  }
  if(piece.zone==="finished"&&piece.dir===-1){
   changed=true;
   return {...piece,step:57,gate:51,dir:1 as const};
  }
  return piece;
 })) as [Pawn[],Pawn[]];
 if(!changed)return game;
 return {...game,positions,
  status:invalidHome&&game.status==="won"?"playing":game.status,
  winner:invalidHome?null:game.winner,
  dice:null,streak:0,updatedAt:Date.now(),
  lastAction:"Direction corrigée : les pions avancent normalement vers l’avant."};
}
function validPawn(p:unknown):p is Pawn{
 if(!p||typeof p!=="object")return false;
 const x=p as Partial<Pawn>;
 return (x.zone==="base"||x.zone==="track"||x.zone==="home"||x.zone==="enemy"||x.zone==="finished")
  &&Number.isInteger(x.step)&&Number(x.step)>=-MAX_STEPS&&Number(x.step)<=MAX_STEPS
  &&Number.isInteger(x.depth)&&Number(x.depth)>=0&&Number(x.depth)<=7
  &&Number.isInteger(x.gate)&&Number(x.gate)>=-MAX_STEPS&&Number(x.gate)<=MAX_STEPS
  &&(x.dir===1||x.dir===-1);
}
export function isSenegalGame(v:unknown):v is SenegalGame{
 if(!v||typeof v!=="object")return false;
 const x=v as Partial<SenegalGame>;
 return Array.isArray(x.positions)&&x.positions.length===2&&x.positions.every(row=>
  Array.isArray(row)&&row.length===4&&row.every(validPawn))
  &&(x.turn===0||x.turn===1)
  &&(x.dice===null||(Number.isInteger(x.dice)&&Number(x.dice)>=1&&Number(x.dice)<=6))
  &&Number.isInteger(x.streak)&&Number(x.streak)>=0&&Number(x.streak)<=2
  &&(x.status==="playing"||x.status==="won"||x.status==="ended")
  &&(x.winner===null||x.winner===0||x.winner===1)
  &&typeof x.lastAction==="string"&&x.lastAction.length<=250
  &&Number.isFinite(x.updatedAt)&&Number(x.updatedAt)>0;
}
/** The first home-lane square is at 51+52k; enemy's is at 77+52k. */
function gatesBetween(start:number,end:number,base:number,dir:1|-1):number[]{
 const lo=Math.min(start,end),hi=Math.max(start,end),gates:number[]=[];
 for(let k=-12;k<=12;k++){
  const gate=base+52*k;
  if(dir===1?gate>start&&gate<=end:gate<start&&gate>=end)gates.push(gate);
 }
 return gates.sort((a,b)=>dir*(a-b));
}
function laneOption(pawn:number,from:Pawn,dest:number,dir:1|-1,gate:number,zone:"home"|"enemy"):MoveOption|null{
 const depth=1+dir*(dest-gate);
 if(depth<1||depth>(zone==="home"?7:6))return null;
 const to:Pawn={zone:zone==="home"&&depth===7?"finished":zone,
  step:dest,depth,gate,dir};
 return {pawn,action:zone,to,label:zone==="home"?"🏠 Entrer chez moi":"😈 Attaquer la cage adverse"};
}
type RouteCell={kind:"track";step:number}|{kind:"lane";owner:Seat;depth:number};
const routeKey=(seat:Seat,cell:RouteCell)=>cell.kind==="track"
 ?"track:"+trackIndex(seat,cell.step):"lane:"+cell.owner+":"+cell.depth;
/** A pair of pieces on the SAME square blocks the opponent, including
 * the home lane when it is being raided. */
function opponentBarricades(game:SenegalGame,seat:Seat):Set<string>{
 const enemy=other(seat),counts=new Map<string,number>();
 for(const piece of game.positions[enemy]){
  let key:string|null=null;
  if(piece.zone==="track")key="track:"+trackIndex(enemy,piece.step);
  else if(piece.zone==="home")key="lane:"+enemy+":"+piece.depth;
  else if(piece.zone==="enemy")key="lane:"+seat+":"+piece.depth;
  if(key)counts.set(key,(counts.get(key)||0)+1);
 }
 return new Set([...counts].filter(([,count])=>count>=2).map(([key])=>key));
}
function guardedOptions(game:SenegalGame,seat:Seat,pawn:number,from:Pawn,roll:number,
 options:MoveOption[]):MoveOption[]{
 const barricades=opponentBarricades(game,seat);
 if(!barricades.size)return options;
 const result:MoveOption[]=[],jumpKeys=new Set<string>();
 for(const option of options){
  const to=option.to,dir=to.dir;
  const route:RouteCell[]=[];
  if(from.zone==="base"){
   if(to.zone==="track")route.push({kind:"track",step:to.step});
  }else if(from.zone==="track"){
   if(to.zone==="track"){
    for(let step=from.step+dir;dir*(step-to.step)<=0;step+=dir)route.push({kind:"track",step});
   }else{
    for(let step=from.step+dir;dir*(step-to.gate)<=0;step+=dir)route.push({kind:"track",step});
    const owner=to.zone==="enemy"?other(seat):seat;
    for(let depth=1;depth<=to.depth;depth++)route.push({kind:"lane",owner,depth});
   }
  }else if(from.zone==="home"){
   for(let depth=from.depth+1;depth<=to.depth;depth++)route.push({kind:"lane",owner:seat,depth});
  }else if(from.zone==="enemy"){
   if(option.action==="exit"){
    if(to.zone==="track"){
     route.push({kind:"track",step:from.gate});
     route.push({kind:"track",step:to.step});
    }else route.push({kind:"lane",owner:other(seat),depth:to.depth});
   }else{
    for(let depth=from.depth+1;depth<=to.depth;depth++)route.push({kind:"lane",owner:other(seat),depth});
   }
  }
  const blocked=route.find(cell=>barricades.has(routeKey(seat,cell)));
  if(!blocked){result.push(option);continue;}
  if(roll!==6||!(from.zone==="track"||from.zone==="home"||from.zone==="base"))continue;
  let landing:Pawn|null=null;
  if(blocked.kind==="track"){
   const step=blocked.step+dir;
   if(step>=-MAX_STEPS&&step<=MAX_STEPS)landing={zone:"track",step,depth:0,gate:0,dir};
  }else if(to.zone!=="track"){
   const depth=blocked.depth+1,own=blocked.owner===seat;
   if(depth<=(own?7:6)){
    const gate=from.zone==="home"?from.gate:to.gate;
    landing={zone:own&&depth===7?"finished":own?"home":"enemy",
     step:gate+dir*(depth-1),depth,gate,dir};
   }
  }
  if(!landing)continue;
  const target:RouteCell=landing.zone==="track"
   ?{kind:"track",step:landing.step}
   :{kind:"lane",owner:landing.zone==="enemy"?other(seat):seat,depth:landing.depth};
  if(barricades.has(routeKey(seat,target)))continue;
  const id=[landing.zone,landing.step,landing.depth,landing.gate,landing.dir].join(":");
  if(jumpKeys.has(id))continue;
  jumpKeys.add(id);
  result.push({pawn,action:"jump",to:landing,label:"⤴️ 6 : sauter le barrage (une case après)"});
 }
 return result;
}
export function movesForPawn(game:SenegalGame,seat:Seat,pawn:number):MoveOption[]{
 if(game.status!=="playing"||game.turn!==seat||game.dice===null||pawn<0||pawn>3)return [];
 const roll=game.dice,from=game.positions[seat][pawn];
 if(from.zone==="finished")return [];
 if(from.zone==="base")return guardedOptions(game,seat,pawn,from,roll,
  roll===6?[{pawn,action:"track",to:{zone:"track",step:0,depth:0,gate:0,dir:1},label:"Sortir de la base"}]:[]);
 if(from.zone==="home"){
  const depth=from.depth+roll;
  if(depth>7)return [];
  return guardedOptions(game,seat,pawn,from,roll,
   [{pawn,action:"home",to:{...from,depth,zone:depth===7?"finished":"home"},label:depth===7?"🏆 Arriver au centre":"Avancer vers le centre"}]);
 }
 if(from.zone==="enemy"){
  if(roll===6){
   // One 6 = exactly ONE square backwards inside the opponent's lane.
   // At depth 1 it crosses the gate to the preceding track square;
   // subsequent rolls move forwards normally, not a forced reverse route.
   const depth=from.depth-1;
   const to:Pawn=depth>=1?
    {...from,zone:"enemy",depth,step:from.gate+(depth-1),dir:1}:
    {zone:"track",step:from.gate-1,depth:0,gate:0,dir:1};
   if(to.step< -MAX_STEPS||to.step>MAX_STEPS)return [];
   return guardedOptions(game,seat,pawn,from,roll,[{pawn,action:"exit",to,
    label:depth>=1?"↩️ 6 : reculer d’une seule case":"↩️ 6 : sortir de la cage"}]);
  }
  if(from.depth+roll>6)return [];
  return guardedOptions(game,seat,pawn,from,roll,
   [{pawn,action:"enemy",to:{...from,depth:from.depth+roll},label:"😈 Avancer dans la cage adverse"}]);
 }
 // The normal Senegalese track ALWAYS moves forward from each player's
 // colored start. Only the opponent's lane has the one-square backward six.
 const options:MoveOption[]=[];
 const dest=from.step+roll;
 if(dest>MAX_STEPS)return [];
 options.push({pawn,action:"track",to:{zone:"track",step:dest,depth:0,gate:0,dir:1},
  label:"➡️ Continuer vers l’avant"});
 // Own home can only be entered on completing a full forward lap.
 // The outer circuit can instead be repeated as many times as desired.
 for(const gate of gatesBetween(from.step,dest,51,1)){
  if(gate<51)continue;
  const own=laneOption(pawn,from,dest,1,gate,"home");
  if(own)options.push(own);
 }
 // Opponent-lane raids are a distinct optional choice, not a U-turn.
 for(const gate of gatesBetween(from.step,dest,77,1)){
  const raid=laneOption(pawn,from,dest,1,gate,"enemy");
  if(raid)options.push(raid);
 }
 return guardedOptions(game,seat,pawn,from,roll,options);
}
export function movesForSeat(game:SenegalGame,seat:Seat):MoveOption[]{
 return game.positions[seat].flatMap((_,i)=>movesForPawn(game,seat,i));
}
export function rollSenegal(game:SenegalGame,face:number):SenegalGame{
 if(game.status!=="playing"||game.dice!==null||!Number.isInteger(face)||face<1||face>6)return game;
 const seat=game.turn;
 if(face===6&&game.streak>=2){
  return {...game,turn:other(seat),dice:null,streak:0,updatedAt:Date.now(),lastAction:"Troisième 6 : le tour passe."};
 }
 const staged={...game,dice:face,streak:face===6?game.streak+1:0,updatedAt:Date.now()};
 const canPlay=movesForSeat(staged,seat).length>0;
 if(!canPlay)return {...staged,dice:null,turn:other(seat),streak:0,lastAction:"Dé "+face+" : aucun déplacement, tour passé automatiquement."};
 return {...staged,lastAction:"Dé "+face+" : choisis un pion ou une direction."};
}
/** Actual cells crossed: one-square enemy-lane retreats and barricade hops
 * never animate a pawn walking across the occupied barricade square. */
export function movementPath(seat:Seat,from:Pawn,to:Pawn,action:Action):Point[]{
 const path:Point[]=[];
 if(from.zone==="base")return [pointForPawn(seat,0,to)];
 if(from.zone==="home"){
  for(let d=from.depth+1;d<=to.depth;d++){
   if(action==="jump"&&d===to.depth-1)continue;
   path.push(homePoint(seat,d));
  }
  return path;
 }
 if(from.zone==="enemy"){
  if(action==="exit")return [pointForPawn(seat,0,to)];
  for(let d=from.depth+1;d<=to.depth;d++)path.push(homePoint(other(seat),d));
  return path;
 }
 const dir=to.dir;
 if(to.zone==="track"){
  for(let s=from.step+dir;dir*(s-to.step)<=0;s+=dir){
   if(action==="jump"&&s===to.step-dir)continue;
   path.push(TRACK[trackIndex(seat,s)]);
  }
  return path;
 }
 for(let s=from.step+dir;dir*(s-to.gate)<0;s+=dir)path.push(TRACK[trackIndex(seat,s)]);
 for(let d=1;d<=to.depth;d++){
  if(action==="jump"&&d===to.depth-1)continue;
  path.push(homePoint(to.zone==="enemy"?other(seat):seat,d));
 }
 return path;
}
function captureTargets(positions:[Pawn[],Pawn[]],seat:Seat,to:Pawn):Capture[]{
 const enemy=other(seat),captured:Capture[]=[];
 for(let pawn=0;pawn<4;pawn++){
  const target=positions[enemy][pawn];
  let caught=false;
  if(to.zone==="track"&&target.zone==="track"){
   const square=trackIndex(seat,to.step);
   caught=!SAFE.has(square)&&square===trackIndex(enemy,target.step);
  }
  if(to.zone==="enemy"&&target.zone==="home")caught=to.depth===target.depth;
  if(to.zone==="home"&&target.zone==="enemy")caught=to.depth===target.depth;
  if(caught){
   captured.push({seat:enemy,pawn,from:target});
   positions[enemy][pawn]=freshPawn();
  }
 }
 return captured;
}
export function applySenegalMove(game:SenegalGame,option:MoveOption):{game:SenegalGame;move:SenegalMove}|null{
 if(game.status!=="playing"||game.dice===null)return null;
 const seat=game.turn;
 const legal=movesForPawn(game,seat,option.pawn).find(x=>x.action===option.action&&
  x.to.step===option.to.step&&x.to.depth===option.to.depth&&x.to.gate===option.to.gate);
 if(!legal)return null;
 const from=game.positions[seat][option.pawn];
 const positions:[Pawn[],Pawn[]]=[[...game.positions[0]],[...game.positions[1]]];
 positions[seat][option.pawn]=legal.to;
 const captures=captureTargets(positions,seat,legal.to);
 const winner=positions[seat].every(p=>p.zone==="finished")?seat:null;
 const bonus=game.dice===6||captures.length>0||legal.to.zone==="finished";
 const nextTurn=winner!==null||bonus?seat:other(seat);
 const description=legal.action==="enemy"?"attaque la cage adverse 😈":
  legal.action==="exit"?(legal.to.zone==="track"?"sort de la cage adverse après un pas de recul ↩️":"recule d’une case dans la cage adverse ↩️"):
  legal.action==="jump"?"saute un barrage et s’arrête une case après ⤴️":
  legal.action==="home"?"entre dans sa cage 🏠":"avance sur le plateau";
 return {game:{...game,positions,turn:nextTurn,dice:null,streak:game.dice===6?game.streak:0,
   status:winner!==null?"won":"playing",winner,updatedAt:Date.now(),
   lastAction:winner!==null?"🏆 Victoire au Ludo Sénégal !":
    (seat===0?"Rouge":"Jaune")+" "+description+(captures.length?" · "+captures.length+" pion(s) capturé(s) !":"")},
  move:{seat,pawn:option.pawn,action:option.action,from,to:legal.to,captures,path:movementPath(seat,from,legal.to,legal.action)}
 };
}
export function chooseSenegalBotMove(game:SenegalGame):MoveOption|null{
 const options=movesForSeat(game,game.turn);
 if(!options.length)return null;
 const seat=game.turn,enemy=other(seat);
 const enemyHomePawns=game.positions[enemy].filter(p=>p.zone==="home");
 const score=(option:MoveOption)=>{
  const to=option.to;
  // Entering an EMPTY enemy lane traps this pawn until another six.
  // A human may still choose the risky move, but the computer must not
  // sacrifice a pawn for nothing (including during Duo inactivity turns).
  if(option.action==="enemy"&&game.positions[seat][option.pawn].zone==="track"&&enemyHomePawns.length===0){
   return Number.NEGATIVE_INFINITY;
  }
  let s=to.zone==="finished"?20000:to.zone==="home"?2000+to.depth*60:to.zone==="enemy"?260:to.zone==="track"?to.step:0;
  if(option.action==="exit")s+=400;
  if(option.action==="jump")s+=525;
  if(option.action==="enemy"&&to.zone==="enemy"){
   s+=enemyHomePawns.length*275;
  }
  const probe:[Pawn[],Pawn[]]=[[...game.positions[0]],[...game.positions[1]]];
  s+=captureTargets(probe,seat,to).length*1800;
  if(to.zone==="track"&&SAFE.has(trackIndex(seat,to.step)))s+=60;
  return s;
 };
 return options.sort((a,b)=>score(b)-score(a)||a.pawn-b.pawn)[0];
}
export function die():number{
 const b=new Uint8Array(1);
 if(typeof crypto!=="undefined"&&typeof crypto.getRandomValues==="function"){
  do{crypto.getRandomValues(b)}while(b[0]>=252);
  return b[0]%6+1;
 }
 return Math.floor(Math.random()*6)+1;
}
/** Complete a single absent player's turn; automatic bonus throws are included. */
export function autoplayTurn(game:SenegalGame):{game:SenegalGame;move:SenegalMove|null}{
 if(game.status!=="playing")return {game,move:null};
 let current=game,move:SenegalMove|null=null,seat=game.turn;
 for(let n=0;n<20&&current.status==="playing"&&current.turn===seat;n++){
  if(current.dice===null)current=rollSenegal(current,die());
  if(current.turn!==seat)break;
  if(current.dice!==null){
   const choice=chooseSenegalBotMove(current);
   if(!choice)break;
   const applied=applySenegalMove(current,choice);
   if(!applied)break;
   current=applied.game;move=applied.move;
  }
 }
 // Avoid a bot monopolizing the game on improbable chains of bonus throws.
 if(current.status==="playing"&&current.turn===seat){
  current={...current,turn:other(seat),dice:null,streak:0,updatedAt:Date.now()};
 }
 return {game:{...current,lastAction:"🤖 L’ordinateur a joué automatiquement. "+current.lastAction},move};
}
