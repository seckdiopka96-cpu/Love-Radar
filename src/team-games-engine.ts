import {RAPID_QUESTIONS,RAPID_SECONDS} from "./couple-party-engine";
import {SAFE,TRACK} from "./ludo-visuals";

/** An invited couple forms one team. Seat order alternates teams:
 * host partner A, guest partner A, host partner B, guest partner B.
 * Each human has their own color and four pawns. Only the shared match
 * accesses these four identities; private two-member rooms stay isolated. */
export type TeamSeat=0|1|2|3;
export type TeamId=0|1;
export type TeamKind="classic"|"senegal"|"quiz";
export const TEAM_TURN_MS=15000;
export type TeamStatus="waiting"|"playing"|"finished";
export type TeamPiece={zone:"base"|"track"|"home"|"enemy"|"finished";step:number;depth:number;gate:number;owner:TeamSeat};
export type TeamMove={pawn:number;action:"release"|"track"|"home"|"enemy"|"exit"|"jump";to:TeamPiece;captures:{seat:TeamSeat;pawn:number}[]};
export type TeamGame={
 kind:TeamKind;status:TeamStatus;winner:TeamId|null;winReason:"pieces"|"points"|"abandon"|null;
 positions:TeamPiece[][];turn:TeamSeat;dice:number|null;sixStreak:number;
 round:number;phase:"question"|"result"|null;questionIndex:number;answered:TeamSeat[];
 scores:[number,number];startsAt:number;deadlineAt:number;lastAction:string;updatedAt:number
};
export const TEAM_COLORS=["red","green","yellow","blue"] as const;
export const TEAM_BASE:[[number,number][],[number,number][],[number,number][],[number,number][]]=[
 [[1,1],[1,4],[4,1],[4,4]],[[1,10],[1,13],[4,10],[4,13]],
 [[10,10],[10,13],[13,10],[13,13]],[[10,1],[10,4],[13,1],[13,4]]
];
export const TEAM_HOME:[number,number][][]=[
 [[7,1],[7,2],[7,3],[7,4],[7,5]],
 [[1,7],[2,7],[3,7],[4,7],[5,7]],
 [[7,13],[7,12],[7,11],[7,10],[7,9]],
 [[13,7],[12,7],[11,7],[10,7],[9,7]]
];
const mod=(v:number,n:number)=>((v%n)+n)%n;
export const teamOf=(seat:TeamSeat):TeamId=>(seat%2) as TeamId;
export const freshPiece=(seat:TeamSeat):TeamPiece=>({zone:"base",step:-1,depth:0,gate:0,owner:seat});
/** Older Classic 2v2 builds mistakenly let track pieces pass their own
 * finishing entrance and circle endlessly. Preserve progress when possible,
 * without awarding an unearned central finish or resetting the match. */
