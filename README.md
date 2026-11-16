## 🎨 Love Radar 2.0 — refonte visuelle « Midnight & Rose »

La nouvelle interface adopte une identité **bleu nuit, rose corail et champagne** avec une typographie cohérente et des contrastes renforcés ; elle remplace les grandes surfaces violettes précédentes. La refonte est centralisée dans `src/redesign.css` et `src/redesign-features.css`, importés en dernier dans `src/App.tsx` pour conserver les fonctionnalités et permettre un entretien simple.

- **Navigation** : cinq onglets stables avec icônes vectorielles homogènes (Accueil, Messages, Nous deux, Jeux, Souvenirs). Sur téléphone, ils sont regroupés dans une barre flottante arrondie respectant les marges et la zone de sécurité iPhone. L’onglet actif est mis en évidence.
- **Accueil** : bienvenue personnalisée, portraits du couple, bandeau de statut, trois accès directs Écrire / Regarder / S’écouter ; rubriques identifiées pour l’histoire, le moment du jour, les activités et les échanges.
- **Messages** : nouveau fond bleu-ardoise, bulles corail pour l’expéditeur, surfaces bleu nuit pour le destinataire, meilleure hiérarchie de la zone de saisie et du statut.
- **Ensemble, Jeux, Puzzle, YouTube/TikTok, Réconciliation et appels** : surfaces et commandes harmonisées. Les plateaux de jeux et les lecteurs officiels conservent leurs logiques et leurs couleurs fonctionnelles.
- **iPhone et Android PWA** : l’application reste dans un cadre fixe, avec défilement interne réservé aux zones de contenu lorsque nécessaire. Les lecteurs YouTube et TikTok ne font pas défiler toute la page ; le clavier de la conversation et de la réconciliation reste accessible.
- **Installation** : le manifeste PWA, la couleur de la barre système et les descriptions ont été mis à jour. Le cache est actualisé dans le service worker de la version actuelle pour propager les changements aux utilisateurs ayant déjà installé Love Radar.
- La refonte est **visuelle et de navigation uniquement** : aucune migration D1 ni modification des conversations, photos, appels ou abonnements push. Un test sur les vrais iPhone reste nécessaire pour confirmer l’ergonomie finale.
- Tests : `npm run test:design`, `npm run test:call`, `npm run test:watch`, `npm run build`.

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

**Confidentialité :** les messages ne sont pas chiffrés de bout en bout. Le navigateur garde une session locale. Chaque membre peut désormais enregistrer son **code personnel de secours**, distinct du code d’invitation, et le renouveler dans les Paramètres. La restauration sur un nouvel appareil révoque le jeton précédent. En l’absence d’un code de secours conservé, une ancienne session perdue ne peut pas être restaurée. L’application doit être testée sur deux téléphones avant ouverture au grand public. N’ajoutez jamais de secrets ni de photos privées au dépôt GitHub.

**Limites de cette version :** la messagerie et les appels nécessitent une configuration Cloudflare correcte ; la livraison de notifications en arrière-plan dépend de la PWA installée et des permissions du téléphone. Le système de codes de secours est opérationnel dans le code, mais il n’y a pas de récupération par e-mail/SMS. Le contrôle anti-abus couvre les créations d’espaces, essais de codes, textes, médias et appels ; il ne remplace pas un WAF ou un audit externe. Pas de chiffrement de bout en bout ni de modération automatique. Le mode Radar est un jeu, jamais une preuve de fidélité ou d’infidélité.

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

### 🔔 Invitation automatique au lancement d'une vidéo

- Dans YouTube ou TikTok, le serveur envoie une notification push au **partenaire de l'autre membre** quand le bouton lecture passe d'une vidéo en pause à la lecture. Un changement de vidéo, un déplacement dans la timeline, le polling et une lecture déjà active ne déclenchent pas de nouvelle invitation.
- La notification dit « [prénom] t'invite à regarder YouTube/TikTok » ; toucher l'alerte ouvre directement l'onglet `/?tab=watch` ou `/?tab=watch-tiktok`, qui récupère automatiquement la vidéo et la position partagées depuis la salle du couple.
- Lorsque Love Radar est ouvert, un petit bandeau propose aussi **Regarder** pour rejoindre directement la bonne séance.
- L'envoi est exécuté en arrière-plan Cloudflare (`ctx.waitUntil`) après la sauvegarde réussie du début de lecture ; il ne bloque pas la vidéo. Il repose sur les abonnements Web Push et la configuration VAPID déjà existants. Sur iPhone, il faut installer la PWA et **activer les notifications** ; une notification acceptée par le service ne garantit pas son affichage final.
- L'écran « Nous deux » donne maintenant la priorité à **Regarder ensemble**, regroupe Moment/Retrouvailles/Position sous trois boutons et évite le grand panneau vide des petits mots.
- Tests : `npm run test:watch`, `npm run build` ; faire une vérification de réception et d'ouverture de notification sur deux téléphones après déploiement.

## 🕊️ Mode Réconciliation — « On se comprend »

L'espace **Nous deux → On se comprend** permet à chaque partenaire d'exprimer librement ce qui lui fait mal, à son rythme et sans devoir répondre à un questionnaire fermé.

