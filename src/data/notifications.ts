// Notifications calculées à partir de l'état : chacun ne voit que ce qui le concerne.
import type { State } from './store';
import { bookingOpen, canRequestBooking, pendingRevision, pendingVersion, containerEta, containerEtd, currentUser, packDone, packLate, payments } from './store';
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

  // Signature des proformas déposées par les fournisseurs (Direction / Pilote)
  if (can(u, 'proforma.sign')) {
    const pend = s.proformas.filter((p) => pendingVersion(p));
    const revs = pend.filter((p) => pendingRevision(p));
    const first = pend.filter((p) => !pendingRevision(p));
    if (revs.length)
      add({ id: `pfrev-${revs.map((p) => p.id + pendingVersion(p)!.version).join(',')}`, level: 'orange', title: `${revs.length} demande(s) de modification de proforma à signer`, detail: revs.map((p) => `${p.id} v${pendingVersion(p)!.version}`).join(', '), to: `/proformas/${revs[0].id}` });
    if (first.length)
      add({ id: `pfsign-${first.map((p) => p.id + pendingVersion(p)!.version).join(',')}`, level: 'orange', title: `${first.length} proforma(s) déposée(s) à signer`, detail: first.map((p) => p.id).join(', '), to: '/proformas?statut=a_signer' });
  }

  // Logistique
  if (can(u, 'logistics.booking') || can(u, 'logistics.plan')) {
    const toAsk = s.proformas.filter((p) => canRequestBooking(p) && diffDays(p.etd, TODAY) < 21);
    if (toAsk.length) add({ id: `ask-${toAsk.map((p) => p.id).join(',')}`, level: 'orange', title: `${toAsk.length} proforma(s) à booker (départ < 3 sem.)`, detail: toAsk.map((p) => p.id).join(', '), to: '/booking' });
    const late = s.proformas.filter((p) => bookingOpen(p) && diffDays(TODAY, (p.booking!.ackAt ?? p.booking!.requestedAt).slice(0, 10)) > 3);
    const lateSup = late.filter((p) => !p.booking!.ackAt);
    const lateFwd = late.filter((p) => p.booking!.ackAt && !p.booking!.proposal);
    const toAccept = s.proformas.filter((p) => bookingOpen(p) && p.booking!.proposal && !p.booking!.proposal.jonasOk);
    if (toAccept.length)
      add({ id: `bkv-${toAccept.map((p) => p.id + p.booking!.proposal!.at).join(',')}`, level: 'orange', title: `${toAccept.length} proposition(s) de booking à accepter`, detail: toAccept.map((p) => `${p.id} (${p.booking!.forwarder})`).join(', '), to: '/booking' });
    if (lateSup.length)
      add({ id: `bkl-${lateSup.map((p) => p.id).join(',')}`, level: 'red', title: `${lateSup.length} demande(s) de booking pas prise(s) en compte par le fournisseur depuis +3 j`, detail: lateSup.map((p) => p.id).join(', '), to: '/booking' });
    if (lateFwd.length)
      add({ id: `bkf-${lateFwd.map((p) => p.id).join(',')}`, level: 'red', title: `${lateFwd.length} proposition(s) de booking en attente du transitaire depuis +3 j`, detail: lateFwd.map((p) => `${p.id} (${p.booking!.forwarder})`).join(', '), to: '/booking' });
    const acked = s.proformas.filter((p) => bookingOpen(p) && p.booking!.ackAt && diffDays(TODAY, p.booking!.ackAt.slice(0, 10)) <= 2);
    for (const p of acked)
      add({ id: `bkk-${p.id}-${p.booking!.ackAt}`, level: 'info', title: `${p.id} pris en compte par le fournisseur`, detail: `Marchandise prête le ${fshort(p.booking!.readyDate)} · transmis à ${p.booking!.forwarder}`, to: '/booking' });
    const answered = s.proformas.filter((p) => p.booking?.answeredAt && diffDays(TODAY, p.booking.answeredAt.slice(0, 10)) <= 2);
    for (const p of answered)
      add({ id: `bka-${p.id}-${p.booking!.answeredAt}`, level: 'info', title: `${p.id} booké (${p.booking!.forwarder})`, detail: `${p.booking!.carrier ?? ''} ${p.booking!.bookingNo ?? ''} · chargement ${fshort(p.booking!.loadingDate)} · départ ${fshort(p.booking!.etd)}`, to: '/booking' });
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
