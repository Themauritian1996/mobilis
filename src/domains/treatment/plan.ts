/**
 * Opérations pures sur le plan de traitement versionné (spec §6) : validation des suggestions, édition, statuts
 * brouillon / actif / clos, révisions, vue patient (exercices et aides techniques seulement, spec §10.8) et
 * préremplissage du programme d'exercices `rx`. Aucune action n'est active tant qu'elle n'est pas validée.
 */
import type { IsoDate, IsoDateTime } from '../../core/types/common.ts';
import type { AssessmentId, PatientId, Plan, PlanId } from '../../core/types/clinical.ts';
import { audienceOf, PATIENT_KINDS } from './propose.ts';
import type { DeviceKind, ExerciseCatalogue, Side, TreatmentAction, TreatmentGoal, TreatmentPlan } from './types.ts';

export const planIdOf = (patientId: string, revision: number): PlanId => `plan_${patientId}_r${revision}` as PlanId;
const iso = (now: Date): IsoDateTime => now.toISOString() as IsoDateTime;

export function newPlan(args: {
  readonly patientId: string;
  readonly ownerUid: string;
  readonly now: Date;
  readonly revision?: number;
  readonly sourceAssessmentIds?: readonly string[];
  readonly actions?: readonly TreatmentAction[];
  readonly goals?: readonly TreatmentGoal[];
}): TreatmentPlan {
  const revision = args.revision ?? 1;
  return {
    schemaVersion: 1,
    id: planIdOf(args.patientId, revision),
    patientId: args.patientId as PatientId,
    ownerUid: args.ownerUid,
    createdAt: iso(args.now),
    updatedAt: iso(args.now),
    revision,
    status: 'draft',
    sourceAssessmentIds: (args.sourceAssessmentIds ?? []) as unknown as readonly AssessmentId[],
    actions: args.actions ?? [],
    goals: args.goals ?? [],
  };
}

const touch = (p: TreatmentPlan, now: Date, patch: Partial<TreatmentPlan>): TreatmentPlan => ({
  ...p,
  ...patch,
  updatedAt: iso(now),
});

/** Seuls les brouillons et les plans actifs s'éditent ; un plan clos est en lecture seule. */
export const isEditable = (p: TreatmentPlan): boolean => p.status !== 'closed';

/** Ajoute des suggestions acceptées par le clinicien (validées ; les doublons d'identifiant sont ignorés). */
export function acceptActions(p: TreatmentPlan, picked: readonly TreatmentAction[], now: Date): TreatmentPlan {
  if (!isEditable(p)) return p;
  const have = new Set(p.actions.map((a) => a.id));
  const add = picked.filter((a) => !have.has(a.id)).map((a): TreatmentAction => ({ ...a, validated: true }));
  const sourceIds = new Set<string>(p.sourceAssessmentIds);
  for (const a of add) if (a.sourceAssessmentId) sourceIds.add(a.sourceAssessmentId);
  return touch(p, now, {
    actions: [...p.actions, ...add],
    sourceAssessmentIds: [...sourceIds] as unknown as readonly AssessmentId[],
  });
}

export function acceptGoals(p: TreatmentPlan, picked: readonly TreatmentGoal[], now: Date): TreatmentPlan {
  if (!isEditable(p)) return p;
  const have = new Set(p.goals.map((g) => g.id));
  return touch(p, now, {
    goals: [
      ...p.goals,
      ...picked.filter((g) => !have.has(g.id)).map((g): TreatmentGoal => ({ ...g, validated: true })),
    ],
  });
}

let seq = 0;
const manualId = (now: Date, prefix: string): string =>
  `${prefix}-${now.getTime().toString(36)}-${(seq++).toString(36)}`;

/** Action saisie à la main par le clinicien (déjà validée). */
export function addManualAction(
  p: TreatmentPlan,
  a: {
    readonly kind: TreatmentAction['kind'];
    readonly label: string;
    readonly exerciseId?: string;
    readonly deviceKind?: DeviceKind;
    readonly side?: Side;
    readonly detail?: string;
    readonly durationWeeks?: number;
  },
  now: Date,
): TreatmentPlan {
  if (!isEditable(p)) return p;
  const action: TreatmentAction = {
    id: manualId(now, 'act'),
    kind: a.kind,
    label: a.label.trim(),
    ...(a.exerciseId ? { exerciseId: a.exerciseId } : {}),
    ...(a.deviceKind ? { deviceKind: a.deviceKind } : {}),
    ...(a.side ? { side: a.side } : {}),
    ...(a.detail ? { detail: a.detail } : {}),
    ...(a.durationWeeks ? { durationWeeks: a.durationWeeks } : {}),
    clinicianEdited: true,
    validated: true,
    audience: audienceOf(a.kind),
    origin: 'manual',
    refs: [],
  };
  return touch(p, now, { actions: [...p.actions, action] });
}

