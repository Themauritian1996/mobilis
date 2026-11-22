// Utilisation au long cours : fin de programme, semaine, jours d'entraînement, export agenda (.ics), historique et CSV.
// Fonctions pures (aucun accès au DOM ni au réseau) : testées dans tests/longterm.test.mjs et longterm.test.ts.
// Migration des anciens profils et sauvegarde / restauration (fichier JSON) : src/services/db/local/migrations.ts.
import * as P from './program.ts';
import type { Profile, Session, SessionItem } from './types.ts';

const DAY = 86400000;

// ---------- Fin de programme ----------
// Un programme (clinicien) est « terminé » après 12 semaines si la phase 3 est atteinte (ou fixée par le clinicien),
// ou à la fin de la dernière phase d'un protocole à durée définie. Les exercices restent disponibles : seul un message s'affiche.
export const PROGRAM_DAYS = 84;
export function programEnded(profile: Profile | null | undefined, now: number = Date.now()): boolean {
  if (!profile?.pathology || profile.role === 'clinician') return false;
  const ps = P.protocolStatus(profile, now);
  if (ps) {
    const end = ps.phase?.weeks?.[1];
    return !!(ps.last && end !== undefined && end !== null && ps.weeksSince >= end);
  }
  if (!profile.rxCode && !profile.clinician) return false; // programme auto-évalué : pas de « renouvellement »
  const ref = profile.rxAt || profile.startDate || now;
  return (now - ref) / DAY >= PROGRAM_DAYS && ((profile.phase || 1) >= 3 || !!profile.lockPhase);
}

// ---------- Semaine (début lundi ou dimanche) ----------
interface WeekInfo {
  firstDay?: number;
}
type LocaleWithWeek = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };
// Réglage « auto » : première jour de la semaine de la langue (Intl) ; repli : dimanche en Amérique du Nord / Brésil / Mexique / Japon, lundi ailleurs.
export function localeWeekStart(loc = 'fr-CA'): number {
  try {
    const L = new Intl.Locale(loc) as LocaleWithWeek;
    const wi = typeof L.getWeekInfo === 'function' ? L.getWeekInfo() : L.weekInfo;
    if (wi && wi.firstDay) return wi.firstDay === 7 ? 0 : wi.firstDay === 1 ? 1 : wi.firstDay % 7;
    const region = (L.maximize().region || '').toUpperCase();
    return ['US', 'CA', 'MX', 'BR', 'JP', 'IL', 'SA', 'AU', 'KR', 'PH'].includes(region) ? 0 : 1;
  } catch {
    return 1;
  }
}
/** setting : 'auto' | 0 | 1 (0 = dimanche). → 0 | 1 */
export const weekStartFor = (setting: string | number | null | undefined, loc?: string): number =>
  setting === 0 || setting === 1 || setting === '0' || setting === '1' ? +setting : localeWeekStart(loc);
/** Ordre des jours (0 = dimanche) en commençant par `start`. */
export const weekOrder = (start: number): number[] => (start === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);

// ---------- Jours d'entraînement ----------
/** Retirer le dernier jour d'entraînement est refusé (un programme sans jour n'a pas de sens). */
export const canToggleDay = (days: readonly number[] | null | undefined, d: number): boolean =>
  !(Array.isArray(days) && days.length === 1 && days[0] === d);
export const toggleDay = (days: readonly number[], d: number): number[] =>
  (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort((a, b) => a - b);

// ---------- Rendez-vous ----------
/** Supprime UN seul élément (par position) sans toucher aux autres, même s'ils ont la même date et la même heure. */
export const removeAt = <T>(list: readonly T[] | null | undefined, i: number): T[] =>
  Array.isArray(list) ? list.filter((_, k) => k !== i) : [];

// ---------- Export agenda (.ics) ----------
const pad2 = (n: number): string => String(n).padStart(2, '0');
const icsDt = (d: Date): string =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
const icsEsc = (s: unknown): string =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, (c) => '\\' + c)
    .replace(/\r?\n/g, '\\n');
