import { UserPlus } from 'lucide-react';
import { UNASSIGNED, useAuth, useStore } from '../data/store';
import { initials } from '../lib/format';
import { designerColor, toast } from './ui-shared';

/** Designers proposés : l'équipe design active, plus ceux déjà présents sur des packs */
function useDesigners() {
  const { state } = useStore();
  return [...new Set([...state.users.filter((u) => u.role === 'designer' && u.active && u.designerName).map((u) => u.designerName!), ...state.products.map((p) => p.pack.designer)])]
    .filter((d) => d && d !== UNASSIGNED)
    .sort();
}

/** « Affecter à : [ABIR] [ALEX PANDA] [ROLAND] [À attribuer] » : un clic affecte tous les produits sélectionnés */
export default function AssignDesigner({ ids, onDone, dark }: { ids: string[]; onDone?: () => void; dark?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const designers = useDesigners();
  if (!auth.can('pack.assign') || !ids.length) return null;
  const assign = (d: string) => {
    const ok = ids.filter((id) => auth.allowed({ type: 'reassignPack', productId: id, designer: d }));
    ok.forEach((id) => dispatch({ type: 'reassignPack', productId: id, designer: d }));
    toast(d === UNASSIGNED ? `${ok.length} pack${ok.length > 1 ? 's' : ''} remis « À attribuer »` : `${ok.length} pack${ok.length > 1 ? 's' : ''} affecté${ok.length > 1 ? 's' : ''} à ${d}`);
    onDone?.();
  };
  const current = new Set(ids.map((id) => state.products.find((p) => p.id === id)?.pack.designer));
  return (
    <div className={`asg ${dark ? 'dark' : ''}`} role="group" aria-label="Affecter au designer">
      <span className="asg-lbl">
        <UserPlus size={15} /> Affecter à :
      </span>
      {[...designers, UNASSIGNED].map((d) => (
        <button key={d} type="button" className={`asg-btn ${current.size === 1 && current.has(d) ? 'cur' : ''}`} onClick={() => assign(d)} aria-label={`Affecter à ${d}`}>
          <span className="dev-avatar" style={{ background: designerColor(d) }}>
            {d === UNASSIGNED ? '?' : initials(d)}
          </span>
          {d}
        </button>
      ))}
    </div>
  );
}
