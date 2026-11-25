import { useState } from 'react';
import { Ban, Download, FilePen, FileText, Loader2, PenLine, Stamp, Upload, X } from 'lucide-react';
import { byId, currentUser, pendingVersion, signedVersion, useAuth, useStore } from '../data/store';
import { ROLE_DEFS } from '../data/permissions';
import type { Company, ImportLine, Proforma, ProformaDoc } from '../data/types';
import { getBlob, newFileId, putBlob, saveBlob, fsize, supplierScope } from '../lib/files';
import { purchaseOrderPdf, versionFileName, versionPdf } from '../lib/proformaPdf';
import { addDays, diffDays, fdate, weekLabel, TODAY } from '../lib/format';
import { useT } from '../i18n';
import { toast } from './ui-shared';
import FileDrop from './FileDrop';
import LinesEditor from './LinesEditor';
import { fromExtraction, toImport, type EditLine } from '../lib/editLines';
import { extractProforma } from '../lib/proformaExtract';

const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const STATUS_COLOR: Record<ProformaDoc['status'], string> = { a_signer: 'orange', signee: 'green', annulee: 'red', refusee: 'red', remplacee: 'grey' };

/** Télécharge le PDF d'une version (signée : avec signature et tampon ; annulée : avec bandeau) */
function useDownload() {
  const { state } = useStore();
  const { t } = useT();
  return async (pf: Proforma, v: ProformaDoc) => {
    const blob = await versionPdf(pf, v, { supplier: byId(state.suppliers, pf.supplierId), products: state.products, company: state.settings.company });
    const name = versionFileName(pf, v);
    const r = await saveBlob(blob, name);
    if (r === 'saved' || r === 'zipped') toast(t('pv.downloaded', { file: name }));
  };
}

/**
 * Proforma déposée par le fournisseur, version par version.
 * Fournisseur : dépôt, puis demandes de modification (nouvelle version + motif).
 * JONAS : signature (tampon + date + date d'expédition demandée), refus d'une modification.
 */
