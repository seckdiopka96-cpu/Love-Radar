# Love Radar — audit de préparation à la bêta

_Date : 15 novembre 2026 · périmètre : dépôt de code, tests automatiques et configuration visible dans GitHub._

## Décision actuelle

**Bêta fermée envisageable après tests sur deux vrais appareils ; lancement public à grande échelle non validé.**

La réussite du build ne prouve ni la fiabilité d'un appel entre opérateurs mobiles, ni l'arrivée d'une notification iOS avec l'application fermée, ni la capacité à héberger des milliers de couples. Aucun de ces scénarios n'a été certifié par cet audit de code.

## Corrections appliquées

| Domaine | Constats et modification | Vérification |
|---|---|---|
| Appels | Les paramètres TURN étaient conservés indéfiniment alors que les identifiants générés ont une durée de vie. Ils sont maintenant renouvelés après 45 min, et la configuration STUN seule est réessayée après 1 min. | Tests de logique de renouvellement et build TypeScript |
| Appels sur réseau dégradé | Un GET de signalisation ou une récupération de configuration pouvait attendre indéfiniment. Délais maximaux : 8 s pour la consultation des signaux, 5 s pour la configuration TURN. | Tests de régression |
| Charge serveur | Les appels sans session active étaient interrogés toutes les 650 ms. Le délai en attente est désormais 1 800 ms ; les appels actifs restent interrogés rapidement (420 ms). | Test du rythme de synchronisation |
| Photos/vocaux | Un téléchargement bloqué pouvait rester en attente, ou une erreur n'était réessayée que si la conversation changeait. Les téléchargements sont bornés à 12 s, avec au plus quatre nouvelles tentatives espacées, et reprise lorsque le réseau revient ou l'application redevient visible. | Tests des délais (2,5 / 5 / 10 / 20 s), de la limite et de la reprise manuelle |
| Messages et présence | Les POST de chat ont maintenant une limite de 15 s, les instantanés de conversation 12 s et le statut léger 6,5 s. Le verrou d'actualisation est libéré même après erreur. | Tests de régression et build |
| Validation continue | Ajout d'un test de fiabilité réseau au workflow GitHub Actions. | `npm run test:reliability` |

Les messages texte utilisent déjà un identifiant unique pour éviter les doublons lors d'une répétition d'envoi. Les conversations, médias et marqueurs de changement sont associés à l'identifiant de la pièce privée.

## Bloquants avant l'ouverture publique

1. **Appels WebRTC sur réseaux réels** : vérifier que les clés TURN sont configurées en production ; la connexion STUN seule ne suffit pas sur certains réseaux mobiles et NAT. Le dépôt ne prouve pas que les secrets Cloudflare sont présents.
2. **Notifications iOS et Android** : réaliser des essais avec l'application active, inactive, verrouillée et fermée ; tester l'acceptation d'un appel depuis une notification. L'existence du code Push ne prouve pas la réception.
3. **Récupération de compte** : la session est enregistrée sur l'appareil. Un changement ou une perte de téléphone peut empêcher un membre de retrouver son compte sans procédure de récupération sécurisée.
4. **Protection contre les abus** : avant la diffusion publique, protéger la création des espaces, les tentatives de codes d'invitation, l'envoi de médias, les appels et les requêtes avec des limites adaptées côté Cloudflare.
5. **Confidentialité** : messages stockés côté serveur ; ne pas annoncer un chiffrement de bout en bout de la messagerie sans conception et audit dédiés. Examiner la gestion des sessions, la suppression intégrale des données, la rétention et les sauvegardes.
6. **Capacité opérationnelle** : mesurer le comportement de D1, R2, Push et des signalisations lors de centaines puis de milliers de connexions. Vérifier quotas, coûts, index, incidents et restauration. Aucune charge réelle de plusieurs milliers de couples n'est simulée ici.
7. **Déploiement et appareils** : valider le dernier build sur l'URL publiée, une PWA installée et, si publiées, les versions natives. GitHub Actions ne valide pas automatiquement le déploiement Cloudflare Pages ni les stores.

## Matrice d'essais sur deux téléphones

| Cas | Essai | Critère d'acceptation |
|---|---|---|
| A | Deux utilisateurs rejoignent un espace, puis un autre couple rejoint un autre espace. | Aucun contenu ou événement du couple A n'apparaît pour B. |
| B | Envoi de 20 textes rapides, perte et retour de réseau. | Aucun doublon, chaque échec est affiché et peut être retenté. |
| C | Envoi de 5 photos et 5 vocaux avec Wi-Fi et données cellulaires. | Chargement visible, récupération après panne et aucun message vide permanent. |
| D | Appel Wi-Fi → Wi-Fi, Wi-Fi → 4G/5G et 4G/5G → 4G/5G. | Son bidirectionnel, raccrochage et rappel fiables ; temps de connexion mesuré. |
| E | Appel pendant que l'un écrit un message et réduit l'appel. | Conversation accessible sans interruption de l'audio. |
| F | Notification de message et d'appel, écran verrouillé et application fermée. | Livraison et ouverture de la bonne conversation ou du bon appel. |
| G | Ludo, Memory et Pierre–Papier–Ciseaux sur deux appareils. | Tours, scores et choix cohérents sans résultat contradictoire. |
| H | Plusieurs centaines de sessions de test avec des actions réalistes. | Taux d'échecs, latence p95, coûts et charge mesurés ; seuils à fixer avant lancement. |

## Déroulement recommandé

1. Terminer la matrice A–G sur deux appareils physiques.
2. Corriger les problèmes constatés, en gardant les cas de régression automatisés.
3. Ouvrir à **20 couples**, recueillir les erreurs et vérifier les sauvegardes et la récupération des comptes.
4. Passer à **50 couples** après quelques jours de stabilité mesurée, puis augmenter progressivement.
5. N'annoncer la compatibilité « milliers de couples » qu'après des essais de charge, la configuration des défenses anti-abus et le suivi des coûts et incidents.

## Limites de cet audit

L'analyse s'appuie sur le code GitHub et ses vérifications automatisées. Je n'ai ni accès aux secrets TURN/Push de production, ni aux journaux d'appels réels, ni à deux téléphones de test, ni à un test de charge Cloudflare. Les points correspondants restent explicitement **non vérifiés**.
