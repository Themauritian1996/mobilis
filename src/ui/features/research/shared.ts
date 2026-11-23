// Utilitaires communs des écrans du volet recherche : textes, style, base de données, contexte, petits gabarits.
import { getLang } from '../../../../www/js/i18n.js';
import { getRecordsDb } from '../../../services/db/records.ts';
import type { DatabasePort } from '../../../services/db/port.ts';
import type { MeasureDefinition } from '../../../core/types/clinical.ts';
import {
  CURVE_PREFIX,
  decodePhase,
  PAIN_METRIC_ID,
  todayIso,
  type RepoContext,
  type ScheduleStatus,
} from '../../../domains/research/index.ts';
import { TESTS as ROM_TESTS } from '../../../domains/outcomes/data/romtests.ts';
import { INSTRUMENTS } from '../../../domains/outcomes/data/proms.ts';
import { state, profile } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { makeT } from '../i18n.ts';
import { METRIC_LABELS, PHASE_LABELS, STRINGS } from './strings.ts';

export const t = makeT(STRINGS);
export { esc };

/** Texte bilingue → langue courante (repli : anglais pour les autres langues, français en français). */
export const bi = (x: { fr: string; en: string } | string | undefined | null): string =>
  !x ? '' : typeof x === 'string' ? x : getLang() === 'fr' ? x.fr : x.en;

/** Charge la feuille de style du volet une seule fois (ne modifie pas index.html). */
export function ensureCss(): void {
  if (typeof document === 'undefined' || document.getElementById('css-research')) return;
  const l = document.createElement('link');
  l.id = 'css-research';
  l.rel = 'stylesheet';
  l.href = 'css/research.css';
  document.head.appendChild(l);
}

export const db = (): DatabasePort => getRecordsDb();

export function newId(prefix: string): string {
  const c = globalThis.crypto;
  const r =
    c && 'randomUUID' in c ? c.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${r}`;
}

export const uid = (): string => state.user?.uid ?? 'local';
export const ctx = (): RepoContext => ({ uid: uid(), now: () => new Date(), newId });
export const today = (): string => todayIso();
export const role = (): string | undefined => profile()?.role;
export const isClinician = (): boolean => role() === 'clinician';

export const banner = (): string =>
  `<div class="banner rs-banner" role="note">${icon('shield', 18)}<div>${esc(t('rs_banner'))}</div></div>`;

export const topbar = (title: string, back: string): string =>
  `<div class="topbar"><button class="icon-btn" data-go="${esc(back)}" aria-label="${esc(t('rs_back'))}">${icon('back', 20)}</button><h1>${esc(title)}</h1></div>`;

export function fmtNum(x: number | null | undefined, d = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return (+x.toFixed(d)).toLocaleString(getLang() === 'fr' ? 'fr-CA' : 'en-CA');
}

export const digitsFor = (unit: string): number => (unit === 'm/s' || unit === 'm' || unit === 's' ? 2 : 1);

export function fmtDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    return d.toLocaleDateString(getLang() === 'fr' ? 'fr-CA' : 'en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export const statusChip = (s: ScheduleStatus): string => {
  const cls = s === 'done' ? 'pos' : s === 'overdue' ? 'neg' : s === 'due' || s === 'partial' ? 'warn' : '';
  return `<span class="chip sm ${cls}">${esc(t('rs_status_' + s))}</span>`;
};

export const sideLabel = (s: string | undefined): string =>
  s === 'left' ? t('rs_left') : s === 'right' ? t('rs_right') : '';

/** Description courte d'une mesure (type, métrique, phase, côté). */
export function describeMeasure(m: MeasureDefinition): string {
  const side = m.side === 'left' || m.side === 'right' ? ` · ${sideLabel(m.side)}` : '';
  const ph = decodePhase(m.phase);
  const phase = ph === null ? '' : typeof ph === 'number' ? ` · ${ph} %` : ` · ${bi(PHASE_LABELS[ph])}`;
  switch (m.kind) {
    case 'gait_metric_at_phase': {
      const id = m.metricId ?? '';
      const base = id.startsWith(CURVE_PREFIX) ? id.slice(CURVE_PREFIX.length) : id;
      return `${t('rs_kind_gait_metric_at_phase')} — ${bi(METRIC_LABELS[base]) || base}${phase}${side}`;
    }
    case 'gait_curve':
      return `${t('rs_kind_gait_curve')} — ${bi(METRIC_LABELS[m.metricId ?? '']) || m.metricId}${side}`;
    case 'rom':
      return `${t('rs_kind_rom')} — ${bi(ROM_TESTS[m.metricId ?? '']?.name) || m.metricId}${side}`;
    case 'prom':
      return m.metricId === PAIN_METRIC_ID ? t('rs_kind_pain') : `${t('rs_kind_prom')} — ${promName(m.metricId ?? '')}`;
    case 'custom_angle':
      return `${t('rs_kind_custom_angle')} — ${(m.landmarks ?? []).join('-')}${phase}${side}`;
  }
}

export function promName(id: string): string {
  const d = INSTRUMENTS[id];
  if (!d) return id;
  return typeof d.name === 'string' ? d.name : bi(d.name);
}

/** Message d'erreur lisible. */
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
