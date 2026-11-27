import { createContext, useContext } from 'react';
import * as seed from './seed';
import type {
  Brand,
  ListKey,
  BookingProposal,
  Currency,
  ImportLine,
  LabelAdvice,
  PackCheck,
  ProformaLine,
  SupplierTerms,
  Company,
  ProformaDoc,
  Container,
  ContainerStatus,
  HistoryEntry,
  ISODate,
  CustomsStatus,
  Product,
  ProductPhoto,
  ProductPatch,
  Proforma,
  Forwarder,
  JournalEntry,
  PackFile,
  PackFileKind,
  ProformaStatus,
  ReceptionLine,
  Settings,
  Role,
  Supplier,
  User,
  ValidationStep,
} from './types';
import { ROLE_DEFS, can, canSee, canValidateStep, isForwarder, isSupplier, type Module, type Perm } from './permissions';
import { addCur, type CurSum } from '../lib/curr';
import { CONTAINER_CAPACITY, DEV_STAGES, VALIDATION_LABELS, VALIDATION_STEPS } from './types';
import { TODAY, addDays, diffDays, parse, weekStart } from '../lib/format';

export interface State {
  suppliers: Supplier[];
  brands: Brand[];
  products: Product[];
  proformas: Proforma[];
  containers: Container[];
  users: User[];
  currentUserId: string;
  settings: Settings;
  journal: JournalEntry[];
  /** Vue seulement (jamais enregistré) : proformas annulées, sorties de « proformas » */
  archived?: Proforma[];
}

/** Préfixe GS1 des EAN JONAS (celui des produits existants) */
const DEFAULT_GS1 = '370157';

export const DEFAULT_SETTINGS: Settings = {
  defaultCapacity: 40,
  capacity: {},
  fx: { EUR: 1, USD: 0.93, CNY: 0.128 },
  company: { name: 'JONAS INTERNATIONAL', address: "189 rue d'Aubervilliers", city: '75018 Paris', vat: 'FR50842235913', gs1Prefix: DEFAULT_GS1 },
};

/** Version de l'adresse société par défaut : une hausse réapplique l'adresse par défaut aux navigateurs existants */
const COMPANY_REV = 2;
/** Champs vides de l'état enregistré : on garde la valeur par défaut */
const withDefaults = (def: Company, saved?: Partial<Company>): Company => ({
  name: saved?.name || def.name,
  address: saved?.address || def.address,
  city: saved?.city || def.city,
  vat: saved?.vat || def.vat,
  gs1Prefix: saved?.gs1Prefix || def.gs1Prefix,
});

export const STORAGE_KEY = 'jonas-buying-state-v19';

export const currentUser = (s: State): User => s.users.find((u) => u.id === s.currentUserId) ?? s.users[0];

function initialState(): State {
  return structuredClone({
    suppliers: seed.suppliers,
    brands: seed.brands,
    products: seed.products,
    proformas: seed.proformas,
    containers: seed.containers,
    users: seed.users,
    currentUserId: 'yzerah',
    settings: DEFAULT_SETTINGS,
    journal: [] as JournalEntry[],
  });
}

/** État au démarrage (démo / navigateur), avec le statut « Développé » recalculé */
export function load(): State {
  return syncDevStatus(loadRaw());
}

function loadRaw(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const st = JSON.parse(raw) as State;
      // Compatibilité : anciens états sans paramètres ni journal
      return {
        ...st,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(st.settings ?? {}),
          company:
            COMPANY_REV > (st.settings?.companyRev ?? 0)
              ? { ...DEFAULT_SETTINGS.company, vat: st.settings?.company?.vat || DEFAULT_SETTINGS.company.vat }
              : withDefaults(DEFAULT_SETTINGS.company, st.settings?.company),
          companyRev: COMPANY_REV,
        },
        journal: st.journal ?? [],
      };
    }
  } catch {
    /* stockage indisponible */
  }
  return initialState();
}

export type Action =
  | { type: 'reset' }
  | { type: 'login'; userId: string }
  | { type: 'setUserRole'; userId: string; role: Role; validationStep?: ValidationStep | null }
  | { type: 'toggleUser'; userId: string }
  | { type: 'requestPlan'; containerId: string }
  | { type: 'proposePlan'; containerId: string }
  | { type: 'addContainerDoc'; containerId: string; doc: string; file?: { fileId: string; name: string; size: number; type: string } }
  | { type: 'setContainerNumber'; containerId: string; number: string; seal?: string }
  | { type: 'setLabelAdvice'; productId: string; advice: LabelAdvice }
  | { type: 'setPackCheck'; productId: string; check: PackCheck }
  | { type: 'signProforma'; id: string; etdWanted: ISODate }
  | {
      type: 'createProforma';
      id: string;
      supplierId: string;
      title: string;
      etd: ISODate;
      eta: ISODate;
      lines: ImportLine[];
      /** Commande JONAS : origine des articles et fichier importé */
      order?: { source: 'saisie' | 'excel' | 'bc' | 'ia' | 'panier'; file?: { fileId: string; name: string; size: number; mime: string } };
      /** Proforma déposée par le fournisseur (obligatoire côté fournisseur) */
      file?: { fileId: string; name: string; size: number; mime: string };
    }
  | { type: 'setSupplierTerms'; supplierId: string; terms: SupplierTerms }
  | { type: 'setSupplierLogo'; supplierId: string; logo: ProductPhoto | null }
  | { type: 'logSupplierMail'; supplierId: string; proformaId?: string; subject: string; to: string[]; ok: boolean; demo?: boolean }
  | { type: 'addSupplier'; supplier: Supplier }
  | { type: 'updateSupplier'; supplier: Supplier }
  | { type: 'cancelOrder'; id: string }
  | { type: 'cancelProforma'; id: string; reason: string }
  | { type: 'restoreProforma'; id: string }
  /** Annuler un produit d'une proforma pas encore signée (et le rétablir) */
  | { type: 'cancelLine'; id: string; productId: string; reason?: string }
  | { type: 'restoreLine'; id: string; productId: string }
  | { type: 'deleteProforma'; id: string }
  | { type: 'requestSplit'; id: string; lines: { productId: string; qtyNow: number }[]; etdLater: ISODate; reason: string }
  | { type: 'acceptSplit'; id: string }
  | { type: 'refuseSplit'; id: string; reason?: string }
  | { type: 'uploadProforma'; id: string; fileId: string; name: string; size: number; mime: string; reason?: string; lines?: ImportLine[] }
  | { type: 'refuseProformaVersion'; id: string; reason: string }
  | { type: 'setProformaStatus'; id: string; status: ProformaStatus }
  | { type: 'payDeposit'; id: string }
  | { type: 'payBalance'; id: string }
  | { type: 'validatePack'; productId: string }
  | { type: 'rejectPack'; productId: string; /** Demande de modification écrite */ reason?: string }
  | { type: 'requestDieCut'; productId: string }
  | { type: 'receiveDieCut'; productId: string }
  | { type: 'uploadArtwork'; productId: string }
  | { type: 'forwardPack'; productId: string }
  | { type: 'allocate'; containerId: string; proformaId: string; productId: string; qty: number }
  | { type: 'deallocate'; containerId: string; proformaId: string; productId: string }
  | { type: 'deleteContainer'; containerId: string }
  | { type: 'setProformaEtd'; id: string; etd: ISODate }
  | { type: 'setPaymentProof'; id: string; kind: 'deposit' | 'balance'; file: { fileId: string; name: string; size: number; type: string } }
  | { type: 'setAllocationQty'; containerId: string; proformaId: string; productId: string; qty: number }
  | { type: 'createContainer'; supplierId: string; etd: ISODate; eta: ISODate }
  | { type: 'autoLoad'; proformaId: string }
  | { type: 'requestPfBooking'; proformaId: string; containers: number; dateWanted: ISODate; forwarder: Forwarder; note?: string }
  | { type: 'remindPfBooking'; proformaId: string }
  | { type: 'cancelPfBooking'; proformaId: string }
  | { type: 'ackPfBooking'; proformaId: string; readyDate: ISODate; note?: string }
  | { type: 'acceptPfBooking'; proformaId: string }
  | { type: 'rejectPfBooking'; proformaId: string; reason: string }
  | {
      type: 'proposePfBooking';
      proformaId: string;
      loadingDate: ISODate;
      etd: ISODate;
      eta: ISODate;
      carrier: string;
      bookingNo: string;
      vessel?: string;
      cutoff?: ISODate;
      note?: string;
    }
  | { type: 'validatePlan'; containerId: string }
  | { type: 'acceptPlan'; containerId: string }
  | { type: 'proposeLoadingDate'; containerId: string; date: ISODate }
  | { type: 'answerLoadingDate'; containerId: string; date: ISODate }
  | { type: 'requestBooking'; containerId: string; forwarder?: Forwarder; etdWanted?: ISODate }
  | { type: 'confirmBooking'; containerId: string; bookingNo?: string; carrier?: string; vessel?: string; cutoff?: ISODate; etd?: ISODate }
  | { type: 'remindBooking'; containerId: string }
  | { type: 'cancelBooking'; containerId: string }
  | { type: 'ship'; containerId: string }
  | { type: 'receive'; containerId: string; lines?: ReceptionLine[]; note?: string }
  | { type: 'reviseEta'; containerId: string; eta: ISODate }
  | { type: 'fwdConfirm'; containerId: string; number: string; seal?: string; vessel: string; cutoff?: ISODate; etd: ISODate }
  | { type: 'setCustoms'; containerId: string; status: CustomsStatus }
  | { type: 'portArrival'; containerId: string }
  | { type: 'planDelivery'; containerId: string; date: ISODate }
  | { type: 'advanceDev'; productId: string }
  | { type: 'toggleUrgent'; productId: string }
  | { type: 'setProductPhoto'; productId: string; photo: ProductPhoto | null }
  /** Galerie complète d'un produit : la première photo est la principale */
  | { type: 'setProductPhotos'; productId: string; photos: ProductPhoto[] }
  /** Import de photos en lot : ajoutées à la galerie de chaque produit (principale si le produit n'en a pas) */
  | { type: 'addProductPhotos'; items: { productId: string; photos: ProductPhoto[] }[] }
  /** Désignation (français, courte) et description (anglais du fournisseur / français JONAS) */
  | { type: 'setProductText'; productId: string; name: string; description: { en?: string; fr?: string } }
  /** Fiches produit modifiées (formulaire ou import Excel) ; marques créées au passage */
  | { type: 'setList'; key: ListKey; values: string[] }
  | { type: 'setBrands'; brands: Brand[] }
  /** Renomme une valeur de liste partout (liste et produits qui l'utilisent) ; vers une valeur existante : fusion */
  | { type: 'renameListValue'; key: ListKey; from: string; to: string }
  | { type: 'updateProducts'; items: { productId: string; patch: ProductPatch }[]; brands?: Brand[]; source?: 'fiche' | 'excel' }
  | { type: 'markDeveloped'; productId: string }
  | { type: 'reassignPack'; productId: string; designer?: string; weekOf?: ISODate; /** date de rendu exacte */ deadline?: ISODate }
  | { type: 'startPack'; productId: string }
  | { type: 'planPack'; productId: string; date: ISODate | null }
  | { type: 'setPackBrief'; productId: string; brief: string }
  | { type: 'requestNewPack'; productId: string; reason: string }
  | { type: 'addPackFiles'; productId: string; kind: PackFileKind; files: Omit<PackFile, 'kind' | 'version' | 'uploadedAt' | 'uploadedBy'>[] }
  | { type: 'removePackFile'; productId: string; fileId: string }
  | { type: 'setCapacity'; designer: string; capacity: number | null }
  | { type: 'setDefaultCapacity'; capacity: number }
  | { type: 'setCompany'; company: Company }
  | { type: 'setFx'; currency: 'USD' | 'CNY'; rate: number }
  | { type: 'setProformaCurrency'; id: string; currency: 'EUR' | 'USD' | 'CNY' }
  | { type: 'setForwarder'; containerId: string; forwarder: Forwarder };

/** Horodatage de démo : date du jour de l'application + heure réelle */
const nowStamp = () => `${TODAY}T${new Date().toTimeString().slice(0, 5)}`;

const hist = (user: string, text: string): HistoryEntry => ({ date: TODAY, user, text });

function mapP(s: State, id: string, f: (p: Product) => Product): State {
  return { ...s, products: s.products.map((p) => (p.id === id ? f(p) : p)) };
}
function mapPF(s: State, id: string, f: (p: Proforma) => Proforma): State {
  return { ...s, proformas: s.proformas.map((p) => (p.id === id ? f(p) : p)) };
}
function mapC(s: State, id: string, f: (c: Container) => Container): State {
  return { ...s, containers: s.containers.map((c) => (c.id === id ? f(c) : c)) };
}

/** Met à jour le statut des proformas d'après leurs conteneurs (une saisie → partout). */
function syncProformaStatuses(s: State): State {
  const order: ContainerStatus[] = ['a_booker', 'booking_demande', 'booke', 'en_transit', 'arrive'];
  const map: Partial<Record<ContainerStatus, ProformaStatus>> = { booke: 'booke', en_transit: 'en_transit', arrive: 'arrive' };
  return {
    ...s,
    proformas: s.proformas.map((pf) => {
      const cs = s.containers.filter((c) => c.allocations.some((a) => a.proformaId === pf.id));
      if (!cs.length) return pf;
      // statut = le moins avancé des conteneurs, si tout est affecté
      const fullyAllocated = pf.lines.every((l) => allocatedQty(s, pf.id, l.productId) >= l.qty);
      if (!fullyAllocated) return pf;
      const min = cs.map((c) => order.indexOf(c.status)).reduce((a, b) => Math.min(a, b), 99);
      const next = map[order[min]];
      if (next && next !== pf.status) {
        return { ...pf, status: next, history: [...pf.history, hist('Système', `Statut → ${PROFORMA_STATUS_LABEL[next]}`)] };
      }
      return pf;
    }),
  };
}

// ---------------------------------------------------------------------------
// Contrôle des droits : chaque action est vérifiée ici, quelle que soit l'interface.

const ACTION_PERM: Partial<Record<Action['type'], Perm>> = {
  signProforma: 'proforma.sign',
  setProformaStatus: 'proforma.edit',
  payDeposit: 'finance.pay',
  payBalance: 'finance.pay',
  requestDieCut: 'pack.design',
  uploadArtwork: 'pack.design',
  forwardPack: 'pack.design',
  requestPlan: 'logistics.plan',
  proposeLoadingDate: 'logistics.booking',
  confirmBooking: 'logistics.booking',
  ship: 'logistics.booking',
  receive: 'logistics.booking',
  reviseEta: 'logistics.booking',
  advanceDev: 'dev.advance',
  toggleUrgent: 'dev.advance',
  markDeveloped: 'dev.advance',
  reassignPack: 'pack.assign',
  setUserRole: 'users.manage',
  setCapacity: 'users.manage',
  setDefaultCapacity: 'users.manage',
  setFx: 'finance.pay',
  setCompany: 'proforma.sign',
  setProformaCurrency: 'proforma.edit',
  setForwarder: 'logistics.plan',
  remindBooking: 'logistics.booking',
  cancelBooking: 'logistics.booking',
  toggleUser: 'users.manage',
};

/** Conteneur modifiable par un fournisseur : le sien, pas encore booké, plan non validé */
function supplierOwnsOpenContainer(s: State, u: User, containerId: string) {
  const c = s.containers.find((x) => x.id === containerId);
  return !!c && c.supplierId === u.supplierId && OPEN_STATUSES.includes(c.status) && !c.planValidated;
}
/** Le plan de chargement suit son propre circuit, en parallèle de la demande de container */
const OPEN_STATUSES: Container['status'][] = ['a_booker', 'booking_demande', 'booke'];

