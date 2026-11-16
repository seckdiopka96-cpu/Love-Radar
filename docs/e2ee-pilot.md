# Chiffrement de bout en bout de la messagerie — pilote v1

**Statut : pilote opt-in non audité. Ne pas annoncer que toute l'application est E2EE.**

## Périmètre
- Texte, stickers (texte encodé), modifications de textes, images et notes vocales de l'écran **Messages**.
- Les anciens messages et médias ne sont pas rechiffrés.
- Les appels passent par WebRTC (sécurité de transport distincte). Les souvenirs, jeux, profils, photos de profil, stories, réconciliations et autres modules ne sont pas couverts par ce protocole.
- Les métadonnées (identifiants des membres, horodatages, types de message, taille des médias, statut de lecture, réactions, invitations) restent visibles pour le serveur. Les réactions emoji ne sont pas chiffrées. Les notifications doivent rester génériques.

## Activation
1. Dans Paramètres, chaque partenaire choisit une phrase secrète, crée sa clé, télécharge la sauvegarde chiffrée puis confirme son enregistrement avant d'activer le mode.
2. Chaque appareil crée une identité ECDH P-256, chiffre immédiatement la clé privée avec une phrase secrète via PBKDF2-SHA-256 (600 000 itérations) et AES-GCM, puis conserve une clé privée **non exportable** dans IndexedDB. L'utilisateur doit télécharger le fichier de sauvegarde chiffrée et confirmer l'avoir conservé avant d'enregistrer la clé publique sur le serveur. Le serveur stocke uniquement la clé publique.
3. Une fois les deux clés publiques présentes, l'API refuse les textes et médias non chiffrés, ainsi que les modifications non chiffrées, et les clients anciens échouent *fermés*.
4. Les deux personnes comparent l'empreinte SHA-256 complète de l'autre via un canal extérieur (en personne ou appel). Après vérification, la clé publique est épinglée localement. Toute substitution rend les nouveaux échanges illisibles jusqu'à une nouvelle vérification explicite.

## Cryptographie
- Accord ECDH P-256, dérivation HKDF-SHA-256, clé AES-GCM 256 bits.
- IV aléatoire de 96 bits **pour chaque chiffrement**.
- AAD : version, ID de l'espace, ID de l'expéditeur, ID du message et catégorie (text/image/audio).
- Enveloppe texte `lre1.<nonce-base64url>.<ciphertext-base64url>`.
- Média binaire `LRE1 || nonce(12 octets) || AES-GCM(type-MIME || données)`.
- Le serveur n'a pas la clé privée. Le chiffrement et déchiffrement ont lieu dans le navigateur, avant l'envoi et après la réception. R2 stocke les octets chiffrés.

## Limites majeures et risques
- **Pas de protocole Signal / Double Ratchet** : pas de forward secrecy ni post-compromise security. Une clé privée compromise peut déchiffrer les anciens messages conservés.
- Le serveur distribue les clés publiques. Une attaque de substitution lors du premier contact est possible sans comparaison *hors bande*. L'empreinte de clé ne s'authentifie pas d'elle-même.
- **Sauvegarde manuelle chiffrée uniquement.** En cas de changement de téléphone ou de réinstallation, l'utilisateur doit récupérer son compte puis importer son fichier chiffré avec sa phrase secrète. Sans ce fichier ou cette phrase, les anciens messages E2EE deviennent illisibles. Les codes de secours de compte **ne restaurent pas la clé privée**. Pas de synchronisation multi-appareil automatique.
- Une clé d'identité enregistrée sur le serveur est volontairement immuable. Aucun flux de rotation/perte de clé n'est encore disponible.
- Le chiffrement ne protège pas contre un appareil compromis ni contre un serveur capable de modifier le JavaScript livré au navigateur. Audit indépendant et signatures / client natif vérifié à envisager.
- Pas de sauvegarde cloud de données chiffrées ni de migration automatique des textes et médias existants.
- Ne pas activer sur des couples réels tant que les tests de migrations, mode hors ligne, import/export de sauvegarde sur iPhone, deux appareils physiques et audits sécurité ne sont pas terminés.

## Tests
`npm run test:e2ee` exécute les tests de dérivation, protection des messages et médias, sauvegarde/restauration de clé, séparation des espaces, détection de manipulation et non-affichage du ciphertext.
`npm run build` vérifie TypeScript.
**Tests manquants :** intégration D1/R2 de bout en bout et iPhone/Android réels; concurrence d'envoi, appareils restaurés et attaques de serveur.