- Trois espaces d'écriture non obligatoires, dont **« Tout ce qui me fait mal » (16 000 caractères)**, « Ce dont j’ai besoin » et « Ce que j’aimerais te dire » (5 000 caractères chacun).
- Les brouillons se sauvegardent automatiquement après environ 1,5 seconde d'inactivité et peuvent être sauvegardés manuellement. Les textes restent visibles pendant la saisie et sont stockés sur le serveur D1 ; **ils ne sont pas chiffrés de bout en bout**.
- **Double consentement :** un partenaire peut terminer son texte et l'envoyer, mais personne ne peut lire le texte de l'autre avant que **les deux** aient explicitement appuyé sur **« J'ai tout dit »**. L'API D1 retourne uniquement le brouillon de l'utilisateur authentifié avant cela ; l'accès aux textes de l'autre est conditionné à l'état `revealed` et à deux soumissions.
- Une fois tous les deux prêts, Love Radar affiche les deux témoignages séparément, sans les juger ni choisir qui a raison. Les deux peuvent ensuite s'écrire ou utiliser l'appel vocal, et voir quelques phrases pour ouvrir la conversation calmement.
- Inviter l'autre et dévoiler les deux textes peut déclencher des notifications Web Push ne contenant **aucune confidence**. La fonctionnalité fonctionne même si l'autre n'est pas connecté au moment de l'invitation.
- Un bouton « Fermer cette démarche et effacer les textes » permet de mettre fin à l'espace commun et de supprimer les deux textes enregistrés. Le processus ne doit jamais être utilisé pour obliger l'autre à se réconcilier.
- Limite de sécurité : il s'agit d'un outil de conversation privée, pas d'une thérapie ni d'un service d'urgence. L'accès dépend de la confidentialité des appareils et des identifiants Love Radar.
- Tests : `npm run test:reconcile`, puis `npm run build`. Les notifications et les échanges réels à deux restent à tester après déploiement.

## 🎬 Regarder ensemble — cinéma synchronisé à deux

- Accessible dans **Ensemble → Regarder ensemble**, même à distance : chacun ouvre son propre lecteur YouTube intégré dans Love Radar.
- L'un ou l'autre peut partager un lien `youtube.com/watch`, `youtu.be`, `/shorts`, `/live` ou `/embed`. Seuls les identifiants vidéo YouTube valides sont acceptés.
- Le lien, les commandes **lecture/pause**, les sauts de **10 secondes** et le déplacement dans la vidéo sont enregistrés dans une table D1 privée à chaque couple. Les appareils récupèrent les changements toutes les ~1,6 seconde ; l'heure serveur permet de calculer la bonne position en cours de lecture. Une protection par version évite les mises à jour concurrentes.
- Une indication montre si le partenaire a rejoint la salle ; un court message peut être envoyé sans quitter le lecteur. L'appel vocal existant est disponible depuis le haut de la salle.
- La salle fonctionne sans clé API YouTube ni serveur de streaming vidéo : **chaque téléphone charge légalement la vidéo depuis le lecteur officiel YouTube**, séparément.
- Limitations : certaines vidéos privées ou interdites d'intégration ne se lanceront pas ; sur iOS, chaque personne peut devoir toucher « Activer la vidéo » avant la lecture. Les publicités, les débits et les temps de chargement propres à chaque téléphone empêchent une synchronisation garantie à l'image près. Les services payants (Netflix, Disney+…) ne sont pas retransmis.
- Sécurité : API authentifiée par membre de l'espace, contrôle de version et validation des IDs YouTube. Les règles CSP permettent exclusivement l'iframe YouTube et son API ; la politique de référent transmet seulement l'origine, pour respecter les nouvelles exigences d'identification de YouTube.
- Tester : `npm run test:watch`, puis `npm run build`. Le fonctionnement iPhone/Android doit être confirmé sur deux appareils après le déploiement Cloudflare.

### ♪ TikTok ensemble — regarder à deux directement dans Love Radar

Depuis **Ensemble → Regarder ensemble → TikTok**, chacun peut regarder la même vidéo TikTok publique dans un lecteur intégré.
- La fonctionnalité utilise l'**Embed Player officiel de TikTok** : `https://www.tiktok.com/player/v1/{id}`, sans téléchargement ni redistribution des vidéos.
- Les deux partenaires partagent un lien vidéo `tiktok.com/@…/video/{id}`, un ID numérique valide ou un lien court `vm.tiktok.com` / `vt.tiktok.com` lorsque les redirections TikTok sont accessibles.
- Lecture, pause et déplacement dans la vidéo sont synchronisés via `postMessage` documenté par TikTok et un état partagé dans Cloudflare D1, propre à chaque couple. La synchronisation est approximative (actualisation ~1,6 seconde), sans garantie d'être à l'image près.
- Un indicateur montre si l'autre personne regarde ; le chat est accessible dans la salle et l'appel vocal existant reste disponible.
- L'API vérifie les jetons des membres, refuse les identifiants et URLs invalides, et protège les écritures concurrentes par version. Les événements du lecteur sont acceptés uniquement depuis l'origine TikTok et le bon iframe.
- La vidéo doit être publique et autorisée à l'intégration. Sur iPhone, la lecture peut nécessiter un appui manuel après le chargement ; les vidéos supprimées, privées ou restreintes ne fonctionneront pas.
- **Ce n'est pas encore un appel vidéo face à face** : les appels existants sont vocaux. La vidéo TikTok est partagée sur deux écrans avec messagerie.
- L'ancien mode Netflix/Teleparty a été supprimé du menu et du code ; aucune vidéo Netflix n'est diffusée depuis Love Radar.
- Tests : `npm run test:watch`, `npm run build`. Vérifier sur deux téléphones après déploiement.

