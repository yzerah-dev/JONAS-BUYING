# Base partagée JONAS BUYING (Supabase)

Tant que l'application n'est pas reliée à Supabase, elle tourne en **mode démo** : les données restent dans
le navigateur de chacun. Une fois reliée, tout le monde partage la même base, avec de vrais comptes et
les modifications en temps réel.

## Mise en service

1. **Créer les tables et les règles d'accès** : ouvrir le projet Supabase → *SQL Editor* → coller et exécuter
   `supabase/migrations/0001_jonas_buying.sql`.
2. **Reprendre les données** (clé secrète du projet dans `SUPABASE_SERVICE_KEY`) :
   `npm run seed:supabase -- --docs`  (passe par le proxy HTTPS de l'environnement : `NODE_USE_ENV_PROXY=1`)
3. **Créer les comptes** : copier `scripts/members.example.json`, y mettre les vrais e-mails
   (un compte par utilisateur de l'application : `app_user_id`), puis
   `npm run seed:supabase -- --members scripts/members.json`
   Comptes créés sans mot de passe : première connexion par lien e-mail, puis menu utilisateur →
   « Définir mon mot de passe ».
5. **E-mails de connexion** : SMTP Google Workspace (*Authentication → Emails → SMTP Settings*, expéditeur
   yzerah@jonas-france.com), modèle « Magic link » en français. L'envoi par défaut de Supabase ne suffit pas.

## En ligne

- **Production** : https://jonas-buying.vercel.app — projet Vercel « jonas-buying » (équipe JONAS PRO),
  branche `claude/new-session-q87nz8`, configuration dans `vercel.json` (build `npm run build:shared`,
  sortie `dist`). Aucune variable d'environnement : `.env.supabase` ne contient que l'URL et la clé publique.
  Chaque push sur la branche redéploie.
- **Supabase → Authentication → URL Configuration** : Site URL `https://jonas-buying.vercel.app` ;
  Redirect URLs `https://jonas-buying.vercel.app/**` et `http://localhost:5173/**`.
- **Connexion** :
  1. Première fois : saisir son e-mail, laisser le mot de passe vide, « Se connecter » → lien reçu par e-mail.
  2. **Ouvrir le lien dans le même navigateur** que celui où on l'a demandé (flux PKCE : le code n'est
     valable qu'avec la clé gardée par ce navigateur). Sinon : « Ouvrez le lien dans le navigateur où vous
     l'avez demandé, ou redemandez un lien. »
  3. Menu utilisateur → « Définir mon mot de passe » ; ensuite, connexion par e-mail + mot de passe.
  - Une adresse sans compte reçoit « Cette adresse n'a pas d'accès à JONAS BUYING » (aucun compte n'est créé).

## Ce qui change dans l'application reliée

- Écran de connexion (e-mail + mot de passe, ou lien de connexion par e-mail) ; le menu utilisateur
  propose « Se déconnecter » au lieu du changement d'utilisateur de la démo.
- Chacun ne voit que ses données : l'équipe JONAS tout, un fournisseur ses produits, proformas et
  conteneurs, un transitaire ses conteneurs et bookings (règles RLS dans la migration).
- Chaque action n'envoie que les objets modifiés ; les autres navigateurs les reçoivent en direct.
- Fichiers (proformas, packs, bons de commande) dans le stockage privé `files`.
- « Réinitialiser la démo » est désactivé.

## Suite prévue

- Contrôle des règles métier côté serveur (qui peut signer, booker…) : aujourd'hui vérifié par l'application.
- Connecteur MCP « JONAS BUYING » pour parler à l'acheteur depuis Claude, puis WhatsApp.
