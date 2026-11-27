import { remoteEnabled } from '../data/remote';
import { supabase } from '../data/supabaseSync';
import { sampleCap } from './proformaExtract';
import { smallPhoto } from './aiPhoto';

export interface FrText {
  id: string;
  /** Désignation courte en français */
  name: string;
  /** Description longue en français */
  fr: string;
}

const PROMPT = `Tu es rédacteur produit pour JONAS, importateur français (bazar, maison, bagagerie, accessoires) qui vend à la grande distribution.
Pour chaque article, à partir du texte anglais du fournisseur, écris :
- "name" : la désignation commerciale en français, courte et claire (2 à 6 mots, majuscule au premier mot seulement, sans référence, sans prix, sans quantité ni conditionnement). Exemples : « Mug léopard 350 ml », « Gourde léopard 500 ml », « Râpe 2 faces avec boîte ».
- "fr" : la description longue en français, retravaillée pour un catalogue : une phrase d'accroche puis les caractéristiques utiles (matière, dimensions, contenance, coloris ou nombre de modèles). Reprends fidèlement le texte anglais, n'invente rien. Texte simple, 2 à 5 lignes.
Si une photo de l'article est disponible, elle fait foi : contrôle le texte par rapport à elle (objet, forme, nombre de pièces, couleurs, motif) et corrige la désignation et la description en cas de désaccord.
Renvoie UNIQUEMENT un objet JSON : {"items": [{"id": "…", "name": "…", "fr": "…"}]} avec chaque "id" inchangé.`;

const clean = (v: unknown, ids: Set<string>): FrText[] => {
  const items = (v as { items?: Partial<FrText>[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((i) => ({ id: String(i.id ?? ''), name: String(i.name ?? '').trim(), fr: String(i.fr ?? '').trim() })).filter((i) => ids.has(i.id) && i.name && i.fr);
};

/** Pourquoi le français n'a pas pu être généré */
export type FrFailure = 'unavailable' | 'not_configured' | 'error';

/**
 * Désignation et description françaises à partir du texte anglais du fournisseur, par Claude.
 * Démo (claude.ai) : Claude de la page. Plateforme : fonction serveur /api/textes-fr (clé Claude côté Vercel).
 */
export async function frenchTexts(items: { id: string; en: string; photo?: string }[]): Promise<FrText[] | FrFailure> {
  const list = items.filter((i) => i.en.trim()).map(({ id, en }) => ({ id, en }));
  const photoOf = new Map(items.filter((i) => i.photo).map((i) => [i.id, i.photo!]));
  if (!list.length) return [];
  const ids = new Set(list.map((i) => i.id));
  const sample = await sampleCap();
  if (sample) {
    try {
      return clean(await sample.json(`${PROMPT}\n\nArticles (JSON) :\n${JSON.stringify(list)}`, { modelTier: 'default' }), ids);
    } catch {
      return 'error';
    }
  }
  if (!remoteEnabled()) return 'unavailable';
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 'unavailable';
    // Photo de chaque article, réduite (contrôle du texte par rapport à la photo)
    const withPhotos = await Promise.all(list.map(async (i) => ({ ...i, photo: photoOf.has(i.id) ? ((await smallPhoto(photoOf.get(i.id)!)) ?? undefined) : undefined })));
    const r = await fetch('/api/textes-fr', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ items: withPhotos }) });
    if (r.status === 503 || r.status === 404) return 'not_configured';
    if (!r.ok) return 'error';
    return clean(await r.json(), ids);
  } catch {
    return 'error';
  }
}