## Ludo Duo : chrono de 15 secondes et défi cadeau facultatif

- Chaque joueur dispose de 15 secondes pour agir (lancer le dé ou déplacer son pion). Le délai est calculé et contrôlé sur le serveur avec l'horodatage enregistré dans D1.
- À l'expiration, un bot serveur lance le dé et choisit un déplacement légal, avec une préférence pour les captures, l'arrivée et les cases protégées ; il gère les 6 et les tours bonus.
- Si aucun pion ne peut avancer après le lancer, le tour passe immédiatement à l'autre joueur (même si le 6 ne permet aucun coup). L'ordinateur reprend le tour complet d'un joueur inactif au bout de 15 secondes, sans intervention manuelle.
- **Limite technique :** les fonctions Cloudflare Pages ne s'exécutent pas en tâche de fond. Les tours expirés sont résolus lors de la prochaine requête API authentifiée (chaque app ouverte interroge toutes les 1,6 s). Si les deux téléphones sont fermés, le coup sera joué à la reprise, pas obligatoirement à la quinzième seconde.
- 🎁 Défi cadeau entre partenaires, entièrement facultatif : les deux joueurs acceptent explicitement **avant la victoire** ; après la victoire, le gagnant peut demander du crédit téléphonique, un forfait Internet ou 2 000 F CFA via Wave. Le perdant peut marquer le cadeau comme offert.
- **Aucun transfert de fonds, achat de crédit ou achat de data n'est effectué par Love Radar.** Les cadeaux sont des promesses informelles entre les participants ; l'application ne collecte ni numéros Wave, ni coordonnées de paiement, ni données bancaires.
- Les accords et le choix de cadeau appartiennent à une manche, sont stockés dans D1 et sont réinitialisés au démarrage d'une nouvelle manche. Aucun changement de règles de jeu ni de données privées existantes.

## Accord et signatures avant chaque partie de Ludo Duo

- **Avant chaque manche**, les deux partenaires lisent les règles complètes dans un écran bloquant, cochent « J'ai lu et compris », répondent explicitement **oui ou non** au défi cadeau et signent avec le nom de leur compte Love Radar.
- Les signatures sont enregistrées de manière privée par l'API authentifiée, avec le nom, le choix du défi et la date/heure, dans `ludo_agreements` (une entrée par salle et par manche). Le serveur valide que le nom saisi correspond au profil connecté ; il s'agit d'une **attestation dans l'application**, pas d'une signature légale certifiée ou d'une vérification d'identité.
- Aucun lancer de dé, déplacement ou coup automatique n'est autorisé avant **les deux signatures**. Le délai de 15 s ne démarre qu'après le deuxième accord. Les manches déjà ouvertes restent préservées mais doivent être signées pour continuer.
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

## Signatures simplifiées dans Memory Love et Ludo Duo

- La signature ne nécessite plus de saisir son nom. Une **seule case à cocher**, que l'on peut cocher ou décocher avant validation, confirme la lecture des règles et autorise l'enregistrement de la signature.
- Le bouton « Valider ma signature » n'est activé qu'après avoir coché la case et répondu oui ou non au défi cadeau.
- Chaque API vérifie explicitement les deux consentements booléens, puis enregistre le nom du profil authentifié et l'horodatage dans D1. Chaque manche reste bloquée jusqu'à la validation des deux comptes.
- La signature correspond à une attestation privée dans Love Radar, sans certification légale. Les cadeaux restent facultatifs et aucun paiement n'est effectué par l'app.

## Notre moment du jour 💌 — question quotidienne privée

- Nouvelle entrée `Moment` accessible depuis l'accueil et le menu. La même question romantique et originale est définie par la **date UTC** pour les deux personnes, même dans des pays différents. Le catalogue initial comporte 56 questions et peut être enrichi sans modifier le modèle D1.
- Chacun peut envoyer **une seule réponse par jour** (2 à 1 200 caractères). La réponse de l'autre reste **strictement masquée par l'API serveur** tant que les deux n'ont pas répondu ; l'interface ne reçoit donc aucun texte caché à découvrir.
- Dès que les deux ont participé, les réponses sont dévoilées simultanément et chacun peut réagir à la réponse de son partenaire avec un emoji enregistré.
- Les derniers moments avec une réponse sont accessibles depuis une petite archive privée. Les questions précédentes sont consultables mais ne sont plus ouvertes à de nouvelles réponses.
- La première réponse déclenche une notification Push à l'autre partenaire (« À ton tour ») et la deuxième prévient que les deux réponses sont révélées, avec un **lien direct vers la question de la date** (`?tab=moment&kind=daily-question&id=YYYY-MM-DD`). Sans autorisation Push, l'espace se synchronise à l'ouverture de l'app.
- L'espace quotidien est stocké dans `daily_moments`, sur la base D1 existante, et lié au salon privé ; les messages, appels et jeux ne sont pas modifiés.
- Love Radar fonctionne avec un hébergement Cloudflare Pages + D1 indépendant des plateformes de messagerie tierces. Les questions changent à minuit UTC, affiché clairement à l'écran.


## Première page simplifiée et fixe sur téléphone