export function repairTeamClassic(game:TeamGame):TeamGame{
 if(game.kind!=="classic")return game;
 let changed=false;
 const positions=game.positions.map((row,seat)=>row.map(piece=>{
  if(piece.zone!=="track"||piece.step<=50)return piece;
  changed=true;
  const depth=Math.min(5,Math.max(1,piece.step-50));
  return {...piece,zone:"home" as const,step:50+depth,depth,gate:51,owner:seat as TeamSeat};
 }));
 if(!changed)return game;
 return {...game,positions,lastAction:"Parcours Classique corrigé : le pion a rejoint son couloir d'arrivée."};
}
export function newTeamMatch(kind:TeamKind,status:TeamStatus="waiting",now=Date.now()):TeamGame{
 return {kind,status,winner:null,winReason:null,positions:([0,1,2,3] as TeamSeat[]).map(seat=>
  Array.from({length:4},()=>freshPiece(seat))),turn:0,dice:null,sixStreak:0,round:1,phase:kind==="quiz"?"question":null,
  questionIndex:Math.floor(now/997)%RAPID_QUESTIONS.length,answered:[],scores:[0,0],
  startsAt:status==="playing"&&kind==="quiz"?now+3000:0,
  deadlineAt:status==="playing"&&kind==="quiz"?now+3000+RAPID_SECONDS*1000:0,
  lastAction:"Deux couples, une équipe chacun. Premier à gagner !",updatedAt:now};
}
export function teamPiecePoint(seat:TeamSeat,pawn:number,p:TeamPiece):[number,number]{
 if(p.zone==="base")return TEAM_BASE[seat][pawn] as [number,number];
 if(p.zone==="finished")return [7,7];
 if(p.zone==="home")return TEAM_HOME[seat][Math.min(4,Math.max(0,p.depth-1))] as [number,number];
 if(p.zone==="enemy")return TEAM_HOME[p.owner][Math.min(4,Math.max(0,p.depth-1))] as [number,number];
 return TRACK[mod(seat*13+p.step,52)];
}
function square(seat:TeamSeat,p:TeamPiece):number|null{
 return p.zone==="track"?mod(seat*13+p.step,52):null;
}
function occupiedBarrage(game:TeamGame,seat:TeamSeat,squareNumber:number):boolean{
 const seen=new Map<number,number>();
 for(const player of [0,1,2,3] as TeamSeat[]){
  if(teamOf(player)===teamOf(seat))continue;
  for(const p of game.positions[player]){
   if(square(player,p)!==squareNumber)continue;
   seen.set(player,(seen.get(player)||0)+1);
   if((seen.get(player)||0)>=2)return true;
  }
 }
 return false;
}
function capturesAt(game:TeamGame,seat:TeamSeat,to:TeamPiece):{seat:TeamSeat;pawn:number}[]{
 const found:{seat:TeamSeat;pawn:number}[]=[];
 for(const other of [0,1,2,3] as TeamSeat[]){
  if(teamOf(other)===teamOf(seat))continue;
  for(let pawn=0;pawn<4;pawn++){
   const target=game.positions[other][pawn];
   if(target.zone==="base"||target.zone==="finished")continue;
   if(to.zone==="track"&&target.zone==="track"){
    const landing=square(seat,to);
    if(landing!==null&&!SAFE.has(landing)&&landing===square(other,target))found.push({seat:other,pawn});
   }else if(to.zone==="home"&&target.zone==="enemy"&&target.owner===seat&&to.depth===target.depth){
    found.push({seat:other,pawn});
   }else if(to.zone==="enemy"&&target.zone==="home"&&to.owner===other&&to.depth===target.depth){
    found.push({seat:other,pawn});
   }
  }
 }
 return found;
}
export function movesForTeamPawn(game:TeamGame,seat:TeamSeat,pawn:number):TeamMove[]{
 if(game.kind==="quiz"||game.status!=="playing"||game.turn!==seat||game.dice===null||pawn<0||pawn>3)return [];
 const from=game.positions[seat][pawn];if(!from)return [];
 const face=game.dice,choices:TeamMove[]=[];
 const offer=(action:TeamMove["action"],to:TeamPiece)=>{
  const landing=square(seat,to);
  if(landing!==null){
   const current=square(seat,from);
   // A two-pawn opponent stack is a true barrier; a six jumps just beyond
   // it (no remaining pips) and never captures the stack itself.
   if(game.kind==="senegal"&&current!==null){
    for(let i=1;i<=face;i++){
     if(!occupiedBarrage(game,seat,mod(current+i,52)))continue;
     if(face!==6)return;
     const hop={...from,zone:"track" as const,step:from.step+i+1,depth:0,gate:0,owner:seat};
     const hopSquare=square(seat,hop);
     if(hopSquare===null||occupiedBarrage(game,seat,hopSquare))return;
     choices.push({pawn,action:"jump",to:hop,captures:capturesAt(game,seat,hop)});
     return;
    }
   }
   if(game.kind==="senegal"&&occupiedBarrage(game,seat,landing))return;
  }
  choices.push({pawn,action,to,captures:capturesAt(game,seat,to)});
 };
 if(from.zone==="base"){
  if(face===6)offer("release",{zone:"track",step:0,depth:0,gate:0,owner:seat});
  return choices;
 }
 if(from.zone==="finished")return [];
 if(from.zone==="home"){
  const depth=from.depth+face;
  if(depth<=6)offer("home",{...from,zone:depth===6?"finished":"home",depth,step:from.gate+depth-1});
  return choices;
 }
 if(from.zone==="enemy"){
  if(face===6){
   if(from.depth===1)offer("exit",{zone:"track",step:from.gate-1,depth:0,gate:0,owner:seat});
   else offer("exit",{...from,step:from.gate+from.depth-2,depth:from.depth-1});
  }else if(from.depth+face<=5)offer("enemy",{...from,depth:from.depth+face,step:from.gate+from.depth+face-1});
  return choices;
 }
 const destination=from.step+face;
 if(destination>260)return [];
 // Classic must enter its own home corridor after one full circuit, not
 // run a second lap. Senegal intentionally keeps the optional forward lap.
 if(game.kind==="senegal"||destination<=50)
  offer("track",{zone:"track",step:destination,depth:0,gate:0,owner:seat});
 // Own finishing corridor begins at progress 51. Senegal can repeat laps;
 // Classic has exactly one finishing gate, and requires an exact die.
 for(let k=0;k<=(game.kind==="senegal"?4:0);k++){
  const gate=51+52*k;
  if(from.step<gate&&gate<=destination){
   const depth=destination-gate+1;
   if(depth>=1&&depth<=6)offer("home",{zone:depth===6?"finished":"home",step:destination,depth,gate,owner:seat});
  }
 }
 if(game.kind==="senegal"){
  for(const opponent of [0,1,2,3] as TeamSeat[]){
   if(teamOf(opponent)===teamOf(seat))continue;
   const relative=mod(opponent*13-seat*13-1,52);
   for(let k=1;k<=4;k++){
    const gate=relative+52*k;
    if(from.step<gate&&gate<=destination){
     const depth=destination-gate+1;
     if(depth>=1&&depth<=5)offer("enemy",{zone:"enemy",step:destination,depth,gate,owner:opponent});
    }
   }
  }
 }
 return choices;
}
export function teamLegalPawns(game:TeamGame,seat:TeamSeat):number[]{
 return [0,1,2,3].filter(p=>movesForTeamPawn(game,seat,p).length>0);
}
export function teamRoll(game:TeamGame,seat:TeamSeat,face:number,now=Date.now()):TeamGame{
 if(game.status!=="playing"||game.kind==="quiz"||game.turn!==seat||game.dice!==null||
   !Number.isInteger(face)||face<1||face>6)return game;
 if(face===6&&game.sixStreak>=2){
  return {...game,turn:((seat+1)%4) as TeamSeat,dice:null,sixStreak:0,updatedAt:now,
   lastAction:"Trois 6 de suite : le tour passe."};
 }
 const proposal={...game,dice:face,sixStreak:face===6?game.sixStreak+1:0,updatedAt:now};
 if(!teamLegalPawns(proposal,seat).length)
  return {...proposal,dice:null,turn:((seat+1)%4) as TeamSeat,sixStreak:0,lastAction:"Aucun pion ne peut avancer."};
 return {...proposal,lastAction:"Dé "+face+" : choisis un de tes pions."};
}
export function teamMove(game:TeamGame,seat:TeamSeat,pawn:number,action:TeamMove["action"],now=Date.now()):TeamGame|null{
 if(game.turn!==seat||game.dice===null)return null;
 const option=movesForTeamPawn(game,seat,pawn).find(o=>o.action===action);
 if(!option)return null;
 const positions=game.positions.map(row=>row.map(p=>({...p})));
 positions[seat][pawn]={...option.to};
 for(const x of option.captures)positions[x.seat][x.pawn]=freshPiece(x.seat);
 const team=teamOf(seat);
 const won=([0,1,2,3] as TeamSeat[]).filter(x=>teamOf(x)===team).every(x=>positions[x].every(p=>p.zone==="finished"));
 const extra=game.dice===6||option.captures.length>0||option.to.zone==="finished";
 return {...game,positions,winner:won?team:null,winReason:won?"pieces":null,
  status:won?"finished":"playing",turn:won||extra?seat:((seat+1)%4) as TeamSeat,
  dice:null,sixStreak:game.dice===6?game.sixStreak:0,updatedAt:now,
  lastAction:won?"🏆 Le couple "+(team+1)+" a gagné !":
   "Pion "+(pawn+1)+" déplacé."+(option.captures.length?" Capture !":"")};
}
/** A silent player must never block the other three indefinitely.
 * The server applies one guarded handoff after 15 s without any roll/move.
 * No dice is invented and no pawn is moved without an explicit choice. */
