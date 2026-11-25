import { Check, Clock, Package, RotateCcw, Scissors } from 'lucide-react';
import { PACK_TRACK_LABELS, packTrack, type PackTrack } from '../data/store';
import type { Product } from '../data/types';

/** Rond + libellé d'un statut du pack */
const TRACK_LOOK: Record<PackTrack | 'diecut', { cls: string; icon: typeof Check; label: string }> = {
  diecut: { cls: 'red', icon: Scissors, label: 'Die cut manquant' },
  a_faire: { cls: 'grey', icon: Package, label: PACK_TRACK_LABELS.a_faire },
  attente: { cls: 'orange', icon: Clock, label: 'En attente de validation' },
  a_refaire: { cls: 'red', icon: RotateCcw, label: PACK_TRACK_LABELS.a_refaire },
  valide: { cls: 'green', icon: Check, label: PACK_TRACK_LABELS.valide },
};

/** Rond seul (filtres) */
export function TrackRound({ k }: { k: PackTrack | 'diecut' }) {
  const l = TRACK_LOOK[k];
  return (
    <span className={`trk ${l.cls}`}>
      <span className="trk-round">
        <l.icon size={14} strokeWidth={2.6} />
      </span>
    </span>
  );
}

/** Un gros rond avec son statut écrit */
export function TrackBadge({ k }: { k: PackTrack | 'diecut' }) {
  const l = TRACK_LOOK[k];
  return (
    <span className={`trk ${l.cls}`} data-k={k}>
      <span className="trk-round">
        <l.icon size={15} strokeWidth={2.6} />
      </span>
      <span className="trk-label">{l.label}</span>
    </span>
  );
}

/** Suivi du pack sur une ligne : statut du pack, et « Die cut manquant » s'il manque */
export default function PackTrackDots({ p }: { p: Product }) {
  const { dieCutMissing, status } = packTrack(p);
  return (
    <span className="trk-list" aria-label={`Suivi pack : ${[dieCutMissing ? 'Die cut manquant' : '', TRACK_LOOK[status].label].filter(Boolean).join(', ')}`}>
      <TrackBadge k={status} />
      {dieCutMissing && <TrackBadge k="diecut" />}
    </span>
  );
}
