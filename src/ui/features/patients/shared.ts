// Aides communes aux écrans du dossier patient : feuille de style, base, compte, formats.
import { getLang } from '../../../../www/js/i18n.js';
import type { CollectionName, Patient } from '../../../core/types/clinical.ts';
import { getRecordsDb } from '../../../services/db/records.ts';
import { accountRecords } from '../../../services/db/records-install.ts';
import type { ShareState } from '../../../services/db/sync/records-sync.ts';
import { profile, state } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { tp } from './strings.ts';

let cssLoaded = false;
/** Charge www/css/patients.css au premier rendu (un seul <link>). */
export function ensureCss(): void {
  if (cssLoaded || typeof document === 'undefined') return;
  if (!document.querySelector('link[data-patients-css]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'css/patients.css';
    l.dataset['patientsCss'] = '1';
    document.head.appendChild(l);
  }
  cssLoaded = true;
}

export const db = () => getRecordsDb();
export const role = (): string | undefined => profile()?.role;
/** uid propriétaire des documents écrits par ce compte (même règle que la base synchronisée). */
export const myUid = (): string => {
  const r = accountRecords();
  if (r) return r.current().uid;
  const u = state.user;
  return u ? (u.local ? 'local' : u.uid) : 'anon';
};
export const isOnlineAccount = (): boolean => !!state.user && !state.user.local;
export const nowIso = (): string => new Date().toISOString();

export const shareState = (col: CollectionName, id: string): ShareState =>
  accountRecords()?.shareState(col, id) ?? 'none';
export const isForeign = (col: CollectionName, id: string): boolean => accountRecords()?.isForeign(col, id) ?? false;

/** Synchronise en arrière-plan puis appelle `after` si quelque chose a changé. */
export function syncThen(after: () => void): void {
  const r = accountRecords();
  if (!r) return;
  void r.sync().then((rep) => {
    if (rep.ok && rep.pulled + rep.created + rep.removed > 0) after();
  });
}

export const locale = (): string => (getLang() === 'en' ? 'en-CA' : 'fr-CA');
export const fmtDate = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00' : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
};

export const bannerHtml = (): string =>
  `<p class="pt-banner small" role="note">${icon('shield', 16)} ${esc(tp('banner'))}</p>`;

export const topbar = (title: string, backHash: string): string =>
  `<div class="topbar"><button class="icon-btn" data-go="${esc(backHash)}" aria-label="${esc(tp('back'))}">${icon('back', 20)}</button><h1>${esc(title)}</h1></div>`;

export function patientSubtitle(p: Patient): string {
  const parts: string[] = [];
  if (p.birthYear) parts.push(`${p.birthYear} · ${tp('ageYears', { n: new Date().getFullYear() - p.birthYear })}`);
  if (p.sex && p.sex !== 'unspecified') parts.push(tp(`sex_${p.sex}`));
  if (p.heightCm) parts.push(`${p.heightCm} cm`);
  if (p.affectedSide && p.affectedSide !== 'none') parts.push(`${tp('side')} : ${tp(`side_${p.affectedSide}`)}`);
  if (p.prosthesis) parts.push(`${tp(`level_${p.prosthesis.level}`)} ${tp(`side_${p.prosthesis.side}`).toLowerCase()}`);
  return parts.join(' · ');
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