export function isAllowed(s: State, a: Action): boolean {
  const u = currentUser(s);
  switch (a.type) {
    case 'reset':
    case 'login':
      return true;
    case 'validatePack': {
      const p = s.products.find((x) => x.id === a.productId);
      if (!p) return false;
      const step = VALIDATION_STEPS.find((st) => p.pack.validations[st].state !== 'done');
      if (!step || !canValidateStep(u, step)) return false;
      return step !== 'fournisseur' || u.role === 'pilote' || (p.supplierId === u.supplierId && p.pack.sentToSupplier);
    }
    case 'rejectPack': {
      const p = s.products.find((x) => x.id === a.productId);
      if (!p) return false;
      if (isSupplier(u)) return p.supplierId === u.supplierId && p.pack.validations.fournisseur.state === 'pending' && p.pack.sentToSupplier;
      return can(u, 'pack.reject');
    }
    case 'setProductPhoto':
    case 'setProductPhotos':
      return canEditPhotos(s, u, a.productId);
    case 'addProductPhotos':
      return a.items.length > 0 && a.items.every((i) => canEditPhotos(s, u, i.productId));
    case 'setProductText':
      return !!a.name.trim() && canEditProduct(u) && s.products.some((p) => p.id === a.productId);
    case 'updateProducts':
      return canEditProduct(u) && a.items.length > 0 && !productPatchErrors(s, a.items, a.brands).length;
    case 'setList':
      return canEditProduct(u);
    case 'renameListValue':
      return canEditProduct(u) && !!a.from.trim() && !!a.to.trim();
    case 'setBrands':
      // Une marque utilisée par un produit ne peut pas être retirée
      return (
        canEditProduct(u) &&
        a.brands.every((b) => b.id && b.name.trim()) &&
        s.products.every((p) => p.brandId === 'jonas' || a.brands.some((b) => b.id === p.brandId) || !s.brands.some((b) => b.id === p.brandId))
      );
    case 'addPackFiles':
      return canPackFiles(s, u, a.productId, a.kind);
    case 'removePackFile': {
      const p = s.products.find((x) => x.id === a.productId);
      const f = p?.pack.files?.find((x) => x.id === a.fileId);
      // Pack validé par tout le monde : pack, die cut et documents ne se suppriment plus
      return !!p && !!f && canPackFiles(s, u, a.productId, f.kind) && !packFileLocked(p, f.kind);
    }
    case 'requestNewPack':
      return !!a.reason.trim() && canRequestNewPack(u) && s.products.some((x) => x.id === a.productId);
    case 'setPackBrief':
      return canEditProduct(u) && s.products.some((x) => x.id === a.productId);
    case 'startPack':
    case 'planPack': {
      // Le designer du pack (ou le Pilote) annonce son démarrage ; la semaine de réalisation se planifie aussi par l'achat et la Direction
      const p = s.products.find((x) => x.id === a.productId);
      if (a.type === 'planPack' && !!p && can(u, 'pack.assign')) return true;
      return !!p && (u.role === 'pilote' || (u.role === 'designer' && u.designerName === p.pack.designer));
    }
    case 'receiveDieCut': {
      const p = s.products.find((x) => x.id === a.productId);
      if (isSupplier(u)) return !!p && p.supplierId === u.supplierId;
      return can(u, 'pack.design');
    }
    case 'setProformaEtd': {
      const pf = s.proformas.find((x) => x.id === a.id);
      return (
        !!pf &&
        !!a.etd &&
        a.etd !== pf.etd &&
        !isSupplier(u) &&
        pf.status !== 'en_transit' &&
        pf.status !== 'arrive' &&
        (can(u, 'proforma.edit') || can(u, 'proforma.sign') || can(u, 'logistics.plan'))
      );
    }
    case 'setPaymentProof':
      return !isSupplier(u) && (can(u, 'finance.pay') || can(u, 'proforma.sign')) && s.proformas.some((p) => p.id === a.id);
    case 'deleteContainer': {
      // Supprimer un conteneur prévisionnel : tant qu'il n'est pas booké (ses quantités redeviennent « à affecter »)
      const c = s.containers.find((x) => x.id === a.containerId);
      if (!c || !['a_booker', 'booking_demande'].includes(c.status) || c.bookingNo || c.planValidated) return false;
      if (isSupplier(u)) return c.supplierId === u.supplierId;
      return can(u, 'logistics.plan');
    }
    case 'setAllocationQty':
      if (!Number.isInteger(a.qty) || a.qty <= 0 || a.qty > maxAllocQty(s, a.containerId, a.proformaId, a.productId)) return false;
      if (isSupplier(u)) return supplierOwnsOpenContainer(s, u, a.containerId);
      return can(u, 'logistics.plan');
    case 'allocate':
    case 'deallocate':
      if (isSupplier(u)) return supplierOwnsOpenContainer(s, u, a.containerId);
      return can(u, 'logistics.plan');
    case 'proposePlan':
      return isSupplier(u) ? supplierOwnsOpenContainer(s, u, a.containerId) : false;
    case 'createContainer':
      return isSupplier(u) ? a.supplierId === u.supplierId : can(u, 'logistics.plan');
    case 'autoLoad': {
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      if (!pf) return false;
      if (isSupplier(u)) return pf.supplierId === u.supplierId && bookingOpen(pf) && !pf.booking!.ackAt;
      return can(u, 'logistics.plan');
    }
    case 'requestPfBooking': {
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      // Logistique et acheteurs peuvent demander le booking d'une proforma
      return canAskBooking(u) && !!pf && canRequestBooking(pf) && a.containers > 0;
    }
    case 'remindPfBooking':
    case 'cancelPfBooking': {
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      return can(u, 'logistics.booking') && !!pf && bookingOpen(pf);
    }
    case 'ackPfBooking': {
      // Le fournisseur prend la demande en compte : il faut un plan (au moins un container chargé)
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      if (!pf || bookingStage(pf) !== 'fournisseur') return false;
      if (!(isSupplier(u) ? pf.supplierId === u.supplierId : u.role === 'pilote')) return false;
      return s.containers.some((c) => c.allocations.some((x) => x.proformaId === pf.id) && ['a_booker', 'booking_demande'].includes(c.status));
    }
    case 'cancelProforma': {
      const pf = allPfs(s).find((x) => x.id === a.id);
      return !!pf && !pf.cancelled && !!a.reason.trim() && canCancelProforma(s, u, pf);
    }
    case 'restoreProforma': {
      const pf = allPfs(s).find((x) => x.id === a.id);
      return !!pf?.cancelled && (can(u, 'proforma.edit') || can(u, 'proforma.sign'));
    }
    case 'cancelLine': {
      // Le dernier produit ne s'annule pas seul : on annule alors la proforma
      const pf = s.proformas.find((x) => x.id === a.id);
      return !!pf && canCancelLines(u, pf) && pf.lines.length > 1 && pf.lines.some((l) => l.productId === a.productId);
    }
    case 'restoreLine': {
      const pf = s.proformas.find((x) => x.id === a.id);
      return !!pf && canCancelLines(u, pf) && !!pf.cancelledLines?.some((l) => l.productId === a.productId) && !pf.lines.some((l) => l.productId === a.productId);
    }
    case 'deleteProforma': {
      const pf = allPfs(s).find((x) => x.id === a.id);
      return !!pf && canDeleteProforma(s, u, pf);
    }
    case 'cancelOrder': {
      // Annuler une commande JONAS tant que le fournisseur n'a rien déposé
      const pf = s.proformas.find((x) => x.id === a.id);
      return !!pf?.order && !pf.versions?.length && pf.status === 'a_signer' && (can(u, 'proforma.edit') || can(u, 'proforma.sign'));
    }
    case 'updateSupplier':
      return (
        canAddSupplier(u) &&
        !!a.supplier.name.trim() &&
        s.suppliers.some((x) => x.id === a.supplier.id) &&
        !s.suppliers.some((x) => x.id !== a.supplier.id && x.name.trim().toLowerCase() === a.supplier.name.trim().toLowerCase())
      );
    case 'addSupplier':
      return canAddSupplier(u) && !!a.supplier.id && !!a.supplier.name.trim() && !s.suppliers.some((x) => x.id === a.supplier.id);
    case 'logSupplierMail':
      return !!u && s.suppliers.some((x) => x.id === a.supplierId);
    case 'setSupplierLogo':
      // Le fournisseur pour sa propre fiche (portail), ou l'équipe achats
      return s.suppliers.some((x) => x.id === a.supplierId) && ((isSupplier(u) && u.supplierId === a.supplierId) || canAddSupplier(u));
    case 'setSupplierTerms':
      return !!s.suppliers.find((x) => x.id === a.supplierId) && (can(u, 'finance.pay') || can(u, 'proforma.sign')) && a.terms.depositPct >= 0 && a.terms.depositPct <= 100 && a.terms.balanceDays >= 0;
    case 'createProforma': {
      // JONAS (acheteurs, Direction) ou le fournisseur, qui joint alors sa proforma
      if (s.proformas.some((p) => p.id === a.id)) return false;
      if (!a.title.trim() || !a.etd || !importLinesOk(s, a.supplierId, a.lines)) return false;
      if (isSupplier(u)) return a.supplierId === u.supplierId && !!a.file;
      return can(u, 'proforma.edit') || can(u, 'proforma.sign');
    }
    case 'requestSplit': {
      // Expédition partielle : le fournisseur (problème usine) ou JONAS (priorité) la demande, l'autre l'accepte
      const pf = s.proformas.find((x) => x.id === a.id);
      if (!pf || pf.splitRequest || !['en_dev', 'en_production', 'booke'].includes(pf.status)) return false;
      if (!(isSupplier(u) ? pf.supplierId === u.supplierId : canAskBooking(u) || can(u, 'proforma.sign'))) return false;
      if (!a.reason.trim() || !a.etdLater) return false;
      const ok = pf.lines.every((l) => {
        const now = a.lines.find((x) => x.productId === l.productId)?.qtyNow ?? l.qty;
        return now >= shippedQty(s, pf.id, l.productId) && now <= l.qty;
      });
      const now = pf.lines.reduce((t, l) => t + (a.lines.find((x) => x.productId === l.productId)?.qtyNow ?? l.qty), 0);
      const all = pf.lines.reduce((t, l) => t + l.qty, 0);
      return ok && now > 0 && now < all;
    }
    case 'acceptSplit':
    case 'refuseSplit': {
      const pf = s.proformas.find((x) => x.id === a.id);
      const r = pf?.splitRequest;
      if (!pf || !r) return false;
      const supplierSide = isSupplier(u) && pf.supplierId === u.supplierId;
      const jonasSide = !isSupplier(u) && !isForwarder(u) && (canAskBooking(u) || can(u, 'proforma.sign'));
      if (!supplierSide && !jonasSide) return false;
      // Accepter : l'autre partie (le pilote peut tout) ; refuser / annuler : les deux
      if (a.type === 'refuseSplit') return true;
      return u.role === 'pilote' || (r.side === 'fournisseur' ? jonasSide : supplierSide);
    }
    case 'uploadProforma': {
      // Le fournisseur dépose sa proforma ; une fois signée, une nouvelle version = demande de modification (motif obligatoire)
      const pf = s.proformas.find((x) => x.id === a.id);
      if (!pf || !(isSupplier(u) ? pf.supplierId === u.supplierId : u.role === 'pilote')) return false;
      if (['en_transit', 'arrive'].includes(pf.status) || (pf.split && pf.split.part > 1)) return false;
      if (a.lines && !importLinesOk(s, pf.supplierId, a.lines)) return false;
      return !signedVersion(pf) || !!a.reason?.trim();
    }
    case 'signProforma':
    case 'refuseProformaVersion': {
      // JONAS signe la version déposée ; une modification est signée (ou refusée) par la Direction
      const pf = s.proformas.find((x) => x.id === a.id);
      if (!pf || !pendingVersion(pf) || !can(u, 'proforma.sign')) return false;
      if (a.type === 'refuseProformaVersion') return !!a.reason.trim();
      return !!a.etdWanted;
    }
    case 'acceptPfBooking':
    case 'rejectPfBooking': {
      // La proposition du transitaire est acceptée (ou refusée) par le fournisseur et par JONAS
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      if (!pf || bookingStage(pf) !== 'validation') return false;
      if (a.type === 'rejectPfBooking' && !a.reason.trim()) return false;
      const p = pf.booking!.proposal!;
      if (isSupplier(u)) return pf.supplierId === u.supplierId && (a.type === 'rejectPfBooking' || !p.supplierOk);
      if (isForwarder(u)) return false;
      if (u.role === 'pilote' && a.type === 'acceptPfBooking') return !p.jonasOk || !p.supplierOk;
      return canAskBooking(u) && (a.type === 'rejectPfBooking' || !p.jonasOk);
    }
    case 'proposePfBooking': {
      // Le transitaire fait sa proposition ; s'il ne passe pas par l'appli, le fournisseur la saisit pour lui
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      if (!pf || bookingStage(pf) !== 'transitaire') return false;
      if (isForwarder(u)) {
        if (u.forwarder !== pf.booking!.forwarder) return false;
      } else if (isSupplier(u)) {
        if (pf.supplierId !== u.supplierId) return false;
      } else if (u.role !== 'pilote') return false;
      return s.containers.some((c) => c.allocations.some((x) => x.proformaId === pf.id) && ['a_booker', 'booking_demande'].includes(c.status));
    }
    case 'acceptPlan': {
      // Le fournisseur valide tel quel le plan envoyé par JONAS
      const c = s.containers.find((x) => x.id === a.containerId);
      return isSupplier(u) && supplierOwnsOpenContainer(s, u, a.containerId) && !!c?.planRequested && !c.planProposed && !c.planEdited && c.allocations.length > 0;
    }
    case 'answerLoadingDate': {
      // Le fournisseur confirme la date proposée ou en donne une autre
      const c = s.containers.find((x) => x.id === a.containerId);
      return isSupplier(u) && !!c && c.supplierId === u.supplierId && c.status === 'a_booker' && c.loading?.status === 'proposed';
    }
    case 'requestBooking': {
      // Pas de demande de container à la compagnie sans date de chargement validée par le fournisseur
      const c = s.containers.find((x) => x.id === a.containerId);
      return can(u, 'logistics.booking') && !!c && c.status === 'a_booker' && c.loading?.status === 'validated';
    }
    case 'validatePlan': {
      const c = s.containers.find((x) => x.id === a.containerId);
      return can(u, 'logistics.plan') && !!c && OPEN_STATUSES.includes(c.status) && !c.planValidated;
    }
    case 'setPackCheck':
    case 'setLabelAdvice':
      // Avis d'étiquetage, contrôle du pack : toute l'équipe JONAS (pas les fournisseurs ni les transitaires)
      return !isSupplier(u) && !isForwarder(u) && s.products.some((p) => p.id === a.productId);
    case 'setContainerNumber': {
      // N° de conteneur (4 lettres + 7 chiffres, ex. MSKU1234567) : JONAS, le fournisseur ou le transitaire du conteneur
      const c = s.containers.find((x) => x.id === a.containerId);
      if (!c || !/^[A-Z]{4}\d{7}$/.test(a.number)) return false;
      if (isSupplier(u)) return c.supplierId === u.supplierId;
      if (isForwarder(u)) return forwarderOwns(u, c);
      return can(u, 'logistics.booking') || can(u, 'logistics.plan');
    }
    case 'addContainerDoc': {
      const c = s.containers.find((x) => x.id === a.containerId);
      if (isSupplier(u)) return !!c && c.supplierId === u.supplierId;
      if (isForwarder(u)) return !!c && forwarderOwns(u, c);
      return can(u, 'logistics.booking');
    }
    case 'fwdConfirm':
    case 'ship': {
      const c = s.containers.find((x) => x.id === a.containerId);
      if (!c || c.status !== 'booke') return false;
      if (isForwarder(u)) return forwarderOwns(u, c) && (a.type === 'fwdConfirm' || !!c.fwdConfirmedAt);
      return can(u, 'logistics.booking');
    }
    case 'portArrival': {
      const c = s.containers.find((x) => x.id === a.containerId);
      if (!c || c.status !== 'en_transit' || c.etaReal) return false;
      if (isForwarder(u)) return forwarderOwns(u, c);
      return can(u, 'logistics.booking');
    }
    case 'reviseEta':
    case 'setCustoms':
    case 'planDelivery': {
      const c = s.containers.find((x) => x.id === a.containerId);
      if (!c || !['booke', 'en_transit', 'arrive'].includes(c.status)) return false;
      if (isForwarder(u)) return forwarderOwns(u, c);
      return can(u, 'logistics.booking');
    }
    default: {
      const perm = ACTION_PERM[a.type];
      return perm ? can(u, perm) : false;
    }
  }
}

/** Conteneur suivi par ce transitaire : le sien, une fois booké par le fournisseur */
export const forwarderOwns = (u: User, c: Container) => isForwarder(u) && c.forwarder === u.forwarder && ['booke', 'en_transit', 'arrive'].includes(c.status);

