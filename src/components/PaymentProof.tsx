import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Proforma } from '../data/types';
import { newFileId, putBlob, supplierScope } from '../lib/files';
import { toast } from './ui-shared';

/**
 * JONAS dépose la copie du virement (acompte ou solde) : le fichier est rangé chez le fournisseur
 * (il peut le télécharger depuis son portail) et le paiement est marqué payé.
 */
export function PaymentProofUpload({ pf, kind, className = 'btn sm', children }: { pf: Proforma; kind: 'deposit' | 'balance'; className?: string; children: ReactNode }) {
  const { dispatch } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const label = kind === 'deposit' ? 'Copie du virement d’acompte' : 'Copie du virement de solde';
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const fileId = newFileId(supplierScope(pf.supplierId), `${pf.id}-virement-${kind}`, 0);
      await putBlob(fileId, f);
      dispatch({ type: 'setPaymentProof', id: pf.id, kind, file: { fileId, name: f.name, size: f.size, type: f.type || 'application/octet-stream' } });
      toast(`${label} déposée : ${f.name}`);
    } catch {
      toast('Envoi impossible : réessayez.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
        aria-label={`${label} (${pf.id})`}
        onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))}
      />
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {children}
      </button>
    </>
  );
}
