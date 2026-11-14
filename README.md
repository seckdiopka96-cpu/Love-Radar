# Love Radar ❤️ — by Diao-Tech.com

Application web **indépendante de Higgsfield** pour couples, en français. Son code et ses données peuvent être hébergés sur votre propre compte GitHub + Cloudflare Pages.

## Fonctionnalités

- Couple à distance : invitation par code unique à 10 caractères
- Messagerie privée : texte, photos et vocaux de 45 secondes maximum
- Album des photos partagées, suppression de l'espace par son créateur
- Appels vocaux WebRTC expérimentaux, sans suivi GPS ni intégration Higgsfield

## Mise en ligne sur votre Cloudflare

1. Dans **Cloudflare → D1 SQL Database**, créer `love-radar-db`. Ouvrir sa console SQL et **exécuter intégralement le fichier `schema.sql`** pour créer les tables.
2. Dans **Cloudflare → R2 Object Storage**, créer un bucket privé `love-radar-media`. Il ne doit PAS être exposé publiquement. R2 doit être activé sur votre compte Cloudflare.
3. Dans **Cloudflare → Workers & Pages → Create → Pages → Connect to Git**, choisir le dépôt GitHub `Love-Radar`.
4. Paramètres de build : framework **Vite** (ou None avec les paramètres ci-dessous), **Build command** `npm run build`, **Build output directory** `dist`, racine du dépôt. Ne pas utiliser de commande de build sous un autre répertoire.
5. Après la création de Pages, ouvrir **Settings → Bindings** et ajouter **D1 database** avec le nom de variable EXACT `DB`, et choisir `love-radar-db`. Ajouter **R2 bucket** avec le nom de variable EXACT `STORAGE`, choisir `love-radar-media`. Appliquer à la production (et à preview si souhaité). **Redéployer** le site après avoir ajouté les bindings.
6. Votre site aura une adresse `*.pages.dev`. Cloudflare redéploiera automatiquement à chaque mise à jour du dépôt GitHub.

> Important : le site ne peut pas sauvegarder de données tant que D1, R2 et `schema.sql` ne sont pas configurés. **Le dépôt GitHub seul ne publie pas l'application.**

## Développement local

`npm install` puis `npm run build` pour compiler l'interface. Les chemins `/api/love` et `/api/media` sont des **Cloudflare Pages Functions**, pas des API Vite : ils nécessitent l'environnement Cloudflare + les bindings D1/R2.

## Architecture autonome

- React + Vite (interface dans `src/`, assemblage `dist/`)
- Cloudflare Pages Functions (`functions/api/`)
- Cloudflare D1 : espaces, membres, messages et réponses (`schema.sql`)
- Cloudflare R2 : médias privés. L'accès aux fichiers exige un jeton de membre authentifié.

**Confidentialité :** les messages ne sont pas chiffrés de bout en bout. Chaque navigateur garde un jeton d'accès sur son appareil : effacer les données du navigateur fait perdre l'accès à l'espace, car la récupération de compte n'est pas encore prévue. L'application doit être testée sur deux téléphones avant ouverture au grand public. N'ajoutez jamais de secrets ni de photos privées au dépôt GitHub.

**Limites de cette version :** pas de notifications push en arrière-plan, pas de système d'inscription/récupération des comptes, pas de modération automatique, pas de chiffrement de bout en bout. Le mode Radar est un jeu, jamais une preuve de fidélité ou d'infidélité.

© 2026 Diao-Tech.com. Tous droits réservés.

## Activation après configuration Cloudflare

Après avoir créé les tables D1 et relié les bindings de production `DB` (D1) et `STORAGE` (R2) dans les paramètres du projet Cloudflare Pages, un **nouveau déploiement** est nécessaire pour que les Pages Functions voient ces ressources. Les médias R2 doivent rester privés.

## Installer Love Radar sur Android (PWA)

Love Radar est une **Progressive Web App (PWA)** installable depuis Google Chrome Android, **sans télécharger d’APK ni passer par Google Play**.

1. Ouvrir le site officiel Cloudflare Pages de Love Radar dans **Chrome sur Android**.
2. Appuyer sur le bouton **« ↓ Installer »**. Si Chrome propose une installation, accepter.
3. Sinon, ouvrir **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).
4. Une icône Love Radar apparaît sur l'écran d'accueil et l'application s'ouvre en mode autonome.

Fichiers : `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`. Le service worker met en cache l'interface et les fichiers statiques pour permettre au minimum d'ouvrir la structure hors connexion. **Les messages, photos et vocaux requièrent Internet** et les API `/api/` ne sont jamais mises en cache.

Ce fonctionnement ne constitue pas une application publiée sur le **Google Play Store** ni un APK téléchargeable ; une distribution Play Store demanderait une étape de packaging et de publication séparée.

## Notifications iPhone et Android — configuration nécessaire