/** Quantité déjà partie (conteneurs en transit ou arrivés) d'une ligne de proforma */
export function shippedQty(s: State, proformaId: string, productId: string) {
  return s.containers
    .filter((c) => ['en_transit', 'arrive'].includes(c.status))
    .reduce((sum, c) => sum + c.allocations.filter((a) => a.proformaId === proformaId && a.productId === productId).reduce((x, a) => x + a.qty, 0), 0);
}
/** Toutes les expéditions d'une proforma (dossier d'origine + reliquats), dans l'ordre */
export function shipmentsOf(s: State, pf: Proforma): Proforma[] {
  const root = pf.split?.root ?? pf.id;
  return s.proformas.filter((p) => p.id === root || p.split?.root === root).sort((a, b) => (a.split?.part ?? 1) - (b.split?.part ?? 1));
}
/** Devise et conditions de paiement d'un fournisseur (par défaut : EUR, 30 % d'acompte, solde à J+7 du départ) */
/** « S05 » : semaine ISO d'une date */
const weekLabelOf = (d: ISODate) => `S${String(isoWeekOf(d)).padStart(2, '0')}`;
function isoWeekOf(iso: ISODate) {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

/** Proforma avec acompte (0 % : pas d'acompte, donc pas d'échéance d'acompte) */
export const hasDeposit = (pf: Pick<Proforma, 'depositPct'>) => (pf.depositPct ?? 0) > 0;
/** Jours entre le départ et le paiement du solde */
export const balanceDaysOf = (s: State, pf: Proforma) => pf.balanceDays ?? supplierTerms(s, pf.supplierId).balanceDays;
/** Départ réel de la marchandise (dernier conteneur parti), s'il y en a un */
export const realDeparture = (s: State, pf: Proforma) =>
  s.containers
    .filter((c) => c.etdReal && c.allocations.some((x) => x.proformaId === pf.id))
    .map((c) => c.etdReal!)
    .sort()
    .pop();

export const DEFAULT_TERMS: SupplierTerms = { currency: 'EUR', depositPct: 30, balanceDays: 7 };
export const supplierTerms = (s: State, supplierId: string): SupplierTerms => s.suppliers.find((x) => x.id === supplierId)?.terms ?? DEFAULT_TERMS;
/** « 30 % d'acompte · solde à J+7 du départ » */
export const termsLabel = (t: SupplierTerms) => `${t.depositPct} % d’acompte · solde à J+${t.balanceDays} du départ (copie du BL)`;

/** Cours de la devise en € */
const fxRate = (s: State, cur: Currency) => s.settings.fx[cur] ?? 1;
const refKey = (r: string) => r.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Lignes à enregistrer valides : produits du fournisseur, ou nouveaux produits avec une référence inédite */
function importLinesOk(s: State, supplierId: string, lines: ImportLine[]) {
  if (!lines.length) return false;
  const seen = new Set<string>();
  return lines.every((l) => {
    if (!(l.qty > 0) || !(l.price >= 0)) return false;
    // Produit JONAS existant (y compris d'un autre fournisseur, reconnu par sa référence JONAS)
    if (l.productId) return s.products.some((p) => p.id === l.productId);
    const n = l.newProduct;
    if (!n || !n.name.trim() || !(n.pcb > 0) || !(n.cbmCarton > 0)) return false;
    // Une référence JONAS existante désigne ce produit : pas de doublon
    if (n.ref?.trim() && s.products.some((p) => refKey(p.ref) === refKey(n.ref!))) return false;
    if (n.supplierRef?.trim() && s.products.some((p) => refKey(p.ref) === refKey(n.supplierRef!))) return false;
    // Une référence fournisseur ne peut pas désigner deux produits de ce fournisseur
    if (n.supplierRef?.trim()) {
      const k = refKey(n.supplierRef);
      if (seen.has(k) || s.products.some((p) => p.supplierId === supplierId && p.supplierRef && refKey(p.supplierRef) === k)) return false;
      seen.add(k);
    }
    return true;
  });
}

/** Chiffre de contrôle EAN-13 */
export function eanCheck(d12: string) {
  const sum = [...d12].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

/**
 * Prochaines références JONAS et codes-barres EAN-13 JONAS pour de nouveaux produits d'un fournisseur.
 * Référence : même préfixe que les références habituelles du fournisseur (ex. CP-T → CP-T138).
 * EAN : préfixe GS1 de la société + numéro d'article suivant + chiffre de contrôle.
 */
export function nextJonasCodes(s: State, supplierId: string, n: number): { ref: string; ean: string }[] {
  const pat = /^([A-Z]+-[A-Z]*)(\d+)$/;
  const count = new Map<string, number>();
  for (const p of s.products.filter((x) => x.supplierId === supplierId)) {
    const m = p.ref.match(pat);
    if (m) count.set(m[1], (count.get(m[1]) ?? 0) + 1);
  }
  const prefix = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'JO-N';
  const used = s.products.map((p) => p.ref.match(pat)).filter((m) => m && m[1] === prefix) as RegExpMatchArray[];
  const width = Math.max(3, ...used.map((m) => m[2].length));
  let next = used.reduce((mx, m) => Math.max(mx, Number(m[2])), 0) + 1;
  const gs1 = (s.settings.company.gs1Prefix || DEFAULT_GS1).replace(/\D/g, '').slice(0, 11);
  const itemLen = 12 - gs1.length;
  let item = s.products.filter((p) => p.ean.length === 13 && p.ean.startsWith(gs1)).reduce((mx, p) => Math.max(mx, Number(p.ean.slice(gs1.length, 12))), 0) + 1;
  const refs = new Set(s.products.map((p) => p.ref));
  const out: { ref: string; ean: string }[] = [];
  while (out.length < n) {
    const ref = `${prefix}${String(next++).padStart(width, '0')}`;
    if (refs.has(ref)) continue;
    const d12 = gs1 + String(item++).padStart(itemLen, '0');
    out.push({ ref, ean: d12 + eanCheck(d12) });
  }
  return out;
}

/**
 * Codes JONAS des nouveaux produits, dans l'ordre : ceux déjà portés par la proforma quand ils sont utilisables
 * (référence JONAS inédite ; EAN-13 valide au préfixe GS1 JONAS, inédit), sinon les suivants de la série.
 */
export function jonasCodesFor(s: State, supplierId: string, given: { ref?: string; ean?: string }[]): { ref: string; ean: string; fromDoc: { ref: boolean; ean: boolean } }[] {
  const gen = nextJonasCodes(s, supplierId, given.length);
  const gs1 = (s.settings.company.gs1Prefix || DEFAULT_GS1).replace(/\D/g, '').slice(0, 11);
  const refs = new Set(s.products.map((p) => refKey(p.ref)));
  const eans = new Set(s.products.map((p) => p.ean));
  return given.map((g, i) => {
    const r = g.ref?.trim().toUpperCase() ?? '';
    const refOk = !!r && !refs.has(refKey(r));
    const e = (g.ean ?? '').replace(/\D/g, '');
    const eanOk = e.length === 13 && e.startsWith(gs1) && eanCheck(e.slice(0, 12)) === e[12] && !eans.has(e);
    const ref = refOk ? r : gen[i].ref;
    const ean = eanOk ? e : gen[i].ean;
    refs.add(refKey(ref));
    eans.add(ean);
    return { ref, ean, fromDoc: { ref: refOk, ean: eanOk } };
  });
}

/** Die cut manquant (ni reçu, ni fichier déposé) sur les produits de la proforma : passe à « demandé » */
function requestMissingDieCuts(s: State, pf: Proforma): State {
  const ids = new Set([...pf.lines, ...(pendingVersion(pf)?.lines ?? [])].map((l) => l.productId));
  let changed = false;
  const products = s.products.map((p) => {
    if (!ids.has(p.id) || p.pack.dieCut !== 'none' || (p.pack.files ?? []).some((f) => f.kind === 'diecut')) return p;
    changed = true;
    return { ...p, pack: { ...p.pack, dieCut: 'requested' as const } };
  });
  return changed ? { ...s, products } : s;
}

/** Signature JONAS : réf. et EAN JONAS définitifs pour les produits créés depuis le portail (codes du document gardés s'ils sont libres) */
function assignPendingCodes(s: State, pf: Proforma): State {
  const ids = [...new Set([...pf.lines, ...(pendingVersion(pf)?.lines ?? [])].map((l) => l.productId))];
  const pending = ids.map((id) => s.products.find((p) => p.id === id)).filter((p): p is Product => !!p?.codesPending);
  if (!pending.length) return s;
  const codes = jonasCodesFor(
    s,
    pf.supplierId,
    pending.map((p) => p.codesPending!),
  );
  const byId = new Map(pending.map((p, i) => [p.id, codes[i]]));
  return {
    ...s,
    products: s.products.map((p) => {
      const c = byId.get(p.id);
      if (!c) return p;
      const { codesPending: _done, ...rest } = p;
      void _done;
      return { ...rest, ref: c.ref, ean: c.ean };
    }),
  };
}

/**
 * Transforme les lignes lues sur une proforma en lignes de proforma : crée les nouveaux produits
 * (rayon, marque et designer habituels du fournisseur, pack à définir, à développer).
 */
function materializeLines(s: State, supplierId: string, lines: ImportLine[], etd: ISODate, fx: number, currency: Currency, pfId?: string) {
  const mine = s.products.filter((p) => p.supplierId === supplierId);
  const most = <K extends keyof Product>(k: K, fallback: Product[K]) => {
    const count = new Map<Product[K], number>();
    for (const p of mine) count.set(p[k], (count.get(p[k]) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  };
  const created: Product[] = [];
  const provisional = isSupplier(currentUser(s));
  // Produits existants sans photo : photo lue sur la proforma
  const photos = new Map<string, ProductPhoto>();
  // PA de la fiche : celui de cette proforma (devise du fournisseur)
  const prices = new Map<string, { price: number; currency: Currency; from?: string }>();
  const codes = jonasCodesFor(
    s,
    supplierId,
    lines.filter((l) => !l.productId).map((l) => ({ ref: l.newProduct?.ref, ean: l.newProduct?.ean })),
  );
  const out: ProformaLine[] = lines.map((l) => {
    if (l.productId) {
      if (l.photo) photos.set(l.productId, l.photo);
      prices.set(l.productId, { price: l.price, currency, from: pfId });
      return { productId: l.productId, qty: l.qty, price: l.price };
    }
    const n = l.newProduct!;
    const code = codes.shift()!;
    const deadline = addDays(etd, -35);
    // Créé depuis le portail : le fournisseur ne voit pas le catalogue JONAS, les codes sont attribués par JONAS à la signature
    const prov = provisional ? `PROV-${supplierCode(supplierId)}-${Date.now().toString(36).toUpperCase()}${created.length}` : '';
    const ref = prov || code.ref;
    const ean = prov ? '' : code.ean;
    const p: Product = {
      id: ref,
      ref,
      ean,
      ...(prov ? { codesPending: { ref: n.ref?.trim() || undefined, ean: n.ean?.replace(/\D/g, '') || undefined } } : {}),
      supplierRef: n.supplierRef?.trim().toUpperCase() || undefined,
      name: n.name.trim(),
      // Désignation du fournisseur conservée telle quelle (description anglaise) ; la désignation peut ensuite être simplifiée en français
      description: { en: n.name.trim() },
      // Marque et designer : choisis à la commande, sinon à définir / à attribuer (jamais une valeur par défaut)
      brandId: n.brandId ?? '',
      supplierId,
      rayon: most('rayon', 'Divers'),
      collection: 'Nouveauté',
      gender: 'Mixte',
      material: 'À préciser',
      emoji: most('emoji', '📦'),
      tint: '#eef1f5',
      pa: Math.round(l.price * fx * 100) / 100,
      paSupplier: { price: l.price, currency, from: pfId },
      pcb: n.pcb,
      cbmCarton: n.cbmCarton,
      weight: 0.5,
      developed: false,
      devStage: 0,
      devDeadline: addDays(etd, -45),
      nextAction: 'Valider le brief',
      targetQty: l.qty,
      pack: {
        type: 'À définir',
        designer: n.designer?.trim() || UNASSIGNED,
        artworkDeadline: deadline,
        // Rien à valider tant que le designer n'a pas déposé de pack : « À faire »
        validations: { direction: { state: 'todo' }, moinard: { state: 'todo' }, fournisseur: { state: 'todo' } },
        dieCut: 'none',
        artworkVersions: 0,
        sentToSupplier: false,
      },
      stock: { Péronne: 0, Meaux: 0, Lillois: 0 },
      photo: l.photo,
    };
    created.push(p);
    return { productId: p.id, qty: l.qty, price: l.price };
  });
  return { lines: out, created, photos, prices, fx };
}

/** Catalogue après une proforma lue : nouveaux produits, et photos des produits existants qui n'en avaient pas */
function withMaterialized(products: Product[], mat: { created: Product[]; photos: Map<string, ProductPhoto>; prices: Map<string, { price: number; currency: Currency; from?: string }>; fx: number }) {
  const out = products.map((p) => {
    const photo = !p.photo && mat.photos.get(p.id);
    const pa = mat.prices.get(p.id);
    if (!photo && !pa) return p;
    return { ...p, ...(photo ? { photo } : {}), ...(pa ? { paSupplier: pa, pa: Math.round(pa.price * mat.fx * 100) / 100 } : {}) };
  });
  return [...out, ...mat.created];
}

/**
 * Dernier prix payé d'un produit : sa ligne sur la dernière proforma signée (sinon la dernière tout court),
 * converti dans la devise donnée. À défaut, le prix d'achat de la fiche produit.
 */
/**
 * PA affiché, dans la devise du fournisseur et sans conversion : celui de la fiche (saisi par JONAS, ou repris de la
 * dernière proforma enregistrée) ; à défaut, la ligne de la dernière proforma ; à défaut, le PA en euros.
 */
export function purchasePrice(s: State, productId: string): { price: number; currency: Currency; from?: string } {
  const prod = s.products.find((x) => x.id === productId);
  if (prod?.paSupplier) return { ...prod.paSupplier };
  const withLine = s.proformas.filter((p) => p.lines.some((l) => l.productId === productId)).sort((a, b) => b.date.localeCompare(a.date));
  const pf = withLine.find((p) => p.status !== 'a_signer') ?? withLine[0];
  if (pf) return { price: pf.lines.find((x) => x.productId === productId)!.price, currency: pf.currency ?? supplierTerms(s, pf.supplierId).currency, from: pf.id };
  const p = s.products.find((x) => x.id === productId);
  if (p?.paSupplier) return { ...p.paSupplier };
  return { price: p?.pa ?? 0, currency: 'EUR' };
}

export function lastPricePaid(s: State, productId: string, currency: Currency): { price: number; from?: string; date?: ISODate } {
  const fx = (c: Currency) => s.settings.fx[c] ?? 1;
  const withLine = s.proformas.filter((p) => p.lines.some((l) => l.productId === productId)).sort((a, b) => b.date.localeCompare(a.date));
  const pf = withLine.find((p) => p.status !== 'a_signer') ?? withLine[0];
  // 4 décimales : les petits articles se négocient au dixième de centime
  const round = (n: number) => Math.round(n * 10000) / 10000;
  if (pf) {
    const l = pf.lines.find((x) => x.productId === productId)!;
    return { price: round((l.price * fx(pf.currency ?? 'EUR')) / fx(currency)), from: pf.id, date: pf.date };
  }
  const p = s.products.find((x) => x.id === productId);
  return { price: round((p?.pa ?? 0) / fx(currency)) };
}

/** Prochain numéro de proforma (PF-AAAA-NNNN), hors reliquats */
/** Toutes les proformas, annulées comprises (la vue les range à part) */
export const allPfs = (s: State): Proforma[] => (s.archived?.length ? [...s.proformas, ...s.archived] : s.proformas);
/** Fait partie d'une expédition partielle (proforma d'origine ou reliquat) : à gérer depuis l'expédition */
const inSplit = (s: State, pf: Proforma) => !!pf.split || allPfs(s).some((x) => x.split?.root === pf.id);
const shipped = (pf: Proforma) => pf.status === 'en_transit' || pf.status === 'arrive';
/** Annuler : l'équipe achats (pilote, Direction, acheteurs), tant que la marchandise n'est pas partie */
export const canCancelProforma = (s: State, u: User, pf: Proforma) => (can(u, 'proforma.edit') || can(u, 'proforma.sign')) && !shipped(pf) && !inSplit(s, pf);
/** Supprimer définitivement : pilote et Direction seulement, tant que la marchandise n'est pas partie */
export const canDeleteProforma = (s: State, u: User, pf: Proforma) => can(u, 'proforma.sign') && !shipped(pf) && !inSplit(s, pf);
/** Annuler un produit : proforma pas encore signée par JONAS (aucune version signée, quel que soit son statut), pas bookée ni partie, équipe achats */
export const canCancelLines = (u: User | undefined, pf: Proforma) =>
  !!u && (can(u, 'proforma.edit') || can(u, 'proforma.sign')) && !pf.cancelled && !signedVersion(pf) && ['a_signer', 'en_dev', 'en_production'].includes(pf.status) && !pf.split && !pf.booking;
/** Pourquoi on ne peut pas annuler / supprimer (message affiché) */
export const cancelBlock = (s: State, pf: Proforma) =>
  shipped(pf) ? 'Marchandise partie : la proforma ne peut plus être annulée.' : inSplit(s, pf) ? 'Expédition partielle en cours : gérez-la depuis l’onglet Expéditions.' : '';

/** Retire les quantités de la proforma des conteneurs ; supprime les conteneurs prévisionnels restés vides */
function withoutAllocations(s: State, pfId: string): State {
  const containers = s.containers
    .map((c) => (c.allocations.some((x) => x.proformaId === pfId) ? { ...c, allocations: c.allocations.filter((x) => x.proformaId !== pfId), planValidated: false } : c))
    .filter((c) => c.allocations.length > 0 || !s.containers.find((o) => o.id === c.id)!.allocations.some((x) => x.proformaId === pfId) || !['a_booker', 'booking_demande'].includes(c.status));
  return { ...s, containers };
}

const viewCache = new WeakMap<State, State>();
/** Ce que voient les écrans : les proformas annulées sortent des listes et vont dans « archived » */
export function viewState(s: State): State {
  const hit = viewCache.get(s);
  if (hit) return hit;
  const off = s.proformas.filter((p) => p.cancelled);
  const v = off.length ? { ...s, proformas: s.proformas.filter((p) => !p.cancelled), archived: off } : s;
  viewCache.set(s, v);
  return v;
}

/** Code court d'un fournisseur dans les numéros qu'il crée (il ne voit pas ceux des autres) : « TOPUNI » */
export const supplierCode = (supplierId: string) =>
  supplierId
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 6)
    .toUpperCase() || 'FOUR';

/** Numéro d'un nouveau conteneur prévisionnel ; depuis le portail, propre au fournisseur pour ne jamais en écraser un autre */
export function nextContainerId(s: State, supplierId: string, taken: string[] = []) {
  const ids = new Set([...s.containers.map((c) => c.id), ...taken]);
  if (isSupplier(currentUser(s))) {
    const base = `PLAN-${supplierCode(supplierId)}-`;
    let n = 1;
    while (ids.has(base + String(n).padStart(3, '0'))) n++;
    return base + String(n).padStart(3, '0');
  }
  let n = [...ids].reduce((m, id) => Math.max(m, Number(id.match(/^PLAN-(\d+)$/)?.[1] ?? 0)), 30) + 1;
  while (ids.has(`PLAN-${String(n).padStart(3, '0')}`)) n++;
  return `PLAN-${String(n).padStart(3, '0')}`;
}

export function nextProformaId(s: State) {
  const year = TODAY.slice(0, 4);
  const me0 = currentUser(s);
  if (isSupplier(me0) && me0.supplierId) {
    // Le fournisseur ne voit que ses proformas : numéro à son nom, jamais en conflit avec celles des autres
    const base = `PF-${year}-${supplierCode(me0.supplierId)}-`;
    const ids = new Set(allPfs(s).map((p) => p.id));
    let n = 1;
    while (ids.has(base + String(n).padStart(2, '0'))) n++;
    return base + String(n).padStart(2, '0');
  }
  const max = allPfs(s).reduce((m, p) => {
    const x = p.id.match(/^PF-(\d{4})-(\d{4})$/);
    return x && x[1] === year ? Math.max(m, +x[2]) : m;
  }, 0);
  return `PF-${year}-${String(max + 1).padStart(4, '0')}`;
}
/** Reliquat : expédition créée par une expédition partielle (Exp. 2, 3…) */
export const isReliquat = (pf: Proforma) => !!pf.split && pf.split.part > 1;
/** Reliquats pas encore arrivés */
export const openReliquats = (s: State) => s.proformas.filter((p) => isReliquat(p) && p.status !== 'arrive');
/** Retard d'un reliquat : nouvelle date d'expédition − date prévue avant la séparation (jours) */
export const reliquatDelay = (pf: Proforma) => (pf.split?.etdInitial ? diffDays(pf.etd, pf.split.etdInitial) : 0);
/** « Exp. 2/3 » si la proforma part en plusieurs fois, sinon rien */
export function shipmentLabel(s: State, pf: Proforma) {
  const n = shipmentsOf(s, pf).length;
  return n > 1 ? `Exp. ${pf.split?.part ?? 1}/${n}` : '';
}

/**
 * Sépare une proforma : les quantités « maintenant » restent dans ce dossier, le reliquat devient
 * une nouvelle expédition (PF-…-n) avec sa date, son acompte et son solde au prorata.
 * Les quantités en trop dans les conteneurs pas encore partis sont retirées (elles repartiront avec le reliquat).
 */
function applySplit(s: State, pfId: string, me: string): State {
  const pf = s.proformas.find((x) => x.id === pfId)!;
  const r = pf.splitRequest!;
  const root = pf.split?.root ?? pf.id;
  const family = shipmentsOf(s, pf);
  const part = family.reduce((m, p) => Math.max(m, p.split?.part ?? 1), 1) + 1;
  const childId = `${root}-${part}`;
  const nowOf = (productId: string, qty: number) => r.lines.find((x) => x.productId === productId)?.qtyNow ?? qty;
  const nowLines = pf.lines.map((l) => ({ ...l, qty: nowOf(l.productId, l.qty), cbm: l.cbm !== undefined ? (l.cbm * nowOf(l.productId, l.qty)) / l.qty : undefined })).filter((l) => l.qty > 0);
  const laterLines = pf.lines
    .map((l) => ({ ...l, qty: l.qty - nowOf(l.productId, l.qty), cbm: l.cbm !== undefined ? (l.cbm * (l.qty - nowOf(l.productId, l.qty))) / l.qty : undefined }))
    .filter((l) => l.qty > 0);
  const amt = (lines: typeof pf.lines) => lines.reduce((t, l) => t + l.qty * l.price, 0);
  const share = amt(laterLines) / amt(pf.lines);
  const deposit = proformaTotals(s, pf).deposit;
  const round = (n: number) => Math.round(n * 100) / 100;
  const shift = diffDays(r.etdLater, pf.etd);
  const qtyNow = nowLines.reduce((t, l) => t + l.qty, 0);
  const qtyLater = laterLines.reduce((t, l) => t + l.qty, 0);
  const who = r.side === 'fournisseur' ? 'du fournisseur' : 'de JONAS';
  const child: Proforma = {
    ...pf,
    id: childId,
    lines: laterLines,
    status: pf.status === 'en_dev' ? 'en_dev' : 'en_production',
    etd: r.etdLater,
    eta: addDays(pf.eta, shift),
    balanceDue: addDays(pf.balanceDue, Math.max(0, shift)),
    depositAmount: round(deposit * share),
    balancePaid: false,
    booking: undefined,
    versions: undefined,
    splitRequest: undefined,
    split: { root, part, etdInitial: pf.etd, reason: r.reason },
    documents: pf.documents.filter((d) => d.startsWith('Conditions')),
    history: [{ date: TODAY, user: me, text: `Reliquat de ${pf.id} (${qtyLater} pcs), départ prévu ${r.etdLater} · demande ${who} : ${r.reason}` }],
  };
  const parent: Proforma = {
    ...pf,
    lines: nowLines,
    depositAmount: round(deposit * (1 - share)),
    splitRequest: undefined,
    split: { ...pf.split, root, part: pf.split?.part ?? 1 },
    history: [...pf.history, { date: TODAY, user: me, text: `Expédition partielle acceptée : ${qtyNow} pcs partent, reliquat ${qtyLater} pcs → ${childId} (${r.etdLater}) · ${r.reason}` }],
  };
  // Conteneurs pas encore partis : on retire ce qui dépasse les quantités « maintenant »
  const containers = s.containers.map((c) => ({ ...c, allocations: [...c.allocations] }));
  for (const l of nowLines.concat(laterLines.filter((x) => !nowLines.some((n) => n.productId === x.productId)).map((x) => ({ ...x, qty: 0 })))) {
    let excess = containers.reduce((t, c) => t + c.allocations.filter((x) => x.proformaId === pf.id && x.productId === l.productId).reduce((u, x) => u + x.qty, 0), 0) - l.qty;
    for (const c of [...containers].reverse()) {
      if (excess <= 0) break;
      if (['en_transit', 'arrive'].includes(c.status)) continue;
      c.allocations = c.allocations
        .map((x) => {
          if (excess <= 0 || x.proformaId !== pf.id || x.productId !== l.productId) return x;
          const cut = Math.min(excess, x.qty);
          excess -= cut;
          return { ...x, qty: x.qty - cut };
        })
        .filter((x) => x.qty > 0);
    }
  }
  const idx = s.proformas.findIndex((x) => x.id === pf.id);
  const proformas = [...s.proformas];
  proformas.splice(idx, 1, parent, child);
  return syncProformaStatuses({ ...s, proformas, containers });
}

/** Version de proforma déposée, en attente de signature */
export const pendingVersion = (pf: Proforma) => pf.versions?.find((v) => v.status === 'a_signer');
/** Version signée en vigueur */
export const signedVersion = (pf: Proforma) => pf.versions?.find((v) => v.status === 'signee');
/** Demande de modification en attente (nouvelle version d'une proforma déjà signée) */
export const pendingRevision = (pf: Proforma) => (signedVersion(pf) ? pendingVersion(pf) : undefined);

/** Demande de booking envoyée, booking pas encore effectué */
export const bookingOpen = (pf: Proforma) => !!pf.booking && !pf.booking.answeredAt;
/** Étape du booking : chez le fournisseur (à prendre en compte), chez le transitaire (proposition à faire),
 * en validation (proposition à accepter par le fournisseur et JONAS), ou booké */
export const bookingStage = (pf: Proforma): 'fournisseur' | 'transitaire' | 'validation' | 'booke' | undefined =>
  !pf.booking ? undefined : pf.booking.answeredAt ? 'booke' : pf.booking.proposal ? 'validation' : pf.booking.ackAt ? 'transitaire' : 'fournisseur';
/** Côté JONAS : qui peut demander, accepter ou refuser un booking (logistique, acheteurs, pilote) */
export const canAskBooking = (u: User) => can(u, 'logistics.booking') || can(u, 'logistics.plan');
/** Transitaire habituel du fournisseur (celui de ses derniers conteneurs) */
export const defaultForwarder = (s: State, supplierId: string): Forwarder => [...s.containers].reverse().find((c) => c.supplierId === supplierId && c.forwarder)?.forwarder ?? 'Logfret';
/** Proforma signée, pas encore partie, sans demande en cours ni réponse */
export const canRequestBooking = (pf: Proforma) => !pf.booking && ['en_dev', 'en_production'].includes(pf.status);
/** Containers d'une proforma (au moins une ligne chargée) */
export const pfContainers = (s: State, pfId: string) => s.containers.filter((c) => c.allocations.some((x) => x.proformaId === pfId));

function applyAction(s: State, a: Action): State {
  if (!isAllowed(s, a)) {
    console.warn(`Action refusée pour ${currentUser(s).name} : ${a.type}`);
    return s;
  }
  const me = currentUser(s).name;
  switch (a.type) {
    case 'reset':
      return { ...initialState(), currentUserId: s.currentUserId };
    case 'login':
      return { ...s, currentUserId: a.userId };
    case 'setUserRole':
      return {
        ...s,
        users: s.users.map((u) => (u.id === a.userId ? { ...u, role: a.role, validationStep: a.validationStep === null ? undefined : (a.validationStep ?? u.validationStep) } : u)),
      };
    case 'toggleUser':
      if (a.userId === s.currentUserId) return s;
      return { ...s, users: s.users.map((u) => (u.id === a.userId ? { ...u, active: !u.active } : u)) };
    case 'requestPlan':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        planRequested: true,
        dateHistory: [...c.dateHistory, hist(me, 'Plan de chargement demandé au fournisseur')],
      }));
    case 'proposePlan':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        planProposed: true,
        planRequested: false,
        planEdited: false,
        dateHistory: [...c.dateHistory, hist(me, 'Plan de chargement modifié par le fournisseur')],
      }));
    case 'acceptPlan':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        planValidated: true,
        planRequested: false,
        planProposed: false,
        planValidatedBy: 'fournisseur',
        planEdited: false,
        dateHistory: [...c.dateHistory, hist(me, 'Plan de chargement validé tel quel par le fournisseur')],
      }));
    case 'proposeLoadingDate':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        loading: { date: a.date, status: 'proposed', proposedAt: nowStamp(), proposedBy: me },
        dateHistory: [...c.dateHistory, hist(me, `Date de chargement proposée au fournisseur : ${a.date}`)],
      }));
    case 'answerLoadingDate':
      return mapC(s, a.containerId, (c) => {
        const changed = a.date !== c.loading!.date;
        return {
          ...c,
          loading: { ...c.loading!, date: a.date, status: 'validated', validatedAt: nowStamp(), initialDate: changed ? c.loading!.date : undefined },
          dateHistory: [
            ...c.dateHistory,
            hist(me, changed ? `Date de chargement changée par le fournisseur : ${c.loading!.date} → ${a.date}` : `Date de chargement validée par le fournisseur : ${a.date}`),
          ],
        };
      });
    case 'setLabelAdvice':
      return mapP(s, a.productId, (p) => ({ ...p, labelAdvice: a.advice }));
    case 'setPackCheck':
      return mapP(s, a.productId, (p) => ({ ...p, packCheck: a.check }));
    case 'setContainerNumber':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        number: a.number,
        seal: a.seal?.trim() ? a.seal.trim().toUpperCase() : c.seal,
        dateHistory: [...c.dateHistory, hist(me, `N° de conteneur : ${a.number}${a.seal?.trim() ? ` · plomb ${a.seal.trim().toUpperCase()}` : ''}`)],
      }));
    case 'addContainerDoc':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        documents: c.documents.includes(a.doc) ? c.documents : [...c.documents, a.doc],
        docFiles: a.file ? { ...(c.docFiles ?? {}), [a.doc]: { ...a.file, at: nowStamp(), by: me } } : c.docFiles,
        dateHistory: [...c.dateHistory, hist(me, `Document déposé : ${a.doc}${a.file ? ` (${a.file.name})` : ''}`)],
      }));
    case 'createProforma': {
      const u = currentUser(s);
      const bySupplier = isSupplier(u);
      const terms = supplierTerms(s, a.supplierId);
      const mat = materializeLines(s, a.supplierId, a.lines, a.etd, fxRate(s, terms.currency), terms.currency, a.id);
      const pf: Proforma = {
        id: a.id,
        supplierId: a.supplierId,
        currency: terms.currency,
        title: a.title.trim(),
        poNumber: `PO-JONAS-${27000 + s.proformas.length}`,
        date: TODAY,
        status: 'a_signer',
        etd: a.etd,
        eta: a.eta,
        lines: mat.lines,
        depositPct: terms.depositPct,
        depositPaid: false,
        balancePaid: false,
        balanceDue: addDays(a.etd, terms.balanceDays),
        balanceDays: terms.balanceDays,
        documents: ['Conditions d’achat.pdf'],
        order: bySupplier ? undefined : { at: nowStamp(), by: me, source: a.order?.source ?? 'saisie', file: a.order?.file },
        versions: a.file
          ? [{ version: 1, fileId: a.file.fileId, name: a.file.name, size: a.file.size, type: a.file.mime, uploadedAt: nowStamp(), uploadedBy: me, status: 'a_signer', lines: mat.lines }]
          : undefined,
        history: [
          {
            date: TODAY,
            user: me,
            text: bySupplier
              ? 'Proforma créée et déposée par le fournisseur'
              : `Commande JONAS passée (${a.order?.source === 'excel' ? 'import Excel' : a.order?.source === 'bc' ? 'bon de commande' : a.order?.source === 'ia' ? 'assistant IA' : 'articles saisis'}) : en attente de la proforma du fournisseur`,
          },
          ...(mat.created.length ? [{ date: TODAY, user: me, text: `${mat.created.length} produit(s) créé(s) depuis la proforma : ${mat.created.map((p) => p.ref).join(', ')}` }] : []),
        ],
      };
      return { ...s, products: withMaterialized(s.products, mat), proformas: [...s.proformas, pf] };
    }
    case 'cancelOrder':
      return { ...s, proformas: s.proformas.filter((p) => p.id !== a.id) };
    case 'cancelProforma': {
      const next = withoutAllocations(s, a.id);
      return mapPF(next, a.id, (pf) => ({ ...pf, cancelled: { at: nowStamp(), by: me, reason: a.reason.trim() }, history: [...pf.history, hist(me, `Proforma annulée : ${a.reason.trim()}`)] }));
    }
    case 'restoreProforma':
      return mapPF(s, a.id, (pf) => ({ ...pf, cancelled: undefined, history: [...pf.history, hist(me, 'Proforma rétablie')] }));
    case 'cancelLine': {
      const ref = s.products.find((p) => p.id === a.productId)?.ref ?? a.productId;
      const reason = a.reason?.trim() || undefined;
      // Ses quantités sortent des conteneurs prévisionnels
      const containers = s.containers.map((c) =>
        c.allocations.some((x) => x.proformaId === a.id && x.productId === a.productId)
          ? { ...c, allocations: c.allocations.filter((x) => !(x.proformaId === a.id && x.productId === a.productId)), planValidated: false }
          : c,
      );
      return mapPF({ ...s, containers }, a.id, (pf) => {
        const line = pf.lines.find((l) => l.productId === a.productId)!;
        return {
          ...pf,
          lines: pf.lines.filter((l) => l.productId !== a.productId),
          cancelledLines: [...(pf.cancelledLines ?? []).filter((l) => l.productId !== a.productId), { ...line, at: nowStamp(), by: me, reason }],
          history: [...pf.history, hist(me, `Produit ${ref} annulé (${line.qty} pcs)${reason ? ` : ${reason}` : ''}`)],
        };
      });
    }
    case 'restoreLine': {
      const ref = s.products.find((p) => p.id === a.productId)?.ref ?? a.productId;
      return mapPF(s, a.id, (pf) => {
        const c = pf.cancelledLines!.find((l) => l.productId === a.productId)!;
        const { at: _at, by: _by, reason: _r, ...line } = c;
        void _at;
        void _by;
        void _r;
        const rest = pf.cancelledLines!.filter((l) => l.productId !== a.productId);
        return {
          ...pf,
          lines: [...pf.lines, line],
          cancelledLines: rest.length ? rest : undefined,
          history: [...pf.history, hist(me, `Produit ${ref} rétabli`)],
        };
      });
    }
    case 'deleteProforma': {
      const next = withoutAllocations(s, a.id);
      return { ...next, proformas: next.proformas.filter((p) => p.id !== a.id) };
    }
    case 'logSupplierMail': {
      // Trace de l'e-mail : historique de la proforma (le journal reçoit la même ligne)
      if (!a.proformaId) return { ...s };
      const what = a.demo ? `E-mail préparé (démo, non envoyé) : « ${a.subject} »` : a.ok ? `E-mail envoyé à ${a.to.join(', ')} : « ${a.subject} »` : `E-mail NON envoyé : « ${a.subject} »`;
      return mapPF(s, a.proformaId, (pf) => ({ ...pf, history: [...pf.history, hist('JONAS BUYING', what)] }));
    }
    case 'setSupplierLogo':
      return {
        ...s,
        suppliers: s.suppliers.map((x) => {
          if (x.id !== a.supplierId) return x;
          const { logo: _old, ...rest } = x;
          void _old;
          return a.logo ? { ...rest, logo: a.logo } : rest;
        }),
      };
    case 'setSupplierTerms':
      return { ...s, suppliers: s.suppliers.map((x) => (x.id === a.supplierId ? { ...x, terms: a.terms } : x)) };
    case 'addSupplier':
      return { ...s, suppliers: [...s.suppliers, a.supplier] };
    case 'updateSupplier':
      return { ...s, suppliers: s.suppliers.map((x) => (x.id === a.supplier.id ? { ...a.supplier, id: x.id } : x)) };
    case 'requestSplit': {
      const u = currentUser(s);
      return mapPF(s, a.id, (pf) => ({
        ...pf,
        splitRequest: { at: nowStamp(), by: me, side: isSupplier(u) ? 'fournisseur' : 'jonas', reason: a.reason.trim(), lines: a.lines, etdLater: a.etdLater },
        history: [...pf.history, hist(me, `Demande d'expédition partielle : ${a.reason.trim()} · reliquat prévu le ${a.etdLater}`)],
      }));
    }
    case 'acceptSplit':
      return applySplit(s, a.id, me);
    case 'refuseSplit':
      return mapPF(s, a.id, (pf) => ({
        ...pf,
        splitRequest: undefined,
        history: [...pf.history, hist(me, `Demande d'expédition partielle ${a.reason ? `refusée : ${a.reason}` : 'annulée'}`)],
      }));
    case 'uploadProforma': {
      const pf0 = s.proformas.find((x) => x.id === a.id)!;
      const mat = a.lines ? materializeLines(s, pf0.supplierId, a.lines, pf0.etd, fxRate(s, pf0.currency ?? 'EUR'), pf0.currency ?? 'EUR', pf0.id) : null;
      const next = mapPF(s, a.id, (pf) => {
        const versions = pf.versions ?? [];
        const signed = signedVersion(pf);
        const n = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
        const doc: ProformaDoc = {
          version: n,
          fileId: a.fileId,
          name: a.name,
          size: a.size,
          type: a.mime,
          uploadedAt: nowStamp(),
          uploadedBy: me,
          reason: signed ? a.reason?.trim() : undefined,
          status: 'a_signer',
          lines: mat?.lines,
        };
        return {
          ...pf,
          // Une version en attente déposée à nouveau est remplacée
          versions: [...versions.map((v) => (v.status === 'a_signer' ? { ...v, status: 'remplacee' as const } : v)), doc],
          history: [
            ...pf.history,
            hist(me, signed ? `Demande de modification : proforma v${n} déposée (${doc.reason})` : `Proforma v${n} déposée par le fournisseur (${a.name})`),
            ...(mat?.created.length ? [hist(me, `${mat.created.length} produit(s) créé(s) depuis la proforma : ${mat.created.map((p) => p.ref).join(', ')}`)] : []),
          ],
          // Première version : les lignes lues remplacent celles de la proforma ; une modification les applique à la signature
          lines: mat && !signed ? mat.lines.filter((l) => !pf.cancelledLines?.some((c) => c.productId === l.productId)) : pf.lines,
        };
      });
      // Demande de modification : le PA de la fiche ne change qu'à la signature de la nouvelle version
      if (mat && signedVersion(pf0)) mat.prices.clear();
      return mat ? { ...next, products: withMaterialized(next.products, mat) } : next;
    }
    case 'signProforma': {
      const u = currentUser(s);
      const at = nowStamp();
      // Modification signée : le PA des fiches devient celui de la nouvelle version
      const pf1 = s.proformas.find((x) => x.id === a.id);
      const doc1 = pf1 && pendingVersion(pf1);
      if (pf1 && doc1?.lines?.length && signedVersion(pf1)) {
        const cur = pf1.currency ?? 'EUR';
        const price = new Map(doc1.lines.map((l) => [l.productId, l.price]));
        s = {
          ...s,
          products: s.products.map((p) =>
            price.has(p.id) ? { ...p, paSupplier: { price: price.get(p.id)!, currency: cur, from: pf1.id }, pa: Math.round(price.get(p.id)! * fxRate(s, cur) * 100) / 100 } : p,
          ),
        };
      }
      if (pf1) s = assignPendingCodes(s, pf1);
      // Proforma validée : les die cuts manquants de ses produits sont demandés au fournisseur
      if (pf1) s = requestMissingDieCuts(s, pf1);
      return mapPF(s, a.id, (pf) => {
        const doc = pendingVersion(pf)!;
        const prev = signedVersion(pf);
        const shift = diffDays(a.etdWanted, pf.etd);
        return {
          ...pf,
          lines: prev && doc.lines?.length ? doc.lines : pf.lines,
          status: pf.status === 'a_signer' ? 'en_dev' : pf.status,
          etd: a.etdWanted,
          eta: addDays(pf.eta, shift),
          balanceDue: pf.balancePaid || realDeparture(s, pf) ? pf.balanceDue : addDays(a.etdWanted, balanceDaysOf(s, pf)),
          versions: pf.versions!.map((v) =>
            v.version === doc.version
              ? { ...v, status: 'signee', signature: { at, by: me, role: ROLE_DEFS[u.role].label, date: TODAY, etdWanted: a.etdWanted, replaces: prev?.version } }
              : prev && v.version === prev.version
                ? { ...v, status: 'annulee', cancelledBy: { version: doc.version, at } }
                : v,
          ),
          history: [
            ...pf.history,
            hist(
              me,
              prev
                ? `Proforma v${doc.version} signée et tamponnée · expédition demandée ${a.etdWanted} · annule et remplace la v${prev.version}`
                : `Proforma v${doc.version} signée et tamponnée · expédition demandée ${a.etdWanted}`,
            ),
          ],
        };
      });
    }
    case 'refuseProformaVersion':
      return mapPF(s, a.id, (pf) => {
        const doc = pendingVersion(pf)!;
        return {
          ...pf,
          versions: pf.versions!.map((v) => (v.version === doc.version ? { ...v, status: 'refusee', refused: { at: nowStamp(), by: me, reason: a.reason.trim() } } : v)),
          history: [...pf.history, hist(me, `Proforma v${doc.version} refusée : ${a.reason.trim()}`)],
        };
      });
    case 'setProformaStatus':
      return mapPF(s, a.id, (pf) => ({
        ...pf,
        status: a.status,
        history: [...pf.history, hist(me, `Statut → ${PROFORMA_STATUS_LABEL[a.status]}`)],
      }));
    case 'payDeposit':
      return mapPF(s, a.id, (pf) => ({ ...pf, depositPaid: true, history: [...pf.history, hist('Finance', `Acompte ${pf.depositPct} % versé`)] }));
    case 'payBalance':
      return mapPF(s, a.id, (pf) => ({ ...pf, balancePaid: true, history: [...pf.history, hist('Finance', 'Solde réglé')] }));
    case 'validatePack':
      return mapP(s, a.productId, (p) => {
        const v = { ...p.pack.validations };
        const idx = VALIDATION_STEPS.findIndex((st) => v[st].state !== 'done');
        if (idx < 0) return p;
        v[VALIDATION_STEPS[idx]] = { state: 'done', date: TODAY };
        if (idx + 1 < VALIDATION_STEPS.length) v[VALIDATION_STEPS[idx + 1]] = { state: 'pending' };
        // Validé par Moinard (avant-dernière étape) : le pack part tout seul chez le fournisseur
        const toSupplier = VALIDATION_STEPS[idx + 1] === 'fournisseur' || idx === VALIDATION_STEPS.length - 1;
        return { ...p, pack: { ...p.pack, validations: v, sentToSupplier: toSupplier ? true : p.pack.sentToSupplier } };
      });
    case 'rejectPack':
      return mapP(s, a.productId, (p) => {
        const v = { ...p.pack.validations };
        const step = VALIDATION_STEPS.find((st) => v[st].state !== 'done');
        VALIDATION_STEPS.forEach((st, i) => (v[st] = i === 0 ? { state: 'pending' } : { state: 'todo' }));
        const version = Math.max(p.pack.artworkVersions, ...(p.pack.files ?? []).filter((f) => f.kind === 'pack').map((f) => f.version ?? 0));
        const rejection = a.reason?.trim() ? { at: nowStamp(), by: me, step: step ? VALIDATION_LABELS[step] : '', reason: a.reason.trim(), version } : p.pack.rejection;
        return { ...p, pack: { ...p.pack, validations: v, rejection } };
      });
    case 'requestDieCut':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, dieCut: 'requested' } }));
    case 'receiveDieCut':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, dieCut: 'received' } }));
    case 'uploadArtwork':
      return mapP(s, a.productId, (p) => {
        const v = { ...p.pack.validations };
        if (VALIDATION_STEPS.every((st) => v[st].state === 'todo')) v.direction = { state: 'pending' };
        return { ...p, pack: { ...p.pack, artworkVersions: p.pack.artworkVersions + 1, validations: v, startedAt: p.pack.startedAt ?? nowStamp() } };
      });
    case 'forwardPack':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, sentToSupplier: true } }));
    case 'allocate': {
      const next = mapC(s, a.containerId, (c) => {
        const existing = c.allocations.find((x) => x.proformaId === a.proformaId && x.productId === a.productId);
        const allocations = existing
          ? c.allocations.map((x) => (x === existing ? { ...x, qty: x.qty + a.qty } : x))
          : [...c.allocations, { proformaId: a.proformaId, productId: a.productId, qty: a.qty }];
        return { ...c, allocations, planValidated: false, planEdited: c.planEdited || isSupplier(currentUser(s)) };
      });
      return syncProformaStatuses(next);
    }
    case 'setProformaEtd':
      return mapPF(s, a.id, (pf) => {
        const shift = diffDays(a.etd, pf.etd);
        const balanceDue = pf.balancePaid || realDeparture(s, pf) ? pf.balanceDue : addDays(a.etd, balanceDaysOf(s, pf));
        return {
          ...pf,
          etd: a.etd,
          eta: addDays(pf.eta, shift),
          balanceDue,
          history: [...pf.history, hist(me, `Semaine d’expédition : ${weekLabelOf(pf.etd)} → ${weekLabelOf(a.etd)} (départ ${a.etd})`)],
        };
      });
    case 'setPaymentProof': {
      const proof = { ...a.file, at: nowStamp(), by: me };
      return mapPF(s, a.id, (pf) =>
        a.kind === 'deposit'
          ? { ...pf, depositProof: proof, depositPaid: true, history: [...pf.history, hist(me, `Copie du virement d’acompte déposée (${a.file.name})${pf.depositPaid ? '' : ' · acompte payé'}`)] }
          : { ...pf, balanceProof: proof, balancePaid: true, history: [...pf.history, hist(me, `Copie du virement de solde déposée (${a.file.name})${pf.balancePaid ? '' : ' · solde payé'}`)] },
      );
    }
    case 'deleteContainer':
      return syncProformaStatuses({ ...s, containers: s.containers.filter((c) => c.id !== a.containerId) });
    case 'setAllocationQty':
      return syncProformaStatuses(
        mapC(s, a.containerId, (c) => ({
          ...c,
          planValidated: false,
          planEdited: c.planEdited || isSupplier(currentUser(s)),
          allocations: c.allocations.map((x) => (x.proformaId === a.proformaId && x.productId === a.productId ? { ...x, qty: a.qty } : x)),
        })),
      );
    case 'deallocate':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        planValidated: false,
        planEdited: c.planEdited || isSupplier(currentUser(s)),
        allocations: c.allocations.filter((x) => !(x.proformaId === a.proformaId && x.productId === a.productId)),
      }));
    case 'autoLoad': {
      // Remplit les conteneurs ouverts du fournisseur, puis crée des 40HC pour le reste
      const pf = s.proformas.find((x) => x.id === a.proformaId);
      if (!pf) return s;
      const supplier = s.suppliers.find((x) => x.id === pf.supplierId)!;
      let containers = s.containers.map((c) => ({ ...c, allocations: [...c.allocations] }));
      const touched = new Set<string>();
      const used = (c: Container) => c.allocations.reduce((t, x) => t + lineCbm(byId(s.products, x.productId), x.qty), 0);
      for (const line of pf.lines) {
        const p = byId(s.products, line.productId);
        let remaining = line.qty - allocatedQty(s, pf.id, p.id);
        while (remaining > 0) {
          let c = containers.find(
            (x) => x.supplierId === pf.supplierId && ['a_booker', 'booking_demande'].includes(x.status) && !x.planValidated && CONTAINER_CAPACITY[x.type] - used(x) >= p.cbmCarton,
          );
          if (!c) {
            c = {
              id: nextContainerId(
                s,
                pf.supplierId,
                containers.map((x) => x.id),
              ),
              type: '40HC',
              status: bookingOpen(pf) ? 'booking_demande' : 'a_booker',
              supplierId: pf.supplierId,
              portFrom: supplier.port,
              portTo: 'Le Havre',
              etdPlanned: pf.etd,
              etaPlanned: pf.eta,
              warehouse: 'Péronne',
              forwarder: 'Logfret',
              planValidated: false,
              allocations: [],
              documents: [],
              dateHistory: [hist(me, `Conteneur créé pour ${pf.id}`)],
            };
            containers = [...containers, c];
          }
          const free = Math.floor((CONTAINER_CAPACITY[c.type] - used(c)) / p.cbmCarton) * p.pcb;
          const qty = Math.min(remaining, free);
          if (qty <= 0) break;
          const ex = c.allocations.find((x) => x.proformaId === pf.id && x.productId === p.id);
          if (ex) c.allocations = c.allocations.map((x) => (x === ex ? { ...x, qty: x.qty + qty } : x));
          else c.allocations.push({ proformaId: pf.id, productId: p.id, qty });
          touched.add(c.id);
          remaining -= qty;
        }
      }
      containers = containers.map((c) => (touched.has(c.id) ? { ...c, dateHistory: [...c.dateHistory, hist(me, `Chargement automatique ${pf.id}`)] } : c));
      return syncProformaStatuses({ ...s, containers });
    }
    case 'requestPfBooking': {
      const next = mapPF(s, a.proformaId, (pf) => ({
        ...pf,
        booking: { requestedAt: nowStamp(), requestedBy: me, containers: a.containers, dateWanted: a.dateWanted, forwarder: a.forwarder, note: a.note, reminders: [] },
        history: [...pf.history, hist(me, `Demande de booking envoyée au fournisseur : ${a.containers} × 40HC, chargement souhaité ${a.dateWanted}, transitaire ${a.forwarder}`)],
      }));
      return {
        ...next,
        containers: next.containers.map((c) =>
          c.status === 'a_booker' && c.allocations.some((x) => x.proformaId === a.proformaId)
            ? { ...c, status: 'booking_demande', dateHistory: [...c.dateHistory, hist(me, 'Booking demandé au fournisseur')] }
            : c,
        ),
      };
    }
    case 'remindPfBooking':
      return mapPF(s, a.proformaId, (pf) => ({
        ...pf,
        booking: { ...pf.booking!, reminders: [...pf.booking!.reminders, nowStamp()] },
        history: [...pf.history, hist(me, `Relance booking envoyée ${pf.booking!.ackAt ? `à ${pf.booking!.forwarder} et au fournisseur` : 'au fournisseur'}`)],
      }));
    case 'ackPfBooking': {
      const next = mapPF(s, a.proformaId, (pf) => ({
        ...pf,
        booking: { ...pf.booking!, ackAt: nowStamp(), ackBy: me, readyDate: a.readyDate, ackNote: a.note, reminders: [] },
        history: [...pf.history, hist(me, `Booking pris en compte : marchandise prête le ${a.readyDate}, demande transmise à ${pf.booking!.forwarder}`)],
      }));
      const fwdAck = s.proformas.find((x) => x.id === a.proformaId)!.booking!.forwarder;
      return {
        ...next,
        containers: next.containers.map((c) =>
          ['a_booker', 'booking_demande'].includes(c.status) && c.allocations.some((x) => x.proformaId === a.proformaId)
            ? {
                ...c,
                status: 'booking_demande',
                forwarder: fwdAck,
                planValidated: true,
                planValidatedBy: 'fournisseur',
                planRequested: false,
                planProposed: false,
                booking: { reminders: [], ...(c.booking ?? {}), requestedAt: nowStamp(), requestedBy: me },
                dateHistory: [...c.dateHistory, hist(me, `Demande transmise à ${fwdAck} · marchandise prête le ${a.readyDate}`)],
              }
            : c,
        ),
      };
    }
    case 'cancelPfBooking': {
      const next = mapPF(s, a.proformaId, (pf) => ({ ...pf, booking: undefined, history: [...pf.history, hist(me, 'Demande de booking annulée')] }));
      return {
        ...next,
        containers: next.containers.map((c) => (c.status === 'booking_demande' && c.allocations.some((x) => x.proformaId === a.proformaId) ? { ...c, status: 'a_booker' } : c)),
      };
    }
    case 'proposePfBooking': {
      const u = currentUser(s);
      const enteredBy = isForwarder(u) ? 'transitaire' : isSupplier(u) ? 'fournisseur' : 'jonas';
      const at = nowStamp();
      return mapPF(s, a.proformaId, (pf) => ({
        ...pf,
        booking: {
          ...pf.booking!,
          proposal: {
            at,
            by: me,
            enteredBy,
            carrier: a.carrier,
            bookingNo: a.bookingNo,
            vessel: a.vessel,
            cutoff: a.cutoff,
            loadingDate: a.loadingDate,
            etd: a.etd,
            eta: a.eta,
            note: a.note,
            // Saisie par le fournisseur pour son transitaire : il l'accepte de fait
            supplierOk: enteredBy === 'fournisseur' ? { at, by: me } : undefined,
          },
        },
        history: [
          ...pf.history,
          hist(
            me,
            `Proposition de booking ${enteredBy === 'transitaire' ? `de ${pf.booking!.forwarder}` : `saisie pour ${pf.booking!.forwarder}`} : ${a.carrier} ${a.bookingNo}, départ ${a.etd}, arrivée ${a.eta}`,
          ),
        ],
      }));
    }
    case 'rejectPfBooking': {
      const u = currentUser(s);
      return mapPF(s, a.proformaId, (pf) => {
        const p = pf.booking!.proposal!;
        return {
          ...pf,
          booking: {
            ...pf.booking!,
            proposal: undefined,
            rejections: [...(pf.booking!.rejections ?? []), { at: nowStamp(), by: me, side: isSupplier(u) ? 'fournisseur' : 'jonas', reason: a.reason.trim(), carrier: p.carrier, etd: p.etd }],
          },
          history: [...pf.history, hist(me, `Proposition de booking refusée (${p.carrier}, départ ${p.etd}) : ${a.reason.trim()}`)],
        };
      });
    }
    case 'acceptPfBooking': {
      const u = currentUser(s);
      const at = nowStamp();
      const ok = { at, by: me };
      const pf0 = s.proformas.find((x) => x.id === a.proformaId)!;
      const p0 = pf0.booking!.proposal!;
      // Le pilote peut accepter pour les deux côtés
      const p: BookingProposal = {
        ...p0,
        supplierOk: p0.supplierOk ?? (isSupplier(u) || u.role === 'pilote' ? ok : undefined),
        jonasOk: p0.jonasOk ?? (!isSupplier(u) ? ok : undefined),
      };
      if (!p.supplierOk || !p.jonasOk)
        return mapPF(s, a.proformaId, (pf) => ({
          ...pf,
          booking: { ...pf.booking!, proposal: p },
          history: [...pf.history, hist(me, `Proposition de booking acceptée par ${isSupplier(u) ? 'le fournisseur' : 'JONAS'}`)],
        }));
      // Accepté des deux côtés : booké
      const fwd = pf0.booking!.forwarder ?? 'le transitaire';
      const who = p.enteredBy === 'transitaire' ? `Booké par ${fwd}` : `Booking saisi ${p.enteredBy === 'fournisseur' ? 'par le fournisseur' : 'par JONAS'} pour ${fwd}`;
      const next = mapPF(s, a.proformaId, (pf) => ({
        ...pf,
        etd: p.etd,
        eta: p.eta,
        booking: {
          ...pf.booking!,
          proposal: p,
          answeredAt: at,
          answeredBy: p.by,
          bookedBy: p.enteredBy,
          loadingDate: p.loadingDate,
          etd: p.etd,
          eta: p.eta,
          carrier: p.carrier,
          bookingNo: p.bookingNo,
          vessel: p.vessel,
          cutoff: p.cutoff,
          supplierNote: p.note,
        },
        history: [...pf.history, hist(me, `${who}, accepté par le fournisseur et JONAS : chargement ${p.loadingDate}, départ ${p.etd}, arrivée ${p.eta}`)],
      }));
      return syncProformaStatuses({
        ...next,
        containers: next.containers.map((c) =>
          ['a_booker', 'booking_demande'].includes(c.status) && c.allocations.some((x) => x.proformaId === a.proformaId)
            ? {
                ...c,
                status: 'booke',
                etdPlanned: p.etd,
                etaPlanned: p.eta,
                carrier: p.carrier,
                bookingNo: p.bookingNo,
                forwarder: pf0.booking!.forwarder ?? c.forwarder,
                planValidated: true,
                planValidatedBy: c.planValidatedBy ?? 'fournisseur',
                planRequested: false,
                planProposed: false,
                fwdConfirmedAt: at,
                loading: { date: p.loadingDate, status: 'validated', validatedAt: at },
                booking: { reminders: [], ...(c.booking ?? {}), confirmedAt: at, vessel: p.vessel, cutoff: p.cutoff },
                dateHistory: [...c.dateHistory, hist(me, `${who} · chargement ${p.loadingDate} · ETD ${p.etd} · ETA ${p.eta}`)],
              }
            : c,
        ),
      });
    }
    case 'createContainer': {
      const supplier = s.suppliers.find((x) => x.id === a.supplierId)!;
      const c: Container = {
        id: nextContainerId(s, a.supplierId),
        type: '40HC',
        status: 'a_booker',
        supplierId: a.supplierId,
        portFrom: supplier.port,
        portTo: 'Le Havre',
        etdPlanned: a.etd,
        etaPlanned: a.eta,
        warehouse: 'Péronne',
        forwarder: 'Logfret',
        planValidated: false,
        allocations: [],
        documents: [],
        dateHistory: [hist(me, 'Conteneur créé')],
      };
      return { ...s, containers: [...s.containers, c] };
    }
    case 'validatePlan':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        planValidated: true,
        planProposed: false,
        planRequested: false,
        planValidatedBy: 'jonas',
        planEdited: false,
        dateHistory: [...c.dateHistory, hist(me, c.planProposed ? 'Modifications du fournisseur validées' : 'Plan de chargement validé')],
      }));
    case 'requestBooking': {
      return mapC(s, a.containerId, (c) => {
        const fwd = a.forwarder ?? c.forwarder ?? 'Logfret';
        return {
          ...c,
          status: 'booking_demande',
          forwarder: fwd,
          booking: { reminders: [], ...(c.booking ?? {}), requestedAt: nowStamp(), requestedBy: me, etdWanted: a.etdWanted ?? c.etdPlanned },
          dateHistory: [...c.dateHistory, hist(me, `Demande de booking envoyée à ${fwd}${a.etdWanted ? ` · départ souhaité ${a.etdWanted}` : ''}`)],
        };
      });
    }
    case 'remindBooking':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        booking: { ...(c.booking ?? {}), reminders: [...(c.booking?.reminders ?? []), nowStamp()] },
        dateHistory: [...c.dateHistory, hist(me, `Relance booking envoyée à ${c.forwarder ?? 'transitaire'}`)],
      }));
    case 'cancelBooking':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        status: 'a_booker',
        booking: { reminders: [] },
        dateHistory: [...c.dateHistory, hist(me, 'Demande de booking annulée')],
      }));
    case 'confirmBooking':
      return syncProformaStatuses(
        mapC(s, a.containerId, (c) => ({
          ...c,
          status: 'booke',
          bookingNo: a.bookingNo || c.bookingNo || `BK-${98750 + s.containers.indexOf(c)}`,
          carrier: a.carrier || c.carrier || 'MSC',
          etdPlanned: a.etd ?? c.etdPlanned,
          number: c.number ?? `MSCU${7845300 + s.containers.indexOf(c)}`,
          seal: c.seal ?? `SL${400100 + s.containers.indexOf(c)}`,
          documents: [...new Set([...c.documents, 'Booking confirmation.pdf'])],
          booking: { reminders: [], ...(c.booking ?? {}), confirmedAt: nowStamp(), vessel: a.vessel || c.booking?.vessel, cutoff: a.cutoff ?? c.booking?.cutoff },
          dateHistory: [
            ...c.dateHistory,
            hist(c.forwarder ?? 'Transitaire', `Booking confirmé${a.bookingNo ? ` ${a.bookingNo}` : ''}${a.vessel ? ` · ${a.vessel}` : ''}${a.etd && a.etd !== c.etdPlanned ? ` · ETD ${a.etd}` : ''}`),
          ],
        })),
      );
    case 'ship': {
      const shipped = mapC(s, a.containerId, (c) => ({
        ...c,
        status: 'en_transit',
        etdReal: TODAY,
        // BL, Invoice et Packing List ne sont plus notés d'office : ils doivent être déposés (fournisseur ou transitaire)
        dateHistory: [...c.dateHistory, hist(me, `Départ réel ${TODAY}`)],
      }));
      // Échéance du solde : départ réel + délai du fournisseur
      const ids = new Set(shipped.containers.find((c) => c.id === a.containerId)?.allocations.map((x) => x.proformaId) ?? []);
      const withDue = {
        ...shipped,
        proformas: shipped.proformas.map((pf) => {
          if (!ids.has(pf.id) || pf.balancePaid) return pf;
          const due = addDays(realDeparture(shipped, pf) ?? TODAY, balanceDaysOf(shipped, pf));
          return due === pf.balanceDue ? pf : { ...pf, balanceDue: due, history: [...pf.history, hist('Système', `Échéance du solde recalculée sur le départ réel : ${due}`)] };
        }),
      };
      return syncProformaStatuses(withDue);
    }
    case 'receive': {
      const c = s.containers.find((x) => x.id === a.containerId)!;
      // Quantités reçues : saisies au contrôle, sinon conformes à l'attendu
      const lines: ReceptionLine[] = a.lines ?? c.allocations.map((al) => ({ proformaId: al.proformaId, productId: al.productId, expected: al.qty, received: al.qty }));
      const gaps = lines.filter((l) => l.received !== l.expected);
      let next = mapC(s, a.containerId, (x) => ({
        ...x,
        status: 'arrive',
        etaReal: TODAY,
        receivedOn: TODAY,
        reception: { at: nowStamp(), by: me, lines, note: a.note },
        dateHistory: [...x.dateHistory, hist(me, `Réceptionné à ${x.warehouse}${gaps.length ? ` · ${gaps.length} écart(s)` : ' · conforme'}${a.note ? ` · ${a.note}` : ''}`)],
      }));
      for (const l of lines) {
        next = mapP(next, l.productId, (p) => ({ ...p, stock: { ...p.stock, [c.warehouse]: (p.stock[c.warehouse] ?? 0) + l.received } }));
      }
      return syncProformaStatuses(next);
    }
    case 'setForwarder':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        forwarder: a.forwarder,
        dateHistory: [...c.dateHistory, hist(me, `Transitaire → ${a.forwarder}`)],
      }));
    case 'setCapacity': {
      const capacity = { ...s.settings.capacity };
      if (a.capacity === null) delete capacity[a.designer];
      else capacity[a.designer] = a.capacity;
      return { ...s, settings: { ...s.settings, capacity } };
    }
    case 'setDefaultCapacity':
      return { ...s, settings: { ...s.settings, defaultCapacity: a.capacity } };
    case 'setFx':
      return { ...s, settings: { ...s.settings, fx: { ...s.settings.fx, [a.currency]: a.rate } } };
    case 'setCompany':
      return { ...s, settings: { ...s.settings, company: a.company } };
    case 'setProformaCurrency':
      return mapPF(s, a.id, (pf) => {
        // Même valeur en € : les prix de ligne sont convertis dans la nouvelle devise
        const from = s.settings.fx[pf.currency ?? 'EUR'];
        const to = s.settings.fx[a.currency];
        return {
          ...pf,
          currency: a.currency,
          lines: pf.lines.map((l) => ({ ...l, price: (l.price * from) / to })),
          history: [...pf.history, hist(me, `Devise → ${a.currency}`)],
        };
      });
    case 'startPack':
      return mapP(s, a.productId, (p) => (p.pack.startedAt ? p : { ...p, pack: { ...p.pack, startedAt: nowStamp() } }));
    case 'planPack':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, plannedStart: a.date ?? undefined } }));
    case 'setProductPhoto':
      return mapP(s, a.productId, (p) => withPhotos(p, a.photo ? [a.photo, ...allPhotos(p).slice(1)] : allPhotos(p).slice(1)));
    case 'setProductPhotos':
      return mapP(s, a.productId, (p) => withPhotos(p, a.photos));
    case 'updateProducts': {
      const brands = [...s.brands, ...(a.brands ?? []).filter((b) => !s.brands.some((x) => x.id === b.id))];
      const patches = new Map(a.items.map((i) => [i.productId, i.patch]));
      // Valeurs nouvelles (rayon, collection…) : ajoutées aux listes déroulantes
      const lists = { ...(s.settings.lists ?? {}) };
      for (const { patch } of a.items)
        for (const [k, v] of [
          ['rayon', patch.rayon],
          ['collection', patch.collection],
          ['gender', patch.gender],
          ['material', patch.material],
          ['sizes', patch.sizes],
          ['packType', patch.packType],
        ] as [ListKey, string | undefined][]) {
          const cur = lists[k] ?? listValues(s, k);
          if (v?.trim() && !cur.some((x) => x.toLowerCase() === v.trim().toLowerCase())) lists[k] = [...cur, v.trim()];
        }
      return {
        ...s,
        brands,
        settings: { ...s.settings, lists },
        products: s.products.map((p) => {
          const patch = patches.get(p.id);
          if (!patch) return p;
          const next: Product = { ...p, ...patch };
          if (patch.paSupplier) next.pa = Math.round(patch.paSupplier.price * fxRate(s, patch.paSupplier.currency) * 100) / 100;
          if (patch.description) {
            const en = patch.description.en?.trim();
            const fr = patch.description.fr?.trim();
            next.description = en || fr ? { ...(en ? { en } : {}), ...(fr ? { fr } : {}) } : undefined;
          }
          if (patch.supplierRef !== undefined) next.supplierRef = patch.supplierRef.trim() || undefined;
          // Champs du pack et du développement
          const { packType, designer, artworkDeadline } = patch;
          delete (next as Partial<ProductPatch>).packType;
          delete (next as Partial<ProductPatch>).designer;
          delete (next as Partial<ProductPatch>).artworkDeadline;
          if (packType !== undefined || designer !== undefined || artworkDeadline !== undefined)
            next.pack = {
              ...p.pack,
              ...(packType !== undefined ? { type: packType } : {}),
              ...(designer !== undefined ? { designer } : {}),
              ...(artworkDeadline !== undefined ? { artworkDeadline } : {}),
            };
          if (patch.sizes !== undefined) next.sizes = patch.sizes.trim() || undefined;
          return next;
        }),
      };
    }
    case 'setList':
      return { ...s, settings: { ...s.settings, lists: { ...(s.settings.lists ?? {}), [a.key]: [...new Set(a.values.map((v) => v.trim()).filter(Boolean))] } } };
    case 'renameListValue': {
      const from = a.from.trim().toLowerCase();
      const to = a.to.trim();
      const values = listValues(s, a.key);
      const merged = values.some((v) => v.toLowerCase() === to.toLowerCase() && v.toLowerCase() !== from);
      const list = merged ? values.filter((v) => v.toLowerCase() !== from) : values.map((v) => (v.toLowerCase() === from ? to : v));
      const same = (v?: string) => v?.trim().toLowerCase() === from;
      const products = s.products.map((p) => {
        if (a.key === 'packType') return same(p.pack.type) ? { ...p, pack: { ...p.pack, type: to } } : p;
        const k = a.key;
        return same(p[k]) ? { ...p, [k]: to } : p;
      });
      return { ...s, products, settings: { ...s.settings, lists: { ...(s.settings.lists ?? {}), [a.key]: list } } };
    }
    case 'setBrands':
      return { ...s, brands: a.brands.map((b) => ({ ...b, name: b.name.trim(), tagline: b.tagline.trim() })) };
    case 'setProductText':
      return mapP(s, a.productId, (p) => {
        const en = a.description.en?.trim();
        const fr = a.description.fr?.trim();
        return { ...p, name: a.name.trim(), description: en || fr ? { ...(en ? { en } : {}), ...(fr ? { fr } : {}) } : undefined };
      });
    case 'addProductPhotos': {
      const add = new Map(a.items.map((i) => [i.productId, i.photos]));
      return { ...s, products: s.products.map((p) => (add.has(p.id) ? withPhotos(p, [...allPhotos(p), ...add.get(p.id)!]) : p)) };
    }
    case 'addPackFiles':
      return mapP(s, a.productId, (p) => {
        const files = p.pack.files ?? [];
        const stamp = nowStamp();
        // Numérotation à la suite des versions déjà déclarées (pas de V1 après une V3)
        let version = Math.max(p.pack.artworkVersions, ...files.filter((f) => f.kind === 'pack').map((f) => f.version ?? 0));
        const added: PackFile[] = a.files.map((f) => ({
          ...f,
          kind: a.kind,
          version: a.kind === 'pack' ? ++version : undefined,
          uploadedAt: stamp,
          uploadedBy: me,
        }));
        // Seul le travail du designer (pack, dossier) vaut démarrage du pack ; un die cut déposé = reçu
        const pack = {
          ...p.pack,
          files: [...files, ...added],
          startedAt: a.kind === 'pack' || a.kind === 'crea' ? (p.pack.startedAt ?? stamp) : p.pack.startedAt,
          dieCut: a.kind === 'diecut' ? ('received' as const) : p.pack.dieCut,
        };
        if (a.kind === 'pack') {
          // Nouvelle version du pack = soumise au circuit (Direction)
          // Pack uploadé = envoyé en validation : le circuit (re)part de la Direction, la nouvelle version repasse chez chacun
          const v = { direction: { state: 'pending' as const }, moinard: { state: 'todo' as const }, fournisseur: { state: 'todo' as const } };
          return { ...p, pack: { ...pack, validations: v, sentToSupplier: false, newRequest: undefined, artworkVersions: Math.max(p.pack.artworkVersions, version) } };
        }
        return { ...p, pack };
      });
    case 'requestNewPack':
      return mapP(s, a.productId, (p) => ({
        ...p,
        pack: {
          ...p.pack,
          // Le pack actuel devient la référence « ancien pack » du designer
          files: (p.pack.files ?? []).map((f) => (f.kind === 'pack' ? { ...f, kind: 'oldpack' as const, name: `V${f.version ?? ''} - ${f.name}` } : f)),
          validations: { direction: { state: 'todo' }, moinard: { state: 'todo' }, fournisseur: { state: 'todo' } },
          sentToSupplier: false,
          rejection: undefined,
          newRequest: { at: nowStamp(), by: me, reason: a.reason.trim() },
        },
      }));
    case 'setPackBrief':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, brief: a.brief.trim() || undefined } }));
    case 'removePackFile':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, files: (p.pack.files ?? []).filter((f) => f.id !== a.fileId) } }));
    case 'reassignPack':
      return mapP(s, a.productId, (p) => {
        let deadline = p.pack.artworkDeadline;
        if (a.deadline) deadline = a.deadline;
        else if (a.weekOf) {
          // Même jour ouvré dans la semaine cible
          const day = Math.min(4, (parse(deadline).getUTCDay() + 6) % 7);
          deadline = addDays(weekStart(a.weekOf), day);
        }
        return {
          ...p,
          devDeadline: a.weekOf || a.deadline ? deadline : p.devDeadline,
          pack: { ...p.pack, designer: a.designer ?? p.pack.designer, artworkDeadline: deadline },
        };
      });
    case 'toggleUrgent':
      return mapP(s, a.productId, (p) => ({ ...p, urgent: !p.urgent }));
    case 'markDeveloped':
      return mapP(s, a.productId, (p) => ({ ...p, developed: true, devForced: true, urgent: false, devStage: DEV_STAGES.length - 1, nextAction: 'Passer commande' }));
    case 'advanceDev':
      return mapP(s, a.productId, (p) => {
        const devStage = Math.min(p.devStage + 1, DEV_STAGES.length - 1);
        const developed = devStage >= DEV_STAGES.length - 2; // lancé = référencé
        return {
          ...p,
          devStage,
          developed,
          nextAction: developed ? 'Passer commande' : ['Valider le brief', 'Valider le concept', 'Recevoir l’échantillon', 'Valider l’échantillon', 'Négocier le prix', 'Lancer'][devStage],
        };
      });
    case 'reviseEta':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        etaRevised: a.eta,
        dateHistory: [...c.dateHistory, hist(me, `ETA révisée : ${containerEta(c)} → ${a.eta}`)],
      }));
    case 'fwdConfirm':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        number: a.number,
        seal: a.seal || c.seal,
        etdPlanned: a.etd,
        fwdConfirmedAt: nowStamp(),
        booking: { reminders: [], ...(c.booking ?? {}), vessel: a.vessel, cutoff: a.cutoff ?? c.booking?.cutoff },
        dateHistory: [...c.dateHistory, hist(me, `Conteneur ${a.number}${a.seal ? ` · plomb ${a.seal}` : ''} · ${a.vessel} · ETD ${a.etd}`)],
      }));
    case 'portArrival':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        etaReal: TODAY,
        dateHistory: [...c.dateHistory, hist(me, `Arrivé au port de ${c.portTo} le ${TODAY}`)],
      }));
    case 'setCustoms':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        customs: a.status,
        dateHistory: [...c.dateHistory, hist(me, a.status === 'dedouane' ? 'Marchandise dédouanée' : 'Dédouanement lancé')],
      }));
    case 'planDelivery':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        deliveryDate: a.date,
        dateHistory: [...c.dateHistory, hist(me, `Livraison planifiée à ${c.warehouse} le ${a.date}`)],
      }));
  }
}

