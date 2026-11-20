/** Public 2v2 lobby invitation: carries only the random, limited-use code.
 * It never includes private couple-room IDs, tokens, messages or identities.
 * The authenticated API verifies membership before attaching a guest couple.
 */
export const TEAM_CODE_PATTERN=/^[A-HJ-NP-Z2-9]{10}$/;
export function cleanTeamCode(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const normalized=value.trim().toUpperCase();
 return TEAM_CODE_PATTERN.test(normalized)?normalized:null;
}
export function parseTeamInvite(search:string):string|null{
 const params=new URLSearchParams(search);
 if(params.get("tab")!=="team-games")return null;
 return cleanTeamCode(params.get("invite"));
}
export function teamInviteUrl(code:string,origin:string):string{
 const valid=cleanTeamCode(code);
 if(!valid)throw Error("Invalid 2v2 invitation code");
 const url=new URL("/",origin);
 url.searchParams.set("tab","team-games");
 url.searchParams.set("invite",valid);
 return url.toString();
}
