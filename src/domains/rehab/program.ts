// Personnalisation : programme par phase, dose par niveau, progression selon douleur / difficulté / qualité,
// plan imposé par le clinicien, journée difficile (poussée de douleur).
import type { Dose, DoseOverride, Profile, RxDose, Session, SessionItem, TodayOverride } from './types.ts';
import {
  EXERCISES,
  PATHOLOGIES,
  exerciseEntry,
  promSummary,
  protocolById,
  protocolPhases,
  type PathologyDef,
  type ProtocolDef,
  type ProtocolExerciseEntry,
  type ProtocolPhaseDef,
} from './internal/legacy-data.ts';

export const pathologyById = (id: string | undefined): PathologyDef | undefined => PATHOLOGIES.find((p) => p.id === id);
const DAY = 86400000;

export function weekNumber(profile: Pick<Profile, 'startDate'>, now: number = Date.now()): number {
  return Math.max(1, Math.floor((now - (profile.startDate || now)) / (7 * DAY)) + 1);
}
export function calendarPhase(week: number): 1 | 2 | 3 {
  return week <= 2 ? 1 : week <= 6 ? 2 : 3;
}
export const startLevel = (irr: string | undefined): 1 | 2 | 3 => (irr === 'high' ? 1 : irr === 'med' ? 2 : 3);
export const inFlare = (profile: Pick<Profile, 'flareUntil'>, now: number = Date.now()): boolean =>
  !!(profile.flareUntil && profile.flareUntil > now);

// ───────── Protocole post-opératoire (profile.protocol = { id, variant?, surgeryDate 'AAAA-MM-JJ', confirmed?: { idPhase: ts|true } }) ─────────
// Les phases avancent avec le temps écoulé depuis la chirurgie, mais on ne QUITTE une phase que si ses critères de passage
// sont confirmés (confirmed[idPhase]) : sinon la phase est maintenue et le statut est marqué `blocked`.
// Un protocole n'avance jamais plus vite que le temps, et la revue hebdomadaire ne le fait pas avancer.
function dateKeyUTC(k: unknown): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || ''));
  return m ? Date.UTC(+(m[1] as string), +(m[2] as string) - 1, +(m[3] as string)) : NaN;
}
export function protocolDaysSince(surgeryDate: string | undefined, now: number = Date.now()): number {
  const a = dateKeyUTC(surgeryDate);
  if (!Number.isFinite(a)) return NaN;
  const d = new Date(now);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - a) / DAY);
}
const phaseEnd = (ph: ProtocolPhaseDef): number =>
  ph.weeks[1] === undefined || ph.weeks[1] === null ? Infinity : ph.weeks[1];
export function protocolActive(profile: Profile | null | undefined): boolean {
  const pr = profile?.protocol;
  return !!(pr && pr.id && protocolById(pr.id) && Number.isFinite(dateKeyUTC(pr.surgeryDate)));
}

export interface ProtocolStatus {
  id: string;
  variant: string | null;
  protocol: ProtocolDef;
  phases: ProtocolPhaseDef[];
  phase: ProtocolPhaseDef;
  phaseIndex: number;
  phaseCount: number;
  weeksSince: number;
  daysSince: number;
  week: number;
  preop: boolean;
  daysToSurgery: number;
  timeIndex: number;
  blocked: boolean;
  last: boolean;
  nextPhase: ProtocolPhaseDef | null;
  nextPhaseInWeeks: number | null;
  criteria: unknown[];
  criteriaConfirmed: boolean;
  precautions: unknown[];
  painMax: number;
}

