/**
 * Textes des nouveaux volets : chaque volet garde ses chaînes dans src/ui/features/<volet>/strings.ts
 * ({ cle: { fr, en, es?, pt?, ar?, zh? } }) pour éviter les conflits dans i18n-src/. La traduction des
 * autres langues est ajoutée plus tard dans ces mêmes fichiers. Repli : langue courante → en → fr.
 */
import { getLang } from '../../../www/js/i18n.js';

export interface FeatureText {
  fr: string;
  en: string;
  es?: string;
  pt?: string;
  ar?: string;
  zh?: string;
}
export type FeatureStrings = Readonly<Record<string, FeatureText>>;

/** Crée la fonction de traduction d'un volet ; `{nom}` est remplacé par vars.nom. */
export function makeT(strings: FeatureStrings) {
  return (key: string, vars: Readonly<Record<string, string | number>> = {}): string => {
    const entry = strings[key];
    if (!entry) return key;
    const lang = getLang() as keyof FeatureText;
    const raw = entry[lang] ?? entry.en ?? entry.fr;
    return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  };
}
