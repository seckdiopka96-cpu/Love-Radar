import {BASE,HOME,SAFE,TRACK,type Point} from "./ludo-visuals";

/**
 * Ludo Sénégal — original implementation of the house rules described by
 * players: optional home entry, multiple laps, enemy home-lane raids, and a
 * a six to leave the enemy's lane and continue forward on the track.
 *
 * Track steps are unbounded lap counters, not classic 0..50 progression.
 * A pawn retains its track progress and direction while raiding a lane,
 * so leaving it never forces a reverse route through the same squares.
 */
export type Seat=0|1;
export type Zone="base"|"track"|"home"|"enemy"|"finished";
export type Pawn={zone:Zone;step:number;depth:number;gate:number;dir:1|-1};
export type Action="track"|"home"|"enemy"|"exit"|"turn";
export type MoveOption={pawn:number;action:Action;to:Pawn;label:string};
export type SenegalGame={
 positions:[Pawn[],Pawn[]];turn:Seat;dice:number|null;streak:number;
 status:"playing"|"won";winner:Seat|null;updatedAt:number;lastAction:string;
};
export type Capture={seat:Seat;pawn:number;from:Pawn};
export type SenegalMove={seat:Seat;pawn:number;action:Action;from:Pawn;to:Pawn;captures:Capture[];path:Point[]};
export const TURN_MS=15000;
export const MAX_STEPS=520;
export const freshPawn=():Pawn=>({zone:"base",step:-1,depth:0,gate:0,dir:1});
const other=(seat:Seat):Seat=>(1-seat) as Seat;
const mod=(n:number,m:number)=>((n%m)+m)%m;
export const trackIndex=(seat:Seat,step:number)=>mod(seat*26+step,52);
export const pointForPawn=(seat:Seat,index:number,pawn:Pawn):Point=>{
 if(pawn.zone==="base")return BASE[seat][index];
 if(pawn.zone==="finished")return [7,7];
 if(pawn.zone==="track")return TRACK[trackIndex(seat,pawn.step)];
 if(pawn.zone==="home")return HOME[seat][pawn.depth-1];
 return HOME[other(seat)][pawn.depth-1];
};
export function newSenegalGame():SenegalGame{
 return {positions:[[0,1,2,3].map(()=>freshPawn()),[0,1,2,3].map(()=>freshPawn())],
  turn:0,dice:null,streak:0,status:"playing",winner:null,updatedAt:Date.now(),
  lastAction:"Ludo Sénégal 🇸🇳 : à toi de lancer le dé !"};
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
  &&(x.status==="playing"||x.status==="won")
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
export function movesForPawn(game:SenegalGame,seat:Seat,pawn:number):MoveOption[]{
 if(game.status!=="playing"||game.turn!==seat||game.dice===null||pawn<0||pawn>3)return [];
 const roll=game.dice,from=game.positions[seat][pawn];
 if(from.zone==="finished")return [];
 if(from.zone==="base")return roll===6?[{pawn,action:"track",to:{zone:"track",step:0,depth:0,gate:0,dir:1},label:"Sortir de la base"}]:[];
 if(from.zone==="home"){
  const depth=from.depth+roll;
  if(depth>7)return [];
  return [{pawn,action:"home",to:{...from,depth,zone:depth===7?"finished":"home"},label:depth===7?"🏆 Arriver au centre":"Avancer vers le centre"}];
 }
 if(from.zone==="enemy"){
  if(roll===6){
   // Resume from the last track progress, then advance six forward.
   // Never walk the enemy lane in reverse or flip the pawn's direction.
   const target=from.step+from.dir*roll;
   if(target< -MAX_STEPS||target>MAX_STEPS)return [];
   return [{pawn,action:"exit",
    to:{zone:"track",step:target,depth:0,gate:0,dir:from.dir},
    label:"➡️ 6 : sortir de la cage et continuer"}];
  }
  if(from.depth+roll>6)return [];
  return [{pawn,action:"enemy",to:{...from,depth:from.depth+roll},label:"😈 Avancer dans la cage adverse"}];
 }
 const options:MoveOption[]=[];
 function addDirection(dir:1|-1,action:Action){
  const dest=from.step+dir*roll;
  if(dest< -MAX_STEPS||dest>MAX_STEPS)return;
  options.push({pawn,action,to:{zone:"track",step:dest,depth:0,gate:0,dir},
   label:action==="turn"?"🔄 Faire demi-tour (6)":"🔁 Continuer le tour"});
  // At each own entrance the player chooses between home and another lap.
  // The opponent's entrance allows a deliberate home-lane raid.
  for(const gate of gatesBetween(from.step,dest,51,dir)){
   const own=laneOption(pawn,from,dest,dir,gate,"home");
   if(own)options.push(own);
  }
  for(const gate of gatesBetween(from.step,dest,77,dir)){
   const raid=laneOption(pawn,from,dest,dir,gate,"enemy");
   if(raid)options.push(raid);
  }
 }
 addDirection(from.dir,"track");
 // A six is required for EVERY fresh U-turn (not just the one in enemy lane).
 if(roll===6)addDirection(from.dir===1?-1:1,"turn");
 return options;
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
/** Produces the actual cells crossed, including backward travel in enemy lanes. */
export function movementPath(seat:Seat,from:Pawn,to:Pawn,action:Action):Point[]{
 const path:Point[]=[];
 if(from.zone==="base")return [pointForPawn(seat,0,to)];
 if(from.zone==="home"){
  for(let d=from.depth+1;d<=to.depth;d++)path.push(d===7?[7,7]:HOME[seat][d-1]);
  return path;
 }
 if(from.zone==="enemy"){
  if(action==="exit"){
   // One visible transition back onto the track at the pawn's saved progress,
   // then exactly six forward steps. No backwards path through the cage.
   path.push(TRACK[trackIndex(seat,from.step)]);
   for(let s=from.step+from.dir;s!==to.step+from.dir;s+=from.dir){
    path.push(TRACK[trackIndex(seat,s)]);
   }
  }else{
   for(let d=from.depth+1;d<=to.depth;d++)path.push(HOME[other(seat)][d-1]);
  }
  return path;
 }
 const dir=action==="turn"?(from.dir===1?-1:1):from.dir;
 if(to.zone==="track"){
  for(let s=from.step+dir;s!==to.step+dir;s+=dir)path.push(TRACK[trackIndex(seat,s)]);
  return path;
 }
 for(let s=from.step+dir;dir*(s-to.gate)<0;s+=dir)path.push(TRACK[trackIndex(seat,s)]);
 for(let d=1;d<=to.depth;d++)path.push(to.zone==="finished"&&d===7?[7,7]:HOME[to.zone==="enemy"?other(seat):seat][d-1]);
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
 const description=legal.action==="enemy"?"attaque la cage adverse 😈":legal.action==="exit"?"sort de la cage adverse et continue avec un 6 ➡️":
  legal.action==="home"?"entre dans sa cage 🏠":legal.action==="turn"?"fait demi-tour 🔄":"avance sur le plateau";
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
  if(option.action==="turn")s-=150;
  if(option.action==="exit")s+=400;
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
