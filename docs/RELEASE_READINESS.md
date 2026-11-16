# Love Radar — critères de lancement (bêta privée → milliers de couples)

**Mise à jour : 15 novembre 2026**  
**État : protections codées, tests automatiques disponibles, production non homologuée.**

## Ce qui existe dans le dépôt

- Récupération d'un compte : code personnel aléatoire de 128 bits, affiché une seule fois, dont seul le hash SHA-256 est conservé dans D1. Le code est différent du code d'invitation du couple.
- À la récupération : invalidation du jeton du téléphone précédent, remplacement atomique du code de secours et tentative de révocation de ses abonnements push.
- Pour les anciens comptes : **Paramètres → Compte et invitation → Créer un nouveau code de secours**. Un ancien membre doit le faire **avant** de perdre l'accès. Sans code créé et sans ancienne session, aucune récupération fiable n'est possible.
- Limites D1 côté serveur : création d'espaces 8/h/IP, essais d'invitation 20/15 min/IP, récupération 8/15 min/IP, messages 65/min/membre, médias 20/10 min/membre, nouveaux appels 8/5 min/membre. Un retraitement du même identifiant de message ne recompte pas comme nouveau message.
- Les adresses IP ne sont pas conservées en clair dans les compteurs : hachage avec un sel aléatoire stocké dans D1 ; les compteurs expirés sont nettoyés opportunément.
- Paramètres → Diagnostics : consultation du serveur de messagerie, disponibilité déclarée TURN, compatibilité WebRTC, permission de notifications et test explicite du microphone. Le diagnostic ne capte ni n'envoie de voix.
- Contrôles automatisés : `npm run test:security`, `npm run test:reliability`, `npm run test:load` et `npm run build`.

## Conditions nécessaires à la mise en ligne

1. Confirmer le déploiement Cloudflare Pages avec les bindings D1 `DB` et R2 privé `STORAGE`. Sur une nouvelle base, exécuter `schema.sql` ; pour les bases existantes, les nouvelles tables de récupération et de limitation se créent automatiquement.
2. Vérifier les secrets VAPID de notifications et `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` dans la configuration Cloudflare **sans les publier dans GitHub**. La rubrique Diagnostics doit déclarer le relais disponible, mais ce seul résultat ne garantit pas un appel.
3. Configurer dans le tableau de bord Cloudflare des mesures supplémentaires contre les abus (WAF / règles de rate limiting aux bords, notamment `/api/love`, `/api/recovery` et `/api/media`). Les limites D1 sont une première couche, pas un pare-feu exhaustif.
4. Vérifier les sauvegardes / la restauration de D1 et la politique de conservation de R2, ainsi que les coûts et quotas. Tester la suppression des données et la récupération d'un compte sur des espaces jetables.
5. Compléter les documents de confidentialité, les conditions d'utilisation, le contact de support et la procédure de signalement, adaptés aux pays de lancement.

## Essais physiques obligatoires — deux téléphones

Sur deux appareils réels, créer deux membres tests d'un même couple, puis ouvrir **Paramètres → Diagnostics → Tester la connexion** et **Tester le micro** sur chacun.

| Vérification | Essai attendu |
|---|---|
| Isolation des espaces | Créer deux couples A/B ; aucun message, média, jeu ou notification ne doit traverser les espaces |
| Messages et vocaux | Envoyer 20 textes, 5 vocaux, 5 photos en Wi-Fi puis avec données cellulaires ; activer/désactiver le réseau et vérifier la récupération |
| Appels directs | Appeler depuis Wi-Fi vers Wi-Fi, Wi-Fi vers données mobiles, et données mobiles vers données mobiles ; tester micro, haut-parleur, silence, raccrocher et rappel |
| Appel + messages | Réduire l'appel et envoyer des messages sans interrompre l'audio ; vérifier le comportement écran verrouillé et en arrière-plan |
| Notifications | Tester message, appel, réaction et invitation lorsque l'application est active, en arrière-plan et fermée ; ouvrir la notification et vérifier sa destination |
| Récupération | Sur un compte jetable, sauvegarder un code de secours, restaurer sur l'autre téléphone, confirmer que l'ancienne session et l'ancien code sont invalides |
| Jeux à deux | Tester Ludo, Pierre–Papier–Ciseaux et Memory sur deux appareils, y compris après une coupure réseau |
| Installation | Vérifier PWA iOS/Android et, le cas échéant, versions natives. Ne pas confondre permission push et notification réellement reçue |

