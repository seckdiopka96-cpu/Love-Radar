import {useId} from "react";

/** Original high-density vector map-pin pawn with a bright pearl shell.
 * The existing CSS color variables preserve each seat and every game rule.
 * No bitmap assets: remains crisp on Retina and while animated/stacked. */
export default function PawnShape({index}:{index:number}){
 const uid=useId().replace(/:/g,"");
 const rim=uid+"-rim",orb=uid+"-orb",foot=uid+"-foot",metal=uid+"-metal";
 return <svg className="ludo-token-art" viewBox="0 0 52 70" aria-hidden="true" focusable="false" data-pawn={index+1}>
  <defs>
   <linearGradient id={metal} x1="9%" y1="8%" x2="88%" y2="95%">
    <stop offset="0%" stopColor="#ffffff"/>
    <stop offset="21%" stopColor="#f8fcff"/>
    <stop offset="49%" stopColor="#bccbd4"/>
    <stop offset="74%" stopColor="#fff"/>
    <stop offset="100%" stopColor="#798b9d"/>
   </linearGradient>
   <linearGradient id={rim} x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stopColor="#fff"/>
    <stop offset="36%" stopColor="#c7d6e1"/>
    <stop offset="68%" stopColor="#6e7f93"/>
    <stop offset="100%" stopColor="#f5fcff"/>
   </linearGradient>
   <radialGradient id={orb} cx="30%" cy="23%" r="74%">
    <stop offset="0%" stopColor="#ffffff"/>
    <stop offset="15%" stopColor="var(--pawn-light)"/>
    <stop offset="55%" stopColor="var(--pawn-mid)"/>
    <stop offset="88%" stopColor="var(--pawn-mid)"/>
    <stop offset="100%" stopColor="var(--pawn-dark)"/>
   </radialGradient>
   <linearGradient id={foot} x1="5%" y1="4%" x2="92%" y2="94%">
    <stop offset="0%" stopColor="var(--pawn-light)"/>
    <stop offset="48%" stopColor="var(--pawn-mid)"/>
    <stop offset="100%" stopColor="var(--pawn-dark)"/>
   </linearGradient>
  </defs>
  <ellipse className="ludo-pawn-shadow" cx="26" cy="65.3" rx="21" ry="4.4" fill="#06152b" opacity=".24"/>
  <ellipse cx="26" cy="59" rx="17.7" ry="8.8" fill={"url(#"+foot+")"} stroke="var(--pawn-dark)" strokeWidth="2"/>
  <ellipse cx="26" cy="56.4" rx="15" ry="6.5" fill="#fff" opacity=".92"/>
  <ellipse cx="26" cy="55.9" rx="11.6" ry="4.3" fill={"url(#"+foot+")"} opacity=".96"/>
  <path className="ludo-pawn-foot" d="M9.8 58.7c1.8 6.8 30.6 7.1 32.4 0" fill="none" stroke="var(--pawn-dark)" strokeWidth="2" opacity=".8"/>
  <path className="ludo-pawn-stem" d="M26 2.6C13.3 2.6 4.3 11.8 4.3 24.1c0 7.4 4.7 14.5 10.5 21.6l8.5 10.6c1.3 1.7 4.1 1.7 5.4 0l8.5-10.6c5.8-7.1 10.5-14.2 10.5-21.6C47.7 11.8 38.7 2.6 26 2.6z"
   fill={"url(#"+metal+")"} stroke="#394b5e" strokeWidth="2.35" strokeLinejoin="round"/>
  <path d="M8.5 25c.4 9.1 9.1 18.7 17.5 29.7C16.1 34.1 11.6 23.7 17 11.2c-4.7 2.3-8.7 7.6-8.5 13.8z"
   fill="#ffffff" opacity=".8"/>
  <path d="M42.2 24c0 11.4-9.8 23.5-16.2 30.7 14.3-17.6 16.3-30.3 9.7-42.2 4.4 3.7 6.5 6.6 6.5 11.5z"
   fill="#687e90" opacity=".33"/>
  <circle className="ludo-pawn-head" cx="26" cy="24" r="16.5"
   fill={"url(#"+rim+")"} stroke="#40596c" strokeWidth="1.2"/>
  <circle cx="26" cy="23.6" r="13.4" fill={"url(#"+orb+")"}
   stroke="var(--pawn-dark)" strokeWidth="1.3"/>
  <path className="ludo-pawn-shine" d="M15.4 18.2C17.9 13.1 22.2 10.9 26.5 11.1"
   fill="none" stroke="#fff" strokeOpacity=".93" strokeWidth="2.6" strokeLinecap="round"/>
  <ellipse cx="20.7" cy="16.4" rx="2.9" ry="4.1" transform="rotate(33 20.7 16.4)" fill="#fff" opacity=".3"/>
  <path d="M34.1 31.2c-4.6 4.5-12.3 5.6-18.4 1.1" fill="none" stroke="#071d33" strokeOpacity=".12" strokeWidth="2" strokeLinecap="round"/>
 </svg>;
}