- Page publique uniquement : logo, courte accroche romantique et accès direct au formulaire « Créer mon espace / J'ai un code ». L'ancienne grande illustration, les trois pastilles et les longs paragraphes ont été retirés.
- Sur les petits écrans, le contenu est dimensionné pour tenir dans la hauteur du téléphone sans défilement normal. Les variantes « créer » (un champ) et « rejoindre » (deux champs) restent visibles et utilisables.
- Lorsqu'un champ reçoit le focus sur iOS, seule la zone formulaire reste visible et elle est contrainte à la hauteur de visualViewport pour éviter que le clavier masque les commandes. Un défilement intérieur au formulaire reste possible uniquement dans le cas extrême d'un clavier/écran trop petit.
- L'écran d'accueil du couple connecté, les jeux, les notifications, les conversations et les données restent inchangés.

## 🧩 Puzzle à deux — remplace Dessiner ensemble et Position

- L'accueil et la section **Ensemble** ont été réorganisés : **Regarder ensemble** reste l'activité principale, puis **Moment** et **Retrouvailles** en raccourcis. Deux activités : « 💗 Tu me manques » et « 🧩 Puzzle à deux ». Il n'existe plus de bouton « Position » ni de tableau « Dessiner ensemble ».
- **Puzzle** : neuf pièces carrées illustrées, 3×3. Trois images originales incluses dans le dépôt : cœurs, coucher de soleil et fleurs. Un joueur touche une pièce, puis une autre pour les échanger ; sur ordinateur, le glisser-déposer fonctionne aussi.
- Le plateau et son thème sont communs aux deux partenaires du même espace privé ; une session serveur dans Cloudflare D1 sauvegarde les positions, le nombre d'échanges, le dernier joueur et la victoire. Chaque appareil récupère les changements environ chaque 1,15 seconde. Une protection de version empêche les déplacements simultanés contradictoires.
- En choisissant une nouvelle image ou en mélangeant le plateau, le serveur réinitialise le **même puzzle** pour les deux joueurs ; une invitation Push peut être envoyée au partenaire si une nouvelle partie est lancée après une pause. L'alerte ouvre directement `/?tab=puzzle`.
- Une miniature permet de consulter l'image à reconstruire, avec validation des pièces au bon endroit et un message commun lorsque les neuf pièces sont en place.
- **Tu me manques** reste accessible : une pensée peut toujours être envoyée avec notification, et le partenaire peut répondre « Moi aussi ❤️ », « Je t'embrasse 😘 » ou « Je t'aime 💖 ». Les messages sont toujours dans la table `affection_signals`.
- Les anciennes interfaces et les API de **dessin** et de **partage de position** sont supprimées. La nouvelle version n'effectue plus de collecte GPS ni d'écriture de coordonnées ; lors de la prochaine ouverture d'une activité « Ensemble » ou « Puzzle », les anciennes demandes de localisation stockées pour le couple sont effacées de D1.
- Les anciennes tables de dessin ne sont plus utilisées ; les jeux, messages, souvenirs et appels restent indépendants et inchangés.
- Tests : `npm run test:puzzle` et `npm run build`. Vérifier l'interaction sur deux vrais téléphones après déploiement.

## ⚡ Priorité : accélérer la connexion des appels et fixer TikTok sur iPhone

- **Cause principale identifiée :** les offres et réponses WebRTC attendaient auparavant la collecte ICE complète, avec un maximum de **14 secondes par appareil**. Un appel pouvait donc attendre plusieurs cycles pour obtenir une connexion audio.
- **Trickle ICE :** l'offre SDP est maintenant envoyée dès sa création, suivie de chaque candidat réseau ; idem pour la réponse du second téléphone. Le serveur `/api/call` valide les candidats, les enregistre dans l'ordre et les limite à 64 par côté. Les anciens navigateurs qui n'ont pas encore chargé cette version doivent être rechargés, car le protocole de signalisation a changé.
- Le service TURN Cloudflare est préchargé dès qu'un partenaire est présent, sans demande micro anticipée ; l'appel utilise les paramètres réseau préchargés. La collecte de chemins WebRTC peut commencer plus rapidement avec `iceCandidatePoolSize:2`.
- Le rafraîchissement des appels passe à ~1,1 seconde au repos et ~650 ms pendant un appel, avec vérification immédiate après acceptation. Les candidats non transmis sont retentés. Le serveur peut maintenant renvoyer 40 signaux par requête au lieu de 10.
- **L'amélioration de temps dépend du téléphone, des permissions micro, du réseau, des services STUN/TURN et de la présence de l'autre personne ; aucun délai de connexion ne peut être garanti.** Les échanges vocaux continuent d'être chiffrés par WebRTC. Une mesure réelle sur deux téléphones est nécessaire après déploiement.
- **TikTok** : sur iPhone, plus de défilement de la page entière ; une zone vidéo flexible occupe l'espace disponible, les commandes de lecture, le formulaire de partage et l'entrée messagerie restent visibles. La grande carte vide a été raccourcie, l'explication secondaire condensée, et les champs de texte restent accessibles lorsque le clavier s'ouvre. L'historique de messages peut conserver son propre défilement lorsqu'il est développé.
- Tests : `npm run test:call`, puis `npm run build`. Le cache PWA est monté en version 41 pour charger le nouveau protocole sur les deux appareils.

## 📞 Réduire l'appel et écrire en même temps

