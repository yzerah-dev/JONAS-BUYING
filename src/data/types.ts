// Modèle de données JONAS BUYING.
// Principe : une information saisie une fois est réutilisée partout (références par id).

export type ISODate = string; // 'YYYY-MM-DD'

export interface Contact {
  name: string;
  role: string;
  phone: string;
  email: string;
  wechat?: string;
  /** Reçoit les e-mails automatiques de JONAS BUYING (par défaut : oui s'il a une adresse) */
  mail?: boolean;
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
  /** Devise et conditions de paiement du fournisseur : reprises par chaque nouvelle proforma */
  terms?: SupplierTerms;
  /** Logo déposé par le fournisseur (portail) ou par JONAS : affiché à la place du monogramme */
  logo?: ProductPhoto;
  /** Tous les contacts (le premier = contact principal, repris dans « contact ») */
  contacts?: Contact[];
  /** Langue des e-mails (avec l'anglais) : chinois, français ou anglais seul */
  lang?: 'zh' | 'fr' | 'en';
}

/** Photo d'un produit : fichier dans le stockage (navigateur + bucket « files ») */
export interface ProductPhoto {
  fileId: string;
  mime: string;
}

export interface SupplierTerms {
  currency: Currency;
  /** Acompte à la commande (% du montant) */
  depositPct: number;
  /** Solde payé N jours après le départ (contre copie du BL) */
  balanceDays: number;
}

export interface Brand {
  id: string;
  name: string;
  tagline: string; // ex. PARIS
}

/** Circuit de validation du pack : un pack uploadé part directement chez la Direction, puis Moinard, puis le fournisseur */
export type ValidationStep = 'direction' | 'moinard' | 'fournisseur';
export const VALIDATION_STEPS: ValidationStep[] = ['direction', 'moinard', 'fournisseur'];
export const VALIDATION_LABELS: Record<ValidationStep, string> = {
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
  /** Fichiers uploadés : brief, die cut, ancien pack, pack (versions), dossier pack, fiches qualité */
  files?: PackFile[];
  /** Brief marketing pour le designer */
  brief?: string;
  /** Demande de nouveau pack (Direction, acheteur) : l'ancien pack passe en « ancien pack », le circuit repart à zéro */
  newRequest?: { at: string; by: string; reason: string };
  /** Dernier refus : demande de modification écrite par le valideur (pour la version `version` du pack) */
  rejection?: { at: string; by: string; step: string; reason: string; version: number };
}

/**
 * Rubriques de l'espace pack :
 * brief (photos d'inspiration), diecut, oldpack (ancien pack), pack (versions du designer),
 * crea (dossier pack du designer), quality (MSDS, fiche composition…)
 */
export type PackFileKind = 'brief' | 'diecut' | 'oldpack' | 'pack' | 'crea' | 'quality';

