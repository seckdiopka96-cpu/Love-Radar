import {useCallback,useEffect,useRef,useState,type PointerEvent} from "react";
import "./together.css";

type Mode="heart"|"draw";
type Signal={id:string;sender_id:string;seat:number;kind:string;reply_to:string|null;created_at:number};
type DrawEvent={seq:number;id:string;seat:number;kind:string;content:{points?:number[][];color?:string;width?:number;x?:number;y?:number;text?:string};createdAt:number};
type LiveStroke={seat:number;points:number[][];color:string;width:number};
type ApiData={ok:boolean;error?:string;signals?:Signal[];focus?:Signal|null;events?:DrawEvent[];revision?:number;id?:string;invited?:boolean;partnerOnBoard?:boolean;liveStroke?:LiveStroke|null};
type Props={token:string;myName:string;partnerName:string|null;mySeat:number;onExit:()=>void;onOpenLocation:()=>void;focusKind?:"love-signal"|"draw-invite"|null;focusId?:string|null};
type Tool="pen"|"heart"|"text";
const COLORS=["#ef7ca7","#7b4ac2","#3e8fa7","#e7a549","#4b3b55","#ffffff"];
const RESPONSE_OPTIONS=[{kind:"heart",symbol:"❤️",text:"Moi aussi"},{kind:"kiss",symbol:"😘",text:"Je t’embrasse"},{kind:"love",symbol:"💖",text:"Je t’aime"}];
const api="/api/together";
function messageOf(signal:Signal){
 if(signal.kind==="miss")return "Tu me manques… ❤️";
 if(signal.kind==="kiss")return "Un bisou juste pour toi 😘";
 if(signal.kind==="love")return "Je t’aime 💖";
 return "Tu me manques aussi ❤️";
}
function pathOf(points:number[][]){
 return points.map((p,i)=>(i===0?"M":"L")+p[0]+" "+p[1]).join(" ");
}
export default function Together({token,myName,partnerName,mySeat,onExit,onOpenLocation,focusKind,focusId}:Props){
 const [mode,setMode]=useState<Mode>(()=>focusKind==="draw-invite"||new URLSearchParams(window.location.search).get("mode")==="draw"?"draw":"heart");
 const [signals,setSignals]=useState<Signal[]>([]);
 const [focused,setFocused]=useState<Signal|null>(null);
 const [onlyFocused,setOnlyFocused]=useState(Boolean(focusKind==="love-signal"&&focusId));
 const [events,setEvents]=useState<DrawEvent[]>([]);
 const [partnerOnBoard,setPartnerOnBoard]=useState(false);
 const [liveStroke,setLiveStroke]=useState<LiveStroke|null>(null);
 const [syncStatus,setSyncStatus]=useState<"connecting"|"synced"|"offline">("connecting");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [tool,setTool]=useState<Tool>("pen"),[color,setColor]=useState(COLORS[0]),[size,setSize]=useState(6),[note,setNote]=useState("");
 const [preview,setPreview]=useState<number[][]>([]);
 const [showClear,setShowClear]=useState(false);
 const svg=useRef<SVGSVGElement|null>(null),drawing=useRef<number[][]>([]);
 const active=useRef(true),requesting=useRef(false);
 const modeRef=useRef(mode),previewAt=useRef(0),previewBusy=useRef(false);
 const drawingPointer=useRef<number|null>(null),localMutation=useRef(0);
 modeRef.current=mode;
 const partner=partnerName||"Ton amour";
 const focusIdValid=focusKind==="love-signal"&&focusId&&/^[0-9a-f-]{36}$/i.test(focusId)?focusId:null;
 useEffect(()=>{
  if(focusKind==="draw-invite"){setMode("draw");setOnlyFocused(false)}
  if(focusKind==="love-signal"&&focusId){setMode("heart");setOnlyFocused(true)}
 },[focusKind,focusId]);
 const load=useCallback(async(silent=false)=>{
  if(requesting.current)return;
  requesting.current=true;
  const beforeMutation=localMutation.current;
  try{
   const query=mode==="draw"?"mode=draw":"mode=miss"+(focusIdValid?"&focus="+encodeURIComponent(focusIdValid):"");
   const res=await fetch(api+"?"+query,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
   const data=await res.json() as ApiData;
   if(!res.ok||!data.ok)throw Error(data.error||"L’espace Ensemble est indisponible.");
   if(!active.current||modeRef.current!==mode)return;
   if(mode==="draw"){
    if(beforeMutation===localMutation.current)setEvents(data.events||[]);
    setPartnerOnBoard(Boolean(data.partnerOnBoard));
    setLiveStroke(data.liveStroke||null);
   }else{setSignals(data.signals||[]);setFocused(data.focus||null)}
   setSyncStatus("synced");
   setError("");
  }catch(e){if(active.current&&modeRef.current===mode){setSyncStatus("offline");if(!silent)setError(e instanceof Error?e.message:"Impossible de se connecter.")}}
  finally{requesting.current=false;if(active.current)setLoading(false)}
 },[mode,token,focusIdValid]);
 useEffect(()=>{
  active.current=true;setLoading(true);setSyncStatus("connecting");void load();
  const interval=window.setInterval(()=>{if(document.visibilityState==="visible")void load(true)},mode==="draw"?650:2200);
  const visible=()=>{if(document.visibilityState==="visible")void load(true)};
  document.addEventListener("visibilitychange",visible);
  return()=>{active.current=false;window.clearInterval(interval);document.removeEventListener("visibilitychange",visible)};
 },[load,mode]);
 const sendPresence=useCallback(async(drawingNow:boolean,points:number[][]=[],strokeColor=COLORS[0],width=6)=>{
  if(document.visibilityState!=="visible"&&drawingNow)return;
  if(previewBusy.current)return;
  previewBusy.current=true;
  try{
   const res=await fetch(api,{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action:"presence",drawing:drawingNow,...(drawingNow?{points,color:strokeColor,width}:{})})});
   if(!res.ok)throw Error("Présence non synchronisée");
  }catch{if(active.current&&modeRef.current==="draw")setSyncStatus("offline")}
  finally{previewBusy.current=false}
 },[token]);
 useEffect(()=>{
  if(mode!=="draw")return;
  // Both phones can see whether the other is currently in the drawing room.
  void sendPresence(false);
  const ping=window.setInterval(()=>{
   if(document.visibilityState==="visible"&&!drawing.current.length)void sendPresence(false);
  },7500);
  const visible=()=>{
   if(document.visibilityState==="visible")void sendPresence(false);
  };
  document.addEventListener("visibilitychange",visible);
  return()=>{
   window.clearInterval(ping);document.removeEventListener("visibilitychange",visible);
   void sendPresence(false);
  };
 },[mode,sendPresence]);
 const post=async(body:Record<string,unknown>,quiet=false)=>{
  if(busy&&!quiet)return false;
  if(!quiet)setBusy(true);
  const isCanvasEdit=body.action==="draw"||body.action==="undo"||body.action==="clear";
  if(isCanvasEdit)localMutation.current++;
  setError("");setNotice("");
  try{
   const res=await fetch(api,{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await res.json() as ApiData;
   if(!res.ok||!data.ok)throw Error(data.error||"Impossible d’envoyer.");
   if(active.current){
    if(body.action==="miss"||body.action==="reply"){if(data.signals)setSignals(data.signals);if(data.focus!==undefined)setFocused(data.focus||null)}
    else if(data.events)setEvents(data.events);
    if(body.action==="miss")setNotice("Ton cœur est parti vers "+partner+" ! 💗");
    else if(body.action==="reply")setNotice("Ta réponse a été envoyée. 💌");
    else if(body.action==="invite_draw")setNotice("Invitation envoyée ! Ton partenaire pourra ouvrir votre tableau 🎨");
    else if(body.action==="undo")setNotice("Ton dernier trait a été retiré.");
    else if(body.action==="clear")setNotice("Votre tableau est prêt pour un nouveau dessin.");
   }
   return true;
  }catch(e){if(active.current)setError(e instanceof Error?e.message:"Envoi impossible.");return false}
  finally{if(active.current&&!quiet)setBusy(false)}
 };
 const selected=onlyFocused?(focused||signals.find(s=>s.id===focusIdValid)||null):null;
 const latestMiss=signals.filter(s=>s.kind==="miss").slice(-1)[0];
 const canReply=(signal:Signal)=>signal.kind==="miss"&&signal.seat!==mySeat&&!signals.some(s=>s.seat===mySeat&&s.reply_to===signal.id);
 function coord(e:PointerEvent<SVGSVGElement>){
  const rect=svg.current?.getBoundingClientRect();
  if(!rect||!rect.width||!rect.height)return null;
  // The board is a square with a square SVG viewBox, so there are no letterbox offsets.
  const side=Math.min(rect.width,rect.height);
  const left=rect.left+(rect.width-side)/2,top=rect.top+(rect.height-side)/2;
  return [Math.max(0,Math.min(1000,Math.round((e.clientX-left)/side*1000))),
   Math.max(0,Math.min(1000,Math.round((e.clientY-top)/side*1000)))];
 }
 async function onBoardPoint(x:number,y:number){
  if(tool==="heart"){void post({action:"draw",kind:"heart",x,y})}
  else if(tool==="text"){
   const value=note.trim();
   if(!value){setError("Écris d’abord ton petit mot dans le champ ✍️");return}
   if(await post({action:"draw",kind:"text",x,y,text:value}))setNote("");
  }
 }
 const pointerDown=(e:PointerEvent<SVGSVGElement>)=>{
  if(e.pointerType==="mouse"&&e.button!==0)return;
  const point=coord(e);if(!point)return;
  e.preventDefault();
  if(tool!=="pen"){void onBoardPoint(point[0],point[1]);return}
  if(drawingPointer.current!==null)return;
  drawingPointer.current=e.pointerId;
  svg.current?.setPointerCapture(e.pointerId);
  drawing.current=[point];setPreview([point]);
 };
 const pointerMove=(e:PointerEvent<SVGSVGElement>)=>{
  if(!drawing.current.length||tool!=="pen"||drawingPointer.current!==e.pointerId)return;
  const point=coord(e);if(!point)return;
  e.preventDefault();
  const last=drawing.current.at(-1)!;
  if(Math.hypot(point[0]-last[0],point[1]-last[1])<5)return;
  if(drawing.current.length>=155)return;
  drawing.current=[...drawing.current,point];setPreview(drawing.current);
  const now=Date.now();
  if(now-previewAt.current>420&&drawing.current.length>1){
   previewAt.current=now;void sendPresence(true,drawing.current,color,size);
  }
 };
 const pointerUp=(e:PointerEvent<SVGSVGElement>)=>{
  if(!drawing.current.length||drawingPointer.current!==e.pointerId)return;
  e.preventDefault();
  const points=drawing.current;
  drawingPointer.current=null;
  drawing.current=[];setPreview([]);
  if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId);
  if(points.length===1)points.push([Math.min(1000,points[0][0]+1),Math.min(1000,points[0][1]+1)]);
  void post({action:"draw",kind:"stroke",points,color,width:size},true)
   .finally(()=>{void sendPresence(false)});

 };
 const drawEvent=(event:DrawEvent)=>{
  if(event.kind==="stroke"&&event.content.points)return <path key={event.id} d={pathOf(event.content.points)} fill="none" stroke={event.content.color||COLORS[0]} strokeWidth={event.content.width||6} strokeLinecap="round" strokeLinejoin="round"/>;
  if(event.kind==="grid")return <g key={event.id} stroke="#9a6c87" strokeWidth="5" strokeLinecap="round" opacity=".82" pointerEvents="none">
   <path d="M 416 240 L 416 760 M 584 240 L 584 760 M 250 413 L 750 413 M 250 587 L 750 587" fill="none"/>
  </g>;
  if(event.kind==="heart")return <text key={event.id} x={event.content.x} y={event.content.y} dominantBaseline="central" textAnchor="middle" fontSize={94}>❤️</text>;
  if(event.kind==="text")return <text key={event.id} x={event.content.x} y={event.content.y} textAnchor="middle" fontSize={35} fill="#49334c" fontWeight="700" paintOrder="stroke" stroke="#fff9f2" strokeWidth="7">{event.content.text}</text>;
  return null;
 };
 return <section className="tg-page" aria-label="Ensemble, votre espace privé à deux">
  <header className="tg-top">
   <button type="button" onClick={onExit} className="tg-back">‹ Accueil</button>
   <div className="tg-brand"><strong>Nous deux <span>♡</span></strong><small>LOVE RADAR · TOUJOURS ENSEMBLE</small></div>
   <span className="tg-top-heart">♥</span>
  </header>
  <button type="button" className="tg-location-link" onClick={onOpenLocation}>📍 Demander la position de mon amour (avec son accord) →</button>
  <div className="tg-modes" role="tablist" aria-label="Choisir notre activité">
   <button role="tab" type="button" aria-selected={mode==="heart"} className={mode==="heart"?"selected":""} onClick={()=>{setMode("heart");setOnlyFocused(false)}}>💗 Tu me manques</button>
   <button role="tab" type="button" aria-selected={mode==="draw"} className={mode==="draw"?"selected":""} onClick={()=>{setMode("draw");setOnlyFocused(false)}}>🎨 Dessiner ensemble</button>
  </div>
  {mode==="heart"?<div className="tg-heart-screen" role="tabpanel">
   {selected?<div className="tg-direct-notice"><span>Notification reçue</span><strong>{selected.seat===mySeat?"Tu as envoyé ce cœur":partner+" pense à toi"}</strong><button type="button" onClick={()=>setOnlyFocused(false)}>Voir nos autres cœurs →</button></div>:null}
   <div className="tg-heart-center">
    <span className="tg-heart-kicker">TOUJOURS UN PEU PLUS PRÈS</span>
    <span className="tg-heart-animation" aria-hidden="true">♥</span>
    <h1>Un petit cœur,<br/><em>juste pour toi.</em></h1>
    <p>Même à distance, une pensée peut traverser le monde.</p>
    {!selected?<button type="button" className="tg-send-heart" disabled={busy||!partnerName} onClick={()=>void post({action:"miss"})}>💗 Tu me manques</button>:null}
    {!partnerName?<small>Invite ton partenaire à rejoindre votre espace pour lui envoyer un cœur.</small>:null}
   </div>
   <div className="tg-heart-feed">
    <div className="tg-heart-feed-title"><strong>{selected?"Ce cœur reçu":"Nos petits mots"}</strong><span>♡</span></div>
    {loading&&!signals.length?<p>Chargement des cœurs…</p>:
     (selected?[selected]:signals.slice(-9).reverse()).length===0?<p>Votre premier petit cœur vous attend. 💞</p>:
     (selected?[selected]:signals.slice(-9).reverse()).map(signal=><article key={signal.id} className={"tg-signal"+(signal.seat===mySeat?" sent":" received")}>
      <span className="tg-signal-avatar">{signal.seat===mySeat?myName.slice(0,1).toUpperCase():partner.slice(0,1).toUpperCase()}</span>
      <div className="tg-signal-content"><small>{signal.seat===mySeat?"Toi":partner} · {new Date(signal.created_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small>
       <strong>{messageOf(signal)}</strong>
       {canReply(signal)?<div className="tg-reply-options">{RESPONSE_OPTIONS.map(r=><button key={r.kind} type="button" disabled={busy} onClick={()=>void post({action:"reply",kind:r.kind,replyTo:signal.id})}>{r.symbol} {r.text}</button>)}</div>:null}
      </div>
     </article>)}
    {latestMiss?.seat!==mySeat?<p className="tg-vocal-hint">🎙️ Pour envoyer un vocal, ouvre aussi votre conversation.</p>:null}
   </div>
  </div>:
  <div className="tg-draw-screen" role="tabpanel">
   <div className="tg-draw-heading"><div><strong>Notre tableau à deux 💞</strong><small>Vous dessinez sur le même tableau privé.</small><span className={"tg-sync-indicator "+(syncStatus==="offline"?"is-offline":"")} role="status">
    {syncStatus==="offline"?"⚠️ Connexion interrompue — nouvelle tentative…":syncStatus==="connecting"?"⏳ Connexion au tableau…":partnerOnBoard?"🟢 "+partner+" est sur le tableau":"✓ Tableau synchronisé · En attente de "+partner}
   </span></div><button type="button" className="tg-invite" disabled={busy||!partnerName} onClick={()=>void post({action:"invite_draw"})}>🔔 Inviter</button></div>
   <div className="tg-draw-tools" role="toolbar" aria-label="Outils de dessin">
    <button type="button" className={tool==="pen"?"active":""} aria-pressed={tool==="pen"} onClick={()=>setTool("pen")}>✏️ Dessin</button>
    <button type="button" className={tool==="heart"?"active":""} aria-pressed={tool==="heart"} onClick={()=>setTool("heart")}>❤️ Cœur</button>
    <button type="button" className={tool==="text"?"active":""} aria-pressed={tool==="text"} onClick={()=>setTool("text")}>✍️ Texte</button>
    <button type="button" disabled={busy} title="Afficher une grille de morpion. Dessinez vos X et O avec le stylo." onClick={()=>{setTool("pen");void post({action:"draw",kind:"grid"})}}>⌗ Morpion</button>
   </div>
   <div className="tg-board-wrap">
    <svg ref={svg} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" className="tg-board" role="img" aria-label="Tableau blanc partagé où l'on dessine avec le doigt"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
     <rect width="1000" height="1000" fill="#fff9f3"/>
     <g opacity=".35" stroke="#e9d8dc" strokeWidth="1">{Array.from({length:20},(_,i)=><g key={i}><line x1={(i+1)*50} y1="0" x2={(i+1)*50} y2="1000"/><line x1="0" y1={(i+1)*50} x2="1000" y2={(i+1)*50}/></g>)}</g>
     {events.map(drawEvent)}
     {liveStroke?.points?.length>1?<path d={pathOf(liveStroke.points)} stroke={liveStroke.color} strokeWidth={liveStroke.width} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".75" strokeDasharray="4 3" pointerEvents="none"/>:null}
     {preview.length>0?<path d={pathOf(preview)} stroke={color} strokeWidth={size} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>:null}
    </svg>
    {loading&&!events.length?<div className="tg-board-loading">Ouverture de votre tableau…</div>:null}
   </div>
   <div className="tg-draw-bottom">
    {tool==="text"?<label className="tg-draw-note">Ton petit mot <input value={note} maxLength={52} onChange={e=>setNote(e.target.value)} placeholder="Écris, puis touche le tableau…" /></label>:
     <div className="tg-draw-colors" aria-label="Couleurs du stylo">{COLORS.map(c=><button key={c} type="button" className={color===c?"active":""} style={{backgroundColor:c}} aria-label={"Couleur "+c} aria-pressed={color===c} onClick={()=>{setColor(c);setTool("pen")}}/>)}</div>}
    <div className="tg-bottom-actions">
     <div className="tg-stroke-widths"><button type="button" onClick={()=>setSize(3)} className={size===3?"active":""} aria-label="Trait fin">·</button><button type="button" onClick={()=>setSize(6)} className={size===6?"active":""} aria-label="Trait moyen">●</button><button type="button" onClick={()=>setSize(10)} className={size===10?"active":""} aria-label="Trait épais">⬤</button></div>
     <button type="button" disabled={busy} onClick={()=>void post({action:"undo"})}>↶ Annuler</button>
     <button type="button" onClick={()=>setShowClear(true)}>Effacer tout</button>
    </div>
    <small>Les deux téléphones se synchronisent automatiquement lorsque ce tableau est ouvert. Les traits en cours apparaissent progressivement.</small>
   </div>
  </div>}
  {error?<p className="tg-floating-alert" role="alert">{error}</p>:null}
  {notice?<p className="tg-floating-alert tg-floating-success" role="status">{notice}</p>:null}
  {showClear?<div className="tg-modal-backdrop"><div className="tg-modal" role="dialog" aria-modal="true" aria-label="Effacer votre dessin">
   <h2>Effacer le tableau ?</h2><p>Les traits des deux partenaires seront effacés de votre tableau commun.</p>
   <button type="button" onClick={()=>{setShowClear(false);void post({action:"clear"})}}>Oui, effacer tout</button>
   <button type="button" className="tg-cancel" onClick={()=>setShowClear(false)}>Garder notre dessin</button>
  </div></div>:null}
 </section>;
}
