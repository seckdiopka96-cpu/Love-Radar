import {useEffect,useRef,useState} from "react";
import {apiFetch} from "./api";
import {CHAT_WALLPAPERS,CHAT_COLORS,CHAT_BUBBLES,
 DEFAULT_CHAT_THEME,parseChatTheme,type ChatTheme} from "./chat-themes";
import "./chat-themes.css";

type Props={
 token:string;roomId:string;theme:ChatTheme;
 onChange:(next:ChatTheme)=>void;
};
const WALLPAPERS:Record<typeof CHAT_WALLPAPERS[number],{title:string;desc:string;icon:string}>={
 minuit:{title:"Minuit",desc:"Notre classique",icon:"🌙"},
 constellation:{title:"Étoiles",desc:"Ciel scintillant",icon:"✨"},
 aurore:{title:"Aurore",desc:"Lumières qui dansent",icon:"🌌"},
 coeurs:{title:"Petits cœurs",desc:"Douceur animée",icon:"💕"}
};
const COLORS:Record<typeof CHAT_COLORS[number],{title:string;icon:string}>={
 rose:{title:"Rose",icon:"🌸"},ocean:{title:"Océan",icon:"🩵"},
 lavande:{title:"Lavande",icon:"💜"},ambre:{title:"Ambre",icon:"🧡"}
};
const BUBBLES:Record<typeof CHAT_BUBBLES[number],string>={
 classique:"Classiques",douce:"Douces",compacte:"Compactes"
};
export default function ChatThemePicker({token,roomId,theme,onChange}:Props){
 const [open,setOpen]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const savingRef=useRef(false);
 const confirmedRef=useRef<ChatTheme>(DEFAULT_CHAT_THEME);
 const versionRef=useRef(0);
 useEffect(()=>{
  let alive=true;
  setOpen(false);setSaving(false);setError("");setNotice("");
  savingRef.current=false;
  confirmedRef.current=DEFAULT_CHAT_THEME;
  versionRef.current=0;
  onChange(DEFAULT_CHAT_THEME);
  let reading=false;
  async function refresh(){
   if(!alive||savingRef.current||reading||document.visibilityState==="hidden")return;
   reading=true;
   try{
    const result=await apiFetch("/api/chat-theme",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!result.ok)throw Error("Thème indisponible");
    const body=await result.json() as {theme?:unknown};
    if(!alive||savingRef.current)return;
    const latest=parseChatTheme(body.theme);
    if(latest.version>=versionRef.current){
     versionRef.current=latest.version;confirmedRef.current=latest;onChange(latest);
    }
   }catch{/* Keep the last confirmed theme during an offline handoff. */}
   finally{reading=false}
  }
  void refresh();
  const timer=window.setInterval(()=>{void refresh()},8000);
  const wake=()=>{if(document.visibilityState==="visible")void refresh()};
  document.addEventListener("visibilitychange",wake);
  window.addEventListener("focus",wake);
  return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",wake);
   window.removeEventListener("focus",wake)};
 },[token,roomId,onChange]);
 useEffect(()=>{
  if(!open)return;
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};
  document.addEventListener("keydown",escape);
  return()=>document.removeEventListener("keydown",escape);
 },[open]);
 async function change(patch:Partial<Pick<ChatTheme,"wallpaper"|"color"|"bubble"|"animated">>){
  if(savingRef.current)return;
  const next={...theme,...patch}; const previous=confirmedRef.current;
  savingRef.current=true;setSaving(true);setError("");setNotice("");onChange(next);
  try{
   const result=await apiFetch("/api/chat-theme",{method:"POST",cache:"no-store",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({wallpaper:next.wallpaper,color:next.color,bubble:next.bubble,animated:next.animated})});
   const body=await result.json() as {ok?:boolean;error?:string;theme?:unknown};
   if(!result.ok||!body.ok||!body.theme)throw Error(body.error||"Enregistrement impossible.");
   const saved=parseChatTheme(body.theme);
   versionRef.current=saved.version;confirmedRef.current=saved;onChange(saved);
   setNotice("Thème partagé avec ton partenaire ✓");
  }catch(reason){
   onChange(previous);
   setError(reason instanceof Error?reason.message:"Impossible de partager ce thème.");
  }finally{savingRef.current=false;setSaving(false)}
 }
 return <>
  <button className="lr-chat-theme-trigger" type="button" aria-label="Personnaliser les thèmes de conversation"
   title="Personnaliser notre conversation" aria-haspopup="dialog" aria-expanded={open}
   onClick={()=>setOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
   stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
   <path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.6-3.2 1.8 1.8 0 0 1 .9-2.8h2A3.3 3.3 0 0 0 21 11.7 9 9 0 0 0 12 3Z"/>
   <circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="16" cy="9" r="1"/>
   <circle cx="9.5" cy="16" r="1"/></svg></button>
  {open?<div className="lr-chat-theme-backdrop" onClick={()=>setOpen(false)}>
   <section className="lr-chat-theme-sheet" role="dialog" aria-modal="true" aria-labelledby="lr-chat-theme-title"
    onClick={event=>event.stopPropagation()}>
    <header className="lr-chat-theme-top"><div>
     <small>100 % GRATUIT · PARTAGÉ À DEUX</small>
     <h2 id="lr-chat-theme-title">Notre conversation ✨</h2>
     <p>Décore ton chat. Le même thème apparaît sur vos deux téléphones.</p>
    </div><button type="button" className="lr-chat-theme-close" onClick={()=>setOpen(false)} aria-label="Fermer">×</button></header>
    <div className="lr-chat-theme-scroll">
     <fieldset className="lr-chat-theme-field"><legend>Fond de discussion</legend>
      <div className="lr-chat-theme-grid">
      {CHAT_WALLPAPERS.map(id=><button type="button" key={id} disabled={saving}
       aria-pressed={theme.wallpaper===id} className={"lr-chat-theme-swatch lr-chat-theme-swatch-"+id+(theme.wallpaper===id?" selected":"")}
       onClick={()=>void change({wallpaper:id})}>
       <span className="lr-chat-theme-preview"><b aria-hidden="true">{WALLPAPERS[id].icon}</b></span>
       <strong>{WALLPAPERS[id].title}</strong><small>{WALLPAPERS[id].desc}</small>
      </button>)}</div>
     </fieldset>
     <fieldset className="lr-chat-theme-field"><legend>Couleur des bulles</legend>
      <div className="lr-chat-theme-colors">{CHAT_COLORS.map(id=><button type="button" key={id}
       disabled={saving} aria-pressed={theme.color===id} className={"lr-chat-theme-color lr-chat-theme-color-"+id+(theme.color===id?" selected":"")}
       onClick={()=>void change({color:id})}><span aria-hidden="true">{COLORS[id].icon}</span>{COLORS[id].title}</button>)}</div>
     </fieldset>
     <fieldset className="lr-chat-theme-field"><legend>Forme des messages</legend>
      <div className="lr-chat-theme-bubbles">{CHAT_BUBBLES.map(id=><button type="button" key={id}
       disabled={saving} aria-pressed={theme.bubble===id} className={theme.bubble===id?"selected":""}
       onClick={()=>void change({bubble:id})}>{BUBBLES[id]}</button>)}</div>
     </fieldset>
     <label className="lr-chat-theme-motion"><span>✨ Fond animé<small>Désactive pour un affichage fixe et plus économe.</small></span>
      <input type="checkbox" disabled={saving} checked={theme.animated}
       onChange={event=>void change({animated:event.target.checked})}/></label>
     <button type="button" className="lr-chat-theme-reset" disabled={saving} onClick={()=>void change({
      wallpaper:"minuit",color:"rose",bubble:"classique",animated:true
     })}>↺ Revenir au thème original</button>
     {saving?<p className="lr-chat-theme-saving" role="status">Synchronisation avec ton amour…</p>:null}
     {notice?<p className="lr-chat-theme-saved" role="status">{notice}</p>:null}
     {error?<p className="lr-chat-theme-error" role="alert">{error}</p>:null}
    </div>
   </section>
  </div>:null}
 </>;
}
