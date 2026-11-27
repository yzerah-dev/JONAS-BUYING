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
  // Contacts (le premier est le contact principal) : chacun peut recevoir les e-mails automatiques
  type C = { name: string; role: string; email: string; phone: string; wechat: string; mail: boolean };
  const blank = (): C => ({ name: '', role: '', email: '', phone: '', wechat: '', mail: true });
  const [contacts, setContacts] = useState<C[]>(() => {
    const src = edit?.contacts?.length ? edit.contacts : edit ? [edit.contact] : [];
    const list = src.map((c) => ({ name: c.name ?? '', role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '', wechat: c.wechat ?? '', mail: c.mail !== false }));
    return list.length ? list : [blank()];
  });
  const [lang, setLang] = useState<'auto' | 'zh' | 'fr' | 'en'>(edit?.lang ?? 'auto');
  const [currency, setCurrency] = useState<Currency>(edit?.terms?.currency ?? 'USD');
  const [depositPct, setDepositPct] = useState(edit?.terms?.depositPct ?? DEFAULT_TERMS.depositPct);
  const [balanceDays, setBalanceDays] = useState(edit?.terms?.balanceDays ?? DEFAULT_TERMS.balanceDays);
  const dup = state.suppliers.find((s) => s.id !== edit?.id && name.trim() && s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const setC = (i: number, patch: Partial<C>) => setContacts(contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const badMail = contacts.some((x) => x.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email.trim()));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // le formulaire peut être ouvert depuis « Nouvelle commande »
    if (!name.trim() || dup || badMail) return;
    const id = edit?.id ?? newSupplierId(state, shortName || name);
    const known = COUNTRIES.find((x) => x.name === country);
    const cleanContacts = contacts
      .map((x) => ({
        name: x.name.trim(),
        role: x.role.trim(),
        email: x.email.trim(),
        phone: x.phone.trim(),
        ...(x.wechat.trim() ? { wechat: x.wechat.trim() } : {}),
        ...(x.mail ? {} : { mail: false }),
      }))
      .filter((x) => x.name || x.email || x.phone);
    const supplier: Supplier = {
      ...(edit ?? {}),
      id,
      name: name.trim(),
      shortName: shortName.trim() || name.trim(),
      country: country === 'autre' ? otherCountry.trim() || 'Autre' : country,
      flag: known?.flag ?? (edit && country === 'autre' ? edit.flag : '🏳️'),
      city: city.trim(),
      port: port.trim() || city.trim(),
      contact: cleanContacts[0] ?? { name: '', role: '', email: '', phone: '' },
      contacts: cleanContacts,
      lang: lang === 'auto' ? undefined : lang,
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

          <h3 className="pb-sec bk-wide">Contacts · e-mails automatiques</h3>
          <p className="small muted bk-wide" style={{ margin: 0 }}>
            Les contacts cochés reçoivent les e-mails de JONAS BUYING (commande, proforma signée, die cut, acompte, pack validé) avec les pièces jointes.
          </p>
          {contacts.map((x, i) => (
            <div key={i} className="ns-contact bk-wide" role="group" aria-label={`Contact ${i + 1}`}>
              <div className="ns-contact-grid">
                <input className="input" aria-label={`Nom du contact ${i + 1}`} placeholder="Nom (ex. PEARL)" value={x.name} onChange={(e) => setC(i, { name: e.target.value })} />
                <input className="input" aria-label={`Fonction du contact ${i + 1}`} placeholder="Fonction" value={x.role} onChange={(e) => setC(i, { role: e.target.value })} />
                <input
                  className={`input ${x.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email.trim()) ? 'bad' : ''}`}
                  type="email"
                  aria-label={`E-mail du contact ${i + 1}`}
                  placeholder="E-mail"
                  value={x.email}
                  onChange={(e) => setC(i, { email: e.target.value })}
                />
                <input className="input" aria-label={`Téléphone du contact ${i + 1}`} placeholder="Téléphone" value={x.phone} onChange={(e) => setC(i, { phone: e.target.value })} />
                <input className="input" aria-label={`WeChat du contact ${i + 1}`} placeholder="WeChat" value={x.wechat} onChange={(e) => setC(i, { wechat: e.target.value })} />
              </div>
              <div className="ns-contact-foot">
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={x.mail} onChange={(e) => setC(i, { mail: e.target.checked })} /> Reçoit les e-mails
                </label>
                {i === 0 && <span className="pill green">Contact principal</span>}
                <span className="grow" />
                {contacts.length > 1 && (
                  <button type="button" className="btn sm ghost" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} aria-label={`Retirer le contact ${i + 1}`}>
                    <X size={14} /> Retirer
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" className="btn sm bk-wide" style={{ justifySelf: 'start' }} onClick={() => setContacts([...contacts, blank()])}>
            <Plus size={14} /> Ajouter un contact
          </button>
          <label htmlFor="ns-lang">
            Langue des e-mails (+ anglais)
            <select id="ns-lang" className="input" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
              <option value="auto">Automatique (d’après le pays)</option>
              <option value="zh">中文 Chinois + anglais</option>
              <option value="fr">Français + anglais</option>
              <option value="en">Anglais seul</option>
            </select>
          </label>
          {badMail && <span className="small red bk-wide">Une adresse e-mail n’est pas valide.</span>}

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
          <button type="submit" className="btn primary" disabled={!name.trim() || !!dup || badMail}>
            {edit ? <Pencil size={16} /> : <Plus size={16} />} {edit ? 'Enregistrer' : 'Créer le fournisseur'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
