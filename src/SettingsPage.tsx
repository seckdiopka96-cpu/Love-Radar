import "./settings-page.css";
import ConnectionDiagnostics from "./ConnectionDiagnostics";
import PartnerRecoverySponsor from "./PartnerRecoverySponsor";
import {useEffect,useState} from "react";
import {apiFetch} from "./api";
type Props={
 name:string;code:string;owner:boolean;token:string;avatarSrc?:string;avatarVersion?:number;
 recoveryMemberId:string;recoveryPartnerId:string|null;recoveryRoomId:string;
 profileBusy:boolean;profileError:string;
 recoveryBusy:boolean;onGenerateRecovery:()=>void;
 e2ee?:{mine:string|null;partner:string|null;required:boolean};
 e2eeBusy:boolean;e2eeBackup:string;e2eeOwnCode:string;e2eePartnerCode:string;e2eeDeviceReady:boolean;e2eeVerified:boolean;
 onEnableE2EE:(passphrase:string)=>void;onFinishE2EE:()=>void;
 onRestoreE2EE:(file:File,passphrase:string)=>void;onVerifyPartnerKey:()=>void;
 privacyEnabled:boolean;
 notificationsOn:boolean;notificationsBusy:boolean;notificationsTesting:boolean;notificationsHint:string;
 nativeApp:boolean;plusActive:boolean;onOpenPlus:()=>void;
 onBack:()=>void;onChoosePhoto:()=>void;onAdjustPhoto:()=>void;onRemovePhoto:()=>void;
 onPrivacyChange:(enabled:boolean)=>void;
 onEnableNotifications:()=>void;onTestNotifications:()=>void;onDisableNotifications:()=>void;
 onShareInvite:()=>void;onLogout:()=>void;onDeleteRoom:()=>void;
};
export default function SettingsPage({
name,code,owner,token,avatarSrc,avatarVersion,recoveryMemberId,recoveryPartnerId,recoveryRoomId,profileBusy,profileError,recoveryBusy,onGenerateRecovery,privacyEnabled,
 notificationsOn,notificationsBusy,notificationsTesting,notificationsHint,nativeApp,plusActive,onOpenPlus,
 e2ee,e2eeBusy,e2eeBackup,e2eeOwnCode,e2eePartnerCode,e2eeDeviceReady,e2eeVerified,
 onEnableE2EE,onFinishE2EE,onRestoreE2EE,onVerifyPartnerKey,
 onBack,onChoosePhoto,onAdjustPhoto,onRemovePhoto,onPrivacyChange,
 onEnableNotifications,onTestNotifications,onDisableNotifications,onShareInvite,onLogout,onDeleteRoom
}:Props){
 const [passphrase,setPassphrase]=useState("");
 const [restorePhrase,setRestorePhrase]=useState("");
 const [restoreFile,setRestoreFile]=useState<File|null>(null);
 const [backupSaved,setBackupSaved]=useState(false);
 // This private preference does not infer gender from the user's name,
 // avatar or partner. It starts off for everybody until explicitly enabled.
 const [periodEnabled,setPeriodEnabled]=useState(false);
 const [periodReady,setPeriodReady]=useState(false);
 const [periodBusy,setPeriodBusy]=useState(false);
 const [periodError,setPeriodError]=useState("");
 useEffect(()=>{
  let alive=true;
  setPeriodReady(false);setPeriodEnabled(false);setPeriodError("");
  void apiFetch("/api/care",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
   .then(async response=>{
    const data=await response.json() as {ok:boolean;error?:string;periodEnabled?:boolean};
    if(!response.ok||!data.ok)throw Error(data.error||"Préférences indisponibles.");
    if(alive){setPeriodEnabled(data.periodEnabled===true);setPeriodReady(true)}
   }).catch(error=>{
    if(alive)setPeriodError(error instanceof Error?error.message:"Préférences indisponibles.");
   });
  return()=>{alive=false};
 },[token]);
 async function updatePeriodPreference(enabled:boolean){
  if(periodBusy||!periodReady)return;
  setPeriodBusy(true);setPeriodError("");
  try{
   const res=await apiFetch("/api/care",{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({action:"set-period-preference",enabled})});
   const data=await res.json() as {ok:boolean;error?:string;periodEnabled?:boolean};
   if(!res.ok||!data.ok)throw Error(data.error||"Enregistrement impossible.");
   setPeriodEnabled(data.periodEnabled===true);
  }catch(error){setPeriodError(error instanceof Error?error.message:"Enregistrement impossible.")}
  finally{setPeriodBusy(false)}
 }
 const downloadBackup=()=>{
  if(!e2eeBackup)return;
  const blob=new Blob([e2eeBackup],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download="love-radar-sauvegarde-cle-privee.json";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 return <section className="lr-settings-page" aria-label="Paramètres de mon espace">
  <header className="lr-settings-heading">
   <button type="button" onClick={onBack} className="lr-settings-back" aria-label="Retour à l’accueil">‹</button>
   <div><span>ESPACE PRIVÉ</span><h1>Paramètres</h1><p>Personnalise ton expérience à deux.</p></div>
  </header>
  <section className="lr-settings-section" aria-labelledby="lr-plus-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">✦</span>
    <div><h2 id="lr-plus-settings-title">Love Radar Plus</h2>
     <p>{plusActive?"Votre couple dispose des avantages Plus.":"Thèmes exclusifs, défis bonus et livre souvenir · 2,99 $/mois par couple."}</p>
    </div></div>
   <button className="lr-settings-primary" type="button" onClick={onOpenPlus}>
    {plusActive?"Voir mes avantages Plus":"Découvrir Love Radar Plus"}</button>
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-profile-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">◉</span><div><h2 id="lr-profile-settings-title">Mon profil</h2><p>Visible seulement par ton partenaire.</p></div></div>
   <div className="lr-settings-profile">
    <div className="lr-settings-avatar">{avatarSrc?<img src={avatarSrc} alt="Ma photo de profil"/>:name.trim().charAt(0).toUpperCase()}</div>
    <div className="lr-settings-profile-details"><strong>{name}</strong><small>Photo de profil</small></div>
    <button type="button" className="lr-settings-primary" disabled={profileBusy} onClick={onChoosePhoto}>{avatarVersion?"Changer":"Ajouter"}</button>
   </div>
   {avatarVersion?<div className="lr-settings-inline-actions">
    <button type="button" disabled={profileBusy||!avatarSrc} onClick={onAdjustPhoto}>Ajuster</button>
    <button type="button" disabled={profileBusy} onClick={onRemovePhoto}>Supprimer</button>
   </div>:null}
   {profileError?<p className="lr-settings-error" role="alert">{profileError}</p>:null}
   <label className="lr-settings-toggle">
    <span><strong>La fonction « J’ai mes règles » me concerne</strong>
     <small>Masquée par défaut. Active-la seulement si tu souhaites l’utiliser. Ton partenaire peut toujours t’envoyer des attentions.</small></span>
    <input type="checkbox" checked={periodEnabled} disabled={!periodReady||periodBusy}
     onChange={event=>void updatePeriodPreference(event.target.checked)}
     aria-label="Afficher la fonction J’ai mes règles dans Nos attentions"/>
    <span className="lr-settings-switch" aria-hidden="true"/>
   </label>
   {periodError?<p className="lr-settings-error" role="alert">{periodError}</p>:null}
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-confidentiality-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">♧</span><div><h2 id="lr-confidentiality-settings-title">Confidentialité</h2><p>Choisis comment afficher les photos privées.</p></div></div>
   <label className="lr-settings-toggle">
    <span><strong>Protection des photos</strong><small>Révélation temporaire et filigrane.</small></span>
    <input type="checkbox" checked={privacyEnabled} onChange={event=>onPrivacyChange(event.target.checked)} aria-label="Protection des photos"/>
    <span className="lr-settings-switch" aria-hidden="true"/>
   </label>
   <div className="lr-settings-screenshot-info" role="note">
    <strong>📸 Protection des captures d’écran</strong>
    <p>{!nativeApp?
     "Version web / PWA : le navigateur ne peut ni bloquer ni détecter les captures. Aucun avertissement au partenaire n’est garanti.":
     /Android/i.test(navigator.userAgent)?
      "Application Android : les captures et enregistrements d’écran sont bloqués par le système, indépendamment de la protection des photos.":
      "Application iPhone : une capture effectuée pendant que Love-Radar est ouvert est signalée après sa réalisation au partenaire, dans la conversation. iOS ne permet pas de la bloquer officiellement."}
    </p>
    <small>Les événements signalés restent visibles dans votre conversation pendant 30 jours. Aucune image capturée n’est envoyée. Une photo prise avec un autre téléphone reste indétectable.</small>
   </div>
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-e2ee-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">🔐</span>
    <div><h2 id="lr-e2ee-title">Chiffrement des messages — version pilote</h2>
     <p>Textes, photos et vocaux chiffrés sur les deux appareils, après activation et vérification.</p></div>
   </div>
   {!e2ee?.mine?<>
    <p className="lr-settings-help">Non activé : les messages actuels sont lisibles par le serveur. Les anciens messages ne seront pas chiffrés rétroactivement.</p>
    {!e2eeBackup?<div className="lr-settings-recovery">
     <strong>1. Choisir une phrase secrète pour la sauvegarde</strong>
     <small>Au moins 12 caractères. Conserve-la hors de Love Radar : sans elle, tu ne pourras pas restaurer ta clé.</small>
     <input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}
      placeholder="Phrase secrète de sauvegarde" aria-label="Phrase secrète de sauvegarde E2EE"
      style={{maxWidth:"100%",padding:12,borderRadius:8}}/>
     <button type="button" className="lr-settings-primary" disabled={e2eeBusy||passphrase.length<12||passphrase.length>256}
      onClick={()=>{onEnableE2EE(passphrase);setPassphrase("")}}>
      {e2eeBusy?"Création…":"Créer ma clé avec sauvegarde chiffrée"}</button>
    </div>:<div className="lr-settings-recovery">
     <strong>2. Télécharger et conserver la sauvegarde</strong>
     <small>Enregistre le fichier dans Fichiers ou ton coffre-fort privé, puis garde ta phrase secrète séparément. Ne l’envoie jamais à ton partenaire.</small>
     <button type="button" className="lr-settings-primary" onClick={downloadBackup}>Télécharger ma sauvegarde chiffrée</button>
     <label className="lr-settings-toggle">
      <span><strong>J’ai enregistré le fichier et ma phrase secrète</strong></span>
      <input type="checkbox" checked={backupSaved} onChange={e=>setBackupSaved(e.target.checked)}/>
     </label>
     <button type="button" className="lr-settings-primary" disabled={!backupSaved||e2eeBusy} onClick={onFinishE2EE}>
      {e2eeBusy?"Activation…":"3. Activer le chiffrement"}
     </button>
    </div>}
   </>:<>
    <p className="lr-settings-help">{e2eeDeviceReady?"✓ Clé de conversation disponible sur ce téléphone.":"⚠ Clé privée absente de ce téléphone : les messages chiffrés ne seront pas accessibles. Restaure sa sauvegarde ou demande l’aide de ton partenaire connecté."}</p>
    {e2eeDeviceReady&&e2eeBackup?<button type="button" className="lr-settings-primary" onClick={downloadBackup}>Télécharger ma sauvegarde de clé</button>:null}
    {!e2eeDeviceReady?<div className="lr-settings-recovery">
     <strong>Restaurer ma clé privée sur ce téléphone</strong>
     <small>Il te faut le fichier de sauvegarde et la phrase secrète que tu avais choisis. Le code de secours du compte ne remplace pas cette sauvegarde.</small>
     <input type="file" accept=".json,application/json" aria-label="Fichier de sauvegarde chiffrée"
      onChange={e=>setRestoreFile(e.target.files?.[0]||null)}/>
     <input type="password" autoComplete="off" value={restorePhrase} onChange={e=>setRestorePhrase(e.target.value)}
      placeholder="Phrase secrète de la sauvegarde" aria-label="Phrase secrète pour restaurer ma clé"
      style={{maxWidth:"100%",padding:12,borderRadius:8}}/>
     <button type="button" className="lr-settings-primary" disabled={!restoreFile||restorePhrase.length<12||e2eeBusy}
      onClick={()=>{if(restoreFile)onRestoreE2EE(restoreFile,restorePhrase);setRestorePhrase("")}}>
       {e2eeBusy?"Restauration…":"Restaurer ma clé"}
     </button>
    </div>:null}
    {e2eeOwnCode?<div className="lr-settings-recovery"><strong>Mon empreinte à communiquer à mon partenaire</strong><code style={{overflowWrap:"anywhere",fontSize:12}}>{e2eeOwnCode}</code></div>:null}
    {!e2ee?.partner?<p className="lr-settings-help">En attente : ton partenaire doit activer le chiffrement sur son téléphone. Tes nouveaux envois sont suspendus pour éviter un message non chiffré.</p>:
     <div className="lr-settings-recovery">
      <strong>Empreinte de mon partenaire</strong>
      <code style={{overflowWrap:"anywhere",fontSize:12}}>{e2eePartnerCode||"Chargement…"}</code>
      <p className="lr-settings-help">Compare les 64 caractères avec ton partenaire par un autre moyen (en personne ou lors d’un appel). Le serveur ne peut pas vérifier cette identité à votre place.</p>
      {e2eeVerified?<p className="lr-settings-help">✓ Empreinte vérifiée sur ce téléphone.</p>:
       <button type="button" className="lr-settings-primary" onClick={onVerifyPartnerKey} disabled={!e2eeDeviceReady||!e2eePartnerCode||e2eeBusy}>J’ai comparé et vérifié l’empreinte</button>}
     </div>}
    <p className="lr-settings-help">{e2ee?.required&&e2eeVerified&&e2eeDeviceReady?
     "Chiffrement actif pour les nouveaux échanges de cette conversation.":
     "Chiffrement non prêt : vérification des clés nécessaire avant l’envoi."}</p>
   </>}
   <p className="lr-settings-help">Attention : ce chiffrement pilote n’a pas été audité indépendamment. Le partenaire connecté peut approuver une restauration chiffrée de votre clé de conversation. Cette opération ne reconstruit pas les clés privées d’identité perdues ; garde toute sauvegarde originale.</p>
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-notifications-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">♬</span><div><h2 id="lr-notifications-settings-title">Notifications</h2><p>Messages, appels et invitations.</p></div></div>
   {nativeApp?<p className="lr-settings-help">Les notifications de la version native se règlent depuis les paramètres du téléphone.</p>:<>
    <p className="lr-settings-notification-status"><span className={notificationsOn?"lr-settings-online":""}/>{notificationsOn?"Notifications activées":"Notifications désactivées"}</p>
    <div className="lr-settings-inline-actions">
     <button type="button" disabled={notificationsBusy||notificationsTesting} onClick={onEnableNotifications}>{notificationsBusy?"Vérification…":notificationsOn?"Réparer":"Activer"}</button>
     {notificationsOn?<button type="button" disabled={notificationsBusy||notificationsTesting} onClick={onTestNotifications}>{notificationsTesting?"Test…":"Tester"}</button>:null}
     {notificationsOn?<button type="button" disabled={notificationsBusy||notificationsTesting} onClick={onDisableNotifications}>Désactiver</button>:null}
    </div>
    {notificationsHint?<p className="lr-settings-help" role="status">{notificationsHint}</p>:null}
   </>}
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-device-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">⚡</span><div><h2 id="lr-device-settings-title">Diagnostics</h2><p>Vérifie les services depuis ce téléphone.</p></div></div>
   <ConnectionDiagnostics token={token} nativeApp={nativeApp}/>
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-account-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">♧</span><div><h2 id="lr-account-settings-title">Compte et invitation</h2><p>Chaque couple possède son espace indépendant.</p></div></div>
   <div className="lr-settings-invitation"><span>Code d’invitation</span><strong>{code}</strong><button type="button" onClick={onShareInvite}>Partager</button></div>
   <div className="lr-settings-recovery">
    <strong>🔐 Retrouver mon compte</strong>
    <small>Crée ton code personnel de secours avant de changer de téléphone. Il n’est pas destiné à ton partenaire. Un nouveau code annule le précédent.</small>
    <button type="button" disabled={recoveryBusy} onClick={onGenerateRecovery}>{recoveryBusy?"Création en cours…":"Créer un nouveau code de secours"}</button>
   </div>
   <PartnerRecoverySponsor token={token} myId={recoveryMemberId} partnerId={recoveryPartnerId}
     roomId={recoveryRoomId} minePublic={e2ee?.mine||null}
     partnerPublic={e2ee?.partner||null} required={!!e2ee?.required}/>
   <button type="button" className="lr-settings-logout" onClick={onLogout}>Se déconnecter</button>
   {owner?<button type="button" className="lr-settings-danger" onClick={onDeleteRoom}>Supprimer définitivement notre espace</button>:null}
  </section>
  <small className="lr-settings-footer">Ton espace et tes échanges ne sont accessibles qu’aux membres invités.</small>
 </section>;
}
