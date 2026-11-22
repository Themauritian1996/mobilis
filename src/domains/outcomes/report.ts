// Rapports : rapport patient périodique (échéance, période) et données du rapport (aucun DOM).
// Logique pure (testée dans tests/report.test.mjs et report.test.ts) : reportDue, reportPeriod, buildReportData,
// dataFromSummary, summaryPart, rxExtrasReport. L'affichage est dans src/ui/views/report.ts ; le PDF dans report-pdf.ts.
import type { Localized } from '../../core/i18n/engine.ts';
import * as P from '../rehab/program.ts';
import type { JournalEntry, Profile, Session } from '../rehab/types.ts';
import {
  EXERCISES,
  TESTS,
  instrumentDef,
  promTrend,
  protocolById,
  romSeries,
  romTrend,
} from './internal/legacy-data.ts';
import type {
  PainPoint,
  ReportData,
  ReportExercise,
  ReportFields,
  ReportLogEntry,
  ReportName,
  ReportNote,
  ReportProm,
  ReportRom,
} from './types.ts';

const DAY = 86400000;
export const REPORT_EVERY = [0, 2, 4, 6, 8, 12];
const LOG_CAP = 60;

// =====================================================================================================================
// Échéance
// =====================================================================================================================
const startOf = (p: Profile | null | undefined): number => p?.reportStart || p?.joinedAt || p?.startDate || 0;
export const lastReportTs = (p: Profile | null | undefined): number | null =>
  (p?.reportLog || []).reduce((m, r) => (r && r.ts > m ? r.ts : m), 0) || null;

/** Rapport dû ? plan { every semaines } (fixé par le clinicien) ; le premier est dû `every` semaines après l'arrivée, puis `every` semaines après le dernier rapport. */
export function reportDue(p: Profile | null | undefined, now: number = Date.now()): boolean {
  const every = +(p?.reportPlan?.every as number);
  if (!(every > 0)) return false;
  const base = lastReportTs(p) ?? startOf(p);
  if (!base) return false;
  return now >= base + every * 7 * DAY;
}
/** Période couverte par le prochain rapport : depuis le dernier rapport (sinon depuis le début) jusqu'à maintenant. */
export function reportPeriod(
  p: Profile | null | undefined,
  sess: readonly Session[] = [],
  now: number = Date.now(),
): { from: number; to: number } {
  const first = sess.length ? Math.min(...sess.map((s) => s.date)) : null;
  const from = lastReportTs(p) ?? (startOf(p) || first || now - 28 * DAY);
  return { from: Math.min(from, now), to: now };
}

// =====================================================================================================================
// Données du rapport (pur)
// =====================================================================================================================
const avg = (a: readonly number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x: number | null | undefined): number | null =>
  x === undefined || x === null ? null : Math.round(x * 10) / 10;
const notNil = (x: number | null | undefined): x is number => x !== undefined && x !== null;
const dayKey = P.todayKey;
const nameOfEx = (id: string): ReportName => EXERCISES[id]?.name || id;

/** Champs saisis par le patient dans le court formulaire du rapport (avant nettoyage). */
export interface ReportFieldsInput {
  global?: unknown;
  pain?: unknown;
  goalsProgress?: unknown;
  goals?: unknown;
  difficulties?: unknown;
  comment?: unknown;
  hardEx?: string[] | undefined;
}

function cleanFields(f: ReportFieldsInput | null | undefined): ReportFields | null {
  if (!f) return null;
  const out: ReportFields = {};
  const given = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
  if (Number.isFinite(+(f.global as number)) && f.global !== '' && f.global !== undefined && f.global !== null)
    out.global = Math.max(-2, Math.min(2, Math.round(+(f.global as number))));
  if (given(f.pain) && Number.isFinite(+(f.pain as number)))
    out.pain = Math.max(0, Math.min(10, Math.round(+(f.pain as number))));
  if (given(f.goalsProgress) && Number.isFinite(+(f.goalsProgress as number)))
    out.goalsProgress = Math.max(0, Math.min(3, Math.round(+(f.goalsProgress as number))));
  for (const k of ['goals', 'difficulties', 'comment'] as const)
    if (f[k] && String(f[k]).trim()) out[k] = String(f[k]).trim().slice(0, 1200);
  const ids = (f.hardEx || []).filter((id) => EXERCISES[id]);
  if (ids.length) {
    out.hardExIds = ids;
    out.hardEx = ids.map(nameOfEx);
  }
  return Object.keys(out).length ? out : null;
}

