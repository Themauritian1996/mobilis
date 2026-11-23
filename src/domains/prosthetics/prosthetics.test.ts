import { describe, expect, it } from 'vitest';
import { DEFAULT_GAIT_CONFIG, type FindingStatus } from '../gait/index.ts';
import { assessProstheticGait, PROSTHETIC_DEVIATIONS, type ProstheticAssessment } from './index.ts';
import { compareProstheticAssessments } from './compare.ts';
import {
  buildChecklist,
  buildProstheticReport,
  causeGroups,
  confidenceLevel,
  fmtNumber,
  formatValue,
  parseProstheticAssessment,
  prostheticHistory,
  summarize,
  validateProfile,
} from './report.ts';

type Dev = ProstheticAssessment['deviations'][number];

/** Évaluation de départ : aucune donnée (le moteur rend toutes les déviations du niveau, « données insuffisantes »). */
const base = (level: 'transtibial' | 'transfemoral' = 'transtibial'): ProstheticAssessment =>
  assessProstheticGait([], { level, side: 'left' }, DEFAULT_GAIT_CONFIG);

const withStatus = (p: ProstheticAssessment, st: Record<string, FindingStatus>, score = 0.6): ProstheticAssessment => ({
  ...p,
  deviations: p.deviations.map((d): Dev => (d.id in st ? { ...d, status: st[d.id] as FindingStatus, score } : d)),
});

describe('rapport prothétique', () => {
  it('contient TOUTES les déviations du catalogue pour le niveau', () => {
    for (const lvl of ['transtibial', 'transfemoral'] as const) {
      const expected = PROSTHETIC_DEVIATIONS.filter((d) => d.levels.includes(lvl)).length;
      const rep = buildProstheticReport(base(lvl));
      expect(rep.entries).toHaveLength(expected);
      expect(rep.entries.length).toBeGreaterThan(10);
    }
  });

  it('classe présentes, possibles, à observer, puis absentes', () => {
    const p = withStatus(base(), {
      abducted_gait: 'absent',
      foot_rotation: 'observe',
      prosthetic_foot_slap: 'possible',
      knee_instability: 'probable',
    });
    const states = buildProstheticReport(p).entries.map((e) => e.state);
    expect(states.indexOf('present')).toBeLessThan(states.indexOf('possible'));
    expect(states.indexOf('possible')).toBeLessThan(states.indexOf('observe'));
    expect(states.indexOf('observe')).toBeLessThan(states.lastIndexOf('absent') + 1);
    expect(states.at(-1)).toBe('absent');
  });

  it('les déviations non mesurables en 2D portent une note « à observer » et une faible confiance', () => {
    const p = withStatus(base(), { foot_rotation: 'observe', pistoning: 'observe' });
    const rep = buildProstheticReport(p);
    for (const id of ['foot_rotation', 'pistoning']) {
      const e = rep.entries.find((x) => x.id === id);
      expect(e?.observeNote).toBeTruthy();
      expect(e?.confidence).toBe('low');
      expect(e?.measured).toHaveLength(0);
    }
  });

  it('classe les causes par catégorie dans l’ordre alignement → … → habitude/peur', () => {
    const g = causeGroups('abducted_gait');
    expect(g.map((x) => x.category)).toEqual([
      'alignment',
      'socket_suspension',
      'length',
      'weakness_rom',
      'pain',
      'habit_fear',
    ]);
    expect(g.every((x) => x.items.length > 0 && x.label.length > 0)).toBe(true);
    expect(causeGroups('inconnue')).toEqual([]);
  });

  it('renseigne pistes d’ajustement, exercices et références pour chaque déviation', () => {
    for (const e of buildProstheticReport(base('transfemoral')).entries) {
      expect(e.adjustments.length, e.id).toBeGreaterThan(0);
      expect(e.refs.length, e.id).toBeGreaterThan(0);
      expect(e.causes.length, e.id).toBeGreaterThan(0);
    }
  });

  it('niveau de confiance', () => {
    expect(confidenceLevel('probable', 0.7)).toBe('high');
    expect(confidenceLevel('possible', 0.4)).toBe('moderate');
    expect(confidenceLevel('possible', 0.1)).toBe('low');
    expect(confidenceLevel('observe', 0.9)).toBe('low');
    expect(confidenceLevel('absent', 0)).toBe('none');
  });

  it('mise en forme des nombres et des valeurs', () => {
    expect(fmtNumber(12.34, 'fr')).toBe('12,3');
    expect(fmtNumber(12.34, 'en')).toBe('12.3');
    expect(fmtNumber(5, 'fr')).toBe('5');
    expect(formatValue(12.34, '°')).toBe('12,3°');
    expect(formatValue(0.05, 'm')).toBe('0,05 m');
    expect(formatValue(45, '%')).toBe('45 %');
    expect(formatValue(null, '°')).toBeNull();
    expect(formatValue(Number.NaN, '°')).toBeNull();
  });
});

