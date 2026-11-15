import {useId} from "react";

/**
 * An original, polished 3D-style Ludo peg. A single silhouette is easier to
 * recognize on mobile than a flat numbered disc. Each SVG owns its gradients
 * so red and gold pieces never accidentally share a paint definition.
 */
export default function PawnShape({index}:{index:number}){
 const uid=useId().replace(/:/g,"");
 const head=uid+"-ludo-head",body=uid+"-ludo-body",base=uid+"-ludo-base";
 return <svg className="ludo-token-art" viewBox="0 0 48 62" focusable="false" aria-hidden="true" data-pawn={index+1}>
  <defs>
   <radialGradient id={head} cx="28%" cy="17%" r="82%">
    <stop offset="0%" stopColor="#ffffff"/>
    <stop offset="12%" stopColor="var(--pawn-light)"/>
    <stop offset="53%" stopColor="var(--pawn-mid)"/>
    <stop offset="86%" stopColor="var(--pawn-mid)"/>
    <stop offset="100%" stopColor="var(--pawn-dark)"/>
   </radialGradient>
   <linearGradient id={body} x1="0%" y1="12%" x2="100%" y2="75%">
    <stop offset="0%" stopColor="var(--pawn-dark)"/>
    <stop offset="19%" stopColor="var(--pawn-mid)"/>
    <stop offset="46%" stopColor="var(--pawn-light)"/>
    <stop offset="74%" stopColor="var(--pawn-mid)"/>
    <stop offset="100%" stopColor="var(--pawn-dark)"/>
   </linearGradient>
   <linearGradient id={base} x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stopColor="var(--pawn-light)"/>
    <stop offset="42%" stopColor="var(--pawn-mid)"/>
    <stop offset="100%" stopColor="var(--pawn-dark)"/>
   </linearGradient>
  </defs>
  <ellipse cx="24" cy="56.5" rx="17.6" ry="3.7" fill="#1e1724" opacity=".22"/>
  <path d="M19 29.5 C19 34.5 17.8 37.2 14.5 41.3 C12.2 44.2 9.7 47.3 9.7 50.6 C9.7 55 38.3 55 38.3 50.6 C38.3 47.3 35.8 44.2 33.5 41.3 C30.2 37.2 29 34.5 29 29.5 Z"
    fill={`url(#${body})`} stroke="var(--pawn-dark)" strokeWidth="1.25" strokeLinejoin="round"/>
  <path d="M10 50.2 C13 47.1 35 47.1 38 50.2 L38 52.3 C34.8 57.2 13.2 57.2 10 52.3 Z"
    fill={`url(#${base})`} stroke="var(--pawn-dark)" strokeWidth="1.1"/>
  <ellipse cx="24" cy="50.1" rx="14.2" ry="4" fill={`url(#${base})`} stroke="var(--pawn-dark)" strokeWidth=".8"/>
  <path d="M17.2 42 C19.5 40 20.6 36 20.6 32.5" fill="none" stroke="#ffffff" strokeOpacity=".38" strokeWidth="2.3" strokeLinecap="round"/>
  <ellipse cx="24" cy="30.7" rx="7.5" ry="3.5" fill="var(--pawn-dark)" opacity=".24"/>
  <circle cx="24" cy="17.3" r="12.9" fill={`url(#${head})`} stroke="var(--pawn-dark)" strokeWidth="1.2"/>
  <path d="M15.5 12.2 C17.4 8.2 20.8 6.5 24.7 6.4" fill="none" stroke="#ffffff" strokeOpacity=".83" strokeWidth="2.4" strokeLinecap="round"/>
  <ellipse cx="31.7" cy="22.4" rx="2.2" ry="3.1" fill="var(--pawn-dark)" opacity=".11" transform="rotate(-28 31.7 22.4)"/>
  <ellipse cx="20.6" cy="15.6" rx="1.65" ry="2.7" fill="#ffffff" opacity=".43" transform="rotate(32 20.6 15.6)"/>
 </svg>;
}

