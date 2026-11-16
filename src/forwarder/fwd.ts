// Données du portail transitaire : ses conteneurs, par étape.
import { bookingStage, containerEta, forwarderOwns, type State } from '../data/store';
import type { Container, Proforma, User } from '../data/types';

export const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
/** Libellé (clé de traduction) des documents obligatoires */
export const DOC_KEY: Record<string, 'fw.doc.BL' | 'fw.doc.invoice' | 'fw.doc.packing'> = { 'BL.pdf': 'fw.doc.BL', 'Invoice.pdf': 'fw.doc.invoice', 'Packing List.xlsx': 'fw.doc.packing' };

export type FwdStage = 'a-booker' | 'pret' | 'en-mer' | 'au-port' | 'livres';

/** Étapes du portail (titres, sous-titres et textes vides : clés fw.st.<étape>.* du dictionnaire) */
export const STAGES: FwdStage[] = ['a-booker', 'pret', 'en-mer', 'au-port', 'livres'];

const missingDocs = (c: Container) => REQUIRED_DOCS.some((d) => !c.documents.includes(d));

/** Demandes reçues (proposition à faire) et propositions en attente d'acceptation */
export const fwdBookings = (s: State, u: User): Proforma[] =>
  s.proformas
    .filter((p) => ['transitaire', 'validation'].includes(bookingStage(p) ?? '') && p.booking!.forwarder === u.forwarder)
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
    'a-booker': fwdBookings(s, u).filter((p) => !p.booking!.proposal).length,
    pret: st.pret.filter((c) => !c.number).length,
    'en-mer': st['en-mer'].filter(missingDocs).length,
    'au-port': st['au-port'].filter((c) => missingDocs(c) || c.customs !== 'dedouane' || !c.deliveryDate).length,
    livres: 0,
  };
}

export const fwdTodo = (s: State, u: User) => Object.values(fwdActions(s, u)).reduce((a, b) => a + b, 0);
