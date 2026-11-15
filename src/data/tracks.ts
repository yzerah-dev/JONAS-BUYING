// Les deux circuits du booking, vus par JONAS : date de chargement et plan de chargement.
import type { Container } from './types';
import { fshort, fstamp } from '../lib/format';

export type Tone = 'green' | 'orange' | 'violet' | 'grey';
export interface TrackState {
  tone: Tone;
  title: string;
  detail: string;
}

/** Circuit 1 : date de chargement proposée par JONAS, validée ou changée par le fournisseur */
export function loadingTrack(c: Container): TrackState {
  const l = c.loading;
  if (!l) return { tone: 'grey', title: 'À proposer au fournisseur', detail: `Départ prévu ${fshort(c.etdPlanned)}` };
  if (l.status === 'proposed') return { tone: 'orange', title: `Proposée ${fshort(l.date)} · attente fournisseur`, detail: l.proposedAt ? `Envoyée le ${fstamp(l.proposedAt)}` : 'Envoyée au fournisseur' };
  return {
    tone: 'green',
    title: `Validée ${fshort(l.date)}`,
    detail: l.initialDate ? `Changée par le fournisseur (proposée ${fshort(l.initialDate)})` : 'Confirmée par le fournisseur',
  };
}

/** Circuit 2 : plan de chargement envoyé par JONAS, validé tel quel ou modifié par le fournisseur */
export function planTrack(c: Container): TrackState {
  if (c.planValidated)
    return { tone: 'green', title: 'Validé', detail: c.planValidatedBy === 'fournisseur' ? 'Accepté tel quel par le fournisseur' : 'Validé par JONAS' };
  if (c.planProposed) return { tone: 'violet', title: 'Modifié par le fournisseur', detail: 'Modifications à revoir et valider' };
  if (c.planRequested) return { tone: 'orange', title: 'Envoyé · attente fournisseur', detail: 'Le fournisseur valide ou modifie' };
  return { tone: 'grey', title: 'À envoyer au fournisseur', detail: c.allocations.length ? `${c.allocations.length} ligne(s) affectée(s)` : 'Aucune ligne affectée' };
}

