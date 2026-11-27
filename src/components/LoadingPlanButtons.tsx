import { useState } from 'react';
import { FileSpreadsheet, Send } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import { remoteEnabled } from '../data/remote';
import type { Container } from '../data/types';
import { saveBlob } from '../lib/files';
import { loadingPlanFileName, loadingPlanXlsx } from '../lib/loadingPlan';
import { mailRecipients, sendMailNow } from '../lib/mail/outbox';
import { toast } from './ui-shared';

/** Plan de chargement : télécharger l'Excel, l'envoyer au fournisseur par e-mail (Excel joint) */
export default function LoadingPlanButtons({ c, send = true }: { c: Container; send?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const canSend = send && (auth.can('logistics.plan') || auth.can('proforma.edit')) && c.allocations.length > 0;
  const sup = state.suppliers.find((s) => s.id === c.supplierId);
  return (
    <div className="lp-btns">
      <button
        type="button"
        className="btn"
        disabled={busy || !c.allocations.length}
        onClick={async () => {
          setBusy(true);
          try {
            await saveBlob(await loadingPlanXlsx(state, c), loadingPlanFileName(c));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileSpreadsheet size={16} /> Télécharger le plan (Excel)
      </button>
      {canSend && sup && (
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!mailRecipients(sup).length) return toast(`${sup.shortName} n’a aucun contact avec e-mail : ajoutez-en un dans sa fiche (onglet Contacts).`);
            sendMailNow(
              state,
              { kind: 'loading', supplierId: c.supplierId, containerId: c.id, proformaId: c.allocations[0]?.proformaId },
              { remote: remoteEnabled(), log: (m) => dispatch({ type: 'logSupplierMail', ...m }) },
            );
            toast(`Plan de chargement envoyé à ${sup.shortName}`);
          }}
        >
          <Send size={16} /> Envoyer le plan au fournisseur
        </button>
      )}
    </div>
  );
}
