import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, FileQuestion, Handshake, LayoutGrid, Table2, Trash2, X } from 'lucide-react';
import { canQuote, currentUser, useStore } from '../data/store';
import type { Quotation } from '../data/types';
import { CartButton } from '../components/Cart';
import { QuoteCard } from '../components/Quotations';
import { QuoteTracker } from '../components/QuoteTracker';
import { AcceptDialog, CounterDialog, RefuseDialog, RfqDialog } from '../components/QuoteDialogs';
import { parsePrice } from '../lib/quotes';
import FilterChip from '../components/FilterChip';
import { toast } from '../components/ui-shared';

type Tab = 'en_attente' | 'fournisseur' | 'acceptee' | 'refusee';
const TABS: { id: Tab; label: string }[] = [
  { id: 'en_attente', label: 'Offres en attente' },
  { id: 'fournisseur', label: 'Chez le fournisseur' },
  { id: 'acceptee', label: 'Acceptées' },
  { id: 'refusee', label: 'Refusées' },
];
/** « Chez le fournisseur » : prix attendu, ou contre-offre JONAS en négociation */
const inTab = (q: Quotation, t: Tab) => (t === 'fournisseur' ? q.status === 'demande' || q.status === 'negociation' : q.status === t);

/** Quotations : demandes de prix aux fournisseurs et offres reçues (à accepter → produit créé et mis au panier) */
export default function Quotations() {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const allowed = canQuote(me);
  const [params, setParams] = useSearchParams();
  const tab = ((v) => (v === 'demande' ? 'fournisseur' : v))(params.get('vue') as Tab | 'demande' | null) ?? 'en_attente';
  const [supplier, setSupplier] = useState('all');
  // Suivi des prix (tableau par demande, fournisseurs côte à côte) ou cartes par statut
  const mode = params.get('mode') === 'cartes' ? 'cartes' : 'suivi';
  const setMode = (m: 'cartes' | 'suivi') => setParams(m === 'cartes' ? { mode: m, vue: tab } : {});
  const [rfq, setRfq] = useState(false);
  const [accepting, setAccepting] = useState<Quotation | null>(null);
  const [refusing, setRefusing] = useState<Quotation | null>(null);
  const [countering, setCountering] = useState<Quotation | null>(null);
  const [pricing, setPricing] = useState<Record<string, string>>({});

  const count = (st: Tab) => state.quotations.filter((q) => inTab(q, st)).length;
  const list = state.quotations
    .filter((q) => inTab(q, tab) && (supplier === 'all' || q.supplierId === supplier))
    .sort((a, b) => (b.answeredAt ?? b.createdAt).localeCompare(a.answeredAt ?? a.createdAt));
  // Même demande envoyée à plusieurs fournisseurs : meilleur prix parmi les réponses (même devise)
  const best = new Set<string>();
  const groups = new Map<string, Quotation[]>();
  for (const q of state.quotations) if (q.group && q.price && q.status === 'en_attente') groups.set(`${q.group}~${q.currency}`, [...(groups.get(`${q.group}~${q.currency}`) ?? []), q]);
  for (const g of groups.values()) if (g.length > 1) best.add(g.reduce((m, q) => (q.price! < m.price! ? q : m)).id);
  const suppliersUsed = [...new Set(state.quotations.map((q) => q.supplierId))];

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
          <button type="button" aria-pressed={mode === 'suivi'} className={mode === 'suivi' ? 'on' : ''} onClick={() => setMode('suivi')}>
            <Table2 size={16} /> Suivi des prix
          </button>
          <button type="button" aria-pressed={mode === 'cartes'} className={mode === 'cartes' ? 'on' : ''} onClick={() => setMode('cartes')}>
            <LayoutGrid size={16} /> Cartes
          </button>
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
      </div>
      {mode === 'suivi' && (
        <QuoteTracker
          quotes={state.quotations.filter((q) => supplier === 'all' || q.supplierId === supplier)}
          allowed={allowed}
          onCounter={setCountering}
          onAccept={setAccepting}
          onRefuse={setRefusing}
        />
      )}
      {mode === 'cartes' && list.length === 0 && (
        <div className="card empty">{tab === 'en_attente' ? 'Aucune offre en attente.' : tab === 'fournisseur' ? 'Aucune demande en attente chez un fournisseur.' : 'Rien ici pour le moment.'}</div>
      )}
      <div className="qt-grid" hidden={mode !== 'cartes'}>
        {mode === 'cartes' &&
          list.map((q) => (
            <QuoteCard key={q.id} q={q} best={best.has(q.id)}>
              {allowed && q.status === 'en_attente' && (
                <>
                  <button type="button" className="btn primary" onClick={() => setAccepting(q)}>
                    <Check size={16} /> Accepter
                  </button>
                  <button type="button" className="btn" onClick={() => setCountering(q)}>
                    <Handshake size={16} /> Contre-offre
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setRefusing(q)}>
                    <X size={16} /> Refuser
                  </button>
                </>
              )}
              {allowed && q.status === 'negociation' && (
                <button type="button" className="btn" onClick={() => setCountering(q)}>
                  <Handshake size={16} /> Nouvelle contre-offre
                </button>
              )}
              {allowed && (q.status === 'demande' || q.status === 'negociation') && (
                <>
                  <input
                    className="qt-price-in"
                    inputMode="decimal"
                    placeholder={`Prix reçu (${q.currency})`}
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
                  <button type="button" className="btn ghost" onClick={() => setRefusing(q)}>
                    Annuler la demande
                  </button>
                </>
              )}
              {q.status === 'acceptee' && q.productId && (
                <Link className="btn" to={`/produits/${q.productId}`} state={{ back: '/offres?vue=acceptee', backLabel: 'Offres de prix' }}>
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
      {rfq && <RfqDialog onClose={() => setRfq(false)} />}
      {accepting && <AcceptDialog q={accepting} onClose={() => setAccepting(null)} />}
      {refusing && <RefuseDialog q={refusing} onClose={() => setRefusing(null)} />}
      {countering && <CounterDialog q={countering} onClose={() => setCountering(null)} />}
    </>
  );
}
