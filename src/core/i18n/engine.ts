// Moteur de traduction (langue courante, paquets de langue, pluriels). Textes : messages.fr-en.ts ; paquets es / pt / ar / zh :
// www/js/lang/<code>.js, générés par scripts/build-lang.mjs ({ ui: { clé: texte }, text: { "texte anglais du contenu": traduction } }).
// Ce module détient l'état (langue courante) : un seul exemplaire doit être chargé (chemins legacy partout ailleurs).
import type { LangCode } from '../types/common.ts';
import { CUES, D } from './messages.fr-en.ts';

export { CUES };

export interface LangInfo {
  readonly id: LangCode;
  readonly name: string;
  readonly locale: string;
  readonly voice: readonly string[];
  readonly label: string;
  readonly rtl?: boolean;
}

export const LANGS: readonly LangInfo[] = [
  { id: 'fr', name: 'Français', locale: 'fr-CA', voice: ['fr-CA', 'fr-FR', 'fr'], label: 'French (Canada)' },
  { id: 'en', name: 'English', locale: 'en-CA', voice: ['en-CA', 'en-US', 'en-GB', 'en'], label: 'English' },
  {
    id: 'es',
    name: 'Español',
    locale: 'es-MX',
    voice: ['es-MX', 'es-US', 'es-419', 'es-ES', 'es'],
    label: 'Spanish (Latin America)',
  },
  { id: 'pt', name: 'Português', locale: 'pt-BR', voice: ['pt-BR', 'pt-PT', 'pt'], label: 'Portuguese (Brazil)' },
  {
    id: 'ar',
    name: 'العربية',
    locale: 'ar-u-nu-latn',
    voice: ['ar-SA', 'ar-EG', 'ar-MA', 'ar'],
    label: 'Arabic (Modern Standard)',
    rtl: true,
  },
  { id: 'zh', name: '中文', locale: 'zh-CN', voice: ['zh-CN', 'cmn-CN', 'zh'], label: 'Simplified Chinese (Mandarin)' },
];

/** Paquet de langue généré : interface + contenu (clé = texte anglais). */
interface LangPack {
  readonly ui: Readonly<Record<string, string>>;
  readonly text: Readonly<Record<string, string>>;
}

/** Contenu bilingue { fr, en } (chaînes ou listes) ; les autres langues viennent des paquets. */
export type Localized<T> = Readonly<Partial<Record<LangCode, T>>>;

const IDS: readonly string[] = LANGS.map((l) => l.id);
const isId = (s: string): s is LangCode => IDS.includes(s);
const FIRST = LANGS[0] as LangInfo;

let lang: LangCode = 'fr';
let pack: LangPack | null = null; // paquet de la langue courante (hors FR/EN)
try {
  const stored = localStorage.getItem('mobilis.lang') || (navigator.language || 'fr').slice(0, 2);
  if (isId(stored)) lang = stored;
} catch {
  /* stockage ou navigateur indisponible : français */
}

export const getLang = (): LangCode => lang;
export const langInfo = (id: string = lang): LangInfo => LANGS.find((l) => l.id === id) || FIRST;
export const locale = (): string => langInfo().locale;
// Langue du coach IA (texte + voix) : « auto » = langue de l'app, sinon une des langues offertes (ex. app en français, coach en anglais)
export const getAiLang = (): LangCode => {
  let a = 'auto';
  try {
    a = localStorage.getItem('mobilis.aiLang') || 'auto';
  } catch {
    /* stockage indisponible : auto */
  }
  return isId(a) ? a : lang;
};
export const setAiLang = (a: string): void => {
  try {
    localStorage.setItem('mobilis.aiLang', IDS.includes(a) ? a : 'auto');
  } catch {
    /* stockage indisponible : ignoré */
  }
};
export const aiLangInfo = (): LangInfo => langInfo(getAiLang());
export const isLang = (id: string): boolean => IDS.includes(id);

const packs: Partial<Record<string, LangPack>> = {};
async function loadPack(id: LangCode): Promise<LangPack | null> {
  if (id === 'fr' || id === 'en') return null;
  let p = packs[id];
  if (!p) {
    p = ((await import(`../../../www/js/lang/${id}.js`)) as { default: LangPack }).default;
    packs[id] = p;
  }
  return p;
}
// Change la langue (charge le paquet si besoin). À attendre avant d'afficher.
export async function setLang(l: string): Promise<void> {
  let id: LangCode = isId(l) ? l : 'fr';
  try {
    pack = await loadPack(id);
  } catch (e) {
    console.warn('lang', e);
    pack = null;
    id = 'en';
  }
  lang = id;
  try {
    localStorage.setItem('mobilis.lang', id);
  } catch {
    /* stockage indisponible : ignoré */
  }
  document.documentElement.lang = id;
  document.documentElement.dir = langInfo(id).rtl ? 'rtl' : 'ltr';
}

const xl = (s: string): string => (pack && pack.text[s]) ?? s;

// Contenu bilingue { fr, en } (chaînes ou listes) -> langue courante
export function tr(o: null | undefined): '';
export function tr(o: string | Localized<string> | null | undefined): string;
export function tr(o: Localized<readonly string[]>): string[];
export function tr(o: unknown): string | string[] {
  if (o === undefined || o === null) return '';
  if (typeof o === 'string') return o;
  const m = o as Localized<string | string[]>;
  if (lang === 'fr') return (m.fr ?? m.en) as string | string[];
  if (lang === 'en' || (m[lang] !== undefined && m[lang] !== null))
    return (m[lang] ?? m.en ?? m.fr) as string | string[];
  const en = m.en ?? m.fr;
  return Array.isArray(en) ? en.map(xl) : xl(en as string);
}

// Jours de la semaine (initiale), 0 = dimanche
export const dowNarrow = (): string[] => {
  const f = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  return [0, 1, 2, 3, 4, 5, 6].map((d) => f.format(new Date(2026, 0, 4 + d)));
};

export function t(key: string, vars?: Readonly<Record<string, unknown>>): string {
  let s: string =
    (lang === 'fr' || lang === 'en' ? D[lang][key] : pack?.ui[key]) ??
    D[lang === 'fr' ? 'fr' : 'en'][key] ??
    D.fr[key] ??
    key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k] as string);
  return s;
}

/** Pluriel : choisit `clé_one` ou `clé_other` selon Intl.PluralRules de la langue de l'app ({n} injecté ; repli sur la clé seule). */
let _pr: Intl.PluralRules | null = null;
let _prLoc = '';
export function plural(n: number | string): Intl.LDMLPluralRule {
  const loc = locale();
  try {
    if (!_pr || _prLoc !== loc) {
      _pr = new Intl.PluralRules(loc);
      _prLoc = loc;
    }
    return _pr.select(+n || 0);
  } catch {
    return +n === 1 ? 'one' : 'other';
  }
}
export function tp(key: string, n: number | string, vars?: Readonly<Record<string, unknown>>): string {
  const k = key + (plural(n) === 'one' ? '_one' : '_other');
  return t(t(k) === k ? key : k, { n, ...vars });
}
// Pour les paquets de langue : toutes les clés de l'interface (anglais)
export const UI_EN = D.en;