// ---------------------------------------------------------------------------
// Journal d'activité : chaque action acceptée est tracée (qui, quoi, quand)

const JOURNAL_MAX = 3000;
let journalSeq = Date.now();

function describe(s: State, a: Action): { target?: string; text: string } | null {
  const ref = (id: string) => s.products.find((p) => p.id === id)?.ref ?? id;
  const ctn = (id: string) => s.containers.find((x) => x.id === id)?.number ?? id;
  switch (a.type) {
    case 'login':
    case 'reset':
      return null;
    case 'signProforma':
      return { target: a.id, text: `Proforma signée et tamponnée (expédition demandée ${a.etdWanted})` };
    case 'createProforma':
      return { target: a.id, text: `Nouvelle proforma ${a.id} : ${a.title}${a.file ? ' (déposée par le fournisseur)' : ''}` };
    case 'cancelProforma':
      return { target: a.id, text: `Proforma annulée : ${a.reason.trim()}` };
    case 'restoreProforma':
      return { target: a.id, text: 'Proforma rétablie' };
    case 'cancelLine':
      return { target: a.id, text: `Produit ${ref(a.productId)} annulé sur la proforma${a.reason?.trim() ? ` : ${a.reason.trim()}` : ''}` };
    case 'restoreLine':
      return { target: a.id, text: `Produit ${ref(a.productId)} rétabli sur la proforma` };
    case 'deleteProforma':
      return { target: a.id, text: 'Proforma supprimée définitivement' };
    case 'cancelOrder':
      return { target: a.id, text: 'Commande JONAS annulée avant proforma' };
    case 'setProductPhoto':
      return { target: a.productId, text: a.photo ? 'Photo du produit ajoutée' : 'Photo du produit retirée' };
    case 'setProductPhotos':
      return { target: a.productId, text: `Photos du produit : ${a.photos.length}` };
    case 'setProductText':
      return { target: a.productId, text: `Désignation et description mises à jour : ${a.name.trim()}` };
    case 'setList':
      return { text: `Liste « ${LIST_LABELS[a.key]} » : ${a.values.length} valeur(s)` };
    case 'renameListValue':
      return { text: `${LIST_LABELS[a.key]} : « ${a.from} » renommé en « ${a.to} » (${listUsage(s, a.key, a.from)} produit(s))` };
    case 'setBrands':
      return { text: `Marques : ${a.brands.map((b) => b.name).join(', ') || 'aucune'}` };
    case 'updateProducts': {
      if (a.items.length === 1) {
        const fields = Object.keys(a.items[0].patch).map((k) => PATCH_LABELS[k as keyof ProductPatch] ?? k);
        return { target: a.items[0].productId, text: `Fiche produit modifiée${a.source === 'excel' ? ' (import Excel)' : ''} : ${fields.join(', ')}` };
      }
      return { text: `${a.items.length} fiches produit mises à jour${a.source === 'excel' ? ' par import Excel' : ''}` };
    }
    case 'addProductPhotos': {
      const n = a.items.reduce((t, i) => t + i.photos.length, 0);
      return { target: a.items.length === 1 ? a.items[0].productId : undefined, text: `${n} photo(s) importée(s) pour ${a.items.length} produit(s)` };
    }
    case 'updateSupplier':
      return { target: a.supplier.id, text: `Fournisseur modifié : ${a.supplier.name}` };
    case 'addSupplier':
      return { target: a.supplier.id, text: `Nouveau fournisseur : ${a.supplier.name} (${a.supplier.city}, ${a.supplier.country})` };
    case 'logSupplierMail':
      return {
        target: a.proformaId ?? a.supplierId,
        text: a.demo ? `E-mail fournisseur préparé (démo) : ${a.subject}` : a.ok ? `E-mail envoyé à ${a.to.join(', ')} : ${a.subject}` : `Échec de l'envoi : ${a.subject}`,
      };
    case 'setSupplierLogo':
      return { target: a.supplierId, text: `${s.suppliers.find((x) => x.id === a.supplierId)?.shortName} : logo ${a.logo ? 'mis à jour' : 'retiré'}` };
    case 'setSupplierTerms':
      return { text: `${s.suppliers.find((x) => x.id === a.supplierId)?.shortName} : devise ${a.terms.currency}, acompte ${a.terms.depositPct} %, solde J+${a.terms.balanceDays}` };
    case 'requestSplit':
      return { target: a.id, text: `Demande d'expédition partielle : ${a.reason}` };
    case 'acceptSplit':
      return { target: a.id, text: 'Expédition partielle acceptée : reliquat créé' };
    case 'refuseSplit':
      return { target: a.id, text: a.reason ? `Expédition partielle refusée : ${a.reason}` : 'Demande d’expédition partielle annulée' };
    case 'uploadProforma':
      return { target: a.id, text: a.reason ? `Demande de modification déposée : ${a.reason}` : `Proforma déposée (${a.name})` };
    case 'refuseProformaVersion':
      return { target: a.id, text: `Version de proforma refusée : ${a.reason}` };
    case 'setProformaStatus':
      return { target: a.id, text: `Statut → ${PROFORMA_STATUS_LABEL[a.status]}` };
    case 'payDeposit':
      return { target: a.id, text: 'Acompte payé' };
    case 'payBalance':
      return { target: a.id, text: 'Solde payé' };
    case 'validatePack': {
      const p = s.products.find((x) => x.id === a.productId);
      const st = p && VALIDATION_STEPS.find((v) => p.pack.validations[v].state !== 'done');
      return { target: ref(a.productId), text: `Pack validé${st ? ` (étape ${VALIDATION_LABELS[st]})` : ''}` };
    }
    case 'rejectPack':
      return { target: ref(a.productId), text: `Pack refusé, retour au designer${a.reason?.trim() ? ` — modifications demandées : ${a.reason.trim()}` : ''}` };
    case 'requestDieCut':
      return { target: ref(a.productId), text: 'Die cut demandé' };
    case 'receiveDieCut':
      return { target: ref(a.productId), text: 'Die cut reçu' };
    case 'uploadArtwork':
      return { target: ref(a.productId), text: 'Nouvelle version d’artwork' };
    case 'forwardPack':
      return { target: ref(a.productId), text: 'Pack transmis au fournisseur' };
    case 'allocate':
      return { target: ctn(a.containerId), text: `${a.qty} pcs ${ref(a.productId)} affectées (${a.proformaId})` };
    case 'deallocate':
      return { target: ctn(a.containerId), text: `${ref(a.productId)} retiré du conteneur` };
    case 'setProformaEtd': {
      const pf = s.proformas.find((x) => x.id === a.id);
      return { target: a.id, text: `Semaine d’expédition : ${pf ? weekLabelOf(pf.etd) : ''} → ${weekLabelOf(a.etd)}` };
    }
    case 'setPaymentProof':
      return { target: a.id, text: `Copie du virement ${a.kind === 'deposit' ? 'd’acompte' : 'de solde'} déposée : ${a.file.name}` };
    case 'deleteContainer': {
      const c = s.containers.find((x) => x.id === a.containerId);
      const n = c?.allocations.reduce((t, x) => t + x.qty, 0) ?? 0;
      return { text: `Conteneur ${c?.number ?? a.containerId} supprimé${n ? ` (${n} pcs remises à affecter)` : ''}` };
    }
    case 'setAllocationQty':
      return { target: ctn(a.containerId), text: `${ref(a.productId)} : ${a.qty} pcs dans le conteneur (${a.proformaId})` };
    case 'createContainer':
      return { text: 'Conteneur créé' };
    case 'autoLoad':
      return { text: `Plan de chargement préparé pour ${a.proformaId}` };
    case 'requestPfBooking':
      return { text: `${a.proformaId} : booking demandé au fournisseur (${a.containers} × 40HC, ${a.dateWanted})` };
    case 'remindPfBooking':
      return { text: `${a.proformaId} : relance booking` };
    case 'cancelPfBooking':
      return { text: `${a.proformaId} : demande de booking annulée` };
    case 'ackPfBooking':
      return { text: `${a.proformaId} : booking pris en compte par le fournisseur (marchandise prête le ${a.readyDate})` };
    case 'proposePfBooking':
      return { text: `${a.proformaId} : proposition de booking ${a.carrier} ${a.bookingNo} (départ ${a.etd})` };
    case 'acceptPfBooking':
      return { text: `${a.proformaId} : proposition de booking acceptée` };
    case 'rejectPfBooking':
      return { text: `${a.proformaId} : proposition de booking refusée (${a.reason})` };
    case 'validatePlan':
      return { target: ctn(a.containerId), text: 'Plan de chargement validé' };
    case 'requestPlan':
      return { target: ctn(a.containerId), text: 'Plan de chargement demandé au fournisseur' };
    case 'proposePlan':
      return { target: ctn(a.containerId), text: 'Plan de chargement modifié par le fournisseur' };
    case 'acceptPlan':
      return { target: ctn(a.containerId), text: 'Plan de chargement validé par le fournisseur' };
    case 'proposeLoadingDate':
      return { target: ctn(a.containerId), text: `Date de chargement proposée : ${a.date}` };
    case 'answerLoadingDate': {
      const prev = s.containers.find((c) => c.id === a.containerId)?.loading?.date;
      return { target: ctn(a.containerId), text: prev && prev !== a.date ? `Date de chargement changée par le fournisseur : ${a.date}` : `Date de chargement validée : ${a.date}` };
    }
    case 'setPackCheck':
      return { target: ref(a.productId), text: `Contrôle du pack v${a.check.version} : ${a.check.verdict === 'conforme' ? 'conforme' : a.check.verdict === 'a_corriger' ? 'à corriger' : 'non conforme'}` };
    case 'setLabelAdvice':
      return { target: ref(a.productId), text: `Avis d'étiquetage : ${a.advice.category}` };
    case 'setContainerNumber':
      return { target: a.containerId, text: `N° de conteneur ${a.number}${a.seal ? ` · plomb ${a.seal}` : ''}` };
    case 'addContainerDoc':
      return { target: ctn(a.containerId), text: `Document déposé : ${a.doc}` };
    case 'requestBooking':
      return { target: ctn(a.containerId), text: `Booking demandé à ${a.forwarder ?? s.containers.find((c) => c.id === a.containerId)?.forwarder ?? 'transitaire'}` };
    case 'remindBooking':
      return { target: ctn(a.containerId), text: 'Relance booking' };
    case 'cancelBooking':
      return { target: ctn(a.containerId), text: 'Demande de booking annulée' };
    case 'confirmBooking':
      return { target: ctn(a.containerId), text: 'Booking confirmé' };
    case 'ship':
      return { target: ctn(a.containerId), text: 'Départ (en transit)' };
    case 'receive': {
      const gaps = (a.lines ?? []).filter((l) => l.received !== l.expected).length;
      return { target: ctn(a.containerId), text: `Réception${gaps ? ` avec ${gaps} écart(s)` : ' conforme'}` };
    }
    case 'reviseEta':
      return { target: ctn(a.containerId), text: `ETA révisée au ${a.eta}` };
    case 'fwdConfirm':
      return { target: ctn(a.containerId), text: `N° de conteneur ${a.number} saisi par le transitaire` };
    case 'setCustoms':
      return { target: ctn(a.containerId), text: a.status === 'dedouane' ? 'Dédouané' : 'Dédouanement lancé' };
    case 'portArrival':
      return { target: ctn(a.containerId), text: 'Arrivé au port' };
    case 'planDelivery':
      return { target: ctn(a.containerId), text: `Livraison planifiée le ${a.date}` };
    case 'advanceDev':
      return { target: ref(a.productId), text: 'Développement : étape suivante' };
    case 'toggleUrgent': {
      const p = s.products.find((x) => x.id === a.productId);
      return { target: ref(a.productId), text: p?.urgent ? 'Retiré de PUSH URGENT' : 'Poussé en urgent' };
    }
    case 'markDeveloped':
      return { target: ref(a.productId), text: 'Marqué développé' };
    case 'reassignPack':
      return {
        target: ref(a.productId),
        text: a.deadline ? `Date de rendu artwork → ${a.deadline}` : `Réaffecté${a.designer ? ` à ${a.designer}` : ''}${a.weekOf ? ` · semaine du ${a.weekOf}` : ''}`,
      };
    case 'startPack':
      return { target: ref(a.productId), text: 'Pack commencé' };
    case 'planPack':
      return { target: ref(a.productId), text: a.date ? `Début prévu le ${a.date}` : 'Début prévu retiré' };
    case 'addPackFiles': {
      const where: Record<PackFileKind, string> = { brief: 'au brief marketing', diecut: 'au die cut', oldpack: 'à l’ancien pack', pack: '', crea: 'au dossier pack', quality: 'aux fiches qualité' };
      return { target: ref(a.productId), text: a.kind === 'pack' ? `Pack uploadé (${a.files[0]?.name ?? ''})` : `${a.files.length} fichier(s) ajouté(s) ${where[a.kind]}` };
    }
    case 'setPackBrief':
      return { target: ref(a.productId), text: 'Brief marketing mis à jour' };
    case 'requestNewPack':
      return { target: ref(a.productId), text: `Nouveau pack demandé : ${a.reason.trim()}` };
    case 'removePackFile':
      return { target: ref(a.productId), text: 'Fichier supprimé' };
    case 'setUserRole':
      return { target: a.userId, text: `Rôle → ${a.role}` };
    case 'toggleUser':
      return { target: a.userId, text: 'Compte activé / désactivé' };
    case 'setCapacity':
      return { target: a.designer, text: a.capacity === null ? 'Capacité par défaut' : `Capacité → ${a.capacity} packs / semaine` };
    case 'setDefaultCapacity':
      return { text: `Capacité par défaut → ${a.capacity} packs / semaine` };
    case 'setFx':
      return { text: `Cours ${a.currency} → ${a.rate} €` };
    case 'setCompany':
      return { text: `Tampon société : ${a.company.name} · TVA ${a.company.vat || '—'}` };
    case 'setProformaCurrency':
      return { target: a.id, text: `Devise → ${a.currency}` };
    case 'setForwarder':
      return { target: ctn(a.containerId), text: `Transitaire → ${a.forwarder}` };
  }
  return null;
}

