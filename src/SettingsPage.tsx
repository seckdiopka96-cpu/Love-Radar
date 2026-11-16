import "./settings-page.css";
import ConnectionDiagnostics from "./ConnectionDiagnostics";
type Props={
 name:string;code:string;owner:boolean;token:string;avatarSrc?:string;avatarVersion?:number;
 profileBusy:boolean;profileError:string;
 recoveryBusy:boolean;onGenerateRecovery:()=>void;
 e2ee?:{mine:string|null;partner:string|null;required:boolean};
 e2eeBusy:boolean;e2eeOwnCode:string;e2eePartnerCode:string;e2eeDeviceReady:boolean;e2eeVerified:boolean;
 onEnableE2EE:()=>void;onVerifyPartnerKey:()=>void;
 privacyEnabled:boolean;
 notificationsOn:boolean;notificationsBusy:boolean;notificationsTesting:boolean;notificationsHint:string;
 nativeApp:boolean;
 onBack:()=>void;onChoosePhoto:()=>void;onAdjustPhoto:()=>void;onRemovePhoto:()=>void;
 onPrivacyChange:(enabled:boolean)=>void;
 onEnableNotifications:()=>void;onTestNotifications:()=>void;onDisableNotifications:()=>void;
 onShareInvite:()=>void;onLogout:()=>void;onDeleteRoom:()=>void;
};
export default function SettingsPage({
name,code,owner,token,avatarSrc,avatarVersion,profileBusy,profileError,recoveryBusy,onGenerateRecovery,privacyEnabled,
 notificationsOn,notificationsBusy,notificationsTesting,notificationsHint,nativeApp,
 e2ee,e2eeBusy,e2eeOwnCode,e2eePartnerCode,e2eeDeviceReady,e2eeVerified,onEnableE2EE,onVerifyPartnerKey,
 onBack,onChoosePhoto,onAdjustPhoto,onRemovePhoto,onPrivacyChange,
 onEnableNotifications,onTestNotifications,onDisableNotifications,onShareInvite,onLogout,onDeleteRoom
}:Props){
 return <section className="lr-settings-page" aria-label="Paramètres de mon espace">
  <header className="lr-settings-heading">
   <button type="button" onClick={onBack} className="lr-settings-back" aria-label="Retour à l’accueil">‹</button>
   <div><span>ESPACE PRIVÉ</span><h1>Paramètres</h1><p>Personnalise ton expérience à deux.</p></div>
  </header>
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
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-confidentiality-settings-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">♧</span><div><h2 id="lr-confidentiality-settings-title">Confidentialité</h2><p>Choisis comment afficher les photos privées.</p></div></div>
   <label className="lr-settings-toggle">
    <span><strong>Protection des photos</strong><small>Révélation temporaire et filigrane.</small></span>
    <input type="checkbox" checked={privacyEnabled} onChange={event=>onPrivacyChange(event.target.checked)} aria-label="Protection des photos"/>
    <span className="lr-settings-switch" aria-hidden="true"/>
   </label>
  </section>
  <section className="lr-settings-section" aria-labelledby="lr-e2ee-title">
   <div className="lr-settings-section-head"><span className="lr-settings-icon" aria-hidden="true">🔐</span>
    <div><h2 id="lr-e2ee-title">Chiffrement des messages — version pilote</h2>
     <p>Textes, photos et vocaux chiffrés sur les deux appareils, après activation et vérification.</p></div>
   </div>
   {!e2ee?.mine?<>
    <p className="lr-settings-help">Non activé : les messages actuels sont lisibles par le serveur. Les anciens messages ne seront pas chiffrés rétroactivement.</p>
    <button type="button" className="lr-settings-primary" disabled={e2eeBusy} onClick={onEnableE2EE}>
     {e2eeBusy?"Activation…":"Créer ma clé et activer"}
    </button>
   </>:<>
    <p className="lr-settings-help">{e2eeDeviceReady?"✓ Clé privée présente sur ce téléphone.":"⚠ Clé privée absente de ce téléphone : les messages chiffrés ne seront pas accessibles. Ne réinitialise pas la clé sans procédure de récupération."}</p>
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
   <p className="lr-settings-help">Attention : cette première version n’a pas été auditée indépendamment. Le code de secours du compte ne restaure PAS les clés privées. Sauvegarde et multi-appareil restent à développer.</p>
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
   <button type="button" className="lr-settings-logout" onClick={onLogout}>Se déconnecter</button>
   {owner?<button type="button" className="lr-settings-danger" onClick={onDeleteRoom}>Supprimer définitivement notre espace</button>:null}
  </section>
  <small className="lr-settings-footer">Ton espace et tes échanges ne sont accessibles qu’aux membres invités.</small>
 </section>;
}
