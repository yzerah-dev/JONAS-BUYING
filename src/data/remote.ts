// Synchronisation avec la base partagée (Supabase).
// L'état de l'application est rangé en documents par collection (table « docs »). Après chaque action,
// on envoie seulement les objets modifiés ; les modifications des autres utilisateurs arrivent en temps réel.
// Sans configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), l'application reste en mode démo (navigateur).
import type { State } from './store';

export type Collection = 'suppliers' | 'brands' | 'products' | 'proformas' | 'containers' | 'users' | 'journal' | 'settings';
export const ARRAY_COLLECTIONS = ['suppliers', 'brands', 'products', 'proformas', 'containers', 'users', 'journal'] as const;
type ArrayCollection = (typeof ARRAY_COLLECTIONS)[number];

export interface Doc {
  collection: Collection;
  id: string;
  data: unknown;
}

export const remoteConfig = {
  url: (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '',
  key: (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
};
export const remoteEnabled = () => !!(remoteConfig.url && remoteConfig.key);

/** Identifiant d'un objet dans sa collection (le journal n'a qu'un compteur local : on le rend unique) */
export function docId(collection: ArrayCollection, item: unknown): string {
  const o = item as { id: string | number; at?: string; user?: string };
  return collection === 'journal' ? `${o.at}~${o.user}~${o.id}` : String(o.id);
}

/** État complet → documents */
export function toDocs(s: State): Doc[] {
  const out: Doc[] = [];
  for (const c of ARRAY_COLLECTIONS) for (const item of s[c] as unknown[]) out.push({ collection: c, id: docId(c, item), data: item });
  out.push({ collection: 'settings', id: 'main', data: s.settings });
  return out;
}

/** Documents → état (l'utilisateur courant et ce qui n'est pas en base viennent de `base`) */
export function fromDocs(docs: Doc[], base: State): State {
  const next = { ...base } as State;
  for (const c of ARRAY_COLLECTIONS) {
    const items = docs.filter((d) => d.collection === c).map((d) => d.data);
    (next as unknown as Record<string, unknown[]>)[c] = items;
  }
  next.journal = [...next.journal].sort((a, b) => b.at.localeCompare(a.at));
  const settings = docs.find((d) => d.collection === 'settings' && d.id === 'main');
  if (settings) next.settings = { ...base.settings, ...(settings.data as State['settings']) };
  return next;
}

/**
 * Différences entre deux états : le réducteur recrée les objets modifiés (mapPF, mapC…),
 * donc un objet inchangé garde la même référence. On compare les références, objet par objet.
 */
export function diffState(prev: State, next: State): { upserts: Doc[]; deletes: { collection: Collection; id: string }[] } {
  const upserts: Doc[] = [];
  const deletes: { collection: Collection; id: string }[] = [];
  for (const c of ARRAY_COLLECTIONS) {
    const before = prev[c] as unknown[];
    const after = next[c] as unknown[];
    if (before === after) continue;
    const old = new Map(before.map((x) => [docId(c, x), x]));
    const seen = new Set<string>();
    for (const item of after) {
      const id = docId(c, item);
      seen.add(id);
      if (old.get(id) !== item) upserts.push({ collection: c, id, data: item });
    }
    for (const id of old.keys()) if (!seen.has(id)) deletes.push({ collection: c, id });
  }
  if (prev.settings !== next.settings) upserts.push({ collection: 'settings', id: 'main', data: next.settings });
  return { upserts, deletes };
}

/** Modification reçue en temps réel (autre utilisateur) → état */
export function applyRemoteChange(s: State, change: { collection: Collection; id: string; data: unknown | null }): State {
  if (change.collection === 'settings') return change.data ? { ...s, settings: { ...s.settings, ...(change.data as State['settings']) } } : s;
  const c = change.collection as ArrayCollection;
  const items = s[c] as unknown[];
  const rest = items.filter((x) => docId(c, x) !== change.id);
  if (change.data === null) return rest.length === items.length ? s : ({ ...s, [c]: rest } as State);
  const i = items.findIndex((x) => docId(c, x) === change.id);
  const list = i < 0 ? (c === 'journal' ? [change.data, ...items] : [...items, change.data]) : items.map((x, j) => (j === i ? change.data : x));
  return { ...s, [c]: list } as State;
}