/**
 * Lien packs → proforma : une proforma « En dev » passe « En production » dès que les packs
 * de tous ses produits sont validés (Direction, Moinard, Fournisseur). Si un pack est rouvert
 * (nouveau pack, refus, nouvelle version) avant le booking, elle revient « En dev ».
 */
export function syncPackStatuses(prev: State, next: State, a?: Action): State {
  if (a?.type === 'setProformaStatus') return next; // un statut posé à la main reste tel quel
  if (prev.products === next.products && prev.proformas === next.proformas) return next;
  const before = new Map(prev.products.map((p) => [p.id, p]));
  const ids = new Set(next.products.filter((p) => before.get(p.id) !== p).map((p) => p.id));
  // proformas qui viennent d'entrer « En dev » (signature) : les packs sont peut-être déjà validés
  const prevStatus = new Map(prev.proformas.map((pf) => [pf.id, pf.status]));
  const entered = new Set(next.proformas.filter((pf) => pf.status === 'en_dev' && prevStatus.get(pf.id) !== 'en_dev').map((pf) => pf.id));
  if (!ids.size && !entered.size) return next;
  const doneNow = (id: string) => {
    const p = next.products.find((x) => x.id === id);
    return !!p && packDone(p);
  };
  let touched = false;
  const proformas = next.proformas.map((pf) => {
    if (!pf.lines.length || (!entered.has(pf.id) && !pf.lines.some((l) => ids.has(l.productId)))) return pf;
    const allDone = pf.lines.every((l) => doneNow(l.productId));
    if (pf.status === 'en_dev' && allDone) {
      touched = true;
      return { ...pf, status: 'en_production' as const, history: [...pf.history, hist('Système', `Tous les packs validés (${pf.lines.length}/${pf.lines.length}) : statut → En production`)] };
    }
    if (pf.status === 'en_production' && !pf.booking && !allDone) {
      const reopened = pf.lines.map((l) => before.get(l.productId)).filter((p): p is Product => !!p && ids.has(p.id) && packDone(p) && !doneNow(p.id));
      if (!reopened.length) return pf;
      touched = true;
      return { ...pf, status: 'en_dev' as const, history: [...pf.history, hist('Système', `Pack rouvert (${reopened.map((p) => p.ref).join(', ')}) : statut → En dev`)] };
    }
    return pf;
  });
  return touched ? { ...next, proformas } : next;
}

