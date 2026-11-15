/** Teleparty's original HTTPS invite only; ordinary Netflix URLs are NOT parties. */
const TRUSTED_HOSTS=["teleparty.com","teleparty.org","netflixparty.com","netflixparty.org"];
export function parseTelepartyInvite(raw:string):string|null{
 const input=raw.trim();
 if(input.length<12||input.length>1400)return null;
 try{
  const uri=new URL(input);
  if(uri.protocol!=="https:"||uri.username||uri.password||uri.port)return null;
  const host=uri.hostname.toLowerCase();
  if(!TRUSTED_HOSTS.some(domain=>host===domain||host.endsWith("."+domain)))return null;
  // Do not mistake the Teleparty marketing home page for an invitation.
  const hasInvite=uri.pathname!=="/"||uri.search.length>0||uri.hash.length>0;
  if(!hasInvite)return null;
  return uri.href;
 }catch{return null;}
}
export const NETFLIX_TELEPARTY_URL="https://www.teleparty.org/";
export const NETFLIX_TELEPARTY_IOS="https://apps.apple.com/us/app/teleparty-watch-party/id1620026075";
export const NETFLIX_TELEPARTY_ANDROID="https://play.google.com/store/apps/details?id=com.teleparty.android";
