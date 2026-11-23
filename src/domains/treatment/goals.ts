/**
 * Suivi des objectifs au fil des évaluations : atteint / en progrès / non atteint, avec la marge d'erreur de mesure.
 * L'erreur vient du moteur de marche (`measurementError` : Stenum 2021, etc.) ; une différence inférieure à cette
 * erreur n'est jamais présentée comme un progrès ni comme un recul franc.
 */
import { measurementError } from '../gait/assess.ts';
import type { GaitMetric } from '../gait/types.ts';
import { metricIn } from './source.ts';
import type { PlanSource, Side, TreatmentGoal } from './types.ts';

export type GoalStatus = 'achieved' | 'in_progress' | 'not_achieved' | 'no_data';

export interface GoalPoint {
  readonly assessmentId: string;
  readonly performedAt: string;
  readonly value: number;
  readonly estimate: boolean;
}

export interface GoalProgress {
  readonly goalId: string;
  readonly status: GoalStatus;
  readonly points: readonly GoalPoint[];
  readonly baseline: number | null;
  readonly latest: number | null;
  /** Amélioration (vers la cible) entre la première et la dernière mesure ; négative = recul. */
  readonly improvement: number | null;
  /** Marge d'erreur de mesure (même unité) et sa source. */
  readonly error: number | null;
  readonly errorSource: string | null;
  /** Écart restant avec la cible (≥ 0 ; 0 = atteinte). */
  readonly remaining: number | null;
  /** Vrai si l'issue (atteint / non atteint) tient dans la marge d'erreur : à confirmer par une nouvelle mesure. */
  readonly withinError: boolean;
}

/** Erreur de mesure d'une métrique d'après le moteur de marche (null si inconnue). */
export function errorOf(id: string, unit: string, estimate: boolean): { value: number; source: string } | null {
  const m: GaitMetric = { id, value: 0, unit, view: 'sagittal-left', confidence: 1, estimate };
  return measurementError(m);
}

/** Atteinte de la cible ('=' : à l'erreur de mesure près). */
const meets = (v: number, g: Pick<TreatmentGoal, 'comparator' | 'target'>, tol = 0): boolean =>
  g.comparator === '>=' ? v >= g.target : g.comparator === '<=' ? v <= g.target : Math.abs(v - g.target) <= tol;

/** Écart à la cible : ≥ 0, nul si la cible est atteinte (pour '=' : distance absolue). */
export function gapTo(v: number, g: Pick<TreatmentGoal, 'comparator' | 'target'>): number {
  if (g.comparator === '>=') return Math.max(0, g.target - v);
  if (g.comparator === '<=') return Math.max(0, v - g.target);
  return Math.abs(v - g.target);
}

/** Valeur d'un objectif dans une évaluation (côté du patient d'abord, puis métrique sans côté). */
export function goalValue(src: PlanSource, g: Pick<TreatmentGoal, 'metricId' | 'side'>): ReturnType<typeof metricIn> {
  return metricIn(src, g.metricId, g.side as Side | undefined);
}

/**
 * Suit un objectif sur les évaluations données (toute période : l'appelant filtre celles qui suivent le début du
 * plan). Règles :
 * - `achieved` : la dernière mesure atteint la cible (si l'écart à la cible est inférieur à l'erreur, `withinError`) ;
 * - `in_progress` : cible non atteinte mais amélioration depuis la première mesure supérieure à l'erreur ;
 * - `not_achieved` : sinon (pas de progrès mesurable au-delà de l'erreur, ou recul) ;
 * - `no_data` : aucune mesure.
 */
export function trackGoal(goal: TreatmentGoal, assessments: readonly PlanSource[]): GoalProgress {
  const sorted = [...assessments].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const points: GoalPoint[] = [];
  let err: { value: number; source: string } | null = null;
  for (const a of sorted) {
    const m = goalValue(a, goal);
    if (!m || m.value === null) continue;
    points.push({ assessmentId: a.id, performedAt: a.performedAt, value: m.value, estimate: m.estimate });
    err = errorOf(goal.metricId, m.unit, m.estimate) ?? err;
  }
  if (!points.length)
    return {
      goalId: goal.id,
      status: 'no_data',
      points,
      baseline: null,
      latest: null,
      improvement: null,
      error: null,
      errorSource: null,
      remaining: null,
      withinError: false,
    };
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const e = err?.value ?? 0;
  const remaining = gapTo(last.value, goal);
  const improvement = gapTo(first.value, goal) - remaining;
  const achieved = meets(last.value, goal, e);
  const status: GoalStatus = achieved
    ? 'achieved'
    : points.length > 1 && improvement > e
      ? 'in_progress'
      : 'not_achieved';
  // Issue ambiguë : la mesure est plus proche de la cible que l'erreur de mesure.
  const withinError =
    e > 0 && (achieved ? gapTo(last.value + (goal.comparator === '<=' ? e : -e), goal) > 0 : remaining <= e);
  return {
    goalId: goal.id,
    status,
    points,
    baseline: first.value,
    latest: last.value,
    improvement,
    error: err ? e : null,
    errorSource: err?.source ?? null,
    remaining,
    withinError,
  };
}

/** Suit tous les objectifs (validés ou non). `since` : ne garde que les évaluations à partir de cette date (ISO). */
export function trackGoals(
  goals: readonly TreatmentGoal[],
  assessments: readonly PlanSource[],
  since?: string,
): GoalProgress[] {
  const list = since ? assessments.filter((a) => a.performedAt >= since) : assessments;
  return goals.map((g) => trackGoal(g, list));
}