export default function ProformaVersions({ pf }: { pf: Proforma }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const { t, fmt } = useT();
  const me = currentUser(state);
  const supplierSide = ROLE_DEFS[me.role].portal;
  const download = useDownload();
  const [signing, setSigning] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [refuseReason, setRefuseReason] = useState('');
  const versions = [...(pf.versions ?? [])].sort((a, b) => b.version - a.version);
  const pending = pendingVersion(pf);
  const signed = signedVersion(pf);
  const canSign = auth.allowed({ type: 'signProforma', id: pf.id, etdWanted: pf.etd });
  const canRefuse = auth.allowed({ type: 'refuseProformaVersion', id: pf.id, reason: 'x' });
  const canUpload = auth.allowed({ type: 'uploadProforma', id: pf.id, fileId: '', name: '', size: 0, mime: '', reason: signed ? 'x' : undefined });
  const [uploadOpen, setUploadOpen] = useState(!signed && !pending);
  // Glisser un fichier au-dessus de la carte ouvre la zone de dépôt
  const dragProps = canUpload
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes('Files')) setUploadOpen(true);
        },
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: (e: React.DragEvent) => e.preventDefault(),
      }
    : {};

  if (pf.split && pf.split.part > 1)
    return (
      <div className="card pad pv-card">
        <div className="card-title">
          <FileText size={18} /> {t('pv.title')}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('sp.proformaOf', { id: pf.split.root })}
        </p>
      </div>
    );
  return (
    <div className="card pad pv-card" {...dragProps}>
      <div className="card-title">
        <FileText size={18} /> {t('pv.title')}
      </div>
      {pf.order && <OrderBox pf={pf} supplierSide={!!supplierSide} waiting={versions.length === 0} />}
      {pending && (
        <div className="pv-alert">
          <Stamp size={18} />
          <span className="grow">{signed ? t('pv.pendingRevision', { n: pending.version }) : t('pv.pendingSign', { n: pending.version })}</span>
          {canRefuse && !refusing && (
            <button className="btn sm ghost" onClick={() => setRefusing(true)}>
              <Ban size={14} /> {t('pv.refuse')}
            </button>
          )}
          {canSign && (
            <button className="btn sm primary" onClick={() => setSigning(true)}>
              <PenLine size={14} /> {t('pv.sign')}
            </button>
          )}
        </div>
      )}
      {refusing && (
        <form
          className="pv-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!refuseReason.trim()) return toast(t('pv.refuseReason'));
            dispatch({ type: 'refuseProformaVersion', id: pf.id, reason: refuseReason.trim() });
            toast(t('pv.refusedToast'));
            setRefusing(false);
          }}
        >
          <label htmlFor={`pv-refuse-${pf.id}`}>
            {t('pv.refuseReason')}
            <input id={`pv-refuse-${pf.id}`} className="input" autoFocus value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} />
          </label>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn sm" onClick={() => setRefusing(false)}>
              {t('pv.cancel')}
            </button>
            <button type="submit" className="btn sm danger">
              {signed ? t('pv.refuseSend') : t('pv.refuse')}
            </button>
          </div>
        </form>
      )}

      {versions.length === 0 && <p className="small muted">{supplierSide ? t('pv.noneSup') : t('pv.none')}</p>}
      <div className="pv-list">
        {versions.map((v) => (
          <div key={v.version} className={`pv-row ${v.status}`}>
            <span className="pv-num">v{v.version}</span>
            <div className="pv-info">
              <b>{v.name}</b>
              <small>
                {t('pv.uploaded', { date: fmt.fdate(v.uploadedAt.slice(0, 10)), by: v.uploadedBy })}
                {v.size ? ` · ${fsize(v.size)}` : ''}
              </small>
              {v.reason && <small className="pv-reason">{t('pv.reason', { reason: v.reason })}</small>}
              {v.signature && (
                <small className="green bold">
                  <Stamp size={12} /> {t('pv.etd', { date: fmt.fdate(v.signature.etdWanted) })}
                </small>
              )}
              {v.refused && <small className="red">{t('pv.refusedReason', { reason: v.refused.reason })}</small>}
            </div>
            <span className={`pill ${STATUS_COLOR[v.status]}`}>
              {v.status === 'signee'
                ? t('pv.st.signee', { date: fmt.fdate(v.signature!.date), by: v.signature!.by })
                : v.status === 'annulee'
                  ? t('pv.st.annulee', { n: v.cancelledBy!.version })
                  : t(`pv.st.${v.status}`)}
            </span>
            <button className="btn sm" onClick={() => download(pf, v)} aria-label={`${t('pv.download')} v${v.version}`}>
              <Download size={13} /> {t('pv.download')}
            </button>
          </div>
        ))}
      </div>

      {canUpload && <UploadBox pf={pf} revision={!!signed} hasPending={!!pending} open={uploadOpen} setOpen={setUploadOpen} />}
      {signing && pending && <SignDialog pf={pf} doc={pending} onClose={() => setSigning(false)} />}
    </div>
  );
}

