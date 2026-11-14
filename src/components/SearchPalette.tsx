import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Container as Ctn, FileText, Search, Truck } from 'lucide-react';
import { currentUser, useStore } from '../data/store';
import { canSee, type Module } from '../data/permissions';

interface Hit {
  label: string;
  sub: string;
  to: string;
  module: Module;
  icon: typeof Search;
}

/** Recherche globale : Ctrl/Cmd + K, ou le bouton « Rechercher » du menu */
export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const user = currentUser(state);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: Hit[] = [];
    for (const p of state.proformas)
      if (`${p.id} ${p.poNumber} ${p.title ?? ''}`.toLowerCase().includes(s)) out.push({ label: p.id, sub: `Proforma · ${p.title ?? p.poNumber}`, to: `/proformas/${p.id}`, module: 'proformas', icon: FileText });
    for (const p of state.products)
      if (`${p.ref} ${p.name} ${p.ean}`.toLowerCase().includes(s)) out.push({ label: `${p.ref} – ${p.name}`, sub: `Produit · ${p.pack.designer}`, to: `/produits/${p.id}`, module: 'produits', icon: Boxes });
    for (const sup of state.suppliers)
      if (`${sup.name} ${sup.city}`.toLowerCase().includes(s)) out.push({ label: sup.name, sub: `Fournisseur · ${sup.city}`, to: `/fournisseurs/${sup.id}`, module: 'fournisseurs', icon: Truck });
    for (const c of state.containers)
      if (`${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''}`.toLowerCase().includes(s))
        out.push({ label: c.number ?? c.id, sub: `Conteneur · ${c.bookingNo ?? c.id}`, to: `/conteneurs?c=${c.id}`, module: 'conteneurs', icon: Ctn });
    return out.filter((h) => canSee(user, h.module)).slice(0, 12);
  }, [q, state, user]);

  const go = (h: Hit) => {
    onClose();
    navigate(h.to);
  };
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <div className="card palette" role="dialog" aria-label="Recherche" onMouseDown={(e) => e.stopPropagation()}>
        <label className="palette-input">
          <Search size={20} />
          <input
            autoFocus
            id="global-search"
            placeholder="Proforma, référence, EAN, fournisseur, conteneur…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx(Math.min(idx + 1, hits.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx(Math.max(idx - 1, 0));
              }
              if (e.key === 'Enter' && hits[idx]) go(hits[idx]);
            }}
          />
          <kbd>Échap</kbd>
        </label>
        <div className="palette-list">
          {q.trim().length < 2 && <div className="empty small">Tapez au moins 2 caractères.</div>}
          {q.trim().length >= 2 && hits.length === 0 && <div className="empty small">Aucun résultat.</div>}
          {hits.map((h, i) => (
            <button key={h.to + h.label} className={`palette-row ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => go(h)}>
              <h.icon size={17} />
              <span className="grow">
                <b>{h.label}</b>
                <small>{h.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
