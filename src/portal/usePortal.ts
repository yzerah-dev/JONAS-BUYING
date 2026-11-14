import { currentUser, packDone, useStore } from '../data/store';

/** Données visibles par le fournisseur connecté — et uniquement celles-ci. */
export function usePortal() {
  const { state, dispatch } = useStore();
  const user = currentUser(state);
  const supplier = state.suppliers.find((s) => s.id === user.supplierId);
  const sid = supplier?.id;
  const products = state.products.filter((p) => p.supplierId === sid);
  const proformas = state.proformas.filter((p) => p.supplierId === sid);
  const containers = state.containers.filter((c) => c.supplierId === sid);

  const packsToValidate = products.filter((p) => p.pack.sentToSupplier && p.pack.validations.fournisseur.state === 'pending' && !packDone(p));
  const dieCutsRequested = products.filter((p) => p.pack.dieCut === 'requested');
  const plansRequested = containers.filter((c) => c.planRequested && c.status === 'a_booker');
  const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
  const docsMissing = containers.filter((c) => ['booke', 'en_transit'].includes(c.status) && REQUIRED_DOCS.some((d) => !c.documents.includes(d)));

  return { state, dispatch, user, supplier, products, proformas, containers, packsToValidate, dieCutsRequested, plansRequested, docsMissing, REQUIRED_DOCS };
}
