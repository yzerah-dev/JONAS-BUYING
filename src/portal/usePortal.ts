import { bookingOpen, currentUser, packDone, useStore } from '../data/store';

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
  const plansRequested = containers.filter((c) => c.planRequested && !c.planValidated && ['a_booker', 'booking_demande', 'booke'].includes(c.status));
  /** Demandes de booking de JONAS : le fournisseur répond avec le plan et les dates réelles */
  const bookingsToDo = proformas.filter(bookingOpen);
  const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
  const docsMissing = containers.filter((c) => ['booke', 'en_transit'].includes(c.status) && REQUIRED_DOCS.some((d) => !c.documents.includes(d)));

  return { state, dispatch, user, supplier, products, proformas, containers, packsToValidate, dieCutsRequested, plansRequested, bookingsToDo, docsMissing, REQUIRED_DOCS };
}
