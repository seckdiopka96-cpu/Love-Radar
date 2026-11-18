import {DEFAULT_AVATAR,DEFAULT_PARTNER_AVATAR,HAIR_HEX,OUTFIT_HEX,SKIN_HEX,
 POSE_LABEL,type AvatarStyle,type CouplePose} from "./couple-avatar-model";
import "./couple-avatars.css";

type CharacterProps={style:AvatarStyle;label:string};
export function AvatarCharacter({style,label}:CharacterProps){
 const skin=SKIN_HEX[style.skin],hair=HAIR_HEX[style.hairColor],shirt=OUTFIT_HEX[style.outfit];
 const scarf=style.hair==="hijab";
 return <svg className="lr-avatar-character-svg" viewBox="0 0 176 240" xmlns="http://www.w3.org/2000/svg"
  role="img" aria-label={label}>
  <ellipse cx="88" cy="228" rx="60" ry="8" fill="#091426" opacity=".24"/>
  <path d="M65 178 59 218q-4 11 7 11h20l7-49m10-2 8 40q1 10-9 11H89l-5-49"
   fill="#26364f" stroke="#1e3048" strokeWidth="4" strokeLinejoin="round"/>
  <path d="M63 220h24v10H57q-7-5 6-10m42 0h20q11 7 0 10H98Z" fill="#f4f0f5" stroke="#cad5ea" strokeWidth="1.5"/>
  <path d="M56 123q32-15 63 0l19 29-14 50H48l-13-50Z" fill={shirt} stroke="#17253e" strokeWidth="2.5"/>
  <path d="M70 131q17 14 34 0" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="4" strokeLinecap="round"/>
  <path className="lr-avatar-arm lr-avatar-arm-left" d="M48 134q-18 15-23 41t-1 5q4 8 12 4l31-34"
   fill={shirt} stroke="#17253e" strokeWidth="3" strokeLinejoin="round"/>
  <ellipse cx="27" cy="182" rx="9" ry="12" fill={skin} stroke="#352c32" strokeOpacity=".25"/>
  <path className="lr-avatar-arm lr-avatar-arm-right" d="M125 134q21 8 26 39l1 13q-7 6-14-1l-29-34"
   fill={shirt} stroke="#17253e" strokeWidth="3" strokeLinejoin="round"/>
  <ellipse cx="148" cy="181" rx="9" ry="12" fill={skin} stroke="#352c32" strokeOpacity=".25"/>
  <rect x="76" y="110" width="25" height="24" rx="10" fill={skin}/>
  {scarf?<path d="M46 77Q44 21 88 18q49 1 44 61l11 65q-40 34-104 0Z" fill={hair} stroke="#171a27" strokeWidth="3"/>:
   style.hair==="longs"||style.hair==="locks"||style.hair==="tresses"?
    <path d="M42 64Q37 12 89 20q54-4 47 48l5 90q-18 22-31 5l-6-66H71l-6 66q-22 9-28-6Z"
     fill={hair} stroke="#1a1721" strokeOpacity=".54" strokeWidth="2"/>:null}
  <ellipse cx="49" cy="88" rx="10" ry="16" fill={skin} stroke="#2a2230" strokeOpacity=".15"/>
  <ellipse cx="129" cy="88" rx="10" ry="16" fill={skin} stroke="#2a2230" strokeOpacity=".15"/>
  <path d="M50 57q11-32 38-31t40 28v37q-3 41-40 45-39-3-40-46Z"
   fill={skin} stroke="#5b3542" strokeOpacity=".25" strokeWidth="2.5"/>
  <ellipse cx="61" cy="103" rx="11" ry="6" fill="#e88691" opacity=".26"/>
  <ellipse cx="115" cy="103" rx="11" ry="6" fill="#e88691" opacity=".26"/>
  {scarf?<path d="M48 64Q53 24 87 21q40 2 44 45l-11-20Q84 70 54 47Z" fill={hair} stroke="#1a1b29" strokeWidth="2"/>:
   style.hair==="courts"?<path d="M46 75q-6-51 40-55 49-4 49 52l-17-18q-27 6-53-1Z" fill={hair}/>:
   style.hair==="boucles"?<g fill={hair} stroke="#1b1b28" strokeWidth="1.5">
    {[[52,49,22],[69,31,23],[92,27,24],[115,32,23],[128,54,20],[47,73,18]].map(([x,y,r],i)=>
     <circle key={i} cx={x} cy={y} r={r}/>)}</g>:
   style.hair==="tresses"?<g fill="none" stroke={hair} strokeWidth="11" strokeLinecap="round">
    <path d="M51 47Q67 14 95 24t34 33"/><path d="M50 81q-6 40-6 65m86-65q7 36 6 65"/>
    <path d="M67 39q-16 36-12 100M107 32q15 48 17 105"/></g>:
   style.hair==="locks"?<g fill="none" stroke={hair} strokeWidth="13" strokeLinecap="round">
    <path d="M52 40q-10 26-9 78m21-90q-7 43-5 102m16-103q-4 51 2 72m14-75q6 40 4 54m13-51q10 30 14 100m6-83q12 32 9 80"/></g>:
   style.hair==="longs"?<path d="M49 63Q52 18 90 20q41 4 42 45l-9-7Q97 35 62 58Z" fill={hair}/>:null}
  <path d="M63 83q8-7 16 0m18 0q9-7 17 0" fill="none" stroke="#422b2a" strokeWidth="3.1" strokeLinecap="round"/>
  <ellipse cx="72" cy="87" rx="3.7" ry="4.6" fill="#26232a"/>
  <ellipse cx="105" cy="87" rx="3.7" ry="4.6" fill="#26232a"/>
  <circle cx="73.1" cy="85.5" r="1.35" fill="#fff"/>
  <circle cx="106.1" cy="85.5" r="1.35" fill="#fff"/>
  <path d="M86 89q-5 12 4 11" fill="none" stroke="#6c3b3a" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round"/>
  <path d="M78 113q10 8 21-1" fill="none" stroke="#a45164" strokeWidth="3.8" strokeLinecap="round"/>
  {style.accessory==="lunettes"?<g fill="none" stroke="#e8d8ca" strokeWidth="3.5">
   <rect x="56" y="75" width="27" height="24" rx="8"/><rect x="93" y="75" width="27" height="24" rx="8"/>
   <path d="M83 82q5-4 10 0M56 83l-10-5M120 83l10-5"/></g>:null}
  {style.accessory==="fleur"?<g transform="translate(122 49)">
   <circle cx="-7" cy="0" r="7" fill="#fff0f5"/><circle cx="7" cy="0" r="7" fill="#fff0f5"/>
   <circle cx="0" cy="-8" r="7" fill="#ffb8d1"/><circle cx="0" cy="8" r="7" fill="#ffb8d1"/>
   <circle cx="0" cy="0" r="4.5" fill="#ffd36f"/></g>:null}
  {style.accessory==="bonnet"?<g>
   <path d="M47 54Q50 6 91 11q38 0 43 43v7H47Z" fill="#ede5fa" stroke="#40314e" strokeWidth="2"/>
   <path d="M45 50h92v15H45Z" rx="8" fill="#aa84cc" stroke="#40314e" strokeWidth="2"/>
   <circle cx="91" cy="12" r="11" fill="#edb4dc"/></g>:null}
 </svg>;
}
type DuoProps={mine?:AvatarStyle|null;partner?:AvatarStyle|null;pose?:CouplePose;
 mode?:"hero"|"home"|"sticker";animate?:boolean;mineName?:string;partnerName?:string};
