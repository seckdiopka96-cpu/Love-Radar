# Google Play — Love Radar (sans ordinateur)

Le package Android du projet est `com.diaotech.loveradar`. Le workflow
`.github/workflows/play-release.yml` construit un Android App Bundle (AAB)
depuis GitHub Actions. Capacitor 8 vise Android API 36.

## Signature

Google Play exige **un AAB signe** avec la cle d'envoi de l'application.
La premiere publication doit utiliser une cle d'envoi que tu conserveras
pour les versions suivantes. Ne jamais publier cette cle, son encodage base64,
ni ses mots de passe dans le depot, dans une issue ou dans une discussion.

Configurer dans **Settings > Secrets and variables > Actions** du depot les
quatre secrets chiffres suivants :

- `ANDROID_UPLOAD_KEYSTORE_BASE64` : contenu base64 complet de ta cle .jks
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD` : mot de passe du keystore
- `ANDROID_UPLOAD_KEY_ALIAS` : nom de la cle
- `ANDROID_UPLOAD_KEY_PASSWORD` : mot de passe de la cle

La cle .jks doit etre creee de facon securisee (par exemple avec Java
`keytool` sur un environnement de developpement cloud prive) et une
**copie de sauvegarde personnelle** doit etre conservee hors de GitHub.
Il est possible d'utiliser GitHub Codespaces depuis Safari si le compte
y donne acces. Ne pas recreer une nouvelle cle aleatoire a chaque build.
Pour une app ayant deja ete envoyee sur Google Play, reutiliser la cle
d'envoi existante ou suivre le processus officiel de reinitialisation.

## Compiler

1. Ouvrir GitHub > Actions > **Construire Love Radar pour Google Play**.
2. Cliquer **Run workflow**, branche `main`.
3. Pour la premiere publication : `version_code = 1` et `version_name = 1.0.0`.
   Pour chaque mise a jour, augmenter le `version_code`.
4. A la fin, ouvrir **Artifacts** et telecharger
   `love-radar-google-play-signed-aab`.
5. Dans Google Play Console, creer une release de test et envoyer
   `love-radar-play-signed.aab` qui se trouve dans l'archive telechargee.

Si les secrets ne sont pas configures, le workflow fournit uniquement
`love-radar-unsigned-not-for-play` : ce fichier **ne peut pas etre publie**.
Ne jamais envoyer ce fichier a Play Console.

## Limitations de la premiere version

La compilation ne valide pas les appels en arriere-plan, les notifications
natives, les declarations de confidentialite et les tests sur appareil.
Les notifications natives iOS et Android doivent encore etre completees.
Faire d'abord un test interne / ferme, plutot qu'une publication publique,
et verifier les exigences de Google Play Console.
