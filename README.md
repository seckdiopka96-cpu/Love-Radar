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
- Les appels utilisent WebRTC (DTLS-SRTP) et une connexion directe STUN lorsqu'elle est possible. La nouvelle API `/api/call-config` peut générer des identifiants TURN temporaires pour assurer une connexion sur les réseaux stricts. Le contenu des appels n'est pas enregistré.
- **Pour activer les relais TURN Cloudflare Realtime** : créer une clé TURN dans Cloudflare Realtime, puis configurer sur Cloudflare Pages, en Production, `TURN_KEY_ID` (UID de la clé) et `TURN_KEY_API_TOKEN` (valeur secrète de la clé). Garder `TURN_KEY_API_TOKEN` comme **secret**, jamais dans GitHub ou le navigateur. Redéployer. La fonction authentifie le membre Love Radar et génère un jeton TURN à validité limitée (7200 secondes) uniquement en mémoire. Documentation : https://developers.cloudflare.com/realtime/turn/generate-credentials/
- Sans ces deux variables, le code conserve STUN comme solution de repli, mais certains appels échoueront sur les réseaux mobiles et Wi-Fi restrictifs. Le relais TURN peut occasionner des frais Cloudflare.
- L'état d'appel, l'activation du microphone, le signalement des erreurs ICE et l'expiration des appels ont été améliorés. Pour un usage fiable, tester avec **deux téléphones sur des réseaux différents**, notamment un iPhone installé sur l'écran d'accueil et un appareil Android. Les appels interrompus en arrière-plan restent une limite iOS des applications web.
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

## Accueil du couple et dés visuels (2026)

- Accueil : les prénoms et le statut du partenaire, la partie Ludo synchronisée, l'aperçu du dernier message et la dernière image déjà partagée.
- Les dés sont de vrais **carrés blancs avec des points disposés de 1 à 6**, pas des icônes rondes ; la représentation du dé suit la valeur côté serveur.
- L'album et les messages restent privés. Les photos ne sont pas incluses dans le HTML public : elles utilisent les médias déjà chargés par le compte authentifié.

<!-- Déploiement de production relancé pour appliquer les variables TURN des Pages Functions. -->

## Ludo Duo : plein écran fixe et sortie de partie

- En mode Ludo sur téléphone, l'en-tête de Love Radar, la barre de navigation et la notification globale se masquent pour donner toute la hauteur disponible au plateau.
- Le plateau adapte sa taille via ResizeObserver et reste intégralement visible sans défilement horizontal ni vertical (iPhone, Android et petit écran).
- « Quitter » propose **retour à l'accueil** (partie conservée) ou **abandonner** (victoire accordée au partenaire immédiatement, même si ce n'est pas votre tour).
- Émoticônes ❤️ 😂 🔥 👏 😍 💋 synchronisées et éphémères dans le salon privé ; aucune messagerie ni donnée existante modifiée.
- Dés carrés animés et pions SVG originaux en relief, quatre zones de plateau colorées, animation de mouvement et écran de victoire.
- Un pion amené au centre donne un lancer supplémentaire. Les autres règles sont inchangées.
- Les parties conservent leur état dans D1, y compris quand le joueur revient à l'accueil ; les conversations et appels sont inchangés.

## Animations et sons du Ludo Duo (novembre 2026)

- Les pions parcourent les cases une par une uniquement à l'affichage : la logique et la validation des déplacements restent intégralement sur le serveur D1.
- Effets sonores WebAudio originaux et courts pour les dés, le déplacement, une capture et la victoire, avec contrôle 🔊 / 🔇 dans la barre du haut. L'audio s'active lors du premier appui de l'utilisateur conformément aux restrictions iOS.
- Animation de confettis lors de la victoire, dés carrés conservés. Les animations sont réduites si l'option système « réduire les animations » est activée.
- Une nouvelle version du cache PWA est utilisée pour fournir le design à jour ; les parties et messages ne sont pas réinitialisés.

## Ludo Duo : chrono de 30 secondes et défi cadeau facultatif

- Chaque joueur dispose de 30 secondes pour agir (lancer le dé ou déplacer son pion). Le délai est calculé et contrôlé sur le serveur avec l'horodatage enregistré dans D1.
- À l'expiration, un bot serveur lance le dé et choisit un déplacement légal, avec une préférence pour les captures, l'arrivée et les cases protégées ; il gère les 6 et les tours bonus.
- **Limite technique :** les fonctions Cloudflare Pages ne s'exécutent pas en tâche de fond. Les tours expirés sont résolus lors de la prochaine requête API authentifiée (chaque app ouverte interroge toutes les 1,6 s). Si les deux téléphones sont fermés, le coup sera joué à la reprise, pas obligatoirement à la trentième seconde.
- 🎁 Défi cadeau entre partenaires, entièrement facultatif : les deux joueurs acceptent explicitement **avant la victoire** ; après la victoire, le gagnant peut demander du crédit téléphonique, un forfait Internet ou 2 000 F CFA via Wave. Le perdant peut marquer le cadeau comme offert.
- **Aucun transfert de fonds, achat de crédit ou achat de data n'est effectué par Love Radar.** Les cadeaux sont des promesses informelles entre les participants ; l'application ne collecte ni numéros Wave, ni coordonnées de paiement, ni données bancaires.
- Les accords et le choix de cadeau appartiennent à une manche, sont stockés dans D1 et sont réinitialisés au démarrage d'une nouvelle manche. Aucun changement de règles de jeu ni de données privées existantes.

