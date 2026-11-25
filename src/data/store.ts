import { createContext, useContext } from 'react';
import * as seed from './seed';
import type {
  Brand,
  BookingProposal,
  Currency,
  ImportLine,
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
  Proforma,
  Forwarder,
  JournalEntry,
  PackFile,
  ProformaStatus,
  ReceptionLine,
  Settings,
  Role,
  Supplier,
  User,
  ValidationStep,
} from './types';
import { ROLE_DEFS, can, canSee, canValidateStep, isForwarder, isSupplier, type Module, type Perm } from './permissions';
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
}

/** Préfixe GS1 des EAN JONAS (celui des produits existants) */
const DEFAULT_GS1 = '370157';

export const DEFAULT_SETTINGS: Settings = {
  defaultCapacity: 40,
  capacity: {},
  fx: { EUR: 1, USD: 0.93, CNY: 0.128 },
  company: { name: 'JONAS INTERNATIONAL', address: '189 rue d\'Aubervilliers', city: '75018 Paris', vat: 'FR50842235913', gs1Prefix: DEFAULT_GS1 },
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

export const STORAGE_KEY = 'jonas-buying-state-v18';

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

export function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const st = JSON.parse(raw) as State;
      // Compatibilité : anciens états sans paramètres ni journal
      return { ...st, settings: { ...DEFAULT_SETTINGS, ...(st.settings ?? {}), company: COMPANY_REV > (st.settings?.companyRev ?? 0) ? { ...DEFAULT_SETTINGS.company, vat: st.settings?.company?.vat || DEFAULT_SETTINGS.company.vat } : withDefaults(DEFAULT_SETTINGS.company, st.settings?.company), companyRev: COMPANY_REV }, journal: st.journal ?? [] };
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
  | { type: 'addContainerDoc'; containerId: string; doc: string }
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
      order?: { source: 'saisie' | 'excel' | 'bc' | 'ia'; file?: { fileId: string; name: string; size: number; mime: string } };
      /** Proforma déposée par le fournisseur (obligatoire côté fournisseur) */
      file?: { fileId: string; name: string; size: number; mime: string };
    }
  | { type: 'setSupplierTerms'; supplierId: string; terms: SupplierTerms }
  | { type: 'cancelOrder'; id: string }
  | { type: 'requestSplit'; id: string; lines: { productId: string; qtyNow: number }[]; etdLater: ISODate; reason: string }
  | { type: 'acceptSplit'; id: string }
  | { type: 'refuseSplit'; id: string; reason?: string }
  | { type: 'uploadProforma'; id: string; fileId: string; name: string; size: number; mime: string; reason?: string; lines?: ImportLine[] }
  | { type: 'refuseProformaVersion'; id: string; reason: string }
  | { type: 'setProformaStatus'; id: string; status: ProformaStatus }
  | { type: 'payDeposit'; id: string }
  | { type: 'payBalance'; id: string }
  | { type: 'validatePack'; productId: string }
  | { type: 'rejectPack'; productId: string }
  | { type: 'requestDieCut'; productId: string }
  | { type: 'receiveDieCut'; productId: string }
  | { type: 'uploadArtwork'; productId: string }
  | { type: 'forwardPack'; productId: string }
  | { type: 'allocate'; containerId: string; proformaId: string; productId: string; qty: number }
  | { type: 'deallocate'; containerId: string; proformaId: string; productId: string }
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
  | { type: 'markDeveloped'; productId: string }
  | { type: 'reassignPack'; productId: string; designer?: string; weekOf?: ISODate }
  | { type: 'startPack'; productId: string }
  | { type: 'planPack'; productId: string; date: ISODate | null }
  | { type: 'addPackFiles'; productId: string; kind: 'pack' | 'crea'; files: Omit<PackFile, 'kind' | 'version' | 'uploadedAt' | 'uploadedBy'>[] }
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
      const fullyAllocated = pf.lines.every(
        (l) => allocatedQty(s, pf.id, l.productId) >= l.qty,
      );
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
    case 'addPackFiles':
    case 'removePackFile':
    case 'startPack':
    case 'planPack': {
      // Le designer du pack (ou le Pilote) annonce son démarrage
      const p = s.products.find((x) => x.id === a.productId);
      return !!p && (u.role === 'pilote' || (u.role === 'designer' && u.designerName === p.pack.designer));
    }
    case 'receiveDieCut': {
      const p = s.products.find((x) => x.id === a.productId);
      if (isSupplier(u)) return !!p && p.supplierId === u.supplierId;
      return can(u, 'pack.design');
    }
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
    case 'cancelOrder': {
      // Annuler une commande JONAS tant que le fournisseur n'a rien déposé
      const pf = s.proformas.find((x) => x.id === a.id);
      return !!pf?.order && !pf.versions?.length && pf.status === 'a_signer' && (can(u, 'proforma.edit') || can(u, 'proforma.sign'));
    }
    case 'setSupplierTerms':
      return (
        !!s.suppliers.find((x) => x.id === a.supplierId) &&
        (can(u, 'finance.pay') || can(u, 'proforma.sign')) &&
        a.terms.depositPct >= 0 &&
        a.terms.depositPct <= 100 &&
        a.terms.balanceDays >= 0
      );
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
      if (isForwarder(u)) { if (u.forwarder !== pf.booking!.forwarder) return false; }
      else if (isSupplier(u)) { if (pf.supplierId !== u.supplierId) return false; }
      else if (u.role !== 'pilote') return false;
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
  let item = s.products
    .filter((p) => p.ean.length === 13 && p.ean.startsWith(gs1))
    .reduce((mx, p) => Math.max(mx, Number(p.ean.slice(gs1.length, 12))), 0) + 1;
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
 * Transforme les lignes lues sur une proforma en lignes de proforma : crée les nouveaux produits
 * (rayon, marque et designer habituels du fournisseur, pack à définir, à développer).
 */
