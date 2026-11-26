import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, X } from 'lucide-react';
import { DEFAULT_TERMS, canAddSupplier, currentUser, newSupplierId, useStore } from '../data/store';
import type { Currency, Supplier } from '../data/types';
import { toast } from './ui-shared';

/** Pays proposés (drapeau repris dans les listes) ; « Autre » laisse saisir le pays */
const COUNTRIES: { name: string; flag: string }[] = [
  { name: 'Chine', flag: '🇨🇳' },
  { name: 'Inde', flag: '🇮🇳' },
  { name: 'Vietnam', flag: '🇻🇳' },
  { name: 'Bangladesh', flag: '🇧🇩' },
  { name: 'Pakistan', flag: '🇵🇰' },
  { name: 'Turquie', flag: '🇹🇷' },
  { name: 'Corée du Sud', flag: '🇰🇷' },
  { name: 'Taïwan', flag: '🇹🇼' },
  { name: 'Thaïlande', flag: '🇹🇭' },
  { name: 'Indonésie', flag: '🇮🇩' },
  { name: 'France', flag: '🇫🇷' },
  { name: 'Italie', flag: '🇮🇹' },
  { name: 'Espagne', flag: '🇪🇸' },
  { name: 'Portugal', flag: '🇵🇹' },
];
const COLORS = ['#0f766e', '#1d6fd8', '#e63946', '#7b2cbf', '#e9a800', '#1a9a3e', '#f72585', '#264de4', '#c1121f', '#0081a7'];

