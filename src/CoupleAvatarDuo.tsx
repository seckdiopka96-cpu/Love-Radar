import {useEffect,lazy,Suspense,useId,useState} from "react";
import {DEFAULT_AVATAR,DEFAULT_PARTNER_AVATAR,HAIR_HEX,OUTFIT_HEX,SKIN_HEX,
 POSE_LABEL,type AvatarStyle,type CouplePose} from "./couple-avatar-model";
import "./couple-avatars.css";
const Avatar3DScene=lazy(()=>import("./Avatar3DScene"));

type CharacterProps={style:AvatarStyle;label:string;portrait?:boolean;side?:"left"|"right"};
/** Original layered 2.5D vector. No external image, tracking or paid service. */
export function AvatarCharacter({style,label,portrait=false,side="left"}:CharacterProps){
 const unique=useId().replace(/:/g,"");
 const skin=SKIN_HEX[style.skin],hair=HAIR_HEX[style.hairColor],outfit=OUTFIT_HEX[style.outfit];
 const shade="avatar-shade-"+unique, skinLight="avatar-skin-"+unique;
 const hairLight="avatar-hair-"+unique,shirtLight="avatar-shirt-"+unique;
 const hijab=style.hair==="hijab";
 const longHair=style.hair==="longs"||style.hair==="tresses"||style.hair==="locks";
 return <svg xmlns="http://www.w3.org/2000/svg" className="lr-avatar-character-svg"
   viewBox={portrait?"28 17 124 144":"0 0 180 260"} role="img" aria-label={label}>
  <defs>
   <linearGradient id={skinLight} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor={skin}/><stop offset=".52" stopColor={skin}/>
    <stop offset="1" stopColor="#5b3229" stopOpacity=".72"/>
   </linearGradient>
   <linearGradient id={shade} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#ffffff" stopOpacity=".25"/>
    <stop offset=".48" stopColor="#ffffff" stopOpacity="0"/>
    <stop offset="1" stopColor="#1c0f24" stopOpacity=".2"/>
   </linearGradient>
   <linearGradient id={hairLight} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#fff5ec" stopOpacity=".24"/>
    <stop offset=".48" stopColor={hair}/>
    <stop offset="1" stopColor="#101225" stopOpacity=".55"/>
   </linearGradient>
   <linearGradient id={shirtLight} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#f8eaf8" stopOpacity=".50"/>
    <stop offset=".22" stopColor={outfit}/>
    <stop offset="1" stopColor="#131c3b" stopOpacity=".84"/>
   </linearGradient>
  </defs>
  {/* Legwear and shoes: softly shaped, no thick black cartoon outlines. */}
  {!portrait?<g className="lr-avatar-legs">
   <ellipse cx="91" cy="251" rx="51" ry="4.5" fill="#071328" opacity=".20"/>
   <path d="M57 215Q87 223 121 215l-3 29-24 2-6-28-7 28-26-2Z"
    fill="#253b53"/>
   <path d="M58 241q15-5 25 1l3 7q-9 8-35 3-4-4 7-11ZM100 242q16-6 22 1 15 6 8 10-21 7-34-1Z"
    fill="#edf0f8"/>
   <path d="M53 250h32m15 1h30" stroke="#9baec4" strokeWidth="2" strokeLinecap="round"/>
  </g>:null}
  {/* Hair behind the head: independent styles, real strands, highlights. */}
  {longHair||hijab?<g>
   <path d="M45 73C38 45 54 25 89 25c36 0 49 25 45 50l7 94q-8 14-24 10l-6-61H70l-6 60q-21 4-26-10Z"
    fill={`url(#${hairLight})`}/>
   {style.hair==="longs"?<g fill="none" stroke="#fcdfc6" strokeOpacity=".13" strokeWidth="3">
    <path d="M46 74q-1 46 1 92M133 76q2 50-2 92"/>
   </g>:null}
  </g>:null}
  {/* Independent shoulder joints allow the near arm to actually embrace the other avatar. */}
  <g className="lr-avatar-figure-body">
   <g className={"lr-avatar-arm-figure "+(side==="right"?"lr-avatar-arm-near":"lr-avatar-arm-far")}>
    <path d="M63 153Q46 150 39 169L22 216Q18 227 30 232Q40 235 45 222L62 187Z"
     fill={`url(#${shirtLight})`}/>
    <path d="M39 176q-8 20-12 30" stroke="#fff" strokeOpacity=".14" strokeWidth="3"
     strokeLinecap="round" fill="none"/>
    <ellipse cx="31" cy="226" rx="8.2" ry="10.3" fill={skin}/>
   </g>
   <g className={"lr-avatar-arm-figure "+(side==="left"?"lr-avatar-arm-near":"lr-avatar-arm-far")}>
    <path d="M116 153q18-5 25 16L158 216q4 11-8 16-10 3-15-10l-17-35Z"
     fill={`url(#${shirtLight})`}/>
    <path d="M141 175q7 20 11 31" stroke="#fff" strokeOpacity=".14" strokeWidth="3"
     strokeLinecap="round" fill="none"/>
    <ellipse cx="149" cy="226" rx="8.2" ry="10.3" fill={skin}/>
   </g>
   <path d="M59 154q14-9 31-9 18 0 31 9l14 60q-38 20-89 0Z"
    fill={`url(#${shirtLight})`}/>
   <path d="M66 154q4 16 24 22l-10 13-21-29M115 154q-4 16-25 22l12 13 20-29"
    fill="#fffafc" opacity=".33"/>
   <path d="M89 175v46" stroke="#f4d7e8" strokeWidth="1.7" strokeOpacity=".48"/>
   <circle cx="89" cy="189" r="1.8" fill="#fff" opacity=".65"/>
   <circle cx="89" cy="201" r="1.8" fill="#fff" opacity=".65"/>
   <path d="M49 210q38 12 81 0" fill="none" stroke="#0e1834"
    strokeWidth="2" strokeOpacity=".14"/>
  </g>
  <g className="lr-avatar-head">
  <path d="M79 130v25q10 13 23 0v-25" fill={`url(#${skinLight})`}/>
  {/* Ears, shaded face, cheeks and grown-up facial details. */}
  <ellipse cx="45" cy="94" rx="9" ry="14" fill={skin}/>
  <ellipse cx="135" cy="94" rx="9" ry="14" fill={skin}/>
  <path d="M44 76C43 47 58 33 90 32c32 0 48 15 46 46l-4 30c-5 23-24 41-42 42-21-1-42-19-45-45Z"
   fill={`url(#${skinLight})`}/>
  <path d="M51 66q-10 48 7 64" stroke="#fff" strokeWidth="7" strokeOpacity=".11"
   fill="none" strokeLinecap="round"/>
  <path d="M49 76C49 52 63 41 89 42c25 0 39 11 41 34" fill="none"
   stroke="#fff4e6" strokeWidth="3" strokeOpacity=".1" strokeLinecap="round"/>
  <ellipse className="lr-avatar-cheek" cx="63" rx="11.5" ry="6.3" fill="#d96877" opacity=".17"/>
  <ellipse className="lr-avatar-cheek" cx="117" rx="11.5" ry="6.3" fill="#d96877" opacity=".17"/>
  <path d="M59 89q10-7 21 0m20 0q10-7 20 0" fill="none" stroke={hair} strokeWidth="3.6" strokeLinecap="round"/>
  <path d="M62 99q9-7 17 0m22 0q9-7 17 0" fill="none" stroke="#382b35"
   strokeWidth="2.1" strokeLinecap="round"/>
  <g className="lr-avatar-eyes">
   <ellipse cx="70.5" cy="99" rx="4" ry="5" fill="#312d36"/>
   <ellipse cx="110.5" cy="99" rx="4" ry="5" fill="#312d36"/>
   <circle cx="71.8" cy="97.4" r="1.55" fill="#fff"/>
   <circle cx="111.8" cy="97.4" r="1.55" fill="#fff"/>
  </g>
  <path d="M91 99q-5 10 0 13" fill="none" stroke="#6b3d3e" strokeWidth="1.9"
   strokeOpacity=".5" strokeLinecap="round"/>
  <path className="lr-avatar-smile" d="M81 124q9 6 19-1" fill="none" stroke="#903c58" strokeWidth="2.8" strokeLinecap="round"/>
  <path d="M86 126q4 1 9 0" fill="none" stroke="#ffdade" strokeOpacity=".37" strokeWidth="1.4"/>
  {/* Front hair sits over the forehead with realistic swept, curled, or braided contours. */}
  {hijab?<g>
   <path d="M47 76q-7-38 11-53 29-23 62 0 17 18 12 55l-16-23Q91 74 64 53Z"
    fill={`url(#${hairLight})`}/>
   <path d="M44 73q-10 47-3 78 12 18 32 10l-18-28q-7-15-5-47" fill={hair} opacity=".91"/>
   <path d="M133 73q10 43 4 78-11 18-32 10l18-28q8-16 7-47" fill={hair} opacity=".91"/>
   <path d="M66 145q25 17 49 0" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="3"/>
  </g>:
   style.hair==="courts"?<g>
    <path d="M44 83Q34 26 88 24q54-5 52 60l-10-22Q108 69 85 52q-21 20-38 21Z"
     fill={`url(#${hairLight})`}/>
    <path d="M55 52q29-26 62-2" fill="none" stroke="#fff" strokeOpacity=".1" strokeWidth="4"/>
   </g>:
   style.hair==="boucles"?<g>
    <path d="M43 81Q26 46 50 31q16-22 39-13 29-8 46 17 17 21 1 50l-7-23Q91 58 64 70L49 87Z"
     fill={`url(#${hairLight})`}/>
    {[[51,48,16],[67,32,18],[87,28,19],[111,30,19],[130,48,15],[43,73,13]].map(([x,y,r],i)=>
     <g key={i}><circle cx={x} cy={y} r={r} fill={hair}/>
      <path d={`M${x-r/3} ${y-r/4}q${r/2} -${r/2} ${r} 0`}
       stroke="#faf2ed" strokeOpacity=".13" strokeWidth="2" fill="none"/></g>)}
   </g>:
   style.hair==="tresses"?<g>
    <path d="M44 75q-10-47 29-55 44-8 64 36l-8 18q-21-19-42-28Q62 69 45 82Z"
     fill={hair}/>
    {Array.from({length:7},(_,i)=>{const x=55+i*11;
     return <path key={i} d={`M${x} 35q-7 21-7 33`}
      fill="none" stroke="#fff0de" strokeOpacity=".22" strokeWidth="1.3" strokeLinecap="round"/>})}
    <path d="M43 68q-4 39-1 93M136 68q6 42 2 93" fill="none" stroke={hair}
     strokeWidth="9" strokeLinecap="round"/>
    <path d="M43 80q-4 40-1 68M136 79q5 39 2 69" fill="none" stroke="#e9ceba"
     strokeWidth="1.5" strokeOpacity=".18" strokeDasharray="5 7"/>
   </g>:
   style.hair==="locks"?<g>
    <path d="M43 71q-13-47 32-53 44-9 62 35l-7 17Q107 51 90 44 64 62 46 82Z" fill={hair}/>
    {[44,55,67,79,90,102,115,126,137].map((x,i)=>
     <path key={x} d={`M${x} 40q${i%2?8:-8} 38 ${i%2?7:-7} ${i%3===0?143:96}`}
      fill="none" stroke={hair} strokeWidth={i%2?7:8} strokeLinecap="round"/>)}
   </g>:
   <g>
    <path d="M44 77q-7-50 37-55 47-5 56 53l-12-17Q103 46 78 45 61 62 46 81Z"
     fill={`url(#${hairLight})`}/>
    <path d="M52 51q23-28 57-13" fill="none" stroke="#faf0e5" strokeOpacity=".12" strokeWidth="3"/>
   </g>}
  {style.accessory==="lunettes"?<g stroke="#efe4dc" strokeWidth="2.8" fill="#cceefa" fillOpacity=".1">
   <rect x="53" y="86" width="30" height="24" rx="10"/>
   <rect x="97" y="86" width="30" height="24" rx="10"/>
   <path d="M83 94q7-5 14 0M53 95l-8-4M127 95l8-4" fill="none" strokeLinecap="round"/>
  </g>:null}
  {style.accessory==="fleur"?<g transform="translate(124 56)">
   {[0,72,144,216,288].map(deg=><ellipse key={deg} cx="0" cy="-9" rx="6.2" ry="9"
    transform={`rotate(${deg})`} fill="#f6c4df"/>)}
   <circle r="5" fill="#f8d382"/>
  </g>:null}
  {style.accessory==="bonnet"?<g>
   <path d="M48 55Q49 16 89 12q41 0 42 43Z" fill="#d7c6ed"/>
   <rect x="44" y="47" width="93" height="17" rx="7" fill="#9c7ab9"/>
   <circle cx="89" cy="14" r="10" fill="#eac5dd"/>
   <path d="M53 54h75" stroke="#fff" strokeOpacity=".3" strokeWidth="2"/>
  </g>:null}
  </g>
 </svg>;
}
type DuoProps={mine?:AvatarStyle|null;partner?:AvatarStyle|null;pose?:CouplePose;
 mode?:"hero"|"home"|"sticker";animate?:boolean;mineName?:string;partnerName?:string;
 token?:string;mine3d?:boolean;partner3d?:boolean;modelVersion?:number};
