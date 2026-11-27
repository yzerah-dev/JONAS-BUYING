import { useState } from 'react';
import { Mail, MailX, MessageCircle, Pencil, Phone, Plus, Star, Trash2, User, X } from 'lucide-react';
import { canAddSupplier, currentUser, useStore } from '../data/store';
import type { Contact, Supplier } from '../data/types';
import { mailRecipients, supplierLang } from '../lib/mail/outbox';
import { toast } from './ui-shared';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LANG_LABEL = { zh: 'chinois + anglais', fr: 'français + anglais', en: 'anglais' } as const;
const empty = (): Contact => ({ name: '', role: '', email: '', phone: '', wechat: '' });

/** Onglet « Contacts » de la fiche fournisseur : cartes, ajout, modification, contact principal, e-mails automatiques */
export default function SupplierContacts({ supplier }: { supplier: Supplier }) {
  const { state, dispatch } = useStore();
  const canEdit = canAddSupplier(currentUser(state));
  const list: Contact[] = supplier.contacts?.length ? supplier.contacts : supplier.contact && (supplier.contact.name || supplier.contact.email || supplier.contact.phone) ? [supplier.contact] : [];
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const save = (next: Contact[], msg: string) => {
    dispatch({ type: 'updateSupplier', supplier: { ...supplier, contacts: next, contact: next[0] ?? { name: '', role: '', email: '', phone: '' } } });
    toast(msg);
  };
  const recipients = mailRecipients(supplier);

  return (
    <div className="sc-wrap">
      <div className="sc-head">
        <div>
          <b>
            {list.length} contact{list.length > 1 ? 's' : ''}
          </b>
          <span className="small muted">
            {' '}
            · e-mails automatiques en {LANG_LABEL[supplierLang(supplier)]} · {recipients.length ? `${recipients.length} destinataire${recipients.length > 1 ? 's' : ''}` : 'aucun destinataire'}
          </span>
        </div>
        <div className="grow" />
        {canEdit && editing !== 'new' && (
          <button type="button" className="btn primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> Ajouter un contact
          </button>
        )}
      </div>
      {!recipients.length && <div className="sc-warn small">Aucun contact avec e-mail : les e-mails automatiques (commande, proforma signée, die cut, acompte, pack) ne partent pas.</div>}

      <div className="sc-grid">
        {editing === 'new' && (
          <ContactForm
            initial={empty()}
            onCancel={() => setEditing(null)}
            onSave={(c) => {
              save([...list, c], `Contact ajouté : ${c.name || c.email}`);
              setEditing(null);
            }}
          />
        )}
        {list.map((c, i) =>
          editing === i ? (
            <ContactForm
              key={i}
              initial={c}
              onCancel={() => setEditing(null)}
              onSave={(n) => {
                save(
                  list.map((x, j) => (j === i ? n : x)),
                  `Contact modifié : ${n.name || n.email}`,
                );
                setEditing(null);
              }}
            />
          ) : (
            <div key={i} className={`sc-card ${i === 0 ? 'main' : ''}`}>
              <div className="sc-top">
                <span className="sc-avatar">{(c.name || c.email || '?').slice(0, 1).toUpperCase()}</span>
                <div className="sc-id">
                  <b>{c.name || 'Sans nom'}</b>
                  <small>{c.role || '—'}</small>
                </div>
                {i === 0 && (
                  <span className="pill green" title="Contact principal">
                    <Star size={11} /> Principal
                  </span>
                )}
              </div>
              <div className="sc-lines">
                {c.email ? (
                  <a href={`mailto:${c.email}`}>
                    <Mail size={14} /> {c.email}
                  </a>
                ) : (
                  <span className="muted">
                    <Mail size={14} /> Pas d’e-mail
                  </span>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/\s/g, '')}`}>
                    <Phone size={14} /> {c.phone}
                  </a>
                )}
                {c.wechat && (
                  <span>
                    <MessageCircle size={14} className="green" /> {c.wechat}
                  </span>
                )}
              </div>
              <div className="sc-foot">
                {c.email && EMAIL.test(c.email) ? (
                  canEdit ? (
                    <label className="sc-mail">
                      <input
                        type="checkbox"
                        checked={c.mail !== false}
                        onChange={(e) =>
                          save(
                            list.map((x, j) => (j === i ? { ...x, mail: e.target.checked } : x)),
                            e.target.checked ? `${c.name || c.email} reçoit les e-mails` : `${c.name || c.email} ne reçoit plus les e-mails`,
                          )
                        }
                      />{' '}
                      Reçoit les e-mails
                    </label>
                  ) : (
                    <span className="small">{c.mail !== false ? 'Reçoit les e-mails' : 'Ne reçoit pas les e-mails'}</span>
                  )
                ) : (
                  <span className="small muted">
                    <MailX size={13} /> Pas d’e-mail automatique
                  </span>
                )}
                <span className="grow" />
                {canEdit && (
                  <>
                    {i > 0 && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Mettre en contact principal"
                        aria-label={`Contact principal : ${c.name}`}
                        onClick={() => save([c, ...list.filter((_, j) => j !== i)], `${c.name || c.email} : contact principal`)}
                      >
                        <Star size={15} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" title="Modifier" aria-label={`Modifier ${c.name || c.email}`} onClick={() => setEditing(i)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Retirer"
                      aria-label={`Retirer ${c.name || c.email}`}
                      onClick={() => {
                        if (window.confirm(`Retirer le contact ${c.name || c.email} ?`))
                          save(
                            list.filter((_, j) => j !== i),
                            `Contact retiré : ${c.name || c.email}`,
                          );
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ),
        )}
        {!list.length && editing !== 'new' && <div className="card empty">Aucun contact pour ce fournisseur.</div>}
      </div>
    </div>
  );
}

function ContactForm({ initial, onSave, onCancel }: { initial: Contact; onSave: (c: Contact) => void; onCancel: () => void }) {
  const [c, setC] = useState<Contact>({ ...initial, wechat: initial.wechat ?? '' });
  const bad = !!c.email.trim() && !EMAIL.test(c.email.trim());
  const ok = (c.name.trim() || c.email.trim()) && !bad;
  const f = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  return (
    <form
      className="sc-card sc-form"
      aria-label="Contact fournisseur"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSave({
          name: c.name.trim(),
          role: c.role.trim(),
          email: c.email.trim(),
          phone: c.phone.trim(),
          ...(c.wechat?.trim() ? { wechat: c.wechat.trim() } : {}),
          ...(c.mail === false ? { mail: false } : {}),
        });
      }}
    >
      <div className="sc-top">
        <span className="sc-avatar">
          <User size={16} />
        </span>
        <b>{initial.name || initial.email ? 'Modifier le contact' : 'Nouveau contact'}</b>
        <span className="grow" />
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Annuler">
          <X size={16} />
        </button>
      </div>
      <input className="input" autoFocus aria-label="Nom" placeholder="Nom (ex. PEARL)" value={c.name} onChange={f('name')} />
      <input className="input" aria-label="Fonction" placeholder="Fonction (ex. Sales manager)" value={c.role} onChange={f('role')} />
      <input className={`input ${bad ? 'bad' : ''}`} type="email" aria-label="E-mail" placeholder="E-mail" value={c.email} onChange={f('email')} />
      <input className="input" aria-label="Téléphone" placeholder="Téléphone" value={c.phone} onChange={f('phone')} />
      <input className="input" aria-label="WeChat" placeholder="WeChat" value={c.wechat ?? ''} onChange={f('wechat')} />
      <label className="sc-mail">
        <input type="checkbox" checked={c.mail !== false} onChange={(e) => setC({ ...c, mail: e.target.checked })} /> Reçoit les e-mails automatiques
      </label>
      {bad && <span className="small red">Adresse e-mail non valide.</span>}
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn primary" disabled={!ok}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
