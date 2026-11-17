# Love Radar — appels entrants natifs iPhone & Android

Le projet utilise toujours **Cloudflare Pages + D1**, la messagerie chiffrée existante et WebRTC. Les services Apple/Google servent uniquement à envoyer une *invitation d'appel* (identifiant, nom limité, mode, expiration). Aucune conversation, photo, ni historique n'est transmis à Firebase.

## Capacités et limites actuelles

- **iOS (application installée via TestFlight/App Store)** : PushKit réveille le processus lorsqu'APNs livre un push VoIP; CallKit affiche une interface système audio ou vidéo sur l'écran verrouillé. Le minuteur ferme une invitation sans réponse. Apple nécessite une signature, des capacités Push Notifications et une clé APNs VoIP configurée sur Cloudflare.
- **Android (APK/AAB avec configuration FCM)** : un message FCM *data/high priority* déclenche une notification d'appel avec la sonnerie système et, si Android l'autorise, une activité plein écran dédiée. L'écran natif ne montre **aucun message privé** et n'accède ni au micro ni à la caméra. En appuyant sur Décrocher ou Refuser, l'application principale reprend la session et confirme l'action auprès de Cloudflare. Le micro/la caméra ne démarrent que dans l'application visible, après l'action explicite.
- **Web/PWA** : ces fonctions natives ne sont pas disponibles dans Safari/PWA; seules les notifications Web Push déjà présentes peuvent s'afficher, suivant les limitations du système.
- La transmission des notifications et la reprise des flux WebRTC pendant un verrouillage prolongé ne sont **pas garanties** : les restrictions de batterie, de permissions et la suspension de la WebView peuvent intervenir. Pour un appel *déjà accepté* réellement ininterrompu sur iPhone verrouillé, une pile média WebRTC native supplémentaire serait nécessaire.

## A. iPhone — configuration Apple

Les fichiers générés sont configurés dans `scripts/configure-native.mjs ios`, à partir de `native/call-session/ios-voip.swift.txt`. Le dossier `docs/TESTFLIGHT-IPHONE.md` explique TestFlight.

Sur Cloudflare (secrets/variables côté serveur seulement) :
- `APNS_TEAM_ID` : équipe Apple Developer
- `APNS_KEY_ID` : identifiant de la clé APNs
- `APNS_PRIVATE_KEY` : contenu PEM privé de la clé .p8 (ne jamais committer)
- `APNS_BUNDLE_ID` : `com.diaotech.loveradar`
- `APNS_ENVIRONMENT` : `sandbox` pour un build de développement ; `production` pour un build TestFlight/App Store (APNs `api.push.apple.com`)

Configurer et signer le profil Apple avec **Push Notifications** pour `com.diaotech.loveradar`. TestFlight nécessite un vrai compte Apple Developer et un profil de distribution. Le code iOS non signé ne suffit pas pour recevoir PushKit sur un vrai téléphone.

## B. Android — configuration FCM (transport uniquement)

Pour la réception d'appels quand l'app est fermée, les appareils Android avec services Google ont besoin d'un transport push. Love Radar utilise **FCM HTTP v1**, mais conserve Cloudflare pour les comptes, messages et appels. Aucun Firebase Auth / Firestore / Realtime Database n'est utilisé.

1. Créer un projet Google Firebase pour l'application Android `com.diaotech.loveradar` et activer l'API **Firebase Cloud Messaging**.
2. Dans **GitHub → Settings → Secrets and variables → Actions → Variables**, ajouter ces **identifiants publics de configuration client** :
   - `FCM_ANDROID_APP_ID` — identifiant Firebase Android (`1:...:android:...`)
   - `FCM_ANDROID_SENDER_ID` — numéro d'expéditeur du projet
   - `FCM_ANDROID_API_KEY` — clé de configuration publique Android (restreindre à l'application/APIs prévues)
   - `FCM_ANDROID_PROJECT_ID` — identifiant du projet
3. Dans **Cloudflare Pages → Settings → Environment variables / secrets**, mettre uniquement **côté serveur** :
   - `FCM_PROJECT_ID`
   - `FCM_CLIENT_EMAIL` (compte de service Google disposant des droits FCM nécessaires)
   - `FCM_PRIVATE_KEY` (clé RSA PEM de ce compte, **secrète**, jamais dans GitHub ni l'APK)
4. Reconstruire puis installer un nouvel APK/AAB avec le workflow natif. L'app demande l'autorisation de notifications Android 13+. Sur Android 14+, l'accès *Notifications plein écran* peut être refusé ou soumis à validation Play Console; dans ce cas la notification s'affiche en heads-up plutôt qu'en plein écran.
5. Ouvrir Love Radar et se connecter après installation pour que le nouveau jeton FCM soit enregistré dans la chambre privée du couple. À la déconnexion, le jeton est désenregistré côté serveur. En cas de renouvellement du jeton pendant que l'application est complètement fermée, l'enregistrement serveur reprend à la prochaine ouverture.

Si les quatre variables GitHub ne sont pas fournies, le code compile mais **FCM n'est pas activé**. Si les secrets Cloudflare manquent, les envois Android sont désactivés. Les permissions utilisateur et le bon fonctionnement des services Google Play restent nécessaires.

## C. Validation en conditions réelles

Sur **deux appareils physiques** connectés à deux comptes du même couple :

1. Installer le **nouveau build natif** et autoriser les notifications, le micro et la caméra quand ils sont demandés.
2. Appeler Android depuis iPhone avec Android en arrière-plan, puis verrouillé, puis app fermée. Vérifier la sonnerie, l'interface et les deux boutons; accepter et contrôler l'audio/vidéo.
3. Appeler iPhone depuis Android avec iPhone verrouillé. Vérifier CallKit, le mode vidéo, réponse et refus.
4. Refuser puis raccrocher avant réponse : pas de notification ou sonnerie persistante au-delà de 60 secondes.
5. Refaire les tests sous Wi-Fi puis données mobiles, notamment après une perte de réseau. La reconnexion des médias peut dépendre de TURN.
6. Déconnecter un utilisateur et vérifier qu'un ancien appareil ne reçoit plus d'appels pour la chambre précédente.
7. Tester une ancienne version de l'app et un appareil qui refuse les notifications pour vérifier les comportements dégradés.

Les tests automatisés GitHub vérifient le code, le serveur et la compilation, **mais ne constituent pas une preuve de livraison push APNs/FCM ni du comportement écran verrouillé**. Apple et Google peuvent imposer des autorisations et politiques supplémentaires.

## Confidentialité

Les jetons FCM et APNs sont associés par compte/appareil à la chambre dans Cloudflare D1 et supprimés à la déconnexion et à la suppression du couple. Les clés privées de signature/APNs/FCM restent côté serveur. Le système natif Android ne conserve pas le jeton d'authentification privé; il conserve uniquement une action de réponse/refus et l'identifiant éphémère d'appel pendant une courte durée. Les accès caméra/micro ne commencent jamais à la réception passive d'une invitation push.
