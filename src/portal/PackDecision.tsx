import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { packDone } from '../data/store';
import type { Product } from '../data/types';
import { toast } from '../components/ui-shared';
import { useT } from '../i18n';
import { awaitsSupplier, usePortal } from './usePortal';

/** Valider le pack, ou le refuser en écrivant la modification demandée (obligatoire) */
export default function PackDecision({ product: p }: { product: Product }) {
  const { dispatch } = usePortal();
  const { t } = useT();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  if (!awaitsSupplier(p)) return null;
  if (refusing) {
    const id = `rej-${p.id.replace(/\W/g, '')}`;
    return (
      <form
        className="pk-refuse"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          dispatch({ type: 'rejectPack', productId: p.id, reason: reason.trim() });
          toast(t('packs.rejectToast'));
          setRefusing(false);
          setReason('');
        }}
      >
        <label htmlFor={id} className="small bold">
          {t('packs.rejectReason')}
        </label>
        <textarea id={id} className="input" rows={3} required autoFocus value={reason} placeholder={t('packs.rejectPh')} onChange={(e) => setReason(e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn sm ghost" onClick={() => setRefusing(false)}>
            {t('packs.cancel')}
          </button>
          <button type="submit" className="btn sm danger" disabled={!reason.trim()}>
            <X size={13} /> {t('packs.rejectSend')}
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn sm danger" onClick={() => setRefusing(true)}>
        <X size={13} /> {t('packs.reject')}
      </button>
      <button
        className="btn sm primary"
        onClick={() => {
          dispatch({ type: 'validatePack', productId: p.id });
          toast(t('packs.validateToast'));
        }}
      >
        <Check size={13} /> {t('packs.validate')}
      </button>
    </div>
  );
}

/** Dernier refus du pack (motif écrit), s'il y en a un */
export function LastPackRejection({ product: p }: { product: Product }) {
  const { t } = useT();
  const r = p.pack.rejection;
  if (!r || packDone(p)) return null;
  return <div className="pk-lastrej small">{t('packs.lastReject', { by: r.step || r.by, reason: r.reason })}</div>;
}