## Accord et signatures avant chaque partie de Ludo Duo

- **Avant chaque manche**, les deux partenaires lisent les règles complètes dans un écran bloquant, cochent « J'ai lu et compris », répondent explicitement **oui ou non** au défi cadeau et signent avec le nom de leur compte Love Radar.
- Les signatures sont enregistrées de manière privée par l'API authentifiée, avec le nom, le choix du défi et la date/heure, dans `ludo_agreements` (une entrée par salle et par manche). Le serveur valide que le nom saisi correspond au profil connecté ; il s'agit d'une **attestation dans l'application**, pas d'une signature légale certifiée ou d'une vérification d'identité.
- Aucun lancer de dé, déplacement ou coup automatique n'est autorisé avant **les deux signatures**. Le délai de 30 s ne démarre qu'après le deuxième accord. Les manches déjà ouvertes restent préservées mais doivent être signées pour continuer.
- **Défi cadeau facultatif** : aucun des deux n'est forcé d'accepter un paiement ; seuls deux « oui » déclenchent le cadeau pour cette manche. Les options sont le crédit téléphonique, la connexion Internet et 2 000 F CFA par Wave, sans paiement automatique ni collecte de coordonnées financières.
- Pour toute nouvelle manche, les signatures et les préférences cadeaux sont réinitialisées et chacun signe à nouveau. Les conversations et appels ne sont pas affectés.

## Notifications avec accès direct au contenu et défi Ludo

- Une invitation Ludo est **envoyée seulement sur action explicite** « Lancer un défi à mon partenaire » dans l'écran de règles, au maximum une fois par minute pour une même partie. Notification : « Ton partenaire t'a lancé un défi ! ». La destination inclut l'identifiant de la manche et ouvre directement le Ludo et ses signatures.
- Le service worker conserve un type de notification, la destination et un identifiant de contenu. Le clic ouvre l'élément exact, même si l'application était fermée : message, photo ou vocal affiché dans une vue de détail ; appel dirigé vers l'écran d'appel ; défi dirigé vers le Ludo.
- Les données privées sont chargées par les API existantes **après authentification**, vérifiées par room_id. L'identifiant dans le lien ne donne aucun accès sans le jeton valide du couple.
- Les appels déjà terminés peuvent ne plus être disponibles ; les notifications ne garantissent pas que le destinataire soit encore joignable. Les notifications nécessitent VAPID configuré, un abonnement push et la permission iOS/Android.
- Cache PWA actualisé pour que les liens de notification utilisent ce nouveau routage.

## Memory Love 💞 — Deuxième jeu, en ligne à deux

- Grille de 16 cartes (8 paires) aux symboles originaux. Les deux appareils voient le même plateau, les mêmes points et le même tour grâce à Cloudflare Pages Functions et D1 ; la composition des cartes cachées n'est jamais divulguée à l'interface.
- Retrouver deux cartes identiques rapporte 1 point et permet de rejouer. Sinon, les cartes restent visibles environ 1,45 s puis le tour passe au partenaire. Le plus grand score à la fin des 8 paires remporte la manche ; une égalité ne déclenche pas de cadeau.
- 30 secondes pour chaque action. Un joueur inactif est remplacé par un coup de l'ordinateur au prochain appel serveur : le bot ne connaît que les cartes déjà révélées au cours de la manche. Comme pour Ludo, sans téléphone actif, l'expiration se résout à la reprise des requêtes.
- Avant **chaque** manche, les deux personnes lisent les règles, cochent leur compréhension, sélectionnent oui ou non pour le cadeau et signent avec leur nom de profil. Le serveur bloque les actions et le chrono avant la deuxième signature.
- Cadeau amical uniquement si les deux optent pour oui : crédit téléphonique, Internet ou Wave 2 000 F CFA ; aucune transaction automatique.
- Un bouton explicite « Lancer un défi » envoie une notification Push au partenaire, avec accès direct à Memory Love et à l'écran de signature ; au maximum une nouvelle invitation par minute et par manche.
- L'écran reste fixe sur téléphone et le plateau est dimensionné pour rester visible. Le joueur peut revenir à l'accueil sans perdre sa partie, ou abandonner (victoire du partenaire).
- D1 crée séparément `memory_games`, `memory_agreements`, `memory_gifts` et `memory_challenges` ; les données existantes de Ludo, du chat, de l'album et des appels restent inchangées.
