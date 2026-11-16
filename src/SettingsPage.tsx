import "./settings-page.css";
import ConnectionDiagnostics from "./ConnectionDiagnostics";
type Props={
 name:string;code:string;owner:boolean;token:string;avatarSrc?:string;avatarVersion?:number;
 profileBusy:boolean;profileError:string;
 recoveryBusy:boolean;onGenerateRecovery:()=>void;
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
