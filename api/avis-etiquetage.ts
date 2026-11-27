// Fonction serveur Vercel : avis d'étiquetage d'un produit (normes françaises et UE) par Claude, d'après sa photo et sa fiche.
// Réservée aux utilisateurs connectés à JONAS BUYING (jeton Supabase vérifié). Clé : ANTHROPIC_API_KEY (projet Vercel).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://ulwsixiywyikyjanbidk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_b0v4s7AH4nQ31AmeigQ6hA_NaHA3ZHC';
const IMG = /^image\/(jpeg|png|webp|gif)$/;

const Advice = z.object({
  product: z.string(),
  category: z.string(),
  summary: z.string(),
  regulations: z.array(z.object({ name: z.string(), why: z.string() })),
  mentions: z.array(z.object({ text: z.string(), detail: z.string(), required: z.boolean() })),
  pictos: z.array(z.object({ name: z.string(), detail: z.string(), required: z.boolean() })),
  warnings: z.array(z.string()),
  checks: z.array(z.string()),
});

const SYSTEM = `Tu es expert en réglementation de l'étiquetage des produits non alimentaires vendus en France (grande distribution : bazar, maison, cuisine, bagagerie, textile, jouets, cosmétiques, petit électrique, décoration).
JONAS INTERNATIONAL (Paris) importe ces produits d'Asie : il est l'importateur responsable de la mise sur le marché dans l'UE.
À partir de la photo du produit (elle fait foi) et de sa fiche, donne l'avis d'étiquetage :
- "product" : ce que tu vois / comprends du produit (1 phrase) ; signale si la photo contredit la fiche.
- "category" : la catégorie réglementaire (ex. « Matériau au contact des denrées alimentaires », « Jouet », « Article textile », « Équipement électrique », « Article de puériculture », « Produit général »).
- "summary" : l'avis en 2 à 4 phrases claires pour le designer du pack.
- "regulations" : les textes qui s'appliquent et pourquoi (ex. Règlement (UE) 2023/988 sécurité générale des produits (GPSR), Règlement (CE) 1935/2004 contact alimentaire, Directive 2009/48/CE jouets + EN 71, Règlement (UE) 1007/2011 textile, Code de l'environnement / loi AGEC (Triman + Info-tri), loi Toubon (français obligatoire), DEEE, REACH, Règlement (CE) 1223/2009 cosmétiques…). Seulement ceux qui concernent ce produit.
- "mentions" : chaque mention à faire figurer sur le pack ou l'étiquette, avec "detail" (où, comment, exemple de texte) et "required" (obligatoire ou recommandée). Toujours : identification de l'importateur (nom, adresse postale, contact : JONAS INTERNATIONAL…), identification du produit (référence / lot), consignes en français ; puis selon la catégorie (composition textile, matériaux, contenance, compatibilités lave-vaisselle / micro-ondes / four, âge, puissance…).
- "pictos" : pictogrammes et marquages (Triman + Info-tri, symbole verre-fourchette, marquage CE, poubelle barrée DEEE, logo âge 0-3 ans, symboles d'entretien…), avec "required".
- "warnings" : les avertissements à imprimer, en français, prêts à copier.
- "checks" : ce qu'il faut demander au fournisseur ou faire tester (rapports de test, déclaration de conformité, analyses migration, EN 71…).
Sois concret et prudent : n'invente pas de caractéristiques invisibles ; si une information manque (matière, âge, usage), dis-le dans "checks". Réponds en français.`;

async function userOf(token: string) {
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? ((await r.json()) as { id?: string }) : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'not_configured' }, { status: 503 });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await userOf(token);
  if (!user?.id) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { product?: Record<string, unknown>; photo?: { data?: unknown; type?: unknown } } | null;
  const product = Object.fromEntries(Object.entries(body?.product ?? {}).map(([k, v]) => [k, String(v ?? '').slice(0, 3000)]));
  if (!product.name) return Response.json({ error: 'bad_request' }, { status: 400 });
  const photo =
    body?.photo && typeof body.photo.data === 'string' && IMG.test(String(body.photo.type)) && body.photo.data.length < 2_000_000 ? { data: body.photo.data, type: String(body.photo.type) } : null;

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(Advice) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Fiche produit (JSON) :\n${JSON.stringify(product)}\n${photo ? 'Photo du produit ci-dessous.' : 'Pas de photo : avis d’après la fiche seule (le signaler).'}` },
            ...(photo ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: photo.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: photo.data } }] : []),
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return Response.json({ error: 'no_result' }, { status: 502 });
    return Response.json({ advice: response.parsed_output, withPhoto: !!photo });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'rate_limited' }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: 'api_error', status: e.status }, { status: 502 });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
