import { describe, expect, it } from 'vitest';
import { LM } from '../../vision/goniometry.ts';
import {
  adviseAdjustment,
  ARM_PROPORTIONS,
  buildDeviceAction,
  buildDeviceAssessment,
  deviceGuide,
  DEVICE_KINDS,
  elbowFlexion,
  ElbowSampler,
  elbowStatus,
  ELBOW_TARGET,
  holdSide,
  shoulderToGrip,
  viewOf,
  type ElbowFrame,
} from './devices.ts';

/** Bras droit du patient (côté R) vu de profil : épaule en (0,3 ; 0,3), coude en dessous, poignet selon `flexion`. */
function arm(flexionDeg: number, vis = 0.9): ElbowFrame {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const sh = { x: 0.5, y: 0.3 };
  const upper = 0.2;
  const el = { x: sh.x, y: sh.y + upper };
  // Bras pendant : flexion 0° = avant-bras dans le prolongement (vers le bas) ; flexion f → vers l'avant et vers le haut.
  const a = (flexionDeg * Math.PI) / 180;
  const fore = 0.18;
  const wr = { x: el.x + fore * Math.sin(a), y: el.y + fore * Math.cos(a) };
  lm[LM.sh.R] = { ...sh, visibility: vis };
  lm[LM.el.R] = { ...el, visibility: vis };
  lm[LM.wr.R] = { ...wr, visibility: vis };
  return { lm, w: 1000, h: 1000 };
}

describe('angle du coude par caméra', () => {
  it('mesure la flexion (180° − angle épaule–coude–poignet)', () => {
    for (const f of [0, 20, 25, 30, 45, 90]) expect(elbowFlexion(arm(f), 'R')?.flexionDeg).toBeCloseTo(f, 5);
  });

  it('refuse une mesure quand un repère est peu visible', () => {
    expect(elbowFlexion(arm(25, 0.3), 'R')).toBeNull();
    expect(elbowFlexion(arm(25), 'L')).toBeNull(); // côté gauche non visible
  });

  it('classe l’angle dans la bande 20–30° avec la marge d’erreur de la caméra', () => {
    expect(ELBOW_TARGET.min).toBe(20);
    expect(ELBOW_TARGET.max).toBe(30);
    expect(elbowStatus(25)).toBe('ok');
    expect(elbowStatus(20)).toBe('ok');
    expect(elbowStatus(33)).toBe('borderline');
    expect(elbowStatus(16)).toBe('borderline');
    expect(elbowStatus(50)).toBe('too_flexed');
    expect(elbowStatus(5)).toBe('too_extended');
    expect(elbowStatus(33, 2)).toBe('too_flexed');
  });

  it('vue de profil ou de face selon le rapport épaules / tronc', () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    lm[LM.sh.L] = { x: 0.48, y: 0.3, visibility: 0.9 };
    lm[LM.sh.R] = { x: 0.52, y: 0.3, visibility: 0.9 };
    lm[LM.hip.L] = { x: 0.48, y: 0.6, visibility: 0.9 };
    lm[LM.hip.R] = { x: 0.52, y: 0.6, visibility: 0.9 };
    expect(viewOf({ lm, w: 1000, h: 1000 })).toBe('profile');
    lm[LM.sh.L] = { x: 0.3, y: 0.3, visibility: 0.9 };
    lm[LM.sh.R] = { x: 0.7, y: 0.3, visibility: 0.9 };
    lm[LM.hip.L] = { x: 0.35, y: 0.6, visibility: 0.9 };
    lm[LM.hip.R] = { x: 0.65, y: 0.6, visibility: 0.9 };
    expect(viewOf({ lm, w: 1000, h: 1000 })).toBe('frontal');
  });
});

