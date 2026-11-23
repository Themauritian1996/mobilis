/**
 * `proposePlan` : fonction PURE qui transforme les défauts retenus et les déterminants altérés en actions typées
 * (`PlanAction` étendu) et en objectifs mesurables (`PlanGoal` étendu). Rien n'est actif : toute action est
 * produite avec `validated: false` et ne devient active qu'après acceptation par le clinicien (spec §6, §10).
 */
import { DEFAULT_GAIT_CONFIG } from '../gait/config.ts';
import { metricIn } from './source.ts';
import {
  SUGGESTION_NOTICE,
  type ActionAudience,
  type DeterminantId,
  type ExerciseCatalogue,
  type FindingPlanEntry,
  type GoalTemplate,
  type PlanFinding,
  type PlanProposal,
  type PlanSource,
  type ProposeOptions,
  type Side,
  type SuggestionPriority,
  type TreatmentAction,
  type TreatmentCatalogues,
  type TreatmentGoal,
} from './types.ts';

const OTHER: Record<Side, Side> = { L: 'R', R: 'L' };
export const SIDE_FR: Record<Side, string> = { L: 'gauche', R: 'droit' };
const DEFAULT_STATUSES = ['probable', 'possible', 'observe'] as const;
/** Métriques globales (sans côté) : l'objectif n'est pas rattaché à un côté. */
const GLOBAL_METRICS: ReadonlySet<string> = new Set(['gait_speed', 'step_width_mean', 'cadence']);

const PRIORITY: Record<string, SuggestionPriority> = { probable: 'high', possible: 'medium', observe: 'low' };
const PRIORITY_RANK: Record<SuggestionPriority, number> = { high: 0, medium: 1, low: 2 };
const KIND_RANK: Record<TreatmentAction['kind'], number> = {
  exercise: 0,
  gait_training: 1,
  assistive_device: 2,
  orthosis: 3,
  prosthetic_adjustment: 4,
  referral: 5,
  injection_evaluation: 6,
  other: 7,
};
/** Spec §10.8 : le patient ne voit que les exercices et les aides techniques. */
export const PATIENT_KINDS: ReadonlySet<TreatmentAction['kind']> = new Set(['exercise', 'assistive_device']);
export const audienceOf = (kind: TreatmentAction['kind']): ActionAudience =>
  PATIENT_KINDS.has(kind) ? 'patient' : 'clinician';

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

interface Retained {
  readonly finding: PlanFinding;
  readonly assessmentId: string;
}

/** Défauts retenus : pour chaque (défaut, côté), la dernière évaluation qui le rapporte ; « absent » l'annule. */
function latestFindings(sorted: readonly PlanSource[], statuses: readonly string[]): Retained[] {
  const map = new Map<string, Retained>();
  for (const a of sorted)
    for (const f of a.findings) {
      const k = `${f.id}|${f.side}`;
      if (statuses.includes(f.status)) map.set(k, { finding: f, assessmentId: a.id });
      else if (f.status === 'absent') map.delete(k);
    }
  return [...map.values()];
}

function latestDeterminants(sorted: readonly PlanSource[]) {
  const map = new Map<
    DeterminantId,
    { status: string; linked: readonly { id: string; side: Side; status: string }[]; assessmentId: string }
  >();
  for (const a of sorted)
    for (const d of a.determinants) map.set(d.id, { status: d.status, linked: d.linkedFindings, assessmentId: a.id });
  return map;
}

class Builder {
  private readonly byKey = new Map<string, TreatmentAction>();
  add(key: string, a: Omit<TreatmentAction, 'id'>): void {
    const cur = this.byKey.get(key);
    if (!cur) {
      this.byKey.set(key, { ...a, id: `sug-${slug(key)}` });
      return;
    }
    // Fusion : on garde la priorité la plus haute, les références de l'une et de l'autre, le déterminant s'il manquait.
    const better = (PRIORITY_RANK[a.priority ?? 'low'] ?? 2) < (PRIORITY_RANK[cur.priority ?? 'low'] ?? 2);
    const base = better ? { ...a, id: cur.id } : cur;
    this.byKey.set(key, {
      ...base,
      refs: union(cur.refs, a.refs),
      ...(base.determinantId ? {} : a.determinantId ? { determinantId: a.determinantId } : {}),
      ...(base.fromFindingId ? {} : a.fromFindingId ? { fromFindingId: a.fromFindingId } : {}),
      rationale: [...new Set([cur.rationale, a.rationale].filter((x): x is string => !!x))].join(' · '),
    });
  }
  list(): TreatmentAction[] {
    return [...this.byKey.values()].sort(
      (x, y) =>
        (PRIORITY_RANK[x.priority ?? 'low'] ?? 2) - (PRIORITY_RANK[y.priority ?? 'low'] ?? 2) ||
        KIND_RANK[x.kind] - KIND_RANK[y.kind] ||
        x.label.localeCompare(y.label, 'fr'),
    );
  }
}

