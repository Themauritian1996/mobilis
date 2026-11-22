import { describe, expect, it } from 'vitest';
import { FREE_ORDER, INSTRUMENTS, LICENSED_ORDER } from './data/proms.ts';
import {
  band,
  customToDef,
  due,
  instrumentDef,
  isAvailable,
  isCustomId,
  mergeLicenses,
  nItemsOf,
  resolveDef,
  score,
  suggestFor,
  summaryPart,
  trend,
  validateLicense,
} from './proms.ts';

const DAY = 86400000;

describe('catalogue', () => {
  it('les ordres d’affichage ne citent que des instruments connus', () => {
    for (const id of [...FREE_ORDER, ...LICENSED_ORDER]) expect(INSTRUMENTS, id).toHaveProperty(id);
  });
  it('le catalogue sous licence ne contient aucun texte d’item', () => {
    for (const id of LICENSED_ORDER) {
      expect(INSTRUMENTS[id]?.kind).toBe('licensed');
      expect(INSTRUMENTS[id]?.items).toEqual([]);
    }
  });
});

describe('score', () => {
  it('NPRS : moyenne des items répondus, avec sous-scores', () => {
    const r = score('nprs', [4, 6, 8]);
    expect(r).toMatchObject({ score: 6, valid: true, answered: 3, total: 3 });
    expect(r.sub).toEqual({ now: 4, avg: 6, worst: 8 });
    expect(score('nprs', [null, null, null]).valid).toBe(false);
  });
  it('un instrument inconnu ou des valeurs hors échelle donnent un score nul', () => {
    expect(score('inconnu', [1])).toEqual({ score: null, valid: false, answered: 0, total: 0 });
    expect(score('sane', [150]).score).toBeNull();
  });
  it('MFQ : 0–4 de difficulté devient 0–100 (100 = aucune limitation) ; valide si 75 % des items', () => {
    expect(score('mfq_knee', [0, 0, 0, 0, 0, 0, 0, 0]).score).toBe(100);
    expect(score('mfq_knee', [4, 4, 4, 4, 4, 4, 4, 4]).score).toBe(0);
    expect(score('mfq_knee', [2, 2, 2, 2, 2, 2, null, null]).score).toBe(50);
    expect(score('mfq_knee', [2, 2, 2, 2, 2, null, null, null]).valid).toBe(false);
  });
  it('QuickDASH : ((somme/n) − 1) × 25, au moins 10 items', () => {
    expect(score('quickdash', Array(11).fill(1)).score).toBe(0);
    expect(score('quickdash', Array(11).fill(5)).score).toBe(100);
    expect(score('quickdash', [...Array(9).fill(3), null, null]).valid).toBe(false);
  });
  it('KOOS-12 : sous-échelles puis moyenne ; sous-échelle invalide sous 3 items', () => {
    const r = score('koos12', Array(12).fill(2));
    expect(r.score).toBe(50);
    expect(r.sub).toEqual({ pain: 50, function: 50, qol: 50 });
    const bad = score('koos12', [2, 2, null, null, ...Array(8).fill(2)]);
    expect(bad.valid).toBe(false);
    expect(bad.sub?.pain).toBeNull();
  });
  it('SPADI : douleur et incapacité en pourcentage, total = moyenne', () => {
    expect(score('spadi', Array(13).fill(5)).score).toBe(50);
  });
  it('LEFS : somme 0–80, proratisée jusqu’à 2 manquants', () => {
    expect(score('lefs', Array(20).fill(4)).score).toBe(80);
    expect(score('lefs', [...Array(18).fill(4), null, null]).score).toBe(80);
    expect(score('lefs', [...Array(17).fill(4), null, null, null]).valid).toBe(false);
  });
  it('ODI / NDI : pourcentage de la somme maximale des sections répondues', () => {
    expect(score('odi', Array(10).fill(5)).score).toBe(100);
    expect(score('ndi', [...Array(9).fill(1), null]).score).toBe(20);
    expect(score('odi', [...Array(8).fill(1), null, null]).valid).toBe(false);
  });
  it('questionnaire personnalisé : somme, moyenne ou pourcentage', () => {
    const base = { id: 'c_1', title: 'T', questions: ['a', 'b'], scale: '0-10' as const };
    expect(score(customToDef({ ...base, score: 'sum' }), [3, 4]).score).toBe(7);
    expect(score(customToDef({ ...base, score: 'mean' }), [3, 4]).score).toBe(3.5);
    expect(score(customToDef({ ...base, score: 'pct' }), [5, 5]).score).toBe(50);
    expect(score(customToDef({ ...base, score: 'sum' }), [3]).valid).toBe(false);
  });
});

