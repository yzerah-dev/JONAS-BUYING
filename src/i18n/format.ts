import type { ISODate } from '../data/types';
import { dec as frDec, eur as frEur, eur2 as frEur2, fdate as frFdate, fshort as frFshort, isoWeek, m3 as frM3, num as frNum, parse, weekLabel as frWeekLabel } from '../lib/format';
import type { Lang } from './dict';

/** Formats d'affichage selon la langue (fr : ceux de src/lib/format.ts, inchangés). */
export interface Fmt {
  fdate: (d?: ISODate) => string;
  fshort: (d?: ISODate) => string;
  eur: (n: number) => string;
  eur2: (n: number) => string;
  num: (n: number) => string;
  dec: (n: number, d?: number) => string;
  m3: (n: number) => string;
  weekLabel: (d: ISODate) => string;
}

export const FMT_FR: Fmt = { fdate: frFdate, fshort: frFshort, eur: frEur, eur2: frEur2, num: frNum, dec: frDec, m3: frM3, weekLabel: frWeekLabel };

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const eurEn = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2En = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const numEn = new Intl.NumberFormat('en-GB');
const decEn = (n: number, d = 1) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const fshortEn = (d?: ISODate) => {
  if (!d) return '—';
  const x = parse(d);
  return `${x.getUTCDate()} ${MONTHS_EN[x.getUTCMonth()]}`;
};

export const FMT_EN: Fmt = {
  /** « 14 Nov 2026 » (sans ambiguïté jour/mois) */
  fdate: (d) => (d ? `${fshortEn(d)} ${parse(d).getUTCFullYear()}` : '—'),
  /** « 14 Nov » */
  fshort: fshortEn,
  eur: (n) => eurEn.format(n),
  eur2: (n) => eur2En.format(n),
  num: (n) => numEn.format(Math.round(n)),
  dec: decEn,
  m3: (n) => `${decEn(n, 1)} m³`,
  weekLabel: (d) => `W${String(isoWeek(d).week).padStart(2, '0')}`,
};

const eurZh = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2Zh = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const numZh = new Intl.NumberFormat('zh-CN');
const decZh = (n: number, d = 1) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fshortZh = (d?: ISODate) => {
  if (!d) return '—';
  const x = parse(d);
  return `${x.getUTCMonth() + 1}月${x.getUTCDate()}日`;
};

export const FMT_ZH: Fmt = {
  /** « 2026年11月14日 » */
  fdate: (d) => (d ? `${parse(d).getUTCFullYear()}年${fshortZh(d)}` : '—'),
  /** « 11月14日 » */
  fshort: fshortZh,
  eur: (n) => eurZh.format(n),
  eur2: (n) => eur2Zh.format(n),
  num: (n) => numZh.format(Math.round(n)),
  dec: decZh,
  m3: (n) => `${decZh(n, 1)} m³`,
  /** « 第46周 » */
  weekLabel: (d) => `第${isoWeek(d).week}周`,
};

export const FMT: Record<Lang, Fmt> = { fr: FMT_FR, en: FMT_EN, zh: FMT_ZH };
