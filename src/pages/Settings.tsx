import { RotateCcw } from 'lucide-react';
import { useStore } from '../data/store';
import { toast } from '../components/ui';

export default function Settings() {
  const { dispatch } = useStore();
  return (
    <>
      <div className="page-head">
        <h1>Paramètres</h1>
      </div>
      <div className="grid2">
        <div className="card pad">
          <div className="card-title">Données de démonstration</div>
          <p className="small">
            Les données sont stockées localement dans le navigateur. Toutes les actions (signature, validations, affectations, bookings, réceptions, paiements) mettent à jour la même source de
            données et se répercutent dans toutes les vues.
          </p>
          <button
            className="btn danger"
            onClick={() => {
              dispatch({ type: 'reset' });
              toast('Données réinitialisées');
            }}
          >
            <RotateCcw size={16} /> Réinitialiser les données
          </button>
        </div>
        <div className="card pad">
          <div className="card-title">Règles de calcul</div>
          <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Capacité de référence : 69 m³ par 40HC (pilotage volumétrique, ne remplace pas une vérification physique).</li>
            <li>CBM d’une ligne = (quantité ÷ PCB) × CBM carton ; équivalent 40HC = CBM ÷ 69.</li>
            <li>Un pack est terminé uniquement après les 4 validations : David → Direction → Moinard → Fournisseur.</li>
            <li>Quantités suivies par commande, conteneur et réception (pas de double comptage).</li>
            <li>Vue conteneurs par ETA : arrivée prévue, révisée ou réelle dans la période, même si l’ETD est antérieure.</li>
            <li>Les changements de dates et de statuts sont historisés.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