describe('ElbowSampler', () => {
  const feed = (s: ElbowSampler, values: readonly number[], dt = 50, t0 = 0): number => {
    values.forEach((v, i) => s.add(t0 + i * dt, { flexionDeg: v, visibility: 0.9, upperArmPx: 200, forearmPx: 180 }));
    return t0 + values.length * dt;
  };

  it('stable quand les échantillons couvrent la fenêtre et varient peu ; retient la médiane', () => {
    const s = new ElbowSampler();
    feed(
      s,
      Array.from({ length: 30 }, (_, i) => 24 + (i % 3) * 0.5),
    );
    const e = s.estimate();
    expect(e?.stable).toBe(true);
    expect(e?.flexionDeg).toBeCloseTo(24.5, 1);
    expect(e?.n).toBeGreaterThanOrEqual(12);
  });

  it('instable si le bras bouge', () => {
    const s = new ElbowSampler();
    feed(
      s,
      Array.from({ length: 30 }, (_, i) => 20 + (i % 2) * 20),
    );
    expect(s.estimate()?.stable).toBe(false);
  });

  it('pas prête sans assez d’échantillons ; un repère perdu remet à zéro', () => {
    const s = new ElbowSampler();
    feed(s, [25, 25, 25, 25]);
    expect(s.estimate()?.stable).toBe(false);
    s.add(1000, null);
    expect(s.estimate()).toBeNull();
  });
});

describe('calcul d’ajustement (crans)', () => {
  it('dans la cible : aucun réglage', () => {
    const a = adviseAdjustment({ flexionDeg: 25, heightCm: 170 });
    expect(a).toMatchObject({ status: 'ok', direction: 'none', notches: 0, uncertain: false });
  });

  it('dans la marge d’erreur : refaire la mesure, pas de réglage', () => {
    const a = adviseAdjustment({ flexionDeg: 33, heightCm: 170 });
    expect(a).toMatchObject({ status: 'borderline', direction: 'none', notches: 0, uncertain: true });
    expect(a.message).toContain('refaire la mesure');
  });

  it('coude trop fléchi : DESCENDRE la poignée', () => {
    const a = adviseAdjustment({ flexionDeg: 55, heightCm: 170, notchCm: 2.5 });
    expect(a.status).toBe('too_flexed');
    expect(a.direction).toBe('down');
    expect(a.deltaCm).toBeLessThan(0);
    expect(a.notches).toBeGreaterThanOrEqual(1);
    expect(a.message).toContain('Descendre');
  });

  it('coude trop tendu : MONTER la poignée', () => {
    const a = adviseAdjustment({ flexionDeg: 2, heightCm: 170, notchCm: 2.5 });
    expect(a.status).toBe('too_extended');
    expect(a.direction).toBe('up');
    expect(a.deltaCm).toBeGreaterThan(0);
    expect(a.message).toContain('Monter');
  });

  it('le nombre de crans suit l’écart en cm et l’espacement des crans', () => {
    const fine = adviseAdjustment({ flexionDeg: 60, heightCm: 170, notchCm: 1.25 });
    const coarse = adviseAdjustment({ flexionDeg: 60, heightCm: 170, notchCm: 5 });
    expect(fine.notches).toBeGreaterThan(coarse.notches);
    expect(fine.notches).toBe(Math.max(1, Math.round(Math.abs(fine.deltaCm) / 1.25)));
  });

  it('géométrie : la distance épaule–main décroît avec la flexion (loi des cosinus)', () => {
    const u = ARM_PROPORTIONS.upperArm * 170;
    const f = (ARM_PROPORTIONS.forearm + ARM_PROPORTIONS.hand / 2) * 170;
    expect(shoulderToGrip(u, f, 0)).toBeCloseTo(u + f, 6);
    expect(shoulderToGrip(u, f, 90)).toBeCloseTo(Math.hypot(u, f), 6);
    expect(shoulderToGrip(u, f, 25)).toBeGreaterThan(shoulderToGrip(u, f, 45));
  });

  it('taille inconnue : conversion estimée et signalée ; jamais de formule par la taille de l’aide', () => {
    const a = adviseAdjustment({ flexionDeg: 55 });
    expect(a.assumedHeight).toBe(true);
    expect(a.message).toContain('Taille non renseignée');
    expect(adviseAdjustment({ flexionDeg: 55, heightCm: 180 }).assumedHeight).toBe(false);
  });

  it('un écart plus grand donne plus de crans', () => {
    const small = adviseAdjustment({ flexionDeg: 40, heightCm: 170 });
    const big = adviseAdjustment({ flexionDeg: 70, heightCm: 170 });
    expect(Math.abs(big.deltaCm)).toBeGreaterThan(Math.abs(small.deltaCm));
  });
});