function resolveTarget(
  tpl: GoalTemplate,
  metric: ReturnType<typeof metricIn>,
): { value: number; fromNorm: boolean } | null {
  const t = tpl.target;
  if (typeof t === 'number') return { value: t, fromNorm: false };
  const n = metric?.norm;
  if (n && (t.fromNorm === 'mean' || n.sd !== null)) {
    const z = DEFAULT_GAIT_CONFIG.zThreshold;
    const raw =
      t.fromNorm === 'mean' ? n.mean : t.fromNorm === 'lower' ? n.mean - z * (n.sd ?? 0) : n.mean + z * (n.sd ?? 0);
    return { value: Math.round(raw * 100) / 100, fromNorm: true };
  }
  return t.fallback === undefined ? null : { value: t.fallback, fromNorm: false };
}

const meets = (v: number, cmp: TreatmentGoal['comparator'], t: number): boolean =>
  cmp === '>=' ? v >= t : cmp === '<=' ? v <= t : Math.abs(v - t) < 1e-9;

function proposeGoals(
  retained: readonly Retained[],
  sorted: readonly PlanSource[],
  cat: TreatmentCatalogues,
): TreatmentGoal[] {
  // Dernière valeur disponible : les évaluations sont triées, on prend la dernière qui a la métrique.
  const lastMetric = (id: string, s?: Side) => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const m = metricIn(sorted[i]!, id, s);
      if (m) return m;
    }
    return undefined;
  };
  const out = new Map<string, TreatmentGoal>();
  for (const { finding } of retained) {
    if (finding.status === 'observe') continue;
    for (const tpl of cat.goals) {
      if (!tpl.findingIds.includes(finding.id)) continue;
      const s: Side = tpl.side === 'self' ? finding.side : OTHER[finding.side];
      const global = GLOBAL_METRICS.has(tpl.metricId);
      const metric = lastMetric(tpl.metricId, global ? undefined : s);
      const target = resolveTarget(tpl, metric);
      if (!target) continue;
      if (metric && metric.value !== null && meets(metric.value, tpl.comparator, target.value)) continue; // déjà atteint
      const key = `${tpl.id}|${global ? '' : s}`;
      if (out.has(key)) continue;
      out.set(key, {
        id: `goal-${slug(tpl.id)}${global ? '' : `-${s.toLowerCase()}`}`,
        metricId: tpl.metricId,
        comparator: tpl.comparator,
        target: target.value,
        unit: metric?.unit ?? tpl.unit,
        label: global ? tpl.label : `${tpl.label} (côté ${SIDE_FR[s]})`,
        ...(global ? {} : { side: s }),
        ...(tpl.determinantId ? { determinantId: tpl.determinantId } : {}),
        fromFindingId: finding.id,
        refs: tpl.refs,
        thresholdType: tpl.thresholdType,
        validated: false,
        ...(tpl.note ? { note: tpl.note } : {}),
      });
    }
  }
  return [...out.values()];
}

/**
 * Propose un plan de traitement à partir des évaluations de marche (de la plus ancienne à la plus récente ; la plus
 * récente prévaut pour chaque défaut). `catalogues` et `exercises` sont injectés (voir `defaultCatalogues()` et
 * `defaultExerciseCatalogue()`). Les actions et objectifs retournés ne sont pas validés.
 */
