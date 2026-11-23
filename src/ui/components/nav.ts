// Barre de navigation et thème (reprise de www/js/ui.js).
import { t } from '../../../www/js/i18n.js';
import * as store from '../../../www/js/store.js';
import { icon, IC } from './icons.ts';

export function nav(active: string, role?: string): string {
  const b = (id: string, ic: string, label: string): string =>
    `<button data-go="#/${id}" class="${active === id ? 'on' : ''}" aria-current="${active === id ? 'page' : 'false'}">${icon(ic, 22)}<span>${label}</span></button>`;
  const brand = `<div class="brand">${icon('logo', 30)} Mobilis</div>`;
  if (role === 'clinician') {
    return `<nav class="nav" aria-label="Navigation"><div class="inner">${brand}${b('clinic', 'stetho', t('patients'))}${b('library', 'book', t('library'))}
      <button class="fab" data-go="#/clinic/new" aria-label="${t('newRx')}">${icon('plus', 22)}<span hidden>${t('newRx')}</span></button>${b('home', 'play', t('testNav'))}${b('profile', 'user', t('profile'))}</div></nav>`;
  }
  return `<nav class="nav" aria-label="Navigation"><div class="inner">${brand}${b('home', 'home', t('home'))}${b('calendar', 'cal', t('calendar'))}
    <button class="fab" data-act="quickstart" aria-label="${t('startSession')}">${IC['play']}<span hidden>${t('startSession')}</span></button>${b('progress', 'chart', t('progress'))}${b('profile', 'user', t('profile'))}</div></nav>`;
}

export function applyTheme(): void {
  const th = store.settings().theme;
  if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
  else document.documentElement.removeAttribute('data-theme');
  const dark = th === 'dark' || (th !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b111b' : '#f3f5f8');
  // Taille du texte (100 / 115 / 130 %) et contraste élevé
  const st = store.settings();
  const de = document.documentElement;
  if ([115, 130].includes(+st.textSize)) de.setAttribute('data-text-size', String(st.textSize));
  else de.removeAttribute('data-text-size');
  if (st.contrast) de.setAttribute('data-contrast', 'high');
  else de.removeAttribute('data-contrast');
}
