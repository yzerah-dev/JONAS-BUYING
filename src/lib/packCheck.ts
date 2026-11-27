// Contrôle réglementaire du pack par Claude : lit la dernière version du pack déposée (PDF, .ai compatible PDF, JPG, PNG),
// la photo du produit et l'avis d'étiquetage, puis renvoie conforme / à corriger / non conforme, point par point.
import type { State } from '../data/store';
import type { PackCheck, PackFile, Product } from '../data/types';
import { remoteEnabled } from '../data/remote';
import { getBlob } from './files';
import { smallPhoto } from './aiPhoto';
import { pdfLines, pdfPageImages } from './proformaExtract';
import { brandOf, byId } from '../data/store';

export type PackCheckFailure = 'not_configured' | 'unavailable' | 'no_pack' | 'unreadable' | 'error';

/** Dernière version du pack : ses fichiers lisibles par Claude (PDF / AI compatible PDF / images) */
export function lastPackFiles(p: Product): { version: number; files: PackFile[]; unreadable: PackFile[] } {
  const packs = (p.pack.files ?? []).filter((f) => f.kind === 'pack');
  const version = Math.max(0, ...packs.map((f) => f.version ?? 1));
  const last = packs.filter((f) => (f.version ?? 1) === version);
  const readable = (f: PackFile) => /pdf|^image\/(jpeg|png|webp|gif)/.test(f.type) || /\.(pdf|ai|jpe?g|png|webp)$/i.test(f.name);
  return { version, files: last.filter(readable), unreadable: last.filter((f) => !readable(f)) };
}

export async function packCheck(s: State, p: Product): Promise<{ body: Omit<PackCheck, 'at' | 'by'> } | PackCheckFailure> {
  const { version, files } = lastPackFiles(p);
  if (!files.length) return 'no_pack';
  if (!remoteEnabled()) return 'unavailable';
  // Pages du pack en images (3 au plus), + texte extrait des PDF pour aider la lecture
  const pages: { data: string; type: string }[] = [];
  const texts: string[] = [];
  for (const f of files) {
    if (pages.length >= 3) break;
    const blob = await getBlob(f.id).catch(() => undefined);
    if (!blob) continue;
    if (/pdf/.test(f.type) || /\.(pdf|ai)$/i.test(f.name)) {
      const buf = await blob.arrayBuffer();
      pages.push(...(await pdfPageImages(buf.slice(0), 3 - pages.length, 1500).catch(() => [])));
      texts.push(...(await pdfLines(buf.slice(0), 3).catch(() => [])));
    } else {
      const img = await smallPhoto(f.id, 1500);
      if (img) pages.push(img);
    }
  }
  if (!pages.length) return 'unreadable';
  try {
    const { supabase } = await import('../data/supabaseSync');
    const token = (await supabase().auth.getSession()).data.session?.access_token;
    if (!token) return 'unavailable';
    const sup = byId(s.suppliers, p.supplierId);
    const product = {
      ref: p.ref,
      ean: p.ean,
      name: p.name,
      descriptionFr: p.description?.fr ?? '',
      descriptionEn: p.description?.en ?? '',
      brand: brandOf(s.brands, p.brandId).name,
      material: p.material,
      rayon: p.rayon,
      packType: p.pack.type,
      supplierCountry: sup?.country ?? '',
      importer: `${s.settings.company.name}, ${s.settings.company.address ?? ''} ${s.settings.company.city ?? ''}`.trim(),
    };
    const photo = p.photo ? await smallPhoto(p.photo.fileId) : null;
    const r = await fetch('/api/controle-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product, advice: p.labelAdvice ?? null, pack: pages, packText: texts.join('\n'), photo }),
    });
    if (r.status === 503 || r.status === 404) return 'not_configured';
    if (!r.ok) return 'error';
    const j = (await r.json()) as { check?: Omit<PackCheck, 'at' | 'by' | 'version' | 'files'> };
    if (!j.check?.verdict) return 'error';
    return { body: { ...j.check, version, files: files.map((f) => f.name) } };
  } catch {
    return 'error';
  }
}