export function teamIdleTurn(game:TeamGame,now=Date.now()):TeamGame{
 if(game.kind==="quiz"||game.status!=="playing"||
   now<game.updatedAt+TEAM_TURN_MS)return game;
 const next=((game.turn+1)%4) as TeamSeat;
 return {...game,turn:next,dice:null,sixStreak:0,updatedAt:now,
  lastAction:"⏱️ 15 secondes sans action : tour passé au joueur suivant."};
}
export function teamQuizTick(game:TeamGame,now=Date.now()):TeamGame{
 if(game.kind!=="quiz"||game.status!=="playing")return game;
 if(game.phase==="question"&&now>=game.deadlineAt){
  return {...game,phase:"result",updatedAt:now,deadlineAt:now+1800,lastAction:"Le temps est écoulé."};
 }
 if(game.phase==="result"&&now>=game.deadlineAt){
  const index=(game.questionIndex+1+Math.floor(now/1000)%Math.max(1,RAPID_QUESTIONS.length-1))%RAPID_QUESTIONS.length;
  return {...game,phase:"question",round:game.round+1,questionIndex:index,answered:[],
   startsAt:now+1800,deadlineAt:now+1800+RAPID_SECONDS*1000,updatedAt:now,
   lastAction:"Nouvelle question !"};
 }
 return game;
}
export function teamQuizAnswer(game:TeamGame,seat:TeamSeat,choice:number,now=Date.now()):TeamGame|null{
 if(game.kind!=="quiz"||game.status!=="playing"||game.phase!=="question"||
   now<game.startsAt||now>=game.deadlineAt||game.answered.includes(seat)||
   !Number.isInteger(choice)||choice<0||choice>3)return null;
 const answered=[...game.answered,seat];
 const correct=RAPID_QUESTIONS[game.questionIndex]?.answer===choice;
 if(!correct&&answered.length<4)return {...game,answered,updatedAt:now};
 if(!correct)return {...game,answered,phase:"result",deadlineAt:now+1800,updatedAt:now,lastAction:"Aucune bonne réponse."};
 const team=teamOf(seat),scores=[...game.scores] as [number,number];scores[team]+=1;
 const won=scores[team]>=10;
 return {...game,answered,scores,phase:"result",deadlineAt:now+2400,updatedAt:now,
  winner:won?team:null,status:won?"finished":"playing",winReason:won?"points":null,
  lastAction:won?"🏆 Le couple "+(team+1)+" gagne avec 10 points !":"Bonne réponse ! +1 pour le couple "+(team+1)};
}
export function teamForfeit(game:TeamGame,loser:TeamId,now=Date.now()):TeamGame{
 return game.status!=="playing"?game:{...game,status:"finished",winner:(1-loser) as TeamId,
  winReason:"abandon",dice:null,updatedAt:now,lastAction:"Le couple "+(loser+1)+" a quitté le match."};
}