**Attention iOS PWA :** l'appel WebRTC ne devient pas un appel téléphonique natif. Le téléphone peut suspendre l'audio lorsque l'application est en arrière-plan. Une validation en premier plan ne valide pas ce scénario.

## Charge : simulation et essai réel (uniquement sur préproduction)

### Vérification sans réseau

```sh
npm install
npm run test:load
```

Cela simule les métriques du banc de test **sans contacter Cloudflare** : il ne mesure PAS la capacité de D1 ni le nombre de couples que la production peut accueillir.

### Essai réel sur environnement de préproduction

Créer d'abord une instance de staging/preview avec **sa propre base D1**, son stockage privé et ses propres comptes fictifs. Ne jamais tester la production ni utiliser les comptes de vrais couples.

Préparer un fichier local ignoré par Git, par exemple `staging.load-roster.json` :

```json
[
  {"token":"<jeton-test-64-caracteres-hex>","roomId":"<id-couple-A>"},
  {"token":"<autre-jeton-test-64-caracteres-hex>","roomId":"<id-couple-A>"},
  {"token":"<jeton-test-couple-B>","roomId":"<id-couple-B>"},
  {"token":"<second-jeton-couple-B>","roomId":"<id-couple-B>"}
]
```

Depuis un terminal local autorisé, définir :

```sh
export LOVE_RADAR_STAGING_URL="https://staging.exemple.com"
export LOVE_RADAR_LOAD_ROSTER="./staging.load-roster.json"
export LOVE_RADAR_LOAD_CONFIRM="STAGING_ONLY"
export LOVE_RADAR_LOAD_USERS=40
export LOVE_RADAR_LOAD_ITERATIONS=12
export LOVE_RADAR_LOAD_CONCURRENCY=8
npm run load:staging
```

Le script refuse l'adresse de production actuellement connue, limite à 80 requêtes concurrentes et 2000 utilisateurs tests, utilise seulement des comptes explicitement fournis et affiche le taux d'erreurs, les codes 429/5xx, la latence p50/p95 et toute divergence `roomId` dans un instantané. **Ce test n'a pas été exécuté contre un vrai serveur de staging dans cet audit.**

Augmenter progressivement : 20 couples → 50 → 100 → 500 → 1 000, après mesure des taux d'erreurs, latences et coûts. Fixer des seuils opérationnels avant chaque progression. L'architecture par interrogations périodiques D1 doit être mesurée avec soin ; de nombreux couples en chat ou en appel simultané peuvent nécessiter des canaux temps réel / Durable Objects et une adaptation du stockage. Le nombre « milliers de couples » n'est **pas validé** tant que ces essais n'ont pas réussi.

## Précautions de sécurité avant ouverture

- La messagerie n'est **pas chiffrée de bout en bout** ; ne pas afficher cette promesse. Les appels WebRTC ont leur propre protection de transport, distincte du stockage des messages.
- Un code de secours est aussi sensible qu'un mot de passe. Ne jamais le transmettre au partenaire, l'envoyer à un support inconnu ni le placer dans GitHub, des captures publiques ou des fichiers de test.
- Les contrôles automatiques et les essais synthétiques ne remplacent pas un audit de sécurité externe ni un exercice réel de restauration D1/R2.
- Protéger l'intégrité des créations, l'abus des jeux, les notifications push et les invitations par des règles de bord Cloudflare adaptées aux menaces constatées.
- Ne pas déclarer l'application publiée sur l'App Store ou Google Play tant qu'une validation et une distribution officielles n'ont pas été effectuées.

## Critère d'ouverture publique

**Ne pas ouvrir à des milliers de couples tant que** les deux appareils tests n'ont pas réussi la matrice, que TURN et Push sont vérifiés en production, que les sauvegardes et alertes sont opérationnelles et que les essais de charge de la préproduction ont des résultats documentés.
