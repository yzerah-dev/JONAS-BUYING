import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { CounterInline } from './QuoteDialogs';
import { byId, useStore } from '../data/store';
import type { Quotation } from '../data/types';
import { dec, fdate, money } from '../lib/format';
import { useBlobUrl } from '../lib/blobUrl';
import { SupplierLogo } from './ui';

const STATUS: Record<Quotation['status'], { label: string; cls: string }> = {
  demande: { label: 'Prix attendu', cls: 'blue' },
  negociation: { label: 'Contre-offre envoyée', cls: 'blue' },
  en_attente: { label: 'À décider', cls: 'orange' },
  acceptee: { label: 'Acceptée', cls: 'green' },
  refusee: { label: 'Refusée', cls: 'grey' },
};

function Pic({ q }: { q: Quotation }) {
  const url = useBlobUrl(q.photos[0]?.fileId);
  return <span className="qtt-pic">{url ? <img src={url} alt={q.name} /> : (q.emoji ?? '📦')}</span>;
}

/** Une demande (envoyée à un ou plusieurs fournisseurs) ou une offre spontanée */
interface Request {
  key: string;
  quotes: Quotation[];
  last: string;
}

/**
 * Suivi des prix reçus : une ligne par demande, puis un fournisseur par ligne — prix reçus et contre-offres
 * dans l'ordre, prix actuel, écart au prix cible, meilleur prix ; contre-offre / acceptation / refus sur place.
 */
