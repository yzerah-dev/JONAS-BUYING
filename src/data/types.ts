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
  portFrom: string;
  portTo: string;
  etdPlanned: ISODate;
  etdReal?: ISODate;
  etaPlanned: ISODate;
  etaRevised?: ISODate;
  etaReal?: ISODate;
  receivedOn?: ISODate;
  warehouse: string;
  planValidated: boolean;
  /** JONAS a demandé un plan de chargement au fournisseur */
  planRequested?: boolean;
  /** Le fournisseur a proposé son plan, en attente de validation JONAS */
  planProposed?: boolean;
  allocations: Allocation[];
  documents: string[];
  dateHistory: HistoryEntry[];
}

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