export function protocolStatus(profile: Profile | null | undefined, now: number = Date.now()): ProtocolStatus | null {
  if (!protocolActive(profile)) return null;
  const pr = (profile as Profile).protocol as NonNullable<Profile['protocol']>;
  const proto = protocolById(pr.id) as ProtocolDef;
  const phases = protocolPhases(proto, pr.variant);
  const days = protocolDaysSince(pr.surgeryDate, now);
  const weeksSince = days / 7;
  // Phase selon le temps seul (avant la chirurgie : première phase)
  let timeIdx = 0;
  phases.forEach((ph, i) => {
    if (weeksSince >= ph.weeks[0]) timeIdx = i;
  });
  // On ne quitte une phase que si ses critères sont confirmés
  const conf = pr.confirmed || {};
  let idx = 0;
  while (idx < timeIdx && conf[(phases[idx] as ProtocolPhaseDef).id]) idx++;
  const phase = phases[idx] as ProtocolPhaseDef;
  const blocked = idx < timeIdx;
  const last = idx === phases.length - 1;
  const end = phaseEnd(phase);
  const nextPhaseInWeeks = last ? null : blocked ? 0 : Math.max(0, Math.ceil(end - weeksSince));
  return {
    id: pr.id,
    variant: pr.variant || null,
    protocol: proto,
    phases,
    phase,
    phaseIndex: idx,
    phaseCount: phases.length,
    weeksSince,
    daysSince: days,
    week: Math.max(1, Math.floor(weeksSince) + 1),
    preop: days < 0,
    daysToSurgery: days < 0 ? -days : 0,
    timeIndex: timeIdx,
    blocked,
    last,
    nextPhase: last ? null : (phases[idx + 1] as ProtocolPhaseDef),
    nextPhaseInWeeks,
    criteria: phase.progressionCriteria || [],
    criteriaConfirmed: !!conf[phase.id],
    precautions: phase.precautions || [],
    painMax: phase.painMax ?? proto.painMax ?? 3,
  };
}
// Phase courante du protocole (objet de phase résolu pour la variante) ou null
export function protocolPhase(
  profile: Profile | null | undefined,
  now: number = Date.now(),
): (ProtocolPhaseDef & { index: number; blocked: boolean }) | null {
  const st = protocolStatus(profile, now);
  return st ? { ...st.phase, index: st.phaseIndex, blocked: st.blocked } : null;
}
// Entrée de l'exercice dans la phase courante du protocole : { id, level?, maxLevel?, dose? } ou null
function protocolEntry(profile: Profile, id: string, now: number = Date.now()): ProtocolExerciseEntry | null {
  const st = protocolStatus(profile, now);
  if (!st) return null;
  const list = (st.phase.exercises || []).map(exerciseEntry);
  const from = (profile.swaps && Object.entries(profile.swaps).find(([, v]) => v === id)?.[0]) || null;
  return list.find((e) => e.id === id) || (from && list.find((e) => e.id === from)) || null;
}

const REP_F = [0.6, 0.8, 1, 1.2, 1.4];
const HOLD_F = [0.5, 0.75, 1, 1.25, 1.5];
const ROM_F = [0.6, 0.75, 0.85, 0.95, 1];

