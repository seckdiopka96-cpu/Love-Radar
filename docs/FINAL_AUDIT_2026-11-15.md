# Love Radar — Audit final de préparation au lancement

**Date de référence : 15 novembre 2026 (America/New_York)**  
**Source :** branche `main` du dépôt `seckdiopka96-cpu/Love-Radar`, commit `c21199b45b38228b6c79d8e69bc04bb5b1a926eb`, documentation du dépôt, dernier workflow « Vérifier Love Radar », documentation officielle Apple/Android.

## Mise à jour corrective — suppression privée (code vérifié)

Le module `functions/lib/delete-room.ts` a été ajouté et appelé par `functions/api/love.ts`. Il inclut les données de Pierre–Papier–Ciseaux, du Ludo Sénégal, des puzzles, des sessions YouTube/TikTok, des réconciliations (y compris les textes identifiés par `session_id`), des jeux, des abonnements Push et des codes de secours. Les clés R2 référencées et les anciens portraits sous les préfixes privés sont supprimés avant la transaction de suppression D1.

La nouvelle suite `tests/room-deletion.test.ts` utilise **SQLite réel** et un stockage R2 simulé : couverture des tables, isolation d'un second couple, données sensibles de réconciliation, échec R2 et annulation de transaction D1. La compilation et la CI du commit `5ac7871eb4e996ff92726e9b0988c1e2b9bf28fb` ont réussi ([résultats GitHub](https://github.com/seckdiopka96-cpu/Love-Radar/actions/runs/43791940937)).

**Statut F-02 : corrigé dans le code, mais test de bout en bout sur Cloudflare D1/R2 et déploiement en production NON vérifiés.** Le nettoyage R2 précédant la transaction D1 peut rendre un média indisponible en cas d'échec D1 ; la session reste toutefois active pour permettre une nouvelle tentative. La concurrence des nouvelles écritures et la récupération des objets R2 historiques non référencés restent à auditer avant un lancement public.

Le constat historique F-02 ci-dessous décrit la version examinée initialement ; il ne faut pas le confondre avec le statut corrigé ci-dessus.

## Mise à jour native — appels déjà établis en arrière-plan

La base native des appels en arrière-plan a été ajoutée :
- `src/native-call-session.ts` active/arrête le pont natif pendant un appel WebRTC accepté.
- `scripts/configure-native.mjs` configure automatiquement l'audio `playAndRecord / voiceChat` et `UIBackgroundModes:audio` sur iPhone ; sur Android, il configure un service de microphone au premier plan avec notification persistante et permissions dédiées.
- Les deux implémentations envoient un maintien de session au serveur toutes les 24 secondes pendant l'appel, indépendamment des intervalles React lorsqu'ils sont suspendus.
- `tests/native-background-call.test.ts` vérifie les permissions, les enregistrements, la génération idempotente et les contrôles de cycle de vie.

**Statut : la compilation Web et l'APK debug Android ont réussi. La validation d'un build iOS et les tests réels d'audio après verrouillage, changement d'application et réseaux 4G/5G restent indispensables.** Les appels entrants avec l'app fermée, CallKit/PushKit sur iPhone et les notifications natives Android ne sont pas encore implémentés. La PWA iOS ne gagne pas ces capacités natives.

## Verdict

**Statut : NO-GO pour ouverture publique et pour « milliers de couples ».**
Le produit couvre déjà de nombreuses fonctionnalités et le contrôle CI du dernier commit est vert, mais plusieurs exigences essentielles de confidentialité et de fiabilité restent non satisfaites ou non prouvées.

L'audit est une revue statique du code, des tests et des workflows. **Ce n'est pas** un audit de pénétration, un test des secrets Cloudflare, une validation de l'application réellement déployée, une mesure de charge réelle, un test sur iPhone/Android physique, ou une certification RGPD.

## Contrôles positifs observés

- Contrôles d'accès par jeton de session aléatoire haché côté serveur ; requêtes principales limitées à la `room_id` du membre authentifié.
- Upload de média avec vérification de taille, type et signature sommaire ; stockage R2 avec accès authentifié et réponses sans cache. Les photos de profil sont aussi associées à la pièce privée.
- Code de secours personnel généré aléatoirement (128 bits), stocké sous forme de hash, remplacé après récupération, avec rotation du jeton de session. Parcours « J'ai perdu mon accès » intégré.
- Limites D1 pour création d'espace, invitations, récupération, messages texte, réactions, fichiers et nouveaux appels. Ces protections sont partielles et doivent être complétées à la périphérie (WAF).
- Mécanismes de tentatives de renvoi de médias plafonnées, limites de durée des requêtes réseau, rafraîchissement du relais TURN, contrôle de version des parties/jeux.
- Le workflow `.github/workflows/check.yml` lance les différentes suites de tests et `npm run build`. Le dernier workflow correspondant au commit analysé est **réussi** : https://github.com/seckdiopka96-cpu/Love-Radar/actions/runs/43789762134.

