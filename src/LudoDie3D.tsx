import "./ludo-die-3d.css";

type Props={
 value:number;
 color?:"blue"|"green"|"red"|"gold"|"yellow";
 rolling?:boolean;
};
const PIPS:Readonly<Record<number,readonly number[]>>={
 1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]
};
/** CSS 3D six-sided die. Dice numbers are always passed in from game state;
 * this visual never generates a result or changes the rules. */
export default function LudoDie3D({value,color="blue",rolling=false}:Props){
 const face=Number.isInteger(value)&&value>=1&&value<=6?value:1;
 return <span
  className={"ludo-die-3d ludo-die-3d-"+color+" ludo-die-shows-"+face+(rolling?" is-tumbling":"")}
  role="img"
  aria-label={rolling?"Dé en train de rouler":"Dé à "+face+" points"}
  data-result={face}
  data-color={color}>
  <span className="ludo-die-shadow" aria-hidden="true"/>
  <span className="ludo-die-cube" aria-hidden="true">
   {([1,2,3,4,5,6] as const).map(number=>
    <span key={number} className={"ludo-die-side ludo-die-side-"+number}>
     {Array.from({length:9},(_,i)=><i key={i} className={PIPS[number].includes(i)?"is-pip":""}/>)}
    </span>
   )}
  </span>
 </span>;
}