export function doseFor(exId: string, level = 3, flare = false): Dose {
  const ex = EXERCISES[exId];
  const b = (ex as NonNullable<typeof ex>).dose;
  const i = Math.max(1, Math.min(5, level)) - 1;
  const d = {
    type: b.type,
    sets: Math.max(1, b.sets - (i === 0 ? 1 : 0)),
    tempo: b.tempo,
    holdTop: b.holdTop,
    romFactor: ROM_F[i] as number,
  } as Dose; // `reps` (et `hold`) sont ajoutés ensuite, dans le même ordre qu'en v1.15
  if (b.type === 'hold') {
    d.hold = Math.round((b.hold * (HOLD_F[i] as number)) / 5) * 5 || 5;
    d.reps = b.reps;
  } else d.reps = Math.max(4, Math.round(b.reps * (REP_F[i] as number)));
  if (flare) {
    d.romFactor = Math.max(0.5, (d.romFactor as number) - 0.15);
    flareCut(d);
  }
  d.loadNote = i === 4 ? 'load' : null;
  return d;
}
// Journée difficile : une série et un tiers de répétitions (ou de secondes) en moins
function flareCut(d: Dose): Dose {
  d.sets = Math.max(1, d.sets - 1);
  if (d.hold) d.hold = Math.max(5, Math.round(d.hold * 0.6));
  else d.reps = Math.max(4, Math.round(d.reps * 0.7));
  return d;
}
const lvIdx = (l: number | null | undefined): number => Math.max(1, Math.min(5, l || 3)) - 1;
// Dose fixée par le clinicien à un niveau donné, adaptée à un autre niveau (même facteur relatif que doseFor)
export function scaleDose<D extends DoseOverride | null | undefined>(
  exId: string,
  d: D,
  fromLv: number,
  toLv: number,
): D {
  if (!d) return d;
  const r = { ...d };
  if (fromLv === toLv) return r;
  const hold = EXERCISES[exId]?.dose?.type === 'hold';
  const a = lvIdx(fromLv),
    b = lvIdx(toLv);
  if (hold) {
    if (d.hold) r.hold = Math.max(5, Math.round((d.hold * (HOLD_F[b] as number)) / (HOLD_F[a] as number) / 5) * 5);
  } else if (d.reps) r.reps = Math.max(3, Math.round((d.reps * (REP_F[b] as number)) / (REP_F[a] as number)));
  return r;
}
// Dose d'un exercice : niveau (doseFor) -> dose du clinicien adaptée au niveau (rxDose) -> réglages permanents du patient (doseOver)
// -> réglages d'aujourd'hui (todayOver)
export function doseOf(
  profile: Profile,
  id: string,
  level: number,
  flare = false,
  to: TodayOverride | null = null,
): Dose {
  const pe = protocolActive(profile) ? protocolEntry(profile, id) : null;
  const rd: RxDose | null = profile.rxDose?.[id] || (pe?.dose ? { lv: 3, ...pe.dose } : null);
  let dose = doseFor(id, level, flare && !rd);
  dose.rest = DEFAULT_REST;
  if (rd) {
    const s = scaleDose(id, rd, rd.lv ?? level, level);
    const m = { ...dose };
    if (s.sets) m.sets = s.sets;
    if (s.reps && m.type === 'reps') m.reps = s.reps;
    if (s.hold && m.type === 'hold') m.hold = s.hold;
    if (s.rest !== undefined && s.rest !== null) m.rest = s.rest;
    if (flare) {
      m.romFactor = doseFor(id, level, true).romFactor;
      flareCut(m);
    }
    dose = m;
    if (s.rest !== undefined && s.rest !== null) dose.rest = s.rest;
  }
  const over = to || todayOver(profile);
  dose = applyOver(applyOver(dose, profile.doseOver?.[id]), over.items?.[id]);
  if (!profile.doseOver?.[id] && !over.items?.[id]) delete dose.custom;
  return dose;
}

// Exercices de la phase : plan du clinicien s'il correspond à la phase, sinon protocole de la pathologie
export function exerciseIds(profile: Profile, phase?: number): string[] {
  let ids: string[];
  const st = phase === undefined ? protocolStatus(profile) : null; // protocole actif : exercices de sa phase
  const ph = phase === undefined ? profile.phase || 1 : phase;
  if (st) ids = (st.phase.exercises || []).map((e) => exerciseEntry(e).id);
  else if (profile.plan && profile.plan.phase === ph && profile.plan.ids?.length) ids = profile.plan.ids;
  else {
    const path = pathologyById(profile.pathology);
    ids = path ? path.phases[ph] || (path.phases[1] as string[]) : [];
  }
  // Remplacements choisis (matériel manquant) : exercice d'origine → exercice équivalent
  const sw = profile.swaps || {};
  return [...new Set(ids.map((id) => (sw[id] && EXERCISES[sw[id]] ? (sw[id] as string) : id)))];
}
export const swappedFrom = (profile: Profile, id: string): string | null =>
  Object.entries(profile.swaps || {}).find(([, v]) => v === id)?.[0] || null;