## P0 — Bloquants avant le lancement public

### F-01 · CRITIQUE — Appels avec écran verrouillé / arrière-plan

**Preuves dans le code :**
- `src/VoiceCall.tsx` : `sync()` s'arrête lorsque `document.visibilityState==="hidden"`; le heartbeat de l'appel actif n'est envoyé que si le document est visible.
- `functions/api/call.ts` : lors de la prise d'appel/heartbeat, `expires_at` est poussé de 90 secondes ; `activeCall()` ne renvoie que les appels non expirés.
- `scripts/configure-native.mjs` ajoute des déclarations de permissions, mais pas de support d'appel natif ou d'activation explicite `UIBackgroundModes` pour audio/VoIP.
- `docs/native.md` confirme que les appels WebRTC natifs n'ont pas été validés sur appareil.

**Effet :** un appel peut perdre sa session de contrôle après verrouillage/masquage, même si le flux WebRTC survit temporairement. Les notifications classiques de PWA ne garantissent ni le réveil de l'application ni l'affichage d'un appel entrant.

**Action :** définir un véritable cycle de vie VoIP sur iOS (AVAudioSession configurée, mode audio approprié, CallKit et PushKit pour la réception native), et sur Android (service d'appel au premier plan, permissions et intégration Telecom appropriées), puis tester Wi-Fi, 4G/5G, écran verrouillé, autre application, interruption téléphonique et reconnexion. Ne pas promettre « appels en arrière-plan » avant ces essais.

Références officielles : [Apple AVAudioSession playAndRecord](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord), [Apple PushKit/CallKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit), [Android foreground service microphone](https://developer.android.com/about/versions/14/changes/fgs-types-required).

### F-02 · CRITIQUE — Suppression des espaces incomplète

**Preuves dans le code :**
- `functions/api/love.ts`, branche `op==="delete"`, supprime beaucoup de tables, mais **ne supprime pas** notamment :
  - `rps_games` (`functions/api/rps.ts`)
  - `ludo_senegal_games`, `ludo_senegal_moves` (`functions/api/ludo-senegal.ts`)
  - `couple_puzzles`, `couple_puzzle_presence` (`functions/api/puzzle.ts`)
  - `couple_reconciliations`, `couple_reconciliation_entries` (`functions/api/reconcile.ts` ; les entrées sont indexées par `session_id`)
  - `couple_watch_sessions`, `couple_watch_presence` (`functions/api/watch-together.ts`)
  - `couple_tiktok_watch`, `couple_tiktok_presence` (`functions/api/tiktok-together.ts`).
- Ces tables sont créées sans suppression automatique `ON DELETE CASCADE` visible dans leurs définitions.

**Effet :** la suppression d'un espace peut laisser des données de couple en D1, dont potentiellement les textes sensibles de la réconciliation. La suppression de fichiers R2 avant la fin des suppressions D1 peut aussi laisser une opération partiellement effectuée si une étape échoue.

**Action :** supprimer chaque table par `room_id`, supprimer les entrées de réconciliation via les `session_id` appartenant à la pièce, puis effectuer les suppressions structurées dans une transaction D1, après avoir planifié la purge R2. Ajouter un test d'intégration qui crée un espace test avec toutes ses fonctionnalités, le supprime, puis vérifie l'absence totale de données D1/R2 pertinentes. Prévoir une purge des espaces déjà supprimés si des données orphelines existent.

### F-03 · ÉLEVÉ — Notifications natives et appels entrants incomplets

**Preuves :** `docs/native.md` indique explicitement l'absence d'une implémentation APNs pour iOS et d'un canal Android natif ; `src/SettingsPage.tsx` renvoie les réglages natifs vers ceux du téléphone, sans preuve d'abonnement aux notifications natives. Le code `functions/lib/push.ts` implémente Web Push pour les PWA.

**Effet :** aucune garantie de réception d'un appel ou message en arrière-plan dans les builds natifs lorsque l'app n'est pas en premier plan.

**Action :** intégrer les permissions et jetons APNs/Android, le serveur de routage par appareil, l'opt-out et les scénarios d'appel rejeté/annulé ; employer PushKit/CallKit de façon conforme pour les appels entrants iOS ; essais physiques impératifs.

## P1 — Obligatoires avant une bêta élargie

### F-04 · ÉLEVÉ — Capacité simultanée non mesurée

- `src/App.tsx` utilise un polling de présence toutes les ~1,75 s en chat et des snapshots périodiques. `src/RpsDuo.tsx` interroge le serveur toutes les ~900 ms ; `src/VoiceCall.tsx` utilise des requêtes régulières pour les signaux WebRTC.
- Ce fonctionnement entraîne un trafic cumulatif pour chaque personne active et de nombreuses opérations D1. **Aucune mesure sur 1 000 couples simultanés** n'est disponible.
- `npm run test:load` exécute `scripts/staging-load.mjs --synthetic` : ce mode fabrique des échantillons en mémoire et ne réalise **aucun appel réseau**.
- Le mode `load:staging` n'a pas été exécuté dans cet audit et ne reproduit pas complètement les flux WebRTC, jeux et médias.

**Action :** ouvrir une préproduction distincte, mesurer la latence p95, les erreurs 429/5xx, les requêtes D1/R2, la consommation CPU et les coûts, avec 20, 50, 100 puis plus de couples. En fonction des résultats, remplacer certaines boucles de polling par une architecture temps réel.

### F-05 · ÉLEVÉ — Tests automatiques insuffisants pour certifier la sécurité

- `tests/security-release.test.ts` utilise une base D1 simulée pour une partie des assertions ; plusieurs suites vérifient statiquement la présence de fragments de code ou de styles.
- Les tests passés valident des règles, des compilations et certains moteurs de jeu, **pas** l'authentification multi-appareils en D1 réel, le retrait d'accès en cas de récupération concurrente, les fuites de données entre pièces, le nettoyage R2, les Push ni les appels.

**Action :** tests E2E sur une base D1 locale/jetable, concurrence et race conditions, modification/suppression de fichiers et vérification de données privées sur deux comptes sans lien.

### F-06 · MOYEN/ÉLEVÉ — Sécurité de déploiement et prévention d'abus

- `main` n'est pas une branche protégée (GitHub API, état au moment de cet audit). Un changement direct peut entrer sans revue ni contrôle préalable obligatoire.
- Des limites d'envoi existent, mais tous les parcours de synchronisation, invitations et jeux ne sont pas couverts uniformément par la même politique anti-abus ; des protections Cloudflare côté edge restent à confirmer.
- La configuration réelle des secrets VAPID, TURN, du pare-feu, des sauvegardes D1/R2 et des alertes de surveillance n'est pas consultable depuis cet accès au dépôt.

**Action :** protéger `main`, imposer une pull request et les vérifications obligatoires, vérifier les règles WAF, les quotas, les alertes et effectuer une restauration de sauvegarde avant le lancement.

## P2 — Produit, conformité et exploitation

- Les messages ne bénéficient **pas** d'un chiffrement de bout en bout. Il faut l'indiquer clairement et éviter toute promesse contraire.
- Les sessions restent dans `localStorage` WebView/PWA ; considérer un stockage natif sécurisé (Keychain/Keystore) avant la distribution dans les stores.
- Préparer politique de confidentialité, conditions d'utilisation, mécanisme de signalement/support, politique de rétention et demandes d'effacement.
- Compléter les véritables builds signés iOS et Android, l'installation sur appareils physiques et le processus App Store/TestFlight/Google Play.
- Recueillir les métriques de performance et de crash, et mettre en place une surveillance de la délivrance des notifications et des erreurs WebRTC.

## Statut de vérification, sans extrapolation

| Vérification | Résultat |
|---|---|
| Compilation TypeScript + Vite du dernier commit | **Réussi** selon GitHub Actions |
| Suites automatisées web incluses dans CI | **Réussies** selon GitHub Actions |
| Tests E2E base D1 réelle/R2 | **Non exécutés / non prouvés** |
| Appels sur 2 téléphones, écran verrouillé | **Non exécutés / non prouvés** |
| Notifications Web Push réelles et APNs natif | **Non exécutées / non prouvées** |
| Builds iOS/Android signés et installés | **Non vérifiés** |
| Charge réelle 1 000+ couples | **Non exécutée / non prouvée** |
| Test de restauration des sauvegardes | **Non vérifié** |
| Déploiement Cloudflare de la version du commit | **Non vérifié** |

## Ordre exact pour parvenir à un GO

1. **Corriger F-02**, assurer l'effacement complet d'un espace et ajouter un vrai test de suppression/récupération.
2. **Terminer F-01 et F-03** : appels arrière-plan et notifications natives sur de vrais appareils.
3. **Exécuter F-05 et F-06** : tests D1/R2, barrières anti-abus, sauvegardes restaurables, branche protégée.
4. **Exécuter F-04** sur une préproduction séparée : mesures, quotas, coûts et montée progressive.
5. **Déployer une bêta privée de 20 couples**, recueillir des mesures réelles et élargir uniquement après avoir éliminé les anomalies bloquantes.

### Conclusion

**Love Radar est un prototype fonctionnel prometteur qui a passé ses vérifications de code. Ce n'est pas encore un service VoIP public ni une plateforme dont la capacité pour des milliers de couples est démontrée.** Le plus urgent n'est plus le design : c'est l'effacement fiable des données, la gestion native des appels en arrière-plan et la validation opérationnelle.
