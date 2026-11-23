import { describe, expect, it } from 'vitest';
import { DETERMINANTS, GAIT_FINDINGS, REFERENCES } from '../gait/index.ts';
import { PROSTHETIC_CATALOG } from '../prosthetics/index.ts';
import { defaultCatalogues, defaultExerciseCatalogue } from './catalogues.ts';
import { proposePlan } from './propose.ts';
import type { PlanDeterminant, PlanFinding, PlanMetric, PlanSource, Side } from './types.ts';

const CAT = defaultCatalogues();
const EX = defaultExerciseCatalogue();

const finding = (
  id: string,
  side: Side,
  status: PlanFinding['status'],
  kind: 'gait' | 'prosthetic' = 'gait',
): PlanFinding => ({
  id,
  kind,
  name_fr: CAT.findings[id]?.name_fr ?? id,
  side,
  status,
  score: 0.8,
  determinants: GAIT_FINDINGS.find((f) => f.id === id)?.determinants ?? [],
  references: [],
  unvalidatedThresholds: [{ criterion: 'x', type: 'proposed_heuristic' }],
});
const det = (
  id: PlanDeterminant['id'],
  status: PlanDeterminant['status'],
  linked: PlanDeterminant['linkedFindings'] = [],
): PlanDeterminant => ({
  id,
  status,
  linkedFindings: linked,
});
const metric = (id: string, value: number, side?: Side, extra: Partial<PlanMetric> = {}): PlanMetric => ({
  id,
  ...(side ? { side } : {}),
  value,
  unit: id === 'gait_speed' ? 'm/s' : '°',
  confidence: 0.8,
  estimate: false,
  ...extra,
});
const src = (id: string, at: string, p: Partial<PlanSource>): PlanSource => ({
  id,
  performedAt: at,
  kind: 'gait',
  findings: [],
  determinants: [],
  metrics: [],
  ...p,
});

describe('proposePlan — pied tombant gauche', () => {
  const a = src('A1', '2026-11-01T10:00:00Z', {
    findings: [finding('foot_drop_steppage', 'L', 'probable')],
    determinants: [
      det('foot_ankle_rockers', 'affected', [{ id: 'foot_drop_steppage', side: 'L', status: 'probable' }]),
      det('knee_ankle_interaction', 'uncertain'),
    ],
    metrics: [metric('ankle_msw', -9, 'L')],
  });
  const plan = proposePlan([a], CAT, EX);

  it('propose des actions typées liées au défaut source et au déterminant à restaurer', () => {
    const kinds = new Set(plan.actions.map((x) => x.kind));
    for (const k of ['exercise', 'gait_training', 'orthosis', 'referral', 'injection_evaluation'] as const)
      expect(kinds.has(k)).toBe(true);
    const calf = plan.actions.find((x) => x.exerciseId === 'calf_stretch');
    expect(calf).toBeDefined();
    expect(calf?.fromFindingId).toBe('foot_drop_steppage');
    expect(calf?.determinantId).toBe('foot_ankle_rockers'); // altéré ET lié au défaut
    expect(calf?.side).toBe('L');
    expect(calf?.sourceAssessmentId).toBe('A1');
    for (const x of plan.actions) {
      expect(x.fromFindingId).toBeTruthy();
      expect(x.refs.length).toBeGreaterThan(0);
    }
  });

  it('aucune action n’est active ni validée par défaut', () => {
    expect(plan.actions.length).toBeGreaterThan(3);
    expect(plan.actions.every((x) => x.validated === false && x.clinicianEdited === false)).toBe(true);
    expect(plan.goals.every((g) => g.validated === false)).toBe(true);
    expect(plan.notice).toContain('à valider par le clinicien');
  });

  it('signale les lacunes de la bibliothèque (releveurs) et les seuils non validés', () => {
    const gap = plan.actions.find((x) => x.libraryGap);
    expect(gap?.label).toMatch(/releveurs/i);
    expect(gap?.exerciseId).toBeUndefined();
    expect(plan.actions[0]?.unvalidatedThreshold).toBe(true);
  });

  it('les actions cliniciens-seulement ne sont pas destinées au patient', () => {
    for (const x of plan.actions)
      expect(x.audience).toBe(['exercise', 'assistive_device'].includes(x.kind) ? 'patient' : 'clinician');
  });

  it('propose l’objectif mesurable « cheville ≥ 0° en oscillation moyenne »', () => {
    const g = plan.goals.find((x) => x.metricId === 'ankle_msw');
    expect(g).toMatchObject({ comparator: '>=', target: 0, unit: '°', side: 'L', fromFindingId: 'foot_drop_steppage' });
    expect(g?.determinantId).toBe('foot_ankle_rockers');
    expect(g?.refs.length).toBeGreaterThan(0);
  });

  it('est déterministe (mêmes identifiants stables)', () => {
    const again = proposePlan([a], CAT, EX);
    expect(again.actions.map((x) => x.id)).toEqual(plan.actions.map((x) => x.id));
    expect(new Set(plan.actions.map((x) => x.id)).size).toBe(plan.actions.length);
  });
});