export function QuoteTracker({
  quotes,
  onAccept,
  onRefuse,
  allowed,
  showClosed,
  bare,
}: {
  quotes: Quotation[];
  onAccept: (q: Quotation) => void;
  onRefuse: (q: Quotation) => void;
  allowed: boolean;
  /** Imposé par la page (fiche d'une demande : tout afficher) ; sinon case à cocher */
  showClosed?: boolean;
  /** Fiche d'une demande : sans l'en-tête (déjà affiché par la page) */
  bare?: boolean;
}) {
  const { state } = useStore();
  const [closedBox, setClosed] = useState(false);
  const closed = showClosed ?? closedBox;
  const byKey = new Map<string, Quotation[]>();
  for (const q of quotes) byKey.set(q.group ?? q.id, [...(byKey.get(q.group ?? q.id) ?? []), q]);
  const activity = (q: Quotation) => [q.createdAt, q.answeredAt ?? '', q.decidedAt ?? '', ...(q.rounds ?? []).map((r) => r.at)].sort().pop()!;
  const requests: Request[] = [...byKey.entries()]
    .map(([key, list]) => ({ key, quotes: list, last: list.map(activity).sort().pop()! }))
    .filter((r) => closed || r.quotes.some((q) => q.status !== 'acceptee' && q.status !== 'refusee'))
    .sort((a, b) => b.last.localeCompare(a.last));
  const hidden = byKey.size - requests.length;

  return (
    <div className="qtt">
      {showClosed === undefined && (
        <label className="qtt-closed small">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Afficher les demandes clôturées{!closed && hidden > 0 ? ` (${hidden})` : ''}
        </label>
      )}
      {!requests.length && <div className="card empty">Aucune demande de prix en cours.</div>}
      {requests.map((r) => {
        const head = r.quotes[0];
        const priced = r.quotes.filter((q) => q.price && q.status !== 'refusee');
        const best = priced.length > 1 ? priced.reduce((m, q) => (q.price! < m.price! ? q : m)) : undefined;
        const answered = r.quotes.filter((q) => q.status !== 'demande').length;
        return (
          <section key={r.key} className="card qtt-req" aria-label={`Suivi des prix ${head.name}`}>
            {!bare && (
              <header className="qtt-head">
                <Pic q={head} />
                <div className="grow">
                  <b className="qtt-name">{head.name}</b>
                  <div className="small muted">
                    {head.origin === 'rfq' ? 'Demande de prix' : 'Offre spontanée'} du {fdate(head.createdAt.slice(0, 10))}
                    {head.qty ? ` · ${head.qty.toLocaleString('fr-FR')} pcs` : ''}
                    {head.targetPrice ? ` · prix cible ${money(head.targetPrice, head.currency)}` : ''}
                    {head.sourceProductId ? (
                      <>
                        {' · '}
                        <Link to={`/produits/${head.sourceProductId}`}>{head.sourceProductId}</Link>
                      </>
                    ) : null}
                  </div>
                </div>
                {head.origin === 'rfq' && (
                  <span className="pill grey">
                    {answered} / {r.quotes.length} réponse(s)
                  </span>
                )}
              </header>
            )}
            <div className="qtt-table" role="table">
              <div className="qtt-row qtt-th" role="row">
                <span role="columnheader">Fournisseur</span>
                <span role="columnheader">Statut</span>
                <span role="columnheader">Prix reçus et contre-offres</span>
                <span role="columnheader">Prix actuel</span>
                <span role="columnheader">Écart</span>
                <span role="columnheader" />
              </div>
              {r.quotes
                .slice()
                .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
                .map((q) => {
                  const sup = byId(state.suppliers, q.supplierId);
                  const ref = q.targetPrice || (best && best.id !== q.id ? best.price : undefined);
                  const gap = q.price && ref ? (q.price / ref - 1) * 100 : undefined;
                  return (
                    <div key={q.id} className={`qtt-row ${q.status}`} role="row" data-testid={`track-${q.id}`}>
                      <span className="qtt-sup" role="cell">
                        <SupplierLogo supplier={sup} size={28} /> <b>{sup.shortName}</b>
                      </span>
                      <span role="cell">
                        <span className={`pill ${STATUS[q.status].cls}`}>{q.status === 'refusee' && q.refusedBy === 'fournisseur' ? 'Déclinée' : STATUS[q.status].label}</span>
                      </span>
                      <span className="qtt-hist" role="cell">
                        {(q.rounds ?? []).length === 0 && <span className="muted small">{q.status === 'demande' ? 'En attente de réponse' : q.price ? money(q.price, q.currency) : '—'}</span>}
                        {(q.rounds ?? []).map((rd, i) => (
                          <Fragment key={i}>
                            {i > 0 && <span className="qt-arrow">→</span>}
                            <span className={`qt-round ${rd.by}`} title={`${rd.who} · ${fdate(rd.at.slice(0, 10))}${rd.note ? ` · ${rd.note}` : ''}`}>
                              <small>{rd.by === 'jonas' ? 'JONAS' : sup.shortName}</small> {money(rd.price, q.currency)}
                              {rd.agreed && <em> ✓</em>}
                            </span>
                          </Fragment>
                        ))}
                      </span>
                      <span className="qtt-price" role="cell">
                        {q.price ? money(q.price, q.currency) : '—'}
                        {best?.id === q.id && <small className="qtt-best">★ meilleur</small>}
                      </span>
                      <span role="cell" className={gap === undefined ? 'muted' : gap > 0 ? 'qtt-up' : 'qtt-down'} title={q.targetPrice ? 'Écart au prix cible' : 'Écart au meilleur prix'}>
                        {gap === undefined ? '—' : `${gap > 0 ? '+' : '−'}${dec(Math.abs(gap), 1)} %`}
                      </span>
                      <span className="qtt-act" role="cell">
                        {allowed && (q.status === 'en_attente' || q.status === 'negociation') && <CounterInline q={q} compact />}
                        {allowed && q.status === 'en_attente' && (
                          <button type="button" className="btn sm primary" onClick={() => onAccept(q)} aria-label={`Accepter ${sup.shortName}`}>
                            <Check size={14} /> Accepter
                          </button>
                        )}
                        {allowed && q.status !== 'acceptee' && q.status !== 'refusee' && (
                          <button type="button" className="icon-btn" onClick={() => onRefuse(q)} aria-label={`Refuser ${sup.shortName}`} title="Refuser / annuler">
                            <X size={16} />
                          </button>
                        )}
                        {q.status === 'acceptee' && q.productId && <Link to={`/produits/${q.productId}`}>{q.productId}</Link>}
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