export type ActionPatch = Partial<
  Pick<TreatmentAction, 'label' | 'detail' | 'durationWeeks' | 'side' | 'deviceKind' | 'exerciseId'>
>;

/** Modifie une action : elle est alors marquée « modifiée par le clinicien ». */
export function editAction(p: TreatmentPlan, id: string, patch: ActionPatch, now: Date): TreatmentPlan {
  if (!isEditable(p)) return p;
  return touch(p, now, {
    actions: p.actions.map((a) => (a.id === id ? { ...a, ...patch, clinicianEdited: true } : a)),
  });
}

export function removeAction(p: TreatmentPlan, id: string, now: Date): TreatmentPlan {
  return isEditable(p) ? touch(p, now, { actions: p.actions.filter((a) => a.id !== id) }) : p;
}

export function addGoal(
  p: TreatmentPlan,
  g: Pick<TreatmentGoal, 'metricId' | 'comparator' | 'target' | 'unit' | 'label'> & { side?: Side; dueDate?: IsoDate },
  now: Date,
): TreatmentPlan {
  if (!isEditable(p)) return p;
  const goal: TreatmentGoal = {
    id: manualId(now, 'goal'),
    metricId: g.metricId,
    comparator: g.comparator,
    target: g.target,
    unit: g.unit,
    label: g.label.trim() || g.metricId,
    ...(g.side ? { side: g.side } : {}),
    ...(g.dueDate ? { dueDate: g.dueDate } : {}),
    refs: [],
    thresholdType: 'proposed_heuristic',
    validated: true,
  };
  return touch(p, now, { goals: [...p.goals, goal] });
}

export function removeGoal(p: TreatmentPlan, id: string, now: Date): TreatmentPlan {
  return isEditable(p) ? touch(p, now, { goals: p.goals.filter((g) => g.id !== id) }) : p;
}

/** Copie sans la clé facultative `key` (exactOptionalPropertyTypes : on retire la clé plutôt que la mettre à undefined). */
function without<K extends keyof TreatmentPlan>(p: TreatmentPlan, key: K): TreatmentPlan {
  const copy: Record<string, unknown> = { ...p };
  Reflect.deleteProperty(copy, key);
  return copy as unknown as TreatmentPlan;
}

export function setDuration(p: TreatmentPlan, weeks: number | undefined, now: Date): TreatmentPlan {
  if (!isEditable(p)) return p;
  return touch(without(p, 'durationWeeks'), now, weeks && weeks > 0 ? { durationWeeks: Math.round(weeks) } : {});
}

export function setNotes(p: TreatmentPlan, notes: string, now: Date): TreatmentPlan {
  if (!isEditable(p)) return p;
  return touch(without(p, 'notes'), now, notes.trim() ? { notes: notes.trim() } : {});
}

/** Un plan ne s'active qu'avec au moins une action validée. */
export function canActivate(p: TreatmentPlan): boolean {
  return p.status === 'draft' && p.actions.some((a) => a.validated);
}

export function activate(p: TreatmentPlan, now: Date): TreatmentPlan {
  if (!canActivate(p)) return p;
  return touch(p, now, { status: 'active', startedAt: p.startedAt ?? iso(now) });
}

export function close(p: TreatmentPlan, now: Date): TreatmentPlan {
  return p.status === 'closed' ? p : touch(p, now, { status: 'closed' });
}

/** Nouvelle révision (brouillon) copiée du plan courant : l'ancienne reste inchangée jusqu'à l'activation de la nouvelle. */
export function revise(p: TreatmentPlan, ownerUid: string, now: Date): TreatmentPlan {
  const copy = newPlan({
    patientId: p.patientId,
    ownerUid,
    now,
    revision: p.revision + 1,
    sourceAssessmentIds: p.sourceAssessmentIds,
    actions: p.actions,
    goals: p.goals,
  });
  return {
    ...copy,
    ...(p.durationWeeks ? { durationWeeks: p.durationWeeks } : {}),
    ...(p.notes ? { notes: p.notes } : {}),
    ...(p.rxCode ? { rxCode: p.rxCode } : {}),
  };
}

/** À l'activation d'une révision : les autres plans actifs du patient sont clos. */
export function supersede(activated: TreatmentPlan, others: readonly TreatmentPlan[], now: Date): TreatmentPlan[] {
  return others.filter((o) => o.id !== activated.id && o.status === 'active').map((o) => close(o, now));
}

