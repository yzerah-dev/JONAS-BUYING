import { useEffect, useRef } from 'react';
import { canEditProduct, currentUser, useStore } from '../data/store';
import type { Product } from '../data/types';
import { frenchTexts } from '../lib/frTexts';
import { needsFrench, frenchPatch } from '../lib/frPatch';

/** Produits déjà envoyés à Claude pendant cette session (pas de nouvel essai en boucle) */
const tried = new Set<string>();
const BATCH = 10;
/** Traduction non activée (clé Claude absente) : on arrête d'essayer pour cette session */
let off = false;

/**
 * Automatisation : chaque produit importé avec un texte anglais du fournisseur reçoit sa désignation courte
 * et sa description longue en français (Claude), sans action de l'utilisateur.
 * Tourne pour l'équipe qui peut modifier les fiches (pilote, Direction, acheteurs).
 */
export default function AutoFrench() {
  const { state, dispatch } = useStore();
  const busy = useRef(false);
  const me = currentUser(state);
  const allowed = canEditProduct(me);
  const todo = allowed && !off ? state.products.filter((p) => needsFrench(p) && !tried.has(p.id)) : [];
  const key = todo.map((p) => p.id).join(',');

  useEffect(() => {
    if (!key || busy.current) return;
    busy.current = true;
    const batch: Product[] = todo.slice(0, BATCH);
    batch.forEach((p) => tried.add(p.id));
    frenchTexts(batch.map((p) => ({ id: p.id, en: p.description!.en!, photo: p.photo?.fileId })))
      .then((res) => {
        if (res === 'not_configured' || res === 'unavailable') off = true;
        if (typeof res === 'string') return;
        for (const r of res) {
          const p = batch.find((x) => x.id === r.id);
          if (p) dispatch(frenchPatch(p, r));
        }
      })
      .finally(() => {
        busy.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
