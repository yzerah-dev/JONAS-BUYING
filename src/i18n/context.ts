import { createContext, useContext } from 'react';
import { DATA_EN, LANGS, en, fr, type Key, type Lang } from './dict';
import { DATA_ZH, zh } from './zh';
import { FMT, type Fmt } from './format';

export type Vars = Record<string, string | number>;

export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Texte d'interface traduit ; {var} remplacés par vars */
  t: (key: Key, vars?: Vars) => string;
  /** Valeur issue des données (français) traduite si connue */
  td: (value: string) => string;
  /** Formats de dates / nombres de la langue */
  fmt: Fmt;
}

export const LANG_STORAGE_KEY = 'jonas-buying-lang';
const DICTS: Record<Lang, Record<Key, string>> = { fr, en, zh };
const DATA: Record<Lang, Record<string, string>> = { fr: {}, en: DATA_EN, zh: DATA_ZH };

export function makeI18n(lang: Lang, setLang: (l: Lang) => void): I18n {
  const dict = DICTS[lang];
  return {
    lang,
    setLang,
    t: (key, vars) => {
      const s = dict[key] ?? fr[key] ?? key;
      return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
    },
    td: (value) => DATA[lang][value] ?? value,
    fmt: FMT[lang],
  };
}

/** Hors du portail (aucun fournisseur de langue) : l'application reste en français. */
const FRENCH = makeI18n('fr', () => {});

export const I18nContext = createContext<I18n | null>(null);

export function useT(): I18n {
  return useContext(I18nContext) ?? FRENCH;
}

export function readStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return LANGS.includes(v as Lang) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

export function storeLang(l: Lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, l);
  } catch {
    /* stockage indisponible : la langue vaut pour la session */
  }
}
