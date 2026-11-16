# Audit serveur Love Radar — 16 novembre 2026

## 1. D1 et R2 : contrôles réels sans données privées
- Le diagnostic existant « Tester la connexion » confirme qu'un membre authentifié peut lire `/api/love?status=1` (D1) et récupérer la configuration TURN.
- Nouveau bouton dans **Paramètres → Diagnostics → Tester le stockage R2**.
- Il appelle `POST /api/server-diagnostics` avec le jeton d'une session Love Radar active.
- L'API valide la session **dans D1**, limite les vérifications à **3 par heure et par membre**, et crée une petite séquence d'octets aléatoires.
- Elle la stocke dans un objet R2 temporaire `_love_radar_server_checks/<UUID>`, relit et compare les octets, puis supprime l'objet dans un bloc `finally`.
- Le résultat distingue D1 disponible, R2 écriture/lecture correcte, et suppression réussie. **Aucun message, média d'un couple ou abonnement push n'est consulté.** Si la suppression échoue, le résultat est une erreur plutôt qu'un succès.
- Les tests de dépôt utilisent uniquement **un faux bucket en mémoire** : le test R2 réel exige le clic d'un membre connecté au déploiement Cloudflare Pages. Ne jamais affirmer qu'un test de production a réussi avant ce clic.

## 2. Déploiement Workers distinct du site Pages
- GitHub SHA `25d55cda17a10b5c961438bd7ac3e87277745fdb`: **Cloudflare Pages = success**, **Workers Builds: love-radar = failure**, **GitHub test/build = success**.
- Cette erreur Workers existait aussi au commit `37f3153d1ecefe4e1e37407596750d912a2bd5cf`.
- Le dépôt est une application **Cloudflare Pages Functions** (dossier `functions/api`), sans fichier de configuration Wrangler de Worker autonome. Le workflow Workers Builds utilise normalement `npx wrangler deploy`. Un second Worker relié au même dépôt **pourrait** être configuré incorrectement. Il faut le **journal exact** pour confirmer la cause; le statut GitHub seul ne l'indique pas.
- Lien de l'historique de build en échec :
  `https://dash.cloudflare.com/f904f028a51a53a81d0c3d4063f554af/workers/services/view/love-radar/production/builds/678df02b-3bd0-4912-8e4d-756937701655`
- Si le Worker `love-radar` autonome n'est pas utilisé pour une autre tâche, dans Cloudflare **Workers & Pages → Worker love-radar → Settings → Builds → Disconnect**, on peut arrêter les builds automatiques inutiles. **Vérifier qu'il n'a pas de route ou de trafic légitime avant toute déconnexion.** Ne pas déconnecter le projet Pages.
- Si ce Worker est réellement nécessaire, corriger sa configuration `wrangler` ou sa commande de déploiement en fonction du journal, **sans remplacer le déploiement Pages fonctionnel**.

## 3. Capacité et isolation des couples
- `npm run test:server-scale` simule **1 000 couples, 2 000 membres et 60 000 messages** dans une base **SQLite locale**. Il vérifie l'usage de l'index de messages par couple, l'absence de messages d'autres couples dans les snapshots et les performances SQL locales.
- `npm run test:load` (ancien) est **entièrement synthétique**, sans Cloudflare; aucune latence qu'il imprime ne peut être prise pour un résultat réseau réel.
- `npm run load:staging` (ancien) permet des **requêtes réelles** uniquement si un déploiement HTTPS staging distinct, un fichier de sessions fictives déjà créées sur ce staging, et `LOVE_RADAR_LOAD_CONFIRM=STAGING_ONLY` sont fournis. Il refuse explicitement le site de production connu.
- Pour un vrai test de 200 à 1 000 clients et mesurer p95, erreurs HTTP 5xx, D1/R2 quotas et taux 429 : créer un projet **staging** Cloudflare Pages avec une **base D1 et un bucket R2 distincts**; préparer des couples fictifs; régler une progression de charge. Ne jamais faire ce test sur les utilisateurs de production.
- **Limite** : la simulation de volumétrie de données ne valide pas la simultanéité, ni les quotas, ni les limites de Cloudflare. Pas de verdict de capacité réelle avant un staging et une mesure réseau.

## Ce qui ne change pas
Aucun accès à des conversations réelles, aucune modification des notifications, des appels, des jeux, ni des abonnements. Le nouveau diagnostic est manuel et utilise uniquement des clés R2 temporaires sans données personnelles.
