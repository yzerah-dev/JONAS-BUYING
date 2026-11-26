import type { Product } from '../data/types';
import { bookingStage, currentUser, pendingVersion, signedVersion, packDone, useStore } from '../data/store';

/** Le pack attend la validation de ce fournisseur */
export const awaitsSupplier = (p: Product) => p.pack.sentToSupplier && p.pack.validations.fournisseur.state === 'pending' && !packDone(p);

/** Données visibles par le fournisseur connecté — et uniquement celles-ci. */
export function usePortal() {
  const { state, dispatch } = useStore();
  const user = currentUser(state);
  const supplier = state.suppliers.find((s) => s.id === user.supplierId);
  const sid = supplier?.id;
  const products = state.products.filter((p) => p.supplierId === sid);
  const proformas = state.proformas.filter((p) => p.supplierId === sid);
  const containers = state.containers.filter((c) => c.supplierId === sid);

  const packsToValidate = products.filter(awaitsSupplier);
  const dieCutsRequested = products.filter((p) => p.pack.dieCut === 'requested');
  const plansRequested = containers.filter((c) => c.planRequested && !c.planValidated && ['a_booker', 'booking_demande', 'booke'].includes(c.status));
  /** Demandes de booking de JONAS à prendre en compte (plan, marchandise prête, boîtes demandées au transitaire) */
  const bookingsToDo = proformas.filter((p) => bookingStage(p) === 'fournisseur');
  /** Transmis au transitaire, proposition pas encore faite */
  const bookingsAtForwarder = proformas.filter((p) => bookingStage(p) === 'transitaire');
  /** Propositions du transitaire en validation (à accepter par le fournisseur et par JONAS) */
  const bookingsInValidation = proformas.filter((p) => bookingStage(p) === 'validation');
  const bookingsToAccept = bookingsInValidation.filter((p) => !p.booking!.proposal!.supplierOk);
  /** Proformas à déposer : à signer, sans version déposée en attente (dont modification refusée à redéposer) */
  const proformasToUpload = proformas.filter((p) => p.status === 'a_signer' && !pendingVersion(p) && !signedVersion(p));
  /** Expéditions partielles demandées par JONAS, à accepter */
  const splitsToAccept = proformas.filter((p) => p.splitRequest?.side === 'jonas');
  const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
  const docsMissing = containers.filter((c) => ['booke', 'en_transit'].includes(c.status) && REQUIRED_DOCS.some((d) => !c.documents.includes(d)));

  return { state, dispatch, user, supplier, products, proformas, containers, packsToValidate, dieCutsRequested, plansRequested, bookingsToDo, bookingsAtForwarder, bookingsInValidation, bookingsToAccept, proformasToUpload, splitsToAccept, docsMissing, REQUIRED_DOCS };
}