export default function CoupleAvatarDuo({mine,partner,pose="main",mode="hero",animate=true,
 mineName="Toi",partnerName="Ton amour",token="",mine3d=false,partner3d=false,modelVersion=0}:DuoProps){
 const [renderFailed,setRenderFailed]=useState(false);
 useEffect(()=>setRenderFailed(false),[token,mine3d,partner3d,modelVersion]);
 const show3d=Boolean(token&&(mine3d||partner3d)&&mode!=="sticker"&&!renderFailed);
 const onlyOne3d=show3d&&(mine3d!==partner3d);
 const displayedCaption=onlyOne3d?
  (pose==="danse"?"Danse en solo":pose==="main"?"Ton avatar 3D":"À deux quand vos avatars seront prêts"):
  POSE_LABEL[pose];
 return <div className={"lr-avatar-duo lr-avatar-duo-"+mode+" lr-avatar-pose-"+pose+
  (animate?" lr-avatar-animate":"")+(onlyOne3d?" lr-avatar-real-solo":"")} role="img"
  aria-label={onlyOne3d?"Avatar 3D de "+(mine3d?mineName:partnerName):POSE_LABEL[pose]+", "+mineName+" et "+partnerName}>
  <span className="lr-avatar-duo-halo" aria-hidden="true"/>
  <span className="lr-avatar-duo-orbit" aria-hidden="true"/>
  {show3d?<Suspense fallback={<span className="lr-avatar-three-loading">Chargement de vos avatars 3D…</span>}>
   <Avatar3DScene key={modelVersion} token={token} mine={mine3d} partner={partner3d} pose={pose}
    mineStyle={mine||DEFAULT_AVATAR} partnerStyle={partner||DEFAULT_PARTNER_AVATAR}
    onUnavailable={()=>setRenderFailed(true)}/>
  </Suspense>:
   <div className={"lr-avatar-3d-invite"+(mode==="sticker"?" compact":"")} aria-hidden="true">
    <div className="lr-avatar-3d-constellation">
     <span className="lr-avatar-3d-orb lr-avatar-3d-orb-left"/>
     <span className="lr-avatar-3d-orb lr-avatar-3d-orb-right"/>
     <span className="lr-avatar-3d-link">♥</span>
    </div>
    <strong>{mode==="sticker"?POSE_LABEL[pose]:renderFailed?"Aperçu 3D indisponible":"Vos avatars en 3D"}</strong>
    {mode!=="sticker"?<small>{renderFailed?"Réessaie depuis l’atelier Avaturn.":"Créez chacun votre avatar avec Avaturn."}</small>:null}
   </div>}
  <svg className="lr-avatar-duo-heart" viewBox="0 0 44 44" aria-hidden="true">
   <path d="M22 37 7 22C-2 12 10 0 22 13 34 0 46 12 37 22Z" fill="#ffb5d1"/>
   <path d="M13 15q3-6 7 0" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round"/>
  </svg>
  {pose==="danse"?<svg className="lr-avatar-duo-note" viewBox="0 0 32 40" aria-hidden="true">
   <path d="M13 25V7l13-4v18M13 25c-10-3-13 10-3 10 5 0 6-3 6-7m10-7c-10-3-12 10-3 10 4 0 6-3 6-7"
    stroke="#f6dfef" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
  </svg>:null}
  {mode!=="sticker"?<span className="lr-avatar-duo-caption">{displayedCaption}</span>:null}
 </div>;
}
