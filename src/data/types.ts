// Modèle de données JONAS BUYING.
// Principe : une information saisie une fois est réutilisée partout (références par id).

export type ISODate = string; // 'YYYY-MM-DD'

export interface Contact {
  name: string;
  role: string;
  phone: string;
  email: string;
  wechat?: string;
}

export interface Supplier {
  id: string;
  name: string;
  shortName: string;
  country: string;
  flag: string;
  city: string;
  port: string;
  contact: Contact;
  color: string;
  /** Style du logo dans les listes : lettre en dégradé ou pastille ronde */
  mark?: 'letter' | 'badge';
  active: boolean;
}

export interface Brand {
  id: string;
  name: string;
  tagline: string; // ex. PARIS
}

export type ValidationStep = 'david' | 'direction' | 'moinard' | 'fournisseur';
export const VALIDATION_STEPS: ValidationStep[] = ['david', 'direction', 'moinard', 'fournisseur'];
export const VALIDATION_LABELS: Record<ValidationStep, string> = {
  david: 'David',
  direction: 'Direction',
  moinard: 'Moinard',
  fournisseur: 'Fournisseur',
};

export interface Validation {
  state: 'done' | 'pending' | 'todo';
  date?: ISODate;
}

export type DieCutState = 'none' | 'requested' | 'received';

export interface Pack {
  type: string;
  designer: string;
  artworkDeadline: ISODate;
  validations: Record<ValidationStep, Validation>;
  dieCut: DieCutState;
  artworkVersions: number;
  sentToSupplier: boolean;
  /** Le designer a commencé le pack (date + heure, ISO) */
  startedAt?: string;
  /** Date de début annoncée par le designer */
  plannedStart?: ISODate;
  /** Fichiers uploadés : versions du pack et dossier créa */
  files?: PackFile[];
}

export interface PackFile {
  id: string; // clé du contenu dans le stockage de fichiers
  kind: 'pack' | 'crea';
  name: string;
  /** Chemin relatif dans le dossier créa (ex. « Rendus/vue-face.jpg ») */
  path: string;
  size: number;
  type: string;
  /** Numéro de version (fichiers pack) */
  version?: number;
  uploadedAt: string;
  uploadedBy: string;
}

export const DEV_STAGES = [
  'Brief & idée',
  'Design & concept',
  'Échantillon',
  'Validation',
  'Prix & sourcing',
  'Lancement',
  'Production',
] as const;

export interface Product {
  id: string;
  ref: string;
  ean: string;
  name: string;
  brandId: string;
  supplierId: string;
  rayon: string;
  collection: string;
  gender: string;
  material: string;
  sizes?: string;
  emoji: string;
  tint: string;
  pa: number; // prix d'achat unitaire €
  pcb: number; // pièces par carton
  cbmCarton: number; // m³ par carton
  weight: number; // kg / pièce
  developed: boolean;
  devStage: number; // index dans DEV_STAGES
  devDeadline: ISODate;
  nextAction: string;
  targetQty: number;
  /** Poussé en urgence par l'acheteur (onglet PUSH URGENT) */
  urgent?: boolean;
  pack: Pack;
  stock: Record<string, number>; // par site
}

export type ProformaStatus = 'a_signer' | 'en_dev' | 'en_production' | 'booke' | 'en_transit' | 'arrive';
export const PROFORMA_STATUSES: ProformaStatus[] = ['a_signer', 'en_dev', 'en_production', 'booke', 'en_transit', 'arrive'];

export interface ProformaLine {
  productId: string;
  qty: number;
  price: number;
  /** CBM déclaré sur la proforma (sinon calculé depuis le carton) */
  cbm?: number;
}

export interface HistoryEntry {
  date: ISODate;
  user: string;
  text: string;
}

export interface Proforma {
  id: string; // PF-2026-0146
  supplierId: string;
  /** Devise de la proforma (prix des lignes dans cette devise) ; EUR par défaut */
  currency?: Currency;
  /** Intitulé de la commande (ex. « Brumes corps », « Mobilier jardin – Été 2027 ») */
  title?: string;
  poNumber: string;
  date: ISODate;
  status: ProformaStatus;
  etd: ISODate;
  eta: ISODate;
  lines: ProformaLine[];
  depositPct: number;
  /** Montant d'acompte négocié, s'il n'est pas un pourcentage rond */
  depositAmount?: number;
  depositPaid: boolean;
  balancePaid: boolean;
  balanceDue: ISODate;
  documents: string[];
  history: HistoryEntry[];
  /** Demande de booking envoyée au fournisseur, et sa réponse (plan + dates réelles) */
  booking?: BookingRequest;
}

/**
 * Booking d'une proforma, en deux temps :
 * JONAS demande (nombre de containers, date souhaitée) → le fournisseur répond avec le plan de chargement et les dates réelles.
 */
