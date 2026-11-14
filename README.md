# JONAS BUYING

Plateforme de pilotage des achats internationaux de JONAS INTERNATIONAL : développement produit, proformas, design & packaging, fournisseurs, conteneurs & bookings, finance et réception.

> Version actuelle : **prototype fonctionnel front-end** avec données de démonstration (chiffres et fournisseurs illustratifs). Les données vivent dans le navigateur (localStorage) ; *Paramètres → Réinitialiser* restaure le jeu de démo.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de production dans dist/
```

## Écrans

| Module | Route | Contenu |
|---|---|---|
| Mon espace | `/` | Cockpit Direction : alertes (à signer, packs en retard, bookings urgents, ETA révisées, échéances), proformas par statut, arrivages |
| Proformas | `/proformas` | Vue liste / par semaine d’expédition / par fournisseur, cartouches CBM · ≈40HC · montant · packs OK · acompte à faire, filtres par statut, signature |
| Détail proforma | `/proformas/:id` | Galerie / liste produits, détails & finance, documents, historique, **suivi d’expédition + plan de chargement drag & drop** |
| Total – Produits | `/produits` | Référentiel en galerie ou liste, filtres marque / collection / rayon / fournisseur / état pack / développé / commande-transit-stock |
| Fiche produit | `/produits/:id` | Vue d’ensemble, Design & Pack, Développement, Commandes, Production, Logistique & Conteneurs, Stock & Ventes, Documents & Historique |
| Développement | `/developpement` | Développés vs à développer, kanban par étape (brief → production) |
| Design | `/design` | Espace designer : cartouches par semaine (x/y packs), liste/galerie, die cut, artwork, circuit David → Direction → Moinard → Fournisseur |
| Conteneurs | `/conteneurs` | Vue semaine / mois, par ETD ou ETA, groupes à booker / booking demandé / booké / en transit / arrivé, actions et détail |
| Fournisseurs | `/fournisseurs`, `/fournisseurs/:id` | Galerie puis espace dédié : tableau de bord, produits, proformas, bookings, conteneurs, factures & finance |
| Factures & Finance | `/finance` | Acomptes et soldes dérivés des proformas, échéances, retards |

## Rôles et portail fournisseur

Menu utilisateur en haut à droite : « Se connecter en tant que » (démo, en attendant une vraie authentification).

| Rôle | Accès |
|---|---|
| Pilote | Tout, gestion des utilisateurs, arbitrage sur toutes les étapes de validation |
| Direction | Tous les modules en lecture, signature des proformas, validation Direction |
| Acheteur | Proformas, développement, consolidation des conteneurs (David : étape de validation « David ») |
| Designer | Ses packs (artwork, die cut, envoi au fournisseur) |
| Validation pack | Valide ou refuse les packs à son étape (Moinard) |
| Finance | Proformas, fournisseurs, finance : enregistrement des paiements |
| Logistique | Plans de chargement, bookings, départ, réception, révision d’ETA (sans montants) |
| Fournisseur | **Portail** `/portail` : uniquement ses données |

- La matrice (`src/data/permissions.ts`) sert à la fois à l’affichage et au **contrôle de chaque action dans le store** : une action non autorisée est refusée même si l’interface l’envoie.
- Circuit pack : chaque étape (David → Direction → Moinard → Fournisseur) ne peut être validée que par la personne attribuée (configurable dans Paramètres) ; l’étape Fournisseur uniquement par le fournisseur du produit, après envoi du pack.
- Portail fournisseur : tableau de bord des actions attendues, produits (développés / à développer), proformas, packs à valider, die cuts demandés, **plan de chargement proposé par le fournisseur** puis validé par JONAS, dépôt BL / Invoice / Packing List, paiements.
- Paramètres → Utilisateurs & rôles : changement de rôle, d’étape de validation, activation (Pilote uniquement) et matrice des droits.

## Règles métier implémentées

- **Source unique** (`src/data/store.tsx`) : toute action (signature, validation pack, affectation conteneur, booking, départ, réception, paiement) met à jour un seul état, répercuté dans toutes les vues.
- CBM ligne = (qté ÷ PCB) × CBM carton ; équivalent 40HC = CBM ÷ **69 m³**.
- Pack terminé **uniquement après les 4 validations** ; alerte rouge si date limite artwork dépassée.
- Quantités suivies par commande, conteneur et réception (commandé / affecté / restant, pas de double comptage). Un produit peut être réparti sur plusieurs conteneurs ; un conteneur peut regrouper plusieurs proformas.
- Vue conteneurs **par ETA** : arrivée prévue, révisée ou réelle dans la période, même si l’ETD est antérieure ou le conteneur non booké. **Par ETD** : départ prévu ou réel.
- La réception d’un conteneur alimente le stock de l’entrepôt ; le statut de la proforma suit ses conteneurs.
- Changements de dates et de statuts historisés.

## Structure

```
src/
  data/types.ts    modèle de données
  data/seed.ts     jeu de démonstration
  data/store.tsx   état, actions et règles de calcul
  lib/format.ts    dates, semaines ISO, montants
  components/      layout et composants UI
  pages/           écrans
```

## Pilotage et qualité

- **Notifications** (cloche) calculées selon le rôle : proformas à signer, packs à valider à mon étape, packs non commencés à J-2 / en retard / poussés en urgent, bookings à faire ou en attente, ETA révisées, arrivées à J-7, plans proposés par les fournisseurs, échéances de paiement.
- **Recherche globale** : `Ctrl/Cmd + K` ou « Rechercher » dans le menu.
- **Journal d’activité** (`/journal`, Pilote et Direction) : chaque action acceptée est tracée (qui, quoi, quand, objet), filtrable ; l’historique d’un produit reprend ses entrées.
- **Réception contrôlée** : quantités reçues ligne à ligne, écarts, réserves ; le stock prend les quantités réellement reçues.
- **Indicateurs Direction** (Performance) : conteneurs à l’heure, réceptions conformes, packs rendus à temps, valeur engagée au m³, charge des designers, tableau fournisseurs.
- **Paramètres** : capacité par designer (défaut 40 packs / semaine) et cours des devises (USD, CNY) ; proformas en EUR, USD ou CNY, totaux convertis en euros.
- **Conteneurs** : poids de la marchandise comparé à la charge utile.
- **Portail fournisseur bilingue** anglais / français (anglais par défaut).
- **Accessibilité** : lignes et en-têtes activables au clavier, focus visible.
- **Écrans chargés à la demande** ; lint sans avertissement.

## Tests

```bash
npm run test:e2e     # Playwright (navigateur Chromium)
```

La CI GitHub (`.github/workflows/ci.yml`) lance lint, typage, build et tests à chaque push.

## Prochaines étapes (nécessitent vos accès / décisions)

- Serveur et base partagée (ex. Supabase : Postgres + Storage) à partir du modèle de `types.ts`.
- Authentification réelle (comptes JONAS, invitations fournisseurs) et droits appliqués côté serveur (RLS reprenant `permissions.ts`).
- Stockage partagé des fichiers (packs, dossiers créa, BL, factures).
- Import des données réelles (Excel / ERP TCI) et suppression des données de démo.
- Envoi réel des notifications (e-mail) et cours de change automatique.