export function levelOf(profile: Profile, id: string): number {
  const pe = protocolActive(profile) ? protocolEntry(profile, id) : null;
  const lv = profile.levels?.[id] ?? pe?.level ?? profile.baseLevel ?? startLevel(profile.irritability);
  return pe?.maxLevel ? Math.min(lv, pe.maxLevel) : lv; // phase protégée : niveau plafonné
}

// Réglages du patient avant la séance : pour aujourd'hui seulement (todayOver) ou permanents (doseOver)
export const DEFAULT_REST = 30;
export function todayOver(profile: Profile): TodayOverride {
  const o = profile.todayOver;
  return o && o.date === todayKey() ? o : { date: todayKey(), items: {}, skip: [] };
}
export function applyOver(d: Dose, o: DoseOverride | null | undefined): Dose {
  if (!o) return d;
  const r = { ...d };
  if (o.sets) r.sets = o.sets;
  if (o.reps) r.reps = o.reps;
  if (o.hold && r.type === 'hold') r.hold = o.hold;
  if (o.rest !== undefined && o.rest !== null) r.rest = o.rest;
  r.custom = true;
  return r;
}

export interface ProgramItem {
  id: string;
  level: number;
  dose: Dose;
  flare: boolean;
  skipped: boolean;
  kept: boolean;
  rx: boolean;
}
export function todaysProgram(
  profile: Profile,
  { withSkipped = false }: { withSkipped?: boolean } = {},
): ProgramItem[] {
  const flare = inFlare(profile);
  const to = todayOver(profile);
  return exerciseIds(profile)
    .map((id) => {
      const lv = levelOf(profile, id);
      const level = flare ? Math.max(1, lv - 1) : lv;
      const dose = doseOf(profile, id, level, flare, to);
      return {
        id,
        level,
        dose,
        flare,
        skipped: to.skip.includes(id),
        kept: !!profile.doseOver?.[id],
        rx: !!profile.rxDose?.[id],
      };
    })
    .filter((x) => withSkipped || !x.skipped);
}
// Durée estimée d'un exercice (secondes) : séries × (répétitions × tempo, ou maintien) + repos + mise en place
export function exerciseSeconds(d: Dose): number {
  const tempo = (d.tempo || '2-1-2').split('-').map(Number);
  const rep = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (d.holdTop || 0));
  const work = d.type === 'hold' ? (d.reps || 1) * ((d.hold as number) + 4) : d.reps * rep;
  return d.sets * work + Math.max(0, d.sets - 1) * (d.rest ?? DEFAULT_REST) + 40;
}

// Séances précédentes d'un exercice : un seul essai par jour (le dernier), jours différents de `dayKey`, du plus ancien au plus récent
export function priorItems(
  sessions: readonly Session[] | null | undefined,
  id: string,
  dayKey: string,
  n = 3,
): (SessionItem & { ts: number })[] {
  const byDay = new Map<string, SessionItem & { ts: number }>();
  for (const s of sessions || [])
    for (const i of s.items || []) {
      if (i.id !== id) continue;
      const ts = i.ts ?? s.date,
        k = todayKey(ts);
      if (k === dayKey) continue;
      const o = byDay.get(k);
      if (!o || ts >= o.ts) byDay.set(k, { ...i, ts });
    }
  return [...byDay.values()].sort((a, b) => a.ts - b.ts).slice(-n);
}
export const itemQuality = (i: Pick<SessionItem, 'sets'>): number | null =>
  avg((i.sets || []).map((s) => s.quality).filter((x): x is number => x !== undefined && x !== null));
// Part des répétitions partielles (amplitude incomplète) : on ne monte pas de niveau si plus d'un quart sont partielles
export const partialShare = (i: Pick<SessionItem, 'sets'>): number => {
  let f = 0,
    p = 0;
  for (const s of i.sets || []) {
    f += s.full || 0;
    p += s.partial || 0;
  }
  return f + p ? p / (f + p) : 0;
};
const fullEnough = (i: Pick<SessionItem, 'sets'>): boolean => partialShare(i) <= 0.25;
export function lastItem(
  sessions: readonly Session[] | null | undefined,
  id: string,
): (SessionItem & { ts: number }) | null {
  let best: (SessionItem & { ts: number }) | null = null;
  for (const s of sessions || [])
    for (const i of s.items || [])
      if (i.id === id && (!best || (i.ts ?? s.date) >= (best.ts ?? 0))) best = { ...i, ts: i.ts ?? s.date };
  return best;
}

