import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Trash2, X } from 'lucide-react';
import { canQuote, currentUser, useStore } from '../data/store';
import type { Quotation } from '../data/types';
import { bestQuote, parsePrice, requestKey } from '../lib/quotes';
import { useBlobUrl } from '../lib/blobUrl';
import { QuoteCard } from './Quotations';
import { AcceptDialog, CounterInline, RefuseDialog } from './QuoteDialogs';
import { QuoteTracker } from './QuoteTracker';
import { toast } from './ui-shared';

/** Fenêtres Accepter / Refuser, partagées par le tableau de suivi et les cartes */
function useQuoteDialogs() {
  const [accepting, setAccepting] = useState<Quotation | null>(null);
  const [refusing, setRefusing] = useState<Quotation | null>(null);
  const dialogs = (
    <>
      {accepting && <AcceptDialog q={accepting} onClose={() => setAccepting(null)} />}
      {refusing && <RefuseDialog q={refusing} onClose={() => setRefusing(null)} />}
    </>
  );
  return { onAccept: setAccepting, onRefuse: setRefusing, dialogs };
}

/** Tableau de suivi des prix avec ses actions */
export function QuoteTrackerWithActions({ quotes, showClosed, bare }: { quotes: Quotation[]; showClosed?: boolean; bare?: boolean }) {
  const { state } = useStore();
  const d = useQuoteDialogs();
  return (
    <>
      <QuoteTracker quotes={quotes} allowed={canQuote(currentUser(state))} onAccept={d.onAccept} onRefuse={d.onRefuse} showClosed={showClosed} bare={bare} />
      {d.dialogs}
    </>
  );
}

/** Cartes des offres (photo, prix, historique) avec leurs actions : accepter, contre-offre, refuser, saisir un prix reçu */
export function QuoteCardGrid({ quotes, back }: { quotes: Quotation[]; back: string }) {
  const { state, dispatch } = useStore();
  const allowed = canQuote(currentUser(state));
  const [pricing, setPricing] = useState<Record<string, string>>({});
  const d = useQuoteDialogs();
  // Meilleur prix par demande
  const best = new Set<string>();
  const keys = new Set(quotes.map(requestKey));
  for (const k of keys) {
    const b = bestQuote(state.quotations.filter((q) => requestKey(q) === k && q.status === 'en_attente'));
    if (b) best.add(b.id);
  }
  return (
    <>
      <div className="qt-grid">
        {quotes.map((q) => (
          <QuoteCard key={q.id} q={q} best={best.has(q.id)}>
            {allowed && q.status === 'en_attente' && (
              <>
                <button type="button" className="btn primary" onClick={() => d.onAccept(q)}>
                  <Check size={16} /> Accepter
                </button>
                <button type="button" className="btn ghost" onClick={() => d.onRefuse(q)}>
                  <X size={16} /> Refuser
                </button>
                <CounterInline q={q} />
              </>
            )}
            {allowed && q.status === 'negociation' && <CounterInline q={q} />}
            {allowed && (q.status === 'demande' || q.status === 'negociation') && (
              <>
                <input
                  className="qt-price-in"
                  inputMode="decimal"
                  placeholder={`Prix reçu du fournisseur (${q.currency})`}
                  aria-label={`Prix reçu ${q.name}`}
                  value={pricing[q.id] ?? ''}
                  onChange={(e) => setPricing({ ...pricing, [q.id]: e.target.value })}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!parsePrice(pricing[q.id] ?? '')}
                  onClick={() => {
                    dispatch({ type: 'answerQuote', id: q.id, price: parsePrice(pricing[q.id] ?? '') });
                    toast('Prix enregistré : offre en attente');
                  }}
                >
                  OK
                </button>
                <button type="button" className="btn ghost" onClick={() => d.onRefuse(q)}>
                  Annuler la demande
                </button>
              </>
            )}
            {q.status === 'acceptee' && q.productId && (
              <Link className="btn" to={`/produits/${q.productId}`} state={{ back, backLabel: 'Offres de prix' }}>
                Voir le produit
              </Link>
            )}
            {allowed && q.status === 'refusee' && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  dispatch({ type: 'deleteQuote', id: q.id });
                  toast('Offre supprimée');
                }}
              >
                <Trash2 size={16} /> Supprimer
              </button>
            )}
          </QuoteCard>
        ))}
      </div>
      {d.dialogs}
    </>
  );
}

/** Photo d'une demande (première photo reçue ou envoyée, sinon pictogramme) */
export function RequestPic({ quotes, className }: { quotes: Quotation[]; className?: string }) {
  const q = quotes.find((x) => x.photos.length) ?? quotes[0];
  const url = useBlobUrl(q.photos[0]?.fileId);
  return <span className={className}>{url ? <img src={url} alt={q.name} /> : (q.emoji ?? '📦')}</span>;
}
