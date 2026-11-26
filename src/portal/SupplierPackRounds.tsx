import { useRef, useState } from 'react';
import { Check, Download, FileCheck2, Package, Scissors, Upload } from 'lucide-react';
import type { PackFile, PackFileKind, Product } from '../data/types';
import { fromDrop, fromInput, getBlob, newFileId, putBlob, saveBlob, supplierScope, zipBlobs, type PickedFile } from '../lib/files';
import { toast } from '../components/ui-shared';
import { useT } from '../i18n';
import { usePortal } from './usePortal';
import SupplierPackFiles from './SupplierPackFiles';
import { QUALITY } from './quality';

type Round = 'diecut' | 'pack' | 'docs';

/**
 * Portail fournisseur : le pack en trois gros ronds, comme dans Design & Pack.
 * Die cut (à déposer, en orange quand JONAS le demande) · Pack JONAS (à télécharger) · Documents (fiches qualité).
 * On glisse un fichier sur un rond ou on clique dessus.
 */
export default function SupplierPackRounds({ product: p, compact }: { product: Product; compact?: boolean }) {
  const { dispatch } = usePortal();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<Round | null>(null);
  const [docType, setDocType] = useState(QUALITY[0].value);
  /** Documents choisis : on demande leur type avant l'envoi */
  const [pendingDocs, setPendingDocs] = useState<PickedFile[]>([]);
  const inputs = useRef<Partial<Record<Round, HTMLInputElement | null>>>({});
  const files = p.pack.files ?? [];
  const of = (k: PackFileKind) => files.filter((f) => f.kind === k);
  const diecuts = of('diecut');
  const dcOk = diecuts.length > 0 || p.pack.dieCut === 'received';
  const docs = of('quality');
  const pack = of('pack').sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const packReady = p.pack.sentToSupplier;
  const requested = p.pack.dieCut === 'requested';

  const upload = async (kind: PackFileKind, picked: PickedFile[]) => {
    if (!picked.length) return;
    if (kind === 'quality' && !pendingDocs.length) return setPendingDocs(picked);
    setBusy(true);
    try {
      const metas = [];
      for (const [i, { file, path }] of picked.entries()) {
        const fid = newFileId(supplierScope(p.supplierId), `${p.id}-${kind}`, i);
        await putBlob(fid, file);
        metas.push({ id: fid, name: file.name, path, size: file.size, type: file.type, ...(kind === 'quality' ? { docType } : {}) });
      }
      dispatch({ type: 'addPackFiles', productId: p.id, kind, files: metas });
      toast(t('pd.added', { n: metas.length }));
    } finally {
      setBusy(false);
    }
  };

  const download = async (list: PackFile[], zipName: string) => {
    const items = [];
    for (const f of list) {
      const blob = await getBlob(f.id);
      if (blob) items.push({ path: f.docType ? `${f.docType}/${f.name}` : f.name, blob });
    }
    if (!items.length) return toast(list.length ? t('sr.notFound') : t('packs.downloadToast'));
    if (items.length === 1) return void (await saveBlob(items[0].blob, list[0].name));
    await saveBlob(await zipBlobs(items), zipName);
  };

  const rounds: {
    id: Round;
    kind?: PackFileKind;
    icon: typeof Package;
    label: string;
    state: 'ok' | 'todo' | 'ask' | 'wait';
    status: string;
    action: React.ReactNode;
  }[] = [
    {
      id: 'diecut',
      kind: 'diecut',
      icon: Scissors,
      label: t('sr.diecut'),
      state: dcOk ? 'ok' : requested ? 'ask' : 'todo',
      status: diecuts.length ? t('sr.files', { n: diecuts.length }) : dcOk ? t('packs.dieCut.sent') : requested ? t('sr.dc.requested') : t('sr.dc.none'),
      action: (
        <div className="sr-actions">
          <button type="button" className={`btn sm ${!dcOk ? 'primary' : ''} ${requested && !dcOk ? 'sr-ask' : ''}`} disabled={busy} onClick={() => inputs.current.diecut?.click()}>
            <Upload size={14} /> {dcOk ? t('sr.add') : t('sr.dc.btn')}
          </button>
          {diecuts.length > 0 && (
            <button type="button" className="btn sm" aria-label={`${t('sr.dl')} : ${t('sr.diecut')}`} onClick={() => download(diecuts, `${p.ref}_die-cut.zip`)}>
              <Download size={14} />
            </button>
          )}
        </div>
      ),
    },
    {
      id: 'pack',
      icon: Package,
      label: t('sr.pack'),
      state: packReady ? 'ok' : 'wait',
      status: packReady ? t('sr.pack.ready', { v: pack?.version ?? p.pack.artworkVersions }) : t('sr.pack.wait'),
      action: packReady ? (
        <button type="button" className="btn primary sr-dl" onClick={() => download(pack ? [pack] : [], `${p.ref}_pack.zip`)}>
          <Download size={16} /> {t('sr.pack.btn')}
        </button>
      ) : null,
    },
    {
      id: 'docs',
      kind: 'quality',
      icon: FileCheck2,
      label: t('sr.docs'),
      state: docs.length ? 'ok' : 'todo',
      status: docs.length ? t('sr.files', { n: docs.length }) : t('sr.docs.none'),
      action: (
        <div className="sr-actions">
          <button type="button" className="btn sm" disabled={busy} onClick={() => inputs.current.docs?.click()}>
            <Upload size={14} /> {docs.length || compact ? t('sr.add') : t('sr.docs.btn')}
          </button>
          {docs.length > 0 && (
            <button type="button" className="btn sm" aria-label={`${t('sr.dl')} : ${t('sr.docs')}`} onClick={() => download(docs, `${p.ref}_documents.zip`)}>
              <Download size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={`sr ${compact ? 'compact' : ''}`}>
      <div className="sr-rounds">
        {rounds.map((r) => {
          const upl = !!r.kind;
          const word = r.state === 'ok' ? (upl ? t('sr.uploaded') : t('sr.toDownload')) : upl ? t('sr.toUpload') : t('sr.pack.wait');
          return (
            <div key={r.id} className={`sr-col ${r.id === 'pack' ? 'sr-main' : ''}`}>
              {upl && (
                <input
                  ref={(el) => {
                    inputs.current[r.id] = el;
                  }}
                  type="file"
                  multiple
                  hidden
                  aria-label={`${t('pd.upload')} : ${r.label} (${p.ref})`}
                  onChange={(e) => (upload(r.kind!, fromInput(e.target.files)), (e.target.value = ''))}
                />
              )}
              <button
                type="button"
                className={`sr-round ${r.state} ${over === r.id ? 'over' : ''}`}
                aria-label={`${r.label} : ${word}`}
                disabled={busy || (!upl && !packReady)}
                onClick={() => (upl ? inputs.current[r.id]?.click() : download(pack ? [pack] : [], `${p.ref}_pack.zip`))}
                onDragOver={(e) => {
                  if (!upl || !e.dataTransfer.types.includes('Files')) return;
                  e.preventDefault();
                  setOver(r.id);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={async (e) => {
                  if (!upl || !e.dataTransfer.types.includes('Files')) return;
                  e.preventDefault();
                  setOver(null);
                  upload(r.kind!, await fromDrop(e.dataTransfer));
                }}
              >
                <span className="sr-circle">
                  {r.state === 'ok' && upl ? (
                    <Check size={compact ? 26 : 34} strokeWidth={3} />
                  ) : r.id === 'pack' && packReady ? (
                    <Download size={compact ? 26 : 34} strokeWidth={2.6} />
                  ) : (
                    <r.icon size={compact ? 24 : 30} />
                  )}
                </span>
                <b>{r.label}</b>
                <small>{r.status}</small>
              </button>
              {r.action}
            </div>
          );
        })}
      </div>
      {pendingDocs.length > 0 && (
        <form
          className="sr-pending"
          onSubmit={async (e) => {
            e.preventDefault();
            const list = pendingDocs;
            await upload('quality', list);
            setPendingDocs([]);
          }}
        >
          <b className="small">{t('sr.files', { n: pendingDocs.length })} :</b>
          <span className="small muted sr-pending-names">{pendingDocs.map((f) => f.file.name).join(', ')}</span>
          <select className="input ps-doctype" aria-label={t('pd.docType')} value={docType} onChange={(e) => setDocType(e.target.value)} autoFocus>
            {QUALITY.map((q) => (
              <option key={q.value} value={q.value}>
                {t(q.key)}
              </option>
            ))}
          </select>
          <button type="button" className="btn sm ghost" onClick={() => setPendingDocs([])}>
            {t('packs.cancel')}
          </button>
          <button type="submit" className="btn sm primary" disabled={busy}>
            <Upload size={14} /> {t('pd.upload')}
          </button>
        </form>
      )}
      <div className="sr-foot">
        <span className="xs muted">{t('sr.drop')}</span>
        <SupplierPackFiles product={p} label={t('sr.all')} />
      </div>
    </div>
  );
}