describe('band', () => {
  it('interprète la position dans l’échelle selon le sens favorable', () => {
    const better = { range: [0, 100] as const, higherIsBetter: true };
    const worse = { range: [0, 100] as const, higherIsBetter: false };
    expect(band(better, 90)).toBe(0);
    expect(band(better, 70)).toBe(1);
    expect(band(better, 50)).toBe(2);
    expect(band(better, 10)).toBe(3);
    expect(band(worse, 10)).toBe(0);
    expect(band(worse, null)).toBeNull();
  });
});

describe('questionnaires personnalisés et licences', () => {
  it('isCustomId et instrumentDef', () => {
    expect(isCustomId('c_abc')).toBe(true);
    expect(isCustomId('nprs')).toBe(false);
    expect(isCustomId(12)).toBe(false);
    expect(instrumentDef('nprs')?.id).toBe('nprs');
    expect(instrumentDef('c_x', [{ id: 'c_x', title: 'X', questions: ['q'] }])?.kind).toBe('custom');
    expect(instrumentDef('c_absent', [])).toBeNull();
    expect(instrumentDef('zzz')).toBeNull();
  });
  it('customToDef : échelle par défaut, questions vides ignorées, mode par défaut « mean »', () => {
    expect(customToDef(null)).toBeNull();
    const d = customToDef({ id: 'c_1', questions: ['a', ' ', { text: 'b' }, null], scale: 'likert', score: 'zzz' });
    expect(d?.items.map((i) => i.text)).toEqual(['a', 'b']);
    expect(d?.mode).toBe('mean');
    expect(d?.range).toEqual([0, 4]);
    expect(d?.name).toBe('Questionnaire');
  });
  it('validateLicense : refuse les fichiers invalides, accepte le bon nombre d’items', () => {
    expect(validateLicense('pas du json')).toEqual({ ok: false, error: 'json' });
    expect(validateLicense({ instrument: 'nprs', items: [] })).toEqual({ ok: false, error: 'instrument' });
    expect(validateLicense({ instrument: 'odi', items: ['a'] })).toEqual({ ok: false, error: 'items' });
    const items = Array.from({ length: 10 }, (_, i) => ({ fr: 'f' + i, en: 'e' + i }));
    expect(validateLicense({ instrument: 'odi', items, options: ['a'] })).toEqual({ ok: false, error: 'options' });
    const ok = validateLicense(JSON.stringify({ instrument: 'odi', items, options: ['0', '1', '2', '3', '4', '5'] }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.id).toBe('odi');
      expect(ok.entry.options?.[2]).toEqual({ fr: '2', en: '2' });
    }
  });
  it('mergeLicenses : les textes locaux sont prioritaires, les entrées invalides sont écartées', () => {
    const mk = (n: number, tag: string) => ({ items: Array.from({ length: n }, () => ({ fr: tag, en: tag })) });
    const merged = mergeLicenses({ odi: mk(10, 'emb'), ndi: mk(3, 'emb') }, { odi: mk(10, 'loc') });
    expect(Object.keys(merged)).toEqual(['odi']);
    expect((merged.odi?.items[0] as { fr: string }).fr).toBe('loc');
  });
  it('resolveDef : licence manquante, activités dynamiques, instrument libre', () => {
    expect(resolveDef('odi')).toMatchObject({ available: false, items: [] });
    expect(isAvailable('odi')).toBe(false);
    expect(isAvailable('activities', { activities: ['a', 'b'] })).toBe(false);
    expect(isAvailable('activities', { activities: ['a', 'b', 'c'] })).toBe(true);
    expect(resolveDef('activities', { activities: ['a', 'b', 'c', 'd', 'e', 'f'] })?.items).toHaveLength(5);
    expect(isAvailable('nprs')).toBe(true);
    expect(resolveDef('zzz')).toBeNull();
    const items = Array.from({ length: 10 }, () => ({ fr: 'x', en: 'x' }));
    const r = resolveDef('odi', { licenses: { odi: { items } } });
    expect(r?.available).toBe(true);
    expect(r?.items).toHaveLength(10);
    expect(nItemsOf(INSTRUMENTS.odi!)).toBe(10);
  });
});

