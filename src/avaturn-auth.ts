/** A redirect login started inside a cross-site iframe can lose its session on iOS.
 * Launch the Avaturn editor in a top-level Safari tab instead.
 * This function stays pure so native/iOS browser handling is regression-tested. */
export function requiresTopLevelAvaturnAuth(userAgent:string,platform:string,touchPoints:number):boolean{
 return /iPhone|iPad|iPod/i.test(userAgent)||
  (platform==="MacIntel"&&touchPoints>1);
}
