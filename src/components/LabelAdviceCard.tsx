import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Copy, Loader2, ScrollText, Sparkles, Tag } from 'lucide-react';
import { currentUser, useAuth, useStore } from '../data/store';
import type { Product } from '../data/types';
import { labelAdvice } from '../lib/labelAdvice';
import { fstamp } from '../lib/format';
import { toast } from './ui-shared';
import PackCheckCard from './PackCheckCard';

/** Avis d'étiquetage (normes françaises / UE) : Claude analyse la photo et la fiche du produit */
export default function LabelAdviceCard({ p }: { p: Product }) {
  return (
    <div className="la-wrap">
      <AdviceBlock p={p} />
      <PackCheckCard p={p} />
    </div>
  );
}

function AdviceBlock({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const a = p.labelAdvice;
  const can = auth.allowed({
    type: 'setLabelAdvice',
    productId: p.id,
    advice: { at: '', by: '', withPhoto: false, product: '', category: '', summary: '', regulations: [], mentions: [], pictos: [], warnings: [], checks: [] },
  });
  const run = async () => {
    setBusy(true);
    try {
      const r = await labelAdvice(state, p);
      if (r === 'not_configured') return toast('Avis d’étiquetage pas encore activé : la clé Claude (ANTHROPIC_API_KEY) doit être ajoutée dans Vercel.');
      if (typeof r === 'string') return toast('Analyse impossible pour le moment : réessayez dans un instant.');
      dispatch({ type: 'setLabelAdvice', productId: p.id, advice: { ...r.body, withPhoto: r.withPhoto, at: new Date().toISOString(), by: currentUser(state).name } });
      toast(`Avis d’étiquetage prêt pour ${p.ref}`);
    } finally {
      setBusy(false);
    }
  };
  const copyWarnings = () => {
    if (!a?.warnings.length) return;
    navigator.clipboard?.writeText(a.warnings.join('\n')).then(
      () => toast('Avertissements copiés'),
      () => toast('Copie impossible'),
    );
  };
  return (
    <div className="la">
      <div className="la-head">
        <Tag size={18} className="green" />
        <b>Avis d’étiquetage · normes françaises</b>
        <span className="grow" />
        {can && (
          <button type="button" className={`btn sm ${a ? '' : 'primary'}`} disabled={busy} onClick={run}>
            {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {a ? 'Refaire l’analyse' : 'Analyser avec Claude'}
          </button>
        )}
      </div>
      {!a && !busy && (
        <p className="small muted" style={{ margin: 0 }}>
          Claude regarde la photo {p.photo ? '' : '(pas encore de photo : il s’appuiera sur la fiche) '}et la fiche du produit, puis indique les mentions, pictogrammes et avertissements à prévoir sur
          le pack pour la France.
        </p>
      )}
      {busy && <p className="small muted">Analyse en cours…</p>}
      {a && (
        <>
          <div className="la-sum">
            <span className="pill violet">{a.category}</span>
            <p>{a.summary}</p>
            <small className="muted">{a.product}</small>
          </div>
          {a.mentions.length > 0 && (
            <section>
              <h4>
                <ClipboardCheck size={15} /> Mentions sur le pack
              </h4>
              <ul className="la-list">
                {a.mentions.map((m, i) => (
                  <li key={i}>
                    <span className={`la-tag ${m.required ? 'req' : ''}`}>{m.required ? 'Obligatoire' : 'Conseillé'}</span>
                    <div>
                      <b>{m.text}</b>
                      <small>{m.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {a.pictos.length > 0 && (
            <section>
              <h4>
                <CheckCircle2 size={15} /> Pictogrammes et marquages
              </h4>
              <ul className="la-list">
                {a.pictos.map((m, i) => (
                  <li key={i}>
                    <span className={`la-tag ${m.required ? 'req' : ''}`}>{m.required ? 'Obligatoire' : 'Conseillé'}</span>
                    <div>
                      <b>{m.name}</b>
                      <small>{m.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {a.warnings.length > 0 && (
            <section>
              <h4>
                <AlertTriangle size={15} /> Avertissements à imprimer
                <button type="button" className="btn ghost sm" onClick={copyWarnings} style={{ marginLeft: 'auto' }}>
                  <Copy size={13} /> Copier
                </button>
              </h4>
              <ul className="la-warn">
                {a.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}
          {a.checks.length > 0 && (
            <section>
              <h4>
                <ScrollText size={15} /> À vérifier / demander au fournisseur
              </h4>
              <ul className="la-checks">
                {a.checks.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}
          {a.regulations.length > 0 && (
            <details className="la-regs">
              <summary>Textes applicables ({a.regulations.length})</summary>
              <ul>
                {a.regulations.map((r, i) => (
                  <li key={i}>
                    <b>{r.name}</b> — {r.why}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="xs muted" style={{ margin: 0 }}>
            Avis indicatif de Claude {a.withPhoto ? 'd’après la photo et la fiche' : 'd’après la fiche (sans photo)'} · {a.by} · {fstamp(a.at)}. À faire valider (fournisseur, laboratoire, service
            qualité) avant impression.
          </p>
        </>
      )}
    </div>
  );
}
