import { describe, expect, it } from 'vitest';
import type { Plan } from '../../core/types/clinical.ts';
import { defaultCatalogues, defaultExerciseCatalogue } from './catalogues.ts';
import {
  acceptActions,
  acceptGoals,
  activate,
  addGoal,
  addManualAction,
  canActivate,
  close,
  editAction,
  fromStored,
  newPlan,
  patientView,
  pickCurrent,
  removeAction,
  revise,
  rxPrefill,
  setDuration,
  supersede,
} from './plan.ts';
import { proposePlan } from './propose.ts';
import type { PlanSource } from './types.ts';

const T0 = new Date('2026-11-22T12:00:00Z');
const T1 = new Date('2026-11-23T12:00:00Z');
const CAT = defaultCatalogues();
const EX = defaultExerciseCatalogue();

const source: PlanSource = {
  id: 'A1',
  performedAt: '2026-11-20T10:00:00Z',
  kind: 'gait',
  findings: [
    {
      id: 'foot_drop_steppage',
      kind: 'gait',
      name_fr: 'Pied tombant',
      side: 'L',
      status: 'probable',
      score: 0.9,
      determinants: ['foot_ankle_rockers', 'knee_ankle_interaction'],
      references: [],
      unvalidatedThresholds: [],
    },
    {
      id: 'trendelenburg',
      kind: 'gait',
      name_fr: 'Trendelenburg',
      side: 'L',
      status: 'probable',
      score: 0.8,
      determinants: ['pelvic_list'],
      references: [],
      unvalidatedThresholds: [],
    },
  ],
  determinants: [],
  metrics: [],
};
const proposal = proposePlan([source], CAT, EX);
const fresh = () => newPlan({ patientId: 'p1', ownerUid: 'u1', now: T0 });

describe('cycle de vie du plan', () => {
  it('un plan neuf est un brouillon vide, révision 1', () => {
    const p = fresh();
    expect(p).toMatchObject({ status: 'draft', revision: 1, schemaVersion: 1, patientId: 'p1', ownerUid: 'u1' });
    expect(p.id).toBe('plan_p1_r1');
    expect(canActivate(p)).toBe(false);
  });

  it('les suggestions n’entrent dans le plan que validées ; les doublons sont ignorés', () => {
    const pick = proposal.actions.slice(0, 3);
    const p = acceptActions(fresh(), pick, T1);
    expect(p.actions).toHaveLength(3);
    expect(p.actions.every((a) => a.validated)).toBe(true);
    expect(acceptActions(p, pick, T1).actions).toHaveLength(3);
    expect(p.updatedAt).toBe(T1.toISOString());
  });

  it('on ne peut pas activer un plan sans action validée', () => {
    expect(activate(fresh(), T1).status).toBe('draft');
    const withAction = addManualAction(fresh(), { kind: 'referral', label: 'Référence en orthopédie' }, T1);
    const act = activate(withAction, T1);
    expect(act.status).toBe('active');
    expect(act.startedAt).toBe(T1.toISOString());
  });

  it('ajout manuel, modification (marquée clinicien) et retrait', () => {
    let p = addManualAction(
      fresh(),
      { kind: 'exercise', label: 'Pont fessier', exerciseId: 'glute_bridge', durationWeeks: 6 },
      T1,
    );
    const a = p.actions[0]!;
    expect(a).toMatchObject({
      origin: 'manual',
      clinicianEdited: true,
      validated: true,
      audience: 'patient',
      durationWeeks: 6,
    });
    p = editAction(p, a.id, { detail: '3 × 12, 3 fois par semaine' }, T1);
    expect(p.actions[0]?.detail).toContain('3 × 12');
    p = removeAction(p, a.id, T1);
    expect(p.actions).toHaveLength(0);
  });

  it('une action suggérée modifiée devient « modifiée par le clinicien »', () => {
    let p = acceptActions(fresh(), [proposal.actions[0]!], T1);
    expect(p.actions[0]?.clinicianEdited).toBe(false);
    p = editAction(p, p.actions[0]!.id, { label: 'Autre libellé' }, T1);
    expect(p.actions[0]?.clinicianEdited).toBe(true);
  });

  it('objectifs : accepter une suggestion, en ajouter un, fixer la durée', () => {
    let p = acceptGoals(fresh(), proposal.goals, T1);
    expect(p.goals.length).toBe(proposal.goals.length);
    expect(p.goals.every((g) => g.validated)).toBe(true);
    p = addGoal(p, { metricId: 'gait_speed', comparator: '>=', target: 1, unit: 'm/s', label: 'Vitesse ≥ 1 m/s' }, T1);
    expect(p.goals.at(-1)).toMatchObject({ target: 1, validated: true });
    p = setDuration(p, 12, T1);
    expect(p.durationWeeks).toBe(12);
    expect(setDuration(p, undefined, T1).durationWeeks).toBeUndefined();
  });

  it('un plan clos est en lecture seule', () => {
    const p = close(addManualAction(fresh(), { kind: 'referral', label: 'x' }, T0), T1);
    expect(p.status).toBe('closed');
    expect(addManualAction(p, { kind: 'referral', label: 'y' }, T1).actions).toHaveLength(1);
    expect(removeAction(p, p.actions[0]!.id, T1).actions).toHaveLength(1);
    expect(activate(p, T1).status).toBe('closed');
  });
});

