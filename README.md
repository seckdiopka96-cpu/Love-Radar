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
