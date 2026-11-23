// Textes bilingues { fr, en } des catalogues legacy (lus en `unknown`) → langue courante.
import { tr as coreTr } from '../../../www/js/i18n.js';
import type { Localized } from '../../core/i18n/engine.ts';

/** Texte localisé (chaîne ou { fr, en }) → chaîne dans la langue courante. */
export const tr = (o: unknown): string => coreTr(o as string | Localized<string> | null | undefined);
/** Liste localisée ({ fr: [...], en: [...] }) → liste dans la langue courante. */
export const trList = (o: unknown): string[] => coreTr(o as Localized<readonly string[]>);