describe('liste de vérification', () => {
  it('retient présentes et possibles ; « à observer » dans une section à part ; sécurité en tête', () => {
    const p = withStatus(base(), {
      abducted_gait: 'possible',
      knee_instability: 'probable',
      foot_rotation: 'observe',
      drop_off: 'absent',
    });
    const c = buildChecklist(p);
    const ids = c.retained.map((x) => x.id);
    expect(ids).toContain('abducted_gait');
    expect(ids).toContain('knee_instability');
    expect(ids).not.toContain('drop_off');
    expect(ids).not.toContain('foot_rotation');
    expect(c.toObserve.map((x) => x.id)).toContain('foot_rotation');
    expect(c.retained[0]?.safety).toBeTruthy();
    expect(c.retained.every((x) => x.causes.length > 0 && x.adjustments.length > 0)).toBe(true);
    expect(c.disclaimer).toMatch(/valider|équipe/i);
  });

  it('liste vide quand rien n’est retenu', () => {
    const c = buildChecklist(base());
    expect(c.retained).toEqual([]);
  });
});

describe('comparaison avant / après', () => {
  const a = withStatus(base(), {
    abducted_gait: 'probable',
    prosthetic_vaulting: 'probable',
    drop_off: 'possible',
    prosthetic_foot_slap: 'absent',
    foot_rotation: 'observe',
    knee_instability: 'absent',
  });
  const b = withStatus(base(), {
    abducted_gait: 'absent',
    prosthetic_vaulting: 'probable',
    drop_off: 'insufficient_data',
    prosthetic_foot_slap: 'probable',
    foot_rotation: 'observe',
    knee_instability: 'absent',
  });
  const cmp = compareProstheticAssessments(a, b);
  const ids = (l: readonly { id: string }[]): string[] => l.map((x) => x.id);

  it('déviations résolues, apparues et persistantes', () => {
    expect(ids(cmp.resolved)).toEqual(['abducted_gait']);
    expect(ids(cmp.appeared)).toEqual(['prosthetic_foot_slap']);
    expect(ids(cmp.persistent)).toEqual(['prosthetic_vaulting']);
  });

  it('ne conclut pas à une résolution quand B est insuffisant ou à observer', () => {
    expect(ids(cmp.unassessable)).toContain('drop_off');
    expect(ids(cmp.unassessable)).toContain('foot_rotation');
    expect(ids(cmp.resolved)).not.toContain('drop_off');
  });

  it('compte les absences communes et marque la validation clinique', () => {
    expect(cmp.absentBoth).toBeGreaterThanOrEqual(1);
    expect(cmp.requiresClinicianValidation).toBe(true);
    expect(cmp.warnings).toEqual([]);
  });

  it('tendance d’une déviation persistante (écart de score ≥ 0,1)', () => {
    const worse = compareProstheticAssessments(
      withStatus(base(), { prosthetic_vaulting: 'probable' }, 0.4),
      withStatus(base(), { prosthetic_vaulting: 'probable' }, 0.7),
    );
    expect(worse.persistent[0]?.trend).toBe('worse');
    expect(worse.persistent[0]?.scoreDelta).toBe(0.3);
    const same = compareProstheticAssessments(
      withStatus(base(), { prosthetic_vaulting: 'possible' }, 0.4),
      withStatus(base(), { prosthetic_vaulting: 'probable' }, 0.45),
    );
    expect(same.persistent[0]?.trend).toBe('same');
    const better = compareProstheticAssessments(
      withStatus(base(), { prosthetic_vaulting: 'probable' }, 0.7),
      withStatus(base(), { prosthetic_vaulting: 'possible' }, 0.4),
    );
    expect(better.persistent[0]?.trend).toBe('better');
  });

  it('signale un niveau ou un côté différent et un catalogue différent', () => {
    const tf = base('transfemoral');
    const w = compareProstheticAssessments(base('transtibial'), tf);
    expect(w.warnings).toContain('level_differs');
    expect(w.warnings).toContain('catalog_differs');
    const right: ProstheticAssessment = { ...base(), prosthesis: { level: 'transtibial', side: 'right' } };
    expect(compareProstheticAssessments(base(), right).warnings).toEqual(['side_differs']);
  });

  it('est symétrique pour deux évaluations identiques', () => {
    const same = compareProstheticAssessments(a, a);
    expect(same.appeared).toEqual([]);
    expect(same.resolved).toEqual([]);
    expect(ids(same.persistent).sort()).toEqual(['abducted_gait', 'drop_off', 'prosthetic_vaulting']);
  });
});

