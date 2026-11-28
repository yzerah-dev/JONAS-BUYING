import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, FileQuestion } from 'lucide-react';
import { useState } from 'react';
import { canQuote, currentUser, useStore } from '../data/store';
import { QuoteCardGrid, QuoteTrackerWithActions, RequestPic } from '../components/QuoteBoard';
import { RfqDialog } from '../components/QuoteDialogs';
import { requestKey, requestSummary } from '../lib/quotes';
import { fdate, money, num } from '../lib/format';

/** Une demande de prix (un produit) : toutes les offres des fournisseurs — tableau comparatif puis cartes avec photos */
export default function QuotationDetail() {
  const { key = '' } = useParams();
  const { state } = useStore();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState(false);
  const quotes = state.quotations.filter((q) => requestKey(q) === key);
  if (!quotes.length) {
    // Ancien lien (numéro de demande ou d'offre) : on ouvre la fiche du produit concerné
    const old = state.quotations.find((q) => q.group === key || q.id === key);
    return old ? <Navigate to={`/offres/${encodeURIComponent(requestKey(old))}`} replace /> : <div className="card empty">Demande introuvable.</div>;
  }
  // En-tête : la demande la plus récente (quantité, prix cible)
  const head = quotes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const s = requestSummary(quotes);
  const src = head.sourceProductId ? state.products.find((p) => p.id === head.sourceProductId) : undefined;
  const sorted = quotes.slice().sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return (
    <>
      <div className="page-head">
        <button className="btn" onClick={() => navigate('/offres')}>
          <ChevronLeft size={16} /> Retour aux offres
        </button>
        <h1>Offres reçues</h1>
        <div className="grow" />
        {canQuote(currentUser(state)) && src && (
          <button className="btn" onClick={() => setRfq(true)}>
            <FileQuestion size={16} /> Interroger d’autres fournisseurs
          </button>
        )}
      </div>
      <div className="card qtd-head">
        <RequestPic quotes={quotes} className="qtd-pic" />
        <div className="col" style={{ gap: 6 }}>
          <h2 className="qtd-name">{head.name}</h2>
          <div className="muted">
            {head.origin === 'rfq' ? 'Demande de prix' : 'Offre spontanée'} du {fdate(head.createdAt.slice(0, 10))} par {head.createdBy}
            {head.qty ? ` · ${num(head.qty)} pcs` : ''}
            {head.targetPrice ? ` · prix cible ${money(head.targetPrice, head.currency)}` : ''}
          </div>
          {src && (
            <div className="small">
              Produit{' '}
              <Link to={`/produits/${src.id}`} state={{ back: `/offres/${encodeURIComponent(key)}`, backLabel: 'Offres reçues' }}>
                {src.ref} · {src.name}
              </Link>
            </div>
          )}
          <div className="qtg-tags">
            <span className="pill grey">
              {s.answered} / {quotes.length} réponse(s)
            </span>
            {s.lowLabel && <span className="pill green">Meilleur prix {s.lowLabel}</span>}
            {s.toDecide > 0 && <span className="pill orange">{s.toDecide} à décider</span>}
            {s.nego > 0 && <span className="pill blue">{s.nego} en négociation</span>}
          </div>
        </div>
      </div>
      <h3 className="qtd-h">Comparatif des prix</h3>
      <QuoteTrackerWithActions quotes={quotes} showClosed bare />
      <h3 className="qtd-h">Offres de chaque fournisseur</h3>
      <QuoteCardGrid quotes={sorted} back={`/offres/${encodeURIComponent(key)}`} />
      {rfq && src && <RfqDialog product={src} onClose={() => setRfq(false)} />}
    </>
  );
}
