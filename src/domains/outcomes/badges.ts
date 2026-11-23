// Badges d'assiduité et de progrès : évaluation pure, sans DOM (reprise de www/js/badges.js, partie logique).
// Forme des données : session = { id, date: ms, items: [{ id, change, ts, sets, pain, difficulty }] } ;
// profile.romLog / promLog / reportLog / badges = { id: ts } (voir spec v1.14). Un badge gagné n'est jamais retiré.
import { streak, isPlannedDay, todayKey } from '../../../www/js/program.js';

const DAY = 86400000;
const UNIT_DAYS = 'bdgUnitDays';
const UNIT_SESS = 'bdgUnitSess';

export interface BadgeSessionItem {
  id?: string;
  ts?: number;
  change?: number;
  [key: string]: unknown;
}
export interface BadgeSession {
  date: number;
  items?: BadgeSessionItem[];
  [key: string]: unknown;
}
export interface BadgeProfile {
  badges?: Record<string, number>;
  romLog?: { test?: string; side?: string | null; deg?: unknown; ts?: unknown; conf?: number | null }[];
  promLog?: { ts?: unknown }[];
  reportLog?: { ts?: unknown }[];
  [key: string]: unknown;
}
/** Contexte d'évaluation : profil, séances triées par date, instant courant. */
interface Ctx {
  profile: BadgeProfile;
  sessions: BadgeSession[];
  now: number;
}
export interface BadgeProgress {
  n: number;
  of: number;
  unit: string;
}
export interface BadgeDef {
  id: string;
  /** Suffixe des clés i18n (bdg<key>T / bdg<key>D). */
  key: string;
  /** Nom de l'icône (IC de l'interface). */
  icon: string;
  when: (c: Ctx) => number | null;
  progress?: (c: Ctx) => BadgeProgress;
}

// Jour (AAAA-MM-JJ) décalé de n jours ; midi pour éviter les effets de l'heure d'été
const addDays = (key: string, n: number): string => {
  const d = new Date(key + 'T12:00');
  d.setDate(d.getDate() + n);
  return todayKey(d.getTime());
};
const mondayOf = (key: string): string => addDays(key, -((new Date(key + 'T12:00').getDay() + 6) % 7));
const dayNum = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY;
};
const itemTs = (s: BadgeSession, i: BadgeSessionItem): number => i.ts ?? s.date;
const firstTs = (list: { ts?: unknown }[] | undefined): number | null => {
  const v = (list || []).map((x) => x && x.ts).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.min(...v) : null;
};

/** Profil vu par le programme (program.js) : même objet, typé par le domaine de rééducation. */
const prog = (p: BadgeProfile): Parameters<typeof streak>[0] => p as unknown as Parameters<typeof streak>[0];
const streakOf = (p: BadgeProfile, sessions: BadgeSession[], now: number): number =>
  streak(prog(p), sessions as unknown as Parameters<typeof streak>[1], now);
// Série de jours prévus réalisés (program.js) : atteinte au premier moment où elle vaut N
const streakWhen =
  (N: number) =>
  (c: Ctx): number | null => {
    if (streakOf(c.profile, c.sessions, c.now) < N) return null;
    for (const s of c.sessions) {
      if (s.date > c.now) break;
      const sub = c.sessions.filter((x) => x.date <= s.date);
      if (streakOf(c.profile, sub, s.date) >= N) return s.date;
    }
    return c.now;
  };
const streakProgress =
  (N: number) =>
  (c: Ctx): BadgeProgress => ({ n: Math.min(streakOf(c.profile, c.sessions, c.now), N), of: N, unit: UNIT_DAYS });
const countWhen =
  (N: number) =>
  (c: Ctx): number | null =>
    c.sessions.length >= N ? (c.sessions[N - 1]?.date ?? null) : null;
const countProgress =
  (N: number) =>
  (c: Ctx): BadgeProgress => ({ n: Math.min(c.sessions.length, N), of: N, unit: UNIT_SESS });

// Semaine complète : les jours prévus (Lun–Dim) sont tous réalisés ; les jours de repos ne comptent pas
function fullWeekWhen(c: Ctx): number | null {
  const first = c.sessions[0];
  if (!first) return null;
  const byDay = new Map<string, number>();
  for (const s of c.sessions) {
    const k = todayKey(s.date);
    byDay.set(k, Math.max(byDay.get(k) ?? 0, s.date));
  }
  const lastMon = mondayOf(todayKey(c.now));
  for (let mon = mondayOf(todayKey(first.date)); mon <= lastMon; mon = addDays(mon, 7)) {
    const planned: string[] = [];
    for (let i = 0; i < 7; i++) {
      const k = addDays(mon, i);
      if (isPlannedDay(prog(c.profile), k)) planned.push(k);
    }
    if (planned.length && planned.every((k) => byDay.has(k))) return Math.max(...planned.map((k) => byDay.get(k) ?? 0));
  }
  return null;
}

