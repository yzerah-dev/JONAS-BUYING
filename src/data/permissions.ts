// Rôles, modules visibles et droits d'action.
// Matrice unique : utilisée par l'interface (affichage) ET par le store (contrôle des actions).
import type { Role, User, ValidationStep } from './types';

export type Module =
  | 'home'
  | 'proformas'
  | 'produits'
  | 'developpement'
  | 'design'
  | 'conteneurs'
  | 'fournisseurs'
  | 'finance'
  | 'parametres'
  | 'journal'
  | 'booking';

export type Perm =
  | 'proforma.sign' // signer une proforma (engagement d'achat)
  | 'proforma.edit' // changer le statut d'une proforma
  | 'finance.pay' // marquer acomptes / soldes payés
  | 'finance.view' // voir montants, acomptes, soldes
  | 'pack.design' // déposer artwork, demander die cut, forwarder le pack
  | 'pack.reject' // refuser un pack (retour au designer)
  | 'dev.advance' // faire avancer un développement produit
  | 'logistics.plan' // consolider, créer conteneurs, valider plan de chargement
  | 'logistics.booking' // booking, départ, réception, révision ETA
  | 'users.manage' // gérer utilisateurs et rôles
  | 'pack.assign'; // réaffecter un pack à un autre designer / une autre semaine

export interface RoleDef {
  label: string;
  description: string;
  modules: Module[];
  perms: Perm[];
  portal?: boolean;
}

const ALL_MODULES: Module[] = ['home', 'proformas', 'produits', 'developpement', 'design', 'conteneurs', 'fournisseurs', 'finance', 'parametres', 'journal', 'booking'];
const ALL_PERMS: Perm[] = [
  'proforma.sign',
  'proforma.edit',
  'finance.pay',
  'finance.view',
  'pack.design',
  'pack.reject',
  'dev.advance',
  'logistics.plan',
  'logistics.booking',
  'users.manage',
  'pack.assign',
];

export const ROLE_DEFS: Record<Role, RoleDef> = {
  pilote: {
    label: 'Pilote',
    description: 'Administrateur de la plateforme : accès complet, gestion des utilisateurs.',
    modules: ALL_MODULES,
    perms: ALL_PERMS,
  },
  direction: {
    label: 'Direction',
    description: 'Vision complète, signature des proformas, validation Direction des packs.',
    modules: ALL_MODULES,
    perms: ['proforma.sign', 'finance.view', 'pack.reject'],
  },
  acheteur: {
    label: 'Acheteur',
    description: 'Proformas, développement produit, consolidation des conteneurs.',
    modules: ['home', 'proformas', 'produits', 'developpement', 'design', 'conteneurs', 'booking', 'fournisseurs', 'parametres'],
    perms: ['proforma.edit', 'finance.view', 'dev.advance', 'logistics.plan', 'pack.reject'],
  },
  designer: {
    label: 'Designer',
    description: 'Ses produits à développer et ses packs par semaine : artwork, die cut, envoi au circuit de validation.',
    modules: ['home', 'produits', 'developpement', 'design', 'parametres'],
    perms: ['pack.design'],
  },
  validateur: {
    label: 'Validation pack',
    description: 'Valide ou refuse les packs à son étape du circuit.',
    modules: ['home', 'produits', 'design', 'parametres'],
    perms: ['pack.reject'],
  },
  finance: {
    label: 'Finance',
    description: 'Factures, acomptes, soldes et échéances.',
    modules: ['home', 'proformas', 'fournisseurs', 'finance', 'parametres'],
    perms: ['finance.pay', 'finance.view'],
  },
  logistique: {
    label: 'Logistique',
    description: 'Plans de chargement, bookings, transit et réception.',
    modules: ['home', 'proformas', 'produits', 'conteneurs', 'booking', 'fournisseurs', 'parametres'],
    perms: ['logistics.plan', 'logistics.booking'],
  },
  fournisseur: {
    label: 'Fournisseur',
    description: 'Portail fournisseur : uniquement ses propres données.',
    modules: [],
    perms: [],
    portal: true,
  },
  transitaire: {
    label: 'Transitaire',
    description: 'Portail transitaire : ses conteneurs bookés (confirmation, départ, ETA, documents, douane, livraison).',
    modules: [],
    perms: [],
    portal: true,
  },
};

export const ROLES = Object.keys(ROLE_DEFS) as Role[];

export const can = (u: User, p: Perm) => u.active && ROLE_DEFS[u.role].perms.includes(p);
export const canSee = (u: User, m: Module) => u.active && ROLE_DEFS[u.role].modules.includes(m);
export const isSupplier = (u: User) => u.role === 'fournisseur';
export const isForwarder = (u: User) => u.role === 'transitaire' && !!u.forwarder;
/** Page d'accueil selon le rôle : portail fournisseur, portail transitaire ou application JONAS */
export const homeOf = (u: User) => (isSupplier(u) ? '/portail' : u.role === 'transitaire' ? '/transitaire/a-confirmer' : '/');

/** Qui peut signer une étape du circuit David → Direction → Moinard → Fournisseur */
export function canValidateStep(u: User, step: ValidationStep): boolean {
  if (!u.active) return false;
  if (u.role === 'pilote') return true; // arbitrage
  if (step === 'fournisseur') return u.role === 'fournisseur';
  return u.validationStep === step;
}

export const PERM_LABELS: Record<Perm, string> = {
  'proforma.sign': 'Signer les proformas',
  'proforma.edit': 'Modifier le statut des proformas',
  'finance.view': 'Voir montants et acomptes',
  'finance.pay': 'Enregistrer les paiements',
  'pack.design': 'Artwork, die cut, envoi des packs',
  'pack.reject': 'Refuser un pack',
  'dev.advance': 'Faire avancer le développement',
  'logistics.plan': 'Consolidation & plan de chargement',
  'logistics.booking': 'Bookings, départ, réception, ETA',
  'users.manage': 'Gérer les utilisateurs',
  'pack.assign': 'Réaffecter les packs (designer, semaine)',
};

export const MODULE_LABELS: Record<Module, string> = {
  home: 'Mon espace',
  proformas: 'Proformas',
  produits: 'Total – Produits',
  developpement: 'Développement',
  design: 'Design',
  conteneurs: 'Conteneurs',
  fournisseurs: 'Fournisseurs',
  finance: 'Finance',
  parametres: 'Paramètres',
  journal: 'Journal d’activité',
  booking: 'Booking',
};
