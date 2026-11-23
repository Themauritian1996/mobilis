/**
 * Volet « marche » — éléments d'interface partagés par la capture, les résultats et la comparaison :
 * traduction (`makeT`), chargement paresseux de gait.css, bandeau d'avertissement, libellés, puces d'état.
 */
import type { GaitView, HealthStatus, Side } from '../../../domains/gait/index.ts';
import { getLang, locale } from '../../../core/i18n/engine.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { makeT } from '../i18n.ts';
import { STRINGS } from './strings.ts';
import { citation, statusClass } from './present.ts';

export const t = makeT(STRINGS);
export const langId = (): string => getLang();
export const loc = (): string => locale();

let cssDone = false;
/** Ajoute `css/gait.css` au premier rendu (le HTML de l'application n'est pas modifié). */
export function ensureCss(): void {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  if (document.querySelector('link[data-gait-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'css/gait.css';
  l.dataset['gaitCss'] = '1';
  document.head.appendChild(l);
}

/** Bandeau du volet (sécurité clinique). */
export const banner = (): string => `<p class="gc-banner" role="note">${icon('shield', 16)} <span>${esc(t('banner'))}</span></p>`;

export const spinner = (msg: string): string =>
  `<section class="screen gc-screen"><div class="gc-loading" role="status"><div class="spinner" aria-hidden="true"></div>${esc(msg)}</div></section>`;

export const errorCard = (title: string, text: string, back = '#/patients'): string =>
  `<section class="screen gc-screen"><div class="topbar"><button class="icon-btn" data-go="${esc(back)}" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(title)}</h1></div>${banner()}<div class="card" role="alert"><p>${esc(text)}</p></div></section>`;

export const sideLabel = (s: Side | null | undefined): string => (s === 'L' ? t('side_left') : s === 'R' ? t('side_right') : '');
export const viewLabel = (v: GaitView): string => t(`view_${v}`);

/** Libellé d'une métrique : chaîne `m_<id>` ou, à défaut, l'identifiant lisible. */
export function metricLabel(id: string): string {
  const k = `m_${id}`;
  const s = t(k);
  return s === k ? id.replace(/_/g, ' ') : s;
}

export const statusLabel = (s: HealthStatus): string => t(`st_${s}`);

/** Puce d'état d'un déterminant ou d'un indicateur : couleur + symbole + texte (jamais la couleur seule). */
export function statusChip(s: HealthStatus): string {
  const sym = s === 'affected' ? '✗' : s === 'preserved' ? '✓' : '?';
  return `<span class="chip ${statusClass(s)} gc-status"><span aria-hidden="true">${sym}</span> ${esc(statusLabel(s))}</span>`;
}

export const estimateTag = (): string => `<span class="gc-est" title="${esc(t('est_hint'))}">${esc(t('est_tag'))}</span>`;

/** Références du moteur sous forme de liste (statut « à vérifier » signalé discrètement). */
export function refsHtml(ids: readonly string[]): string {
  if (!ids.length) return '';
  const items = [...new Set(ids)].map((id) => {
    const c = citation(id);
    const doi = c.doi ? ` <a href="https://doi.org/${esc(c.doi)}" rel="noopener" target="_blank">doi</a>` : '';
    return `<li>${esc(c.text)}${doi}${c.toVerify ? ` <span class="gc-tv">${esc(t('ref_toVerify'))}</span>` : ''}</li>`;
  });
  return `<ul class="gc-refs">${items.join('')}</ul>`;
}

export const suggestionNote = (): string => `<p class="gc-sugg-note small">${esc(t('sugg_note'))}</p>`;

export function confidenceChip(level: 'high' | 'medium' | 'low'): string {
  const cls = level === 'high' ? 'pos' : level === 'medium' ? 'warn' : 'neg';
  return `<span class="chip ${cls}">${esc(t(`conf_${level}`))}</span>`;
}

export const pct = (n: number): string => `${n} %`;
