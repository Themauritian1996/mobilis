// Persistance au long cours : migration des anciens profils / séances / journal, sauvegarde et restauration (fichier JSON).
// Fonctions pures (aucun accès au DOM ni au réseau), testées dans tests/longterm.test.mjs et migrations.test.ts.
// Migration « 0 → 1 » (src/core/schema.ts) : LEGACY_MIGRATIONS décrit le saut sans l'appliquer au flux v1.15, car il
// ajouterait `schemaVersion` aux documents stockés (forme interdite à changer pendant la migration, docs/MIGRATION.md règle 8).
import type { Migration } from '../../../core/schema.ts';
import type { StoredData, StoredJournalEntry, StoredProfile, StoredSession } from './stored.ts';

export const BACKUP_APP = 'mobilis-backup';
export const BACKUP_VERSION = 1;

const isDay = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6;
// Remet un ancien profil au format courant : champs absents → valeurs par défaut, types invalides → corrigés. Ne perd rien.
export function migrateProfile<P extends StoredProfile | null | undefined>(p: P): P {
  if (!p || typeof p !== 'object') return p;
  const o: StoredProfile = { ...p };
  if (!o.role) o.role = 'patient';
  o.days = Array.isArray(o.days) && o.days.filter(isDay).length ? [...new Set(o.days.filter(isDay))].sort() : [1, 3, 5];
  o.perWeek = o.days.length;
  if (![1, 2, 3].includes(o.phase as number)) o.phase = 1;
  if (!o.levels || typeof o.levels !== 'object' || Array.isArray(o.levels)) o.levels = {};
  for (const k of ['rxDose', 'autoEx', 'maxLevel', 'partialEx', 'swaps', 'doseOver'])
    if (o[k] !== undefined && o[k] !== null && (typeof o[k] !== 'object' || Array.isArray(o[k])))
      Reflect.deleteProperty(o, k);
  if (o.plan && !(Array.isArray(o.plan.ids) && o.plan.ids.length)) o.plan = null;
  if (!Number.isFinite(o.joinedAt)) o.joinedAt = Number.isFinite(o.startDate) ? o.startDate : Date.now();
  if (!Number.isFinite(o.startDate)) o.startDate = o.joinedAt;
  if (!['low', 'med', 'high'].includes(o.irritability as string)) o.irritability = 'med';
  if (typeof o.painBase !== 'number') o.painBase = 3;
  if (o.rxCode && !Number.isFinite(o.rxVersion)) o.rxVersion = 1;
  if (o.rxCode && !Number.isFinite(o.rxAt)) o.rxAt = o.startDate; // début du programme actuel (sert à détecter sa fin)
  return o as P;
}
export function migrateSessions(list: unknown): StoredSession[] {
  return (Array.isArray(list) ? (list as (StoredSession | null)[]) : [])
    .filter((s): s is StoredSession => !!s && typeof s === 'object' && s.id !== undefined && s.id !== null)
    .map((s) => ({
      ...s,
      date: Number.isFinite(s.date) ? s.date : Date.now(),
      items: (Array.isArray(s.items) ? s.items : [])
        .filter(Boolean)
        .map((i) => ({ ...i, sets: Array.isArray(i.sets) ? i.sets : [] })),
    }));
}
export const migrateJournal = (j: unknown): StoredJournalEntry[] =>
  Array.isArray(j) ? (j as (StoredJournalEntry | null)[]).filter((e): e is StoredJournalEntry => !!e && !!e.day) : [];

/** Saut de schéma 0 → 1 (documents v1.15 sans `schemaVersion`), pour le jour où `core/schema.migrate` sera branché. */
export const LEGACY_MIGRATIONS: readonly Migration[] = [
  {
    from: 0,
    to: 1,
    description: 'Profil v1.15 : champs manquants complétés, types invalides corrigés (rien n’est supprimé).',
    up: (doc) => migrateProfile(doc as StoredProfile) as Record<string, unknown>,
  },
];

// ---------- Sauvegarde ----------
// Contient profil, séances et journal. Jamais de clé IA, de jeton ni de mot de passe.
export function makeBackup({
  profile,
  sessions,
  journal,
  user,
}: Partial<StoredData> & { user?: string | undefined } = {}): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      v: BACKUP_VERSION,
      exported: new Date().toISOString(),
      user: user || 'local',
      profile: profile || null,
      sessions: sessions || [],
      journal: journal || [],
    },
    null,
    2,
  );
}
// Lit un fichier de sauvegarde (aussi l'ancien export sans « app »). Retourne { profile, sessions, journal } ou lève une erreur.
export function parseBackup(text: string): StoredData {
  let d: { app?: unknown; profile?: StoredProfile | null; sessions?: unknown; journal?: unknown } | null;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('json');
  }
  if (!d || typeof d !== 'object' || (d.app && d.app !== BACKUP_APP)) throw new Error('format');
  if (!d.profile && !Array.isArray(d.sessions)) throw new Error('empty');
  const profile = d.profile ? migrateProfile(d.profile) : null;
  if (profile) {
    delete profile.geminiKey;
    delete profile.sharedAI;
  }
  return { profile, sessions: migrateSessions(d.sessions), journal: migrateJournal(d.journal) };
}

interface TsLogEntry {
  ts?: number;
  test?: string;
  id?: string;
  side?: string;
}
// Fusionne la sauvegarde dans les données actuelles : séances par id, journal par jour ; le profil sauvegardé remplace seulement s'il n'y en a pas
export function mergeBackup(
  cur: Partial<StoredData>,
  bk: StoredData,
  { replaceProfile = false }: { replaceProfile?: boolean } = {},
): StoredData {
  const ses = new Map((cur.sessions || []).map((s) => [s.id, s]));
  for (const s of bk.sessions) if (!ses.has(s.id)) ses.set(s.id, s);
  const jr = new Map((cur.journal || []).map((j) => [j.day, j]));
  for (const j of bk.journal) if (!jr.has(j.day)) jr.set(j.day, j);
  // Profil gardé : on y ajoute quand même les journaux de la sauvegarde (amplitudes, questionnaires, rapports, badges, objets)
  let profile = (replaceProfile || !cur.profile ? bk.profile || cur.profile : cur.profile) as StoredProfile | null;
  if (!replaceProfile && cur.profile && bk.profile) {
    const mergeLog = (a: TsLogEntry[] = [], b: TsLogEntry[] = []): TsLogEntry[] => {
      const k = (x: TsLogEntry): string => JSON.stringify([x.ts, x.test || x.id || '', x.side || '']);
      const seen = new Set(a.map(k));
      return [...a, ...b.filter((x) => x && !seen.has(k(x)))].sort((x, y) => (x.ts || 0) - (y.ts || 0));
    };
    const merged: StoredProfile = { ...cur.profile };
    for (const f of ['romLog', 'promLog', 'reportLog'])
      if (Array.isArray(bk.profile[f]))
        merged[f] = mergeLog(cur.profile[f] as TsLogEntry[], bk.profile[f] as TsLogEntry[]);
    for (const f of ['badges', 'equipChoice'])
      if (bk.profile[f]) merged[f] = { ...(bk.profile[f] as object), ...((cur.profile[f] as object) || {}) };
    if (!cur.profile['promActivities'] && bk.profile['promActivities'])
      merged['promActivities'] = bk.profile['promActivities'];
    profile = merged;
  }
  return {
    profile,
    sessions: [...ses.values()].sort((a, b) => a.date - b.date),
    journal: [...jr.values()].sort((a, b) => String(a.day).localeCompare(String(b.day))),
  };
}
