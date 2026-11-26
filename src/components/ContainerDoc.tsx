import { useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { useStore } from '../data/store';
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
