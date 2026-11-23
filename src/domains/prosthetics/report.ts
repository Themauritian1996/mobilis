/**
 * Mise en forme du rapport prothétique (spec §5, §10.10) : fonctions PURES, sans DOM. Entrée = `ProstheticAssessment`
 * (sortie de `assessProstheticGait`, stockée sous `assessment.result.prosthetic`) ; sortie = modèle de rapport que
 * l'écran affiche. Toutes les déviations du catalogue pour le niveau y figurent (présente / possible / à observer /
 * absente / données insuffisantes). Le contenu clinique du catalogue (causes, pistes) est en français.
 * Suggestions fondées sur la littérature — à valider par l'équipe (prothésiste, physiatre).
 */
import { DETERMINANTS, type CriterionResult, type FindingStatus } from '../gait/index.ts';
import { stateOf, isRetained, type DeviationState } from './compare.ts';
import { PROSTHETIC_CATALOG, type ProstheticAssessment } from './deviations.ts';

export type Lang = 'fr' | 'en';

/** Ordre de présentation des causes possibles (spec §5 : alignement, emboîture/suspension, longueur, composants…). */
export const CAUSE_ORDER = [
  'alignment',
  'socket_suspension',
  'length',
  'components',
  'weakness_rom',
  'pain',
  'habit_fear',
] as const;
export type CauseCategory = (typeof CAUSE_ORDER)[number];

export interface CauseGroup {
  readonly category: string;
  readonly label: string;
  readonly items: readonly string[];
}

export type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'none';

export interface MeasuredLine {
  readonly text: string;
  /** Valeur formatée avec unité, ou `null` si non mesurée. */
  readonly value: string | null;
  /** Seuil d'anomalie formaté, ou `null`. */
  readonly threshold: string | null;
  readonly status: CriterionResult['status'];
  readonly estimate: boolean;
  /** Seuil proposé (heuristique) ou à vérifier : à signaler discrètement. */
  readonly unvalidated: boolean;
}

export interface DeviationReport {
  readonly id: string;
  readonly name: string;
  readonly state: DeviationState;
  readonly status: FindingStatus;
  readonly score: number;
  readonly confidence: ConfidenceLevel;
  readonly estimate: boolean;
  readonly measured: readonly MeasuredLine[];
  /** Texte « à observer cliniquement » quand la déviation n'est pas mesurable de façon fiable en 2D. */
  readonly observeNote: string | null;
  readonly determinants: readonly string[];
  readonly causes: readonly CauseGroup[];
  readonly adjustments: readonly string[];
  readonly exercises: readonly string[];
  readonly assistiveDevice: string | null;
  readonly refs: readonly string[];
  readonly safety: string | null;
  readonly camera2dLimits: string | null;
  readonly evidenceLevel: string | null;
  readonly unvalidatedThresholds: boolean;
}

export interface ProstheticReport {
  readonly level: string;
  readonly catalogLevel: ProstheticAssessment['catalogLevel'];
  readonly side: string;
  readonly entries: readonly DeviationReport[];
  readonly counts: Readonly<Record<DeviationState, number>>;
  readonly disclaimer: string;
  /** Références distinctes citées, dans l'ordre de première apparition parmi les déviations retenues puis les autres. */
  readonly refs: readonly string[];
}

/** Décimales selon la langue (virgule en français). */
export function fmtNumber(n: number, lang: Lang = 'fr', digits = 1): string {
  const s = String(Number(n.toFixed(digits)));
  return lang === 'fr' ? s.replace('.', ',') : s;
}

const UNIT_SPACE = (u: string): string => (u === '°' || u === '%' ? `${u === '%' ? ' ' : ''}${u}` : ` ${u}`);

/** « 12,3 ° », « 45 % », « 0,05 m » ; `null` si la valeur est absente. */
export function formatValue(value: number | null, unit: string, lang: Lang = 'fr'): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const digits = Math.abs(value) < 1 && unit !== '%' ? 2 : 1;
  return `${fmtNumber(value, lang, digits)}${UNIT_SPACE(unit)}`;
}

export function measuredLine(c: CriterionResult, lang: Lang = 'fr'): MeasuredLine {
  return {
    text: c.text,
    value: formatValue(c.value, c.unit, lang),
    threshold: formatValue(c.anomalyThreshold, c.unit, lang),
    status: c.status,
    estimate: c.estimate,
    unvalidated: c.thresholdType === 'proposed_heuristic' || c.thresholdType === 'to_verify',
  };
}

/** Niveau de confiance affichable. Une déviation « à observer » (non mesurée) est toujours de faible confiance. */
export function confidenceLevel(status: FindingStatus, score: number): ConfidenceLevel {
  if (status === 'observe') return 'low';
  if (status === 'absent' || status === 'insufficient_data') return 'none';
  return score >= 0.6 ? 'high' : score >= 0.35 ? 'moderate' : 'low';
}

