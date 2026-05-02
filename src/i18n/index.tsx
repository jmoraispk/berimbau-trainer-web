import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en, type Messages, type MessageKey } from './messages.en';
import { pt } from './messages.pt';
import type { ToqueName } from '@/engine/rhythms';

/**
 * Tiny custom i18n: two languages, ~200 strings, runtime fallback to
 * English when a key is missing. No dependencies — react-i18next would
 * be overkill here. Keys live in messages.en.ts (source of truth);
 * messages.pt.ts must conform to the same shape (compile-time check via
 * `Messages` type).
 *
 * Interpolation: t('key', { name: 'João' }) replaces `{name}` in the
 * template. Missing variables leave the placeholder intact for
 * visibility during development.
 */

export type Lang = 'en' | 'pt';

const DICTS: Record<Lang, Messages> = { en, pt };
const STORAGE_KEY = 'berimbau:lang';

export type Vars = Record<string, string | number>;

export type TFn = <K extends MessageKey>(key: K, vars?: Vars) => string;

/**
 * Relative-time formatter that picks the right translated phrasing for
 * the current language. Used by Home / Stats / Settings.
 */
export function formatRelativeTime(t: TFn, ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return t('time.just_now');
  const m = Math.round(s / 60);
  if (m < 60) return t('time.minutes_ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('time.hours_ago', { n: h });
  const d = Math.round(h / 24);
  return t('time.days_ago', { n: d });
}

/** Map a ToqueName onto its description message-key. */
export function toqueDescKey(name: ToqueName): MessageKey {
  switch (name) {
    case 'São Bento Pequeno': return 'toque.desc.sao_bento_pequeno';
    case 'Angola': return 'toque.desc.angola';
    case 'São Bento Grande de Angola': return 'toque.desc.sao_bento_grande_de_angola';
    case 'Benguela': return 'toque.desc.benguela';
    case 'São Bento Grande (Regional)': return 'toque.desc.sao_bento_grande_regional';
    case 'Iuna': return 'toque.desc.iuna';
    case 'Cavalaria': return 'toque.desc.cavalaria';
    case 'Viradas': return 'toque.desc.viradas';
  }
}

/** Map a Difficulty value onto its label key. */
export function difficultyLabelKey(d: 'easy' | 'intermediate' | 'advanced' | 'very_advanced'): MessageKey {
  return `difficulty.${d}` as MessageKey;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: <K extends MessageKey>(key: K, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function pickInitialLang(): Lang {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'pt') return stored;
  }
  if (typeof navigator !== 'undefined') {
    const tag = navigator.language?.toLowerCase() ?? 'en';
    if (tag.startsWith('pt')) return 'pt';
  }
  return 'en';
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? `{${key}}` : String(v);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(pickInitialLang);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — ignore */
    }
  }, []);

  const t = useCallback(
    <K extends MessageKey>(key: K, vars?: Vars): string => {
      const template = DICTS[lang][key] ?? DICTS.en[key];
      return interpolate(template, vars);
    },
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n called outside I18nProvider');
  return ctx;
}

/**
 * Compact two-state toggle. Whatever language is currently active stays
 * muted; the *other* language is the call-to-action so it's always
 * clear what tapping does. No flags — language names are the point.
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const next: Lang = lang === 'en' ? 'pt' : 'en';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      className={`inline-flex items-center gap-1 px-2.5 h-9 rounded-full bg-bg-elev/80 border border-border text-text-dim hover:text-text hover:border-border-strong transition text-[11px] font-mono tracking-wider ${className}`}
      title={t('lang.toggle_label')}
      aria-label={t('lang.toggle_label')}
    >
      <span className={lang === 'en' ? 'text-text' : 'text-text-dim/60'}>EN</span>
      <span className="text-text-dim/40">·</span>
      <span className={lang === 'pt' ? 'text-text' : 'text-text-dim/60'}>PT</span>
    </button>
  );
}