describe('révisions', () => {
  const r1 = activate(addManualAction(fresh(), { kind: 'referral', label: 'x' }, T0), T0);
  const r2 = revise(r1, 'u1', T1);

  it('une nouvelle révision est un brouillon copié, numéroté +1, ancienne inchangée', () => {
    expect(r2).toMatchObject({ revision: 2, status: 'draft', id: 'plan_p1_r2' });
    expect(r2.actions).toEqual(r1.actions);
    expect(r1.status).toBe('active');
  });

  it('l’activation d’une révision clôt l’ancienne', () => {
    const a2 = activate(r2, T1);
    const closed = supersede(a2, [r1, a2], T1);
    expect(closed.map((c) => [c.id, c.status])).toEqual([['plan_p1_r1', 'closed']]);
  });

  it('pickCurrent : l’actif, sinon la révision la plus haute', () => {
    expect(pickCurrent([r1, r2])?.id).toBe('plan_p1_r1');
    expect(pickCurrent([close(r1, T1), r2])?.id).toBe('plan_p1_r2');
    expect(pickCurrent([])).toBeUndefined();
  });
});

describe('vue patient (spec §10.8)', () => {
  const kinds = [
    'exercise',
    'assistive_device',
    'orthosis',
    'prosthetic_adjustment',
    'injection_evaluation',
    'referral',
    'gait_training',
    'other',
  ] as const;
  let p = fresh();
  for (const kind of kinds)
    p = addManualAction(
      p,
      { kind, label: `A-${kind}`, ...(kind === 'exercise' ? { exerciseId: 'sl_balance' } : {}) },
      T0,
    );

  it('un brouillon n’est pas visible du patient', () => {
    expect(patientView(p)).toEqual([]);
  });

  it('seuls exercices et aides techniques d’un plan actif sont visibles : ni toxine, chirurgie, orthèse, prothèse', () => {
    const seen = patientView(activate(p, T0));
    expect(seen.map((a) => a.kind).sort()).toEqual(['assistive_device', 'exercise']);
    const labels = seen.map((a) => a.label).join(' ');
    for (const hidden of ['orthosis', 'prosthetic_adjustment', 'injection_evaluation', 'referral', 'gait_training'])
      expect(labels).not.toContain(hidden);
  });

  it('une suggestion non validée n’apparaît jamais, même dans un plan actif', () => {
    const q = activate(
      { ...p, actions: p.actions.map((a) => (a.kind === 'exercise' ? { ...a, validated: false } : a)) },
      T0,
    );
    expect(patientView(q).map((a) => a.kind)).toEqual(['assistive_device']);
  });

  it('la sortie patient ne contient ni justification clinique ni références', () => {
    const q = activate(acceptActions(fresh(), proposal.actions, T0), T0);
    for (const a of patientView(q)) {
      expect(
        Object.keys(a).every((k) => ['id', 'kind', 'label', 'exerciseId', 'deviceKind', 'side', 'detail'].includes(k)),
      ).toBe(true);
    }
    expect(patientView(q).length).toBeGreaterThan(0);
  });
});

describe('programme d’exercices (rx)', () => {
  it('préremplit les exercices validés de la bibliothèque, la région dominante et le côté', () => {
    const p = acceptActions(fresh(), proposal.actions, T0);
    const r = rxPrefill(p, EX);
    expect(r.ids.length).toBeGreaterThan(0);
    expect(r.ids.every((id) => EX[id])).toBe(true);
    expect(new Set(r.ids).size).toBe(r.ids.length);
    expect(r.region).toBeTruthy();
    expect(r.side).toBe('L');
    expect(r.skippedGaps.some((l) => /releveurs/i.test(l))).toBe(true);
    expect(r.notes).toContain('révision 1');
  });

  it('ignore les suggestions non validées ; aucun exercice → pas de région', () => {
    const r = rxPrefill({ ...fresh(), actions: proposal.actions }, EX);
    expect(r.ids).toEqual([]);
    expect(r.region).toBeNull();
  });
});

describe('document stocké', () => {
  it('fromStored normalise un plan écrit sans les champs du volet (non validé sauf saisie clinicien)', () => {
    const raw: Plan = {
      ...fresh(),
      actions: [
        { id: 'a', kind: 'exercise', label: 'Pont', exerciseId: 'glute_bridge', clinicianEdited: false },
        { id: 'b', kind: 'referral', label: 'Ortho', clinicianEdited: true },
      ],
      goals: [{ id: 'g', metricId: 'ankle_msw', comparator: '>=', target: 0, unit: '°' }],
    };
    const p = fromStored(raw);
    expect(p.actions.map((a) => a.validated)).toEqual([false, true]);
    expect(p.actions[0]?.audience).toBe('patient');
    expect(p.actions[1]?.audience).toBe('clinician');
    expect(p.goals[0]).toMatchObject({ label: 'ankle_msw', validated: true, refs: [] });
  });
});
