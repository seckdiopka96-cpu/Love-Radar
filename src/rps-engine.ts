/** Shared, pure rock–paper–scissors rules. Neither choice is exposed before reveal. */
export type RpsMove="rock"|"paper"|"scissors";
export type RpsWinner=0|1|null;
export const RPS_MOVES:{id:RpsMove;label:string;emoji:string;detail:string}[]=[
 {id:"rock",label:"Pierre",emoji:"✊",detail:"La pierre casse les ciseaux"},
 {id:"paper",label:"Papier",emoji:"✋",detail:"Le papier recouvre la pierre"},
 {id:"scissors",label:"Ciseaux",emoji:"✌️",detail:"Les ciseaux coupent le papier"}
];
export function isRpsMove(value:unknown):value is RpsMove{
 return value==="rock"||value==="paper"||value==="scissors";
}
export function rpsWinner(first:RpsMove,second:RpsMove):RpsWinner{
 if(first===second)return null;
 const firstWins=(first==="rock"&&second==="scissors")||
  (first==="paper"&&second==="rock")||
  (first==="scissors"&&second==="paper");
 return firstWins?0:1;
}
export function rpsName(move:RpsMove|null|undefined){
 return RPS_MOVES.find(item=>item.id===move)?.label||"En attente";
}
export function rpsEmoji(move:RpsMove|null|undefined){
 return RPS_MOVES.find(item=>item.id===move)?.emoji||"❔";
}