const STATE_RANK: Record<DeviationState, number> = { present: 0, possible: 1, observe: 2, insufficient: 3, absent: 4 };

/** Causes du catalogue d'une déviation, classées par catégorie (ordre de `CAUSE_ORDER`, puis catégories inconnues). */
export function causeGroups(deviationId: string): CauseGroup[] {
  const j = PROSTHETIC_CATALOG.deviations.find((x) => x.id === deviationId);
  if (!j) return [];
  const cats = [
    ...CAUSE_ORDER.filter((c) => c in j.causes),
    ...Object.keys(j.causes).filter((c) => !(CAUSE_ORDER as readonly string[]).includes(c)),
  ];
  return cats
    .map((c) => ({ category: c, label: PROSTHETIC_CATALOG.causeCategories[c] ?? c, items: j.causes[c] ?? [] }))
    .filter((g) => g.items.length > 0);
}

const OBSERVE_FALLBACK = 'Non mesurable de façon fiable par une caméra 2D : à observer cliniquement.';

/** Modèle d'une déviation à partir du résultat du moteur et du catalogue. */
export function deviationReport(d: ProstheticAssessment['deviations'][number], lang: Lang = 'fr'): DeviationReport {
  const j = PROSTHETIC_CATALOG.deviations.find((x) => x.id === d.id);
  const state = stateOf(d.status);
  const observe = d.status === 'observe' || (d.criteria.length === 0 && j?.measurableByCamera === false);
  const known = new Map(DETERMINANTS.map((x) => [x.id, x]));
  return {
    id: d.id,
    name: lang === 'en' ? d.name_en : d.name_fr,
    state,
    status: d.status,
    score: d.score,
    confidence: confidenceLevel(d.status, d.score),
    estimate: d.estimate,
    measured: d.criteria.map((c) => measuredLine(c, lang)),
    observeNote: observe ? (d.camera2dLimits ?? j?.camera2dLimits ?? OBSERVE_FALLBACK) : null,
    determinants: d.determinants.map((id) => {
      const k = known.get(id);
      return k ? (lang === 'en' ? k.name_en : k.name_fr) : id;
    }),
    causes: causeGroups(d.id),
    adjustments: j?.suggestions_prosthetist ?? [],
    exercises: j?.exercises ?? [],
    assistiveDevice: j?.assistiveDevice ?? null,
    refs: d.references.length ? d.references : (j?.refs ?? []),
    safety: d.safety ?? j?.safety ?? null,
    camera2dLimits: d.camera2dLimits ?? j?.camera2dLimits ?? null,
    evidenceLevel: d.evidenceLevel,
    unvalidatedThresholds: d.unvalidatedThresholds.length > 0,
  };
}

/** Rapport complet : TOUTES les déviations du niveau, classées (présentes, possibles, à observer, insuffisantes, absentes). */
export function buildProstheticReport(p: ProstheticAssessment, lang: Lang = 'fr'): ProstheticReport {
  const entries = p.deviations
    .map((d, i) => ({ r: deviationReport(d, lang), i }))
    .sort((x, y) => STATE_RANK[x.r.state] - STATE_RANK[y.r.state] || x.i - y.i)
    .map((x) => x.r);
  const counts: Record<DeviationState, number> = { present: 0, possible: 0, observe: 0, insufficient: 0, absent: 0 };
  for (const e of entries) counts[e.state]++;
  const refs = [...new Set(entries.flatMap((e) => e.refs))];
  return {
    level: p.prosthesis.level,
    catalogLevel: p.catalogLevel,
    side: p.prosthesis.side,
    entries,
    counts,
    disclaimer: p.disclaimer,
    refs,
  };
}

// ---------------------------------------------------------------- Liste de vérification pour le prothésiste

export interface ChecklistItem {
  readonly id: string;
  readonly name: string;
  readonly state: DeviationState;
  /** Mesure ou texte « à observer » : ce qui a motivé la ligne. */
  readonly basis: string;
  readonly causes: readonly CauseGroup[];
  readonly adjustments: readonly string[];
  readonly safety: string | null;
}

export interface Checklist {
  /** Déviations retenues (présentes ou possibles), la plus sûre d'abord (sécurité en tête). */
  readonly retained: readonly ChecklistItem[];
  /** Déviations à observer cliniquement (non mesurables en 2D). */
  readonly toObserve: readonly ChecklistItem[];
  readonly disclaimer: string;
}

const basisOf = (e: DeviationReport): string => {
  const first = e.measured.find((m) => m.value !== null && m.status !== 'absent' && m.status !== 'unavailable');
  if (first && first.value !== null) return `${first.text} — ${first.value}`;
  return e.observeNote ?? '';
};

