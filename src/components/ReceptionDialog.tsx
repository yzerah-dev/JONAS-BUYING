import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { byId, useStore } from '../data/store';
import type { Container, ReceptionLine } from '../data/types';
import { num } from '../lib/format';
import { ProductThumb } from './ui';
import { toast } from './ui-shared';

/** Contrôle de réception : quantités reçues ligne à ligne, écarts, réserves */
export default function ReceptionDialog({ c, onClose }: { c: Container; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [lines, setLines] = useState<ReceptionLine[]>(() =>
    c.allocations.map((a) => ({ proformaId: a.proformaId, productId: a.productId, expected: a.qty, received: a.qty })),
  );
  const [note, setNote] = useState('');
  const gaps = lines.filter((l) => l.received !== l.expected);
  const exp = lines.reduce((s, l) => s + l.expected, 0);
  const rec = lines.reduce((s, l) => s + l.received, 0);

  const confirm = () => {
    dispatch({ type: 'receive', containerId: c.id, lines, note: note.trim() || undefined });
    toast(gaps.length ? `Réception enregistrée avec ${gaps.length} écart(s)` : 'Réception conforme enregistrée');
    onClose();
  };

  return (
    <div className="palette-back" onMouseDown={onClose}>
      <div className="card rc-dialog" role="dialog" aria-label="Contrôle de réception" onMouseDown={(e) => e.stopPropagation()}>
        <header className="rc-head">
          <div>
            <h2>Contrôle de réception</h2>
            <span className="muted small">
              {c.number ?? c.id} · entrepôt {c.warehouse}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="rc-body">
          <div className="rc-line rc-th">
            <span>Référence</span>
            <span>Attendu</span>
            <span>Reçu</span>
            <span>Écart</span>
          </div>
          {lines.map((l, i) => {
            const p = byId(state.products, l.productId);
            const gap = l.received - l.expected;
            return (
              <div key={l.proformaId + l.productId} className={`rc-line ${gap ? 'gap' : ''}`}>
                <span className="rc-ref">
                  <ProductThumb product={p} size={30} />
                  <span>
                    <b>{p.ref}</b>
                    <small>
                      {p.name} · {l.proformaId}
                    </small>
                  </span>
                </span>
                <span className="num">{num(l.expected)}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  aria-label={`Quantité reçue ${p.ref}`}
                  value={l.received}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, received: Math.max(0, Math.round(+e.target.value || 0)) } : x)))}
                />
                <span className={`num ${gap < 0 ? 'red' : gap > 0 ? 'orange' : 'green'}`}>{gap === 0 ? '✓' : `${gap > 0 ? '+' : ''}${num(gap)}`}</span>
              </div>
            );
          })}
          <label className="rc-note" htmlFor="rc-note">
            Réserves / commentaire
            <textarea id="rc-note" className="input" rows={2} placeholder="Ex. 3 cartons écrasés, palette 4 filmée ouverte…" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <footer className="rc-foot">
          <span className={gaps.length ? 'orange' : 'green'}>
            {gaps.length ? <AlertTriangle size={16} /> : <Check size={16} />} {num(rec)} / {num(exp)} pcs · {gaps.length ? `${gaps.length} écart(s)` : 'conforme'}
          </span>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={confirm}>
            <Check size={16} /> Valider la réception
          </button>
        </footer>
      </div>
    </div>
  );
}
