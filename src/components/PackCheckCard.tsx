import { useState } from 'react';
import { CheckCircle2, CircleAlert, CircleHelp, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { currentUser, useAuth, useStore } from '../data/store';
import type { PackCheck, Product } from '../data/types';
import { lastPackFiles, packCheck } from '../lib/packCheck';
import { fstamp } from '../lib/format';
import { toast } from './ui-shared';

const VERDICT: Record<PackCheck['verdict'], { label: string; cls: string }> = {
  conforme: { label: 'Conforme', cls: 'ok' },
  a_corriger: { label: 'À corriger', cls: 'warn' },
  non_conforme: { label: 'Non conforme', cls: 'bad' },
};
const STATUS: Record<PackCheck['checks'][number]['status'], { label: string; icon: React.ReactNode; cls: string }> = {
  ok: { label: 'OK', icon: <CheckCircle2 size={15} />, cls: 'ok' },
  manquant: { label: 'Manquant', icon: <XCircle size={15} />, cls: 'bad' },
  a_corriger: { label: 'À corriger', icon: <CircleAlert size={15} />, cls: 'warn' },
  a_verifier: { label: 'À vérifier', icon: <CircleHelp size={15} />, cls: 'grey' },
};

/** Contrôle réglementaire du pack déposé (dernière version), par Claude */
export default function PackCheckCard({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const c = p.packCheck;
  const { version, files, unreadable } = lastPackFiles(p);
  const can = auth.allowed({ type: 'setPackCheck', productId: p.id, check: { at: '', by: '', version: 0, files: [], verdict: 'conforme', summary: '', checks: [], texts: [] } });
  const outdated = !!c && c.version !== version;
  const run = async () => {
    setBusy(true);
    try {
      const r = await packCheck(state, p);
      if (r === 'not_configured') return toast('Contrôle du pack pas encore activé : la clé Claude (ANTHROPIC_API_KEY) doit être ajoutée dans Vercel.');
      if (r === 'no_pack') return toast('Aucun pack lisible : déposez le pack en PDF, JPG ou PNG (ou un .ai enregistré avec la compatibilité PDF).');
      if (r === 'unreadable') return toast('Le fichier du pack n’a pas pu être lu.');
      if (r === 'unavailable') return toast('Le contrôle du pack se fait sur la plateforme en ligne (pas dans la démo).');
      if (typeof r === 'string') return toast('Contrôle impossible pour le moment : réessayez dans un instant.');
      dispatch({ type: 'setPackCheck', productId: p.id, check: { ...r.body, at: new Date().toISOString(), by: currentUser(state).name } });
      toast(`Pack v${r.body.version} contrôlé : ${VERDICT[r.body.verdict].label}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="la pc">
      <div className="la-head">
        <ShieldCheck size={18} className="green" />
        <b>Contrôle du pack · conformité réglementaire</b>
        <span className="grow" />
        {can && (
          <button type="button" className={`btn sm ${c && !outdated ? '' : 'primary'}`} disabled={busy || !files.length} onClick={run}>
            {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />} {files.length ? `Contrôler le pack v${version} avec Claude` : 'Aucun pack à contrôler'}
          </button>
        )}
      </div>
      {!c && !busy && (
        <p className="small muted" style={{ margin: 0 }}>
          {files.length
            ? `Claude lit le pack v${version} (${files.map((f) => f.name).join(', ')}), le compare à la photo, à la fiche${p.labelAdvice ? ' et à l’avis d’étiquetage' : ''}, et dit ce qui est conforme, manquant ou à corriger.`
            : 'Déposez d’abord le pack (PDF, JPG, PNG ou .ai compatible PDF) dans les fichiers du pack.'}
          {unreadable.length > 0 && ` Non lisibles : ${unreadable.map((f) => f.name).join(', ')} (exportez un PDF).`}
        </p>
      )}
      {busy && <p className="small muted">Contrôle en cours… (lecture du pack, jusqu’à une minute)</p>}
      {c && (
        <>
          <div className={`pc-verdict ${VERDICT[c.verdict].cls}`}>
            <b>{VERDICT[c.verdict].label}</b>
            <p>{c.summary}</p>
            {outdated && (
              <small>
                Contrôle fait sur la v{c.version} : le pack est maintenant en v{version}, relancez le contrôle.
              </small>
            )}
          </div>
          <ul className="la-list">
            {c.checks.map((x, i) => (
              <li key={i}>
                <span className={`pc-st ${STATUS[x.status].cls}`}>
                  {STATUS[x.status].icon} {STATUS[x.status].label}
                </span>
                <div>
                  <b>{x.item}</b>
                  <small>{x.detail}</small>
                </div>
              </li>
            ))}
          </ul>
          {c.texts.length > 0 && (
            <section>
              <h4>Textes à corriger sur le pack</h4>
              <ul className="pc-texts">
                {c.texts.map((t, i) => (
                  <li key={i}>
                    <s>{t.found}</s> → <b>{t.fix}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="xs muted" style={{ margin: 0 }}>
            Contrôle indicatif de Claude sur le pack v{c.version} ({c.files.join(', ')}) · {c.by} · {fstamp(c.at)}. Ne remplace pas la validation Direction / Moinard ni un contrôle laboratoire.
          </p>
        </>
      )}
    </div>
  );
}
