import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Check, FileText, Languages, Loader2, MessageCircle, Paperclip, Send } from 'lucide-react';
import { byId, currentUser, useAuth, useStore } from '../data/store';
import type { ChatMessage, Product } from '../data/types';
import { getBlob, newFileId, putBlob, saveBlob, supplierScope } from '../lib/files';
import { useBlobUrl } from '../lib/blobUrl';
import { chatSideOf } from '../lib/chat';
import { supplierLang } from '../lib/mail/outbox';
import { translateTexts, type ChatLang } from '../lib/translate';
import { useT } from '../i18n/context';
import { toast } from './ui-shared';

const MAX = 20 * 1024 * 1024;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function Attachment({ m }: { m: ChatMessage }) {
  const f = m.file!;
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

/** Discussion JONAS ↔ fournisseur sur un produit, comme une conversation WhatsApp */
export default function ProductChat({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const { t, lang: uiLang } = useT();
  const me = currentUser(state);
  const side = chatSideOf(me.role);
  const other = side === 'jonas' ? (byId(state.suppliers, p.supplierId)?.shortName ?? '') : t('chat.jonas');
  const [text, setText] = useState('');
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

  const send = async (attach?: File) => {
    if (!canWrite || busy) return;
    if (!text.trim() && !attach) return;
    if (attach && attach.size > MAX) return toast(t('chat.tooBig'));
    setBusy(true);
    try {
      let f: ChatMessage['file'];
      if (attach) {
        const fileId = newFileId(supplierScope(p.supplierId), `chat-${p.id}`, chat.length);
        await putBlob(fileId, attach);
        f = { fileId, name: attach.name, size: attach.size, type: attach.type || 'application/octet-stream' };
      }
      const at = new Date().toISOString();
      const id = `${at}-${Math.random().toString(36).slice(2, 7)}`;
      const msg = text.trim();
      dispatch({ type: 'sendProductMessage', productId: p.id, message: { id, at, by: me.name, side, text: msg, file: f } });
      setText('');
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
  const readByOther = (m: ChatMessage) => m.side === side && (p.chatRead?.[side === 'jonas' ? 'fournisseur' : 'jonas'] ?? '') >= m.at;

  return (
    <div className="ch">
      <div className="ch-head">
        <MessageCircle size={18} className="green" />
        <b>{t('chat.title', { who: other })}</b>
        <span className="muted small">
          · {p.ref} {p.name}
        </span>
      </div>
      <div className="ch-list" ref={list} role="log" aria-label={t('chat.title', { who: other })}>
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
                  {m.file && <Attachment m={m} />}
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
      {canWrite && (
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
            aria-label={t('chat.attach')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void send(f);
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" className="ch-send" disabled={busy || !text.trim()} aria-label={t('chat.send')}>
            {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </form>
      )}
      {canWrite && side === 'jonas' && sup && supplierLang(sup) !== 'fr' && (
        <div className="ch-hint">
          <Languages size={11} /> Écrivez en français ou en anglais : {sup.shortName} reçoit le message traduit en {supplierLang(sup) === 'zh' ? 'chinois' : 'anglais'}.
        </div>
      )}
    </div>
  );
}
