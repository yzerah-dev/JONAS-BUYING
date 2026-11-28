import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileQuestion, Images, LayoutGrid, Table2 } from 'lucide-react';
import { byId, canQuote, currentUser, useStore } from '../data/store';
import type { Quotation } from '../data/types';
import { CartButton } from '../components/Cart';
import { QuoteCardGrid, QuoteTrackerWithActions, RequestPic } from '../components/QuoteBoard';
import { RfqDialog } from '../components/QuoteDialogs';
import { isClosed, quoteRequests, requestSummary } from '../lib/quotes';
import { fdate, num } from '../lib/format';
import FilterChip from '../components/FilterChip';
import { SupplierLogo } from '../components/ui';

type Tab = 'en_attente' | 'fournisseur' | 'acceptee' | 'refusee';
const TABS: { id: Tab; label: string }[] = [
  { id: 'en_attente', label: 'Offres en attente' },
  { id: 'fournisseur', label: 'Chez le fournisseur' },
  { id: 'acceptee', label: 'Acceptées' },
  { id: 'refusee', label: 'Refusées' },
];
/** « Chez le fournisseur » : prix attendu, ou contre-offre JONAS en négociation */
const inTab = (q: Quotation, t: Tab) => (t === 'fournisseur' ? q.status === 'demande' || q.status === 'negociation' : q.status === t);
type Mode = 'galerie' | 'suivi' | 'cartes';

/** Quotations : demandes de prix aux fournisseurs et offres reçues (à accepter → produit créé et mis au panier) */
export default function Quotations() {
  const { state } = useStore();
  const allowed = canQuote(currentUser(state));
  const [params, setParams] = useSearchParams();
  const tab = ((v) => (v === 'demande' ? 'fournisseur' : v))(params.get('vue') as Tab | 'demande' | null) ?? 'en_attente';
  const [supplier, setSupplier] = useState('all');
  const [closed, setClosed] = useState(false);
  // Galerie (une carte par produit demandé), suivi des prix (tableau), ou offres une par une par statut
  const mode: Mode = (['suivi', 'cartes'] as const).find((m) => m === params.get('mode')) ?? 'galerie';
  const setMode = (m: Mode) => setParams(m === 'galerie' ? {} : m === 'cartes' ? { mode: m, vue: tab } : { mode: m });
  const [rfq, setRfq] = useState(false);

  const mine = state.quotations.filter((q) => supplier === 'all' || q.supplierId === supplier);
  const count = (st: Tab) => mine.filter((q) => inTab(q, st)).length;
  const list = mine.filter((q) => inTab(q, tab)).sort((a, b) => (b.answeredAt ?? b.createdAt).localeCompare(a.answeredAt ?? a.createdAt));
  const requests = quoteRequests(mine);
  const shown = requests.filter((r) => closed || r.quotes.some((q) => !isClosed(q)));
  const suppliersUsed = [...new Set(state.quotations.map((q) => q.supplierId))];
  const MODES: { id: Mode; label: string; icon: typeof Images }[] = [
    { id: 'galerie', label: 'Galerie', icon: Images },
    { id: 'suivi', label: 'Suivi des prix', icon: Table2 },
    { id: 'cartes', label: 'Par statut', icon: LayoutGrid },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Offres de prix</h1>
        <span className="page-sub">Demandes de prix aux fournisseurs, négociation et offres reçues : acceptée, l’offre devient un produit (ou un nouveau prix) ajouté au panier.</span>
        <div className="grow" />
        {allowed && <CartButton />}
        {allowed && (
          <button type="button" className="btn primary" onClick={() => setRfq(true)}>
            <FileQuestion size={16} /> Demande de prix
          </button>
        )}
      </div>
      <div className="row wrap mb" style={{ gap: 8 }}>
        <span className="pfx-seg" role="group" aria-label="Présentation">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
              <m.icon size={16} /> {m.label}
            </button>
          ))}
        </span>
        {mode === 'cartes' && (
          <span className="pfx-seg" role="group" aria-label="Statut">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setParams({ mode: 'cartes', vue: t.id })}>
                {t.label} <b className="qt-count">{count(t.id)}</b>
              </button>
            ))}
          </span>
        )}
        {suppliersUsed.length > 1 && (
          <FilterChip label="Fournisseur" value={supplier} onChange={setSupplier} options={suppliersUsed.map((id) => ({ id, label: state.suppliers.find((s) => s.id === id)?.shortName ?? id }))} />
        )}
        {mode === 'galerie' && (
          <label className="qtt-closed small">
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Afficher les demandes clôturées
          </label>
        )}
      </div>

      {mode === 'galerie' && (
        <>
          {!shown.length && <div className="card empty">Aucune demande de prix en cours.</div>}
          <div className="qtg-grid">
            {shown.map((r) => {
              const head = r.quotes[0];
              const s = requestSummary(r.quotes);
              return (
                <Link key={r.key} to={`/offres/${encodeURIComponent(r.key)}`} className="card qtg-card" aria-label={`Offres ${head.name}`}>
                  <RequestPic quotes={r.quotes} className="qtg-hero" />
                  <div className="qtg-body">
                    <b className="qtg-name">{head.name}</b>
                    <div className="xs muted">
                      {head.origin === 'rfq' ? 'Demande de prix' : 'Offre spontanée'} · {fdate(head.createdAt.slice(0, 10))}
                      {head.qty ? ` · ${num(head.qty)} pcs` : ''}
                    </div>
                    <div className="qtg-price">
                      {s.lowLabel ? (
                        <>
                          <small>{r.quotes.length > 1 ? 'dès' : ''}</small> {s.lowLabel}
                        </>
                      ) : (
                        <span className="muted">Prix attendu</span>
                      )}
                    </div>
                    <div className="qtg-tags">
                      {r.quotes.length > 1 && (
                        <span className="pill grey">
                          {s.answered} / {r.quotes.length} réponse(s)
                        </span>
                      )}
                      {s.toDecide > 0 && <span className="pill orange">{s.toDecide} à décider</span>}
                      {s.nego > 0 && <span className="pill blue">{s.nego} en négociation</span>}
                      {s.accepted && <span className="pill green">Acceptée · {byId(state.suppliers, s.accepted.supplierId).shortName}</span>}
                    </div>
                    <div className="qtg-sups">
                      {r.quotes.map((q) => (
                        <SupplierLogo key={q.id} supplier={byId(state.suppliers, q.supplierId)} size={26} />
                      ))}
                      <span className="grow" />
                      <span className="qtg-open">Voir les offres ›</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
      {mode === 'suivi' && <QuoteTrackerWithActions quotes={mine} />}
      {mode === 'cartes' && list.length === 0 && (
        <div className="card empty">{tab === 'en_attente' ? 'Aucune offre en attente.' : tab === 'fournisseur' ? 'Aucune demande en attente chez un fournisseur.' : 'Rien ici pour le moment.'}</div>
      )}
      {mode === 'cartes' && <QuoteCardGrid quotes={list} back={`/offres?mode=cartes&vue=${tab}`} />}
      {rfq && <RfqDialog onClose={() => setRfq(false)} />}
    </>
  );
}
