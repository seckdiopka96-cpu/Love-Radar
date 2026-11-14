import "./dice.css";

type DiceProps = {value:number;variant?:"pink"|"gold";size?:"normal"|"large"|"mini"};
const PIPS:Record<number,number[]> = {1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};

export default function DiceFace({value,variant="pink",size="normal"}:DiceProps){
 const displayedFace=value>=1&&value<=6?value:5;
 const dots=new Set(PIPS[displayedFace]);
 return <span className={"lr-die lr-die-"+variant+" lr-die-"+size} role="img" aria-label={value>=1&&value<=6?"Dé à "+value+" points":"Dé prêt à lancer"}>
  <span className="lr-die-face" aria-hidden="true">
   {Array.from({length:9},(_,i)=><i key={i} className={dots.has(i)?"is-dot":""}/>) }
  </span>
 </span>;
}
