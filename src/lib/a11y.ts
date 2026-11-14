import type { KeyboardEvent, MouseEvent } from 'react';

/**
 * Rend un élément non-bouton (ligne, carte, en-tête) activable au clavier :
 * focus avec Tab, activation avec Entrée ou Espace, annoncé comme bouton.
 */
export function pressable(fn: (e?: MouseEvent | KeyboardEvent) => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: (e: MouseEvent) => fn(e),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn(e);
      }
    },
  };
}
