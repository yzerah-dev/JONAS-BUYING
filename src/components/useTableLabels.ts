import { useEffect, type RefObject } from 'react';

/**
 * Sur téléphone, les tableaux s'affichent en fiches empilées (voir index.css).
 * Chaque cellule reçoit en data-label le titre de sa colonne, affiché devant la valeur.
 */
export function useTableLabels(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const label = () => {
      el.querySelectorAll<HTMLTableElement>('table.tbl:not(.matrix)').forEach((table) => {
        const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
        table.querySelectorAll('tbody tr').forEach((tr) => {
          let col = 0;
          [...tr.children].forEach((td) => {
            const l = heads[col] ?? '';
            if (td.getAttribute('data-label') !== l) td.setAttribute('data-label', l);
            col += (td as HTMLTableCellElement).colSpan || 1;
          });
        });
      });
    };
    label();
    const obs = new MutationObserver(label);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [root]);
}
