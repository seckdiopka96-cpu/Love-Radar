# Love Radar ❤️ — by Diao-Tech.com

Application web **indépendante de Higgsfield** pour couples, en français. Son code et ses données peuvent être hébergés sur votre propre compte GitHub + Cloudflare Pages.

## Fonctionnalités

- Jeu Radar de bluff (humour, **pas** de détection réelle des mensonges)
- Question quotidienne, réponses cachées jusqu'à ce que les deux aient répondu
- Couple à distance : invitation par code unique à 10 caractères
- Messagerie privée : texte, photos et vocaux de 45 secondes maximum
- Album des photos partagées, suppression de l'espace par son créateur
- Sans appel, sans suivi GPS, sans intégration Higgsfield

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

Fichiers : `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`. Le service worker met en cache l'interface et les fichiers statiques pour permettre au minimum d'ouvrir la structure hors connexion. **Les jeux, messages, photos et vocaux requièrent Internet** et les API `/api/` ne sont jamais mises en cache.

Ce fonctionnement ne constitue pas une application publiée sur le **Google Play Store** ni un APK téléchargeable ; une distribution Play Store demanderait une étape de packaging et de publication séparée.

## Notifications iPhone et Android — configuration nécessaire

- Notifications disponibles sur **iOS 16.4+** uniquement lorsque Love Radar est **ajouté à l'écran d'accueil et ouvert depuis son icône** ; Android (Chrome) accepte aussi les notifications. Le consentement est toujours demandé par bouton.
- Les notifications concernent les **messages texte, photos, vocaux, réponses aux jeux, nouvelle question Radar et arrivée du partenaire**. Aucun message privé ni réponse précise n'est inclus dans les notifications pour préserver la discrétion.
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

## Love Radar 2 — messagerie mobile et Action ou Vérité

- **Clavier iOS/Android :** composer à 16px pour éviter le zoom iOS, hauteur basée sur `visualViewport`; dès que le champ de saisie a le focus, la conversation occupe l’écran visible et la navigation inférieure disparaît. Le bouton photo et le micro s’effacent pendant la saisie, sauf si un vocal est en cours.
- **Design :** nouvelle palette prune nuit, rose profond et touches or, adaptée aux deux plateformes.
- **Action ou Vérité :** deux catégories, défis bienveillants pour couples, possibilité de passer. Les choix et les fins de partie sont synchronisés entre téléphones grâce aux événements `game_start` et `game_done` enregistrés dans la table D1 `messages` existante. Aucune nouvelle table ni modification des messages privés n’est nécessaire. Les événements sont exclus de l’historique des conversations et n’apparaissent que dans l’onglet Radar.
- Les notifications des actions de jeu utilisent les clés VAPID déjà définies.
