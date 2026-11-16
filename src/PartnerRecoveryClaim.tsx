import {useEffect,useState} from "react";
import {beginPartnerClaim,finishPartnerClaim,getPartnerClaim,clearPartnerClaim} from "./partner-recovery-client";
import "./partner-recovery.css";
type Pending=NonNullable<Awaited<ReturnType<typeof getPartnerClaim>>>;
export default function PartnerRecoveryClaim({onRecovered}:{onRecovered:(token:string)=>void}){
 const [code,setCode]=useState("");
 const [pending,setPending]=useState<Pending|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 useEffect(()=>{
  let active=true;
  void getPartnerClaim().then(value=>{if(active)setPending(value)}).catch(()=>{});
  return()=>{active=false};
 },[]);
 useEffect(()=>{
  if(!pending)return;
  let active=true,working=false;
  const poll=async()=>{
   if(working||!active)return;working=true;
   try{
    const outcome=await finishPartnerClaim(pending);
    if(!active)return;
    if(outcome.status==="approved"&&outcome.token){
     setSuccess(outcome.restoredHistory?
      "Clé de conversation restaurée. Récupération de tes anciens messages…":
      "Compte restauré. Chargement de tes anciens messages…");
     await clearPartnerClaim();
     onRecovered(outcome.token);
    }else if(outcome.status==="cancelled"){
     setError("Ton partenaire a annulé la demande. Demande un nouveau code.");
     setPending(null);await clearPartnerClaim();
    }
   }catch(e){
    if(active){
     const message=e instanceof Error?e.message:"Vérification impossible.";
     if(/expir|introuvable/i.test(message)){setPending(null);void clearPartnerClaim()}
     setError(message);
    }
   }finally{working=false}
  };
  void poll();
  const handle=setInterval(()=>void poll(),4000);
  return()=>{active=false;clearInterval(handle)};
 },[pending,onRecovered]);
 async function start(event:React.FormEvent){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");setSuccess("");
  try{
   const result=await beginPartnerClaim(code);
   setPending(result);setCode("");
  }catch(e){setError(e instanceof Error?e.message:"Code temporaire incorrect.")}
  finally{setBusy(false)}
 }
 return <div className="lr-partner-recovery lr-partner-recovery-claim">
  <strong>❤️ Récupérer mon compte avec mon partenaire</strong>
  <p>Ton partenaire, toujours connecté, peut créer un code temporaire dans Paramètres → Compte et invitation. Il doit te l’envoyer directement.</p>
  {pending?<div className="lr-partner-recovery-check">
   <strong>Demande envoyée !</strong>
   <span>Lis ce code à ton partenaire par téléphone. Il doit correspondre à celui qu’il voit :</span>
   <output aria-label="Code de vérification">{pending.verifyCode}</output>
   <small>En attente de son approbation. Ne ferme pas cette page pendant la récupération.</small>
  </div>:<form onSubmit={event=>void start(event)}>
   <label htmlFor="lr-partner-code">Code temporaire reçu de ton partenaire</label>
   <input id="lr-partner-code" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
    value={code} maxLength={40} onChange={e=>setCode(e.target.value.toUpperCase())}
    placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" required/>
   <button type="submit" disabled={busy||code.replace(/[\s-]/g,"").length!==32}>
    {busy?"Vérification…":"Demander la récupération de mon ancien compte"}</button>
  </form>}
  {success?<p className="lr-partner-recovery-success" role="status">{success}</p>:null}
  {error?<p className="lr-partner-recovery-error" role="alert">{error}</p>:null}
  <small>Nous restaurons ton compte existant et sa conversation. Les messages supprimés définitivement ou les clés irrécupérables ne peuvent pas être recréés.</small>
 </div>;
}