export interface BookingRequest {
  requestedAt: string;
  requestedBy: string;
  containers: number;
  dateWanted: ISODate;
  note?: string;
  reminders: string[];
  answeredAt?: string;
  answeredBy?: string;
  loadingDate?: ISODate;
  etd?: ISODate;
  eta?: ISODate;
  carrier?: string;
  bookingNo?: string;
  supplierNote?: string;
}

export type ContainerStatus = 'a_booker' | 'booking_demande' | 'booke' | 'en_transit' | 'arrive';
export const CONTAINER_STATUSES: ContainerStatus[] = ['a_booker', 'booking_demande', 'booke', 'en_transit', 'arrive'];

export interface Allocation {
  proformaId: string;
  productId: string;
  qty: number;
}

export interface Container {
  id: string; // référence interne PLAN-031
  number?: string; // MSCU7845216
  bookingNo?: string;
  seal?: string;
  type: '40HC' | '40' | '20';
  status: ContainerStatus;
  supplierId: string;
  carrier?: string;
  /** Transitaire (commissionnaire de transport) qui gère le booking et le dédouanement */
  forwarder?: Forwarder;
  /** Suivi du booking : demande au transitaire, relances, confirmation */
  booking?: BookingInfo;
  /** Date de chargement : proposée par JONAS, validée (ou changée) par le fournisseur */
  loading?: LoadingDate;
  portFrom: string;
  portTo: string;
  etdPlanned: ISODate;
  etdReal?: ISODate;
  etaPlanned: ISODate;
  etaRevised?: ISODate;
  etaReal?: ISODate;
  receivedOn?: ISODate;
  /** Contrôle de réception : quantités reçues ligne à ligne, écarts, réserves */
  reception?: Reception;
  warehouse: string;
  planValidated: boolean;
  /** JONAS a demandé un plan de chargement au fournisseur */
  planRequested?: boolean;
  /** Le fournisseur a modifié le plan, en attente de validation JONAS */
  planProposed?: boolean;
  /** Qui a validé le plan : le fournisseur tel quel, ou JONAS (après modifications) */
  planValidatedBy?: 'fournisseur' | 'jonas';
  /** Le fournisseur a touché au plan (il ne peut plus le valider « tel quel ») */
  planEdited?: boolean;
  allocations: Allocation[];
  documents: string[];
  dateHistory: HistoryEntry[];
}

export interface BookingInfo {
  requestedAt?: string;
  requestedBy?: string;
  /** Départ souhaité indiqué dans la demande */
  etdWanted?: ISODate;
  /** Horodatages des relances envoyées au transitaire */
  reminders: string[];
  confirmedAt?: string;
  vessel?: string;
  /** Date limite de livraison du conteneur au terminal */
  cutoff?: ISODate;
}

export type Forwarder = 'Logfret' | 'Kuehne + Nagel';
export const FORWARDERS: Forwarder[] = ['Logfret', 'Kuehne + Nagel'];

export const CONTAINER_CAPACITY: Record<Container['type'], number> = {
  '40HC': 69,
  '40': 59,
  '20': 28,
};

// ---- Utilisateurs & rôles ----------------------------------------------------

export type Role = 'pilote' | 'acheteur' | 'designer' | 'validateur' | 'direction' | 'finance' | 'logistique' | 'fournisseur';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  /** Étape du circuit de validation pack que cet utilisateur signe */
  validationStep?: ValidationStep;
  /** Nom du designer (rattachement des packs) */
  designerName?: string;
  /** Pour les comptes du portail fournisseur */
  supplierId?: string;
  active: boolean;
}

export interface ReceptionLine {
  proformaId: string;
  productId: string;
  expected: number;
  received: number;
}
export interface Reception {
  at: string;
  by: string;
  lines: ReceptionLine[];
  note?: string;
}

export type Currency = 'EUR' | 'USD' | 'CNY';

/** Paramètres de pilotage */
export interface Settings {
  /** Capacité par défaut d'un designer (packs / semaine) */
  defaultCapacity: number;
  /** Capacité propre à un designer */
  capacity: Record<string, number>;
  /** Cours de change : 1 unité = x € */
  fx: Record<Currency, number>;
}

/** Entrée du journal d'activité */
export interface JournalEntry {
  id: number;
  at: string;
  user: string;
  role: string;
  type: string;
  /** Objet concerné : proforma, produit, conteneur, utilisateur */
  target?: string;
  text: string;
}

/** Date de chargement d'un conteneur : la demande de container à la compagnie ne part qu'une fois validée par le fournisseur */
export interface LoadingDate {
  date: ISODate;
  status: 'proposed' | 'validated';
  proposedAt?: string;
  proposedBy?: string;
  /** Date initialement proposée par JONAS, si le fournisseur en a donné une autre */
  initialDate?: ISODate;
  validatedAt?: string;
}
