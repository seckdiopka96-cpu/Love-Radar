# Love Radar Plus — activation des paiements (production)

Love Radar inclut maintenant un mode découverte accessible sans compte et une page **Plus** à **2,99 USD par mois pour un couple**. La version web utilise Stripe Checkout et le Customer Portal, mais **les paiements restent désactivés tant que les paramètres Stripe ne sont pas tous configurés**. Les messages, appels et jeux existants restent gratuits.

## Activer Stripe sur Cloudflare Pages

1. Dans Stripe, créez un produit Love Radar Plus et un prix **2,99 USD, recurring monthly**.
**Important :** un ancien prix Stripe ne se transforme pas automatiquement. Créez un **nouveau prix récurrent à 2,99 USD/mois** et utilisez son nouvel identifiant `price_...` dans `STRIPE_PRICE_ID`. La clé secrète Stripe doit rester exclusivement dans les secrets Cloudflare ; ne la partagez pas dans un chat ou dans GitHub.

2. Dans le projet Cloudflare **Pages** Love Radar, configurez en **Production** :
   - `STRIPE_SECRET_KEY` : clé secrète Stripe (ne jamais mettre `VITE_` devant).
   - `STRIPE_PRICE_ID` : identifiant du prix mensuel `price_...`.
   - `STRIPE_WEBHOOK_SECRET` : secret de signature `whsec_...`.
3. Déclarez l'endpoint du webhook Stripe : **`https://love-radar-acd.pages.dev/api/stripe-webhook`**.
   Événements : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Activez Stripe Customer Portal (annulation et gestion du paiement) dans le Dashboard Stripe.
5. Relancez une compilation Pages de **Production** et testez d'abord avec vos clés Stripe de test (prix test correspondant).

Le serveur vérifie le prix exact (299 centimes, USD, par mois) avant d'ouvrir Checkout. Une confirmation cliente seule ne donne jamais accès à Plus : l'abonnement du couple est activé uniquement après validation d'un webhook Stripe signé, stocké dans D1. Toute suppression de la salle avec renouvellement toujours actif est refusée, jusqu'à la résiliation automatique sur le portail. Les deux partenaires du même `room_id` partagent le même statut Plus.

## Plateformes

Le CTA d'achat est désactivé dans l'application native iOS/Android. Les achats de fonctionnalités numériques dans les apps natives nécessitent une intégration StoreKit / Google Play Billing adaptée à la distribution et aux règles locales. Il ne faut **pas** publier un abonnement Stripe dans une app native sans traiter les obligations des plateformes. Une souscription web déjà active reste consultable dans l'app native.

## Livraison et confidentialité

- Le mode découverte n'envoie rien vers les API privées et propose une conversation simulée, un mini-quiz local et un vrai Ludo Solo invité.
- L'édition Plus fournit deux thèmes, dix questions/défis et un livre souvenir à composer et imprimer/enregistrer comme PDF.
- Les images du livre et le texte saisi restent sur le téléphone pendant l'édition ; aucune sauvegarde n'est faite côté serveur.
- La souscription n'est pas un abonnement actif tant que `/api/plus` répond `available:false`.
- La facturation ne dépend jamais du stockage local ou d'un drapeau client pour activer le statut serveur.

## Vérification

`npm run test:plus`, `npm run build`, CI complète, tests de suppression, et tests manuels dans le navigateur (connexion/reconnexion, création, résiliation, restauration, retour de Stripe, affichage à deux).