// Règle de progression après chaque exercice (échelle de difficulté 1 très facile … 5 trop difficile)
// reason : pain | hard | easy | steady | locked | max | flare
export interface LevelAdjustment {
  level: number;
  change: number;
  reason: 'pain' | 'hard' | 'easy' | 'steady' | 'locked' | 'max' | 'flare';
}
export function adjustLevel(
  profile: Profile,
  item: SessionItem,
  sessions: readonly Session[],
  checkin?: string | null,
): LevelAdjustment {
  const path = pathologyById(profile.pathology);
  const pst = protocolStatus(profile);
  const painMax = pst ? pst.painMax : (path?.painMax ?? 4);
  const cur = levelOf(profile, item.id);
  const pEntry = pst ? protocolEntry(profile, item.id) : null;
  const cap = Math.max(1, Math.min(5, profile.maxLevel?.[item.id] ?? pEntry?.maxLevel ?? 5));
  if (inFlare(profile)) return { level: cur, change: 0, reason: 'flare' };
  const q = itemQuality(item);
  const d = item.difficulty as number,
    pain = item.pain ?? 0;
  const calm = (i: SessionItem): boolean => (i.pain ?? 0) <= painMax - 1;
  const okQ = (x: number | null): boolean => x === undefined || x === null || x >= 0.8;
  const prior = priorItems(sessions, item.id, todayKey(item.ts ?? Date.now()), 3);
  const down = (reason: 'pain' | 'hard'): LevelAdjustment => ({
    level: Math.max(1, cur - 1),
    change: cur > 1 ? -1 : 0,
    reason,
  });
  // Sécurité : une douleur au-delà de la limite fait toujours baisser d'un niveau, même si le clinicien gère la progression
  if (pain > painMax || checkin === 'worse') return down('pain');
  if (profile.autoEx?.[item.id] === false) return { level: cur, change: 0, reason: 'locked' };
  if (d >= 5 || (q !== undefined && q !== null && q < 0.5)) return down('hard');
  let up = false;
  if (d <= 2 && okQ(q) && calm(item)) {
    const p = prior.slice(-1)[0];
    up = !!p && (p.difficulty as number) <= 2 && calm(p) && okQ(itemQuality(p)) && fullEnough(p) && fullEnough(item);
  } else if (d === 3 && okQ(q) && calm(item)) {
    const p = prior.slice(-2);
    up =
      p.length === 2 &&
      p.every((i) => i.difficulty === 3 && calm(i) && okQ(itemQuality(i)) && fullEnough(i)) &&
      fullEnough(item);
  }
  if (up) {
    if (cur >= cap) return { level: cur, change: 0, reason: 'max' };
    return { level: Math.min(5, cur + 1), change: 1, reason: 'easy' };
  }
  return { level: cur, change: 0, reason: 'steady' };
}

export interface WeeklyReview {
  week: number;
  phase: number;
  protocol?: boolean;
}
// Revue hebdomadaire : avance la phase seulement si la douleur est sous contrôle (sauf si le clinicien verrouille)
export function weeklyReview(profile: Profile, sessions: readonly Session[], now: number = Date.now()): WeeklyReview {
  const pst = protocolStatus(profile, now);
  if (pst) return { week: pst.week, phase: Math.min(3, pst.phaseIndex + 1), protocol: true }; // le protocole est piloté par la date de chirurgie
  const week = weekNumber(profile, now);
  if (profile.lockPhase) return { week, phase: profile.phase || 1 };
  const target = calendarPhase(week);
  const path = pathologyById(profile.pathology);
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7
    .flatMap((s) => s.items.map((i) => i.pain))
    .filter((x): x is number => x !== undefined && x !== null);
  const painMax = path?.painMax ?? 4;
  const painOk = !pains.length || (avg(pains) as number) <= painMax;
  let phase = profile.phase || 1;
  if (target > phase && painOk && last7.length >= 2) phase = phase + 1;
  if (!painOk && phase > 1 && (avg(pains) as number) > painMax + 2) phase = phase - 1;
  return { week, phase };
}

