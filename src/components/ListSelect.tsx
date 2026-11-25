import { useState } from 'react';

const NEW = '__nouvelle-valeur__';

/**
 * Liste déroulante d'une fiche : valeurs proposées, plus « Autre… » pour en saisir une nouvelle
 * (elle rejoint la liste à l'enregistrement).
 */
export default function ListSelect({ id, value, options, onChange, allowNew = true, empty }: { id: string; value: string; options: string[]; onChange: (v: string) => void; allowNew?: boolean; empty?: string }) {
  const known = options.some((o) => o === value) || (!value && empty !== undefined);
  const [custom, setCustom] = useState(!known && !!value);
  if (custom)
    return (
      <span className="row" style={{ gap: 4 }}>
        <input id={id} className="input" autoFocus value={value} placeholder="Nouvelle valeur" onChange={(e) => onChange(e.target.value)} />
        <button
          type="button"
          className="btn sm ghost"
          title="Revenir à la liste"
          onClick={() => {
            setCustom(false);
            onChange(options[0] ?? '');
          }}
        >
          ↩
        </button>
      </span>
    );
  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setCustom(true);
          onChange('');
        } else onChange(e.target.value);
      }}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {allowNew && <option value={NEW}>➕ Autre… (nouvelle valeur)</option>}
    </select>
  );
}