describe('due', () => {
  const start = new Date(2026, 0, 5, 10).getTime();
  it('premier questionnaire dû après `first` jours', () => {
    const plan = [{ id: 'nprs', every: 2, first: 3 }];
    expect(due(plan, [], start, start + 2 * DAY)).toEqual([]);
    const r = due(plan, [], start, start + 5 * DAY);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'nprs', lastTs: null, overdueDays: 2 });
  });
  it('échéance suivante = dernière passation + every semaines ; every 0 = une seule fois', () => {
    const last = start + 3 * DAY;
    const plan = [{ id: 'nprs', every: 1 }];
    expect(due(plan, [{ id: 'nprs', ts: last }], start, last + 6 * DAY)).toEqual([]);
    expect(due(plan, [{ id: 'nprs', ts: last }], start, last + 8 * DAY)[0]?.lastTs).toBe(last);
    expect(due([{ id: 'pgic', every: 0 }], [{ id: 'pgic', ts: last }], start, last + 90 * DAY)).toEqual([]);
  });
  it('ignore les entrées sans identifiant et accepte des plans absents', () => {
    expect(due(null, null, start)).toEqual([]);
    expect(due([{}, null], [], start, start + DAY)).toEqual([]);
  });
});

describe('trend', () => {
  const log = (rows: [number, number][], id = 'nprs') => rows.map(([ts, s]) => ({ id, ts, score: s }));
  it('sans mesure : valeurs vides', () => {
    expect(trend([], 'nprs')).toMatchObject({ n: 0, baseline: null, last: null, delta: null });
  });
  it('une seule mesure : pas de delta', () => {
    expect(trend(log([[1, 5]]), 'nprs')).toMatchObject({ n: 1, baseline: 5, last: 5, delta: null });
  });
  it('douleur : amélioration = baisse ; DMCI atteint à 2 points ou 30 %', () => {
    const r = trend(
      log([
        [1, 7],
        [2, 4],
      ]),
      'nprs',
    );
    expect(r).toMatchObject({ delta: -3, improvement: 3, mcidReached: true, worsened: false });
    const w = trend(
      log([
        [1, 3],
        [2, 6],
      ]),
      'nprs',
    );
    expect(w).toMatchObject({ improvement: -3, worsened: true, mcidReached: false });
  });
  it('PGIC : seuil sur la dernière réponse', () => {
    expect(trend(log([[1, 2]], 'pgic'), 'pgic').mcidReached).toBe(true);
    expect(trend(log([[1, 5]], 'pgic'), 'pgic').mcidReached).toBe(false);
  });
});

describe('summaryPart et suggestFor', () => {
  it('résume le journal par questionnaire (séries triées, id inconnu ignoré)', () => {
    const profile = {
      promLog: [
        { id: 'sane', ts: 2, score: 60 },
        { id: 'sane', ts: 1, score: 40 },
        { id: 'zzz', ts: 1, score: 1 },
      ],
    };
    const { prom } = summaryPart(profile);
    expect(prom).toHaveLength(1);
    expect(prom[0]).toMatchObject({ id: 'sane', n: 2, delta: 20, higherIsBetter: true });
    expect(prom[0]?.series).toEqual([
      [1, 40],
      [2, 60],
    ]);
    expect(summaryPart(null)).toEqual({ prom: [] });
  });
  it('suggestFor : instruments généraux + ceux de la région', () => {
    const r = suggestFor('knee');
    expect(r.general).toContain('nprs');
    expect(r.region).toEqual(expect.arrayContaining(['mfq_knee', 'koos12', 'lefs']));
    expect(suggestFor('lumbar').region).toContain('odi');
  });
});
