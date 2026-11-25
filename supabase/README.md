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
   Comptes créés sans mot de passe : connexion par lien e-mail (ou « mot de passe oublié »).
4. **Relier l'application** : au build, définir
   - `VITE_SUPABASE_URL` = `https://ulwsixiywyikyjanbidk.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la clé **publique** du projet (anon / publishable — jamais la clé secrète)

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
