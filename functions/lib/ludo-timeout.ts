/** Server-authoritative non-punitive automatic-turn counter for one private Duo match.
 * Each automatic takeover counts once, regardless of bonus rolls/moves.
 * Counts are independent for each player and reset at the next match.
 */
export type AutoTurnCounts=[number,number];
export const MAX_AUTO_TURNS=3;
export function registerAutoTurn(counts:AutoTurnCounts,seat:number):{counts:AutoTurnCounts;}{
 if(seat!==0&&seat!==1)throw new Error("Invalid Ludo player seat");
 const next:AutoTurnCounts=[counts[0],counts[1]];
 next[seat]=Math.min(MAX_AUTO_TURNS,next[seat]+1);
 return {counts:next};
}
