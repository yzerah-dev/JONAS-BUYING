import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Check, Download, FileText, Image as ImageIcon, Languages, Loader2, MessageCircle, Paperclip, Send, Upload, X } from 'lucide-react';
import { byId, currentUser, useAuth, useStore } from '../data/store';
import type { ChatMessage, Product } from '../data/types';
import { getBlob, newFileId, putBlob, saveBlob, supplierScope } from '../lib/files';
import { useBlobUrl } from '../lib/blobUrl';
import { chatSideOf, filesOf } from '../lib/chat';
import { fsize } from '../lib/files';
import { supplierLang } from '../lib/mail/outbox';
import { translateTexts, type ChatLang } from '../lib/translate';
import { useT } from '../i18n/context';
import { toast } from './ui-shared';

const MAX = 20 * 1024 * 1024;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

type ChatFile = NonNullable<ChatMessage['file']>;

function Attachment({ f }: { f: ChatFile }) {
  const isImg = /^image\//.test(f.type);
  const url = useBlobUrl(isImg ? f.fileId : undefined);
  const open = async () => {
    const b = await getBlob(f.fileId).catch(() => undefined);
    if (b) await saveBlob(b, f.name);
    else toast('Fichier introuvable');
  };
  if (isImg && url)
    return (
      <button type="button" className="ch-img" onClick={open} title={f.name}>
        <img src={url} alt={f.name} />
      </button>
    );
  return (
    <button type="button" className="ch-file" onClick={open}>
      <FileText size={16} /> {f.name}
    </button>
  );
}

/** Onglet « Pièces jointes » : un fichier échangé, avec qui l'a envoyé et quand */
function FileCard({ f, by, at }: { f: ChatFile; by: string; at: string }) {
  const isImg = /^image\//.test(f.type);
  const url = useBlobUrl(isImg ? f.fileId : undefined);
  const open = async () => {
    const b = await getBlob(f.fileId).catch(() => undefined);
    if (b) await saveBlob(b, f.name);
    else toast('Fichier introuvable');
  };
  return (
    <button type="button" className="ch-fcard" onClick={open} title={f.name}>
      <span className="ch-fthumb">{isImg && url ? <img src={url} alt={f.name} /> : <FileText size={28} />}</span>
      <b>{f.name}</b>
      <small>
        {by} · {hhmm(at)} · {fsize(f.size)}
      </small>
      <span className="ch-fdl">
        <Download size={13} />
      </span>
    </button>
  );
}

