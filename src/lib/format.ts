import type { ISODate } from '../data/types';

// Date « aujourd'hui » de l'application : la vraie date (heure de Paris) sur la plateforme partagée ;
// une date fixe en démo et dans les tests (données de démonstration datées autour de cette date).
const DEMO_TODAY: ISODate = '2026-11-14';
const shared = !!(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY);
export const TODAY: ISODate = shared ? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) : DEMO_TODAY;

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2Fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('fr-FR');

export const eur = (n: number) => eurFmt.format(n);
export const eur2 = (n: number) => eur2Fmt.format(n);
/** Montant dans sa devise, sans conversion : « 30,50 USD », « 6,83 € » (jusqu'à 4 décimales) */
export const money = (n: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, currencyDisplay: currency === 'EUR' ? 'symbol' : 'code', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
export const num = (n: number) => numFmt.format(Math.round(n));
export const dec = (n: number, d = 1) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
export const m3 = (n: number) => `${dec(n, 1)} m³`;
export const pct = (n: number) => `${Math.round(n * 100)} %`;

export function parse(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000);
}

/** Semaine ISO 8601 : { year, week } */
export function isoWeek(d: ISODate): { year: number; week: number } {
  const date = parse(d);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export const weekLabel = (d: ISODate) => `S${String(isoWeek(d).week).padStart(2, '0')}`;
export const weekKey = (d: ISODate) => {
  const w = isoWeek(d);
  return `${w.year}-${String(w.week).padStart(2, '0')}`;
};

/** Lundi de la semaine ISO de la date */
export function weekStart(d: ISODate): ISODate {
  const x = parse(d);
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - day + 1);
  return toISO(x);
}

const shortMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const longMonths = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function fdate(d?: ISODate): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function fshort(d?: ISODate): string {
  if (!d) return '—';
  const x = parse(d);
  return `${x.getUTCDate()} ${shortMonths[x.getUTCMonth()]}`;
}

export function weekRange(d: ISODate): string {
  const start = weekStart(d);
  const end = addDays(start, 6);
  const s = parse(start);
  const e = parse(end);
  const sm = s.getUTCMonth() === e.getUTCMonth() ? '' : ` ${shortMonths[s.getUTCMonth()]}`;
  return `${s.getUTCDate()}${sm} – ${e.getUTCDate()} ${shortMonths[e.getUTCMonth()]} ${e.getUTCFullYear()}`;
}

export const monthKey = (d: ISODate) => d.slice(0, 7);
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${longMonths[m - 1]} ${y}`;
}
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toISO(d).slice(0, 7);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** « 12 nov. à 10:15 » depuis un horodatage ISO « 2026-11-12T10:15 » */
export function fstamp(stamp?: string): string {
  if (!stamp) return '—';
  const [d, t] = stamp.split('T');
  return t ? `${fshort(d)} à ${t.slice(0, 5)}` : fshort(d);
}
