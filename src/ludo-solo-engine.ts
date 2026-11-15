import {SAFE} from "./ludo-visuals";

export const SOLO_TURN_MS=15000;
export type SoloSeat=0|1;
export type SoloGame={
 positions:[number[],number[]];
 turn:SoloSeat;
 dice:number|null;
 streak:number;
 status:"playing"|"won";
 winner:SoloSeat|null;
 lastAction:string;
 updatedAt:number;
};
export type SoloMove={
 seat:SoloSeat;
 pawn:number;
 from:number;
 to:number;
 captured:{seat:SoloSeat;pawn:number;from:number}[];
};
export const freshSoloGame=():SoloGame=>({
 positions:[[-1,-1,-1,-1],[-1,-1,-1,-1]],
 turn:0,dice:null,streak:0,status:"playing",winner:null,
 lastAction:"À toi de commencer ! Lance le dé.",updatedAt:Date.now()
});
export function isSoloGame(value:unknown):value is SoloGame{
 if(!value||typeof value!=="object")return false;
 const v=value as Partial<SoloGame>;
 return Array.isArray(v.positions)&&v.positions.length===2&&v.positions.every(row=>
  Array.isArray(row)&&row.length===4&&row.every(n=>Number.isInteger(n)&&n>=-1&&n<=57))
  &&(v.turn===0||v.turn===1)&&(v.dice===null||(Number.isInteger(v.dice)&&Number(v.dice)>=1&&Number(v.dice)<=6))
  &&Number.isInteger(v.streak)&&Number(v.streak)>=0&&Number(v.streak)<=2
  &&(v.status==="playing"||v.status==="won")
  &&(v.winner===null||v.winner===0||v.winner===1)
  &&typeof v.lastAction==="string"&&v.lastAction.length<=180
  &&(v.updatedAt===undefined||(Number.isFinite(v.updatedAt)&&Number(v.updatedAt)>0));
}
export function shouldAutoPlaySolo(game:SoloGame,now:number):boolean{
 return game.status==="playing"&&game.turn===0&&now>=game.updatedAt+SOLO_TURN_MS;
}
export function canSoloMove(progress:number,die:number|null):boolean{
 return die!==null&&(progress===-1?die===6:progress>=0&&progress<57&&progress+die<=57);
}
export function availableSoloPawns(game:SoloGame,seat:SoloSeat):number[]{
 return game.positions[seat].flatMap((progress,pawn)=>canSoloMove(progress,game.dice)?[pawn]:[]);
}
export function rollSolo(game:SoloGame,face:number):SoloGame{
 if(game.status!=="playing"||game.dice!==null||!Number.isInteger(face)||face<1||face>6)return game;
 const seat=game.turn;
 const who=seat===0?"Tu as":"L’ordinateur a";
 if(face===6&&game.streak===2){
  return {...game,turn:(1-seat) as SoloSeat,streak:0,dice:null,updatedAt:Date.now(),lastAction:who+" obtenu trois 6 : tour perdu."};
 }
 const streak=face===6?game.streak+1:0;
 const canPlay=game.positions[seat].some(progress=>canSoloMove(progress,face));
 // An unusable throw immediately passes the turn, including an unusable six.
 const nextTurn:SoloSeat=canPlay?seat:(1-seat) as SoloSeat;
 return {...game,dice:canPlay?face:null,turn:nextTurn,streak:nextTurn===seat?streak:0,updatedAt:Date.now(),
  lastAction:who+" lancé un "+face+(canPlay?". Choisis un pion.":" : aucun déplacement possible.")};
}
export function moveSolo(game:SoloGame,pawn:number):{game:SoloGame;move:SoloMove}|null{
 if(game.status!=="playing"||!Number.isInteger(pawn)||pawn<0||pawn>3||game.dice===null)return null;
 const seat=game.turn,face=game.dice,from=game.positions[seat][pawn];
 if(!canSoloMove(from,face))return null;
 const to=from===-1?0:from+face;
 const positions:[number[],number[]]=[[...game.positions[0]],[...game.positions[1]]];
 positions[seat][pawn]=to;
 const other=(1-seat) as SoloSeat;
 const captured:SoloMove["captured"]=[];
 if(to<=50){
  const landing=(seat*26+to)%52;
  if(!SAFE.has(landing)){
   for(let i=0;i<4;i++){
    const progress=positions[other][i];
    if(progress>=0&&progress<=50&&(other*26+progress)%52===landing){
     captured.push({seat:other,pawn:i,from:progress});
     positions[other][i]=-1;
    }
   }
  }
 }
 const winner=positions[seat].every(progress=>progress===57)?seat:null;
 const bonus=face===6||captured.length>0||to===57;
 const nextSeat:SoloSeat=winner!==null?seat:bonus?seat:other;
 const who=seat===0?"Tu as":"L’ordinateur a";
 const lastAction=winner!==null?(seat===0?"🏆 Tu as gagné !":"🤖 L’ordinateur a gagné !"):
  who+" déplacé le pion "+(pawn+1)+(captured.length?" et capturé "+captured.length+" pion"+(captured.length>1?"s":"")+" !":"")+(to===57?" 🏠":"")+".";
 return {
  game:{...game,positions,turn:nextSeat,dice:null,streak:face===6?game.streak:0,
   status:winner!==null?"won":"playing",winner,lastAction,updatedAt:Date.now()},
  move:{seat,pawn,from,to,captured}
 };
}
/** The computer prefers winning, captures, safe squares and advancing its pawns. */
export function chooseSoloBotPawn(game:SoloGame):number|null{
 const seat=game.turn,die=game.dice;
 if(die===null)return null;
 const pawns=availableSoloPawns(game,seat);
 if(!pawns.length)return null;
 const evaluate=(pawn:number)=>{
  const from=game.positions[seat][pawn];
  const to=from===-1?0:from+die;
  if(to===57)return 10000;
  let score=to>=51?420+to*3:from===-1?175:to*2;
  if(to<=50){
   const land=(seat*26+to)%52;
   if(SAFE.has(land))score+=115;
   else{
    const other=(1-seat) as SoloSeat;
    const targets=game.positions[other].filter(p=>p>=0&&p<=50&&(other*26+p)%52===land).length;
    score+=targets*560;
    // Do not expose a pawn to an obvious capture if another move is safe.
    const danger=game.positions[other].some(p=>p>=0&&p<=50&&
     Array.from({length:6},(_,i)=>(other*26+p+i+1)%52).includes(land));
    if(danger)score-=90;
   }
  }
  // A small fixed tiebreaker avoids randomness in predictable tests.
  return score+((3-pawn)*0.001);
 };
 return pawns.sort((a,b)=>evaluate(b)-evaluate(a))[0];
}
/** Local solo play never talks to the partner's D1-backed game. */
export function soloDie():number{
 const bytes=new Uint8Array(1);
 if(typeof crypto!=="undefined"&&typeof crypto.getRandomValues==="function"){
  do{crypto.getRandomValues(bytes)}while(bytes[0]>=252);
  return bytes[0]%6+1;
 }
 return Math.floor(Math.random()*6)+1;
}
