# Love-Radar sur iPhone — préparation TestFlight sans Mac

Ce guide concerne **la vraie application iPhone native** : appels CallKit,
détection des captures après coup et interface React intégrée à Capacitor.
La PWA Safari n'est pas suffisante pour ces capacités.

**Projet GitHub :** https://github.com/seckdiopka96-cpu/Love-Radar
**Identifiant iOS fixe :** `com.diaotech.loveradar`
**GitHub Actions :** https://github.com/seckdiopka96-cpu/Love-Radar/actions/workflows/iphone-testflight.yml

## 1. Les prérequis Apple (depuis un iPhone, sans Mac)

1. S'inscrire à l'[Apple Developer Program](https://developer.apple.com/programs/enroll/)
   (en général **99 USD par an**, ou le tarif local affiché par Apple).
   Le paiement est fait **directement à Apple**, jamais dans ce chat.
2. Dans [Apple Developer](https://developer.apple.com/account/resources/identifiers/list),
   enregistrer **un identifiant explicite** `com.diaotech.loveradar`.
   Activer la capacité **Push Notifications** pour le profil iOS, requise
   par l'entitlement APNs de notre projet.
3. Dans [App Store Connect](https://appstoreconnect.apple.com/),
   créer une application iOS nommée **Love Radar** et sélectionner cet
   identifiant. La version initiale prévue est `1.0.0`.
4. Dans **App Store Connect → Utilisateurs et accès → Intégrations →
   App Store Connect API**, créer une **clé d'équipe** avec le rôle
   **App Manager** et télécharger une seule fois `AuthKey_XXXXXXXXXX.p8`.
   Ne jamais publier ni envoyer cette clé dans une conversation.
   Elle est **différente** de la clé APNs VoIP utilisée pour les appels.
5. Relever l'**Issuer ID**, le **Key ID** et l'**Apple Team ID** (10 caractères)
   depuis les portails Apple.

## 2. Configurer la signature Apple sans Mac

GitHub Actions utilisera un Mac hébergé pour compiler et signer. Il lui faut
un certificat **Apple Distribution** (exporté au format **.p12** avec sa
clé privée) et un **profil de distribution App Store Connect** associé à
`com.diaotech.loveradar`. Un simple fichier `.cer` ne suffit pas.

**Pour quelqu'un qui n'a qu'un iPhone :** ouvrir le dépôt GitHub dans
Safari, puis créer un **GitHub Codespace** (éditeur dans le navigateur).
Il est possible d'utiliser les scripts officiels et open source de
[Apple-Actions/download-provisioning-profiles](https://github.com/Apple-Actions/download-provisioning-profiles),
qui peuvent générer la demande de certificat et configurer les variables
GitHub depuis un terminal cloud, sans Xcode local.

Ces commandes **illustratives** s'exécutent dans un Codespace privé,
après avoir téléchargé le fichier `.p8` dans celui-ci :

```bash
git clone --depth 1 https://github.com/Apple-Actions/download-provisioning-profiles.git /tmp/apple-signing-tools
cd /tmp/apple-signing-tools
./scripts/setup.sh \
  --bundle-id com.diaotech.loveradar \
  --name 'Love Radar' \
  --issuer-id 'VOTRE_ISSUER_ID' \
  --api-key-id 'VOTRE_KEY_ID' \
  --api-private-key-path '/chemin/prive/AuthKey_VOTRE_KEY_ID.p8' \
  --p12-password 'MOT_DE_PASSE_FORT_UNIQUE' \
  --github-repo seckdiopka96-cpu/Love-Radar \
  --export-options /tmp/love-radar-testflight-export.plist
```

**Ne remplacez jamais les exemples par de vraies clés dans le dépôt ou dans
ce chat.** Conserver la clé `.p8` uniquement le temps de la configuration,
la supprimer ensuite du Codespace et de ses sauvegardes si non nécessaires.
La commande `gh` doit être authentifiée avec les autorisations de gestion
des secrets de ce dépôt. Les scripts Apple-Actions sont tiers : vérifier leur
code et leurs permissions avant utilisation.

Créer ensuite dans **GitHub → Love-Radar → Settings → Secrets and variables →
Actions** les données suivantes (les scripts Apple-Actions peuvent
automatiser leur création) :

| Type GitHub | Nom exact | Contenu |
| --- | --- | --- |
| Variable | `APPSTORE_ISSUER_ID` | Issuer ID Apple |
| Variable | `APPSTORE_API_KEY_ID` | Key ID Apple |
| Variable | `APPSTORE_TEAM_ID` | Team ID Apple Developer (10 caractères) |
| Secret | `APPSTORE_API_PRIVATE_KEY` | Contenu intégral du fichier `.p8` |
| Secret | `APPSTORE_CERTIFICATES_FILE_BASE64` | Certificat de distribution `.p12` encodé en base64 |
| Secret | `APPSTORE_CERTIFICATES_PASSWORD` | Mot de passe du certificat `.p12` |

**Important :** le script tiers `setup.sh` configure les clés et le
certificat, mais **pas** la variable `APPSTORE_TEAM_ID` utilisée par notre
workflow. Ajoute cette variable toi-même dans GitHub Actions (ou, depuis un
Codespace déjà authentifié, exécute
`gh variable set APPSTORE_TEAM_ID --repo seckdiopka96-cpu/Love-Radar --body VOTRE_TEAM_ID`).

Le profil doit être nommé exactement
`AppStore com.diaotech.loveradar`. Si Apple l'a nommé autrement,
définir aussi la **variable facultative** `APPSTORE_PROFILE_NAME` avec
son nom exact.

**Rappel :** la signature pour TestFlight requiert un profil App Store,
pas un profil de développement ou Ad Hoc.

## 3. Lancer la version iPhone depuis GitHub (sur Safari)

Dans [Actions → Préparer Love Radar iPhone et TestFlight](https://github.com/seckdiopka96-cpu/Love-Radar/actions/workflows/iphone-testflight.yml) :

1. Appuyer sur **Run workflow** et conserver la branche `main`.
2. Choisir **`simulateur`** pour compiler sans identifiants Apple.
   Un fichier ZIP d'application **pour simulateur uniquement** sera généré :
   il **ne peut pas être installé directement sur l'iPhone**.
3. Une fois la signature Apple configurée, relancer la même action
   avec **`testflight`** et la version `1.0.0`.
4. Le workflow : compile l'interface, génère le projet Capacitor iOS,
   installe les plugins CallKit/PushKit/capture d'écran, ajoute l'icône
   Love Radar, télécharge le profil App Store, archive/signature l'app,
   exporte un `.ipa` puis **l'envoie à Apple TestFlight**.
5. Dans [App Store Connect → Love Radar → TestFlight](https://appstoreconnect.apple.com/),
   vérifier le traitement du build et compléter, si demandé,
   les informations bêta et les questions d'**exportation de chiffrement**.
   Love Radar comporte du chiffrement de conversation : répondre
   correctement aux questions Apple, sans cocher par défaut « exempt ».
6. Inviter ensuite le partenaire dans TestFlight. Les testeurs installent
   l'application **TestFlight** puis acceptent l'invitation. La première
   invitation de testeurs **externes** peut être soumise à une revue Apple.

Le workflow est **manuel** et limité à `main`. Il vérifie les identifiants
Apple **avant** la compilation signée. Les certificats et clés ne sont
jamais ajoutés au code ni publiés comme artefacts téléchargeables.
Le build/TestFlight peut échouer si le compte, le profil ou la validation
Apple n'est pas encore prêt ; le code ne peut pas contourner ces étapes.

## 4. À tester absolument sur deux vrais iPhone

- Inscription et récupération de chaque compte et historique privé.
- Appels **CallKit** entrants/réponses et **PushKit** sur iPhone verrouillé.
  Cela exige, en plus du compte Apple, la **clé APNs VoIP** distincte et
  les secrets `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY`,
  `APNS_BUNDLE_ID`, `APNS_ENVIRONMENT` du backend Cloudflare.
- Audio WebRTC avec l'application en arrière-plan : le navigateur
  intégré peut être suspendu ; un moteur natif supplémentaire peut
  être nécessaire pour garantir les appels pendant le verrouillage.
- Détection de capture : iOS **ne bloque pas** les captures, et
  l'alerte est créée **après** la capture lorsque l'app est active.
- Photos, messages vocaux, Ludo, mises à jour et permissions.
- Notifications générales : un push Web/PWA n'est pas automatiquement
  un push APNs natif. Il faudra valider le transport réellement disponible
  sur iPhone avant de le promettre.

**État de livraison :** le code et le workflow sont préparés. Aucun
fichier `.ipa` signé n'est fourni tant qu'un propriétaire Apple Developer
n'a pas configuré et autorisé la signature ; aucune publication TestFlight
n'est prétendue avant un succès réel dans App Store Connect.
