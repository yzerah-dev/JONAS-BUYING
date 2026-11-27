// Avis d'étiquetage d'un produit (normes françaises / UE) par Claude, d'après sa photo et sa fiche.
// Plateforme : fonction serveur /api/avis-etiquetage. Démo (claude.ai) : Claude de la page, d'après la fiche (sans photo).
import { brandOf, byId, type State } from '../data/store';
import type { LabelAdvice, Product } from '../data/types';
import { remoteEnabled } from '../data/remote';
import { smallPhoto } from './aiPhoto';
import { sampleCap } from './proformaExtract';

export type AdviceFailure = 'not_configured' | 'unavailable' | 'error';
type Body = Omit<LabelAdvice, 'at' | 'by' | 'withPhoto'>;

function sheet(s: State, p: Product) {
  const sup = byId(s.suppliers, p.supplierId);
  return {
    name: p.name,
    descriptionEn: p.description?.en ?? '',
    descriptionFr: p.description?.fr ?? '',
    brand: brandOf(s.brands, p.brandId).name,
    rayon: p.rayon,
    collection: p.collection,
    material: p.material,
    gender: p.gender,
    packType: p.pack.type,
    supplierCountry: sup?.country ?? '',
    importer: `${s.settings.company.name}, ${s.settings.company.address ?? ''} ${s.settings.company.city ?? ''}`.trim(),
  };
}

const ok = (v: unknown): v is Body => {
  const o = v as Partial<Body> | null;
  return !!o && typeof o.summary === 'string' && Array.isArray(o.mentions) && Array.isArray(o.pictos);
};

export async function labelAdvice(s: State, p: Product): Promise<{ body: Body; withPhoto: boolean } | AdviceFailure> {
  const product = sheet(s, p);
  const sample = await sampleCap();
  if (sample) {
    try {
      const v = await sample.json(
        `Tu es expert de l'étiquetage des produits non alimentaires vendus en France (importateur : JONAS INTERNATIONAL). Donne l'avis d'étiquetage de ce produit d'après sa fiche (pas de photo disponible ici : le signaler dans "product").
Renvoie UNIQUEMENT un JSON : {"product": "…", "category": "…", "summary": "…", "regulations": [{"name": "…", "why": "…"}], "mentions": [{"text": "…", "detail": "…", "required": true}], "pictos": [{"name": "…", "detail": "…", "required": true}], "warnings": ["…"], "checks": ["…"]}. En français.
Fiche : ${JSON.stringify(product)}`,
        { modelTier: 'default' },
      );
      return ok(v) ? { body: v, withPhoto: false } : 'error';
    } catch {
      return 'error';
    }
  }
  if (!remoteEnabled()) return 'unavailable';
  try {
    const { supabase } = await import('../data/supabaseSync');
    const token = (await supabase().auth.getSession()).data.session?.access_token;
    if (!token) return 'unavailable';
    const photo = p.photo ? await smallPhoto(p.photo.fileId) : null;
    const r = await fetch('/api/avis-etiquetage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ product, photo }) });
    if (r.status === 503 || r.status === 404) return 'not_configured';
    if (!r.ok) return 'error';
    const j = (await r.json()) as { advice?: unknown; withPhoto?: boolean };
    return ok(j.advice) ? { body: j.advice, withPhoto: !!j.withPhoto } : 'error';
  } catch {
    return 'error';
  }
}