/** Discussion JONAS ↔ fournisseur sur un produit, comme une conversation WhatsApp */
export default function ProductChat({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const { t, lang: uiLang } = useT();
  const me = currentUser(state);
  const side = chatSideOf(me.role);
  const other = side === 'jonas' ? (byId(state.suppliers, p.supplierId)?.shortName ?? '') : t('chat.jonas');
  const [text, setText] = useState('');
  // Fichiers prêts à partir avec le prochain message (glisser-déposer, trombone, coller)
  const [pending, setPending] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [view, setView] = useState<'messages' | 'files'>('messages');
  const addFiles = (fs: File[]) => {
    const ok = fs.filter((f) => f.size <= MAX);
    if (ok.length < fs.length) toast(t('chat.tooBig'));
    if (ok.length) setPending((x) => [...x, ...ok].slice(0, 10));
  };
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const chat = p.chat ?? [];
  const canWrite = auth.allowed({ type: 'sendProductMessage', productId: p.id, message: { id: 'x', at: '', by: '', side, text: 'x' } });
  const last = chat[chat.length - 1];
  const sup = byId(state.suppliers, p.supplierId);
  // Langue de lecture : JONAS lit en français ; le fournisseur dans la langue de son portail
  const readLang: ChatLang = side === 'jonas' ? 'fr' : uiLang === 'zh' ? 'zh' : uiLang === 'fr' ? 'fr' : 'en';
  const [showOrig, setShowOrig] = useState<Set<string>>(new Set());
  const [busyTr, setBusyTr] = useState<string | null>(null);
  const translate = async (m: ChatMessage) => {
    setBusyTr(m.id);
    try {
      const r = await translateTexts([m.text], readLang);
      if (r === 'not_configured') return toast('Traduction pas encore activée : la clé Claude (ANTHROPIC_API_KEY) doit être ajoutée dans Vercel.');
      if (typeof r === 'string') return toast('Traduction impossible pour le moment.');
      dispatch({ type: 'translateChat', productId: p.id, items: [{ id: m.id, lang: readLang, text: r[0] }] });
    } finally {
      setBusyTr(null);
    }
  };

  // Ouvert = lu ; défilement vers le dernier message
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
    if (last && last.side !== side && (p.chatRead?.[side] ?? '') < last.at) dispatch({ type: 'readProductChat', productId: p.id, at: last.at });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id]);

  const send = async () => {
    if (!canWrite || busy) return;
    if (!text.trim() && !pending.length) return;
    setBusy(true);
    try {
      const files: ChatFile[] = [];
      for (const [i, f] of pending.entries()) {
        const fileId = newFileId(supplierScope(p.supplierId), `chat-${p.id}`, chat.length * 10 + i);
        await putBlob(fileId, f);
        files.push({ fileId, name: f.name || `capture-${i + 1}.png`, size: f.size, type: f.type || 'application/octet-stream' });
      }
      const at = new Date().toISOString();
      const id = `${at}-${Math.random().toString(36).slice(2, 7)}`;
      const msg = text.trim();
      dispatch({ type: 'sendProductMessage', productId: p.id, message: { id, at, by: me.name, side, text: msg, ...(files.length ? { files } : {}) } });
      setText('');
      setPending([]);
      // JONAS écrit en français ou en anglais : le message arrive traduit dans la langue du fournisseur
      const to = side === 'jonas' && sup ? supplierLang(sup) : null;
      if (msg && to && to !== 'fr') {
        void translateTexts([msg], to).then((r) => {
          if (Array.isArray(r) && r[0] && r[0].trim() !== msg) dispatch({ type: 'translateChat', productId: p.id, items: [{ id, lang: to, text: r[0] }] });
        });
      }
    } catch {
      toast('Envoi impossible : réessayez.');
    } finally {
      setBusy(false);
    }
  };
  const allFiles = chat.flatMap((m) => filesOf(m).map((f) => ({ f, m }))).reverse();
  const readByOther = (m: ChatMessage) => m.side === side && (p.chatRead?.[side === 'jonas' ? 'fournisseur' : 'jonas'] ?? '') >= m.at;

  return (
    <div className="ch">
      <div className="ch-head">
        <MessageCircle size={18} className="green" />
        <b>{t('chat.title', { who: other })}</b>
        <span className="muted small">
          · {p.ref} {p.name}
        </span>
        <span className="grow" />
        <span className="ch-tabs" role="group" aria-label="Vue">
          <button type="button" className={view === 'messages' ? 'on' : ''} aria-pressed={view === 'messages'} onClick={() => setView('messages')}>
            <MessageCircle size={14} /> {t('chat.messages')}
          </button>
          <button type="button" className={view === 'files' ? 'on' : ''} aria-pressed={view === 'files'} onClick={() => setView('files')}>
            <Paperclip size={14} /> {t('chat.files')} ({allFiles.length})
          </button>
        </span>
      </div>
      {view === 'files' && (
        <div className="ch-files">
          {!allFiles.length && <div className="ch-empty small muted">{t('chat.noFiles')}</div>}
          {allFiles.map(({ f, m }) => (
            <FileCard key={f.fileId} f={f} by={m.by} at={m.at} />
          ))}
        </div>
      )}
      <div
        className={`ch-list ${over ? 'drop' : ''}`}
        ref={list}
        role="log"
        aria-label={t('chat.title', { who: other })}
        hidden={view !== 'messages'}
        onDragOver={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          setOver(false);
          addFiles([...e.dataTransfer.files]);
        }}
      >
        {over && (
          <div className="ch-dropzone">
            <Upload size={26} /> {t('chat.drop')}
          </div>
        )}
        {!chat.length && <div className="ch-empty small muted">{t('chat.empty')}</div>}
        {chat.map((m, i) => {
          const mine = m.side === side;
          const day = m.at.slice(0, 10);
          const newDay = i === 0 || chat[i - 1].at.slice(0, 10) !== day;
          return (
            <div key={m.id} className="ch-row-wrap">
              {newDay && <div className="ch-day">{day.split('-').reverse().join('/')}</div>}
              <div className={`ch-row ${mine ? 'mine' : ''}`}>
                <div className={`ch-bubble ${mine ? 'mine' : ''}`}>
                  {!mine && <div className="ch-by">{m.by}</div>}
                  {filesOf(m).map((f) => (
                    <Attachment key={f.fileId} f={f} />
                  ))}
                  {m.text &&
                    (() => {
                      const tr = m.tr?.[readLang];
                      const orig = showOrig.has(m.id);
                      return (
                        <>
                          <div className="ch-text">{tr && !orig ? tr : m.text}</div>
                          {mine && m.side === 'jonas' && sup && m.tr?.[supplierLang(sup)] && (
                            <div className="ch-tr-sent">
                              <Languages size={12} /> {m.tr[supplierLang(sup)]}
                            </div>
                          )}
                          {!mine &&
                            (tr ? (
                              <button type="button" className="ch-tr-btn" onClick={() => setShowOrig((x) => (x.has(m.id) ? new Set([...x].filter((y) => y !== m.id)) : new Set([...x, m.id])))}>
                                <Languages size={12} /> {orig ? t('chat.showTr') : t('chat.showOrig')}
                              </button>
                            ) : (
                              <button type="button" className="ch-tr-btn" disabled={busyTr === m.id} onClick={() => translate(m)}>
                                {busyTr === m.id ? <Loader2 size={12} className="spin" /> : <Languages size={12} />} {t('chat.translate')}
                              </button>
                            ))}
                        </>
                      );
                    })()}
                  <div className="ch-meta">
                    {hhmm(m.at)}
                    {mine && (readByOther(m) ? <CheckCheck size={14} className="ch-read" aria-label={t('chat.read')} /> : <Check size={14} aria-label={t('chat.sent')} />)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {canWrite && view === 'messages' && pending.length > 0 && (
        <div className="ch-pending" aria-label={t('chat.pending')}>
          {pending.map((f, i) => (
            <span key={i} className="ch-chip">
              {/^image\//.test(f.type) ? <ImageIcon size={14} /> : <FileText size={14} />}
              <span>{f.name || 'capture.png'}</span>
              <small>{fsize(f.size)}</small>
              <button type="button" aria-label={`${t('chat.remove')} ${f.name}`} onClick={() => setPending((x) => x.filter((_, j) => j !== i))}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      {canWrite && view === 'messages' && (
        <form
          className="ch-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            ref={file}
            type="file"
            hidden
            multiple
            aria-label={t('chat.attach')}
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <button type="button" className="icon-btn" title={t('chat.attach')} aria-label={t('chat.attach')} onClick={() => file.current?.click()} disabled={busy}>
            <Paperclip size={19} />
          </button>
          <textarea
            rows={1}
            value={text}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              // Capture d'écran collée (Ctrl+V) : ajoutée en pièce jointe
              const imgs = [...e.clipboardData.files].filter((f) => /^image\//.test(f.type));
              if (imgs.length) {
                e.preventDefault();
                addFiles(imgs);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" className="ch-send" disabled={busy || (!text.trim() && !pending.length)} aria-label={t('chat.send')}>
            {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </form>
      )}
      {canWrite && view === 'messages' && side === 'jonas' && sup && supplierLang(sup) !== 'fr' && (
        <div className="ch-hint">
          <Languages size={11} /> Écrivez en français ou en anglais : {sup.shortName} reçoit le message traduit en {supplierLang(sup) === 'zh' ? 'chinois' : 'anglais'}.
        </div>
      )}
    </div>
  );
}
