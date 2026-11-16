import {useEffect,useState} from "react";
import {approvePartnerGrant,cancelPartnerGrant,createPartnerGrant,pendingPartnerGrant} from "./partner-recovery-client";
import {wrapRoomKeyForPartner,type RoomKeyBinding,type RecoveryWrapInfo} from "./e2ee";
import "./partner-recovery.css";
type Props={token:string;myId:string;partnerId:string|null;roomId:string;minePublic:string|null;partnerPublic:string|null;required:boolean};
type Grant={id:string;code:string;partner:string;expiresAt:number;required:boolean};
type Pending={status?:string;id?:string;verifyCode?:string|null;ephemeralPublic?:string|null;expiresAt?:number;partner?:string;required?:boolean;error?:string};
export default function PartnerRecoverySponsor({token,myId,partnerId,roomId,minePublic,partnerPublic,required}:Props){
 const [grant,setGrant]=useState<Grant|null>(null);
 const [pending,setPending]=useState<Pending|null>(null);
 const [typedCode,setTypedCode]=useState("");
 const [checked,setChecked]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 useEffect(()=>{
  let alive=true;
  async function poll(){
   try{
    const result=await pendingPartnerGrant(token);
    if(alive)setPending(result);
   }catch{/* Network errors do not revoke a pending request. */}
  }
  void poll();
  const timer=setInterval(()=>void poll(),5000);
  return()=>{alive=false;clearInterval(timer)};
 },[token]);
 async function start(){
  setBusy(true);setError("");setSuccess("");
  try{
   const result=await createPartnerGrant(token);
   setGrant(result);setPending({id:result.id,status:"issued",partner:result.partner,required:result.required});
   setChecked(false);setTypedCode("");
  }catch(e){setError(e instanceof Error?e.message:"Impossible de préparer la récupération.")}
  finally{setBusy(false)}
 }
 async function approve(){
  if(!pending?.id||!pending.ephemeralPublic||!pending.verifyCode||!partnerId||busy||!checked)return;
  if(typedCode.trim()!==pending.verifyCode){setError("Les six chiffres ne correspondent pas. Vérifie directement avec ton partenaire.");return}
  setBusy(true);setError("");
  try{
   let envelope:string|null=null;
   if(required){
    if(!minePublic||!partnerPublic)throw Error("Les clés de chiffrement de votre conversation sont absentes.");
    const binding:RoomKeyBinding={roomId,mineId:myId,partnerId,minePublicKey:minePublic,partnerPublicKey:partnerPublic};
    const info:RecoveryWrapInfo={id:pending.id,roomId,sponsorId:myId,targetId:partnerId,ephemeralPublic:pending.ephemeralPublic};
    envelope=await wrapRoomKeyForPartner(binding,info);
   }
   await approvePartnerGrant(token,pending.id,pending.verifyCode,envelope);
   setSuccess("Accès approuvé. Ton partenaire peut retrouver son ancien compte et, si la clé a été transférée, ses messages chiffrés.");
   setGrant(null);setPending({status:"approved"});setTypedCode("");setChecked(false);
  }catch(e){setError(e instanceof Error?e.message:"Approbation impossible.")}
  finally{setBusy(false)}
 }
 async function cancel(){
  if(!pending?.id||busy)return;
  setBusy(true);setError("");
  try{await cancelPartnerGrant(token,pending.id);setGrant(null);setPending({status:"none"});setTypedCode("");setChecked(false)}
  catch(e){setError(e instanceof Error?e.message:"Annulation impossible.")}
  finally{setBusy(false)}
 }
 const active=pending?.status==="issued"||pending?.status==="claimed";
 return <section className="lr-partner-recovery lr-settings-recovery" aria-label="Récupération par le partenaire">
  <strong>🔓 Aider mon partenaire à récupérer son compte</strong>
  <small>Si ton partenaire a perdu son code personnel, tu peux lui redonner accès à son compte existant, sans créer de nouvel espace. Cette autorisation est valable 15 minutes.</small>
  {required?<small>🔐 Tu devras aussi transférer votre clé de conversation chiffrée. Elle ne sera jamais envoyée en clair au serveur.</small>:null}
  {!active?<button type="button" disabled={busy||!partnerId} onClick={()=>void start()}>
   {busy?"Préparation…":"Créer un code temporaire pour mon partenaire"}</button>:null}
  {grant&&active?<div className="lr-partner-recovery-secret">
   <span>Code à transmettre uniquement à {grant.partner} :</span>
   <code>{grant.code.match(/.{1,8}/g)?.join("-")}</code>
   <button type="button" onClick={()=>void navigator.clipboard.writeText(grant.code).catch(()=>setError("Copie le code manuellement."))}>Copier le code</button>
  </div>:active?<small>Une demande de récupération est en cours. Le code temporaire n’est affiché qu’à sa création ; tu peux annuler et en créer un nouveau.</small>:null}
  {pending?.status==="issued"?<p className="lr-partner-recovery-hint">Ton partenaire doit ouvrir « J’ai perdu mon accès », choisir « Mon partenaire est connecté » et entrer le code temporaire.</p>:null}
  {pending?.status==="claimed"&&pending.id&&pending.verifyCode?<div className="lr-partner-recovery-approve">
   <strong>Demande reçue de {pending.partner||"ton partenaire"}</strong>
   <p>⚠ Appelle ton partenaire directement et demande-lui les six chiffres affichés sur son propre téléphone. N’approuve jamais quelqu’un que tu ne reconnais pas.</p>
   <label htmlFor="lr-partner-verify-input">Code à six chiffres dicté par ton partenaire</label>
   <input id="lr-partner-verify-input" type="text" inputMode="numeric" autoComplete="off"
    maxLength={6} placeholder="000000" value={typedCode} onChange={e=>setTypedCode(e.target.value.replace(/\D/g,"").slice(0,6))}/>
   <label className="lr-partner-recovery-confirm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
    Je confirme avoir parlé à mon partenaire et comparé son code.</label>
   <button type="button" disabled={busy||!checked||typedCode.length!==6} onClick={()=>void approve()}>
    {busy?"Transfert chiffré…":"Approuver et restaurer son compte"}</button>
  </div>:null}
  {active?<button type="button" className="lr-partner-recovery-cancel" disabled={busy} onClick={()=>void cancel()}>Annuler la demande</button>:null}
  {error?<p role="alert" className="lr-partner-recovery-error">{error}</p>:null}
  {success?<p role="status" className="lr-partner-recovery-success">{success}</p>:null}
  <small>Seul ton partenaire peut utiliser le code temporaire. Ce mécanisme remplace sa connexion, pas les identifiants de votre couple.</small>
 </section>;
}
