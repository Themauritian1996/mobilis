/**
 * Contrat i18n du nouveau code. L'implémentation reste celle de v1.15 (www/js/i18n.js + i18n-src/ + scripts/build-lang.mjs)
 * jusqu'à sa migration ; le nouveau code ne dépend que de cette interface.
 */
import type { LangCode } from './types/common.ts';

export const LANGS: readonly LangCode[] = ['fr', 'en', 'es', 'pt', 'ar', 'zh'];
export const RTL_LANGS: ReadonlySet<LangCode> = new Set<LangCode>(['ar']);

export interface Translator {
  readonly lang: LangCode;
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
}

export const isLangCode = (s: string): s is LangCode => (LANGS as readonly string[]).includes(s);