- Pendant un appel accepté, le bouton « Réduire · Écrire » masque uniquement la grande fenêtre d'appel et revient à la conversation. Il ne ferme ni la connexion WebRTC ni le microphone.
- Une petite barre d'appel reste visible en haut avec le prénom du partenaire, le chronomètre, un bouton pour revenir à l'appel, le contrôle du microphone et « Raccrocher ». Si Safari refuse la lecture audio, « Activer le son » reste accessible dans cette barre.
- La barre reste visible également si l'utilisateur navigue vers une autre page de Love Radar ; les appels entrants continuent d'utiliser la fenêtre entière pour accepter/refuser.
- La barre est placée en haut afin de ne pas cacher le champ de saisie et le clavier iPhone. L'audio reste lié au composant VoiceCall toujours monté tant que le couple est connecté.
- Cela ne permet pas de maintenir un appel en arrière-plan lorsque l'application iOS elle-même est fermée, verrouillée ou suspendue. Garder Love Radar à l'écran.
- Pas de changement au serveur d'appel ni aux permissions micro ; cache PWA v27 pour activer les nouveaux contrôles.

## Navigation mobile simplifiée : 5 onglets

- La barre inférieure ne contient désormais que « Accueil », « Messages », « Ensemble », « Jeux » et « Souvenirs », tous de taille égale sur iPhone.
- « Jeux » est un écran de sélection avec Ludo Duo et Memory Love. Le bouton retour de chaque jeu mène à cette sélection.
- « Ensemble » regroupe « Tu me manques », « Puzzle à deux », « Moment du jour », « Retrouvailles » et « Regarder ensemble ». Le retour du puzzle et de Moment mène à Ensemble.
- Les liens directs et notifications vers Ludo, Memory, Moment, cœurs et Puzzle restent fonctionnels ; les anciens liens Position redirigent vers Ensemble. L'onglet parent est sélectionné dans la barre du bas.
- La barre latérale sur ordinateur utilise la même organisation en cinq destinations. Aucune donnée de jeu ou de conversation ne change. Cache PWA v28.

## Afficher le plateau Ludo avant l'arrivée de l'autre joueur

Le plateau du Ludo Duo s'affiche **dès l'ouverture**, même si la pièce privée ne compte qu'une seule personne. Les huit pions apparaissent en position initiale pour donner un aperçu fidèle du jeu. Le message d'attente reste dans la petite barre de statut au-dessus du plateau et un bouton « Actualiser » est disponible à la place du lancer de dé. Il est impossible de déplacer les pions ou de lancer les dés avant l'arrivée du deuxième joueur et la validation des règles par chacun. La partie réelle et les scores continuent de venir exclusivement du serveur D1 ; aucune partie fictive n'est créée. Le cache PWA passe en v29.


## 💑 Notre histoire — 📅 Nos retrouvailles

Deux nouvelles activités privées, éditables par les deux membres du couple, sans alourdir la barre principale (toujours 5 onglets).

**Notre histoire** (Accueil → Notre histoire ou Souvenirs → Notre histoire) :
- Photo commune modifiable ou supprimable. JPEG/PNG/HEIC éventuellement converti côté iPhone en JPEG redimensionné (1500 px maximum), puis stocké dans le bucket R2 existant sous un préfixe spécifique au salon. Aucun lien R2 public. `GET /api/story-photo` exige le token du membre et n'est jamais mis en cache.
- Date de rencontre, affichage automatique du nombre de jours ensemble (jours calendaires calculés localement).
- Chronologie commune : jusqu'à 40 souvenirs ou dates importantes avec titre, date et petit mot facultatif ; suppression avec confirmation. Certains événements peuvent se répéter chaque année.
- Les modifications du couple sont enregistrées en D1 et rechargées automatiquement sur les deux appareils lorsque la page reste ouverte.

**Nos retrouvailles** (Accueil → Nos retrouvailles ou Ensemble → Retrouvailles) :
- Date de la prochaine rencontre et petit mot ou lieu optionnel ; compte à rebours partagé en jours, sans inventer une heure ni supposer le fuseau horaire d'un partenaire.
- Liste des prochaines dates importantes. La date de rencontre engendre automatiquement son anniversaire annuel ; les autres dates annuelles sont celles marquées « Chaque année ». Pour le 29 février, l'anniversaire tombe le 28 février les années non bissextiles.
- La date peut être modifiée ou retirée à tout moment. Une modification de date envoie une notification au partenaire si les notifications sont activées.

**Confidentialité et maintenance :** D1 crée les tables `couple_stories` et `couple_story_events` si nécessaire ; le serveur vérifie chaque token et limite systématiquement l'accès au salon du couple. Lors de la suppression du salon, ses événements, ses dates et la photo privée dans R2 sont également supprimés. Les API ne sont pas mises en cache. Cache PWA v30. Aucune dépendance externe ni Firebase.

## Messages non lus et réparation des notifications (PWA v31)