export default function CoupleAvatarDuo({mine,partner,pose="main",mode="hero",animate=true,
 mineName="Toi",partnerName="Ton amour"}:DuoProps){
 return <div className={"lr-avatar-duo lr-avatar-duo-"+mode+" lr-avatar-pose-"+pose+
  (animate?" lr-avatar-animate":"")} role="img" aria-label={POSE_LABEL[pose]+", "+mineName+" et "+partnerName}>
  <span className="lr-avatar-duo-halo" aria-hidden="true"/>
  <span className="lr-avatar-duo-spark lr-avatar-duo-spark-one" aria-hidden="true">✦</span>
  <span className="lr-avatar-duo-spark lr-avatar-duo-spark-two" aria-hidden="true">✧</span>
  <span className="lr-avatar-duo-person lr-avatar-duo-mine" aria-hidden="true">
   <AvatarCharacter style={mine||DEFAULT_AVATAR} label={mineName}/>
  </span>
  <span className="lr-avatar-duo-person lr-avatar-duo-partner" aria-hidden="true">
   <AvatarCharacter style={partner||DEFAULT_PARTNER_AVATAR} label={partnerName}/>
  </span>
  <span className="lr-avatar-duo-heart" aria-hidden="true">{pose==="bisou"?"💋":pose==="danse"?"♫":"♥"}</span>
  {mode!=="sticker"?<span className="lr-avatar-duo-caption">{POSE_LABEL[pose]} <span aria-hidden="true">♥</span></span>:null}
 </div>;
}
