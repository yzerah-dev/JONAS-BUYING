// Données du portail transitaire : ses conteneurs, par étape.
import { bookingStage, containerEta, forwarderOwns, type State } from '../data/store';
import type { Container, Proforma, User } from '../data/types';

export const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
export const DOC_LABEL: Record<string, string> = { 'BL.pdf': 'BL', 'Invoice.pdf': 'Facture', 'Packing List.xlsx': 'Packing list' };

export type FwdStage = 'a-booker' | 'pret' | 'en-mer' | 'au-port' | 'livres';

export const STAGE_DEF: Record<FwdStage, { title: string; sub: string; empty: string }> = {
  'a-booker': { title: 'Bookings à faire', sub: 'Le fournisseur vous demande des boîtes : faites le booking (compagnie, n°, navire, dates).', empty: 'Aucun booking à faire.' },
  pret: { title: 'Prêts au départ', sub: 'Booking fait : indiquez le n° de conteneur et le plomb, puis déclarez le départ.', empty: 'Aucun conteneur en attente de départ.' },
  'en-mer': { title: 'En mer', sub: 'Suivi de l’ETA et des documents jusqu’à l’arrivée au port.', empty: 'Aucun conteneur en mer.' },
  'au-port': { title: 'Au port', sub: 'Arrivés au port : dédouanement et livraison à l’entrepôt JONAS.', empty: 'Aucun conteneur au port.' },
  livres: { title: 'Livrés', sub: 'Réceptionnés à l’entrepôt JONAS.', empty: 'Aucun conteneur livré.' },
};
export const STAGES = Object.keys(STAGE_DEF) as FwdStage[];

const missingDocs = (c: Container) => REQUIRED_DOCS.some((d) => !c.documents.includes(d));

/** Demandes de boîtes reçues des fournisseurs, booking à faire */
export const fwdBookings = (s: State, u: User): Proforma[] =>
  s.proformas
    .filter((p) => bookingStage(p) === 'transitaire' && p.booking!.forwarder === u.forwarder)
    .sort((a, b) => (a.booking!.readyDate ?? '').localeCompare(b.booking!.readyDate ?? ''));

/** Conteneurs par étape ('a-booker' : vide, ce sont des proformas, voir fwdBookings) */
export function fwdStages(s: State, u: User): Record<FwdStage, Container[]> {
  const mine = s.containers.filter((c) => forwarderOwns(u, c));
  const byEta = (a: Container, b: Container) => containerEta(a).localeCompare(containerEta(b));
  const byEtd = (a: Container, b: Container) => a.etdPlanned.localeCompare(b.etdPlanned);
  return {
    'a-booker': [],
    pret: mine.filter((c) => c.status === 'booke').sort(byEtd),
    'en-mer': mine.filter((c) => c.status === 'en_transit' && !c.etaReal).sort(byEta),
    'au-port': mine.filter((c) => c.status === 'en_transit' && c.etaReal).sort(byEta),
    livres: mine.filter((c) => c.status === 'arrive').sort((a, b) => byEta(b, a)),
  };
}

/** Nombre d'actions attendues par étape (badges du menu) */
export function fwdActions(s: State, u: User): Record<FwdStage, number> {
  const st = fwdStages(s, u);
  return {
    'a-booker': fwdBookings(s, u).length,
    pret: st.pret.filter((c) => !c.number).length,
    'en-mer': st['en-mer'].filter(missingDocs).length,
    'au-port': st['au-port'].filter((c) => missingDocs(c) || c.customs !== 'dedouane' || !c.deliveryDate).length,
    livres: 0,
  };
}

export const fwdTodo = (s: State, u: User) => Object.values(fwdActions(s, u)).reduce((a, b) => a + b, 0);