- Le bouton « Messages » des 5 onglets affiche le **nombre de messages réellement non lus** sur l'enveloppe (1 à 99+), au lieu du nombre total de messages. Le compteur couvre les textes, photos et vocaux ; il est calculé côté serveur à partir du `last_read_at` de chaque membre, indépendamment des 90 derniers messages affichés.
- L'ouverture de la conversation marque les messages reçus comme lus ; l'API renvoie le nouveau compteur sur la prochaine synchronisation. Les deux membres ont leur propre compteur de lecture.
- Chaque nouveau message texte reçoit son identifiant et une notification ciblée, afin que plusieurs messages successifs puissent produire des alertes distinctes. `GET /api/love?messageId=...` valide le membre du salon et renvoie son message précis, comme le faisaient déjà les images/vocaux.
- « Notifications activées » est maintenant confirmé par un **enregistrement serveur effectif**, pas seulement la permission du navigateur. Au retour dans l'application, tout abonnement push encore présent sur le téléphone est remis à jour dans D1 ; s'il utilise une ancienne clé VAPID, il est recréé, lorsque le navigateur le permet.
- « Réparer » reconstruit volontairement l'abonnement sur cet appareil, « Tester » envoie un vrai push **à tes propres appareils** (limite : un essai/minute) et « Désactiver » reste disponible séparément.
- Le backend compte les requêtes acceptées et refusées par les services push ; le test n'affirme jamais que le téléphone a effectivement affiché une notification. Une autorisation iOS, une installation PWA et les paramètres de notifications du système restent nécessaires. La clé VAPID et le service worker doivent être déployés sur Cloudflare.
- Le service worker prévient l'application ouverte qu'un push est arrivé et qu'un abonnement a été remplacé. Il n'a jamais accès au token du membre. Le cache PWA est v31.


## 🔐 Mode confidentialité · Love Radar (sans écran global masqué)

**Important : une PWA ne peut pas empêcher les captures d’écran iOS ou Android.** Cette fonctionnalité réduit l’exposition des contenus ; ce n’est ni un blocage système ni une protection absolue des photos. Une autre personne peut toujours prendre une photo de l’écran.

- **Activé par défaut sur chaque appareil** ; contrôle « Mode confidentialité » dans le menu de profil. Choix conservé localement sur l’appareil (pas synchronisé avec le partenaire).
- **Correctif YouTube / iPhone :** les masques plein écran « Love Radar · Écran masqué » et « Votre espace est masqué » ont été entièrement supprimés de la PWA. La perte de focus, l'affichage plein écran YouTube, le passage en arrière-plan ou un retour dans l'application ne couvrent plus le contenu par un écran violet.
- **Photos du chat, album, notification photo et photo de couple** : cachées par défaut et révélées explicitement au toucher pendant 30 secondes, puis automatiquement masquées. Elles se cachent aussi au passage en arrière-plan. Le filigrane d’affichage « LOVE RADAR · PRIVÉ · [prénom du spectateur] » est superposé aux photos révélées. Il ne modifie pas le fichier source et ne peut pas empêcher quelqu’un de recadrer une capture.
- Sur l’accueil, la dernière photo est représentée par un espace masqué tant que le mode est actif. Les souvenirs, les messages et les appels continuent de fonctionner.
- Le serveur restreint toujours les téléchargements des médias aux membres authentifiés du salon et répond maintenant `Cache-Control: private, no-store` ainsi que `Cross-Origin-Resource-Policy: same-origin`. Cela n’efface pas les captures ou copies déjà faites et ne chiffre pas les photos de bout en bout.
- Le bouton « Masquer l'écran maintenant » a été retiré des paramètres. Les photos privées révélées temporairement et le filigrane demeurent ; le plugin de confidentialité natif iOS/Android reste indépendant de ce masque web. Un essai du lecteur sur iPhone après déploiement reste nécessaire.


## 📱 Version native iPhone et Android (Capacitor)

Première intégration du runtime mobile natif, plugin officiel de protection écran, API Cloudflare autorisée pour les WebViews locales et générateurs de projets iOS/Android. Voir [docs/native.md](docs/native.md) pour compiler un APK de test et découvrir les limitations restantes (notamment les notifications natives non encore intégrées).


## 🎲 Ludo Duo — mise à niveau « arène premium »

- **Plateau original redessiné en CSS/SVG** avec bordure ivoire, pions brillants en relief, zones et chemins contrastés ; aucune image ni marque Ludo King copiée.
- **Déplacements réellement animés** à environ 235 ms par case avec saut, numéro de pas, chemin éclairé et lumière sur la case d'arrivée. Sortie de base et arrivée au centre incluses. Un mouvement validé est enregistré en D1 (table `ludo_move_events`) pour que l'autre téléphone puisse récupérer le dernier trajet même en cas de saut de versions pendant la synchronisation.
- **Pions empilés dans la même case** : un pion centré ; deux légèrement superposés ; trois en triangle ; quatre en carré compact ; plus de quatre en cercle compact sur une case protégée. Les numéros et la barre « Mes pions » permettent toujours de choisir précisément le pion.
- **Capture animée** : les pions mangés retournent visiblement à leur base après l'impact, avec son court et vibration légère lorsque la plateforme le permet.
- **Réactions de couple en direct** : 15 stickers (😂 😱 😮 🤯 😍 😘 😤 😭 😎 👏 ❤️ 🔥 🥹 😡 💋). Les réactions de chaque joueur sont distinctes et synchronisées dans `ludo_reaction_events` (max. 1 envoi/700 ms/personne, rétention de 60 secondes), puis affichées sur la carte du joueur et au-dessus du plateau.
- **Accessibilité** : disposition lisible sur iPhone, clavier/pions accessibles et préférence système « Réduire les animations » respectée. Les règles, signatures, consentement cadeau, dés et résultats restent autorisés **uniquement par le serveur**.
- **Tests de géométrie** : `npm run test:ludo` contrôle les 52 cases du parcours, les 6 cases d'arrivée, les déplacements case par case et la disposition des piles.
- **Cache PWA v34.** L'application n'a pas encore été validée par deux utilisateurs sur iPhone et Android ; un build réussi ne garantit pas l'affichage final ou la latence réelle.

