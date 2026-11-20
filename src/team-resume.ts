/** Small device-only resume hint. No game state, invite codes, room IDs,
 * messages, authentication tokens or personal data are stored here.
 * The server must always authenticate and verify an active match before
 * automatic navigation, so this hint never authorizes access.
 */
export const TEAM_RESUME_KEY="lr-team-resume-v1";
export function setTeamResumeHint(active:boolean){
 try{
  if(active)localStorage.setItem(TEAM_RESUME_KEY,"1");
  else localStorage.removeItem(TEAM_RESUME_KEY);
 }catch{/* Private browsing or iOS storage eviction: server remains authoritative. */}
}
export function hasTeamResumeHint():boolean{
 try{return localStorage.getItem(TEAM_RESUME_KEY)==="1"}catch{return false}
}
