// Fonction serveur Vercel : lecture d'une proforma fournisseur (PDF, photo, ou texte extrait) par Claude.
// Réservée aux utilisateurs connectés (jeton Supabase vérifié). Clé Claude : variable ANTHROPIC_API_KEY du projet Vercel.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Adresse et clé PUBLIQUE (publishable) de la base, les mêmes que dans .env.supabase : servent seulement à vérifier la connexion
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://ulwsixiywyikyjanbidk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_b0v4s7AH4nQ31AmeigQ6hA_NaHA3ZHC';

const Result = z.object({
  currency: z.string(),
  lines: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      ean: z.string(),
      qty: z.number(),
      price: z.number(),
      pcb: z.number(),
      cbmCarton: z.number(),
    }),
  ),
});

const PROMPT = `Tu lis une proforma d'un fournisseur (Asie) pour l'importateur JONAS.
Extrais une ligne par article commandé (ignore totaux, frais, acomptes) :
- ref : référence article (du fournisseur ou de JONAS), "" si absente
- name : désignation telle qu'écrite
- ean : code EAN si présent, sinon ""
- qty : nombre de pièces ; price : prix unitaire par pièce
- pcb : pièces par carton (0 si non indiqué) ; cbmCarton : m³ par carton (0 si non indiqué)
currency : la devise de la proforma (USD, EUR, CNY…).`;

async function userOf(token: string) {
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? ((await r.json()) as { id?: string }) : null;
}

type Body = { text?: string; file?: { data: string; type: string } };

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'not_configured' }, { status: 503 });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await userOf(token))?.id) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const content: Anthropic.ContentBlockParam[] = [];
  if (body?.file?.data && body.file.type === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.file.data } });
  } else if (body?.file?.data && (body.file.type === 'image/png' || body.file.type === 'image/jpeg')) {
    content.push({ type: 'image', source: { type: 'base64', media_type: body.file.type, data: body.file.data } });
  } else if (body?.text?.trim()) {
    content.push({ type: 'text', text: `Contenu de la proforma (cellules séparées par « | ») :\n${body.text.slice(0, 60000)}` });
  } else return Response.json({ error: 'empty' }, { status: 400 });
  content.push({ type: 'text', text: PROMPT });

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(Result) },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return Response.json({ error: 'no_result' }, { status: 502 });
    return Response.json(response.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'rate_limited' }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: 'api_error', status: e.status }, { status: 502 });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
