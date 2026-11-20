import {teamPiecePoint,TEAM_BASE,type TeamGame,type TeamPiece,type TeamSeat} from "./team-games-engine";

export type TeamAnimationPin={seat:TeamSeat;pawn:number;point:[number,number]};
export type TeamBoardAnimation={
 mover:TeamAnimationPin;path:[number,number][];
 captures:TeamAnimationPin[];
};
const same=(a:TeamPiece,b:TeamPiece)=>a.zone===b.zone&&a.step===b.step&&a.depth===b.depth&&a.gate===b.gate&&a.owner===b.owner;
const point=(seat:TeamSeat,pawn:number,p:TeamPiece)=>teamPiecePoint(seat,pawn,p);
const make=(p:TeamPiece,zone:TeamPiece["zone"],step:number,depth:number):TeamPiece=>({...p,zone,step,depth});
/** A visual path only. The authoritative board and its rules NEVER change. */
export function teamVisualPath(seat:TeamSeat,pawn:number,from:TeamPiece,to:TeamPiece):[number,number][]{
 if(from.zone==="base")return [point(seat,pawn,to)];
 if(from.zone==="finished")return [];
 const path:[number,number][]=[];
 if(from.zone==="track"&&to.zone==="track"&&to.step>from.step){
  for(let step=from.step+1;step<=Math.min(to.step,from.step+6);step++)
   path.push(point(seat,pawn,make(from,"track",step,0)));
 }else if(from.zone==="track"&&(to.zone==="home"||to.zone==="enemy"||to.zone==="finished")){
  const gate=to.gate;
  for(let step=from.step+1;step<gate&&path.length<6;step++)
   path.push(point(seat,pawn,make(from,"track",step,0)));
  const zone=to.zone==="enemy"?"enemy":"home";
  for(let depth=1;depth<=to.depth&&path.length<6;depth++){
   const p={...to,zone:depth===6?"finished":zone,depth} as TeamPiece;
   path.push(point(seat,pawn,p));
  }
 }else if((from.zone==="home"||from.zone==="enemy")&&to.depth>from.depth){
  for(let depth=from.depth+1;depth<=to.depth&&path.length<6;depth++){
   const p={...to,zone:depth===6?"finished":to.zone,depth} as TeamPiece;
   path.push(point(seat,pawn,p));
  }
 }else path.push(point(seat,pawn,to));
 const destination=point(seat,pawn,to);
 if(!path.length||path.at(-1)?.join(",")!==destination.join(","))path.push(destination);
 return path;
}
/** Detect one legal move and any captured pawns from two verified snapshots.
 * A resync, migration, rematch, dice update or an unrelated score never
 * produces a fake movement/capture effect. */
export function teamBoardAnimation(before:TeamGame,after:TeamGame):TeamBoardAnimation|null{
 if(before.kind==="quiz"||after.kind!==before.kind||before.status!=="playing"||
    (before.matchNo||1)!==(after.matchNo||1))return null;
 const updates:{seat:TeamSeat;pawn:number;from:TeamPiece;to:TeamPiece}[]=[];
 for(let s=0;s<4;s++)for(let pawn=0;pawn<4;pawn++){
  const from=before.positions[s]?.[pawn],to=after.positions[s]?.[pawn];
  if(!from||!to)return null;
  if(!same(from,to))updates.push({seat:s as TeamSeat,pawn,from,to});
 }
 const captures=updates.filter(x=>x.from.zone!=="base"&&x.to.zone==="base");
 const movers=updates.filter(x=>x.to.zone!=="base");
 if(movers.length!==1||movers.length+captures.length!==updates.length)return null;
 const mover=movers[0];
 if(captures.some(x=>x.seat===mover.seat))return null;
 const path=teamVisualPath(mover.seat,mover.pawn,mover.from,mover.to);
 if(!path.length)return null;
 return {
  mover:{seat:mover.seat,pawn:mover.pawn,point:point(mover.seat,mover.pawn,mover.from)},
  path,
  captures:captures.map(x=>({seat:x.seat,pawn:x.pawn,point:point(x.seat,x.pawn,x.from)}))
 };
}
export function teamCaptureHome(seat:TeamSeat,pawn:number):[number,number]{
 return TEAM_BASE[seat][pawn] as [number,number];
}