/** Produits dont une proforma est signée (hors proformas annulées) */
function signedProductIds(s: State) {
  const ids = new Set<string>();
  for (const pf of s.proformas) if (pf.status !== 'a_signer' && !pf.cancelled) for (const l of pf.lines) ids.add(l.productId);
  return ids;
}

/** Développé si : forcé à la main, ou étape ≥ Lancement, ou pack validé (Direction, Moinard, fournisseur) ET proforma signée */
export function devStatusOf(p: Product, signed: Set<string>): boolean {
  return !!p.devForced || p.devStage >= DEV_STAGES.length - 2 || (packDone(p) && signed.has(p.id));
}

/** Recalcule « Développé / En dév. » des produits ; les anciens produits déjà développés restent développés (forcés) */
export function syncDevStatus(s: State): State {
  const signed = signedProductIds(s);
  let touched = false;
  const products = s.products.map((p) => {
    // Anciennes fiches sans « devForced » : un produit déjà développé le reste
    const forced = p.devForced ?? p.developed;
    const developed = devStatusOf({ ...p, devForced: forced }, signed);
    if (developed === p.developed) return p; // rien n'est réécrit tant que le statut ne change pas
    touched = true;
    return { ...p, devForced: forced, developed, nextAction: developed ? 'Passer commande' : p.nextAction };
  });
  return touched ? { ...s, products } : s;
}

