// Retour d'un lien de connexion par e-mail (flux PKCE) : https://…/?code=… ou ?error=…&error_description=…
// Le HashRouter garde sa route dans le « # » : on ne touche qu'à la partie « ?… » de l'adresse.

export interface AuthReturn {
  /** L'adresse contient un code de connexion à échanger */
  hadCode: boolean;
  /** Supabase a renvoyé une erreur (lien expiré, déjà utilisé…) */
  error: string;
}

const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description'];

export function readAuthReturn(href: string): AuthReturn {
  if (!href) return { hadCode: false, error: '' };
  const u = new URL(href);
  // Certaines erreurs arrivent dans le « # » (#error=…) : on les lit aussi
  const hash = new URLSearchParams(u.hash.replace(/^#\/?/, '').split('?').pop() ?? '');
  const error = u.searchParams.get('error_description') || u.searchParams.get('error') || hash.get('error_description') || '';
  return { hadCode: u.searchParams.has('code'), error };
}

/** Adresse sans les paramètres de connexion, « #/… » du HashRouter conservé */
export function cleanAuthUrl(href: string): string {
  const u = new URL(href);
  for (const p of AUTH_PARAMS) u.searchParams.delete(p);
  let hash = u.hash;
  if (/^#(error|access_token)=/.test(hash)) hash = '';
  return u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + hash;
}

export const LINK_FAILED = 'Ouvrez le lien dans le navigateur où vous l’avez demandé, ou redemandez un lien.';
export const UNKNOWN_ADDRESS = 'Cette adresse n’a pas d’accès à JONAS BUYING.';

/** Message d'erreur de connexion compréhensible (jamais l'erreur brute de Supabase) */
export function authMessage(err: { message?: string; code?: string; status?: number }, withPassword: boolean): string {
  const m = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  if (/otp_disabled|signups? not allowed|user not found|email_address_not_authorized/.test(m)) return UNKNOWN_ADDRESS;
  if (/invalid_credentials|invalid login credentials/.test(m)) return withPassword ? 'E-mail ou mot de passe incorrect. Sans mot de passe défini, laissez le champ vide pour recevoir un lien.' : UNKNOWN_ADDRESS;
  if (/email_not_confirmed/.test(m)) return 'Adresse pas encore confirmée : laissez le mot de passe vide pour recevoir un lien.';
  if (/rate|too many|over_email_send_rate_limit|security purposes/.test(m) || err.status === 429)
    return 'Trop de demandes : patientez une minute avant de redemander un lien.';
  return 'Connexion impossible pour le moment. Réessayez, ou contactez le Pilote.';
}