export interface ReportOptions {
  from?: number | undefined;
  to?: number | undefined;
  fields?: ReportFieldsInput | null | undefined;
  now?: number | undefined;
  includeName?: boolean | undefined;
}

/**
 * Données du rapport (aucun DOM). Noms cliniques = objets { fr, en } (le PDF choisit la langue).
 * profile, sessions [{ id, date, items:[{ id, level, sets:[{ reps, full, partial, holdSec }], pain, difficulty, change, note, ts }] }],
 * journal [{ day:'AAAA-MM-JJ', pain, ts }], opts { from, to, fields, now, includeName }.
 */
export function buildReportData(
  prof: Profile = {},
  sess: readonly Session[] = [],
  journal: readonly (JournalEntry | null)[] | null | undefined = [],
  opts: ReportOptions = {},
): ReportData {
  const now = opts.now ?? Date.now();
  const per = reportPeriod(prof, sess, now);
  const to = opts.to ?? per.to,
    from = Math.min(opts.from ?? per.from, to);
  const inP = (ts: number | null | undefined): boolean => ts !== undefined && ts !== null && ts >= from && ts <= to;
  const sP = sess.filter((s) => inP(s.date)).sort((a, b) => a.date - b.date);

  // Adhérence : jours prévus (hors aujourd'hui s'il n'est pas encore fait) réalisés
  const doneDays = new Set(sess.map((s) => dayKey(s.date)));
  const fromK = dayKey(from),
    toK = dayKey(Math.min(to, now)),
    today = dayKey(now);
  let planned = 0,
    hit = 0;
  for (let d = new Date(from); ; d = new Date(d.getTime() + DAY)) {
    const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime());
    if (k > toK) break;
    if (k >= fromK && P.isPlannedDay(prof, k)) {
      if (doneDays.has(k)) {
        planned++;
        hit++;
      } else if (k < today) planned++;
    }
  }

  // Douleur : moyenne par séance + journal quotidien
  const painPts: PainPoint[] = [];
  for (const s of sP) {
    const v = avg(s.items.map((i) => i.pain).filter(notNil));
    if (v !== null) painPts.push({ ts: s.date, v: r1(v) as number, src: 's' });
  }
  for (const j of journal || []) {
    if (j === undefined || j === null || j.pain === undefined || j.pain === null) continue;
    const ts = j.ts ?? new Date((j.day || '') + 'T12:00').getTime();
    if (inP(ts)) painPts.push({ ts, v: +j.pain, src: 'j' });
  }
  painPts.sort((a, b) => a.ts - b.ts);
  const pv = painPts.map((p) => p.v);
  const lastPv = pv[pv.length - 1] as number,
    firstPv = pv[0] as number;
  const pain = {
    series: painPts,
    avg: r1(avg(pv)),
    first: pv.length ? firstPv : null,
    last: pv.length ? lastPv : null,
    delta: pv.length > 1 ? r1(lastPv - firstPv) : null,
    min: pv.length ? Math.min(...pv) : null,
    max: pv.length ? Math.max(...pv) : null,
  };

  // Exercices : programme actuel + ceux réalisés dans la période
  const progIds = ((): string[] => {
    try {
      return P.exerciseIds(prof);
    } catch {
      return [];
    }
  })();
  const seen = [...new Set(sP.flatMap((s) => s.items.map((i) => i.id)))];
  const exercises: ReportExercise[] = [...new Set([...progIds, ...seen])]
    .filter((id) => EXERCISES[id])
    .map((id) => {
      const its = sP.flatMap((s) => s.items.filter((i) => i.id === id)).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const firstIt = its[0],
        lastIt = its[its.length - 1];
      const dif = its.map((i) => i.difficulty).filter(notNil),
        pn = its.map((i) => i.pain).filter(notNil);
      const ch = its.reduce((a, i) => a + (i.change || 0), 0);
      const level = progIds.includes(id) ? P.levelOf(prof, id) : its.length ? (lastIt?.level as number | null) : null;
      return {
        id,
        name: nameOfEx(id),
        level,
        levelStart: its.length ? (firstIt?.level ?? null) : null,
        sessions: its.length,
        difficulty: r1(avg(dif)),
        pain: r1(avg(pn)),
        trend: ch > 0 ? 'up' : ch < 0 ? 'down' : 'steady',
      };
    })
    .sort((a, b) => (b.sessions as number) - (a.sessions as number));

  // Amplitudes : toutes mesures jusqu'à la fin de la période (départ = 1re mesure)
  const romLog = (prof.romLog || []).filter((r) => r && r.ts <= to);
  const rom: ReportRom[] = [];
  const romKeys = new Map<string, { test: string; side: string | null }>();
  for (const r of romLog) {
    const T = TESTS[r.test as string];
    if (T) {
      const sd = T.sided ? r.side || null : null;
      romKeys.set(r.test + '|' + sd, { test: r.test as string, side: sd });
    }
  }
  for (const { test, side } of romKeys.values()) {
    const T = TESTS[test] as NonNullable<(typeof TESTS)[string]>,
      ser = romSeries(romLog, test, side),
      tr_ = romTrend(romLog, test, side);
    if (!ser.length) continue;
    rom.push({
      test,
      name: T.name,
      side,
      unit: T.unit || '°',
      baseline: r1(tr_.baseline),
      last: r1(tr_.last),
      gain: tr_.gain,
      pctNormal: tr_.pctNormal,
      normal: { lo: T.normal?.lo ?? null, hi: T.normal?.hi ?? null, ref: T.normal?.ref ?? null },
      n: ser.length,
      lastTs: tr_.lastTs,
      series: ser.map((x) => [x.ts, r1(x.deg)]),
    });
  }
  rom.sort((a, b) => (a.test < b.test ? -1 : a.test > b.test ? 1 : (a.side || '') < (b.side || '') ? -1 : 1));

  // Questionnaires
  const promLog = (prof.promLog || []).filter((r) => r && r.ts <= to);
  const prom = [...new Set(promLog.map((l) => l.id as string))]
    .map((id): ReportProm | null => {
      const def = instrumentDef(id, prof.promCustom || []);
      if (!def) return null;
      const tr_ = promTrend(promLog, id, def);
      if (!tr_.n) return null;
      return {
        id,
        name: def.name,
        n: tr_.n,
        baseline: tr_.baseline,
        last: tr_.last,
        delta: tr_.delta,
        improvement: tr_.improvement,
        mcid: def.mcid || null,
        mcidReached: !!tr_.mcidReached,
        higherIsBetter: def.higherIsBetter,
        range: def.range || null,
        lastTs: tr_.lastTs,
      };
    })
    .filter((x): x is ReportProm => !!x);

  // Badges
  const bg = prof.badges || {};
  const badges = { total: Object.keys(bg).length, inPeriod: Object.values(bg).filter((ts) => inP(ts)).length };

  // Journal des séances (période seulement, les plus récentes si trop long)
  let logAll: ReportLogEntry[] = sP.map((s) => ({
    ts: s.date,
    items: s.items.map((i) => {
      const sets = i.sets || [];
      const sum = (k: 'reps' | 'full' | 'partial' | 'holdSec'): number =>
        sets.reduce((a, x) => a + (+(x[k] as number) || 0), 0);
      return {
        id: i.id,
        name: nameOfEx(i.id),
        sets: sets.length,
        reps: sum('reps'),
        full: sum('full'),
        partial: sum('partial'),
        holdSec: sum('holdSec'),
        pain: i.pain ?? null,
        difficulty: i.difficulty ?? null,
      };
    }),
    pain: r1(avg(s.items.map((i) => i.pain).filter(notNil))),
    difficulty: r1(avg(s.items.map((i) => i.difficulty).filter(notNil))),
  }));
  const logTruncated = logAll.length > LOG_CAP;
  if (logTruncated) logAll = logAll.slice(-LOG_CAP);

  const notes: ReportNote[] = sP
    .flatMap((s) =>
      s.items
        .filter((i) => i.note)
        .map((i) => ({
          ts: i.ts || s.date,
          ex: i.id,
          exName: nameOfEx(i.id),
          pain: i.pain ?? null,
          text: String(i.note).slice(0, 400),
        })),
    )
    .sort((a, b) => a.ts - b.ts)
    .slice(-30);

  // Identité / problème
  const path = P.pathologyById(prof.pathology);
  const st = ((): P.ProtocolStatus | null => {
    try {
      return P.protocolStatus(prof, now);
    } catch {
      return null;
    }
  })();
  const protocol = st
    ? {
        id: st.id,
        name: protocolById(st.id)?.name || st.id,
        week: st.week,
        phase: st.phaseIndex + 1,
        phases: st.phaseCount,
        preop: st.preop,
        surgeryDate: prof.protocol?.surgeryDate || null,
      }
    : null;

  return {
    version: 1,
    generatedAt: now,
    source: 'full',
    period: { from, to, days: Math.max(1, Math.round((to - from) / DAY)) },
    patient: { name: opts.includeName === false ? '' : String(prof.name || '').trim() },
    condition: {
      pathology: path ? path.name : null,
      region: path?.region || null,
      phase: prof.phase || null,
      week: prof.startDate ? P.weekNumber(prof, now) : null,
      protocol,
      clinician: prof.clinician || '',
    },
    adherence: { planned, done: hit, pct: planned ? Math.round((hit / planned) * 100) : null },
    sessionsCount: sP.length,
    pain,
    exercises,
    rom,
    prom,
    badges,
    fields: cleanFields(opts.fields),
    log: logAll,
    logTruncated,
    notes,
  };
}