const toItem = (e: DeviationReport): ChecklistItem => ({
  id: e.id,
  name: e.name,
  state: e.state,
  basis: basisOf(e),
  causes: e.causes,
  adjustments: e.adjustments,
  safety: e.safety,
});

/** Liste imprimable : déviations retenues + causes à vérifier ; les déviations « à observer » forment une section à part. */
export function buildChecklist(p: ProstheticAssessment, lang: Lang = 'fr'): Checklist {
  const entries = buildProstheticReport(p, lang).entries;
  const bySafety = (a: DeviationReport, b: DeviationReport): number => Number(!!b.safety) - Number(!!a.safety);
  return {
    retained: entries
      .filter((e) => isRetained(e.state))
      .sort(bySafety)
      .map(toItem),
    toObserve: entries.filter((e) => e.state === 'observe').map(toItem),
    disclaimer: p.disclaimer,
  };
}

// ---------------------------------------------------------------- Évaluations d'un patient

/** Garde de type : `assessment.result.prosthetic` a la forme d'un `ProstheticAssessment` (sinon `null`). */
export function parseProstheticAssessment(result: unknown): ProstheticAssessment | null {
  if (typeof result !== 'object' || result === null) return null;
  const p = (result as { prosthetic?: unknown }).prosthetic;
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Partial<ProstheticAssessment>;
  if (!Array.isArray(o.deviations) || typeof o.prosthesis !== 'object' || o.prosthesis === null) return null;
  if (
    !o.deviations.every(
      (d) => typeof d === 'object' && d !== null && typeof d.id === 'string' && Array.isArray(d.criteria),
    )
  )
    return null;
  return {
    prosthesis: o.prosthesis,
    catalogLevel: o.catalogLevel ?? 'transtibial',
    deviations: o.deviations,
    disclaimer: o.disclaimer ?? PROSTHETIC_CATALOG.disclaimer,
    audience: 'clinician',
    requiresClinicianValidation: true,
  };
}

interface AssessmentLike {
  readonly id: string;
  readonly patientId: string;
  readonly kind: string;
  readonly performedAt: string;
}

/** Évaluations `prosthetic_gait` d'un patient, de la plus récente à la plus ancienne. */
export function prostheticHistory<T extends AssessmentLike>(all: readonly T[], patientId: string): T[] {
  return all
    .filter((a) => a.kind === 'prosthetic_gait' && a.patientId === patientId)
    .sort((a, b) => (a.performedAt < b.performedAt ? 1 : a.performedAt > b.performedAt ? -1 : 0));
}

export interface AssessmentSummary {
  readonly present: number;
  readonly possible: number;
  readonly observe: number;
}

export function summarize(p: ProstheticAssessment): AssessmentSummary {
  const s = { present: 0, possible: 0, observe: 0 };
  for (const d of p.deviations) {
    const st = stateOf(d.status);
    if (st === 'present' || st === 'possible' || st === 'observe') s[st]++;
  }
  return s;
}

// ---------------------------------------------------------------- Profil prothétique

export const PROSTHESIS_LEVELS = [
  'transtibial',
  'transfemoral',
  'knee_disarticulation',
  'hip_disarticulation',
  'syme',
  'chopart',
  'other',
] as const;
export const PROSTHESIS_SIDES = ['left', 'right', 'bilateral'] as const;

export interface ProfileForm {
  level: string;
  side: string;
  etiology?: string;
  amputationDate?: string;
  footType?: string;
  kneeType?: string;
  socket?: string;
  suspension?: string;
  assistiveDevice?: string;
}

export type ProfileValidation =
  { ok: true; profile: Record<string, string> } | { ok: false; errors: readonly ('level' | 'side' | 'date')[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPTIONAL = ['etiology', 'footType', 'kneeType', 'socket', 'suspension', 'assistiveDevice'] as const;

/** Valide et nettoie le formulaire : niveau et côté obligatoires, date ISO valide et non future, champs libres rognés. */
export function validateProfile(
  f: ProfileForm,
  today: string = new Date().toISOString().slice(0, 10),
): ProfileValidation {
  const errors: ('level' | 'side' | 'date')[] = [];
  if (!(PROSTHESIS_LEVELS as readonly string[]).includes(f.level)) errors.push('level');
  if (!(PROSTHESIS_SIDES as readonly string[]).includes(f.side)) errors.push('side');
  const date = (f.amputationDate ?? '').trim();
  if (date) {
    const parsed = ISO_DATE.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    const valid =
      parsed !== null && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date <= today;
    if (!valid) errors.push('date');
  }
  if (errors.length) return { ok: false, errors };
  const profile: Record<string, string> = { level: f.level, side: f.side };
  for (const k of OPTIONAL) {
    const v = (f[k] ?? '').trim();
    if (v) profile[k] = v;
  }
  if (date) profile['amputationDate'] = date;
  return { ok: true, profile };
}
