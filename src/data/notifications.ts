// Notifications calculées à partir de l'état : chacun ne voit que ce qui le concerne.
import type { State } from './store';
import { containerEta, containerEtd, currentUser, packDone, packLate, payments } from './store';
import { can, canSee } from './permissions';
import { VALIDATION_LABELS, VALIDATION_STEPS } from './types';
import { TODAY, addDays, diffDays, eur, fshort } from '../lib/format';

export interface Notice {
  /** Identifiant stable (sert à marquer comme lu) */
  id: string;
  level: 'red' | 'orange' | 'info';
  title: string;
  detail?: string;
  to: string;
}

export function notificationsFor(s: State): Notice[] {
  const u = currentUser(s);
  const out: Notice[] = [];
  const add = (n: Notice) => out.push(n);

  // Proformas à signer
  if (can(u, 'proforma.sign')) {
    const n = s.proformas.filter((p) => p.status === 'a_signer');
    if (n.length) add({ id: `sign-${n.map((p) => p.id).join(',')}`, level: 'orange', title: `${n.length} proforma(s) à signer`, detail: n.map((p) => p.id).join(', '), to: '/proformas?statut=a_signer' });
  }

  // Packs en attente de MA validation
  if (u.validationStep || u.role === 'pilote') {
    const mine = s.products.filter((p) => {
      const st = VALIDATION_STEPS.find((v) => p.pack.validations[v].state !== 'done');
      return st && st !== 'fournisseur' && p.pack.validations[st].state === 'pending' && (u.role === 'pilote' ? false : st === u.validationStep);
    });
    if (mine.length)
      add({ id: `val-${u.id}-${mine.length}`, level: 'orange', title: `${mine.length} pack(s) attendent votre validation`, detail: `Étape ${VALIDATION_LABELS[u.validationStep!]}`, to: '/design' });
  }

  // Designer : ses packs
  if (u.designerName) {
    const mine = s.products.filter((p) => p.pack.designer === u.designerName && !packDone(p));
    const late = mine.filter(packLate);
    const soon = mine.filter((p) => !p.pack.startedAt && p.pack.validations.david.state === 'todo' && p.pack.artworkDeadline >= TODAY && p.pack.artworkDeadline <= addDays(TODAY, 2));
    const urgent = mine.filter((p) => p.urgent);
    if (urgent.length) add({ id: `urg-${u.id}-${urgent.map((p) => p.id).join(',')}`, level: 'red', title: `${urgent.length} pack(s) poussé(s) en urgent`, detail: urgent.slice(0, 4).map((p) => p.ref).join(', '), to: '/design' });
    if (soon.length) add({ id: `soon-${u.id}-${soon.length}`, level: 'orange', title: `${soon.length} pack(s) pas commencé(s) à J-2`, detail: 'Échéance dans moins de 2 jours', to: '/design' });
    if (late.length) add({ id: `late-${u.id}-${late.length}`, level: 'red', title: `${late.length} pack(s) en retard`, to: '/design' });
  }

  // Pilote / acheteur : retards de packs et produits poussés
  if (can(u, 'dev.advance')) {
    const late = s.products.filter(packLate);
    if (late.length) add({ id: `late-all-${late.length}`, level: 'red', title: `${late.length} pack(s) en retard (équipe)`, to: '/design' });
  }

  // Logistique
  if (can(u, 'logistics.booking') || can(u, 'logistics.plan')) {
    const toBook = s.containers.filter((c) => c.status === 'a_booker' && diffDays(c.etdPlanned, TODAY) < 21);
    if (toBook.length) add({ id: `book-${toBook.map((c) => c.id).join(',')}`, level: 'orange', title: `${toBook.length} conteneur(s) à booker (départ < 3 sem.)`, to: '/booking' });
    const waiting = s.containers.filter((c) => c.status === 'booking_demande');
    const noAnswer = waiting.filter((c) => c.booking?.requestedAt && diffDays(TODAY, c.booking.requestedAt.slice(0, 10)) > 3);
    if (noAnswer.length)
      add({ id: `bkl-${noAnswer.map((c) => c.id).join(',')}`, level: 'red', title: `${noAnswer.length} demande(s) de booking sans réponse depuis +3 j`, detail: 'À relancer auprès du transitaire', to: '/booking' });
    else if (waiting.length) add({ id: `bkw-${waiting.map((c) => c.id).join(',')}`, level: 'info', title: `${waiting.length} booking(s) en attente de confirmation`, to: '/booking' });
    const proposed = s.containers.filter((c) => c.planProposed);
    if (proposed.length) add({ id: `plan-${proposed.map((c) => c.id).join(',')}`, level: 'orange', title: `${proposed.length} plan(s) de chargement proposé(s) par le fournisseur`, detail: 'À valider', to: '/conteneurs' });
    const revised = s.containers.filter((c) => c.etaRevised && c.status !== 'arrive');
    for (const c of revised)
      add({ id: `eta-${c.id}-${c.etaRevised}`, level: 'red', title: `ETA révisée : ${c.number ?? c.id}`, detail: `${fshort(c.etaPlanned)} → ${fshort(c.etaRevised)}`, to: `/conteneurs?c=${c.id}` });
    const arriving = s.containers.filter((c) => c.status === 'en_transit' && diffDays(containerEta(c), TODAY) <= 7);
    for (const c of arriving)
      add({ id: `arr-${c.id}`, level: 'info', title: `Arrivée sous 7 jours : ${c.number ?? c.id}`, detail: `ETA ${fshort(containerEta(c))} · réception à préparer à ${c.warehouse}`, to: `/conteneurs?c=${c.id}` });
    const noDocs = s.containers.filter((c) => c.status === 'en_transit' && !c.documents.includes('BL.pdf') && containerEtd(c) <= TODAY);
    if (noDocs.length) add({ id: `docs-${noDocs.length}`, level: 'orange', title: `${noDocs.length} conteneur(s) en transit sans BL`, to: '/conteneurs' });
  }

  // Finance
  if (can(u, 'finance.pay')) {
    const pays = payments(s).filter((p) => !p.paid);
    const late = pays.filter((p) => p.due < TODAY);
    const soon = pays.filter((p) => p.due >= TODAY && p.due <= addDays(TODAY, 7));
    if (late.length) add({ id: `pay-late-${late.length}`, level: 'red', title: `${late.length} échéance(s) en retard`, detail: eur(late.reduce((t, p) => t + p.amount, 0)), to: '/finance' });
    if (soon.length) add({ id: `pay-soon-${soon.length}`, level: 'orange', title: `${soon.length} échéance(s) sous 7 jours`, detail: eur(soon.reduce((t, p) => t + p.amount, 0)), to: '/finance' });
  }

  // Seulement ce que le rôle peut ouvrir
  const moduleOf = (to: string) => (to.split('?')[0].split('/')[1] || 'home') as Parameters<typeof canSee>[1];
  return out.filter((n) => canSee(u, moduleOf(n.to)));
}