/** Bouton « Nouveau fournisseur » (équipe achats) : ouvre le formulaire, rend l'identifiant créé */
export function NewSupplierButton({ onCreated, className = 'btn primary', label = 'Nouveau fournisseur' }: { onCreated?: (id: string) => void; className?: string; label?: string }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  if (!canAddSupplier(currentUser(state))) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Plus size={16} /> {label}
      </button>
      {open && <NewSupplierDialog onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

/** Bouton « Modifier » de la fiche fournisseur : même formulaire, prérempli */
export function EditSupplierButton({ supplier }: { supplier: Supplier }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  if (!canAddSupplier(currentUser(state))) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Pencil size={16} /> Modifier
      </button>
      {open && <NewSupplierDialog edit={supplier} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewSupplierDialog({ onClose, onCreated, edit }: { onClose: () => void; onCreated?: (id: string) => void; edit?: Supplier }) {
  const { state, dispatch } = useStore();
  const known0 = !edit || COUNTRIES.some((x) => x.name === edit.country);
  const [name, setName] = useState(edit?.name ?? '');
  const [shortName, setShortName] = useState(edit?.shortName ?? '');
  const [country, setCountry] = useState(edit ? (known0 ? edit.country : 'autre') : 'Chine');
  const [otherCountry, setOtherCountry] = useState(edit && !known0 ? edit.country : '');
  const [city, setCity] = useState(edit?.city ?? '');
  const [port, setPort] = useState(edit?.port ?? '');
  const [contact, setContact] = useState({
    name: edit?.contact.name ?? '',
    role: edit?.contact.role ?? '',
    email: edit?.contact.email ?? '',
    phone: edit?.contact.phone ?? '',
    wechat: edit?.contact.wechat ?? '',
  });
  const [currency, setCurrency] = useState<Currency>(edit?.terms?.currency ?? 'USD');
  const [depositPct, setDepositPct] = useState(edit?.terms?.depositPct ?? DEFAULT_TERMS.depositPct);
  const [balanceDays, setBalanceDays] = useState(edit?.terms?.balanceDays ?? DEFAULT_TERMS.balanceDays);
  const dup = state.suppliers.find((s) => s.id !== edit?.id && name.trim() && s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const c = (k: keyof typeof contact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact({ ...contact, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // le formulaire peut être ouvert depuis « Nouvelle commande »
    if (!name.trim() || dup) return;
    const id = edit?.id ?? newSupplierId(state, shortName || name);
    const known = COUNTRIES.find((x) => x.name === country);
    const supplier: Supplier = {
      ...(edit ?? {}),
      id,
      name: name.trim(),
      shortName: shortName.trim() || name.trim(),
      country: country === 'autre' ? otherCountry.trim() || 'Autre' : country,
      flag: known?.flag ?? (edit && country === 'autre' ? edit.flag : '🏳️'),
      city: city.trim(),
      port: port.trim() || city.trim(),
      contact: { name: contact.name.trim(), role: contact.role.trim(), email: contact.email.trim(), phone: contact.phone.trim(), ...(contact.wechat.trim() ? { wechat: contact.wechat.trim() } : {}) },
      color: edit?.color ?? COLORS[state.suppliers.length % COLORS.length],
      active: edit?.active ?? true,
      terms: { currency, depositPct, balanceDays },
    };
    dispatch(edit ? { type: 'updateSupplier', supplier } : { type: 'addSupplier', supplier });
    toast(edit ? `Fournisseur modifié : ${supplier.name}` : `Fournisseur créé : ${supplier.name}`);
    onClose();
    onCreated?.(id);
  };

  return createPortal(
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label={edit ? `Modifier ${edit.name}` : 'Nouveau fournisseur'} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{edit ? `Modifier ${edit.name}` : 'Nouveau fournisseur'}</h2>
            <span className="muted small">{edit ? 'Les conditions s’appliquent aux prochaines proformas.' : 'Il apparaît tout de suite dans Fournisseurs et dans Nouvelle commande.'}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          <label htmlFor="ns-name" className="bk-wide">
            Raison sociale *
            <input id="ns-name" className="input" required autoFocus value={name} placeholder="Ex. NINGBO HOME SOURCING CO., LTD" onChange={(e) => setName(e.target.value)} />
            {dup && <span className="small red">Ce fournisseur existe déjà.</span>}
          </label>
          <label htmlFor="ns-short">
            Nom court
            <input id="ns-short" className="input" value={shortName} placeholder="Ex. Ningbo Home" onChange={(e) => setShortName(e.target.value)} />
          </label>
          <label htmlFor="ns-country">
            Pays
            <select id="ns-country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.flag} {x.name}
                </option>
              ))}
              <option value="autre">Autre…</option>
            </select>
          </label>
          {country === 'autre' && (
            <label htmlFor="ns-country2">
              Nom du pays
              <input id="ns-country2" className="input" value={otherCountry} onChange={(e) => setOtherCountry(e.target.value)} />
            </label>
          )}
          <label htmlFor="ns-city">
            Ville
            <input id="ns-city" className="input" value={city} placeholder="Ex. Ningbo" onChange={(e) => setCity(e.target.value)} />
          </label>
          <label htmlFor="ns-port">
            Port de départ
            <input id="ns-port" className="input" value={port} placeholder="Ex. Ningbo" onChange={(e) => setPort(e.target.value)} />
          </label>

          <h3 className="pb-sec bk-wide">Contact</h3>
          <label htmlFor="ns-cname">
            Nom
            <input id="ns-cname" className="input" value={contact.name} placeholder="Ex. PEARL" onChange={c('name')} />
          </label>
          <label htmlFor="ns-crole">
            Fonction
            <input id="ns-crole" className="input" value={contact.role} placeholder="Ex. Sales manager" onChange={c('role')} />
          </label>
          <label htmlFor="ns-cmail">
            E-mail
            <input id="ns-cmail" className="input" type="email" value={contact.email} onChange={c('email')} />
          </label>
          <label htmlFor="ns-cphone">
            Téléphone
            <input id="ns-cphone" className="input" value={contact.phone} onChange={c('phone')} />
          </label>
          <label htmlFor="ns-cwechat">
            WeChat
            <input id="ns-cwechat" className="input" value={contact.wechat} onChange={c('wechat')} />
          </label>

          <h3 className="pb-sec bk-wide">Conditions (reprises par chaque nouvelle proforma)</h3>
          <label htmlFor="ns-cur">
            Devise
            <select id="ns-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="CNY">CNY</option>
            </select>
          </label>
          <label htmlFor="ns-dep">
            Acompte (%)
            <input id="ns-dep" className="input" type="number" min={0} max={100} value={depositPct} onChange={(e) => setDepositPct(Number(e.target.value))} />
          </label>
          <label htmlFor="ns-bal">
            Solde à J+ (jours après départ)
            <input id="ns-bal" className="input" type="number" min={0} value={balanceDays} onChange={(e) => setBalanceDays(Number(e.target.value))} />
          </label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, padding: '12px 16px 16px' }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim() || !!dup}>
            {edit ? <Pencil size={16} /> : <Plus size={16} />} {edit ? 'Enregistrer' : 'Créer le fournisseur'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
