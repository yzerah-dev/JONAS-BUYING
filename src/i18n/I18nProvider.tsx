import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nContext, makeI18n, readStoredLang, storeLang, useT } from './context';
import { LANGS, type Lang } from './dict';

/** Langue de l'interface, mémorisée par visiteur (localStorage). */
export function I18nProvider({ children, defaultLang = 'en' }: { children: ReactNode; defaultLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang() ?? defaultLang);
  const value = useMemo(
    () =>
      makeI18n(lang, (l) => {
        storeLang(l);
        setLangState(l);
      }),
    [lang],
  );
  // Attribut lang du document pendant l'affichage du portail ; restauré en sortie
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.lang;
    html.lang = lang;
    return () => {
      html.lang = prev;
    };
  }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Bascule compacte FR | EN */
export function LangToggle() {
  const { lang, setLang, t } = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button key={l} type="button" className={l === lang ? 'active' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
