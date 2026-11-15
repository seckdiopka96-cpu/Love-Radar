export const PUZZLE_SIZE=3;
export const PUZZLE_TILE_COUNT=PUZZLE_SIZE*PUZZLE_SIZE;
export const PUZZLE_THEMES=["love","sunset","flowers"] as const;
export type PuzzleTheme=typeof PUZZLE_THEMES[number];
export type PuzzleBoard={
 tiles:number[];theme:PuzzleTheme;moves:number;solved:boolean;
 version:number;updatedAt:number;lastBy:string|null;
};
export function isPuzzleTheme(value:unknown):value is PuzzleTheme{
 return typeof value==="string"&&PUZZLE_THEMES.some(t=>t===value);
}
export function isPuzzleTiles(value:unknown):value is number[]{
 return Array.isArray(value)&&value.length===PUZZLE_TILE_COUNT&&
  value.every((v)=>Number.isInteger(v)&&v>=0&&v<PUZZLE_TILE_COUNT)&&new Set(value).size===PUZZLE_TILE_COUNT;
}
export function puzzleSolved(tiles:number[]):boolean{
 return isPuzzleTiles(tiles)&&tiles.every((tile,index)=>tile===index);
}
export function swapTiles(tiles:number[],from:number,to:number):number[]{
 if(!isPuzzleTiles(tiles)||!Number.isInteger(from)||!Number.isInteger(to)||
  from<0||from>=PUZZLE_TILE_COUNT||to<0||to>=PUZZLE_TILE_COUNT||from===to)
  throw Error("Emplacements de puzzle invalides.");
 const result=tiles.slice();
 [result[from],result[to]]=[result[to],result[from]];
 return result;
}
export function newShuffledTiles(random:()=>number=Math.random):number[]{
 const tiles=Array.from({length:PUZZLE_TILE_COUNT},(_,i)=>i);
 for(let attempt=0;attempt<4;attempt++){
  for(let i=PUZZLE_TILE_COUNT-1;i>0;i--){
   const n=random();const j=Math.min(i,Math.max(0,Math.floor(n*(i+1))));
   [tiles[i],tiles[j]]=[tiles[j],tiles[i]];
  }
  if(!puzzleSolved(tiles))return tiles;
 }
 // In case the random generator is deterministic/unlucky, force a non-solved puzzle.
 [tiles[0],tiles[1]]=[tiles[1],tiles[0]];
 return tiles;
}
export function themeLabel(theme:PuzzleTheme):string{
 return theme==="love"?"Cœurs amoureux":theme==="sunset"?"Coucher de soleil":"Jardin de fleurs";
}
export function puzzleImage(theme:PuzzleTheme):string{
 return "/puzzles/"+theme+".svg";
}
export function tileBackgroundPosition(tile:number):{x:string;y:string}{
 if(!Number.isInteger(tile)||tile<0||tile>=PUZZLE_TILE_COUNT)throw Error("Pièce invalide");
 return {x:((tile%PUZZLE_SIZE)/(PUZZLE_SIZE-1)*100)+"%",
  y:(Math.floor(tile/PUZZLE_SIZE)/(PUZZLE_SIZE-1)*100)+"%"};
}
