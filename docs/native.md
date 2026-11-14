# Love Radar — applications natives iPhone et Android

La version PWA reste à https://love-radar-acd.pages.dev. La version mobile embarque ses fichiers React/Vite dans une application Capacitor 8. Le backend reste sur Cloudflare Pages Functions, D1 et R2 : aucun service Firebase n'est ajouté.

## Sécurité native

Sur Android, le plugin officiel Capacitor Privacy Screen active FLAG_SECURE : les captures d'écran et enregistrements sont en principe bloqués, et le multitâche masque les conversations. Sur iPhone, le plugin masque le contenu dans le sélecteur d'apps avec un voile sombre. Apple ne fournit pas d'API officielle garantissant le blocage des captures iOS. La protection de photos temporaire déjà présente dans l'application reste utilisable sur les deux plateformes. Le bouton Confidentialité du profil commande aussi le plugin natif.

## Réseau

Sur le web, toutes les requêtes privées passent par les chemins /api/ du même domaine. Dans la version mobile, la copie locale de l'interface utilise le module src/api.ts : ce dernier redirige uniquement les requêtes /api/ vers https://love-radar-acd.pages.dev en HTTPS, sans transmettre de cookies. Cloudflare functions/_middleware.ts autorise ces appels authentifiés depuis capacitor://localhost (iOS) et https://localhost (Android), sans joker CORS. Aucun secret d'infrastructure n'est embarqué dans l'application.

## Génération Android (sur ordinateur avec Android Studio et JDK 21)

1. npm install
2. npm run build
3. npx cap add android
4. node scripts/configure-native.mjs android
5. npx cap sync android
6. npx cap open android

Pour fabriquer un APK debug : exécuter ./gradlew assembleDebug dans le dossier android sur macOS/Linux. Un fichier Android debug doit être signé pour une distribution officielle ; Google Play nécessite un build release distinct.

## Génération iOS (Mac + Xcode 26 ou version prise en charge par Capacitor 8)

1. npm install
2. npm run build
3. npx cap add ios --packagemanager SPM
4. node scripts/configure-native.mjs ios
5. npx cap sync ios
6. npx cap open ios

Choisir un simulateur ou l'iPhone relié au Mac. Une signature Apple valide et un compte développeur sont requis pour distribuer sur de vrais iPhone ou publier via TestFlight. Aucun IPA signé n'est fourni par ce dépôt.

## GitHub Actions

Le workflow .github/workflows/native.yml régénère et compile Android lors d'une pull request modifiant le mobile. Il dépose un APK debug en tant qu'artifact GitHub. Une exécution manuelle du workflow prépare également iOS et une archive pour simulateur, sans signature. Les plateformes sont régénérées à partir de Capacitor plutôt que de versionner les nombreux fichiers créés par le CLI.

## Points encore à compléter avant le lancement officiel

- Les notifications de la PWA utilisent le Web Push par service worker. Dans les applications natives, ce système ne fonctionne pas tel quel : le bouton de notifications Web est volontairement masqué. L'envoi APNs (iPhone) et un canal Android natif doivent être implémentés et testés séparément. Les alertes PWA existantes continuent de fonctionner sur le site.
- Les appels vocaux WebRTC, la sélection des photos et la localisation consentie nécessitent de vrais tests de permissions et de stabilité sur iOS/Android. Le script d'initialisation ajoute les descriptions de permissions correspondantes ; il ne valide pas les parcours utilisateurs.
- Les invitations se partagent par lien HTTPS vers la PWA. Les liens universels ouvrant directement l'app native restent à configurer.
- Il faudra remplacer les icônes et splash screens générés par défaut, prévoir les signatures de store, les comptes développeurs, la politique de confidentialité et les tests de sécurité.
- Les tokens de session restent dans le stockage local WebView ; une future version pourra utiliser le Keychain iOS et le Keystore Android avant publication.
- Ce projet n'a pas encore été installé sur de vrais téléphones, et ses builds natifs doivent passer les tests Android/iOS. Il n'est pas publié dans l'App Store ni sur Google Play.

Important : l'app native protège mieux l'affichage mais aucune solution ne peut arrêter une caméra externe ni garantir que le contenu ne sera jamais copié.