describe('proposePlan — déterminants, fusion et évaluations successives', () => {
  it('un déterminant altéré ajoute ses exercices et les fusionne avec ceux du défaut', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', {
      findings: [finding('trendelenburg', 'R', 'probable')],
      determinants: [det('pelvic_list', 'affected', [{ id: 'trendelenburg', side: 'R', status: 'probable' }])],
    });
    const p = proposePlan([a], CAT, EX);
    const ids = p.actions.filter((x) => x.kind === 'exercise').map((x) => x.exerciseId);
    expect(ids.filter((i) => i === 'hip_abd_stand')).toHaveLength(1); // fusionné
    expect(ids).toContain('side_plank'); // issu du déterminant seul
    const dev = p.actions.find((x) => x.kind === 'assistive_device');
    expect(dev?.label).toContain('côté gauche'); // canne controlatérale au membre droit
    expect(dev?.deviceKind).toBe('cane');
  });

  it('un déterminant préservé ou incertain n’ajoute aucun exercice', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', {
      determinants: [det('pelvic_list', 'uncertain'), det('foot_ankle_rockers', 'preserved')],
    });
    expect(proposePlan([a], CAT, EX).actions).toHaveLength(0);
  });

  it('la dernière évaluation prévaut ; « absent » annule le défaut', () => {
    const a1 = src('A1', '2026-10-01T10:00:00Z', { findings: [finding('foot_drop_steppage', 'L', 'probable')] });
    const a2 = src('A2', '2026-11-01T10:00:00Z', { findings: [finding('foot_drop_steppage', 'L', 'absent')] });
    expect(proposePlan([a2, a1], CAT, EX).actions).toHaveLength(0);
    expect(proposePlan([a1], CAT, EX).actions.length).toBeGreaterThan(0);
  });

  it('ignore les défauts absents ou à données insuffisantes ; un défaut sans plan est signalé', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', {
      findings: [finding('foot_slap', 'L', 'insufficient_data'), finding('inconnu_xyz', 'L', 'probable')],
    });
    const p = proposePlan([a], CAT, EX);
    expect(p.actions).toHaveLength(0);
    expect(p.unmapped).toEqual(['inconnu_xyz']);
  });

  it('un exercice absent de la bibliothèque injectée devient une lacune, jamais un identifiant fantôme', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', { findings: [finding('trendelenburg', 'L', 'probable')] });
    const p = proposePlan([a], CAT, { clamshell: EX['clamshell']! });
    const exs = p.actions.filter((x) => x.kind === 'exercise');
    expect(exs.find((x) => x.exerciseId === 'clamshell')).toBeDefined();
    expect(exs.find((x) => x.exerciseId === 'hip_abd_stand')).toBeUndefined();
    expect(exs.some((x) => x.libraryGap)).toBe(true);
  });

  it('la priorité suit le statut du défaut (probable > possible > à observer)', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', {
      findings: [finding('foot_drop_steppage', 'L', 'possible'), finding('trendelenburg', 'R', 'probable')],
    });
    const p = proposePlan([a], CAT, EX);
    expect(p.actions[0]?.priority).toBe('high');
    expect(p.actions.find((x) => x.fromFindingId === 'foot_drop_steppage')?.priority).toBe('medium');
  });
});