/** Résumé que le patient partage (progressSummary + summaryPart des modules), tel que lu par le rapport du clinicien. */
export interface SharedSummary {
  name?: string | undefined;
  phase?: number | string | undefined;
  week?: number | undefined;
  planned?: number | undefined;
  sessions7?: number | undefined;
  pain7?: number | null | undefined;
  last?: { date: number; n?: number | undefined; pain?: number | null | undefined }[] | undefined;
  rom?:
    | {
        t: string;
        s?: string | null | undefined;
        b?: number | null | undefined;
        l?: number | null | undefined;
        g?: number | null | undefined;
        n?: number | undefined;
        ts?: number | null | undefined;
        p?: [number, number | null][] | undefined;
      }[]
    | undefined;
  prom?:
    | {
        id: string;
        name: ReportName;
        n?: number | undefined;
        baseline?: number | null | undefined;
        last?: number | null | undefined;
        delta?: number | null | undefined;
        improvement?: unknown;
        mcidReached?: boolean | undefined;
        higherIsBetter?: boolean | undefined;
        range?: unknown;
        lastTs?: number | null | undefined;
      }[]
    | undefined;
  protocol?:
    | {
        id: string;
        week?: number | undefined;
        phase?: number | undefined;
        phases?: number | undefined;
        preop?: boolean | undefined;
      }
    | undefined;
  ex?:
    | Record<
        string,
        {
          level?: number | undefined;
          lastDifficulty?: number | null | undefined;
          lastPain?: number | null | undefined;
          trend?: string | undefined;
        }
      >
    | undefined;
  report?: { fields?: ReportFieldsInput | null | undefined } | null | undefined;
  badges?: unknown[] | { total?: number } | number | undefined;
  notes?: { date: number; ex: string; pain?: number | null | undefined; text: string }[] | undefined;
  [key: string]: unknown;
}

