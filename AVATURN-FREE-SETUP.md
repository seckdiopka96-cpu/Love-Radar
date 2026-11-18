# Avaturn 3D dans Love Radar — intégration gratuite

Love Radar reste **100 % gratuit pour les couples**. Le studio présente désormais exclusivement des avatars 3D. Les anciennes données 2D restent conservées
pour la compatibilité, mais les anciens personnages dessinés ne sont plus affichés.
Les conversations, appels et jeux ne sont pas modifiés.

## Créer le projet Avaturn gratuit

1. Créer un compte à <https://developer.avaturn.me/> et configurer un sous-domaine
   (par exemple `love-radar.avaturn.dev`). Ne pas souscrire à Avaturn PRO ni à l'API payante.
2. Cloudflare Pages → Love Radar → **Settings → Environment variables** :
   ajouter la variable de construction publique
   `VITE_AVATURN_SUBDOMAIN=love-radar`
   (utiliser **le sous-domaine exact choisi** sans `.avaturn.dev`, sans clé privée).
3. Relancer le déploiement Pages. Le bouton **Créer mon avatar 3D** se trouve
   dans **Accueil → Nos avatars amoureux**. Le SDK intégré affiche l'éditeur
   Avaturn et écoute l'export GLB pour l'importer dans l'espace privé du couple.
4. Quand le partenaire a créé son propre avatar, les deux modèles s'affichent
   dans le même décor avec les animations de Love Radar.

### Mode démo

Si `VITE_AVATURN_SUBDOMAIN` n'est pas configuré, Love Radar utilise
`https://demo.avaturn.dev` **à titre d'essai seulement**. L'éditeur de démo
peut demander une connexion, limiter la personnalisation et/ou l'export.
Le bouton **Importer un fichier GLB** accepte aussi un modèle Avaturn exporté
et téléchargé manuellement, sans abonnement à l'API.

## Connexion Avaturn sur iPhone / iPad

Si Avaturn redirige vers `auth1.avaturn.me` avec « Unable to process request due to
missing initial state », la connexion a perdu l'état de redirection (généralement à
cause de l'isolement des cookies/sessionStorage dans une iframe iOS).

Love Radar affiche désormais **Ouvrir Avaturn dans Safari** sur iOS au lieu de
lancer le formulaire de connexion dans une iframe. Cela démarre une nouvelle
session depuis la page de création elle-même, **pas** depuis le lien
`auth1.avaturn.me` devenu invalide.

1. Dans Love Radar, ouvrir **Nos avatars 3D → Créer mon avatar 3D**.
2. Appuyer sur **Ouvrir Avaturn dans Safari** et se connecter à partir de
   la page principale Avaturn.
3. Si un modèle `.glb` peut être téléchargé depuis Avaturn, l'enregistrer dans
   l'app **Fichiers** sur l'iPhone. Revenir à Love Radar et appuyer sur
   **Importer un fichier GLB** pour l'enregistrer dans le stockage privé du couple.

**Important :** une création effectuée dans Safari ne remonte pas automatiquement
dans Love Radar, puisque ce flux externe ne reçoit pas le callback d'export du SDK
intégré. Le bouton d'import fonctionne uniquement si un fichier GLB est disponible.
Le mode démo peut limiter ou empêcher cet export. Un sous-domaine gratuit Avaturn
dédié reste préférable. Les restrictions de connexion et de session du service
Avaturn ne sont pas contrôlables par Love Radar.

Documentation : https://firebase.google.com/docs/auth/web/redirect-best-practices

## Stockage et données

- `functions/api/couple-avatar-model.ts` valide une session Love Radar avant
  toute lecture ou écriture. Chaque membre peut téléverser ou supprimer son propre
  modèle et lire uniquement les deux modèles de son couple.
- Les modèles GLB sont sauvegardés dans **R2 privé**, jamais dans un dossier
  public, avec contrôle du format binaire glTF 2.0, limite de **12 Mo** et refus
  des références externes de textures.
- L'indicateur de disponibilité `mine3d/partner3d` utilise la synchronisation
  existante `/api/couple-avatars` et une mise à jour immédiate après import.
- La suppression de la salle efface la table D1 et le préfixe R2
  `avatars3d/<roomId>/`. Le remplacement supprime l'ancien modèle.
- Les selfies facultatifs sont transmis **directement à Avaturn** si l'utilisateur
  décide d'en prendre : Love Radar ne reçoit que le fichier 3D exporté. Les
  utilisateurs doivent lire les conditions et la politique de confidentialité
  d'Avaturn.
- Les stickers de conversation utilisent des compositions légères et animées
  afin de ne pas ouvrir des dizaines de contextes WebGL dans le chat.
  Les vrais avatars 3D sont visibles et animés dans le studio et sur l'accueil.
  Si WebGL échoue ou qu'aucun modèle n'est encore créé, un élégant écran d'attente
  apparaît à la place des anciens personnages.

## Animations

Les modèles GLB sont affichés par **Three.js** avec contrôle de squelette
pour les articulations humanoïdes reconnues (tête, bras, jambes) : main dans
la main, câlin, bisou et danse. Chaque modèle pouvant avoir un rig différent,
les mouvements varient selon les bones présents. Les modèles sans rig compatible
conservent des mouvements légers de corps. Le système respecte
`prefers-reduced-motion` et dispose des ressources WebGL à la fermeture.

Le Web SDK et l'API Avaturn permettant d'éviter le login Avaturn et de proposer
une interface Avaturn entièrement personnalisée exigent un contrat payant :
**ils ne sont pas requis par cette version de base**.

Références :
- https://docs.avaturn.me/docs/integration/web/html/
- https://docs.avaturn.me/docs/integration/web/threejs/
- https://docs.avaturn.me/docs/integration/api/introduction/
