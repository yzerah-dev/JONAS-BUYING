// Fonction serveur Vercel : contrôle réglementaire d'un visuel de pack (normes françaises / UE) par Claude.
// Claude lit les pages du pack (images), la fiche, la photo du produit et l'avis d'étiquetage s'il existe,
// puis dit ce qui est conforme, manquant ou à corriger. Réservée aux utilisateurs connectés (jeton Supabase vérifié).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://ulwsixiywyikyjanbidk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_b0v4s7AH4nQ31AmeigQ6hA_NaHA3ZHC';
const IMG = /^image\/(jpeg|png|webp|gif)$/;
type Img = { data: string; type: string };

const Check = z.object({
  verdict: z.enum(['conforme', 'a_corriger', 'non_conforme']),
  summary: z.string(),
  checks: z.array(z.object({ item: z.string(), status: z.enum(['ok', 'manquant', 'a_corriger', 'a_verifier']), detail: z.string() })),
  texts: z.array(z.object({ found: z.string(), fix: z.string() })),
});

const SYSTEM = `Tu es contrôleur qualité étiquetage pour JONAS INTERNATIONAL (Paris), importateur de produits non alimentaires vendus en grande distribution en France.
On te donne le visuel du PACK (une ou plusieurs pages), la fiche et la photo du produit, et parfois l'avis d'étiquetage déjà établi (mentions, pictogrammes, avertissements attendus).
Contrôle le pack par rapport à la réglementation française et européenne applicable à ce produit :
- identification de l'importateur (nom, adresse postale, contact) et du produit (référence, lot / traçabilité) – Règlement (UE) 2023/988 (GPSR) ;
- informations et avertissements en français (loi Toubon), lisibles ;
- pictogrammes et marquages obligatoires selon la catégorie (Triman + Info-tri, verre-fourchette, CE, DEEE, âge 0-3 ans, symboles d'entretien, composition textile…), et l'absence de marquages abusifs (CE sur un produit qui n'en relève pas, mentions trompeuses) ;
- cohérence avec le produit réel (photo) : contenance, nombre de pièces, coloris, dimensions annoncées ;
- code-barres EAN présent si attendu ; fautes d'orthographe ou de traduction.
Réponds en français :
- "verdict" : conforme / a_corriger (manques ou erreurs mineurs) / non_conforme (mention obligatoire absente ou risque réglementaire) ;
- "summary" : 2 à 4 phrases pour le designer ;
- "checks" : un point par exigence, avec "status" (ok, manquant, a_corriger, a_verifier si illisible ou impossible à confirmer sur le visuel) et "detail" (où sur le pack, quoi corriger, texte proposé) ;
- "texts" : chaque texte fautif lu sur le pack et sa correction.
Ne dis « ok » que pour ce que tu lis réellement sur le visuel. Si le visuel est flou ou partiel, mets « a_verifier ».`;

async function userOf(token: string) {
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? ((await r.json()) as { id?: string }) : null;
}

const okImg = (i: unknown): i is Img => !!i && typeof (i as Img).data === 'string' && IMG.test(String((i as Img).type)) && (i as Img).data.length < 2_500_000;
const block = (i: Img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: i.data } });

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'not_configured' }, { status: 503 });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await userOf(token);
  if (!user?.id) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { product?: Record<string, unknown>; advice?: unknown; pack?: unknown[]; packText?: unknown; photo?: unknown } | null;
  const pack = (body?.pack ?? []).filter(okImg).slice(0, 4);
  if (!pack.length) return Response.json({ error: 'no_pack' }, { status: 400 });
  const product = Object.fromEntries(Object.entries(body?.product ?? {}).map(([k, v]) => [k, String(v ?? '').slice(0, 3000)]));
  const photo = okImg(body?.photo) ? body!.photo : null;
  const packText = String(body?.packText ?? '').slice(0, 12000);

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(Check) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Fiche produit :\n${JSON.stringify(product)}` },
            ...(body?.advice ? [{ type: 'text' as const, text: `Avis d'étiquetage déjà établi (ce qui est attendu) :\n${JSON.stringify(body.advice).slice(0, 12000)}` }] : []),
            ...(photo ? [{ type: 'text' as const, text: 'Photo du produit réel :' }, block(photo)] : []),
            { type: 'text', text: `Visuel du pack (${pack.length} page(s)) :` },
            ...pack.map(block),
            ...(packText ? [{ type: 'text' as const, text: `Texte extrait du fichier du pack (aide à la lecture) :\n${packText}` }] : []),
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return Response.json({ error: 'no_result' }, { status: 502 });
    return Response.json({ check: response.parsed_output });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'rate_limited' }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: 'api_error', status: e.status }, { status: 502 });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