/**
 * Même structure à partir du résumé que le patient partage (progressSummary + summaryPart des modules), pour le clinicien.
 * Lacunes (le résumé ne les contient pas) : période réelle (7 derniers jours seulement), séries / répétitions, adhérence sur la période,
 * douleur au-delà des 5 dernières séances, nom de la pathologie (passer extra.pathology = id ou { fr, en }), niveau de départ des exercices.
 */
export function dataFromSummary(
  sum: SharedSummary = {},
  extra: {
    now?: number | undefined;
    pathology?: string | Localized<string> | null | undefined;
    surgeryDate?: string | undefined;
  } = {},
): ReportData {
  const now = extra.now ?? Date.now();
  const last = (sum.last || []).slice().sort((a, b) => a.date - b.date);
  const ps: PainPoint[] = last
    .filter((l) => l.pain !== undefined && l.pain !== null)
    .map((l) => ({ ts: l.date, v: r1(l.pain) as number, src: 's' as const }));
  const pv = ps.map((p) => p.v);
  const firstPv = pv[0] as number,
    lastPv = pv[pv.length - 1] as number;
  const rom = (sum.rom || [])
    .map((r): ReportRom | null => {
      const T = TESTS[r.t];
      if (!T) return null;
      return {
        test: r.t,
        name: T.name,
        side: r.s || null,
        unit: T.unit || '°',
        baseline: r.b,
        last: r.l,
        gain: r.g,
        pctNormal:
          (T.normal?.ref as number) > 0 && !T.deficit && r.l !== undefined && r.l !== null
            ? Math.round((r.l / (T.normal?.ref as number)) * 100)
            : null,
        normal: { lo: T.normal?.lo ?? null, hi: T.normal?.hi ?? null, ref: T.normal?.ref ?? null },
        n: r.n,
        lastTs: r.ts,
        series: r.p || [],
      };
    })
    .filter((x): x is ReportRom => !!x);
  const prom: ReportProm[] = (sum.prom || []).map((p) => ({
    id: p.id,
    name: p.name,
    n: p.n,
    baseline: p.baseline,
    last: p.last,
    delta: p.delta,
    improvement: p.improvement,
    mcid: p.mcidReached ? true : null,
    mcidReached: !!p.mcidReached,
    higherIsBetter: p.higherIsBetter,
    range: p.range,
    lastTs: p.lastTs,
  }));
  const proto = sum.protocol && protocolById(sum.protocol.id) ? sum.protocol : null;
  const pr = proto
    ? {
        id: proto.id,
        name: (protocolById(proto.id) as { name: Localized<string> }).name,
        week: proto.week,
        phase: proto.phase,
        phases: proto.phases,
        preop: !!proto.preop,
        surgeryDate: extra.surgeryDate || null,
      }
    : null;
  const pathName: ReportName =
    typeof extra.pathology === 'string' ? P.pathologyById(extra.pathology)?.name || null : extra.pathology || null;
  const exercises: ReportExercise[] = Object.entries(sum.ex || {})
    .filter(([id]) => EXERCISES[id])
    .map(([id, e]) => ({
      id,
      name: nameOfEx(id),
      level: e.level,
      levelStart: null,
      sessions: null,
      difficulty: e.lastDifficulty,
      pain: e.lastPain,
      trend: e.trend || 'steady',
    }));
  const rep = sum.report || null;
  return {
    version: 1,
    generatedAt: now,
    source: 'summary',
    period: { from: now - 7 * DAY, to: now, days: 7 },
    patient: { name: String(sum.name || '').trim() },
    condition: {
      pathology: pathName,
      region: null,
      phase: (sum.phase as number | string | null | undefined) || null,
      week: sum.week ?? null,
      protocol: pr,
      clinician: '',
    },
    adherence: {
      planned: sum.planned ?? null,
      done: sum.sessions7 ?? 0,
      pct: sum.planned ? Math.min(100, Math.round(((sum.sessions7 || 0) / sum.planned) * 100)) : null,
    },
    sessionsCount: sum.sessions7 ?? 0,
    pain: {
      series: ps,
      avg: sum.pain7 ?? r1(avg(pv)),
      first: pv.length ? firstPv : null,
      last: pv.length ? lastPv : null,
      delta: pv.length > 1 ? r1(lastPv - firstPv) : null,
      min: pv.length ? Math.min(...pv) : null,
      max: pv.length ? Math.max(...pv) : null,
    },
    exercises,
    rom,
    prom,
    badges: {
      total: Array.isArray(sum.badges)
        ? sum.badges.length
        : ((sum.badges as { total?: number } | undefined)?.total ?? 0),
      inPeriod: 0,
    },
    fields: cleanFields(rep?.fields),
    log: last
      .slice()
      .reverse()
      .map((l) => ({ ts: l.date, n: l.n, pain: r1(l.pain) }))
      .reverse(),
    logTruncated: false,
    notes: (sum.notes || [])
      .slice()
      .sort((a, b) => a.date - b.date)
      .map((n) => ({ ts: n.date, ex: n.ex, exName: nameOfEx(n.ex), pain: n.pain ?? null, text: n.text })),
  };
}

/** Petit résumé pour le clinicien (à ajouter à progressSummary) : dernier rapport du patient. */
export function summaryPart(prof: Profile | null | undefined): {
  report?: { ts: number; every: number | null; fields: Record<string, unknown> | null; n: number };
} {
  const r = (prof?.reportLog || []).filter((x) => x && x.ts).sort((a, b) => b.ts - a.ts)[0];
  if (!r) return {};
  return {
    report: {
      ts: r.ts,
      every: prof?.reportPlan?.every || null,
      fields: r.fields || null,
      n: (prof?.reportLog || []).length,
    },
  };
}

/** Profil patient ← rx : { reportPlan }. */
export const rxExtrasReport = (
  rx: { report?: { every?: unknown } | null } | null | undefined,
): { reportPlan: { every: number } | null } => ({
  reportPlan: +(rx?.report?.every as number) > 0 ? { every: +(rx?.report?.every as number) } : null,
});