export interface NextPhaseInfo {
  done: boolean;
  protocol?: boolean;
  phase?: number;
  painMax?: number;
  locked?: boolean;
  weeksLeft?: number;
  blocked?: boolean;
  sessionsNeeded?: number;
  painOk?: boolean;
  painAvg?: number | null;
}
// Ce qui manque pour passer à la phase suivante (affiché au patient)
export function nextPhaseInfo(profile: Profile, sessions: readonly Session[], now: number = Date.now()): NextPhaseInfo {
  const pst = protocolStatus(profile, now);
  if (pst) {
    const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
    const pains = last7
      .flatMap((s) => s.items.map((i) => i.pain))
      .filter((x): x is number => x !== undefined && x !== null);
    return {
      done: pst.last,
      protocol: true,
      phase: pst.phaseIndex + 1,
      painMax: pst.painMax,
      locked: true,
      weeksLeft: pst.nextPhaseInWeeks ?? 0,
      blocked: pst.blocked,
      sessionsNeeded: 0,
      painOk: !pains.length || (avg(pains) as number) <= pst.painMax,
      painAvg: avg(pains),
    };
  }
  const phase = profile.phase || 1;
  if (phase >= 3) return { done: true };
  const path = pathologyById(profile.pathology);
  const painMax = path?.painMax ?? 4;
  const week = weekNumber(profile, now);
  const needWeek = phase === 1 ? 3 : 7;
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7
    .flatMap((s) => s.items.map((i) => i.pain))
    .filter((x): x is number => x !== undefined && x !== null);
  return {
    done: false,
    phase,
    painMax,
    locked: !!profile.lockPhase,
    weeksLeft: Math.max(0, needWeek - week),
    sessionsNeeded: Math.max(0, 2 - last7.length),
    painOk: !pains.length || (avg(pains) as number) <= painMax,
    painAvg: avg(pains),
  };
}

export interface WeekRow {
  week: number;
  sessions: number;
  pain: number | null;
  quality: number | null;
  difficulty: number | null;
  planned: number;
}
export function weeklyStats(profile: Profile | null | undefined, sessions: readonly Session[]): WeekRow[] {
  const out: { week: number; sessions: number; pain: number[]; quality: number[]; difficulty: number[] }[] = [];
  const res: WeekRow[] = [];
  if (!profile?.startDate) return res;
  for (const s of sessions) {
    const w = weekNumber(profile, s.date);
    const row = out[w - 1] || (out[w - 1] = { week: w, sessions: 0, pain: [], quality: [], difficulty: [] });
    row.sessions++;
    for (const i of s.items) {
      if (i.pain !== undefined && i.pain !== null) row.pain.push(i.pain);
      if (i.difficulty !== undefined && i.difficulty !== null) row.difficulty.push(i.difficulty);
      for (const st of i.sets) if (st.quality !== undefined && st.quality !== null) row.quality.push(st.quality);
    }
  }
  const nWeeks = weekNumber(profile);
  for (let w = 1; w <= nWeeks; w++) {
    const r = out[w - 1] || { week: w, sessions: 0, pain: [], quality: [], difficulty: [] };
    res.push({
      week: w,
      sessions: r.sessions,
      pain: avg(r.pain),
      quality: avg(r.quality),
      difficulty: avg(r.difficulty),
      planned: plannedPerWeek(profile),
    });
  }
  return res;
}

export const plannedPerWeek = (profile: Profile): number => profile.days?.length || profile.perWeek || 3;