function materializeLines(s: State, supplierId: string, lines: ImportLine[], etd: ISODate, fx: number) {
  const mine = s.products.filter((p) => p.supplierId === supplierId);
  const most = <K extends keyof Product>(k: K, fallback: Product[K]) => {
    const count = new Map<Product[K], number>();
    for (const p of mine) count.set(p[k], (count.get(p[k]) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  };
  const created: Product[] = [];
  const codes = nextJonasCodes(s, supplierId, lines.filter((l) => !l.productId).length);
  const out: ProformaLine[] = lines.map((l) => {
    if (l.productId) return { productId: l.productId, qty: l.qty, price: l.price };
    const n = l.newProduct!;
    const { ref, ean } = codes.shift()!;
    const deadline = addDays(etd, -35);
    const p: Product = {
      id: ref,
      ref,
      ean,
      supplierRef: n.supplierRef?.trim().toUpperCase() || undefined,
      name: n.name.trim(),
      brandId: most('brandId', 'jonas'),
      supplierId,
      rayon: most('rayon', 'Divers'),
      collection: 'Nouveauté',
      gender: 'Mixte',
      material: 'À préciser',
      emoji: most('emoji', '📦'),
      tint: '#eef1f5',
      pa: Math.round(l.price * fx * 100) / 100,
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
        designer: most('pack', mine[0]?.pack ?? ({ designer: 'ABIR' } as Product['pack'])).designer,
        artworkDeadline: deadline,
        validations: { david: { state: 'pending' }, direction: { state: 'todo' }, moinard: { state: 'todo' }, fournisseur: { state: 'todo' } },
        dieCut: 'none',
        artworkVersions: 0,
        sentToSupplier: false,
      },
      stock: { Péronne: 0, Meaux: 0, Lillois: 0 },
    };
    created.push(p);
    return { productId: p.id, qty: l.qty, price: l.price };
  });
  return { lines: out, created };
}

/**
 * Dernier prix payé d'un produit : sa ligne sur la dernière proforma signée (sinon la dernière tout court),
 * converti dans la devise donnée. À défaut, le prix d'achat de la fiche produit.
 */
export function lastPricePaid(s: State, productId: string, currency: Currency): { price: number; from?: string; date?: ISODate } {
  const fx = (c: Currency) => s.settings.fx[c] ?? 1;
  const withLine = s.proformas
    .filter((p) => p.lines.some((l) => l.productId === productId))
    .sort((a, b) => b.date.localeCompare(a.date));
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
export function nextProformaId(s: State) {
  const year = TODAY.slice(0, 4);
  const max = s.proformas.reduce((m, p) => {
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
  const nowLines = pf.lines
    .map((l) => ({ ...l, qty: nowOf(l.productId, l.qty), cbm: l.cbm !== undefined ? (l.cbm * nowOf(l.productId, l.qty)) / l.qty : undefined }))
    .filter((l) => l.qty > 0);
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
export const defaultForwarder = (s: State, supplierId: string): Forwarder =>
  [...s.containers].reverse().find((c) => c.supplierId === supplierId && c.forwarder)?.forwarder ?? 'Logfret';
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
        users: s.users.map((u) =>
          u.id === a.userId
            ? { ...u, role: a.role, validationStep: a.validationStep === null ? undefined : a.validationStep ?? u.validationStep }
            : u,
        ),
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
    case 'addContainerDoc':
      return mapC(s, a.containerId, (c) => ({
        ...c,
        documents: c.documents.includes(a.doc) ? c.documents : [...c.documents, a.doc],
        dateHistory: [...c.dateHistory, hist(me, `Document déposé : ${a.doc}`)],
      }));
    case 'createProforma': {
      const u = currentUser(s);
      const bySupplier = isSupplier(u);
      const terms = supplierTerms(s, a.supplierId);
      const mat = materializeLines(s, a.supplierId, a.lines, a.etd, fxRate(s, terms.currency));
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
      return { ...s, products: [...s.products, ...mat.created], proformas: [...s.proformas, pf] };
    }
    case 'cancelOrder':
      return { ...s, proformas: s.proformas.filter((p) => p.id !== a.id) };
    case 'setSupplierTerms':
      return { ...s, suppliers: s.suppliers.map((x) => (x.id === a.supplierId ? { ...x, terms: a.terms } : x)) };
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
      const mat = a.lines ? materializeLines(s, pf0.supplierId, a.lines, pf0.etd, fxRate(s, pf0.currency ?? 'EUR')) : null;
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
          lines: mat && !signed ? mat.lines : pf.lines,
        };
      });
      return mat ? { ...next, products: [...next.products, ...mat.created] } : next;
    }
    case 'signProforma': {
      const u = currentUser(s);
      const at = nowStamp();
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
        return { ...p, pack: { ...p.pack, validations: v, sentToSupplier: idx === 3 ? true : p.pack.sentToSupplier } };
      });
    case 'rejectPack':
      return mapP(s, a.productId, (p) => {
        const v = { ...p.pack.validations };
        VALIDATION_STEPS.forEach((st, i) => (v[st] = i === 0 ? { state: 'pending' } : { state: 'todo' }));
        return { ...p, pack: { ...p.pack, validations: v } };
      });
    case 'requestDieCut':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, dieCut: 'requested' } }));
    case 'receiveDieCut':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, dieCut: 'received' } }));
    case 'uploadArtwork':
      return mapP(s, a.productId, (p) => {
        const v = { ...p.pack.validations };
        if (VALIDATION_STEPS.every((st) => v[st].state === 'todo')) v.david = { state: 'pending' };
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
      let seq = s.containers.length + 31;
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
              id: `PLAN-${String(seq++).padStart(3, '0')}`,
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
        containers: next.containers.map((c) =>
          c.status === 'booking_demande' && c.allocations.some((x) => x.proformaId === a.proformaId) ? { ...c, status: 'a_booker' } : c,
        ),
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
          hist(me, `Proposition de booking ${enteredBy === 'transitaire' ? `de ${pf.booking!.forwarder}` : `saisie pour ${pf.booking!.forwarder}`} : ${a.carrier} ${a.bookingNo}, départ ${a.etd}, arrivée ${a.eta}`),
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
      const n = s.containers.length + 31;
      const c: Container = {
        id: `PLAN-${String(n).padStart(3, '0')}`,
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
    case 'ship':
      return syncProformaStatuses(
        mapC(s, a.containerId, (c) => ({
          ...c,
          status: 'en_transit',
          etdReal: TODAY,
          documents: [...new Set([...c.documents, 'BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'])],
          dateHistory: [...c.dateHistory, hist(me, `Départ réel ${TODAY}`)],
        })),
      );
    case 'receive': {
      const c = s.containers.find((x) => x.id === a.containerId)!;
      // Quantités reçues : saisies au contrôle, sinon conformes à l'attendu
      const lines: ReceptionLine[] =
        a.lines ?? c.allocations.map((al) => ({ proformaId: al.proformaId, productId: al.productId, expected: al.qty, received: al.qty }));
      const gaps = lines.filter((l) => l.received !== l.expected);
      let next = mapC(s, a.containerId, (x) => ({
        ...x,
        status: 'arrive',
        etaReal: TODAY,
        receivedOn: TODAY,
        reception: { at: nowStamp(), by: me, lines, note: a.note },
        dateHistory: [
          ...x.dateHistory,
          hist(me, `Réceptionné à ${x.warehouse}${gaps.length ? ` · ${gaps.length} écart(s)` : ' · conforme'}${a.note ? ` · ${a.note}` : ''}`),
        ],
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
    case 'addPackFiles':
      return mapP(s, a.productId, (p) => {
        const files = p.pack.files ?? [];
        const stamp = nowStamp();
        let version = Math.max(0, ...files.filter((f) => f.kind === 'pack').map((f) => f.version ?? 0));
        const added: PackFile[] = a.files.map((f) => ({
          ...f,
          kind: a.kind,
          version: a.kind === 'pack' ? ++version : undefined,
          uploadedAt: stamp,
          uploadedBy: me,
        }));
        const pack = { ...p.pack, files: [...files, ...added], startedAt: p.pack.startedAt ?? stamp };
        if (a.kind === 'pack') {
          // Nouvelle version du pack = soumise au circuit (David)
          const v = { ...pack.validations };
          if (VALIDATION_STEPS.every((st) => v[st].state === 'todo')) v.david = { state: 'pending' };
          return { ...p, pack: { ...pack, validations: v, artworkVersions: Math.max(p.pack.artworkVersions, version) } };
        }
        return { ...p, pack };
      });
    case 'removePackFile':
      return mapP(s, a.productId, (p) => ({ ...p, pack: { ...p.pack, files: (p.pack.files ?? []).filter((f) => f.id !== a.fileId) } }));
    case 'reassignPack':
      return mapP(s, a.productId, (p) => {
        let deadline = p.pack.artworkDeadline;
        if (a.weekOf) {
          // Même jour ouvré dans la semaine cible
          const day = Math.min(4, (parse(deadline).getUTCDay() + 6) % 7);
          deadline = addDays(weekStart(a.weekOf), day);
        }
        return {
          ...p,
          devDeadline: a.weekOf ? deadline : p.devDeadline,
          pack: { ...p.pack, designer: a.designer ?? p.pack.designer, artworkDeadline: deadline },
        };
      });
    case 'toggleUrgent':
      return mapP(s, a.productId, (p) => ({ ...p, urgent: !p.urgent }));
    case 'markDeveloped':
      return mapP(s, a.productId, (p) => ({ ...p, developed: true, urgent: false, devStage: DEV_STAGES.length - 1, nextAction: 'Passer commande' }));
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
    case 'cancelOrder':
      return { target: a.id, text: 'Commande JONAS annulée avant proforma' };
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
      return { target: ref(a.productId), text: 'Pack refusé, retour au designer' };
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
      return { target: ref(a.productId), text: `Réaffecté${a.designer ? ` à ${a.designer}` : ''}${a.weekOf ? ` · semaine du ${a.weekOf}` : ''}` };
    case 'startPack':
      return { target: ref(a.productId), text: 'Pack commencé' };
    case 'planPack':
      return { target: ref(a.productId), text: a.date ? `Début prévu le ${a.date}` : 'Début prévu retiré' };
    case 'addPackFiles':
      return { target: ref(a.productId), text: a.kind === 'pack' ? `Pack uploadé (${a.files[0]?.name ?? ''})` : `${a.files.length} fichier(s) ajouté(s) au dossier créa` };
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

export function reducer(s: State, a: Action): State {
  const next = applyAction(s, a);
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
  return ctx;
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

export const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;
/** Marque d'un produit ; une marque absente de la liste (base vierge) s'affiche sans bloquer l'écran */
export const brandOf = (brands: Brand[], id: string): Brand =>
  brands.find((b) => b.id === id) ?? { id, name: id === 'jonas' ? 'JONAS' : id ? id.toUpperCase() : '—', tagline: '' };

export function lineCbm(p: Product, qty: number) {
  return (qty / p.pcb) * p.cbmCarton;
}

export type PackState = 'ok' | 'en_cours' | 'a_faire';

/** Un pack est terminé uniquement après les quatre validations. */
export function packState(p: Product): PackState {
  const done = VALIDATION_STEPS.filter((s) => p.pack.validations[s].state === 'done').length;
  if (done === 4) return 'ok';
  if (done === 0 && p.pack.artworkVersions <= 1 && p.pack.validations.david.state === 'todo') return 'a_faire';
  return done > 0 || p.pack.validations.david.state === 'pending' ? 'en_cours' : 'a_faire';
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
  return {
    amount,
    amountCur,
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

export function allocatedQty(s: State, proformaId: string, productId: string) {
  return s.containers.reduce(
    (sum, c) => sum + c.allocations.filter((a) => a.proformaId === proformaId && a.productId === productId).reduce((x, a) => x + a.qty, 0),
    0,
  );
}

export function containerCbm(s: State, c: Container) {
  return c.allocations.reduce((sum, a) => sum + lineCbm(byId(s.products, a.productId), a.qty), 0);
}
export function containerQty(c: Container) {
  return c.allocations.reduce((sum, a) => sum + a.qty, 0);
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
  for (const pf of pfs) {
    const t = proformaTotals(s, pf);
    amount += t.amount;
    if (pf.depositPaid) depositPaid += t.deposit;
    balanceOpen += pf.balancePaid ? 0 : pf.depositPaid ? t.balance : t.amount;
  }
  const cbm = cs.reduce((sum, c) => sum + containerCbm(s, c), 0);
  return { prods, pfs, cs, amount, depositPaid, balanceOpen, cbm };
}

/** Échéancier financier dérivé des proformas (acompte puis solde). */
export interface Payment {
  proformaId: string;
  supplierId: string;
  kind: 'Acompte' | 'Solde';
  amount: number;
  due: ISODate;
  paid: boolean;
}
export function payments(s: State): Payment[] {
  const out: Payment[] = [];
  for (const pf of s.proformas) {
    const t = proformaTotals(s, pf);
    out.push({ proformaId: pf.id, supplierId: pf.supplierId, kind: 'Acompte', amount: t.deposit, due: addDays(pf.date, 7), paid: pf.depositPaid });
    out.push({ proformaId: pf.id, supplierId: pf.supplierId, kind: 'Solde', amount: t.balance, due: pf.balanceDue, paid: pf.balancePaid });
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
