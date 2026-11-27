import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Eye, Loader2, Mail, Paperclip, X } from 'lucide-react';
import { dismissMail, subscribeOutbox, type PreparedMail } from '../lib/mail/outbox';
import { fsize, saveBlob } from '../lib/files';

const STATUS: Record<PreparedMail['status'], string> = {
  sending: 'Envoi de l’e-mail…',
  sent: 'E-mail envoyé',
  demo: 'E-mail préparé (démo : non envoyé)',
  failed: 'E-mail non envoyé',
  no_contact: 'Pas d’adresse e-mail',
};

/** E-mails automatiques aux fournisseurs : état de l'envoi en bas de l'écran, aperçu de l'e-mail */
export default function MailOutbox() {
  const [list, setList] = useState<PreparedMail[]>([]);
  const [view, setView] = useState<PreparedMail | null>(null);
  useEffect(
    () =>
      subscribeOutbox((l) => {
        setList(l);
      }),
    [],
  );
  // Les cartes envoyées / démo disparaissent seules au bout de 12 s
  useEffect(() => {
    const done = list.filter((m) => m.status === 'sent' || m.status === 'demo');
    if (!done.length) return;
    const t = setTimeout(() => done.forEach((m) => dismissMail(m.id)), 12_000);
    return () => clearTimeout(t);
  }, [list]);
  return (
    <>
      {list.length > 0 && (
        <div className="mo-stack" aria-live="polite">
          {list.map((m) => (
            <div key={m.id} className={`mo-card ${m.status}`} role="status">
              <span className="mo-ico">
                {m.status === 'sending' ? (
                  <Loader2 size={18} className="spin" />
                ) : m.status === 'sent' || m.status === 'demo' ? (
                  <CheckCircle2 size={18} />
                ) : m.status === 'failed' ? (
                  <AlertTriangle size={18} />
                ) : (
                  <Mail size={18} />
                )}
              </span>
              <span className="mo-txt">
                <b>{STATUS[m.status]}</b>
                <small>
                  {m.status === 'no_contact' ? (
                    <>
                      {m.supplier.shortName} n’a aucun contact avec e-mail.{' '}
                      <Link to={`/fournisseurs/${m.supplier.id}`} onClick={() => dismissMail(m.id)}>
                        Ajouter un contact
                      </Link>
                    </>
                  ) : (
                    <>
                      {m.supplier.shortName} · {m.to.map((t) => t.email).join(', ')}
                      {m.error ? ` · ${m.error}` : ''}
                    </>
                  )}
                </small>
              </span>
              {m.status !== 'no_contact' && (
                <button type="button" className="btn sm" onClick={() => setView(m)} aria-label={`Voir l’e-mail : ${m.subject}`}>
                  <Eye size={14} /> Voir
                </button>
              )}
              <button type="button" className="icon-btn" onClick={() => dismissMail(m.id)} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {view &&
        createPortal(
          <div className="palette-back" onMouseDown={() => setView(null)}>
            <div className="card rc-dialog mo-dialog" role="dialog" aria-label="Aperçu de l’e-mail" onMouseDown={(e) => e.stopPropagation()}>
              <header className="rc-head">
                <div style={{ minWidth: 0 }}>
                  <h2>{view.subject}</h2>
                  <span className="muted small">
                    À : {view.to.map((t) => `${t.name ? `${t.name} ` : ''}<${t.email}>`).join(', ')} · {STATUS[view.status]}
                  </span>
                </div>
                <button type="button" className="icon-btn" onClick={() => setView(null)} aria-label="Fermer">
                  <X size={20} />
                </button>
              </header>
              {view.attachments.length > 0 && (
                <div className="mo-att">
                  {view.attachments.map((a) => (
                    <button key={a.filename} type="button" className="mo-file" onClick={() => saveBlob(a.blob, a.filename)}>
                      <Paperclip size={14} /> {a.filename} <small>{fsize(a.blob.size)}</small>
                    </button>
                  ))}
                </div>
              )}
              <iframe className="mo-frame" title="Contenu de l’e-mail" srcDoc={view.html} sandbox="allow-popups allow-popups-to-escape-sandbox" />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
