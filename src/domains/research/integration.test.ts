import { describe, expect, it } from 'vitest';
import { extractValue, isPainMeasure, measureUnit, resolveStudyNotes, saveStudy, saveStudyNotes } from './index.ts';
import type { RepoContext } from './repo.ts';
import { memoryDb, metricAssessment } from './testing/fixtures.ts';

const ctx: RepoContext = { uid: 'clin', now: () => new Date('2026-01-01T12:00:00.000Z'), newId: (p) => `${p}1` };
const draft = { name: 'E', measures: [], timepoints: [], conditions: [], anonymizeExports: true };

describe('douleur : nouvel et ancien encodage', () => {
  const neu = { id: 'pain', kind: 'pain', label: 'Douleur' } as const;
  const old = { id: 'pain', kind: 'prom', label: 'Douleur', metricId: 'pain_nrs' } as const;
  it('reconnaît les deux encodages', () => {
    expect(isPainMeasure(neu)).toBe(true);
    expect(isPainMeasure(old)).toBe(true);
    expect(isPainMeasure({ kind: 'prom', metricId: 'nprs' })).toBe(false);
    expect(measureUnit(neu)).toBe('/10');
    expect(measureUnit(old)).toBe('/10');
  });
  it('lit la valeur enregistrée', () => {
    const a = metricAssessment('a', 'p', '2026-01-01T00:00:00Z', [{ metricId: 'pain_nrs', value: 4 }]);
    expect(extractValue(neu, a)?.value).toBe(4);
    expect(extractValue(old, a)?.value).toBe(4);
  });
});

describe("notes d'étude", () => {
  it('Study.notes prime, sinon reprise de la note locale', () => {
    expect(resolveStudyNotes({}, 'locale')).toEqual({ notes: 'locale', migrate: true });
    expect(resolveStudyNotes({}, '  ')).toEqual({ notes: '  ', migrate: false });
    expect(resolveStudyNotes({ notes: 'étude' }, 'locale')).toEqual({ notes: 'étude', migrate: false });
    expect(resolveStudyNotes({ notes: '' }, 'locale')).toEqual({ notes: '', migrate: false });
  });
  it('enregistre et conserve les notes lors de la mise à jour du protocole', async () => {
    const db = memoryDb();
    const st = await saveStudy(db, ctx, draft);
    await saveStudyNotes(db, ctx, st.id, 'ma note');
    expect((await db.get('studies', st.id))?.notes).toBe('ma note');
    const again = await saveStudy(db, ctx, { ...draft, id: st.id, name: 'E2' });
    expect(again.notes).toBe('ma note');
  });
});
