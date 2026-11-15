// Données du portail transitaire : ses conteneurs, regroupés par étape.
import { containerEta, forwarderOwns, type State } from '../data/store';
import type { Container, User } from '../data/types';
import { TODAY, diffDays } from '../lib/format';

export const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
export const DOC_LABEL: Record<string, string> = { 'BL.pdf': 'BL', 'Invoice.pdf': 'Facture', 'Packing List.xlsx': 'Packing list' };

export function fwdStages(s: State, u: User) {
  const mine = s.containers.filter((c) => forwarderOwns(u, c));
  const byEta = (a: Container, b: Container) => containerEta(a).localeCompare(containerEta(b));
  return {
    mine,
    toConfirm: mine.filter((c) => c.status === 'booke' && !c.fwdConfirmedAt).sort((a, b) => a.etdPlanned.localeCompare(b.etdPlanned)),
    ready: mine.filter((c) => c.status === 'booke' && c.fwdConfirmedAt).sort((a, b) => a.etdPlanned.localeCompare(b.etdPlanned)),
    atSea: mine.filter((c) => c.status === 'en_transit').sort(byEta),
    arrived: mine.filter((c) => c.status === 'arrive').sort((a, b) => byEta(b, a)),
  };
}

/** Actions attendues : bookings à confirmer, documents manquants, douane à lancer à l'approche */
export function fwdTodo(s: State, u: User) {
  const { toConfirm, atSea } = fwdStages(s, u);
  const docs = atSea.filter((c) => REQUIRED_DOCS.some((d) => !c.documents.includes(d))).length;
  const customs = atSea.filter((c) => !c.customs && diffDays(containerEta(c), TODAY) <= 7).length;
  return toConfirm.length + docs + customs;
}
