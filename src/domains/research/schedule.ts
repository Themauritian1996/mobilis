/**
 * Calendrier des échéances d'un suivi post-intervention (spec v2 §10.8) — fonctions pures.
 *
 * Fenêtre de tolérance d'une échéance (proposition, à valider par le clinicien) : la mesure peut être faite à partir de
 * `due − tol` et reste « à faire » jusqu'à `due + tol` ; au-delà elle est « en retard ». `tol` = 15 % du délai depuis
 * T0, borné à 2–14 jours ; T0 : de J−3 à J+3 (mesure de base avant ou juste après l'intervention).
 */
import type { FollowUp, MeasureDefinition, Timepoint } from '../../core/types/clinical.ts';
import type { IsoDate } from '../../core/types/common.ts';

const DAY = 86_400_000;
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(d: string): number {
  const m = RE.exec(d);
  if (!m) throw new RangeError(`Date ISO invalide : ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const formatIsoDate = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10) as IsoDate;

/** Date du jour (fuseau local) au format ISO. */
export function todayIso(now: Date = new Date()): IsoDate {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` as IsoDate;
}

export const addDays = (d: string, n: number): IsoDate => formatIsoDate(parseIsoDate(d) + n * DAY);
export const daysBetween = (a: string, b: string): number => Math.round((parseIsoDate(b) - parseIsoDate(a)) / DAY);

/** Tolérance (jours) autour d'une échéance. */
export function toleranceDays(offsetDays: number): number {
  if (offsetDays === 0) return 3;
  return Math.max(2, Math.min(14, Math.round(Math.abs(offsetDays) * 0.15)));
}

export type ScheduleStatus = 'done' | 'partial' | 'due' | 'overdue' | 'upcoming';

export interface ScheduleItem {
  readonly timepoint: Timepoint;
  readonly dueDate: IsoDate;
  readonly windowStart: IsoDate;
  readonly windowEnd: IsoDate;
  readonly status: ScheduleStatus;
  /** Jours entre aujourd'hui et l'échéance (négatif = passée). */
  readonly daysUntil: number;
  /** Mesures déjà faites / à faire à ce point dans le temps. */
  readonly doneMeasureIds: readonly string[];
  readonly pendingMeasures: readonly MeasureDefinition[];
}

export interface ScheduleOptions {
  /** Mesures faites par point dans le temps (timepointId → ids de mesure). Absent : `done[tp]` non vide = tout fait. */
  readonly completed?: Readonly<Record<string, readonly string[]>>;
}

/** Calendrier complet d'un suivi, trié par échéance. */
export function followUpSchedule(
  fu: Pick<FollowUp, 'anchorDate' | 'timepoints' | 'measures' | 'done'>,
  today: string,
  opts: ScheduleOptions = {},
): ScheduleItem[] {
  return [...fu.timepoints]
    .sort((a, b) => a.offsetDays - b.offsetDays)
    .map((tp): ScheduleItem => {
      const dueDate = addDays(fu.anchorDate, tp.offsetDays);
      const tol = toleranceDays(tp.offsetDays);
      const windowStart = addDays(dueDate, -tol);
      const windowEnd = addDays(dueDate, tol);
      const doneIds = opts.completed
        ? [...(opts.completed[tp.id] ?? [])]
        : (fu.done[tp.id]?.length ?? 0) > 0
          ? fu.measures.map((m) => m.id)
          : [];
      const pending = fu.measures.filter((m) => !doneIds.includes(m.id));
      let status: ScheduleStatus;
      if (fu.measures.length > 0 && pending.length === 0) status = 'done';
      else if (daysBetween(today, windowStart) > 0) status = 'upcoming';
      else if (daysBetween(windowEnd, today) > 0) status = doneIds.length ? 'partial' : 'overdue';
      else status = doneIds.length ? 'partial' : 'due';
      return {
        timepoint: tp,
        dueDate,
        windowStart,
        windowEnd,
        status,
        daysUntil: daysBetween(today, dueDate),
        doneMeasureIds: doneIds,
        pendingMeasures: pending,
      };
    });
}

/** Point dans le temps auquel rattacher une mesure faite à `date` (fenêtre qui la contient, sinon le plus proche). */
export function timepointForDate(
  fu: Pick<FollowUp, 'anchorDate' | 'timepoints'>,
  date: string,
  { strict = true }: { strict?: boolean } = {},
): Timepoint | null {
  let best: { tp: Timepoint; d: number } | null = null;
  for (const tp of fu.timepoints) {
    const due = addDays(fu.anchorDate, tp.offsetDays);
    const d = Math.abs(daysBetween(due, date));
    if (strict && d > toleranceDays(tp.offsetDays)) continue;
    if (!best || d < best.d) best = { tp, d };
  }
  return best?.tp ?? null;
}

export interface ReminderSummary {
  readonly due: number;
  readonly overdue: number;
  /** Prochaine échéance à venir (ou à faire), s'il y en a une. */
  readonly next: { readonly followUpId: string; readonly item: ScheduleItem } | null;
}

/** Résumé pour le rappel de l'accueil : nombre d'échéances à faire / en retard, prochaine échéance. */
export function reminderSummary(
  followups: readonly (Pick<FollowUp, 'id' | 'anchorDate' | 'timepoints' | 'measures' | 'done'> & {
    readonly completed?: Readonly<Record<string, readonly string[]>>;
  })[],
  today: string,
): ReminderSummary {
  let due = 0;
  let overdue = 0;
  let next: ReminderSummary['next'] = null;
  for (const fu of followups) {
    const items = followUpSchedule(fu, today, fu.completed ? { completed: fu.completed } : {});
    for (const it of items) {
      if (it.status === 'due' || it.status === 'partial') due++;
      if (it.status === 'overdue') overdue++;
      if (it.status !== 'done' && (!next || it.dueDate < next.item.dueDate)) next = { followUpId: fu.id, item: it };
    }
  }
  return { due, overdue, next };
}