function UploadBox({ pf, revision, hasPending, open, setOpen }: { pf: Proforma; revision: boolean; hasPending: boolean; open: boolean; setOpen: (o: boolean) => void }) {
  const { dispatch } = useStore();
  const { t } = useT();
  const { state } = useStore();
  const [reason, setReason] = useState('');
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<{ file: File; lines: EditLine[] } | null>(null);
  const products = state.products.filter((p) => p.supplierId === pf.supplierId);
  const send = async (file: File, lines?: ImportLine[]) => {
    const fileId = newFileId(supplierScope(pf.supplierId), pf.id, 0);
    await putBlob(fileId, file);
    const n = (pf.versions ?? []).reduce((m, v) => Math.max(m, v.version), 0) + 1;
    dispatch({ type: 'uploadProforma', id: pf.id, fileId, name: file.name, size: file.size, mime: file.type, reason: revision ? reason.trim() : undefined, lines });
    const created = lines?.filter((l) => l.newProduct).length ?? 0;
    toast(t('pv.uploadedToast', { n }) + (created ? ` · ${t('ex.created', { n: created })}` : ''));
    setReason('');
    setReview(null);
    setOpen(false);
  };
  // Dépôt : on lit les lignes du document, à vérifier avant d'enregistrer
  const pick = async (file?: File) => {
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) return toast(t('pv.badType'));
    if (revision && !reason.trim()) return toast(t('pv.needReason'));
    setReading(true);
    const ex = await extractProforma(file, file.type).catch(() => ({ lines: [], engine: 'aucun' as const }));
    setReading(false);
    if (!ex.lines.length) {
      toast(t('ex.none'));
      return send(file);
    }
    setReview({ file, lines: fromExtraction(ex.lines, products, state.products) });
  };
  if (!open)
    return (
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn" onClick={() => setOpen(true)}>
          {revision ? <FilePen size={16} /> : <Upload size={16} />} {revision ? t('pv.revise') : hasPending ? t('pv.replace') : t('pv.upload')}
        </button>
      </div>
    );
  return (
    <div className="pv-form pv-upload">
      {revision && (
        <>
          <p className="small muted">{t('pv.reviseHint')}</p>
          <label htmlFor={`pv-reason-${pf.id}`}>
            {t('pv.reviseReason')}
            <input id={`pv-reason-${pf.id}`} className="input" placeholder={t('pv.revisePh')} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </>
      )}
      <FileDrop onFile={pick} ariaLabel={revision ? t('pv.revise') : t('pv.upload')} />
      {reading && (
        <span className="small muted row" style={{ gap: 6 }}>
          <Loader2 size={14} className="spin" /> {t('ex.reading')}
        </span>
      )}
      {review && (
        <div className="palette-back" onMouseDown={() => setReview(null)}>
          <div className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label={t('ex.title', { file: review.file.name })} onMouseDown={(e) => e.stopPropagation()}>
            <header className="rc-head">
              <div>
                <h2>{t('ex.title', { file: review.file.name })}</h2>
                <span className="muted small">
                  {t('ex.hint')} {revision ? t('ex.applyAtSign') : t('ex.applyNow')}
                </span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setReview(null)} aria-label={t('ex.cancel')}>
                <X size={20} />
              </button>
            </header>
            <div className="bk-form">
              <div className="bk-wide">
                <LinesEditor supplierId={pf.supplierId} currency={pf.currency ?? 'EUR'} lines={review.lines} setLines={(l) => setReview({ ...review, lines: l })} />
              </div>
            </div>
            <footer className="rc-foot">
              <span />
              <button type="button" className="btn" onClick={() => send(review.file)}>
                {t('ex.skip')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const ls = toImport(review.lines, state.products);
                  if (!ls) return toast(t('ex.invalid'));
                  send(review.file, ls);
                }}
              >
                <Upload size={16} /> {t('ex.save')}
              </button>
            </footer>
          </div>
        </div>
      )}
      {(revision || hasPending) && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn sm" onClick={() => setOpen(false)}>
            <X size={14} /> {t('pv.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Signature JONAS : signature + tampon + date du jour + date d'expédition demandée (annule la version signée précédente) */
export function SignDialog({ pf, doc, onClose }: { pf: Proforma; doc: ProformaDoc; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const sup = byId(state.suppliers, pf.supplierId);
  const prev = signedVersion(pf);
  const download = useDownload();
  const [etd, setEtd] = useState(pf.etd);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!etd) return toast('Indiquez la date d’expédition demandée');
    dispatch({ type: 'signProforma', id: pf.id, etdWanted: etd });
    toast(prev ? `${pf.id} v${doc.version} signée : annule et remplace la v${prev.version}` : `${pf.id} signée et tamponnée`);
    onClose();
  };
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog" role="dialog" aria-label={`Signer ${pf.id}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{prev ? `Signer la modification v${doc.version}` : `Signer la proforma ${pf.id}`}</h2>
            <span className="muted small">
              {pf.id} · {sup.shortName} · {doc.name}
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          <label htmlFor="sg-etd">
            Date d’expédition demandée
            <input id="sg-etd" className="input" type="date" required value={etd} onChange={(e) => setEtd(e.target.value)} />
          </label>
          <label>
            Date de signature
            <input className="input" value={fdate(TODAY)} readOnly />
          </label>
          <p className="small muted">
            {etd && etd !== pf.etd
              ? `Départ prévu actuellement ${fdate(pf.etd)} (${weekLabel(pf.etd)}) → ${fdate(etd)} (${weekLabel(etd)}), arrivée décalée de ${diffDays(etd, pf.etd)} j au ${fdate(addDays(pf.eta, diffDays(etd, pf.etd)))}.`
              : `Départ prévu ${fdate(pf.etd)} (${weekLabel(pf.etd)}).`}
          </p>
          <div className="pv-stamp-preview" aria-hidden>
            <CompanyStamp />
            <div className="pv-sig">
              <small>Bon pour accord, le {fdate(TODAY)}</small>
              <i>{me.name}</i>
              <small>{ROLE_DEFS[me.role].label}</small>
              <small>
                Expédition demandée : <b>{etd ? `${fdate(etd)} (${weekLabel(etd)})` : '—'}</b>
              </small>
              {prev && <small className="red bold">Annule et remplace la proforma v{prev.version}</small>}
            </div>
          </div>
          {(!state.settings.company.address || !state.settings.company.vat) && (
            <p className="small orange bold">Adresse ou n° de TVA de la société manquant sur le tampon : à compléter dans Paramètres.</p>
          )}
          {prev && (
            <p className="small red">
              La v{prev.version} signée le {fdate(prev.signature!.date)} sera annulée : son PDF portera la mention « ANNULÉE ».{' '}
              <button type="button" className="linkish" onClick={() => download(pf, doc)}>
                Voir la nouvelle version déposée
              </button>
            </p>
          )}
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn primary">
            <Stamp size={16} /> Signer et tamponner
          </button>
        </footer>
      </form>
    </div>
  );
}

/** Aperçu du tampon de la société (identique à celui du PDF) */
export function CompanyStamp({ company }: { company?: Company }) {
  const { state } = useStore();
  const c = company ?? state.settings.company;
  return (
    <div className="pv-stamp">
      <b>{c.name || 'JONAS INTERNATIONAL'}</b>
      {c.address && <small>{c.address}</small>}
      {c.city && <small>{c.city}</small>}
      {c.vat && <small className="bold">N° TVA intracom. : {c.vat}</small>}
    </div>
  );
}

/** Commande JONAS : origine des articles, bon de commande à télécharger par le fournisseur */
function OrderBox({ pf, supplierSide, waiting }: { pf: Proforma; supplierSide: boolean; waiting: boolean }) {
  const { state } = useStore();
  const { t, fmt } = useT();
  const o = pf.order!;
  const ctx = () => ({ supplier: byId(state.suppliers, pf.supplierId), products: state.products, company: state.settings.company });
  const save = async (blob: Blob | undefined, name: string) => {
    if (!blob) return;
    const r = await saveBlob(blob, name);
    if (r === 'saved' || r === 'zipped') toast(t('pv.downloaded', { file: name }));
  };
  return (
    <div className={`po-box ${waiting ? 'waiting' : ''}`}>
      <div className="grow">
        <b>
          {t('po.card', { date: fmt.fdate(o.at.slice(0, 10)) })} · {t(`po.srcLabel.${o.source}`)}
        </b>
        <small>{waiting ? (supplierSide ? t('po.cardSup') : t('po.cardSub')) : `${pf.poNumber} · ${o.by}`}</small>
      </div>
      <button type="button" className="btn sm" onClick={async () => save(await purchaseOrderPdf(pf, ctx()), `${pf.poNumber}_bon-de-commande.pdf`)}>
        <Download size={13} /> {t('po.download')}
      </button>
      {o.file && (
        <button type="button" className="btn sm ghost" title={t('po.importedFile', { file: o.file.name })} onClick={async () => save(await getBlob(o.file!.fileId).catch(() => undefined), o.file!.name)}>
          <Download size={13} /> {o.file.name}
        </button>
      )}
    </div>
  );
}
