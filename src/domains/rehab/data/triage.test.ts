import { describe, expect, it } from 'vitest';
import { PATHOLOGIES, REGIONS } from './pathologies.ts';
import { LAY, QUESTIONS, START_QS, matchDiagnosis, scoreAnswers, startingPoint } from './triage.ts';

describe('startingPoint', () => {
  it('démarre en phase 1 ; le niveau dépend de l’irritabilité', () => {
    expect(startingPoint({}, 'high')).toEqual({ phase: 1, level: 1, weeksDone: 0 });
    expect(startingPoint({}, 'low')).toEqual({ phase: 1, level: 3, weeksDone: 0 });
    expect(startingPoint({})).toEqual({ phase: 1, level: 2, weeksDone: 0 });
  });
  it('reprend à la phase atteinte et décale la date de départ', () => {
    expect(startingPoint({ prior: 'w6' })).toEqual({ phase: 2, level: 2, weeksDone: 3 });
    expect(startingPoint({ prior: 'w7', how: 'easy' })).toEqual({ phase: 3, level: 3, weeksDone: 7 });
  });
  it('recule d’une phase si c’est difficile, et borne le niveau entre 1 et 5', () => {
    expect(startingPoint({ prior: 'w7', how: 'hard' }, 'high')).toEqual({ phase: 2, level: 1, weeksDone: 7 });
    expect(startingPoint({ how: 'easy' }, 'low').level).toBe(4);
  });
  it('une douleur aiguë très irritable force la phase 1', () => {
    expect(startingPoint({ since: 'acute', prior: 'w7' }, 'high').phase).toBe(1);
  });
  it('la question « how » n’est posée que si des exercices ont déjà été commencés', () => {
    const how = START_QS.find((q) => q.id === 'how');
    expect(how?.when?.({ prior: 'no' })).toBeFalsy();
    expect(how?.when?.({ prior: 'w2' })).toBeTruthy();
  });
});

describe('matchDiagnosis', () => {
  it('ignore un texte trop court', () => {
    expect(matchDiagnosis('', PATHOLOGIES)).toEqual([]);
    expect(matchDiagnosis(null, PATHOLOGIES)).toEqual([]);
  });
  it('reconnaît un diagnostic écrit librement (sans accents ni casse)', () => {
    const r = matchDiagnosis('Tennis elbow depuis 2 mois', PATHOLOGIES);
    expect(r[0]?.id).toBe('lat_epi');
    expect(r.regions).toContain('elbow');
    expect(r.length).toBeLessThanOrEqual(3);
  });
  it('utilise la fonction de traduction fournie pour les autres langues', () => {
    const r = matchDiagnosis('dolor de codo epicondilitis', PATHOLOGIES, {
      tr: (b) => (b.en === 'Tennis elbow' ? 'epicondilitis' : b.fr),
      regions: REGIONS,
    });
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('scoreAnswers', () => {
  it('additionne les points des réponses et trie par score décroissant', () => {
    const r = scoreAnswers('cervical', [1], PATHOLOGIES);
    expect(r[0]).toEqual({ id: 'cerv_radic', score: 3 });
    const scores = r.map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
  it('ne liste que les pathologies de la région, même sans réponse', () => {
    const r = scoreAnswers('knee', [], PATHOLOGIES);
    expect(r.every((x) => PATHOLOGIES.find((p) => p.id === x.id)?.region === 'knee')).toBe(true);
    expect(r.every((x) => x.score === 0)).toBe(true);
  });
});

describe('données de triage', () => {
  it('chaque pathologie a un nom simple (LAY) et les questions ciblent des pathologies existantes', () => {
    const ids = new Set<string>(PATHOLOGIES.map((p) => p.id));
    for (const id of ids) expect(LAY, id).toHaveProperty(id);
    for (const qs of Object.values(QUESTIONS)) {
      for (const q of qs) for (const o of q.opts) for (const id of Object.keys(o.s)) expect(ids.has(id), id).toBe(true);
    }
  });
});