export function proposePlan(
  assessments: readonly PlanSource[],
  catalogues: TreatmentCatalogues,
  exercises: ExerciseCatalogue,
  options: ProposeOptions = {},
): PlanProposal {
  const statuses = options.statuses ?? DEFAULT_STATUSES;
  const sorted = [...assessments].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const retained = latestFindings(sorted, statuses);
  const dets = latestDeterminants(sorted);
  const affected = new Set<DeterminantId>([...dets].filter(([, v]) => v.status === 'affected').map(([k]) => k));
  const b = new Builder();
  const unmapped: string[] = [];

  const detFor = (link: readonly DeterminantId[], finding: readonly DeterminantId[]): DeterminantId | undefined =>
    link.find((d) => affected.has(d) && finding.includes(d)) ??
    link.find((d) => affected.has(d)) ??
    link.find((d) => finding.includes(d)) ??
    link[0] ??
    finding[0];

  for (const { finding, assessmentId } of retained) {
    const entry: FindingPlanEntry | undefined = catalogues.plan[finding.id];
    const info = catalogues.findings[finding.id];
    const proth = catalogues.prosthetic[finding.id];
    const refsBase = union(info?.refs ?? [], finding.references);
    const priority = PRIORITY[finding.status] ?? 'low';
    const sideLabel = SIDE_FR[finding.side];
    const common = {
      fromFindingId: finding.id,
      clinicianEdited: false,
      validated: false,
      origin: 'suggested' as const,
      priority,
      confidence: finding.score,
      sourceAssessmentId: assessmentId,
      ...(finding.unvalidatedThresholds.length ? { unvalidatedThreshold: true } : {}),
    };
    const why = (text: string, det?: DeterminantId): string =>
      `${finding.name_fr} (côté ${sideLabel})${det ? ` → ${catalogues.determinantNames[det]}` : ''} — ${text}`;
    if (!entry && !proth) {
      unmapped.push(finding.id);
      continue;
    }
    let produced = 0;
    for (const link of entry?.exercises ?? []) {
      const det = detFor(link.determinants, finding.determinants);
      const sideSel = link.side === 'both' ? undefined : finding.side;
      const lib = link.exerciseId ? exercises[link.exerciseId] : undefined;
      const rationale = why(link.managementText, det);
      const sideKey = sideSel ?? 'both';
      if (link.exerciseId && lib) {
        b.add(`exercise|${link.exerciseId}|${sideKey}`, {
          ...common,
          kind: 'exercise',
          label: lib.name.fr,
          exerciseId: link.exerciseId,
          audience: 'patient',
          ...(sideSel ? { side: sideSel } : {}),
          ...(det ? { determinantId: det } : {}),
          rationale,
          refs: refsBase,
        });
      } else {
        const label = link.gapLabel?.fr ?? link.managementText;
        b.add(`exercise|gap-${slug(label)}|${sideKey}`, {
          ...common,
          kind: 'exercise',
          label,
          audience: 'patient',
          libraryGap: true,
          ...(sideSel ? { side: sideSel } : {}),
          ...(det ? { determinantId: det } : {}),
          rationale: `${rationale} (aucun exercice équivalent dans la bibliothèque)`,
          refs: refsBase,
        });
      }
      produced++;
    }
    const text = (
      kind: TreatmentAction['kind'],
      label: string,
      refs: readonly string[],
      extra: Partial<TreatmentAction> = {},
    ): void => {
      const det = detFor([], finding.determinants);
      b.add(`${kind}|${slug(label)}|${finding.side}`, {
        ...common,
        kind,
        label,
        audience: audienceOf(kind),
        side: finding.side,
        ...(det ? { determinantId: det } : {}),
        rationale: why(label, det),
        refs: union(refs, []),
        ...extra,
      });
      produced++;
    };
    if (entry?.gaitTraining) text('gait_training', entry.gaitTraining.label, entry.gaitTraining.refs);
    if (entry?.device) {
      const d = entry.device;
      const holdSide =
        d.holdSide === 'contralateral'
          ? `côté ${SIDE_FR[OTHER[finding.side]]} (controlatéral)`
          : d.holdSide === 'bilateral'
            ? 'des deux côtés'
            : 'selon l’équilibre';
      text('assistive_device', `${d.label} — ${holdSide}`, d.refs, {
        deviceKind: d.kinds[0]!,
        detail: `Aides possibles : ${d.kinds.join(', ')} — régler avec le calculateur (#/aides/…)`,
        ...(d.condition ? { condition: d.condition } : {}),
      });
    } else if (proth?.assistiveDevice) {
      text('assistive_device', proth.assistiveDevice, proth.refs);
    }
    for (const o of entry?.orthosis ?? [])
      text('orthosis', o.label, o.refs, o.condition ? { condition: o.condition } : {});
    for (const r of entry?.referral ?? [])
      text('referral', r.label, r.refs, r.condition ? { condition: r.condition } : {});
    if (entry?.injection)
      text(
        'injection_evaluation',
        entry.injection.label,
        entry.injection.refs,
        entry.injection.condition ? { condition: entry.injection.condition } : {},
      );
    for (const p of entry?.prosthetic ?? []) text('prosthetic_adjustment', p.label, p.refs);
    for (const s of proth?.suggestionsProsthetist ?? [])
      text('prosthetic_adjustment', `${s} (à discuter avec le prothésiste)`, proth?.refs ?? refsBase);
    if (!produced) unmapped.push(finding.id);
  }

  // Déterminants altérés : exercices de restauration (même exercice déjà proposé → fusion).
  for (const [id, d] of dets) {
    if (d.status !== 'affected') continue;
    const plan = catalogues.determinantPlan[id];
    if (!plan) continue;
    const linked = d.linked.find((l) => l.status === 'probable' || l.status === 'possible') ?? d.linked[0];
    for (const e of plan.exercises) {
      const lib = exercises[e.exerciseId];
      if (!lib) continue;
      const sideKey = linked?.side ?? 'both';
      b.add(`exercise|${e.exerciseId}|${sideKey}`, {
        kind: 'exercise',
        label: lib.name.fr,
        exerciseId: e.exerciseId,
        audience: 'patient',
        ...(linked ? { fromFindingId: linked.id, side: linked.side } : {}),
        determinantId: id,
        clinicianEdited: false,
        validated: false,
        origin: 'suggested',
        priority: 'medium',
        sourceAssessmentId: d.assessmentId,
        rationale: `Déterminant altéré : ${catalogues.determinantNames[id]} — ${e.why}`,
        refs: plan.refs,
      });
    }
  }

  const goals = proposeGoals(retained, sorted, catalogues);
  return {
    actions: b.list(),
    goals,
    sourceAssessmentIds: sorted.map((a) => a.id),
    unmapped: [...new Set(unmapped)],
    notice: SUGGESTION_NOTICE,
  };
}
