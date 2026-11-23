// Aides communes aux écrans prothèse : feuille de style, accès aux données, en-têtes, références.
import { getLang } from '../../../../www/js/i18n.js';
import { reference } from '../../../domains/gait/index.ts';
import type { Lang } from '../../../domains/prosthetics/index.ts';
import { getRecordsDb } from '../../../services/db/records.ts';
import { icon } from '../../components/icons.ts';
import { esc } from '../../components/html.ts';
import { nav } from '../../components/nav.ts';
import { t } from './strings.ts';

export const lang = (): Lang => (getLang() === 'en' ? 'en' : 'fr');

let cssLoaded = false;
/** Charge www/css/prosthetics.css au premier rendu (un seul <link>). */
export function ensureCss(): void {
  if (cssLoaded || typeof document === 'undefined') return;
  if (!document.querySelector('link[data-prosthetics-css]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/prosthetics.css';
    l.dataset['prostheticsCss'] = '1';
    document.head.appendChild(l);
  }
  cssLoaded = true;
}

export const db = () => getRecordsDb();

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const topbar = (title: string, backHash: string): string =>
  `<div class="topbar no-print"><button class="icon-btn" data-go="${esc(backHash)}" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(title)}</h1></div>`;

export const bannerHtml = (): string => `<p class="pros-banner small muted" role="note">${esc(t('banner'))}</p>`;

export const screen = (inner: string): string =>
  `<section class="screen pros-screen">${bannerHtml()}${inner}</section>${nav('clinic', 'clinician')}`;

export const notice = (msg: string, hash = '#/patients', label = t('toPatients')): string =>
  `<div class="card muted"><p>${esc(msg)}</p><button class="btn ghost" data-go="${esc(hash)}">${esc(label)}</button></div>`;

/** « Auteurs (année). Titre. Revue » à partir de `references.json` ; l'identifiant brut si la référence est inconnue. */
export function refText(id: string): string {
  const r = reference(id);
  if (!r) return id;
  const parts = [r.authors, r.year ? `(${r.year})` : '', r.title ? `${r.title}.` : '', r.journal ?? ''].filter(Boolean);
  return `${parts.join(' ')}${r.status === 'to_verify' ? ' [à vérifier]' : ''}`;
}

export const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(lang() === 'en' ? 'en-CA' : 'fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};