export interface PackFile {
  id: string; // clé du contenu dans le stockage de fichiers
  kind: PackFileKind;
  /** Fiches qualité : type de document (MSDS, fiche composition…) */
  docType?: string;
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

export const DEV_STAGES = ['Brief & idée', 'Design & concept', 'Échantillon', 'Validation', 'Prix & sourcing', 'Lancement', 'Production'] as const;

/** Modification d'une fiche produit (formulaire de la fiche ou import Excel) : seuls les champs présents changent */
export interface ProductPatch {
  ref?: string;
  ean?: string;
  supplierRef?: string;
  name?: string;
  brandId?: string;
  supplierId?: string;
  rayon?: string;
  collection?: string;
  gender?: string;
  material?: string;
  sizes?: string;
  paSupplier?: { price: number; currency: Currency };
  packType?: string;
  designer?: string;
  artworkDeadline?: ISODate;
  devStage?: number;
  devDeadline?: ISODate;
  nextAction?: string;
  targetQty?: number;
  pcb?: number;
  weight?: number;
  cbmCarton?: number;
  description?: { en?: string; fr?: string };
}

export interface Product {
  id: string;
  /** Référence JONAS */
  ref: string;
  /** Code-barres EAN-13 JONAS */
  ean: string;
  /** Produit créé depuis le portail fournisseur : réf. et EAN JONAS attribués par JONAS à la signature (codes lus sur le document, à vérifier) */
  codesPending?: { ref?: string; ean?: string };
  /** Référence de l'article chez le fournisseur (lue sur sa proforma) */
  supplierRef?: string;
  name: string;
  brandId: string;
  supplierId: string;
  rayon: string;
  collection: string;
  gender: string;
  material: string;
  sizes?: string;
  emoji: string;
  /** Photo principale du produit (stockage des fichiers) ; à défaut, le pictogramme */
  photo?: ProductPhoto;
  /** Autres photos (galerie : dos, détail, packaging…) */
  photos?: ProductPhoto[];
  /** Prix d'achat dans la devise du fournisseur, tel que sur la proforma (jamais converti) */
  paSupplier?: { price: number; currency: Currency; /** Proforma d'où vient le prix (sinon saisi sur la fiche) */ from?: string };
  /** Description : anglais tel que reçu du fournisseur, français retravaillé par JONAS */
  description?: { en?: string; fr?: string };
  tint: string;
  pa: number; // prix d'achat unitaire €
  pcb: number; // pièces par carton
  cbmCarton: number; // m³ par carton
  weight: number; // kg / pièce
  /** Développé : calculé (pack validé par les 3 + proforma signée, ou étape ≥ Lancement) ou forcé à la main */
  developed: boolean;
  /** « Marquer développé » à la main (reste développé quoi qu'il arrive) */
  devForced?: boolean;
  /** Avis d'étiquetage (normes françaises / UE) rédigé par Claude d'après la photo et la fiche */
  labelAdvice?: LabelAdvice;
  /** Contrôle réglementaire du pack déposé (dernière version) par Claude */
  packCheck?: PackCheck;
  /** Discussion JONAS ↔ fournisseur sur ce produit (comme une conversation WhatsApp) */
  chat?: ChatMessage[];
  /** Dernière lecture de la discussion, côté JONAS et côté fournisseur */
  chatRead?: { jonas?: string; fournisseur?: string };
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

/** Produit annulé sur une proforma pas encore signée : retiré des lignes (totaux, conteneurs, packs), gardé pour la trace */
export interface CancelledLine extends ProformaLine {
  at: string;
  by: string;
  reason?: string;
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
  /**
   * Proforma déposée par le fournisseur, version par version.
   * v1 : signée par JONAS (signature + tampon + date + date d'expédition demandée).
   * v2+ : demande de modification du fournisseur, signée par la Direction ; elle annule la version signée précédente.
   */
  versions?: ProformaDoc[];
  /** Commande passée par JONAS, en attente de la proforma du fournisseur */
  order?: PurchaseOrder;
  /**
   * Expéditions : une proforma peut partir en plusieurs fois (problème usine, priorité JONAS).
   * Chaque expédition est un dossier (Exp. 1 = la proforma d'origine, Exp. 2 = PF-…-2, etc.)
   * avec ses lignes, ses conteneurs, son booking et son paiement au prorata.
   */
  split?: {
    root: string;
    part: number;
    /** Reliquat : date d'expédition prévue avant la séparation (pour mesurer le retard) et motif */
    etdInitial?: ISODate;
    reason?: string;
  };
  /** Demande d'expédition partielle, à accepter par l'autre partie (fournisseur ou JONAS) */
  splitRequest?: SplitRequest;
  history: HistoryEntry[];
  /** Solde dû N jours après le départ (conditions du fournisseur à la création) : recalculé sur le départ réel */
  balanceDays?: number;
  /** Copies des virements (acompte, solde) déposées par JONAS : visibles et téléchargeables par le fournisseur */
  depositProof?: StoredFile;
  balanceProof?: StoredFile;
  /** Proforma annulée : gardée (onglet « Annulées »), sortie de toutes les listes, rétablissable */
  cancelled?: { at: string; by: string; reason: string };
  /** Produits annulés avant la signature : affichés « ANNULÉ » sur la proforma, rétablissables tant qu'elle n'est pas signée */
  cancelledLines?: CancelledLine[];
  /** Demande de booking envoyée au fournisseur, et sa réponse (plan + dates réelles) */
  booking?: BookingRequest;
}

/**
 * Booking d'une proforma :
 * 1. JONAS demande (nombre de containers, date souhaitée) et choisit le transitaire ;
 * 2. le fournisseur prend en compte : plan de chargement, date de marchandise prête ;
 * 3. le transitaire fait sa proposition (compagnie, n°, navire, dates). S'il ne passe pas par l'appli, le fournisseur la saisit pour lui ;
 * 4. le fournisseur et JONAS acceptent : booké. Un refus renvoie la demande au transitaire.
 */
export interface BookingRequest {
  requestedAt: string;
  requestedBy: string;
  containers: number;
  dateWanted: ISODate;
  note?: string;
  reminders: string[];
  /** Prise en compte par le fournisseur */
  ackAt?: string;
  ackBy?: string;
  /** Date à partir de laquelle la marchandise est prête */
  readyDate?: ISODate;
  /** Transitaire choisi par JONAS */
  forwarder?: Forwarder;
  ackNote?: string;
  /** Proposition du transitaire, en attente d'acceptation fournisseur + JONAS */
  proposal?: BookingProposal;
  /** Propositions refusées (historique) */
  rejections?: BookingRejection[];
  /** Booking effectué (proposition acceptée par les deux) */
  answeredAt?: string;
  answeredBy?: string;
  /** Qui a saisi le booking : le transitaire, ou le fournisseur pour lui */
  bookedBy?: 'transitaire' | 'fournisseur' | 'jonas';
  loadingDate?: ISODate;
  etd?: ISODate;
  eta?: ISODate;
  carrier?: string;
  bookingNo?: string;
  vessel?: string;
  cutoff?: ISODate;
  supplierNote?: string;
}

export interface PurchaseOrder {
  at: string;
  by: string;
  /** Articles saisis, importés d'un Excel ou d'un bon de commande (PDF TCI) */
  source: 'saisie' | 'excel' | 'bc' | 'ia' | 'panier';
  /** Fichier importé (Excel ou bon de commande), téléchargeable par le fournisseur */
  file?: { fileId: string; name: string; size: number; mime: string };
}

export interface SplitRequest {
  at: string;
  by: string;
  /** Qui demande : le fournisseur (problème usine) ou JONAS (priorité) ; l'autre partie accepte */
  side: 'fournisseur' | 'jonas';
  reason: string;
  /** Quantités qui partent maintenant, par produit (le reste = reliquat) */
  lines: { productId: string; qtyNow: number }[];
  /** Date d'expédition prévue du reliquat */
  etdLater: ISODate;
}

export type ProformaDocStatus = 'a_signer' | 'signee' | 'annulee' | 'refusee' | 'remplacee';

export interface ProformaDoc {
  version: number;
  /** Clé du fichier dans le stockage (absent du stockage pour les données de démo : PDF régénéré) */
  fileId: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  uploadedBy: string;
  /** Motif de la demande de modification (v2+) */
  reason?: string;
  status: ProformaDocStatus;
  signature?: ProformaSignature;
  /** Annulée par la version n (signée le …) */
  cancelledBy?: { version: number; at: string };
  /** Refus de la demande de modification */
  refused?: { at: string; by: string; reason: string };
  /** Lignes lues sur le document (appliquées au dépôt pour la v1, à la signature pour une modification) */
  lines?: ProformaLine[];
}

/** Ligne de proforma à enregistrer : un produit existant, ou un produit à créer (lu sur la proforma) */
/** Avis d'étiquetage d'un produit : mentions, pictogrammes et avertissements attendus en France */
export interface LabelAdvice {
  at: string;
  by: string;
  /** Avec photo (true) ou d'après la fiche seule */
  withPhoto: boolean;
  /** Ce que Claude voit / comprend du produit */
  product: string;
  category: string;
  summary: string;
  /** Textes applicables (ex. « Règlement (CE) 1935/2004 – contact alimentaire ») */
  regulations: { name: string; why: string }[];
  /** Mentions à porter sur le pack ou l'étiquette */
  mentions: { text: string; detail: string; required: boolean }[];
  /** Pictogrammes et marquages (CE, Triman, verre-fourchette…) */
  pictos: { name: string; detail: string; required: boolean }[];
  /** Avertissements (ex. « Ne convient pas aux enfants de moins de 36 mois ») */
  warnings: string[];
  /** Points à vérifier auprès du fournisseur ou du laboratoire */
  checks: string[];
}

/** Contrôle du visuel de pack par rapport aux règles d'étiquetage */
export interface PackCheck {
  at: string;
  by: string;
  /** Version du pack contrôlée et fichiers lus */
  version: number;
  files: string[];
  verdict: 'conforme' | 'a_corriger' | 'non_conforme';
  summary: string;
  checks: { item: string; status: 'ok' | 'manquant' | 'a_corriger' | 'a_verifier'; detail: string }[];
  /** Fautes ou textes à reprendre : texte vu → correction */
  texts: { found: string; fix: string }[];
}

/** Message de la discussion d'un produit */
export interface ChatMessage {
  id: string;
  at: string;
  /** Nom de l'auteur et son côté */
  by: string;
  side: 'jonas' | 'fournisseur';
  text: string;
  /** Pièce jointe (photo, PDF…) dans le stockage de fichiers (anciens messages : une seule) */
  file?: { fileId: string; name: string; size: number; type: string };
  /** Pièces jointes (plusieurs par message, avec ou sans texte) */
  files?: { fileId: string; name: string; size: number; type: string }[];
  /** Traductions par Claude (fr, en, zh) : un message de JONAS arrive dans la langue du fournisseur */
  tr?: Partial<Record<'fr' | 'en' | 'zh', string>>;
}

export interface ImportLine {
  productId?: string;
  /** Nouveau produit : la référence JONAS et l'EAN JONAS sont attribués à la création */
  /** ref / ean : référence et EAN JONAS déjà portés par la proforma (colonne « buyer », code-barres au préfixe GS1 JONAS) */
  newProduct?: {
    supplierRef?: string;
    ref?: string;
    ean?: string;
    name: string;
    pcb: number;
    cbmCarton: number;
    /** Marque et designer choisis à la commande (sinon « À définir » / « À attribuer ») */ brandId?: string;
    designer?: string;
  };
  qty: number;
  price: number;
  /** Photo lue sur la proforma (image d'un Excel) : celle du nouveau produit, ou d'un produit existant qui n'en a pas */
  photo?: ProductPhoto;
}

export interface ProformaSignature {
  at: string;
  by: string;
  /** Fonction du signataire (ex. « Direction ») */
  role: string;
  date: ISODate;
  /** Date d'expédition demandée par JONAS, portée sur le tampon */
  etdWanted: ISODate;
  /** Version signée précédente que celle-ci annule et remplace */
  replaces?: number;
}

export interface BookingProposal {
  at: string;
  by: string;
  /** Saisie par le transitaire, ou par le fournisseur pour lui */
  enteredBy: 'transitaire' | 'fournisseur' | 'jonas';
  carrier: string;
  bookingNo: string;
  vessel?: string;
  cutoff?: ISODate;
  loadingDate: ISODate;
  etd: ISODate;
  eta: ISODate;
  note?: string;
  /** Acceptations : horodatage + nom */
  supplierOk?: { at: string; by: string };
  jonasOk?: { at: string; by: string };
}

export interface BookingRejection {
  at: string;
  by: string;
  side: 'fournisseur' | 'jonas';
  reason: string;
  carrier: string;
  etd: ISODate;
}

export type ContainerStatus = 'a_booker' | 'booking_demande' | 'booke' | 'en_transit' | 'arrive';
export const CONTAINER_STATUSES: ContainerStatus[] = ['a_booker', 'booking_demande', 'booke', 'en_transit', 'arrive'];

export interface Allocation {
  proformaId: string;
  productId: string;
  qty: number;
}

/** Fichier déposé dans le stockage (navigateur + base partagée) */
export interface StoredFile {
  fileId: string;
  name: string;
  size: number;
  type: string;
  at: string;
  by: string;
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
  /** Transitaire : booking confirmé (n° de conteneur, navire, cut-off) */
  fwdConfirmedAt?: string;
  /** Dédouanement à l'arrivée, géré par le transitaire */
  customs?: CustomsStatus;
  /** Rendez-vous de livraison à l'entrepôt */
  deliveryDate?: ISODate;
  /** Le fournisseur a touché au plan (il ne peut plus le valider « tel quel ») */
  planEdited?: boolean;
  allocations: Allocation[];
  documents: string[];
  /** Fichiers réellement déposés (BL, Invoice, Packing List…), par nom de document */
  docFiles?: Record<string, StoredFile>;
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

export type Role = 'pilote' | 'acheteur' | 'designer' | 'validateur' | 'direction' | 'finance' | 'logistique' | 'fournisseur' | 'transitaire';

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
  /** Pour les comptes du portail transitaire */
  forwarder?: Forwarder;
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
  /** Société JONAS : portée sur le tampon des proformas signées */
  company: Company;
  companyRev?: number;
  /** Listes déroulantes de la fiche produit (valeurs proposées) */
  lists?: Partial<Record<ListKey, string[]>>;
}

/** Listes de valeurs de la fiche produit, gérées dans Paramètres */
export type ListKey = 'rayon' | 'collection' | 'gender' | 'material' | 'sizes' | 'packType';

export interface Company {
  name: string;
  /** Rue */
  address: string;
  /** Code postal et ville */
  city: string;
  /** N° de TVA intracommunautaire */
  vat: string;
  /** Préfixe entreprise GS1 des codes-barres EAN-13 JONAS */
  gs1Prefix?: string;
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

export type CustomsStatus = 'en_cours' | 'dedouane';
export const CUSTOMS_LABEL: Record<CustomsStatus, string> = { en_cours: 'Dédouanement en cours', dedouane: 'Dédouané' };