// Jour prévu ? Fonction pure unique : jours de la semaine du profil + exceptions du calendrier
// (calSkip : repos volontaire ; calExtra : séance ajoutée ; calMoves : { jour prévu: nouveau jour }).
export function isPlannedDay(profile: Profile | null | undefined, dateKey: string): boolean {
  const p: Profile = profile || {};
  if ((p.calSkip || []).includes(dateKey)) return false;
  if ((p.calExtra || []).includes(dateKey)) return true;
  const moves = p.calMoves || {};
  if (Object.values(moves).includes(dateKey)) return true;
  if (moves[dateKey]) return false;
  const days = p.days?.length ? p.days : [1, 3, 5];
  const since = p.joinedAt || p.startDate;
  if (since && dateKey < todayKey(since)) return false;
  return days.includes(new Date(dateKey + 'T12:00').getDay());
}

export interface ExceptionPatch {
  calMoves: Record<string, string>;
  calSkip: string[];
  calExtra: string[];
}
// Modifie les exceptions : op = rest | add | move (k -> to) | undo ; renvoie le patch de profil
export function exceptionPatch(
  prof: Pick<Profile, 'calMoves' | 'calSkip' | 'calExtra'>,
  op: 'rest' | 'add' | 'move' | 'undo' | string,
  k: string,
  to?: string,
): ExceptionPatch {
  const moves: Record<string, string> = { ...(prof.calMoves || {}) };
  let skip = [...(prof.calSkip || [])];
  let extra = [...(prof.calExtra || [])];
  const origin = Object.keys(moves).find((o) => moves[o] === k);
  if (op === 'rest') {
    if (!skip.includes(k)) skip.push(k);
    extra = extra.filter((x) => x !== k);
  } else if (op === 'add') {
    if (!extra.includes(k)) extra.push(k);
    skip = skip.filter((x) => x !== k);
  } else if (op === 'move') {
    skip = skip.filter((x) => x !== to);
    if (extra.includes(k)) extra = [...extra.filter((x) => x !== k), to as string];
    else if (origin) {
      if (origin === to) Reflect.deleteProperty(moves, origin);
      else moves[origin] = to as string;
    } else moves[k] = to as string;
  } else if (op === 'undo') {
    skip = skip.filter((x) => x !== k);
    extra = extra.filter((x) => x !== k);
    for (const o of Object.keys(moves)) if (o === k || moves[o] === k) Reflect.deleteProperty(moves, o);
  }
  return { calMoves: moves, calSkip: skip, calExtra: extra };
}
// Série de jours prévus consécutifs réalisés, sans séance manquée
export function streak(
  profile: Profile | null | undefined,
  sessions: readonly Session[],
  now: number = Date.now(),
): number {
  const done = new Set(sessions.map((s) => todayKey(s.date)));
  const today = todayKey(now);
  let n = 0;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 400; i++, d.setDate(d.getDate() - 1)) {
    const k = todayKey(d.getTime());
    if (k < '2000-01-01') break;
    if (!isPlannedDay(profile, k)) {
      if (profile?.joinedAt && k < todayKey(profile.joinedAt) && !(profile.calExtra || []).includes(k)) break;
      continue;
    }
    if (done.has(k)) n++;
    else if (k === today)
      continue; // aujourd'hui pas encore fait : ne casse pas la série
    else break;
  }
  return n;
}

// Adhérence d'un mois (m : 0-11) : jours prévus jusqu'à aujourd'hui et ceux réalisés
export function monthAdherence(
  profile: Profile | null | undefined,
  sessions: readonly Session[],
  year: number,
  m: number,
  now: number = Date.now(),
): { sessions: number; planned: number; hit: number; pct: number } {
  const done = new Set(sessions.map((s) => todayKey(s.date)));
  const today = todayKey(now);
  let planned = 0,
    hit = 0,
    count = 0;
  const n = new Date(year, m + 1, 0).getDate();
  for (let i = 1; i <= n; i++) {
    const k = todayKey(new Date(year, m, i, 12).getTime());
    if (done.has(k)) count++;
    if (k <= today && isPlannedDay(profile, k)) {
      planned++;
      if (done.has(k)) hit++;
    }
  }
  return { sessions: count, planned, hit, pct: planned ? Math.round((hit / planned) * 100) : 0 };
}

