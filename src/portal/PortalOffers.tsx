import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Plus, Send, X } from 'lucide-react';
import { lastCounter, newQuoteId, supplierTerms } from '../data/store';
import { money } from '../lib/format';
import type { ProductPhoto, Quotation } from '../data/types';
import { supplierScope } from '../lib/files';
import { QuoteCard, QuotePhotosInput } from '../components/Quotations';
import { parsePrice } from '../lib/quotes';
import { Seg } from '../components/ui';
import { toast } from '../components/ui-shared';
import { useT } from '../i18n';
import { usePortal } from './usePortal';

type View = 'chiffrer' | 'nego' | 'envoyees' | 'closes';

/**
 * Portail fournisseur, deux rubriques :
 * - « Demandes de quotation » (mode rfq) : demandes de prix de JONAS — donner son prix, répondre aux contre-offres, décliner ;
 * - « Mes offres » (mode offres) : produits proposés spontanément à JONAS (et leurs négociations).
 */
export default function PortalOffers({ mode = 'offres' }: { mode?: 'rfq' | 'offres' }) {
  const { state, dispatch, supplier, user } = usePortal();
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const mine = state.quotations.filter((q) => q.supplierId === supplier?.id && (mode === 'rfq' ? q.origin === 'rfq' : q.origin !== 'rfq'));
  const toAnswer = mine.filter((q) => q.status === 'demande');
  const nego = mine.filter((q) => q.status === 'negociation');
  const sent = mine.filter((q) => q.status === 'en_attente');
  const closed = mine.filter((q) => q.status === 'acceptee' || q.status === 'refusee');
  const views: { id: View; label: string; list: Quotation[] }[] = [
    ...(mode === 'rfq' ? [{ id: 'chiffrer' as const, label: t('q.tab.toAnswer', { n: toAnswer.length }), list: toAnswer }] : []),
    { id: 'nego', label: t('q.tab.nego', { n: nego.length }), list: nego },
    { id: 'envoyees', label: mode === 'rfq' ? t('q.tab.answered', { n: sent.length }) : t('q.tab.sent', { n: sent.length }), list: sent },
    { id: 'closes', label: t('q.tab.closed', { n: closed.length }), list: closed },
  ];
  const asked = params.get('vue') as View | null;
  const view = views.find((v) => v.id === asked)?.id ?? views.find((v) => v.list.length && (v.id === 'chiffrer' || v.id === 'nego'))?.id ?? views.find((v) => v.list.length)?.id ?? views[0].id;
  const [creating, setCreating] = useState(false);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (!supplier) return null;
  const list = views
    .find((v) => v.id === view)!
    .list.slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="page-head">
        <h1>{mode === 'rfq' ? t('nav.rfq') : t('nav.myOffers')}</h1>
        <span className="page-sub">{mode === 'rfq' ? t('q.rfq.sub') : t('q.portal.sub')}</span>
        <div className="grow" />
        {mode === 'offres' && (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> {t('q.new')}
          </button>
        )}
      </div>
      <div className="mb">
        <Seg value={view} onChange={(v) => setParams({ vue: v })} options={views.map((v) => ({ id: v.id, label: v.label }))} />
      </div>
      {list.length === 0 && <div className="card empty">{t('q.empty')}</div>}
      <div className="qt-grid">
        {list.map((q) => (
          <QuoteCard key={q.id} q={q} showSupplier={false}>
            {(q.status === 'demande' || q.status === 'negociation') &&
              (declining === q.id ? (
                <>
                  <input className="qt-price-in grow" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('q.declineReason')} aria-label={t('q.declineReason')} autoFocus />
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      dispatch({ type: 'refuseQuote', id: q.id, reason });
                      setDeclining(null);
                      setReason('');
                      toast(t('q.declined'));
                    }}
                  >
                    {t('q.decline')}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setDeclining(null)}>
                    {t('q.cancel')}
                  </button>
                </>
              ) : (
                <>
                  {q.status === 'negociation' && lastCounter(q) && (
                    <button
                      type="button"
                      className="btn primary qt-accept-counter"
                      onClick={() => {
                        dispatch({ type: 'acceptCounter', id: q.id });
                        toast(t('q.counterOk'));
                      }}
                    >
                      <Check size={15} /> {t('q.acceptCounter', { p: money(lastCounter(q)!.price, q.currency) })}
                    </button>
                  )}
                  <input
                    className="qt-price-in"
                    inputMode="decimal"
                    placeholder={q.status === 'negociation' ? t('q.newPrice', { c: q.currency }) : t('q.price', { c: q.currency })}
                    aria-label={q.status === 'negociation' ? t('q.newPrice', { c: q.currency }) : t('q.price', { c: q.currency })}
                    value={price[q.id] ?? ''}
                    onChange={(e) => setPrice({ ...price, [q.id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className={`btn ${q.status === 'negociation' ? '' : 'primary'}`}
                    disabled={!parsePrice(price[q.id] ?? '')}
                    onClick={() => {
                      dispatch({ type: 'answerQuote', id: q.id, price: parsePrice(price[q.id] ?? '') });
                      toast(t('q.answered'));
                    }}
                  >
                    <Send size={15} /> {q.status === 'negociation' ? t('q.propose') : t('q.answer')}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setDeclining(q.id)}>
                    {t('q.decline')}
                  </button>
                </>
              ))}
          </QuoteCard>
        ))}
      </div>
      {creating && (
        <NewOffer
          supplierId={supplier.id}
          currency={supplierTerms(state, supplier.id).currency}
          onClose={() => setCreating(false)}
          onSend={(q) => {
            dispatch({ type: 'submitOffer', quotation: { ...q, createdBy: user.name } });
            toast(t('q.sentOk'));
            setCreating(false);
            setParams({ vue: 'envoyees' });
          }}
        />
      )}
    </>
  );
}

function NewOffer({ supplierId, currency, onClose, onSend }: { supplierId: string; currency: Quotation['currency']; onClose: () => void; onSend: (q: Quotation) => void }) {
  const { t } = useT();
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const ok = !!name.trim() && parsePrice(price) > 0;
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <div className="card rc-dialog bk-dialog" role="dialog" aria-label={t('q.newTitle')} onMouseDown={(e) => e.stopPropagation()}>
        <header className="rc-head">
          <div>
            <h2>{t('q.newTitle')}</h2>
            <span className="muted small">{t('q.newHint')}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('q.cancel')}>
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          <div className="bk-wide">
            <div className="lbl">{t('q.photos')}</div>
            <QuotePhotosInput scope={supplierScope(supplierId)} photos={photos} onChange={setPhotos} />
          </div>
          <label className="bk-wide">
            <span>{t('q.name')}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>{t('q.price', { c: currency })}</span>
            <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            <span>{t('q.note')}</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('q.cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!ok}
            onClick={() =>
              onSend({
                id: newQuoteId(),
                kind: 'quotation',
                supplierId,
                origin: 'spontanee',
                name: name.trim(),
                photos,
                price: parsePrice(price),
                currency,
                ...(note.trim() ? { note: note.trim() } : {}),
                status: 'en_attente',
                createdAt: new Date().toISOString(),
                createdBy: '',
              })
            }
          >
            <Send size={16} /> {t('q.send')}
          </button>
        </footer>
      </div>
    </div>
  );
}