- Notifications disponibles sur **iOS 16.4+** uniquement lorsque Love Radar est **ajouté à l'écran d'accueil et ouvert depuis son icône** ; Android (Chrome) accepte aussi les notifications. Le consentement est toujours demandé par bouton.
- Les notifications concernent les **messages, l’arrivée du partenaire et les invitations aux appels**. Le contenu des messages privés n'est pas inclus dans les notifications.
- Les abonnements sont liés à chaque membre et appareil dans Cloudflare D1. La désactivation de l'appareil, la déconnexion et la suppression d'un espace retirent l'abonnement.

**Procédure :**
1. Exécuter le contenu de [schema-push.sql](schema-push.sql) dans la console D1 existante `love-radar-db` (ne modifie pas les autres tables).
2. Générer **une paire VAPID**. Une façon de le faire sur une machine de confiance : `npx web-push generate-vapid-keys` (ou Web Crypto P-256).
3. Dans Cloudflare Pages → **Settings → Variables and secrets**, ajouter ces variables pour **Production** :
   - `VAPID_PUBLIC_KEY` : clé publique URL-safe Base64 ;
   - `VAPID_PRIVATE_KEY` : clé privée (type **Secret**, jamais dans GitHub) ;
   - `VAPID_SUBJECT` : une URL de contact `https://love-radar-acd.pages.dev/` ou une adresse `mailto:` valide.
4. Redéployer **Cloudflare Pages** pour appliquer les variables.
5. Chaque partenaire installe l’app sur son écran d’accueil, ouvre son espace et touche « 🔔 Activer les notifications ».

Le transport Web Push utilise `@block65/webcrypto-web-push` (Web Crypto, aes128gcm, VAPID pour iOS/Android). La livraison dépend des réglages et de la connectivité du téléphone. Sans variables VAPID et la nouvelle table D1, **l’interface et la messagerie restent fonctionnelles mais les notifications distantes ne peuvent pas être activées**.

## Présence en messagerie

- **Messagerie** : statut « En train d’écrire… », indicateur « En ligne » et « Vu » pour les conversations privées de chaque couple.
- La table `chat_presence` est créée automatiquement par l’API. Aucune intervention manuelle requise dans Cloudflare.
- Le clavier iOS/Android conserve les ajustements `visualViewport`, sans zoom du formulaire ; la palette prune nuit est conservée.
- Les anciennes questions et leurs réponses ne sont plus utilisées par l’application. Les données existantes ne sont pas effacées automatiquement.

## Appels vocaux WebRTC (1:1)

- Dans la conversation, toucher le bouton téléphone 📞 pour appeler son/sa partenaire. Le/la destinataire peut décrocher ou refuser ; en communication, les deux personnes peuvent couper le micro ou raccrocher.
- Les invitations et offres/réponses WebRTC sont synchronisées par la fonction Cloudflare Pages `functions/api/call.ts` et les tables D1 `voice_calls`, `voice_signals`, créées automatiquement. Le contenu vocal n’est ni enregistré ni sauvegardé.
- Les appels utilisent la connexion WebRTC chiffrée de bout en bout (DTLS-SRTP) et des serveurs publics STUN. Les réseaux avec NAT strict peuvent nécessiter un relais TURN non configuré dans cette première version.
- Si les notifications push sont déjà activées, une invitation à l'appel peut aussi apparaître lorsque l’app est fermée, mais **l’appel ne sonne pas comme un appel téléphonique natif sur iOS**. Il faut ouvrir l’application pour répondre.
- Les deux personnes doivent conserver l’app ouverte pendant l’appel. Certaines versions d’iOS interrompent le micro des PWA si l’app passe en arrière-plan ou si l’écran se verrouille.
- Si aucune adresse ICE n’est disponible, l’interface donne un message d’erreur explicite plutôt que prétendre que l’appel est connecté.

## Ludo en ligne — exactement deux joueurs

- Chaque espace privé Love Radar dispose d'une partie de Ludo synchronisée à l'aide de Cloudflare D1.
- 2 joueurs uniquement, chacun avec 4 pions (rouge et jaune) ; même code de couple que pour la messagerie.
- La valeur du dé est créée côté serveur et chaque déplacement est validé côté serveur ; accès par jeton de membre.
- Sortir de la base exige un 6. Cases étoilées sûres, captures, tour bonus après 6 ou capture, troisième 6 consécutif perd le tour, arrivée exacte au centre (progression 57).
- La partie est créée automatiquement à la première ouverture lorsque les deux partenaires ont rejoint. Elle se met à jour toutes les 2 secondes lorsque l'onglet est visible ; chaque coup est protégé contre les mises à jour simultanées.
- Les parties terminées peuvent être relancées sans perdre les messages ni les souvenirs. Aucun paiement ni jeu avec des inconnus.
- La table `ludo_games` est créée automatiquement pour les espaces D1 existants. `schema.sql` la définit pour les nouvelles installations.
- La première version utilise une synchronisation par requêtes périodiques ; les notifications dédiées aux tours ne sont pas encore proposées.
