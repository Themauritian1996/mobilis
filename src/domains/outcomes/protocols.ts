import type {
  PhaseOverride,
  Protocol,
  ProtocolExercise,
  ProtocolExerciseEntry,
  ProtocolPhase,
  ResolvedPhase,
} from './data/types.ts';
import { PROTOCOLS } from './data/protocols.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ───────── Utilitaires purs ─────────
export const protocolById = (id: string): Protocol | null =>
  (PROTOCOLS as readonly Protocol[]).find((p) => p.id === id) || null;
export const defaultVariant = (p: Protocol | null | undefined): string | null => p?.variants?.[0]?.id || null;
export const variantOf = (p: Protocol | null | undefined, vid?: string | null): string | null =>
  p?.variants?.length ? ((p.variants.find((v) => v.id === vid) || p.variants[0]) as { id: string }).id : null;

// Phase avec les remplacements de la variante appliqués (weeks, goals, precautions, exercises, criteria, romTargets).
export function resolvePhase(phase: ProtocolPhase, variantId?: string | null): ResolvedPhase {
  const o: PhaseOverride = (variantId && phase.byVariant?.[variantId]) || {};
  const r: Mutable<ProtocolPhase> = { ...phase, ...o };
  r.precautions = [...(o.precautions || phase.precautions || []), ...(o.precautionsAdd || [])];
  r.exercises = [...(o.exercises || phase.exercises || []), ...(o.exercisesAdd || [])];
  r.goals = o.goals || phase.goals || [];
  r.progressionCriteria = o.progressionCriteria || phase.progressionCriteria || [];
  r.romTargets = o.romTargets || phase.romTargets || [];
  r.weeks = o.weeks || phase.weeks;
  delete r.byVariant;
  delete r.precautionsAdd;
  delete r.exercisesAdd;
  return r as ResolvedPhase;
}
// Phases d'un protocole pour une variante, triées, sans trou ni chevauchement (le début d'une phase = la fin de la précédente).
export function protocolPhases(protocol: Protocol, variantId?: string | null): ResolvedPhase[] {
  const v = variantOf(protocol, variantId);
  return protocol.phases.map((ph) => resolvePhase(ph, v));
}
// Entrée d'exercice normalisée : { id, level?, maxLevel?, dose? }
export const exerciseEntry = (e: ProtocolExercise): ProtocolExerciseEntry =>
  typeof e === 'string' ? { id: e } : { ...e };
export const phaseExerciseIds = (phase: Pick<ProtocolPhase, 'exercises'>): string[] => [
  ...new Set((phase.exercises || []).map((e) => exerciseEntry(e).id)),
];
