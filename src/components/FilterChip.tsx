import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface ChipOption {
  id: string;
  label: string;
  sub?: string;
}

/**
 * Filtre en cartouche : « Marque ▾ » ; une fois choisi, la cartouche se remplit (« DAILY ✕ »).
 * Clic : petite liste (avec recherche si elle est longue) ; ✕ ou « Tout » : retire le filtre.
 */
export default function FilterChip({
  label,
  value,
  options,
  onChange,
  allId = 'all',
  allLabel,
  clearable = true,
}: {
  label: string;
  value: string;
  options: ChipOption[];
  onChange: (v: string) => void;
  allId?: string;
  allLabel?: string;
  /** false : pas de ✕ (ex. tri) */
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const active = value !== allId;
  const current = options.find((o) => o.id === value);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const searchable = options.length > 8;
  const s = q.trim().toLowerCase();
  const list = s ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(s)) : options;
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  return (
    <span className={`fchip-wrap ${active && clearable ? 'on' : ''}`} ref={box}>
      <button type="button" className={`fchip ${active && clearable ? 'on' : ''} ${open ? 'open' : ''}`} aria-label={label} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}>
        <span className="fchip-txt">{active || !clearable ? (current?.label ?? label) : label}</span>
        {!(active && clearable) && <ChevronDown size={15} className="fchip-chev" />}
      </button>
      {active && clearable && (
        <button type="button" className="fchip-x fchip-x-in" aria-label={`Retirer le filtre ${label}`} onClick={() => pick(allId)}>
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="fchip-pop" role="listbox" aria-label={label}>
          {searchable && (
            <label className="fchip-search">
              <Search size={14} />
              <input autoFocus placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          <div className="fchip-list">
            {clearable && (
              <button type="button" role="option" aria-selected={!active} className={!active ? 'sel' : ''} onClick={() => pick(allId)}>
                <span>{allLabel ?? 'Tout'}</span>
                {!active && <Check size={15} />}
              </button>
            )}
            {list.map((o) => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === value} className={o.id === value ? 'sel' : ''} onClick={() => pick(o.id)}>
                <span>
                  {o.label}
                  {o.sub && <small>{o.sub}</small>}
                </span>
                {o.id === value && <Check size={15} />}
              </button>
            ))}
            {list.length === 0 && <div className="fchip-empty">Aucun résultat</div>}
          </div>
        </div>
      )}
    </span>
  );
}
