import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface ComboOption {
  id: string;
  label: string;
  /** Texte secondaire (ville, pays…) */
  sub?: string;
  /** Mots supplémentaires pour la recherche */
  keywords?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Champ à saisie : on tape quelques lettres, puis on choisit dans la liste (clavier ou souris) */
export default function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder,
  empty = 'Aucun résultat',
}: {
  id?: string;
  value: string;
  options: ComboOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  empty?: string;
}) {
  const listId = useId();
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = norm(text ?? '');
  const matches = useMemo(() => (q ? options.filter((o) => norm(`${o.label} ${o.sub ?? ''} ${o.keywords ?? ''}`).includes(q)) : options), [q, options]);
  const pick = (o: ComboOption) => {
    onChange(o.id);
    setText(null);
    setOpen(false);
  };
  return (
    <div className="combo">
      <Search size={15} className="combo-ico" />
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={text ?? selected?.label ?? ''}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => {
          // laisse le temps au clic sur une option
          setTimeout(() => {
            setOpen(false);
            setText(null);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            if (open && matches[active]) {
              e.preventDefault();
              pick(matches[active]);
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setText(null);
          }
        }}
      />
      {open && (
        <ul className="combo-list card" id={listId} role="listbox">
          {matches.length === 0 && <li className="combo-empty">{empty}</li>}
          {matches.slice(0, 50).map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              className={`${i === active ? 'active' : ''} ${o.id === value ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <b>{o.label}</b>
              {o.sub && <small>{o.sub}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
