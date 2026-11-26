import type { Proforma } from '../data/types';
import { getBlob, saveBlob } from './files';

/** Télécharge la copie du virement (acompte ou solde) ; false si absente ou introuvable */
export async function downloadPaymentProof(pf: Proforma, kind: 'deposit' | 'balance'): Promise<boolean> {
  const f = kind === 'deposit' ? pf.depositProof : pf.balanceProof;
  if (!f) return false;
  const blob = await getBlob(f.fileId);
  if (!blob) return false;
  await saveBlob(blob, f.name);
  return true;
}