export function reducer(s: State, a: Action): State {
  const next = syncDevStatus(syncPackStatuses(s, applyAction(s, a), a));
  if (next === s) return s;
  const d = describe(s, a);
  if (!d) return next;
  const u = currentUser(s);
  const entry: JournalEntry = { id: ++journalSeq, at: nowStamp(), user: u.name, role: u.role, type: a.type, ...d };
  return { ...next, journal: [entry, ...(next.journal ?? [])].slice(0, JOURNAL_MAX) };
}

export const StoreContext = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider manquant');
  return { state: viewState(ctx.state), dispatch: ctx.dispatch };
}

// ---------------------------------------------------------------------------
// Libellés
export const PROFORMA_STATUS_LABEL: Record<ProformaStatus, string> = {
  a_signer: 'À signer',
  en_dev: 'En dev',
  en_production: 'En production',
  booke: 'Booké',
  en_transit: 'En transit',
  arrive: 'Arrivé',
};
export const CONTAINER_STATUS_LABEL: Record<ContainerStatus, string> = {
  a_booker: 'À booker',
  booking_demande: 'Booking demandé',
  booke: 'Booké',
  en_transit: 'En transit',
  arrive: 'Arrivé',
};

// ---------------------------------------------------------------------------
// Sélecteurs / règles de calcul

/** Libellés des listes de la fiche produit */
export const LIST_LABELS: Record<ListKey, string> = { rayon: 'Rayons', collection: 'Collections', gender: 'Genres', material: 'Matières', sizes: 'Tailles', packType: 'Types de pack' };
/** Valeurs proposées au départ (avant toute personnalisation dans Paramètres) */
const DEFAULT_LISTS: Record<ListKey, string[]> = {
  rayon: ['Accessoires', 'Bagagerie', 'Beauté', 'Chaussures', 'Divers', 'Jardin', 'Maison', 'Parfumerie'],
  collection: ['Nouveauté', 'Permanent'],
  gender: ['Femme', 'Homme', 'Mixte', 'Enfant', 'Bébé'],
  material: ['À préciser', 'ABS', 'Bambou', 'Bois', 'Céramique', 'Coton', 'Cuir', 'EVA', 'Métal', 'Papier / carton', 'Plastique', 'Polycarbonate', 'Polyester', 'PVC', 'Textile', 'Verre'],
  sizes: [],
  packType: ['À définir', 'Bandeau', 'Boîte', 'Boîte + papier de soie', 'Carte + crochet', 'Carton imprimé', 'Coffret rigide', 'Étiquette volante', 'Étui', 'Hangtag', 'Polybag'],
};
const PRODUCT_FIELD: Record<ListKey, (p: Product) => string | undefined> = {
  rayon: (p) => p.rayon,
  collection: (p) => p.collection,
  gender: (p) => p.gender,
  material: (p) => p.material,
  sizes: (p) => p.sizes,
  packType: (p) => p.pack.type,
};
/** Valeurs d'une liste de la fiche : celles des Paramètres (sinon par défaut), plus celles déjà utilisées */
export function listValues(s: State, key: ListKey): string[] {
  const base = s.settings.lists?.[key] ?? DEFAULT_LISTS[key];
  const used = s.products.map(PRODUCT_FIELD[key]).filter((v): v is string => !!v?.trim());
  const out: string[] = [];
  for (const v of [...base, ...used]) if (!out.some((x) => x.toLowerCase() === v.trim().toLowerCase())) out.push(v.trim());
  return out;
}
/** Nombre de produits qui utilisent une valeur de liste */
export const listUsage = (s: State, key: ListKey, v: string) => s.products.filter((p) => PRODUCT_FIELD[key](p)?.toLowerCase() === v.toLowerCase()).length;

/**
 * Espace pack : qui dépose quoi.
 * Brief : marketing (Pilote, Direction, acheteurs). Die cut, ancien pack, fiches qualité : idem + le fournisseur du produit.
 * Pack et dossier pack : le designer du produit (et le Pilote).
 */
export function canPackFiles(s: State, u: User, productId: string, kind: PackFileKind) {
  const p = s.products.find((x) => x.id === productId);
  if (!p || !u.active) return false;
  if (kind === 'pack' || kind === 'crea') return u.role === 'pilote' || (u.role === 'designer' && u.designerName === p.pack.designer);
  if (kind === 'brief') return canEditProduct(u);
  return canEditProduct(u) || (isSupplier(u) && u.supplierId === p.supplierId);
}

/** Pack validé par tout le circuit : pack, die cut et documents verrouillés (plus de suppression) */
export const packFileLocked = (p: Product, kind: PackFileKind) => packDone(p) && (kind === 'pack' || kind === 'diecut' || kind === 'quality');
/** Demande de nouveau pack : Direction et acheteurs (et le Pilote) */
export const canRequestNewPack = (u: User) => u.active && ['direction', 'acheteur', 'pilote'].includes(u.role);