/** Plan à afficher d'abord : l'actif le plus récent, sinon la révision la plus élevée. */
export function pickCurrent(plans: readonly TreatmentPlan[]): TreatmentPlan | undefined {
  const byRev = [...plans].sort((a, b) => b.revision - a.revision);
  return byRev.find((p) => p.status === 'active') ?? byRev[0];
}

/** Normalise un document stocké (champs du volet absents → valeurs sûres : une action sans `validated` est tenue pour non validée). */
export function fromStored(p: Plan): TreatmentPlan {
  const src = p as Partial<TreatmentPlan> & Plan;
  const actions = p.actions.map((a): TreatmentAction => {
    const x = a as Partial<TreatmentAction> & typeof a;
    return {
      ...x,
      validated: x.validated ?? x.clinicianEdited,
      audience: x.audience ?? audienceOf(x.kind),
      origin: x.origin ?? (x.clinicianEdited ? 'manual' : 'suggested'),
      refs: x.refs ?? [],
    };
  });
  const goals = p.goals.map((g): TreatmentGoal => ({
    label: (g as Partial<TreatmentGoal>).label ?? g.metricId,
    refs: (g as Partial<TreatmentGoal>).refs ?? [],
    thresholdType: (g as Partial<TreatmentGoal>).thresholdType ?? 'proposed_heuristic',
    validated: (g as Partial<TreatmentGoal>).validated ?? true,
    ...g,
  }));
  return { ...src, actions, goals };
}

// ------------------------------------------------------------------------------------------------ Vue patient

export interface PatientAction {
  readonly id: string;
  readonly kind: 'exercise' | 'assistive_device';
  readonly label: string;
  readonly exerciseId?: string;
  readonly deviceKind?: DeviceKind;
  readonly side?: Side;
  readonly detail?: string;
}

/**
 * Ce que voit le patient (spec §10.8) : uniquement les exercices et les aides techniques VALIDÉS d'un plan ACTIF.
 * Toxine, chirurgie, orthèse, ajustements de prothèse, références, entraînement de marche et justifications
 * cliniques n'y figurent jamais.
 */
export function patientView(p: TreatmentPlan | undefined): PatientAction[] {
  if (!p || p.status !== 'active') return [];
  return p.actions
    .filter((a) => a.validated && PATIENT_KINDS.has(a.kind) && a.audience === 'patient')
    .map((a) => ({
      id: a.id,
      kind: a.kind as 'exercise' | 'assistive_device',
      label: a.label,
      ...(a.exerciseId ? { exerciseId: a.exerciseId } : {}),
      ...(a.deviceKind ? { deviceKind: a.deviceKind } : {}),
      ...(a.side ? { side: a.side } : {}),
      ...(a.detail ? { detail: a.detail } : {}),
    }));
}

// ------------------------------------------------------------------------------------------------ Programme rx

export interface RxPrefill {
  readonly ids: readonly string[];
  /** Région dominante des exercices (identifiant de région de la bibliothèque), `null` s'il n'y en a aucun. */
  readonly region: string | null;
  /** Côté du patient pour le programme : 'L' / 'R' si tous les exercices à côté ciblent le même côté, sinon null. */
  readonly side: 'L' | 'R' | null;
  readonly notes: string;
  /** Exercices du plan sans équivalent dans la bibliothèque (non transférés). */
  readonly skippedGaps: readonly string[];
}

/** Données de préremplissage de l'éditeur de programme à partir des exercices VALIDÉS du plan. */
export function rxPrefill(p: TreatmentPlan, exercises: ExerciseCatalogue): RxPrefill {
  const ids: string[] = [];
  const sides = new Set<Side>();
  const skipped: string[] = [];
  for (const a of p.actions) {
    if (!a.validated || a.kind !== 'exercise') continue;
    if (a.exerciseId && exercises[a.exerciseId]) {
      if (!ids.includes(a.exerciseId)) ids.push(a.exerciseId);
      if (a.side) sides.add(a.side);
    } else skipped.push(a.label);
  }
  const count = new Map<string, number>();
  for (const id of ids) {
    const r = exercises[id]!.region;
    count.set(r, (count.get(r) ?? 0) + 1);
  }
  const region = [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const only = sides.size === 1 ? [...sides][0]! : null;
  return {
    ids,
    region,
    side: only,
    notes: `Programme issu du plan de marche (révision ${p.revision}).`,
    skippedGaps: skipped,
  };
}
