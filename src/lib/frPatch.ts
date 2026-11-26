import type { Action } from '../data/store';
import type { Product } from '../data/types';
import type { FrText } from './frTexts';

/** Le produit a un texte anglais du fournisseur mais pas encore de description française */
export const needsFrench = (p: Product) => !!p.description?.en?.trim() && !p.description?.fr?.trim();

/** La désignation est encore celle du fournisseur (anglais brut de l'import) : on la remplace par la française */
const rawName = (p: Product) => {
  const n = p.name.trim().toLowerCase();
  const en = (p.description?.en ?? '').trim().toLowerCase();
  return !n || n === en || (n.length > 12 && en.startsWith(n));
};

/** Action qui pose la désignation (si elle est encore brute) et la description françaises */
export const frenchPatch = (p: Product, r: Pick<FrText, 'name' | 'fr'>, forceName = false): Action => ({
  type: 'setProductText',
  productId: p.id,
  name: forceName || rawName(p) ? r.name : p.name,
  description: { en: p.description?.en, fr: r.fr },
});