## Sécurité des comptes et lancement bêta

- À la création d’un espace ou à l’arrivée du partenaire, chacun reçoit un **code de secours personnel** de 128 bits, différent du code d’invitation. À conserver en lieu sûr : le serveur ne stocke qu’un hachage et le code ne sera affiché qu’une seule fois. Les anciens membres peuvent générer leur propre code via **Paramètres → Compte et invitation**.
- Sur un nouvel appareil, cliquer sur **« J’ai perdu mon accès »**, saisir son code personnel et sauvegarder le nouveau code fourni. La restauration invalide la précédente session et tente de supprimer les anciennes notifications push.
- Des limites anti-abus en base D1 sont appliquées au serveur pour les tentatives d’inscription, de récupération, les messages, les réactions, les médias et le démarrage d’appels.
- **Paramètres → Diagnostics** permet de tester depuis chaque téléphone l’accès à la messagerie, la disponibilité déclarée du relais TURN, la compatibilité WebRTC, les autorisations de notification et le microphone.
- `npm run test:security` exécute les tests de récupération et de limitation ; `npm run test:load` teste **uniquement les métriques de simulation**, sans aucun trafic. Pour un véritable test de charge, utiliser un environnement de préproduction séparé et l’outil `npm run load:staging` avec son opt-in explicite.

Voir **[les critères de lancement et les tests sur deux vrais téléphones](docs/RELEASE_READINESS.md)**. Aucune validation de charge pour des milliers de couples n’est revendiquée ici.

## Appels iPhone sur écran verrouillé (CallKit + PushKit) — version native uniquement

Le code d'intégration est dans `native/call-session/ios-voip.swift.txt`,
`src/native-voip.ts`, `functions/api/voip.ts` et `functions/lib/apns-voip.ts`.
`scripts/configure-native.mjs ios` ajoute automatiquement **CallKit**, **PushKit**,
le démarrage PushKit au lancement natif, les modes d'arrière-plan
(`audio`, `voip`, `remote-notification`) et les droits APNs du projet Xcode.
Aucune photo ou message privé ne figure dans les notifications VoIP ; elles
contiennent uniquement l'identifiant de l'appel, un nom d'affichage et l'expiration.

**Prérequis Apple incompressibles :** un compte Apple Developer actif, un
profil de signature iOS compatible avec Push Notifications/VoIP, une clé APNs
`.p8` (créée dans Apple Developer) et un **iPhone réel**. Le simulateur permet
de compiler l'interface, pas de valider la livraison PushKit verrouillée.

**Configuration serveur Cloudflare Pages (Production)**

- `APNS_TEAM_ID` : Team ID Apple (10 caractères).
- `APNS_KEY_ID` : identifiant de la clé APNs (10 caractères).
- `APNS_PRIVATE_KEY` : contenu entier de la clé Apple `.p8`, **Secret Cloudflare**.
- `APNS_BUNDLE_ID` : `com.diaotech.loveradar`.
- `APNS_ENVIRONMENT` : `sandbox` pour une app de développement signée,
  `production` (ou valeur omise) pour distribution/TestFlight.

**Ne jamais placer la clé .p8 dans le dépôt, dans une application compilée ou
dans le navigateur.** Le serveur utilise Web Crypto ES256 pour signer un JWT APNs
et délivre uniquement les appels à des appareils appartenant au même couple.

**Préparer le projet iOS sur un Mac**

1. `npm install && npm run build`.
2. Lors de la première installation : `npx cap add ios --packagemanager SPM`.
3. `node scripts/configure-native.mjs ios && npx cap sync ios`.
4. Ouvrir Xcode via `npx cap open ios`, sélectionner l'équipe Apple de signature
   et vérifier les capacités **Push Notifications** et **Background Modes**.
5. Signer, installer et tester l'application native sur deux iPhone physiques.
   Pour les modifications suivantes : `npm run mobile:ios`.
6. Redéployer les Pages Functions Cloudflare après avoir enregistré les secrets.

Les appels utilisent toujours le WebRTC de Love-Radar : la réponse depuis
l'écran verrouillé est relayée au serveur, puis le WebView reprend l'appel
lorsqu'iOS permet de l'exécuter. **CallKit n'est pas à lui seul un moteur média
natif** : l'audio continu avec téléphone verrouillé ou application totalement
suspendue exige une intégration WebRTC native supplémentaire et des essais
sur appareils signés. Les appels sont soumis à la connectivité et aux
autorisations iOS. Si l'application est installée uniquement en PWA depuis
Safari, cet écran système ne peut pas apparaître.

La table `native_voip_devices` est créée automatiquement à la première
inscription d'un appareil iOS et supprimée lors de la suppression de l'espace.
Le jeton de session est conservé dans le trousseau chiffré de l'app native
(Keychain, accessible après le premier déverrouillage), jamais dans les push.

## Nos petites attentions — règles et rappels de prière

Les deux fonctions sont dans **Nous deux → Nos petites attentions**. Elles ne
s'activent jamais automatiquement.

**Règles.** Une personne peut choisir « J'ai mes règles → Prévenir mon amour »,
confirmer l'envoi et, facultativement, demander une attention avec des
protections hygiéniques. Aucune photo, analyse du cycle, calendrier médical,
rappel automatique ni achat n'est déclenché. Le message privé est accessible
uniquement à l'autre membre du couple, expire après 48 heures et peut être
retiré plus tôt. Le contenu d'une notification sur écran verrouillé est
volontairement discret. Aucune aide matérielle n'est obligatoire.

