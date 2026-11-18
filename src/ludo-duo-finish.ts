/** The classic Duo lane has five visible coloured squares (progress 51–55).
 * Progress 56 is the centre: a pawn on square five reaches it with an exact 1.
 * Legacy matches may still contain 57 from the former six-step lane;
 * treat both 56 and 57 as finished without corrupting saved games.
 */
export const DUO_FINISH=56;

export function isDuoFinished(progress:number):boolean{
 return Number.isInteger(progress)&&progress>=DUO_FINISH;
}

export function canAdvanceDuo(progress:number,die:number):boolean{
 if(!Number.isInteger(die)||die<1||die>6)return false;
 return progress===-1?die===6:
  Number.isInteger(progress)&&progress>=0&&progress<DUO_FINISH&&progress+die<=DUO_FINISH;
}

/** Returns the server-authoritative next progress, or null for an illegal roll. */
export function advanceDuo(progress:number,die:number):number|null{
 if(!canAdvanceDuo(progress,die))return null;
 return progress===-1?0:progress+die;
}
