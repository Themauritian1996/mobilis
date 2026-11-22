import { describe, expect, it } from 'vitest';
import { assertCompleteChain, migrate } from '../../../core/schema.ts';
import {
  BACKUP_APP,
  BACKUP_VERSION,
  LEGACY_MIGRATIONS,
  makeBackup,
  mergeBackup,
  migrateJournal,
  migrateProfile,
  migrateSessions,
  parseBackup,
} from './migrations.ts';
import type { StoredData, StoredProfile } from './stored.ts';

describe('migrations des données stockées', () => {
  it('profil v1.15 : valeurs par défaut, types invalides corrigés, rien de perdu', () => {
    const p = migrateProfile({
      days: [5, 1, 1, 9],
      phase: 7,
      levels: [],
      swaps: 'x',
      custom: 42,
      rxCode: 'ABC234',
    } as StoredProfile);
    expect(p).toMatchObject({
      role: 'patient',
      days: [1, 5],
      perWeek: 2,
      phase: 1,
      levels: {},
      irritability: 'med',
      painBase: 3,
      custom: 42,
      rxVersion: 1,
    });
    expect(p).not.toHaveProperty('swaps');
    expect(p!.rxAt).toBe(p!.startDate);
    expect(migrateProfile(null)).toBeNull();
  });

  it('séances et journal : entrées invalides retirées, champs manquants complétés', () => {
    const s = migrateSessions([null, { id: 1, date: 5, items: [null, { id: 'a' }] }, { date: 1 }, 'x']);
    expect(s).toHaveLength(1);
    expect(s[0]!.items).toEqual([{ id: 'a', sets: [] }]);
    expect(migrateSessions(undefined)).toEqual([]);
    expect(migrateJournal([{ day: '2026-01-01' }, { x: 1 }, null])).toEqual([{ day: '2026-01-01' }]);
    expect(migrateJournal('x')).toEqual([]);
  });

  it('sauvegarde : aller-retour, sans clé ni accès partagé', () => {
    const data: Partial<StoredData> = {
      profile: { phase: 2, geminiKey: 'SECRET', sharedAI: { key: 'K' } },
      sessions: [{ id: 's1', date: 10, items: [] }],
      journal: [{ day: '2026-01-02' }],
    };
    const text = makeBackup({ ...data, user: 'a@b.c' });
    expect(JSON.parse(text)).toMatchObject({ app: BACKUP_APP, v: BACKUP_VERSION, user: 'a@b.c' });
    const back = parseBackup(text);
    expect(back.profile).not.toHaveProperty('geminiKey');
    expect(back.profile).not.toHaveProperty('sharedAI');
    expect(back.sessions).toHaveLength(1);
    expect(() => parseBackup('pas du json')).toThrow('json');
    expect(() => parseBackup(JSON.stringify({ app: 'autre' }))).toThrow('format');
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP }))).toThrow('empty');
  });

  it('fusion : séances par id, journal par jour, journaux du profil ajoutés', () => {
    const cur: StoredData = {
      profile: { phase: 2, romLog: [{ ts: 1, test: 'a' }], badges: { b1: 1 } },
      sessions: [{ id: 's1', date: 20, items: [] }],
      journal: [{ day: '2026-01-02', pain: 1 }],
    };
    const bk: StoredData = {
      profile: {
        phase: 3,
        romLog: [
          { ts: 1, test: 'a' },
          { ts: 2, test: 'b' },
        ],
        badges: { b2: 2 },
      },
      sessions: [
        { id: 's1', date: 99, items: [] },
        { id: 's0', date: 5, items: [] },
      ],
      journal: [{ day: '2026-01-02', pain: 9 }, { day: '2026-01-01' }],
    };
    const m = mergeBackup(cur, bk);
    expect(m.sessions.map((s) => s.id)).toEqual(['s0', 's1']);
    expect(m.sessions[1]!.date).toBe(20);
    expect(m.journal.map((j) => j.day)).toEqual(['2026-01-01', '2026-01-02']);
    expect(m.profile!.phase).toBe(2);
    expect(m.profile!['romLog']).toEqual([
      { ts: 1, test: 'a' },
      { ts: 2, test: 'b' },
    ]);
    expect(m.profile!['badges']).toEqual({ b2: 2, b1: 1 });
    expect(mergeBackup(cur, bk, { replaceProfile: true }).profile!.phase).toBe(3);
    expect(mergeBackup({ profile: null, sessions: [], journal: [] }, bk).profile).toBe(bk.profile);
  });

  it('chaîne de migration 0 → 1 complète (schéma versionné)', () => {
    const schema = { name: 'profil', current: 1, migrations: LEGACY_MIGRATIONS };
    expect(() => assertCompleteChain(schema)).not.toThrow();
    const migrated = migrate(schema, { phase: 9 });
    expect(migrated).toMatchObject({ schemaVersion: 1, phase: 1, role: 'patient' });
  });
});
