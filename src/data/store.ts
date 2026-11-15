import { createContext, useContext } from 'react';
import * as seed from './seed';
import type {
  Brand,
  Container,
  ContainerStatus,
  HistoryEntry,
  ISODate,
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
import { can, canSee, canValidateStep, isSupplier, type Module, type Perm } from './permissions';
import { CONTAINER_CAPACITY, DEV_STAGES, VALIDATION_LABELS, VALIDATION_STEPS } from './types';
import { TODAY, addDays, parse, weekStart } from '../lib/format';

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

export const DEFAULT_SETTINGS: Settings = {
  defaultCapacity: 40,
  capacity: {},
  fx: { EUR: 1, USD: 0.93, CNY: 0.128 },
};

export const STORAGE_KEY = 'jonas-buying-state-v8';

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
      return { ...st, settings: { ...DEFAULT_SETTINGS, ...(st.settings ?? {}) }, journal: st.journal ?? [] };
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
  | { type: 'signProforma'; id: string }
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
  createContainer: 'logistics.plan',
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
      return can(u, 'logistics.booking');
    }
    default: {
      const perm = ACTION_PERM[a.type];
      return perm ? can(u, perm) : false;
    }
  }
}

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
    case 'signProforma':
      return mapPF(s, a.id, (pf) => ({
        ...pf,
        status: pf.status === 'a_signer' ? 'en_dev' : pf.status,
        documents: pf.documents.includes('Proforma signée.pdf') ? pf.documents : [...pf.documents, 'Proforma signée.pdf'],
        history: [...pf.history, hist(me, 'Proforma signée')],
      }));
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
          dateHistory: [...c.dateHistory, hist('Logistique', `Départ réel ${TODAY}`)],
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
      return { target: a.id, text: 'Proforma signée' };
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
