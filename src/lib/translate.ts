// Traduction des messages de la discussion produit par Claude (plateforme : /api/traduire ; démo : Claude de la page)
import { remoteEnabled } from '../data/remote';
import { sampleCap } from './proformaExtract';

export type ChatLang = 'fr' | 'en' | 'zh';
const NAMES: Record<ChatLang, string> = { fr: 'français', en: 'anglais', zh: 'chinois simplifié' };

export async function translateTexts(texts: string[], to: ChatLang): Promise<string[] | 'not_configured' | 'error'> {
  if (!texts.length) return [];
  const sample = await sampleCap();
  if (sample) {
    try {
      const v = (await sample.json(
        `Traduis chaque message en ${NAMES[to]} (messages professionnels entre l'importateur JONAS et un fournisseur, à propos d'un produit). Fidèle, courtois, sans rien ajouter ; garde références, chiffres et noms tels quels. Renvoie UNIQUEMENT {"texts": [...]} dans le même ordre.\nMessages : ${JSON.stringify(texts)}`,
        { modelTier: 'default' },
      )) as { texts?: unknown[] } | null;
      return Array.isArray(v?.texts) && v!.texts.length === texts.length ? v!.texts.map(String) : 'error';
    } catch {
      return 'error';
    }
  }
  if (!remoteEnabled()) return 'error';
  try {
    const { supabase } = await import('../data/supabaseSync');
    const token = (await supabase().auth.getSession()).data.session?.access_token;
    if (!token) return 'error';
    const r = await fetch('/api/traduire', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ texts, to }) });
    if (r.status === 503 || r.status === 404) return 'not_configured';
    if (!r.ok) return 'error';
    const j = (await r.json()) as { texts?: string[] };
    return j.texts?.length === texts.length ? j.texts : 'error';
  } catch {
    return 'error';
  }
}
