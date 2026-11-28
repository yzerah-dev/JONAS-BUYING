import type { ProductPhoto, Quotation } from '../data/types';
import { getBlob, newFileId, putBlob } from './files';
import { money } from './format';

/** Champ prix (décimal, virgule acceptée) */
export const parsePrice = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : 0;
};

/** Photos d'une demande de prix recopiées dans l'espace de chaque fournisseur interrogé (il ne lit que ses propres fichiers) */
export async function copyPhotosTo(scope: string, photos: ProductPhoto[]): Promise<ProductPhoto[]> {
  const out: ProductPhoto[] = [];
  for (const [i, ph] of photos.entries()) {
    const blob = await getBlob(ph.fileId);
    if (!blob) continue;
    const fileId = newFileId(scope, 'demande-prix', i);
    await putBlob(fileId, blob);
    out.push({ fileId, mime: ph.mime });
  }
  return out;
}

/** Une demande de prix (envoyée à un ou plusieurs fournisseurs) ou une offre spontanée : ses offres, sa dernière activité */
export interface QuoteRequest {
  key: string;
  quotes: Quotation[];
  last: string;
}

export const requestKey = (q: Quotation) => q.group ?? q.id;
const activity = (q: Quotation) => [q.createdAt, q.answeredAt ?? '', q.decidedAt ?? '', ...(q.rounds ?? []).map((r) => r.at)].sort().pop()!;
export const isClosed = (q: Quotation) => q.status === 'acceptee' || q.status === 'refusee';

/** Offres regroupées par demande, la plus récemment active d'abord */
export function quoteRequests(quotes: Quotation[]): QuoteRequest[] {
  const byKey = new Map<string, Quotation[]>();
  for (const q of quotes) byKey.set(requestKey(q), [...(byKey.get(requestKey(q)) ?? []), q]);
  return [...byKey.entries()].map(([key, list]) => ({ key, quotes: list, last: list.map(activity).sort().pop()! })).sort((a, b) => b.last.localeCompare(a.last));
}

/** Meilleur prix d'une demande (au moins deux prix reçus, même devise, offres non refusées) */
export function bestQuote(quotes: Quotation[]): Quotation | undefined {
  const priced = quotes.filter((q) => q.price && q.status !== 'refusee');
  if (priced.length < 2 || new Set(priced.map((q) => q.currency)).size > 1) return undefined;
  return priced.reduce((m, q) => (q.price! < m.price! ? q : m));
}

/** Résumé chiffré d'une demande : réponses, meilleur prix, à décider */
export function requestSummary(quotes: Quotation[]) {
  const answered = quotes.filter((q) => q.status !== 'demande').length;
  const toDecide = quotes.filter((q) => q.status === 'en_attente').length;
  const nego = quotes.filter((q) => q.status === 'negociation').length;
  const priced = quotes.filter((q) => q.price && q.status !== 'refusee');
  const low = priced.length ? priced.reduce((m, q) => (q.price! < m.price! ? q : m)) : undefined;
  const accepted = quotes.find((q) => q.status === 'acceptee');
  return { answered, toDecide, nego, low, accepted, lowLabel: low ? money(low.price!, low.currency) : undefined };
}