describe('proposePlan — objectifs', () => {
  it('vitesse : objectifs intermédiaire (0,8 m/s) et à la norme − 2 ET', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', {
      findings: [finding('reduced_speed_fall_risk', 'L', 'probable')],
      metrics: [
        metric('gait_speed', 0.55, undefined, {
          norm: { mean: 1.36, sd: 0.21, normId: 'speed_comfortable_bohannon1997', ref: 'bohannon1997' },
        }),
      ],
    });
    const goals = proposePlan([a], CAT, EX).goals.filter((g) => g.metricId === 'gait_speed');
    expect(goals.map((g) => g.target).sort()).toEqual([0.8, 0.94]);
    expect(goals.every((g) => g.side === undefined && g.unit === 'm/s')).toBe(true);
  });

  it('ne propose pas un objectif déjà atteint', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', {
      findings: [finding('foot_drop_steppage', 'L', 'possible')],
      metrics: [metric('ankle_msw', 1, 'L'), metric('ankle_ic', -12, 'L')],
    });
    const goals = proposePlan([a], CAT, EX).goals;
    expect(goals.find((g) => g.metricId === 'ankle_msw')).toBeUndefined();
    expect(goals.find((g) => g.metricId === 'ankle_ic')).toBeDefined();
  });

  it('vaulting : l’objectif porte sur le côté controlatéral', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', { findings: [finding('vaulting', 'R', 'probable')] });
    const g = proposePlan([a], CAT, EX).goals.find((x) => x.metricId === 'heel_rise_pct');
    expect(g?.side).toBe('L');
  });

  it('pas d’objectif pour un défaut seulement « à observer »', () => {
    const a = src('A1', '2026-11-01T10:00:00Z', { findings: [finding('foot_drop_steppage', 'L', 'observe')] });
    expect(proposePlan([a], CAT, EX).goals).toHaveLength(0);
  });
});

describe('proposePlan — prothèse', () => {
  it('une déviation prothétique produit un ajustement à discuter avec le prothésiste (clinicien seul)', () => {
    const a = src('P1', '2026-11-01T10:00:00Z', {
      kind: 'prosthetic_gait',
      findings: [finding('prosthetic_vaulting', 'R', 'probable', 'prosthetic')],
    });
    const p = proposePlan([a], CAT, EX);
    const adj = p.actions.filter((x) => x.kind === 'prosthetic_adjustment');
    expect(adj.length).toBeGreaterThan(0);
    expect(adj.every((x) => x.audience === 'clinician' && x.label.includes('prothésiste'))).toBe(true);
    expect(adj.every((x) => x.refs.includes('physiopedia_amputee_gait'))).toBe(true);
  });

  it('une aide technique du catalogue prothétique devient une action « aide technique »', () => {
    const a = src('P1', '2026-11-01T10:00:00Z', {
      kind: 'prosthetic_gait',
      findings: [finding('uneven_step_length_timing', 'R', 'possible', 'prosthetic')],
    });
    expect(proposePlan([a], CAT, EX).actions.some((x) => x.kind === 'assistive_device')).toBe(true);
  });
});

describe('intégrité des données sourcées', () => {
  const refIds = new Set(REFERENCES.map((r) => r.id));

  it('tout défaut de marche et toute déviation prothétique a une entrée de plan', () => {
    for (const f of GAIT_FINDINGS) expect(CAT.plan[f.id], f.id).toBeDefined();
    for (const d of PROSTHETIC_CATALOG.deviations) expect(CAT.plan[d.id], d.id).toBeDefined();
  });

  it('tout exercice cité existe dans la bibliothèque', () => {
    for (const e of Object.values(CAT.plan))
      for (const l of e.exercises)
        if (l.exerciseId) expect(EX[l.exerciseId], `${e.findingId}/${l.exerciseId}`).toBeDefined();
    for (const e of Object.values(CAT.determinantPlan))
      for (const x of e?.exercises ?? []) expect(EX[x.exerciseId], x.exerciseId).toBeDefined();
  });

  it('toute référence citée existe dans references.json', () => {
    const cited: string[] = [];
    for (const e of Object.values(CAT.plan)) {
      for (const t of [
        e.gaitTraining,
        e.injection,
        ...(e.orthosis ?? []),
        ...(e.referral ?? []),
        ...(e.prosthetic ?? []),
      ])
        cited.push(...(t?.refs ?? []));
      cited.push(...(e.device?.refs ?? []));
    }
    for (const e of Object.values(CAT.determinantPlan)) cited.push(...(e?.refs ?? []));
    for (const g of CAT.goals) cited.push(...g.refs);
    for (const f of Object.values(CAT.findings)) cited.push(...f.refs);
    for (const id of new Set(cited)) expect(refIds.has(id), id).toBe(true);
  });

  it('chaque lien exercice vise des déterminants valides et chaque déterminant a un plan', () => {
    const valid = new Set(DETERMINANTS.map((d) => d.id));
    for (const e of Object.values(CAT.plan))
      for (const l of e.exercises) for (const d of l.determinants) expect(valid.has(d)).toBe(true);
    for (const d of DETERMINANTS) expect(CAT.determinantPlan[d.id]?.exercises.length).toBeGreaterThan(0);
  });

  it('chaque modèle d’objectif vise un défaut existant', () => {
    for (const g of CAT.goals) for (const f of g.findingIds) expect(CAT.findings[f], `${g.id}/${f}`).toBeDefined();
  });
});
