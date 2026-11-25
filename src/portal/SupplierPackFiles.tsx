import { useRef, useState } from 'react';
import { Download, FolderOpen, Trash2, Upload, X } from 'lucide-react';
import { canPackFiles, currentUser, packFileLocked, useStore } from '../data/store';
import type { PackFile, PackFileKind, Product } from '../data/types';
import { deleteBlob, fromInput, fsize, getBlob, newFileId, putBlob, saveBlob, supplierScope } from '../lib/files';
import { toast } from '../components/ui-shared';
import { useT } from '../i18n';

/** Types de fiches qualité : valeur enregistrée (française, lue par JONAS) et libellé traduit */
const QUALITY: { value: string; key: 'pd.q.msds' | 'pd.q.compo' | 'pd.q.cert' | 'pd.q.test' | 'pd.q.tech' | 'pd.q.other' }[] = [
  { value: 'MSDS (fiche de sécurité)', key: 'pd.q.msds' },
  { value: 'Fiche composition', key: 'pd.q.compo' },
  { value: 'Certificat de conformité', key: 'pd.q.cert' },
  { value: 'Rapport de test', key: 'pd.q.test' },
  { value: 'Fiche technique', key: 'pd.q.tech' },
  { value: 'Autre', key: 'pd.q.other' },
];

/**
 * Portail fournisseur : fichiers du pack d'un produit (traduits FR / EN / 中文).
 * Le fournisseur dépose le die cut, l'ancien pack et les fiches qualité, et télécharge le pack JONAS.
 */
export default function SupplierPackFiles({ product: p, label }: { product: Product; label?: string }) {
  const { state, dispatch } = useStore();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState(QUALITY[0].value);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<Partial<Record<PackFileKind, HTMLInputElement | null>>>({});
  const me = currentUser(state);
  const files = p.pack.files ?? [];
  const of = (k: PackFileKind) => files.filter((f) => f.kind === k);
  const pack = of('pack').sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const qLabel = (v?: string) => t(QUALITY.find((q) => q.value === v)?.key ?? 'pd.q.other');

  const upload = async (kind: PackFileKind, list: FileList | null) => {
    const picked = fromInput(list);
    if (!picked.length) return;
    setBusy(true);
    try {
      const metas = [];
      for (const [i, { file, path }] of picked.entries()) {
        const id = newFileId(supplierScope(p.supplierId), `${p.id}-${kind}`, i);
        await putBlob(id, file);
        metas.push({ id, name: file.name, path, size: file.size, type: file.type, ...(kind === 'quality' ? { docType } : {}) });
      }
      dispatch({ type: 'addPackFiles', productId: p.id, kind, files: metas });
      toast(t('pd.added', { n: metas.length }));
    } finally {
      setBusy(false);
    }
  };
  const download = async (f: PackFile) => {
    const b = await getBlob(f.id);
    if (b) await saveBlob(b, f.name);
  };
  const line = (f: PackFile) => (
    <div key={f.id} className="pf-file">
      <span className="pf-file-name">
        <b>{f.name}</b>
        <small>
          {f.docType ? `${qLabel(f.docType)} · ` : ''}
          {fsize(f.size)}
        </small>
      </span>
      <button className="icon-btn" title={t('pd.button')} aria-label={`${f.name}`} onClick={() => download(f)}>
        <Download size={16} />
      </button>
      {canPackFiles(state, me, p.id, f.kind) && !packFileLocked(p, f.kind) && (
        <button
          className="icon-btn danger-ico"
          aria-label={`× ${f.name}`}
          onClick={async () => {
            dispatch({ type: 'removePackFile', productId: p.id, fileId: f.id });
            await deleteBlob(f.id).catch(() => undefined);
          }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
  const section = (kind: PackFileKind, title: string, hint: string, extra?: React.ReactNode) => (
    <section className="pf-drop ps-section" aria-label={title}>
      <header>
        <b>{title}</b>
        <div className="grow" />
        {extra}
        <input
          ref={(el) => {
            inputs.current[kind] = el;
          }}
          type="file"
          multiple
          hidden
          aria-label={`${t('pd.upload')} : ${title}`}
          onChange={(e) => (upload(kind, e.target.files), (e.target.value = ''))}
        />
        <button className="btn sm primary" disabled={busy} onClick={() => inputs.current[kind]?.click()}>
          <Upload size={14} /> {t('pd.upload')}
        </button>
      </header>
      <div className="ps-who">{hint}</div>
      {of(kind).map(line)}
      {!of(kind).length && <p className="muted small">{t('pd.none')}</p>}
    </section>
  );

  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}>
        <FolderOpen size={13} /> {label ?? t('pd.button')}
      </button>
      {open && (
        <div className="palette-back" onMouseDown={() => setOpen(false)}>
          <div className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label={t('pd.title', { ref: p.ref })} onMouseDown={(e) => e.stopPropagation()}>
            <header className="rc-head">
              <h2>{t('pd.title', { ref: p.ref })}</h2>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={t('pd.close')}>
                <X size={20} />
              </button>
            </header>
            <div className="bk-form" style={{ display: 'grid', gap: 12 }}>
              <section className="pf-drop ps-section" aria-label={t('pd.pack')}>
                <header>
                  <b>{t('pd.pack')}</b>
                </header>
                {pack && p.pack.sentToSupplier ? line(pack) : <p className="muted small">{t('pd.packNone')}</p>}
              </section>
              {section('diecut', t('pd.diecut'), t('pd.diecutHint'))}
              {section('oldpack', t('pd.oldpack'), t('pd.oldpackHint'))}
              {section(
                'quality',
                t('pd.quality'),
                t('pd.qualityHint'),
                <select className="input ps-doctype" aria-label={t('pd.docType')} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {QUALITY.map((q) => (
                    <option key={q.value} value={q.value}>
                      {t(q.key)}
                    </option>
                  ))}
                </select>,
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
