import {useState} from "react";
import "./recovery.css";

/** Never persist a recovery secret in browser storage or logs. */
export default function RecoveryCodeDialog({code,onClose}:{code:string;onClose:()=>void}){
 const [ack,setAck]=useState(false);
 const [copied,setCopied]=useState(false);
 const visible=code.match(/.{1,8}/g)?.join("-")||code;
 async function copy(){
  try{await navigator.clipboard.writeText(visible);setCopied(true)}
  catch{setCopied(false)}
 }
 return <div className="lr-recovery-backdrop">
  <div className="lr-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="lr-recovery-title" aria-describedby="lr-recovery-description">
   <span className="lr-recovery-symbol" aria-hidden="true">🔐</span>
   <h2 id="lr-recovery-title">Garde ton accès en sécurité</h2>
   <p id="lr-recovery-description">Voici ton <strong>code personnel de secours</strong>. En cas de perte ou de changement de téléphone, il te permettra de retrouver ton propre espace.</p>
   <div className="lr-recovery-secret" aria-label="Code personnel de secours">{visible}</div>
   <button type="button" className="lr-recovery-copy" onClick={()=>void copy()}>{copied?"✓ Code copié":"Copier le code de secours"}</button>
   <p className="lr-recovery-warning">Enregistre-le dans un endroit sûr, en dehors de l’application. Il est secret, différent du code d’invitation et ne sera plus affiché après fermeture. Le précédent code est annulé.</p>
   <label className="lr-recovery-confirm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> J’ai sauvegardé mon code dans un endroit sûr.</label>
   <button type="button" className="lr-recovery-close" disabled={!ack} onClick={onClose}>Continuer vers notre espace</button>
  </div>
 </div>;
}