/** Suivi du pack (page Développement) : die cut manquant, et où en est le pack */
export type PackTrack = 'a_faire' | 'attente' | 'a_refaire' | 'valide';
export const PACK_TRACK_LABELS: Record<PackTrack, string> = { a_faire: 'Pack à faire', attente: 'Pack en attente de validation', a_refaire: 'Pack à refaire', valide: 'Pack validé' };
export function packTrack(p: Product): { dieCutMissing: boolean; status: PackTrack } {
  const files = p.pack.files ?? [];
  const dieCutMissing = !files.some((f) => f.kind === 'diecut') && p.pack.dieCut !== 'received';
  const lastPack = Math.max(p.pack.artworkVersions, ...files.filter((f) => f.kind === 'pack').map((f) => f.version ?? 0));
  const hasPack = files.some((f) => f.kind === 'pack') || (!p.pack.newRequest && p.pack.artworkVersions > 0);
  let status: PackTrack = 'a_faire';
  if (packDone(p)) status = 'valide';
  else if (p.pack.rejection && p.pack.rejection.version >= lastPack) status = 'a_refaire';
  else if (hasPack && VALIDATION_STEPS.some((st) => p.pack.validations[st].state !== 'todo')) status = 'attente';
  return { dieCutMissing, status };
}

/** Filtre « Suivi pack » : tous, die cut manquant, ou un statut du pack */
export type TrackFilter = 'all' | 'diecut' | PackTrack;
export const TRACK_ORDER: Record<PackTrack, number> = { a_refaire: 0, attente: 1, a_faire: 2, valide: 3 };
/** Filtres « Suivi pack » (avec compteurs) */
export const TRACK_CHIPS: readonly (readonly [TrackFilter, string, string])[] = [
  ['all', 'Tous', ''],
  ['diecut', 'Die cut manquant', 'red'],
  ['attente', 'Pack en attente de validation', 'orange'],
  ['a_refaire', 'Pack à refaire', 'red'],
  ['valide', 'Pack validé', 'green'],
] as const;

export const matchTrack = (p: Product, f: TrackFilter) => f === 'all' || (f === 'diecut' ? packTrack(p).dieCutMissing : packTrack(p).status === f);

/** Fiches produit : Pilote, Direction et acheteurs */
export const canEditProduct = (u: User) => u.active && ['pilote', 'direction', 'acheteur'].includes(u.role);

export const PATCH_LABELS: Record<keyof ProductPatch, string> = {
  ref: 'Réf. interne',
  ean: 'EAN',
  supplierRef: 'Réf. fournisseur',
  name: 'Désignation',
  brandId: 'Marque',
  supplierId: 'Fournisseur',
  rayon: 'Rayon',
  collection: 'Collection',
  gender: 'Genre',
  material: 'Matière',
  sizes: 'Tailles',
  paSupplier: 'PA unitaire',
  packType: 'Type de pack',
  designer: 'Designer',
  artworkDeadline: 'Date limite artwork',
  devStage: 'Étape de développement',
  devDeadline: 'Date limite développement',
  nextAction: 'Prochaine action',
  targetQty: 'Quantité cible',
  pcb: 'PCB',
  weight: 'Poids unitaire',
  cbmCarton: 'CBM carton',
  description: 'Description',
};

/**
 * Contrôle de modifications de fiches : réf. et EAN uniques (EAN-13 valide), désignation non vide,
 * nombres positifs, fournisseur et marque connus. Rend la liste des erreurs (vide si tout est bon).
 */
export function productPatchErrors(s: State, items: { productId: string; patch: ProductPatch }[], newBrands: Brand[] = []): string[] {
  const errs: string[] = [];
  const ids = new Set(items.map((i) => i.productId));
  const patchOf = new Map(items.map((i) => [i.productId, i.patch]));
  // Réf. et EAN après modification, pour vérifier l'unicité sur tout le catalogue
  const refs = new Map<string, string>();
  const eans = new Map<string, string>();
  for (const p of s.products) {
    const patch = patchOf.get(p.id);
    const ref = refKey(patch?.ref ?? p.ref);
    const ean = patch?.ean ?? p.ean;
    if (refs.has(ref) && (ids.has(p.id) || ids.has(refs.get(ref)!))) errs.push(`Réf. ${patch?.ref ?? p.ref} : déjà utilisée par ${refs.get(ref)}`);
    else refs.set(ref, p.id);
    if (ean && eans.has(ean) && (ids.has(p.id) || ids.has(eans.get(ean)!))) errs.push(`EAN ${ean} : déjà utilisé par ${eans.get(ean)}`);
    else if (ean) eans.set(ean, p.id);
  }
  const brands = new Set([...s.brands.map((b) => b.id), ...newBrands.map((b) => b.id), ...s.products.map((p) => p.brandId)]);
  for (const { productId, patch } of items) {
    const p = s.products.find((x) => x.id === productId);
    if (!p) {
      errs.push(`${productId} : produit inconnu`);
      continue;
    }
    const tag = patch.ref ?? p.ref;
    if (patch.ref !== undefined && !patch.ref.trim()) errs.push(`${tag} : réf. interne vide`);
    if (patch.name !== undefined && !patch.name.trim()) errs.push(`${tag} : désignation vide`);
    if (patch.ean !== undefined && !(/^\d{13}$/.test(patch.ean) && eanCheck(patch.ean.slice(0, 12)) === patch.ean[12])) errs.push(`${tag} : EAN ${patch.ean} invalide (13 chiffres, clé de contrôle)`);
    if (patch.supplierId !== undefined && !s.suppliers.some((x) => x.id === patch.supplierId)) errs.push(`${tag} : fournisseur inconnu`);
    if (patch.brandId !== undefined && !brands.has(patch.brandId)) errs.push(`${tag} : marque inconnue`);
    if (patch.pcb !== undefined && !(Number.isInteger(patch.pcb) && patch.pcb > 0)) errs.push(`${tag} : PCB invalide`);
    if (patch.cbmCarton !== undefined && !(patch.cbmCarton > 0)) errs.push(`${tag} : CBM carton invalide`);
    if (patch.weight !== undefined && !(patch.weight >= 0)) errs.push(`${tag} : poids invalide`);
    if (patch.designer !== undefined && !s.users.some((x) => x.role === 'designer' && x.designerName === patch.designer)) errs.push(`${tag} : designer inconnu`);
    for (const d of [patch.artworkDeadline, patch.devDeadline]) if (d !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d)) errs.push(`${tag} : date invalide`);
    if (patch.devStage !== undefined && !(Number.isInteger(patch.devStage) && patch.devStage >= 0 && patch.devStage < DEV_STAGES.length)) errs.push(`${tag} : étape de développement invalide`);
    if (patch.targetQty !== undefined && !(Number.isInteger(patch.targetQty) && patch.targetQty >= 0)) errs.push(`${tag} : quantité cible invalide`);
    if (patch.paSupplier && !(patch.paSupplier.price >= 0 && ['EUR', 'USD', 'CNY'].includes(patch.paSupplier.currency))) errs.push(`${tag} : PA invalide`);
  }
  return errs;
}

/** Photos d'un produit, la principale en premier */
export const allPhotos = (p: Pick<Product, 'photo' | 'photos'>): ProductPhoto[] => [...(p.photo ? [p.photo] : []), ...(p.photos ?? [])];
/** Produit avec cette galerie (doublons retirés ; la première devient la principale) */
function withPhotos(p: Product, list: ProductPhoto[]): Product {
  const seen = new Set<string>();
  const uniq = list.filter((x) => !seen.has(x.fileId) && seen.add(x.fileId));
  return { ...p, photo: uniq[0], photos: uniq.length > 1 ? uniq.slice(1) : undefined };
}
/** Photos d'un produit : équipe JONAS (hors finance et transitaires) ; un fournisseur pour ses produits */
function canEditPhotos(s: State, u: User, productId: string) {
  const p = s.products.find((x) => x.id === productId);
  if (!p || !u.active) return false;
  if (isSupplier(u)) return p.supplierId === u.supplierId;
  return !['transitaire', 'finance'].includes(u.role);
}

export const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;
/** Marque d'un produit ; une marque absente de la liste (base vierge) s'affiche sans bloquer l'écran */
/** Designer d'un pack pas encore attribué */
export const UNASSIGNED = 'À attribuer';
export const brandOf = (brands: Brand[], id: string): Brand => brands.find((b) => b.id === id) ?? { id, name: id === 'jonas' ? 'JONAS' : id ? id.toUpperCase() : 'À définir', tagline: '' };

export function lineCbm(p: Product, qty: number) {
  return (qty / p.pcb) * p.cbmCarton;
}

export type PackState = 'ok' | 'en_cours' | 'a_faire';

/** Créer un fournisseur : l'équipe achats (pilote, Direction, acheteurs) */
export const canAddSupplier = (u: User) => u.active && !isSupplier(u) && u.role !== 'transitaire' && (u.role === 'pilote' || can(u, 'proforma.edit') || can(u, 'proforma.sign'));

/** Identifiant libre pour un nouveau fournisseur, tiré de son nom */
export function newSupplierId(s: State, name: string) {
  const base =
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20) || 'fournisseur';
  let id = base;
  for (let i = 2; s.suppliers.some((x) => x.id === id); i++) id = `${base}${i}`;
  return id;
}

/** Un pack est terminé uniquement après les quatre validations. */
export function packState(p: Product): PackState {
  const done = VALIDATION_STEPS.filter((s) => p.pack.validations[s].state === 'done').length;
  if (done === VALIDATION_STEPS.length) return 'ok';
  // « En cours » seulement quand le designer a commencé (bouton Commencer) ou déposé un pack
  const started = !!p.pack.startedAt || p.pack.artworkVersions > 0 || (p.pack.files ?? []).some((f) => f.kind === 'pack' || f.kind === 'crea');
  return done > 0 || started ? 'en_cours' : 'a_faire';
}
export function packDone(p: Product) {
  return packState(p) === 'ok';
}
export function packLate(p: Product) {
  return !packDone(p) && p.pack.artworkDeadline < TODAY;
}
export function currentValidator(p: Product): ValidationStep | null {
  return VALIDATION_STEPS.find((s) => p.pack.validations[s].state !== 'done') ?? null;
}
export function currentValidatorLabel(p: Product) {
  const s = currentValidator(p);
  return s ? VALIDATION_LABELS[s] : null;
}

/** Charge utile maximale (kg) par type de conteneur */
export const CONTAINER_PAYLOAD: Record<Container['type'], number> = { '40HC': 26500, '40': 26700, '20': 21700 };
/** Poids de la marchandise chargée (kg) */
export function containerWeight(s: State, c: Container) {
  return c.allocations.reduce((sum, a) => sum + a.qty * (s.products.find((p) => p.id === a.productId)?.weight ?? 0), 0);
}

/** Capacité hebdomadaire d'un designer (packs) */
export const capacityOf = (s: State, designer: string) => s.settings?.capacity?.[designer] ?? s.settings?.defaultCapacity ?? 40;

/** Cours de la devise de la proforma (1 unité = x €) */
export const fxOf = (s: State, pf: Proforma) => s.settings?.fx?.[pf.currency ?? 'EUR'] ?? 1;

export function proformaTotals(s: State, pf: Proforma) {
  const fx = fxOf(s, pf);
  let amountCur = 0;
  let amount = 0;
  let qty = 0;
  let cbm = 0;
  let packsOk = 0;
  for (const l of pf.lines) {
    const p = byId(s.products, l.productId);
    amountCur += l.qty * l.price;
    amount += l.qty * l.price * fx;
    qty += l.qty;
    cbm += l.cbm ?? lineCbm(p, l.qty);
    if (packDone(p)) packsOk++;
  }
  const deposit = pf.depositAmount ?? (amount * pf.depositPct) / 100;
  // Acompte et solde dans la devise de la proforma (celle du fournisseur)
  const toCur = amount ? amountCur / amount : fx ? 1 / fx : 1;
  return {
    amount,
    amountCur,
    depositCur: deposit * toCur,
    balanceCur: (amount - deposit) * toCur,
    currency: pf.currency ?? 'EUR',
    qty,
    cbm,
    eq40: cbm / CONTAINER_CAPACITY['40HC'],
    deposit,
    balance: amount - deposit,
    packsOk,
    packsTotal: pf.lines.length,
  };
}

/** Quantité maximale d'une ligne dans ce conteneur : quantité de la proforma moins ce qui est déjà dans les autres conteneurs */
export function maxAllocQty(s: State, containerId: string, proformaId: string, productId: string) {
  const line = s.proformas.find((p) => p.id === proformaId)?.lines.find((l) => l.productId === productId);
  if (!line) return 0;
  const elsewhere = s.containers
    .filter((c) => c.id !== containerId)
    .reduce((t, c) => t + c.allocations.filter((x) => x.proformaId === proformaId && x.productId === productId).reduce((u, x) => u + x.qty, 0), 0);
  return Math.max(0, line.qty - elsewhere);
}

export function allocatedQty(s: State, proformaId: string, productId: string) {
  return s.containers.reduce((sum, c) => sum + c.allocations.filter((a) => a.proformaId === proformaId && a.productId === productId).reduce((x, a) => x + a.qty, 0), 0);
}

export function containerCbm(s: State, c: Container) {
  return c.allocations.reduce((sum, a) => sum + lineCbm(byId(s.products, a.productId), a.qty), 0);
}
export function containerQty(c: Container) {
  return c.allocations.reduce((sum, a) => sum + a.qty, 0);
}
/** Valeur d'un conteneur par devise (devise de chaque proforma, sans conversion) */
export function containerValueCur(s: State, c: Container): CurSum {
  const m: CurSum = {};
  for (const a of c.allocations) {
    const pf = byId(s.proformas, a.proformaId);
    const line = pf.lines.find((l) => l.productId === a.productId);
    addCur(m, pf.currency ?? 'EUR', a.qty * (line?.price ?? 0));
  }
  return m;
}

export function containerValue(s: State, c: Container) {
  return c.allocations.reduce((sum, a) => {
    const pf = byId(s.proformas, a.proformaId);
    const line = pf.lines.find((l) => l.productId === a.productId);
    return sum + a.qty * (line?.price ?? 0) * fxOf(s, pf);
  }, 0);
}
export const containerEta = (c: Container) => c.etaReal ?? c.etaRevised ?? c.etaPlanned;
export const containerEtd = (c: Container) => c.etdReal ?? c.etdPlanned;
export const containerCapacity = (c: Container) => CONTAINER_CAPACITY[c.type];
export function containerProformas(c: Container) {
  return [...new Set(c.allocations.map((a) => a.proformaId))];
}

/** Quantités d'une référence, suivies par commande, conteneur et réception (pas de double comptage). */
export function productQuantities(s: State, productId: string) {
  let ordered = 0;
  let open = 0; // commandé non encore arrivé
  for (const pf of s.proformas) {
    for (const l of pf.lines) {
      if (l.productId !== productId) continue;
      ordered += l.qty;
    }
  }
  let inTransit = 0;
  let received = 0;
  let nextArrival: ISODate | null = null;
  for (const c of s.containers) {
    for (const a of c.allocations) {
      if (a.productId !== productId) continue;
      if (c.status === 'en_transit') inTransit += a.qty;
      if (c.status === 'arrive') received += a.qty;
      if (c.status !== 'arrive') {
        const eta = containerEta(c);
        if (!nextArrival || eta < nextArrival) nextArrival = eta;
      }
    }
  }
  open = ordered - received;
  if (!nextArrival) {
    const pfs = s.proformas.filter((pf) => pf.status !== 'arrive' && pf.lines.some((l) => l.productId === productId));
    nextArrival = pfs.map((p) => p.eta).sort()[0] ?? null;
  }
  const p = byId(s.products, productId);
  const stock = Object.values(p.stock).reduce((a, b) => a + b, 0);
  return { ordered, open, inTransit, received, stock, nextArrival };
}

export function supplierStats(s: State, supplierId: string) {
  const prods = s.products.filter((p) => p.supplierId === supplierId);
  const pfs = s.proformas.filter((p) => p.supplierId === supplierId);
  const cs = s.containers.filter((c) => c.supplierId === supplierId);
  let amount = 0;
  let depositPaid = 0;
  let balanceOpen = 0;
  // Mêmes totaux dans la devise des proformas (celle du fournisseur) : ce sont eux qu'on affiche
  const amountCur: CurSum = {};
  const depositPaidCur: CurSum = {};
  const balanceOpenCur: CurSum = {};
  for (const pf of pfs) {
    const t = proformaTotals(s, pf);
    amount += t.amount;
    addCur(amountCur, t.currency, t.amountCur);
    if (pf.depositPaid) {
      depositPaid += t.deposit;
      addCur(depositPaidCur, t.currency, t.depositCur);
    }
    balanceOpen += pf.balancePaid ? 0 : pf.depositPaid ? t.balance : t.amount;
    addCur(balanceOpenCur, t.currency, pf.balancePaid ? 0 : pf.depositPaid ? t.balanceCur : t.amountCur);
  }
  const cbm = cs.reduce((sum, c) => sum + containerCbm(s, c), 0);
  return { prods, pfs, cs, amount, depositPaid, balanceOpen, amountCur, depositPaidCur, balanceOpenCur, cbm };
}

/** Échéancier financier dérivé des proformas (acompte puis solde). */
export interface Payment {
  proformaId: string;
  supplierId: string;
  kind: 'Acompte' | 'Solde';
  amount: number;
  /** Devise de la proforma (celle du fournisseur) et montant dans cette devise : c'est lui qu'on affiche */
  currency: string;
  amountCur: number;
  due: ISODate;
  paid: boolean;
}
export function payments(s: State): Payment[] {
  const out: Payment[] = [];
  for (const pf of s.proformas) {
    const t = proformaTotals(s, pf);
    const c = t.currency;
    if (hasDeposit(pf))
      out.push({ proformaId: pf.id, supplierId: pf.supplierId, kind: 'Acompte', amount: t.deposit, currency: c, amountCur: t.depositCur, due: addDays(pf.date, 7), paid: pf.depositPaid });
    out.push({ proformaId: pf.id, supplierId: pf.supplierId, kind: 'Solde', amount: t.balance, currency: c, amountCur: t.balanceCur, due: pf.balanceDue, paid: pf.balancePaid });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// ---------------------------------------------------------------------------
// Session : utilisateur courant et droits

export function useAuth() {
  const { state } = useStore();
  const user = currentUser(state);
  return {
    user,
    can: (p: Perm) => can(user, p),
    canSee: (m: Module) => canSee(user, m),
    canStep: (st: ValidationStep) => canValidateStep(user, st),
    /** L'action serait-elle acceptée par le store ? (sert à afficher / masquer les boutons) */
    allowed: (a: Action) => isAllowed(state, a),
  };
}
