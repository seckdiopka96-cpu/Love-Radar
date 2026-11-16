# Récupérer un membre sans code de secours — Love Radar

## Deux téléphones, un seul couple
1. Le partenaire **encore connecté** ouvre **Paramètres → Compte et invitation → Aider mon partenaire à récupérer son compte** et touche **Créer un code temporaire**. Il n'a pas besoin de communiquer son propre code personnel.
2. Il communique ce code de 32 caractères **directement** à la personne qui a perdu l'accès. Le code expire après 15 minutes et ne peut servir qu'une fois.
3. La personne déconnectée ouvre **J’ai perdu mon accès → Récupérer mon compte avec mon partenaire**, entre le code, puis lit les **six chiffres** de confirmation qui s'affichent.
4. Le partenaire connecté **appelle la personne** ou la vérifie en personne, compare les six chiffres et autorise explicitement la récupération. **Ne jamais approuver un inconnu.**
5. Le serveur remplace le jeton de connexion du **même membre existant**, invalide l'ancienne session et supprime les anciennes notifications push. Le couple et les messages stockés restent les mêmes.

## Anciens messages
- Les messages non supprimés conservés dans D1 sont accessibles au membre récupéré. Les 90 plus récents s'affichent au chargement ; le bouton **Afficher les anciens messages** charge les pages antérieures (50 par page) avec les mêmes contrôles « Supprimer pour moi ».
- Si les deux partenaires ont activé le chiffrement E2EE pilote, le partenaire connecté doit encore posséder **son identité privée ECDH d'origine et la vérification de son partenaire**. Son navigateur re-dérive localement la clé AES historique et l'envoie uniquement sous forme d'enveloppe AES-GCM à une clé ECDH éphémère générée sur le téléphone récupéré. **Le serveur ne reçoit jamais la clé AES en clair.**
- Le téléphone récupéré importe cette clé AES comme **CryptoKey non extractable** dans IndexedDB ; les anciens textes, photos et vocaux chiffrés peuvent alors être déchiffrés et les nouveaux envois utilisent la même clé de conversation.
- La clé privée ECDH d'identité perdue n'est pas recréée : la nouvelle installation dispose de la clé de cette **conversation précise**, pas d'une sauvegarde complète de l'identité originale. Il faut conserver toute ancienne sauvegarde personnelle.
- Si le partenaire connecté n'a plus sa clé privée d'origine, la récupération E2EE ne peut pas garantir l'accès aux anciens messages ; le système refuse l'approbation plutôt que d'écraser l'identité de chiffrement.
- Les messages supprimés définitivement, les médias disparus de R2, les éléments à vue unique consommés et les messages masqués par « Supprimer pour moi » **ne sont pas restaurés**.

## Sécurité et opérations
- Invitations temporaires : 128 bits aléatoires, stockés uniquement comme hachage SHA-256 sur D1.
- Seuls le partenaire authentifié de la **même room**, la demande avec secret à haute entropie et la comparaison directe du code à 6 chiffres peuvent déclencher une approbation.
- Authentification candidate de 256 bits : le serveur ne reçoit et ne stocke que le **hash** avant de basculer atomiquement vers ce même membre.
- Rotation et révocation de l'ancienne session et des anciennes notifications push dans une transaction D1, si les abonnements push sont configurés.
- Les données sensibles du demandeur (clé ECDH éphémère non exportable, secret de suivi, token candidat) restent dans un IndexedDB local à l'appareil jusqu'à la fin du flux.
- Aucun nouveau membre ni nouvel espace. Les anciennes identités publiques E2EE du répertoire restent inchangées.
- Précaution : le protocole E2EE pilote et cette fonctionnalité n'ont pas été audités indépendamment. Une vérification sur deux vrais téléphones et des tests de consentement sont recommandés avant un lancement public à grande échelle.

## Tests
`npm run test:partner-recovery` teste une restauration réelle d'un texte et d'un vocal chiffrés avec leur ciphertext original, les protections contre le mélange des demandes, la rotation des sessions et la pagination de l'historique.
