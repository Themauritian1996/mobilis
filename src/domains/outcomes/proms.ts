import { CUSTOM_SCALES, FREE_ORDER, INSTRUMENTS, LICENSED_ORDER } from './data/proms.ts';
import type { Bilingual, CustomScale, InstrumentDef } from './data/types.ts';

/** Questionnaire personnalisé du clinicien (rx.promCustom). */
export interface CustomProm {
  readonly id: string;
  readonly title?: string;
  readonly questions?: readonly (string | { readonly text?: string } | null | undefined)[];
  readonly scale?: string;
  readonly score?: string;
  readonly higherIsBetter?: boolean;
}

/** Texte sous licence importé par le clinicien : items et libellés des choix (jamais dans le code). */
export interface LicenseEntry {
  readonly items: readonly (Bilingual | string)[];
  readonly options?: readonly Bilingual[] | null;
  readonly importedAt?: number;
}

export type LicenseMap = Readonly<Record<string, LicenseEntry>>;

export interface ResolveContext {
  readonly custom?: readonly CustomProm[] | null | undefined;
  readonly licenses?: LicenseMap | null | undefined;
  readonly activities?: readonly unknown[] | null | undefined;
}

export type ValidateLicenseResult =
  | { readonly ok: true; readonly id: string; readonly entry: LicenseEntry & { readonly importedAt: number } }
  | { readonly ok: false; readonly error: 'json' | 'instrument' | 'items' | 'options' };

export interface ScoreResult {
  readonly score: number | null;
  readonly valid: boolean;
  readonly answered: number;
  readonly total: number;
  readonly sub?: Readonly<Record<string, number | null | undefined>>;
}

/** Réponses : tableau indexé par item ; null/undefined = manquant. */
export type PromAnswers = readonly (number | null | undefined)[] | null | undefined;

export interface PlanEntry {
  readonly id?: string;
  /** Semaines entre deux passations (0 = une seule fois). */
  readonly every?: number | string;
  /** Jours après le début du programme. */
  readonly first?: number | string;
}

export interface PromLogEntry {
  readonly id: string;
  readonly ts?: number;
  readonly score?: number | null;
}

export interface DueEntry {
  readonly id: string;
  readonly dueTs: number;
  readonly lastTs: number | null;
  readonly overdueDays: number;
}