describe('historique, résumé et profil', () => {
  it('filtre et trie les évaluations prothétiques du patient (récentes d’abord)', () => {
    const list = [
      { id: '1', patientId: 'p', kind: 'prosthetic_gait', performedAt: '2026-01-01T10:00:00Z' },
      { id: '2', patientId: 'p', kind: 'gait', performedAt: '2026-03-01T10:00:00Z' },
      { id: '3', patientId: 'q', kind: 'prosthetic_gait', performedAt: '2026-04-01T10:00:00Z' },
      { id: '4', patientId: 'p', kind: 'prosthetic_gait', performedAt: '2026-02-01T10:00:00Z' },
    ];
    expect(prostheticHistory(list, 'p').map((x) => x.id)).toEqual(['4', '1']);
  });

  it('résume les déviations', () => {
    const p = withStatus(base(), {
      abducted_gait: 'probable',
      drop_off: 'possible',
      foot_rotation: 'observe',
      pistoning: 'absent',
    });
    expect(summarize(p)).toEqual({ present: 1, possible: 1, observe: 1 });
  });

  it('parseProstheticAssessment accepte result.prosthetic et refuse le reste', () => {
    const p = base();
    expect(parseProstheticAssessment({ prosthetic: p })?.deviations).toHaveLength(p.deviations.length);
    expect(parseProstheticAssessment(JSON.parse(JSON.stringify({ prosthetic: p })))).not.toBeNull();
    expect(parseProstheticAssessment(undefined)).toBeNull();
    expect(parseProstheticAssessment({})).toBeNull();
    expect(parseProstheticAssessment({ prosthetic: { deviations: [1] } })).toBeNull();
  });

  it('valide le profil prothétique', () => {
    const ok = validateProfile(
      { level: 'transtibial', side: 'left', socket: ' PTB ', amputationDate: '2024-05-01' },
      '2026-11-22',
    );
    expect(ok).toEqual({
      ok: true,
      profile: { level: 'transtibial', side: 'left', socket: 'PTB', amputationDate: '2024-05-01' },
    });
    expect(validateProfile({ level: 'x', side: '' }, '2026-11-22')).toEqual({ ok: false, errors: ['level', 'side'] });
    expect(validateProfile({ level: 'syme', side: 'right', amputationDate: '2027-01-01' }, '2026-11-22')).toEqual({
      ok: false,
      errors: ['date'],
    });
    expect(validateProfile({ level: 'syme', side: 'right', amputationDate: '2026-02-30' }, '2026-11-22').ok).toBe(
      false,
    );
  });
});
