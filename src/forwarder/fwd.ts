// Données du portail transitaire : ses conteneurs, par étape.
import { containerEta, forwarderOwns, type State } from '../data/store';
import type { Container, User } from '../data/types';

export const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
export const DOC_LABEL: Record<string, string> = { 'BL.pdf': 'BL', 'Invoice.pdf': 'Facture', 'Packing List.xlsx': 'Packing list' };

export type FwdStage = 'a-confirmer' | 'pret' | 'en-mer' | 'au-port' | 'livres';

export const STAGE_DEF: Record<FwdStage, { title: string; sub: string; empty: string }> = {
  'a-confirmer': { title: 'Bookings à confirmer', sub: 'Booké par le fournisseur : confirmez le n° de conteneur, le navire et le cut-off.', empty: 'Aucun booking à confirmer.' },
  pret: { title: 'Prêts au départ', sub: 'Booking confirmé : en attente du chargement et du départ.', empty: 'Aucun conteneur en attente de départ.' },
  'en-mer': { title: 'En mer', sub: 'Suivi de l’ETA et des documents jusqu’à l’arrivée au port.', empty: 'Aucun conteneur en mer.' },
  'au-port': { title: 'Au port', sub: 'Arrivés au port : dédouanement et livraison à l’entrepôt JONAS.', empty: 'Aucun conteneur au port.' },
  livres: { title: 'Livrés', sub: 'Réceptionnés à l’entrepôt JONAS.', empty: 'Aucun conteneur livré.' },
};
export const STAGES = Object.keys(STAGE_DEF) as FwdStage[];

const missingDocs = (c: Container) => REQUIRED_DOCS.some((d) => !c.documents.includes(d));

export function fwdStages(s: State, u: User): Record<FwdStage, Container[]> {
  const mine = s.containers.filter((c) => forwarderOwns(u, c));
  const byEta = (a: Container, b: Container) => containerEta(a).localeCompare(containerEta(b));
  const byEtd = (a: Container, b: Container) => a.etdPlanned.localeCompare(b.etdPlanned);
  return {
    'a-confirmer': mine.filter((c) => c.status === 'booke' && !c.fwdConfirmedAt).sort(byEtd),
    pret: mine.filter((c) => c.status === 'booke' && c.fwdConfirmedAt).sort(byEtd),
    'en-mer': mine.filter((c) => c.status === 'en_transit' && !c.etaReal).sort(byEta),
    'au-port': mine.filter((c) => c.status === 'en_transit' && c.etaReal).sort(byEta),
    livres: mine.filter((c) => c.status === 'arrive').sort((a, b) => byEta(b, a)),
  };
}

/** Nombre d'actions attendues par étape (badges du menu) */
export function fwdActions(s: State, u: User): Record<FwdStage, number> {
  const st = fwdStages(s, u);
  return {
    'a-confirmer': st['a-confirmer'].length,
    pret: 0,
    'en-mer': st['en-mer'].filter(missingDocs).length,
    'au-port': st['au-port'].filter((c) => missingDocs(c) || c.customs !== 'dedouane' || !c.deliveryDate).length,
    livres: 0,
  };
}

export const fwdTodo = (s: State, u: User) => Object.values(fwdActions(s, u)).reduce((a, b) => a + b, 0);