**Prière.** Chacun choisit séparément d'autoriser le partage de ses
horaires de prière avec l'autre. La localisation n'est demandée **qu'après un
clic** et arrondie au dixième de degré (environ 10 km). Le fuseau horaire
IANA reste celui du téléphone et seule la personne concernée peut voir sa zone.
L'utilisateur sélectionne sa méthode de calcul, vérifie les heures affichées
et peut désactiver le partage à tout moment. Les heures quotidiennes sont
calculées par AlAdhan (https://aladhan.com/prayer-times-api) : la zone
approximative et la méthode sont envoyées à ce service **seulement après
consentement**. Les horaires peuvent différer de ceux d'une mosquée locale.

**La notification automatique lorsque l'application est fermée nécessite
un Cloudflare Worker distinct avec un déclencheur Cron.** Ce déploiement
n'est pas automatiquement inclus dans le déploiement Pages et demande
l'intervention du propriétaire du compte Cloudflare :

1. Copier `wrangler.care.toml.example` vers `wrangler.care.toml`.
2. Remplacer `database_id` par l'identifiant D1 de la **base de production
   Love-Radar existante**, sans créer une deuxième base.
3. Dans Cloudflare Workers, configurer pour ce Worker les mêmes secrets
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` que sur Pages
   (ne jamais les commiter dans GitHub). L'utilisateur doit activer les
   notifications sur son appareil pour recevoir les alertes système.
4. Déployer avec `npx wrangler deploy --config wrangler.care.toml`. Le Cron
   `* * * * *` vérifie une fois par minute les cinq prières du jour dans le
   fuseau de chaque membre et évite les notifications en double. Les
   rappels restent consultables dans l'app même sans abonnement Web Push.
5. Vérifier le Cron dans Cloudflare Workers et tester avec deux appareils.
   Le calcul API peut être indisponible : le service doit alors éviter
   d'envoyer une heure incorrecte.

La base D1 peut être préparée avec `schema.sql` ; les tables `care_*` sont
également créées automatiquement au premier accès. Elles sont supprimées
avec le couple. Les préférences et leur localisation approximative ne sont
pas publiques. La PWA et une application native n'ont pas nécessairement le
même support de notifications ; le PushKit VoIP des appels **ne sert pas**
à envoyer des rappels de prière.


## Protection des captures d’écran : native iPhone et Android

Love-Radar informe le couple de sa politique de confidentialité dans **Paramètres**.
Ce comportement est lié au système d'exploitation et non à un simple effet CSS.

- **iPhone / application native Capacitor :** `NativeCapture` observe
  `UIApplication.userDidTakeScreenshotNotification` lorsque l'application est
  ouverte. Après la capture, l'utilisateur authentifié peut signaler l'événement
  au serveur ; les deux partenaires retrouvent une carte « Capture d'écran »
  dans leur conversation. Un Web Push est envoyé au partenaire uniquement si
  une souscription de notifications valide existe. iOS ne fournit **pas**
  d'API officielle garantissant le blocage des captures.
- **Android / application native :** le plugin `@capacitor/privacy-screen`
  applique `FLAG_SECURE`, empêchant les captures et l'enregistrement natifs
  de l'écran de l'application. La désactivation du filigrane photo ne désactive
  pas cette protection. Une capture bloquée ne crée pas d'alerte.
- **Safari, PWA, navigateur web :** il n'existe pas de détection fiable
  des captures d'écran. Ne jamais promettre un avertissement à l'autre membre
  pour cette version.
- **Limites universelles :** un autre appareil peut photographier l'écran ;
  aucune protection n'est absolue. iOS n'avertit qu'après une capture.
  Les notifications push exigent une connexion et une souscription valide,
  et leur réception en arrière-plan peut dépendre du type d'installation.

`functions/api/screenshot.ts` authentifie l'auteur et conserve seulement
l'identifiant de l'événement, l'ID du membre, l'espace et l'horodatage.
**Aucun fichier image, texte de conversation ou contenu multimédia n'est envoyé.**
Les événements sont visibles dans l'historique jusqu'à 30 jours, avec
suppression opportuniste des entrées anciennes. Les notifications répétées
sont limitées pour prévenir les abus. Toutes les métadonnées sont effacées
lors de la suppression de l'espace privé.

Le plugin iOS est ajouté automatiquement à `AppDelegate.swift` par
`scripts/configure-native.mjs ios` : une nouvelle application native
signée et installée est nécessaire pour obtenir la détection. Mettre à
jour seulement le site ou la PWA ne suffit pas.


## TestFlight iPhone sans Mac

Love Radar dispose maintenant d'un [workflow GitHub Actions manuel](https://github.com/seckdiopka96-cpu/Love-Radar/actions/workflows/iphone-testflight.yml) permettant de compiler une app iPhone pour simulateur ou d'archiver, signer et envoyer un fichier IPA vers TestFlight avec les identifiants Apple Developer configurés dans les secrets GitHub.

**Guide complet adapté à un utilisateur sur iPhone uniquement :** [docs/TESTFLIGHT-IPHONE.md](docs/TESTFLIGHT-IPHONE.md). La compilation pour simulateur n'autorise **pas** l'installation sur un vrai iPhone ; un compte Apple Developer actif et une signature Apple sont nécessaires pour TestFlight.