describe('guide par aide technique', () => {
  it('chaque aide a repères, séquence, règles sourcées et vérification caméra', () => {
    for (const k of DEVICE_KINDS) {
      const g = deviceGuide(k);
      expect(g.landmarks.length).toBeGreaterThan(0);
      expect(g.sequence.length).toBeGreaterThan(0);
      expect(g.rules.length).toBeGreaterThan(0);
      expect(g.refs.length).toBeGreaterThan(0);
      expect(g.elbowCheck).toBe(true);
    }
  });

  it('canne : pli du poignet (et trochanter), côté controlatéral ; aucune formule par la taille', () => {
    const g = deviceGuide('cane');
    expect(g.landmarks.map((l) => l.id)).toEqual(['wrist_crease', 'greater_trochanter']);
    expect(g.formulaNotice).toContain('ne les utilise pas');
    expect(holdSide('cane', 'left')).toMatchObject({ side: 'R' });
    expect(holdSide('cane', 'right')).toMatchObject({ side: 'L' });
    expect(holdSide('cane', 'bilateral').side).toBe('either');
    expect(holdSide('walker', 'left').side).toBe('both');
    expect(holdSide('axillary_crutches', 'left').text).toContain('droit');
  });

  it('béquilles : repères sous l’aisselle / l’olécrâne ; le rollator garde la règle du frein', () => {
    expect(deviceGuide('axillary_crutches').landmarks[0]?.id).toBe('axilla');
    expect(deviceGuide('forearm_crutches').landmarks[0]?.id).toBe('olecranon');
    expect(deviceGuide('rollator').rules.some((r) => /^Rollator/.test(r.rule))).toBe(true);
    expect(deviceGuide('walker').rules.some((r) => /^Rollator/.test(r.rule))).toBe(false);
  });

  it('les séquences non sourcées sont marquées à vérifier', () => {
    expect(deviceGuide('axillary_crutches').sequence.some((s) => s.status === 'to_verify')).toBe(true);
    expect(deviceGuide('cane').sequence.every((s) => s.status === 'sourced')).toBe(true);
  });
});

describe('enregistrement dans le dossier', () => {
  const advice = adviseAdjustment({ flexionDeg: 55, heightCm: 170 });
  const rec = buildDeviceAssessment({
    id: 'as1',
    patientId: 'p1',
    ownerUid: 'u1',
    now: new Date('2026-11-22T12:00:00Z'),
    kind: 'cane',
    arm: 'R',
    flexionDeg: 55.04,
    confidence: 0.8,
    advice,
    affected: 'left',
  });

  it('crée une évaluation « custom » sans vidéo', () => {
    expect(rec).toMatchObject({
      kind: 'custom',
      videoRetained: false,
      schemaVersion: 1,
      patientId: 'p1',
      ownerUid: 'u1',
    });
    expect(rec.metrics[0]).toMatchObject({ metricId: 'elbow_flexion_support', value: 55, unit: '°', side: 'right' });
    expect(rec.conditions).toMatchObject({ type: 'assistive_device_fit', device: 'cane', status: 'too_flexed' });
  });

  it('crée une action de plan d’aide technique visible du patient, déjà validée', () => {
    const a = buildDeviceAction({
      id: 'a1',
      kind: 'cane',
      hold: holdSide('cane', 'left'),
      advice,
      flexionDeg: 55,
      assessmentId: 'as1',
    });
    expect(a).toMatchObject({
      kind: 'assistive_device',
      validated: true,
      clinicianEdited: true,
      audience: 'patient',
      side: 'R',
      deviceKind: 'cane',
    });
    expect(a.detail).toContain('as1');
    expect(a.refs).toContain('sehgal2021');
  });
});