export interface TrendResult {
  readonly n: number;
  readonly baseline: number | null;
  readonly last: number | null;
  readonly delta: number | null;
  readonly improvement: number | null;
  readonly mcidReached: boolean;
  readonly worsened: boolean;
  readonly lastTs: number | null;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const S = (fr: string, en: string): Bilingual => ({ fr, en });
const DAY = 86400000;
const isNil = (x: unknown): x is null | undefined => x === null || x === undefined;
const r1 = (x: number): number => Math.round(x * 10) / 10;

export const isCustomId = (id: unknown): id is string => typeof id === 'string' && id.startsWith('c_');

export function customToDef(c: CustomProm | null | undefined): InstrumentDef | null {
  if (!c) return null;
  const sc: CustomScale =
    (CUSTOM_SCALES as Readonly<Record<string, CustomScale>>)[c.scale ?? ''] || CUSTOM_SCALES['0-10'];
  const qs = (c.questions || [])
    .map((q) => (typeof q === 'string' ? q : q?.text))
    .filter((x): x is string => Boolean(x && String(x).trim()));
  const n = qs.length,
    mode: 'sum' | 'mean' | 'pct' = c.score === 'sum' || c.score === 'mean' || c.score === 'pct' ? c.score : 'mean';
  const range: readonly [number, number] = mode === 'sum' ? [0, n * sc.max] : mode === 'pct' ? [0, 100] : [0, sc.max];
  return {
    id: c.id,
    kind: 'custom',
    name: c.title || 'Questionnaire',
    short: c.title || 'Questionnaire',
    regions: ['all'],
    algo: 'custom',
    mode,
    range,
    higherIsBetter: !!c.higherIsBetter,
    options: { ...sc, ends: sc.labels ? undefined : [S('0', '0'), S('10', '10')] },
    items: qs.map((x, i) => ({ id: 'q' + (i + 1), text: x })),
    mcid: null,
    minAnswered: 1,
  };
}
export function instrumentDef(id: string, custom: readonly CustomProm[] | null | undefined = []): InstrumentDef | null {
  const known = INSTRUMENTS[id];
  if (known) return known;
  if (isCustomId(id)) return customToDef((custom || []).find((c) => c.id === id));
  return null;
}

// ---------- Licences importées ----------
// Fichier : { instrument:'koos12', items:[{fr,en,...}], options:[ {fr,en} | "texte" ... ] }. Retourne { ok, error?, id?, entry? }.
export function validateLicense(json: unknown): ValidateLicenseResult {
  const d: Record<string, unknown> | null =
    typeof json === 'string'
      ? (() => {
          try {
            return JSON.parse(json);
          } catch {
            return null;
          }
        })()
      : json;
  if (!d || typeof d !== 'object') return { ok: false, error: 'json' };
  const def = INSTRUMENTS[String(d.instrument)];
  if (!def || def.kind !== 'licensed') return { ok: false, error: 'instrument' };
  if (!Array.isArray(d.items) || d.items.length !== def.nItems) return { ok: false, error: 'items' };
  const toText = (x: unknown): Bilingual => (typeof x === 'string' ? { fr: x, en: x } : { ...(x as Bilingual) });
  const items = d.items.map(toText);
  if (items.some((x) => !(x.fr || x.en))) return { ok: false, error: 'items' };
  let options: Bilingual[] | null = null;
  if (!isNil(d.options)) {
    if (!Array.isArray(d.options) || d.options.length !== def.options.count) return { ok: false, error: 'options' };
    options = d.options.map(toText);
  }
  return { ok: true, id: def.id, entry: { items, options, importedAt: Date.now() } };
}
// Textes sous licence disponibles : ceux embarqués dans la prescription (rx.promTexts / profil.promTexts) complétés par ceux importés
// sur l'appareil (prioritaires). Seules les entrées valides (bon nombre d'items) sont gardées. Retourne { id: entry }.
export function mergeLicenses(
  embedded: LicenseMap | null | undefined,
  local: LicenseMap | null | undefined,
): Record<string, LicenseEntry> {
  const out: Record<string, LicenseEntry> = {};
  for (const src of [embedded, local]) {
    for (const [id, e] of Object.entries(src || {})) {
      const def = INSTRUMENTS[id];
      if (def?.kind === 'licensed' && Array.isArray(e?.items) && e.items.length === def.nItems) out[id] = e;
    }
  }
  return out;
}
// def avec items (licences : { id: entry })
export function resolveDef(
  id: string,
  { custom = [], licenses = {}, activities = [] }: ResolveContext = {},
): InstrumentDef | null {
  const def = instrumentDef(id, custom);
  if (!def) return null;
  if (def.kind === 'licensed') {
    const lic = licenses?.[id];
    if (!lic?.items || lic.items.length !== def.nItems) return { ...def, items: [], available: false };
    const labels = lic.options || null;
    return {
      ...def,
      items: lic.items.map((x, i) => ({ id: 'q' + (i + 1), text: x })),
      options: { ...def.options, labels },
      available: true,
    };
  }
  if (def.dynamicItems) {
    const acts = (activities || []).filter((a) => a && String(a).trim()).slice(0, def.dynamicItems.max);
    return {
      ...def,
      items: acts.map((a, i) => ({ id: 'a' + (i + 1), text: String(a) })),
      available: acts.length >= def.dynamicItems.min,
    };
  }
  return { ...def, available: !!def.items.length };
}
export const isAvailable = (id: string, ctx?: ResolveContext): boolean => !!resolveDef(id, ctx)?.available;
export const nItemsOf = (def: InstrumentDef): number =>
  def.kind === 'licensed' ? (def.nItems as number) : def.items.length;

// ---------- Calcul des scores ----------
// answers : tableau (index = item), null/undefined = manquant. Valeurs hors échelle = manquant.
// Résultat : { score|null, valid, answered, total, sub? }
export function score(defOrId: InstrumentDef | string | null | undefined, answers: PromAnswers): ScoreResult {
  const def = typeof defOrId === 'string' ? INSTRUMENTS[defOrId] : defOrId;
  if (!def) return { score: null, valid: false, answered: 0, total: 0 };
  const total = nItemsOf(def);
  const lo = def.options.min,
    hi = def.options.max;
  const a = Array.from({ length: total }, (_, i) => {
    const v = answers?.[i];
    return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  });
  const got = a.filter((v): v is number => !isNil(v));
  const answered = got.length;
  const out = (s: number | null | undefined, extra: Pick<ScoreResult, 'sub'> = {}): ScoreResult => ({
    score: isNil(s) ? null : r1(s),
    valid: !isNil(s),
    answered,
    total,
    ...extra,
  });
  const sum = (arr: readonly number[]): number => arr.reduce((x, y) => x + y, 0);
  const need = isNil(def.minAnswered)
    ? total
    : def.minAnswered < 1
      ? Math.ceil(def.minAnswered * total)
      : def.minAnswered;
  switch (def.algo) {
    case 'single':
      return out(answered ? a.find((v) => !isNil(v)) : null);
    case 'mean': {
      // NPRS, activités : moyenne des items répondus
      if (!answered) return out(null);
      const sub = def.sub
        ? Object.fromEntries(Object.entries(def.sub).map(([k, ix]) => [k, a[ix[0] as number]]))
        : undefined;
      return out(sum(got) / answered, sub ? { sub } : {});
    }
    case 'mfq': {
      // 0–4 difficulté -> 0–100, 100 = aucune limitation ; valide si ≥ 75 % des items
      if (answered < need) return out(null);
      return out((1 - sum(got) / answered / hi) * 100);
    }
    case 'custom': {
      if (!answered || answered < (def.mode === 'sum' ? total : 1)) return out(null);
      const m = sum(got) / answered;
      return out(def.mode === 'sum' ? sum(got) : def.mode === 'pct' ? (m / hi) * 100 : m);
    }
    case 'quickdash': // ((somme/n) − 1) × 25, n ≥ 10 items répondus
      if (answered < need) return out(null);
      return out((sum(got) / answered - 1) * 25);
    case 'koos12': {
      // sous-échelles : 100 − moyenne/4 × 100 (≥ 3 items sur 4) ; total = moyenne des 3
      const sub: Record<string, number | null> = {};
      for (const [k, ix] of Object.entries(def.subs!)) {
        const v = ix.map((i) => a[i]).filter((x): x is number => !isNil(x));
        sub[k] = v.length >= 3 ? r1(100 - (sum(v) / v.length / hi) * 100) : null;
      }
      const vals = Object.values(sub);
      return out(vals.every((x) => !isNil(x)) ? sum(vals) / vals.length : null, { sub });
    }
    case 'spadi': {
      // % douleur, % incapacité, total = moyenne ; manquants : moyenne des items répondus
      const sub: Record<string, number | null> = {};
      for (const [k, ix] of Object.entries(def.subs!)) {
        const v = ix.map((i) => a[i]).filter((x): x is number => !isNil(x));
        sub[k] = v.length ? r1((sum(v) / v.length / hi) * 100) : null;
      }
      const vals = Object.values(sub);
      return out(vals.every((x) => !isNil(x)) ? sum(vals) / vals.length : null, { sub });
    }
    case 'lefs': {
      // somme 0–80, proratisée si ≤ 2 manquants
      if (answered < need) return out(null);
      return out(answered === total ? sum(got) : (sum(got) / answered) * total);
    }
    case 'odi': {
      // somme / (max × répondues) × 100 (ODI et NDI)
      if (answered < need) return out(null);
      return out((sum(got) / (hi * answered)) * 100);
    }
    default:
      return out(null);
  }
}

// Interprétation en mots simples : 0 = très peu de gêne … 3 = gêne importante (selon la position dans l'échelle)
export function band(
  def: Pick<InstrumentDef, 'range' | 'higherIsBetter'>,
  s: number | null | undefined,
): number | null {
  if (isNil(s)) return null;
  const [lo, hi] = def.range;
  let n = (s - lo) / (hi - lo);
  if (!def.higherIsBetter) n = 1 - n;
  return n >= 0.85 ? 0 : n >= 0.65 ? 1 : n >= 0.4 ? 2 : 3;
}

// ---------- Échéances ----------
// plan : [{ id, every (semaines, 0 = une seule fois), first (jours après le début) }] ; log : [{ id, ts }] ; startTs, now (ms)
// Retourne [{ id, dueTs, lastTs|null, overdueDays }] des questionnaires dus (aujourd'hui ou en retard).
const dayStart = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export function due(
  plan: readonly (PlanEntry | null | undefined)[] | null | undefined,
  log: readonly PromLogEntry[] | null | undefined,
  startTs: number | null | undefined,
  now = Date.now(),
): DueEntry[] {
  const res: DueEntry[] = [];
  for (const p of plan || []) {
    if (!p?.id) continue;
    const done = (log || [])
      .filter((l) => l.id === p.id && l.ts)
      .map((l) => l.ts as number)
      .sort((x, y) => x - y);
    const last = done.length ? (done[done.length - 1] as number) : null;
    const every = Math.max(0, +(p.every ?? 0) || 0);
    let dueTs: number;
    if (isNil(last)) dueTs = (startTs || now) + Math.max(0, +(p.first ?? 0) || 0) * DAY;
    else if (every === 0) continue;
    else dueTs = Math.max(last + every * 7 * DAY, (startTs || 0) + Math.max(0, +(p.first ?? 0) || 0) * DAY);
    if (now >= dayStart(dueTs))
      res.push({
        id: p.id,
        dueTs,
        lastTs: last,
        overdueDays: Math.max(0, Math.floor((dayStart(now) - dayStart(dueTs)) / DAY)),
      });
  }
  return res;
}

// ---------- Tendance ----------
// -> { n, baseline, last, delta, improvement, mcidReached, worsened, lastTs }. delta = last − baseline (signe brut).
// improvement = amélioration dans le bon sens (positive = mieux). mcidReached : amélioration ≥ DMCI (ou niveau atteint pour PGIC).
export function trend(
  log: readonly PromLogEntry[] | null | undefined,
  id: string,
  def?: InstrumentDef | null,
): TrendResult {
  def = def || INSTRUMENTS[id];
  const rows = (log || [])
    .filter((l): l is PromLogEntry & { score: number; ts: number } => l.id === id && typeof l.score === 'number')
    .sort((a, b) => a.ts - b.ts);
  const base: Mutable<TrendResult> = {
    n: rows.length,
    baseline: null,
    last: null,
    delta: null,
    improvement: null,
    mcidReached: false,
    worsened: false,
    lastTs: null,
  };
  if (!rows.length) return base;
  const last = rows[rows.length - 1] as (typeof rows)[number];
  const out: Mutable<TrendResult> = { ...base, last: last.score, lastTs: last.ts };
  if (def?.mcid?.type === 'level') {
    // PGIC : seuil sur la dernière réponse seulement
    out.mcidReached = def.higherIsBetter ? last.score >= def.mcid.value : last.score <= def.mcid.value;
    return out;
  }
  if (rows.length < 2 || def?.noBaseline) return { ...out, baseline: (rows[0] as (typeof rows)[number]).score };
  const first = (rows[0] as (typeof rows)[number]).score;
  out.baseline = first;
  out.delta = r1(last.score - first);
  out.improvement = def?.higherIsBetter === false ? -out.delta : out.delta;
  const m = def?.mcid;
  if (m) {
    const rel = m.pct && out.baseline > 0 ? Math.max(1, (out.baseline * m.pct) / 100) : Infinity; // « 2 points ou 30 % » : l'un ou l'autre
    out.mcidReached = out.improvement > 0 && (out.improvement >= m.value || out.improvement >= rel);
    out.worsened = out.improvement <= -m.value;
  }
  return out;
}

// ---------- Résumé pour le clinicien ----------
// -> { prom: [{ id, name, n, baseline, last, delta, improvement, mcidReached, worsened, lastTs, higherIsBetter, range, series:[[ts,score],...≤12] }] }
export interface PromSummary extends TrendResult {
  readonly id: string;
  readonly name: Bilingual | string;
  readonly higherIsBetter: boolean;
  readonly range: readonly [number, number];
  readonly series: readonly (readonly [number, number])[];
}

export function summaryPart(
  profile:
    | {
        readonly promLog?: readonly PromLogEntry[] | null;
        readonly promCustom?: readonly CustomProm[] | null;
      }
    | null
    | undefined,
): { prom: PromSummary[] } {
  const log = profile?.promLog || [],
    custom = profile?.promCustom || [];
  const ids = [...new Set(log.map((l) => l.id))];
  const prom = ids
    .map((id): PromSummary | null => {
      const def = instrumentDef(id, custom);
      if (!def) return null;
      const tr_ = trend(log, id, def);
      const series = log
        .filter((l): l is PromLogEntry & { score: number; ts: number } => l.id === id && typeof l.score === 'number')
        .sort((a, b) => a.ts - b.ts)
        .slice(-12)
        .map((l): readonly [number, number] => [l.ts, l.score]);
      return { id, name: def.name, ...tr_, higherIsBetter: def.higherIsBetter, range: def.range, series };
    })
    .filter((x): x is PromSummary => !isNil(x));
  return { prom };
}

// Régions -> instruments proposés (libres génériques + fonctionnel Mobilis + catalogue sous licence)
export function suggestFor(region: string): { general: string[]; region: string[] } {
  const mfq = FREE_ORDER.filter((id) => INSTRUMENTS[id]!.mfq && INSTRUMENTS[id]!.regions.includes(region));
  const lic = LICENSED_ORDER.filter((id) => INSTRUMENTS[id]!.regions.includes(region));
  return { general: ['nprs', 'pgic', 'sane', 'sleep', 'activities'], region: [...mfq, ...lic] };
}