// Changement de niveau : une séance où un exercice est passé à un niveau supérieur
function levelUpWhen(c: Ctx): number | null {
  let best: number | null = null;
  for (const s of c.sessions)
    for (const i of s.items || []) {
      if ((i.change || 0) > 0) {
        const ts = itemTs(s, i);
        if (best === null || ts < best) best = ts;
      }
    }
  return best;
}

interface RomRow {
  deg: number;
  ts: number;
}

// Amplitude : sur une mesure (test + côté) dont la dernière valeur dépasse la première de 10° ou plus.
// Mesures à faible confiance (< 0,5) ignorées.
function rangeWhen(c: Ctx): number | null {
  const groups = new Map<string, RomRow[]>();
  for (const r of c.profile.romLog || []) {
    if (!r || typeof r.deg !== 'number' || typeof r.ts !== 'number' || r.ts > c.now) continue;
    if (r.conf !== null && r.conf !== undefined && r.conf < 0.5) continue;
    const k = `${r.test}|${r.side ?? ''}`;
    groups.set(k, [...(groups.get(k) || []), { deg: r.deg, ts: r.ts }]);
  }
  let best: number | null = null;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.ts - b.ts);
    const base = g[0]!.deg;
    if (g[g.length - 1]!.deg < base + 10) continue;
    const hit = g.find((r, i) => i > 0 && r.deg >= base + 10);
    if (hit && (best === null || hit.ts < best)) best = hit.ts;
  }
  return best;
}

// Retour : une séance après au moins 7 jours sans séance
function comebackWhen(c: Ctx): number | null {
  for (let i = 1; i < c.sessions.length; i++) {
    const gap = dayNum(todayKey(c.sessions[i]!.date)) - dayNum(todayKey(c.sessions[i - 1]!.date));
    if (gap >= 7) return c.sessions[i]!.date;
  }
  return null;
}

// key : suffixe des clés i18n (bdg<key>T / bdg<key>D). icon : nom dans IC (ui/components/icons.ts)
export const BADGES: readonly BadgeDef[] = [
  { id: 'first', key: 'First', icon: 'play', when: (c) => c.sessions[0]?.date ?? null },
  { id: 'streak3', key: 'Streak3', icon: 'flame', when: streakWhen(3), progress: streakProgress(3) },
  { id: 'streak7', key: 'Streak7', icon: 'flame', when: streakWhen(7), progress: streakProgress(7) },
  { id: 'streak14', key: 'Streak14', icon: 'flame', when: streakWhen(14), progress: streakProgress(14) },
  { id: 'streak30', key: 'Streak30', icon: 'flame', when: streakWhen(30), progress: streakProgress(30) },
  { id: 'sessions10', key: 'Sessions10', icon: 'cal', when: countWhen(10), progress: countProgress(10) },
  { id: 'sessions50', key: 'Sessions50', icon: 'cal', when: countWhen(50), progress: countProgress(50) },
  { id: 'sessions100', key: 'Sessions100', icon: 'cal', when: countWhen(100), progress: countProgress(100) },
  { id: 'fullWeek', key: 'FullWeek', icon: 'layers', when: fullWeekWhen },
  { id: 'levelUp', key: 'LevelUp', icon: 'chart', when: levelUpWhen },
  { id: 'rangeUp', key: 'RangeUp', icon: 'side', when: rangeWhen },
  { id: 'prom', key: 'Prom', icon: 'doc', when: (c) => firstTs(c.profile.promLog) },
  { id: 'report', key: 'Report', icon: 'share', when: (c) => firstTs(c.profile.reportLog) },
  { id: 'comeback', key: 'Comeback', icon: 'timer', when: comebackWhen },
];

const ctxOf = (
  profile: BadgeProfile | null | undefined,
  sessions: BadgeSession[] | null | undefined,
  now: number,
): Ctx => ({
  profile: profile || {},
  sessions: [...(sessions || [])].sort((a, b) => a.date - b.date),
  now,
});

// Évaluation pure. earned = badges déjà gagnés (profile.badges) + nouveaux { id: ts } ; newOnes = ids gagnés à cet appel seulement.
// Un badge déjà présent dans profile.badges n'est jamais recalculé ni retiré.
export function evaluateBadges(
  profile: BadgeProfile = {},
  sessions: BadgeSession[] = [],
  now = Date.now(),
): { earned: Record<string, number>; newOnes: string[] } {
  const prev = (profile && profile.badges) || {};
  const earned: Record<string, number> = { ...prev };
  const newOnes: string[] = [];
  const c = ctxOf(profile, sessions, now);
  for (const b of BADGES) {
    if (prev[b.id] !== undefined && prev[b.id] !== null) continue;
    const ts = b.when(c);
    if (ts !== null && ts !== undefined) {
      earned[b.id] = ts;
      newOnes.push(b.id);
    }
  }
  return { earned, newOnes };
}

// Progression affichée pour les badges de série et de compte (null sinon)
export function badgeProgress(
  b: BadgeDef,
  profile: BadgeProfile | null | undefined,
  sessions: BadgeSession[] | null | undefined,
  now = Date.now(),
): BadgeProgress | null {
  return b.progress ? b.progress(ctxOf(profile, sessions, now)) : null;
}
