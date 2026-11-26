// Montants dans la devise du fournisseur (jamais convertis en euros à l'affichage).
// Un total qui mélange plusieurs devises s'affiche par devise : « 120 000 USD + 15 000 € ».

/** Total par devise */
export type CurSum = Record<string, number>;

export function addCur(m: CurSum, currency: string, v: number): CurSum {
  m[currency] = (m[currency] ?? 0) + v;
  return m;
}

export function sumCur(items: { currency: string; v: number }[]): CurSum {
  const m: CurSum = {};
  for (const x of items) addCur(m, x.currency, x.v);
  return m;
}

const fmts = new Map<string, Intl.NumberFormat>();
/** Montant arrondi dans sa devise : « 100 000 USD », « 40 000 € », « 3 200 CNY » */
export function cur0(n: number, currency: string) {
  let f = fmts.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, currencyDisplay: currency === 'EUR' ? 'symbol' : 'code', maximumFractionDigits: 0 });
    fmts.set(currency, f);
  }
  return f.format(n);
}

/** Total par devise, la plus grosse d'abord ; « 0 » si vide */
export function curSumLabel(m: CurSum, emptyCurrency = 'EUR') {
  const parts = Object.entries(m)
    .filter(([, v]) => Math.abs(v) >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => cur0(v, c));
  return parts.length ? parts.join(' + ') : cur0(0, emptyCurrency);
}

/** Ajoute les totaux b à a (a est modifié) */
export function mergeCur(a: CurSum, b: CurSum): CurSum {
  for (const [c, v] of Object.entries(b)) addCur(a, c, v);
  return a;
}
