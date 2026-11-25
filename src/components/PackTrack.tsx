import { PACK_TRACK_LABELS, packTrack } from '../data/store';
import type { Product } from '../data/types';

/** Ronds de suivi du pack sur une ligne : die cut manquant, en attente de validation, à refaire, validé */
export default function PackTrackDots({ p }: { p: Product }) {
  const { dieCutMissing, status } = packTrack(p);
  const dots: { key: string; on: boolean; cls: string; label: string }[] = [
    { key: 'diecut', on: dieCutMissing, cls: 'red', label: 'Die cut manquant' },
    { key: 'attente', on: status === 'attente', cls: 'orange', label: PACK_TRACK_LABELS.attente },
    { key: 'a_refaire', on: status === 'a_refaire', cls: 'red', label: PACK_TRACK_LABELS.a_refaire },
    { key: 'valide', on: status === 'valide', cls: 'green', label: PACK_TRACK_LABELS.valide },
  ];
  const on = dots.filter((d) => d.on).map((d) => d.label);
  return (
    <span className="dev-track" aria-label={`Suivi pack : ${on.length ? on.join(', ') : PACK_TRACK_LABELS.a_faire}`} title={on.length ? on.join(' · ') : PACK_TRACK_LABELS.a_faire}>
      {dots.map((d) => (
        <span key={d.key} className={`dev-dot ${d.on ? d.cls : ''}`} data-k={d.key} />
      ))}
      <small>{status === 'a_faire' ? (dieCutMissing ? 'Die cut manquant' : PACK_TRACK_LABELS.a_faire) : PACK_TRACK_LABELS[status].replace('Pack ', '')}</small>
    </span>
  );
}
