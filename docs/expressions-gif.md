# Love Radar — sélecteur GIF, stickers animés et émojis

## Livré sans service tiers
- Trois onglets dans le sélecteur de messages : **GIF**, **Stickers**, **Émojis**.
- Recherche locale et catégories; émojis Unicode insérés dans le champ avant envoi.
- 32 nouvelles réactions animées originales (9 types de mouvements CSS, sans fichiers tiers), plus le catalogue précédent.
- Réactions envoyées dans la conversation avec le protocole existant `[sticker:v1:id]`, rendu animé sur les deux téléphones.
- Favoris et récents sont conservés localement par profil sur cet appareil. Le clavier fonctionne sans réseau externe.
- L'onglet GIF montre, par défaut, les animations originales Love Radar et indique que les GIF externes doivent être configurés.

## Option GIPHY pour rechercher les vrais GIF
La recherche GIF externe nécessite **une clé API GIPHY** et la validation de leurs conditions d'utilisation.
1. Depuis https://developers.giphy.com, créer un compte et une clé API.
2. Dans **Cloudflare Pages** pour le site Love Radar, définir `VITE_GIPHY_API_KEY` comme variable d'environnement **au moment du build** puis redéployer. Pour Capacitor, fournir une clé appropriée à chaque build natif.
3. La clé de recherche GIPHY est **publique côté client** (préfixe `VITE_`). Elle ne doit pas être présentée comme un secret serveur. GIPHY demande des clés distinctes selon la plateforme (web, Android, iOS).
4. Les utilisateurs peuvent alors rechercher les GIF (classification `g`), accéder aux tendances, récents et favoris et envoyer un GIF comme un message chiffré (si E2EE est activé).

### Respect de GIPHY
- Le navigateur de chaque membre interroge directement `api.giphy.com`, puis charge les images depuis les URL médias fournies.
- Love Radar ne fait **aucun proxy**, **aucun téléchargement**, **aucun stockage R2** de GIF GIPHY, **aucun cache d'URL ou réponse API** et ne modifie pas les URL des médias.
- Seul un ID `[gif:v1:GIPHY_ID]` est conservé dans les messages (et, localement, dans les listes de favoris/récents); le client redemande au fournisseur les informations du GIF pour l'afficher.
- Le crédit **Powered By GIPHY** est visible dans le panneau et les messages.
- La recherche et le chargement des GIF contactent GIPHY directement depuis l'appareil; cette partie n'est pas privée vis-à-vis de GIPHY. Les messages eux-mêmes restent protégés par le transport Love Radar en place.
- Un GIF peut devenir indisponible si GIPHY le retire ou si la clé n'est plus valide; le message affiche alors un substitut non bloquant.
- Les clés bêta GIPHY sont limitées. Prévoir l'approbation de la clé en production avant le lancement à grande échelle, et vérifier les conditions/règles de distribution.

## Tests
- `npm run test:expressions` : catalogue et recherche émojis, nombre et validité des réactions animées, validation d'ID GIF, blocage des URLs malveillantes, non-copie des contenus GIPHY, chemins d'affichage et d'envoi.
- `npm run build` : TypeScript et bundle Vite.
- Test manuel sur deux vrais iPhone/Android : insertion d'émoji, favoris/récents, animation envoyée et reçue, bascule clavier/sélecteur. Recherche GIF externe uniquement après clé GIPHY configurée.

### Références fournisseurs
- https://developers.giphy.com/docs/api/
- https://developers.giphy.com/docs/api/endpoint/
