import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  LANGS,
  UI_EN,
  aiLangInfo,
  dowNarrow,
  getAiLang,
  getLang,
  isLang,
  langInfo,
  locale,
  plural,
  setLang,
  t,
  tp,
  tr,
} from './engine.ts';

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: {} });
});

describe('moteur i18n', () => {
  it('langues offertes et informations', () => {
    expect(LANGS.map((l) => l.id)).toEqual(['fr', 'en', 'es', 'pt', 'ar', 'zh']);
    expect(isLang('pt')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(langInfo('ar').rtl).toBe(true);
    expect(langInfo('inconnue').id).toBe('fr');
  });

  it('français : texte, variables, repli sur la clé', async () => {
    await setLang('fr');
    expect(getLang()).toBe('fr');
    expect(locale()).toBe('fr-CA');
    expect(t('ok')).toBe(UI_EN['ok']);
    expect(t('clé-inexistante')).toBe('clé-inexistante');
    expect(t('nEx_one', { n: 1 })).toBe('1 exercice');
    expect(tr({ fr: 'bonjour', en: 'hello' })).toBe('bonjour');
    expect(tr(null)).toBe('');
    expect(tr('texte')).toBe('texte');
    expect(tr({ fr: ['a', 'b'], en: ['c'] })).toEqual(['a', 'b']);
  });

  it('anglais : contenu bilingue et pluriels', async () => {
    await setLang('en');
    expect(tr({ fr: 'bonjour', en: 'hello' })).toBe('hello');
    expect(tp('nEx', 1)).toBe('1 exercise');
    expect(tp('nEx', 3)).toBe('3 exercises');
    expect(plural(1)).toBe('one');
    expect(plural(2)).toBe('other');
    expect(dowNarrow()).toHaveLength(7);
  });

  it('langue inconnue → français ; langue du coach « auto » = langue de l’app', async () => {
    await setLang('xx');
    expect(getLang()).toBe('fr');
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    expect(getAiLang()).toBe('fr');
    expect(aiLangInfo().label).toBe('French (Canada)');
    vi.unstubAllGlobals();
  });
});