/** Premier jour (à partir d'aujourd'hui) dont le jour de la semaine est un jour d'entraînement, à l'heure du rappel. */
export function firstTrainingStart(
  days: readonly number[] | null | undefined,
  time: string | null | undefined = '18:00',
  now: Date = new Date(),
): Date {
  const [h, m] = String(time || '18:00')
    .split(':')
    .map(Number) as [number, number];
  const ds = days && days.length ? days : [1, 3, 5];
  for (let i = 0; i < 8; i++) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + i,
      Number.isFinite(h) ? h : 18,
      Number.isFinite(m) ? m : 0,
    );
    if (ds.includes(d.getDay())) return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
}
export interface IcsAppointment {
  date: string;
  time?: string | undefined;
  note?: string | undefined;
}
/** labels : { title, desc, appt } ; appts : [{ date, time, note }]. */
export function buildIcs({
  days,
  time = '18:00',
  appts = [],
  labels = {},
  now = new Date(),
}: {
  days?: readonly number[] | null | undefined;
  time?: string | undefined;
  appts?: readonly IcsAppointment[] | undefined;
  labels?: { title?: string | undefined; desc?: string | undefined; appt?: string | undefined } | undefined;
  now?: Date | undefined;
} = {}): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const by = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ds = days && days.length ? days : [1, 3, 5];
  const start = firstTrainingStart(ds, time, now),
    end = new Date(start.getTime() + 30 * 60000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mobilis//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:mobilis-plan-${stamp}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDt(start)}`,
    `DTEND:${icsDt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${ds.map((d) => by[d]).join(',')}`,
    `SUMMARY:${icsEsc(labels.title || 'Mobilis')}`,
    `DESCRIPTION:${icsEsc(labels.desc || '')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEsc(labels.title || 'Mobilis')}`,
    'END:VALARM',
    'END:VEVENT',
  ];
  appts.forEach((a, i) => {
    const s = new Date(`${a.date}T${a.time || '09:00'}`),
      e = new Date(s.getTime() + 45 * 60000);
    if (Number.isNaN(s.getTime())) return;
    lines.push(
      'BEGIN:VEVENT',
      `UID:mobilis-appt-${i}-${a.date}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDt(s)}`,
      `DTEND:${icsDt(e)}`,
      `SUMMARY:${icsEsc((labels.appt || 'Appointment') + (a.note ? ' — ' + a.note : ''))}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------- Historique : plage, modification, saisie manuelle ----------
export const RANGES = ['4w', '3m', 'all'];
/** Date de début (ms) d'une plage : '4w' = 28 jours, '3m' = 91 jours, 'all' = null. */
export const rangeCutoff = (range: string, now: number = Date.now()): number | null =>
  range === '4w' ? now - 28 * DAY : range === '3m' ? now - 91 * DAY : null;
export function inRange(ts: number, range: string, now: number = Date.now()): boolean {
  const c = rangeCutoff(range, now);
  return c === undefined || c === null || ts >= c;
}
/** Nombre de semaines de programme à afficher dans les graphiques d'une plage. */
export const rangeWeeks = (range: string): number => (range === '4w' ? 4 : range === '3m' ? 13 : Infinity);

const dayStart = (key: string): number => new Date(key + 'T12:00').getTime();
export interface ManualItem {
  id: string;
  level?: number | null | undefined;
  sets?: number | undefined;
  reps?: number | undefined;
  pain?: number | null | undefined;
  note?: string | undefined;
}
/** Séance saisie à la main (faite hors de l'app) à la date `day` (AAAA-MM-JJ). items : [{ id, level, sets, reps, pain, note }]. */
export function makeManualSession({
  day,
  items = [],
  now = Date.now(),
}: {
  day: string;
  items?: readonly ManualItem[] | undefined;
  now?: number | undefined;
}): Session {
  const ts = dayStart(day);
  return {
    id: 'm' + now.toString(36) + Math.floor(Math.random() * 1e4),
    date: ts,
    manual: true,
    checkin: null,
    items: items.map((i) => ({
      id: i.id,
      level: i.level ?? null,
      ts,
      pain: i.pain ?? null,
      difficulty: null,
      note: i.note || '',
      change: 0,
      manual: true,
      sets: Array.from({ length: Math.max(1, i.sets || 1) }, () => ({
        reps: i.reps ?? 0,
        full: i.reps ?? 0,
        manual: true,
      })),
    })),
  };
}
/** Validation de la date d'une séance manuelle : pas dans le futur, pas avant le début du programme. */
export function validPastDay(
  day: string | null | undefined,
  startTs?: number | null,
  now: number = Date.now(),
): 'format' | 'future' | 'before' | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return 'format';
  const d = dayStart(day as string);
  if (Number.isNaN(d)) return 'format';
  const todayK = P.todayKey(now);
  if ((day as string) > todayK) return 'future';
  if (startTs && (day as string) < P.todayKey(startTs)) return 'before';
  return null;
}
/** Applique les modifications d'une séance : nouvelle date, douleur / note par exercice, exercices retirés. */
export function editSession(
  s: Session,
  {
    day,
    items = {},
    remove = [],
  }: {
    day?: string | undefined;
    items?:
      Readonly<Record<number, { pain?: number | null | undefined; note?: string | undefined } | undefined>> | undefined;
    remove?: readonly number[] | undefined;
  } = {},
): Session {
  const out: Session = { ...s };
  if (day) {
    const cur = P.todayKey(s.date);
    if (day !== cur) {
      out.date = dayStart(day);
    }
  }
  out.items = (s.items || [])
    .map((it, k) => ({ it, k }))
    .filter(({ k }) => !remove.includes(k))
    .map(({ it, k }): SessionItem => {
      const e = items[k];
      return e
        ? {
            ...it,
            ...(e.pain !== undefined ? { pain: e.pain } : {}),
            ...(e.note !== undefined ? { note: e.note } : {}),
          }
        : it;
    });
  return out;
}
export const removeById = <T extends { id?: unknown }>(list: readonly T[] | null | undefined, id: unknown): T[] =>
  Array.isArray(list) ? list.filter((x) => x.id !== id) : [];
/** Entrée de journal / mesure / questionnaire : suppression ou modification par `ts`. */
export const removeByTs = <T extends { ts?: unknown }>(list: readonly T[] | null | undefined, ts: unknown): T[] =>
  Array.isArray(list) ? list.filter((x) => x.ts !== ts) : [];
export const patchByTs = <T extends { ts?: unknown }>(
  list: readonly T[] | null | undefined,
  ts: unknown,
  patch: Partial<T>,
): T[] => (Array.isArray(list) ? list.map((x) => (x.ts === ts ? { ...x, ...patch } : x)) : []);

// ---------- CSV : résumé d'un patient (clinicien) ----------
const csvCell = (v: unknown): string => {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** Résumé partagé par le patient (progressSummary + parties des modules), tel que lu par le clinicien. */
export interface PatientSummary {
  name?: string | undefined;
  week?: number | undefined;
  phase?: number | undefined;
  sessions7?: number | undefined;
  planned?: number | undefined;
  pain7?: number | null | undefined;
  quality7?: number | null | undefined;
  flare?: boolean | undefined;
  updated?: number | undefined;
  ex?: Readonly<
    Record<string, { level?: number; lastDifficulty?: number | null; lastPain?: number | null; trend?: string }>
  >;
  rom?: readonly {
    t: string;
    s?: string | undefined;
    l?: number | null;
    b?: number | null;
    g?: number | null;
    n?: number;
    ts?: number;
  }[];
  prom?: readonly { id: string; last?: number | null; delta?: number | null; n?: number }[];
  notes?: readonly { ex: string; text: string; date?: number; pain?: number | null }[];
  [key: string]: unknown;
}
/** summary = résumé partagé (fullSummary). nameOf(id) → libellé d'exercice. → texte CSV (UTF-8, séparateur virgule). */
export function patientCsv(
  p: PatientSummary,
  {
    nameOf = (x: string) => x,
    headers = ['section', 'item', 'value', 'detail'],
  }: { nameOf?: ((id: string) => string) | undefined; headers?: readonly string[] | undefined } = {},
): string {
  const rows: unknown[][] = [[...headers]];
  const add = (...r: unknown[]): void => void rows.push(r);
  const day = (ts: number | undefined): string => (ts ? P.todayKey(ts) : '');
  add('patient', 'name', p.name || '', '');
  add('patient', 'week', p.week, '');
  add('patient', 'phase', p.phase, '');
  add('week', 'sessions', p.sessions7, `planned ${p.planned}`);
  add('week', 'pain', p.pain7 ?? '', '/10');
  add('week', 'quality', p.quality7 ?? '', '%');
  add('week', 'flare', p.flare ? 1 : 0, '');
  add('patient', 'updated', day(p.updated), '');
  for (const [id, e] of Object.entries(p.ex || {}))
    add(
      'exercise',
      nameOf(id),
      e.level,
      `difficulty ${e.lastDifficulty ?? ''}; pain ${e.lastPain ?? ''}; trend ${e.trend || ''}`,
    );
  for (const r of p.rom || [])
    add(
      'rom',
      r.t + (r.s ? ' ' + r.s : ''),
      r.l ?? '',
      `baseline ${r.b ?? ''}; gain ${r.g ?? ''}; n ${r.n}; ${day(r.ts)}`,
    );
  for (const q of p.prom || []) add('prom', q.id, q.last ?? '', `delta ${q.delta ?? ''}; n ${q.n ?? ''}`);
  for (const n of p.notes || [])
    add(
      'comment',
      nameOf(n.ex),
      n.text,
      `${day(n.date)}${n.pain !== undefined && n.pain !== null ? '; pain ' + n.pain : ''}`,
    );
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
