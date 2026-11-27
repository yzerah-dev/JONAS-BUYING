import { useRef, useState, type ReactNode } from 'react';
import { Check, Download, FileText, Upload } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import type { Container } from '../data/types';
import { forwarderScope, newFileId, putBlob, supplierScope } from '../lib/files';
import { downloadContainerDoc } from '../lib/containerDocs';
import { toast } from './ui-shared';

/** Où ranger le fichier : chez le transitaire du conteneur s'il dépose, sinon chez le fournisseur */
const scopeOf = (c: Container, byForwarder: boolean) => (byForwarder && c.forwarder ? forwarderScope(c.forwarder) : supplierScope(c.supplierId));

/**
 * Dépôt d'un vrai fichier pour un document de conteneur (BL, Invoice, Packing List…) :
 * le bouton ouvre le choix du fichier, qui est enregistré dans le stockage puis rattaché au conteneur.
 */
export function ContainerDocUpload({
  c,
  doc,
  className,
  title,
  byForwarder = false,
  done,
  children,
}: {
  c: Container;
  doc: string;
  className?: string;
  title?: string;
  byForwarder?: boolean;
  done: string;
  children: ReactNode;
}) {
  const { dispatch } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const fileId = newFileId(scopeOf(c, byForwarder), `${c.id}-${doc.replace(/\W+/g, '-')}`, 0);
      await putBlob(fileId, f);
      dispatch({ type: 'addContainerDoc', containerId: c.id, doc, file: { fileId, name: f.name, size: f.size, type: f.type || 'application/octet-stream' } });
      toast(done);
    } catch {
      toast('Envoi impossible : réessayez.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input ref={input} type="file" hidden aria-label={`${title ?? doc} (${c.number ?? c.id})`} onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <button type="button" className={className} title={title} disabled={busy} onClick={() => input.current?.click()}>
        {children}
      </button>
    </>
  );
}

export function ContainerDocLink({ c, doc, className = 'icon-btn' }: { c: Container; doc: string; className?: string }) {
  const f = c.docFiles?.[doc];
  return (
    <button
      type="button"
      className={className}
      aria-label={`Télécharger ${doc}`}
      title={f ? `${f.name} · déposé par ${f.by}` : 'Document noté sans fichier joint'}
      onClick={() => downloadContainerDoc(c, doc)}
    >
      <Download size={13} />
    </button>
  );
}

/** Les 3 documents du conteneur, chacun avec son rond : BL, Packing List, Facture */
const ROUNDS: { doc: string; label: string; hint: string }[] = [
  { doc: 'BL.pdf', label: 'BL', hint: 'Connaissement (Bill of Lading)' },
  { doc: 'Packing List.xlsx', label: 'Packing List', hint: 'Liste de colisage' },
  { doc: 'Invoice.pdf', label: 'Facture', hint: 'Facture commerciale (Invoice)' },
];

/** N° de conteneur et plomb, puis 3 ronds à uploader (BL, Packing List, Facture) */
export function ContainerPapers({ c }: { c: Container }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const [num, setNum] = useState(c.number ?? '');
  const [seal, setSeal] = useState(c.seal ?? '');
  const clean = num.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const valid = /^[A-Z]{4}\d{7}$/.test(clean);
  const canNumber = auth.allowed({ type: 'setContainerNumber', containerId: c.id, number: 'ABCD1234567' });
  const canUpload = auth.allowed({ type: 'addContainerDoc', containerId: c.id, doc: 'BL.pdf' });
  const changed = clean !== (c.number ?? '') || seal.trim().toUpperCase() !== (c.seal ?? '');
  return (
    <div className="ctp">
      <div className="ctp-num">
        <label htmlFor={`ctn-num-${c.id}`}>
          <span>N° de conteneur</span>
          <input
            id={`ctn-num-${c.id}`}
            className={`input ${num && !valid ? 'bad' : ''}`}
            placeholder="Ex. MSKU1234567"
            value={num}
            disabled={!canNumber}
            maxLength={13}
            onChange={(e) => setNum(e.target.value.toUpperCase())}
          />
        </label>
        <label htmlFor={`ctn-seal-${c.id}`}>
          <span>Plomb (scellé)</span>
          <input id={`ctn-seal-${c.id}`} className="input" placeholder="Ex. SL400123" value={seal} disabled={!canNumber} onChange={(e) => setSeal(e.target.value.toUpperCase())} />
        </label>
        {canNumber && (
          <button
            type="button"
            className="btn primary"
            disabled={!valid || !changed}
            onClick={() => {
              dispatch({ type: 'setContainerNumber', containerId: c.id, number: clean, seal });
              toast(`Conteneur ${clean} enregistré`);
            }}
          >
            Enregistrer
          </button>
        )}
        {num && !valid && <span className="small red ctp-err">4 lettres + 7 chiffres (ex. MSKU1234567)</span>}
      </div>
      <div className="ctp-rounds">
        {ROUNDS.map((r) => {
          const f = c.docFiles?.[r.doc];
          const noted = c.documents.includes(r.doc);
          return (
            <div key={r.doc} className={`ctp-round ${f ? 'done' : ''}`}>
              {canUpload ? (
                <ContainerDocUpload c={c} doc={r.doc} className="ctp-ring" title={`${f ? 'Remplacer' : 'Déposer'} : ${r.label}`} done={`${r.label} déposé`}>
                  {f ? <Check size={30} strokeWidth={3} /> : <Upload size={26} />}
                </ContainerDocUpload>
              ) : (
                <span className="ctp-ring">{f ? <Check size={30} strokeWidth={3} /> : <FileText size={26} />}</span>
              )}
              <b>{r.label}</b>
              <small title={r.hint}>{f ? f.name : noted ? 'Noté sans fichier' : 'À uploader'}</small>
              {f && (
                <button type="button" className="btn sm" onClick={() => downloadContainerDoc(c, r.doc)} aria-label={`Télécharger ${r.label}`}>
                  <Download size={13} /> Télécharger
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
