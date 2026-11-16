import {useEffect,useState} from "react";
import "./launch-splash.css";

/** Brief branded opening; no tracking, remote requests, or onboarding interruption. */
export default function LaunchSplash(){
 const [visible,setVisible]=useState(true);
 const [leaving,setLeaving]=useState(false);
 useEffect(()=>{
  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if(reduced){setVisible(false);return}
  const fade=window.setTimeout(()=>setLeaving(true),1150);
  const remove=window.setTimeout(()=>setVisible(false),1530);
  return()=>{window.clearTimeout(fade);window.clearTimeout(remove)};
 },[]);
 if(!visible)return null;
 return <div className={"lr-launch-splash"+(leaving?" is-leaving":"")} role="status" aria-label="Ouverture de Love Radar"
  aria-live="off">
  <div className="lr-launch-glow" aria-hidden="true"/>
  <div className="lr-launch-emblem" aria-hidden="true">
   <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 67C25 55 11 44 11 29a16 16 0 0 1 29-9 16 16 0 0 1 29 9c0 15-14 26-29 38Z"
     fill="url(#lrHeart)" stroke="#FFD5E3" strokeWidth="1.5"/>
    <path d="M24 38h9l5-8 6 17 5-9h8" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
    <defs><linearGradient id="lrHeart" x1="10" y1="8" x2="75" y2="67" gradientUnits="userSpaceOnUse">
     <stop stopColor="#FFADC9"/><stop offset="1" stopColor="#C7497A"/></linearGradient></defs>
   </svg>
  </div>
  <p className="lr-launch-kicker">UN UNIVERS À DEUX</p>
  <h1>Love <span>Radar</span></h1>
  <p className="lr-launch-tagline">Vos messages, vos appels et vos moments précieux.</p>
  <div className="lr-launch-credit">Créé par <strong>Diao-Tech.com</strong></div>
 </div>;
}
