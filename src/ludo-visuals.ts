/** Pure geometry used by the rendered board and its movement effects. */
export type Point=[number,number];
export const TRACK:Point[]=[
 ...[1,2,3,4,5].map(c=>[6,c] as Point),
 ...[5,4,3,2,1,0].map(r=>[r,6] as Point),
 [0,7],
 ...[0,1,2,3,4,5].map(r=>[r,8] as Point),
 ...[9,10,11,12,13,14].map(c=>[6,c] as Point),
 [7,14],
 ...[14,13,12,11,10,9].map(c=>[8,c] as Point),
 ...[9,10,11,12,13,14].map(r=>[r,8] as Point),
 [14,7],
 ...[14,13,12,11,10,9].map(r=>[r,6] as Point),
 ...[5,4,3,2,1,0].map(c=>[8,c] as Point),
 [7,0],[6,0],
];
export const HOME:Point[][]=[
 [1,2,3,4,5,6].map(c=>[7,c] as Point),
 [13,12,11,10,9,8].map(c=>[7,c] as Point),
];
export const BASE:Point[][]=[
 [[1,1],[1,4],[4,1],[4,4]],
 [[10,10],[10,13],[13,10],[13,13]],
];
export const SAFE=new Set([0,8,13,21,26,34,39,47]);
export const CELL=Array.from({length:225},(_,i)=>[Math.floor(i/15),i%15] as Point);
export const key=(r:number,c:number)=>r+"-"+c;
/** -1=base, 0..50=outer ring, 51..56=home lane, 57=center. */
export function pointForProgress(seat:number,pawn:number,progress:number):Point{
 if(progress===-1)return BASE[seat][pawn];
 if(progress===57)return [7,7];
 if(progress>=0&&progress<=50)return TRACK[(seat*26+progress)%52];
 if(progress>=51&&progress<=56)return HOME[seat][progress-51];
 throw new Error("Invalid Ludo progress "+progress);
}
/** Every step includes the cell the moving pawn actually passes over. */
export function movementSteps(from:number,to:number):number[]{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from< -1||to>57||to<=from||to-from>6)return [];
 const route:number[]=[];
 for(let step=Math.max(0,from+1);step<=to;step++)route.push(step);
 return route;
}
export type StackPosition={x:number;y:number;scale:number};
/** A stacked cluster, never a horizontal row, centered on the cell. */
export function stackPosition(count:number,index:number):StackPosition{
 const pattern:StackPosition[][]=[
  [{x:50,y:50,scale:0.86}],
  [{x:41,y:43,scale:0.74},{x:60,y:57,scale:0.74}],
  [{x:50,y:34,scale:0.68},{x:37,y:60,scale:0.68},{x:64,y:60,scale:0.68}],
  [{x:40,y:37,scale:0.61},{x:61,y:37,scale:0.61},{x:40,y:65,scale:0.61},{x:61,y:65,scale:0.61}],
 ];
 if(count<1||index<0||index>=count)throw new Error("Invalid stack");
 if(count<=4)return pattern[count-1][index];
 // Defensive fallback (maximum four pawns per player, eight total on one safe square).
 const angle=index*Math.PI*2/count-Math.PI/2;
 return {x:50+23*Math.cos(angle),y:50+23*Math.sin(angle),scale:0.54};
}
