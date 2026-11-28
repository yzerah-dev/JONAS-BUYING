import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { canCancelLines, currentUser, pendingVersion, supplierTerms, useStore } from '../data/store';
import type { Proforma } from '../data/types';
import { emptyLine, toImport, type EditLine } from '../lib/editLines';
import LinesEditor from './LinesEditor';
import { toast } from './ui-shared';

/** Proforma pas encore signée : « Ajouter des produits » (produits du fournisseur, ou nouveaux produits créés à la volée) */
export default function AddProformaLines({ pf }: { pf: Proforma }) {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([emptyLine()]);
  if (!canCancelLines(currentUser(state), pf) || pf.status !== 'a_signer') return null;
  const currency = pf.currency ?? supplierTerms(state, pf.supplierId).currency;
  const ready = toImport(lines, state.products);
  const close = () => {
    setOpen(false);
    setLines([emptyLine()]);
  };
  const add = () => {
    if (!ready) return;
    dispatch({ type: 'addProformaLines', id: pf.id, lines: ready });
    toast(`${ready.length} produit(s) ajouté(s) à ${pf.id}`);
    close();
  };
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        <Plus size={16} /> Ajouter des produits
      </button>
      {open && (
        <div className="palette-back" onMouseDown={close}>
          <div className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label="Ajouter des produits" onMouseDown={(e) => e.stopPropagation()}>
            <header className="rc-head">
              <div>
                <h2>Ajouter des produits · {pf.id}</h2>
                <span className="muted small">
                  Produit déjà référencé chez ce fournisseur (recherche par réf., EAN ou nom), ou « Nouveau produit » : il est créé au catalogue en développement. Un produit déjà sur la proforma voit
                  sa quantité augmenter.
                </span>
              </div>
              <button type="button" className="icon-btn" onClick={close} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>
            <div className="bk-form" style={{ display: 'block' }}>
              {pendingVersion(pf) && (
                <p className="pill orange mb" style={{ whiteSpace: 'normal' }}>
                  Le fournisseur a déjà déposé sa proforma : ces produits n’y figurent pas, demandez-lui une version mise à jour avant de signer.
                </p>
              )}
              <LinesEditor supplierId={pf.supplierId} currency={currency} lines={lines} setLines={setLines} />
            </div>
            <footer className="rc-foot">
              <span>{ready ? `${ready.length} produit(s) prêt(s)` : 'Complétez les lignes (quantité, prix ; pour un nouveau produit : nom, colisage, CBM)'}</span>
              <button type="button" className="btn ghost" onClick={close}>
                Annuler
              </button>
              <button type="button" className="btn primary" disabled={!ready} onClick={add}>
                <Plus size={16} /> Ajouter à la proforma
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
