import { useEffect, useReducer, type ReactNode } from 'react';
import { STORAGE_KEY, StoreContext, load, reducer } from './store';

/** Fournit l'état de l'application et le sauvegarde dans le navigateur */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* stockage indisponible : l'application reste utilisable */
    }
  }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}