// Résumé partagé avec le clinicien (aucune vidéo, aucune donnée inutile)
export function progressSummary(profile: Profile, sessions: readonly Session[], now: number = Date.now()) {
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7
    .flatMap((s) => s.items.map((i) => i.pain))
    .filter((x): x is number => x !== undefined && x !== null);
  const qs = last7
    .flatMap((s) => s.items.flatMap((i) => i.sets.map((x) => x.quality)))
    .filter((x): x is number => x !== undefined && x !== null);
  return {
    name: profile.name || '',
    week: weekNumber(profile, now),
    phase: profile.phase || 1,
    sessions7: last7.length,
    planned: plannedPerWeek(profile),
    pain7: pains.length ? +(avg(pains) as number).toFixed(1) : null,
    quality7: qs.length ? Math.round((avg(qs) as number) * 100) : null,
    levels: profile.levels || {},
    flare: inFlare(profile, now),
    ex: exerciseSummary(profile, sessions),
    last: sessions
      .slice(-5)
      .reverse()
      .map((s) => ({ date: s.date, n: s.items.length, pain: avg(s.items.map((i) => i.pain) as number[]) })),
    notes: recentNotes(sessions, 5),
    ...promSummary(profile),
    ...protocolSummary(profile, now),
    badges: Object.keys(profile.badges || {}).length,
  };
}
// Protocole post-opératoire : semaine et phase (même forme que protocols-ui.summaryPart, sans dépendre du DOM)
function protocolSummary(profile: Profile, now: number): Record<string, unknown> {
  const st = protocolStatus(profile, now);
  if (!st) return {};
  return {
    protocol: {
      id: st.id,
      variant: st.variant,
      week: st.week,
      phase: st.phaseIndex + 1,
      phases: st.phaseCount,
      phaseId: st.phase.id,
      blocked: st.blocked,
      criteriaConfirmed: st.criteriaConfirmed,
      nextPhaseInWeeks: st.nextPhaseInWeeks,
      preop: st.preop,
    },
  };
}
// Par exercice du programme : niveau, dernière difficulté et douleur, tendance (up | down | steady) d'après les 3 dernières séances
export interface ExerciseSummary {
  level: number;
  lastDifficulty: number | null;
  lastPain: number | null;
  trend: 'up' | 'down' | 'steady';
}
export function exerciseSummary(profile: Profile, sessions: readonly Session[]): Record<string, ExerciseSummary> {
  const out: Record<string, ExerciseSummary> = {};
  for (const id of exerciseIds(profile)) {
    const items = priorItems(sessions, id, '', 3);
    const last = items.slice(-1)[0];
    const ch = items.reduce((a, i) => a + (i.change || 0), 0);
    out[id] = {
      level: levelOf(profile, id),
      lastDifficulty: last?.difficulty ?? null,
      lastPain: last?.pain ?? null,
      trend: ch > 0 ? 'up' : ch < 0 ? 'down' : 'steady',
    };
  }
  return out;
}
// Commentaires écrits / dictés par le patient après ses exercices (les plus récents d'abord)
export function recentNotes(
  sessions: readonly Session[],
  n = 5,
): { date: number; ex: string; pain: number | null; text: string }[] {
  return sessions
    .flatMap((s) =>
      s.items
        .filter((i) => i.note)
        .map((i) => ({ date: i.ts || s.date, ex: i.id, pain: i.pain ?? null, text: String(i.note).slice(0, 400) })),
    )
    .sort((a, b) => b.date - a.date)
    .slice(0, n);
}

export function avg(a: readonly number[] | null | undefined): number | null {
  return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}
export const todayKey = (t: number = Date.now()): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
