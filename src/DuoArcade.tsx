import {useCallback,useEffect,useRef,useState,type FormEvent,type PointerEvent as ReactPointerEvent} from "react";
import {apiFetch} from "./api";
import "./duo-arcade.css";

type Stroke={points:[number,number][];color:string;width:number};
type Common={id:string;version:number;mode:"draw"|"escape";status:string;expiresAt:number;updatedAt:number};
type DrawGame=Common&{mode:"draw";round:number;drawer:number;word:string|null;category:string;strokes:Stroke[];scores:[number,number]};
type EscapeGame=Common&{mode:"escape";scenario:number;sceneTitle:string;sceneEmoji:string;stage:number;totalStages:number;stageTitle:string;intro:string;clue:string;placeholder:string;attempts:number;startedAt:number};
type Game=DrawGame|EscapeGame;
type Reply={ok:boolean;error?:string;mode?:"draw"|"escape";game?:Game|null;members?:number;seat?:number;serverNow?:number;correct?:boolean;invited?:boolean};
type Props={mode:"draw"|"escape";token:string;myName:string;partnerName:string|null;onExit:()=>void;onOpenChat:()=>void};
const COLORS=["#ffb6d0","#fff2e9","#9ce5ec","#ffd58e","#baadff"];
function clock(seconds:number){
 const value=Math.max(0,seconds);return String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");
}
function coords(event:ReactPointerEvent<SVGSVGElement>):[number,number]{
 const rect=event.currentTarget.getBoundingClientRect();
 return [
  Math.max(0,Math.min(1000,Math.round((event.clientX-rect.left)/Math.max(1,rect.width)*1000))),
  Math.max(0,Math.min(1000,Math.round((event.clientY-rect.top)/Math.max(1,rect.height)*1000)))
 ];
}
export default function DuoArcade({mode,token,myName,partnerName,onExit,onOpenChat}:Props){
 const [reply,setReply]=useState<Reply|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const [draft,setDraft]=useState("");
 const [color,setColor]=useState(COLORS[0]);
 const [width,setWidth]=useState(4);
 const [stroke,setStroke]=useState<Stroke|null>(null);
 const [pending,setPending]=useState<Stroke|null>(null);
 const [now,setNow]=useState(Date.now());
 const [clockOffset,setClockOffset]=useState(0);
 const busyRef=useRef(false);
 const fetching=useRef(false);
 const mounted=useRef(true);
 const latest=useRef<Game|null>(null);
 const activePointer=useRef<number|null>(null);
 const endpoint="/api/duo-arcade?game="+mode;
 const apply=useCallback((data:Reply)=>{
  if(!mounted.current)return;
  const incoming=data.game;
  const old=latest.current;
  if(incoming&&old&&incoming.id===old.id&&incoming.version<old.version)return;
  if(incoming){
   if(old&&(old.id!==incoming.id||
    (old.mode==="draw"&&incoming.mode==="draw"&&old.round!==incoming.round)||
    (old.mode==="escape"&&incoming.mode==="escape"&&old.stage!==incoming.stage))){
    setDraft("");setFeedback("");setStroke(null);setPending(null);
   }
   latest.current=incoming;
  }
  if(data.serverNow!==undefined)setClockOffset(Date.now()-data.serverNow);
  setReply(data);setLoading(false);
 },[]);
 const refresh=useCallback(async()=>{
  if(!mounted.current||fetching.current||busyRef.current||document.visibilityState==="hidden")return;
  fetching.current=true;
  try{
   const response=await apiFetch(endpoint,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await response.json() as Reply;
   if(!response.ok||!data.ok)throw new Error(data.error||"Connexion perdue.");
   apply(data);
   setError("");
  }catch(err){
   if(mounted.current){setLoading(false);setError(err instanceof Error?err.message:"Jeu indisponible.");}
  }finally{fetching.current=false}
 },[token,endpoint,apply]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  const sync=window.setInterval(()=>void refresh(),800);
  const timer=window.setInterval(()=>setNow(Date.now()),300);
  const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("focus",onVisible);
  return()=>{
   mounted.current=false;
   window.clearInterval(sync);window.clearInterval(timer);
   document.removeEventListener("visibilitychange",onVisible);
   window.removeEventListener("focus",onVisible);
  };
 },[refresh]);
 useEffect(()=>{
  if(!feedback)return;
  const timeout=window.setTimeout(()=>setFeedback(""),2900);
  return()=>window.clearTimeout(timeout);
 },[feedback]);
 const act=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
  const game=latest.current;
  if(!game||busyRef.current)return false;
  busyRef.current=true;setBusy(action);setError("");
  try{
   const response=await apiFetch(endpoint,{method:"POST",headers:{
    Authorization:"Bearer "+token,"Content-Type":"application/json"
   },body:JSON.stringify({
    action,gameId:game.id,version:game.version,
    ...(game.mode==="draw"?{round:game.round}:{stage:game.stage}),...extra
   })});
   const data=await response.json() as Reply;
   if(!response.ok||!data.ok)throw new Error(data.error||"Action impossible.");
   apply(data);
   if(action==="invite")setFeedback("Invitation envoyée à ton partenaire 💌");
   else if(action==="guess")setFeedback(data.correct?"🎉 Bravo, tu as deviné !":"Pas encore ! Essaie un autre mot.");
   else if(action==="solve")setFeedback(data.correct?"🔓 Bravo ! Énigme résolue.":"Ce n'est pas le bon code. Parlez-en ensemble.");
   return Boolean(data.correct??true);
  }catch(err){
   if(mounted.current)setError(err instanceof Error?err.message:"Action impossible.");
   return false;
  }finally{
   busyRef.current=false;
   if(mounted.current)setBusy(null);
   void refresh();
  }
 },[endpoint,token,apply,refresh]);
 const game=reply?.game||null;
 const draw=game?.mode==="draw"?game:null;
 const escape=game?.mode==="escape"?game:null;
 const seat=reply?.seat??0;
 const remaining=game?Math.max(0,Math.ceil((game.expiresAt-(now-clockOffset))/1000)):0;
 const ended=game?.status==="timeout"||game?.status==="revealed"||game?.status==="escaped"||remaining===0;
 const isDrawer=Boolean(draw&&draw.drawer===seat);
 const canPaint=Boolean(draw&&!ended&&isDrawer&&!busy);
 function pointerDown(event:ReactPointerEvent<SVGSVGElement>){
  if(!canPaint||activePointer.current!==null)return;
  event.preventDefault();
  activePointer.current=event.pointerId;
  event.currentTarget.setPointerCapture(event.pointerId);
  const p=coords(event);
  setStroke({points:[p,p],color,width});
 }
 function pointerMove(event:ReactPointerEvent<SVGSVGElement>){
  if(activePointer.current!==event.pointerId)return;
  const point=coords(event);
  setStroke(prev=>{
   if(!prev)return prev;
   const last=prev.points[prev.points.length-1];
   if(last[0]===point[0]&&last[1]===point[1])return prev;
   if(prev.points.length>=120)return prev;
   return {...prev,points:[...prev.points,point]};
  });
 }
 function pointerUp(event:ReactPointerEvent<SVGSVGElement>){
  if(activePointer.current!==event.pointerId)return;
  activePointer.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(!stroke)return;
  const final:Stroke={...stroke,points:[...stroke.points.slice(0,119),coords(event)]};
  setStroke(null);setPending(final);
  void act("stroke",{stroke:final}).finally(()=>setPending(null));
 }
 function pointerCancel(){
  activePointer.current=null;setStroke(null);
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!draft.trim()||busy)return;
  const action=mode==="draw"?"guess":"solve",answer=draft;
  void act(action,{[mode==="draw"?"guess":"answer"]:answer}).then(correct=>{if(correct)setDraft("")});
 }
 const drawScore=draw?(draw.scores[seat]??0):0;
 const otherScore=draw?(draw.scores[seat===0?1:0]??0):0;
 return <section className="lr-duo" aria-label={mode==="draw"?"Devine ce que je dessine":"Escape Room Duo"}>
  <header className="lr-duo-nav">
   <button type="button" onClick={onExit} className="lr-duo-back" aria-label="Retour à la salle de jeux">‹ <span>Jeux</span></button>
   <span className="lr-duo-live"><span/> DUO EN DIRECT</span>
   <button type="button" className="lr-duo-chat" onClick={onOpenChat} aria-label="Ouvrir les messages">💬</button>
  </header>
  <div className="lr-duo-hero">
   <small>{mode==="draw"?"CRÉATIVITÉ À DEUX":"UNE AVENTURE À DEUX"}</small>
   <h1>{mode==="draw"?"Devine mon dessin":"Escape Room Duo"} <em>{mode==="draw"?"✏️":"🔐"}</em></h1>
   <p>{mode==="draw"?"Dessine, devine et échangez les rôles à chaque manche.":"Vos indices sont différents. Communiquez pour vous échapper ensemble."}</p>
  </div>
  {loading?<div className="lr-duo-panel lr-duo-center" role="status">Connexion à votre salle privée…</div>:
   !game||reply?.members!==2?
    <div className="lr-duo-panel lr-duo-center">
     <span className="lr-duo-large-icon">💞</span>
     <h2>Il faut être deux pour jouer</h2>
     <p>Invite ton partenaire dans votre espace privé Love Radar. Vous rejoindrez la même partie automatiquement.</p>
     <button type="button" className="lr-duo-primary" onClick={onOpenChat}>Ouvrir les messages</button>
    </div>:<>
    <div className="lr-duo-info">
     <span>{mode==="draw"?"MANCHE "+(draw?.round||1):"MISSION "+((escape?.scenario||0)+1)}</span>
     <strong className={remaining<=15?"urgent":""} aria-label="Temps restant">⏱ {clock(remaining)}</strong>
     <span>{mode==="draw"?"À TOUR DE RÔLE":"ENSEMBLE"}</span>
    </div>
    {draw?<div className="lr-duo-panel">
     <div className="lr-duo-score">
      <div><small>TOI · {myName}</small><strong>{drawScore}</strong></div>
      <span>VS</span>
      <div><small>{partnerName||"Mon amour"}</small><strong>{otherScore}</strong></div>
     </div>
     <div className="lr-duo-status" role="status">
      {ended?draw.status==="timeout"?"⏰ Temps écoulé !": "🎉 Mot découvert !":
       isDrawer?"À toi de dessiner. Ton partenaire doit deviner !":
       (partnerName||"Ton partenaire")+" dessine. À toi de deviner !"}
     </div>
     <div className="lr-duo-word">
      <small>{isDrawer?"TON MOT SECRET":ended?"LE MOT ÉTAIT":"CATÉGORIE"}</small>
      <strong>{isDrawer||ended?draw.word:draw.category}</strong>
     </div>
     <svg className={"lr-duo-canvas"+(canPaint?" can-draw":"")} viewBox="0 0 1000 1000" role="img"
      aria-label={isDrawer?"Zone pour dessiner avec le doigt ou la souris":"Le dessin de ton partenaire"}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}>
      <rect width="1000" height="1000" rx="34" fill="#17253c"/>
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
       {[...draw.strokes,...(pending?[pending]:[]),...(stroke?[stroke]:[])].map((line,index)=>
        <polyline key={index} points={line.points.map(p=>p.join(",")).join(" ")}
         stroke={line.color} strokeWidth={line.width*3.1}/>)}
      </g>
     </svg>
     {isDrawer&&!ended?<div className="lr-duo-tools">
      <div className="lr-duo-colors" aria-label="Choisir une couleur">{COLORS.map(c=>
       <button key={c} type="button" style={{background:c}} className={color===c?"active":""}
        aria-label={"Couleur "+c} aria-pressed={color===c} onClick={()=>setColor(c)} disabled={!!busy}/>)}</div>
      <div className="lr-duo-widths" aria-label="Épaisseur du crayon">{[2,4,7].map(w=>
       <button key={w} type="button" className={width===w?"active":""} aria-pressed={width===w}
        onClick={()=>setWidth(w)} disabled={!!busy}>● {w}</button>)}</div>
      <div className="lr-duo-actions">
       <button type="button" disabled={!!busy} onClick={()=>void act("clear")}>Effacer</button>
       <button type="button" disabled={!!busy} onClick={()=>void act("skip")}>Passer le mot</button>
      </div>
     </div>:null}
     {!isDrawer&&!ended?<form className="lr-duo-answer" onSubmit={submit}>
      <input aria-label="Quel est le dessin ?" placeholder="Quel est ce dessin ?" maxLength={48}
       value={draft} onChange={e=>setDraft(e.target.value)} disabled={!!busy}/>
      <button type="submit" disabled={!draft.trim()||!!busy}>Deviner</button>
     </form>:null}
     {ended?<div className="lr-duo-finish"><strong>{draw.status==="revealed"?"Bravo ! ❤️":"Une autre chance ? 💕"}</strong>
      <p>Le mot était : <b>{draw.word}</b>. À la prochaine manche, vous échangez les rôles.</p>
      <button type="button" className="lr-duo-primary" onClick={()=>void act("next")} disabled={!!busy}>Manche suivante →</button>
     </div>:null}
    </div>:null}
    {escape?<div className="lr-duo-panel lr-duo-escape">
     <div className="lr-duo-scene">
      <span aria-hidden="true">{escape.sceneEmoji}</span>
      <small>SCÉNARIO {escape.scenario+1} / 3</small>
      <h2>{escape.sceneTitle}</h2>
     </div>
     <div className="lr-duo-stages" aria-label="Progression des énigmes">
      {Array.from({length:escape.totalStages},(_,i)=><span key={i} className={i<escape.stage?"done":i===escape.stage?"current":""}>{i<escape.stage?"✓":i+1}</span>)}
     </div>
     {escape.status==="escaped"?<div className="lr-duo-finish lr-duo-end">
      <span className="lr-duo-large-icon">🏆</span><h2>Vous vous êtes échappés !</h2>
      <p>Mission accomplie ensemble. Vous pouvez découvrir une nouvelle salle.</p>
      <button type="button" className="lr-duo-primary" onClick={()=>void act("restart")} disabled={!!busy}>Salle suivante →</button>
     </div>:ended?<div className="lr-duo-finish lr-duo-end">
      <span className="lr-duo-large-icon">⌛</span><h2>Le temps est écoulé</h2>
      <p>Le défi est terminé, mais une nouvelle salle vous attend.</p>
      <button type="button" className="lr-duo-primary" onClick={()=>void act("restart")} disabled={!!busy}>Réessayer dans une autre salle →</button>
     </div>:<>
      <div className="lr-duo-puzzle-head">
       <small>ÉNIGME {escape.stage+1} SUR {escape.totalStages}</small>
       <h3>{escape.stageTitle}</h3><p>{escape.intro}</p>
      </div>
      <div className="lr-duo-clue"><small>🔎 TON INDICE PERSONNEL</small><strong>{escape.clue}</strong>
       <p>Ton partenaire possède l'autre partie. Échangez vos indices pour trouver la réponse.</p>
      </div>
      <form className="lr-duo-answer" onSubmit={submit}>
       <input aria-label="Réponse à l'énigme" placeholder={escape.placeholder} maxLength={48}
        value={draft} onChange={e=>setDraft(e.target.value)} disabled={!!busy}/>
       <button type="submit" disabled={!draft.trim()||!!busy}>Déverrouiller</button>
      </form>
      <p className="lr-duo-attempts">{escape.attempts} tentative{escape.attempts===1?"":"s"} · La progression est partagée en temps réel.</p>
     </>}
    </div>:null}
    <div className="lr-duo-footer">
     <button type="button" disabled={!!busy} onClick={()=>void act("invite")}>✉ Inviter {partnerName||"mon partenaire"}</button>
     <button type="button" onClick={onOpenChat}>💬 Parler ensemble</button>
    </div>
   </>}
  {feedback?<div className="lr-duo-feedback" role="status">{feedback}</div>:null}
  {error?<div className="lr-duo-error" role="alert">{error} <button type="button" onClick={()=>void refresh()}>Réessayer</button></div>:null}
 </section>;
}
