/**
 * Volet « marche » — logique PURE de l'assistant de capture : réglages, validation du formulaire, vues recommandées,
 * correspondance des vues et des côtés avec le modèle de données (core) et construction du document `assessments`.
 * Aucune interface, caméra ni DOM ici (testé par model.test.ts).
 */
import type {
  AmputationLevel,
  AssistiveDevice,
  GaitAnalysis,
  GaitAssessment,
  GaitMetric,
  GaitPatientInput,
  GaitView,
  ProsthesisInput,
  Side,
} from '../../../domains/gait/index.ts';
import type {
  Assessment,
  AssessmentId,
  FindingResult as CoreFindingResult,
  GaitView as CoreGaitView,
  MetricResult,
  Patient,
  PatientId,
  Side as CoreSide,
} from '../../../core/types/clinical.ts';
import type { IsoDateTime, MeasuredValue } from '../../../core/types/common.ts';
import type { ProstheticAssessment } from '../../../domains/prosthetics/index.ts';

export const ENGINE_VERSION = 'gait-1';

// ---------------------------------------------------------------------------------------------------- Vues
export const VIEW_ORDER: readonly GaitView[] = ['sagittal-left', 'sagittal-right', 'frontal', 'posterior'];

const TO_CORE: Readonly<Record<GaitView, CoreGaitView>> = {
  'sagittal-left': 'lateral_left',
  'sagittal-right': 'lateral_right',
  frontal: 'frontal',
  posterior: 'posterior',
};
export const toCoreView = (v: GaitView): CoreGaitView => TO_CORE[v];
export const fromCoreView = (v: CoreGaitView): GaitView =>
  (Object.keys(TO_CORE) as GaitView[]).find((k) => TO_CORE[k] === v) ?? 'sagittal-left';

export const isSagittalView = (v: GaitView): boolean => v === 'sagittal-left' || v === 'sagittal-right';
/** Côté du patient le plus proche de la caméra (vues latérales), sinon null. */
export const nearSide = (v: GaitView): Side | null =>
  v === 'sagittal-left' ? 'L' : v === 'sagittal-right' ? 'R' : null;

/** Trie une sélection de vues dans l'ordre de capture (latérales, frontale, postérieure) sans doublon. */
export const orderViews = (views: readonly GaitView[]): GaitView[] => VIEW_ORDER.filter((v) => views.includes(v));

/**
 * Vues recommandées : trois vues (une latérale du côté atteint ou prothétique — gauche par défaut —, frontale,
 * postérieure).
 */
export function recommendedViews(s: Pick<CaptureSettings, 'affectedSide' | 'prosthesis'>): GaitView[] {
  const side: Side = s.prosthesis?.side ?? (s.affectedSide === 'R' ? 'R' : 'L');
  return orderViews([side === 'R' ? 'sagittal-right' : 'sagittal-left', 'frontal', 'posterior']);
}

// ---------------------------------------------------------------------------------------------------- Réglages
export type Footwear = 'shoes' | 'barefoot' | 'prosthesis';
export type SpeedCondition = 'comfortable' | 'fast';
export type AffectedSide = Side | 'both' | 'none';

export const ASSISTIVE_DEVICES: readonly AssistiveDevice[] = [
  'none',
  'cane',
  'quad_cane',
  'axillary_crutches',
  'forearm_crutches',
  'walker',
  'rollator',
  'other',
];
export const AMPUTATION_LEVELS: readonly AmputationLevel[] = [
  'transtibial',
  'transfemoral',
  'knee_disarticulation',
  'syme',
  'chopart',
  'partial_foot',
  'hip_disarticulation',
];

export interface CaptureSettings {
  readonly heightCm: number;
  readonly affectedSide: AffectedSide;
  readonly assistiveDevice: AssistiveDevice;
  readonly footwear: Footwear;
  /** Présent seulement en mode prothèse. */
  readonly prosthesis?: ProsthesisInput;
  readonly speed: SpeedCondition;
  /** Consigne ou modification en cours (texte libre). */
  readonly instruction: string;
  /** Cycles visés par côté (défaut 3). */
  readonly targetCycles: number;
  /** Refaire après une modification : ce qui a été modifié depuis la mesure précédente. */
  readonly modificationNote?: string;
}

export const DEFAULT_TARGET_CYCLES = 3;
export const MIN_TARGET_CYCLES = 1;
export const MAX_TARGET_CYCLES = 10;
export const MIN_HEIGHT_CM = 50;
export const MAX_HEIGHT_CM = 260;

/** Valeurs brutes du formulaire (chaînes saisies). */
export interface CaptureFormState {
  heightCm: string;
  affectedSide: AffectedSide;
  assistiveDevice: AssistiveDevice;
  footwear: Footwear;
  prostheticMode: boolean;
  prosthesisLevel: AmputationLevel | '';
  prosthesisSide: Side | '';
  speed: SpeedCondition;
  instruction: string;
  targetCycles: string;
  modificationNote: string;
}

export type FormErrorKey = 'heightCm' | 'prosthesisLevel' | 'prosthesisSide' | 'targetCycles' | 'modificationNote';
export type FormErrors = Partial<Record<FormErrorKey, 'required' | 'range' | 'integer'>>;

const num = (s: string): number => Number(s.trim().replace(',', '.'));

/** Valide le formulaire : la taille (cm) est OBLIGATOIRE ; en mode prothèse, niveau et côté sont requis. */
export function validateForm(
  f: CaptureFormState,
  opts: { requireModificationNote?: boolean } = {},
): { ok: true; settings: CaptureSettings } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const h = f.heightCm.trim() === '' ? NaN : num(f.heightCm);
  if (f.heightCm.trim() === '') errors.heightCm = 'required';
  else if (!(h >= MIN_HEIGHT_CM && h <= MAX_HEIGHT_CM)) errors.heightCm = 'range';
  const cycles = f.targetCycles.trim() === '' ? DEFAULT_TARGET_CYCLES : num(f.targetCycles);
  if (!Number.isInteger(cycles)) errors.targetCycles = 'integer';
  else if (cycles < MIN_TARGET_CYCLES || cycles > MAX_TARGET_CYCLES) errors.targetCycles = 'range';
  if (f.prostheticMode) {
    if (!f.prosthesisLevel) errors.prosthesisLevel = 'required';
    if (!f.prosthesisSide) errors.prosthesisSide = 'required';
  }
  if (opts.requireModificationNote && !f.modificationNote.trim()) errors.modificationNote = 'required';
  if (Object.keys(errors).length) return { ok: false, errors };
  const prosthesis: ProsthesisInput | undefined =
    f.prostheticMode && f.prosthesisLevel && f.prosthesisSide
      ? { level: f.prosthesisLevel, side: f.prosthesisSide }
      : undefined;
  const settings: CaptureSettings = {
    heightCm: Math.round(h * 10) / 10,
    affectedSide: prosthesis ? prosthesis.side : f.affectedSide,
    assistiveDevice: f.assistiveDevice,
    footwear: prosthesis ? 'prosthesis' : f.footwear === 'prosthesis' ? 'shoes' : f.footwear,
    ...(prosthesis ? { prosthesis } : {}),
    speed: f.speed,
    instruction: f.instruction.trim(),
    targetCycles: cycles,
    ...(f.modificationNote.trim() ? { modificationNote: f.modificationNote.trim() } : {}),
  };
  return { ok: true, settings };
}

const sideOfCore = (s: CoreSide | undefined): AffectedSide =>
  s === 'left' ? 'L' : s === 'right' ? 'R' : s === 'bilateral' ? 'both' : 'none';

/** Niveau du profil prothétique du dossier → niveau du moteur (null : « autre », à choisir par le clinicien). */
export function engineLevel(l: string | undefined): AmputationLevel | null {
  if (!l) return null;
  return (AMPUTATION_LEVELS as readonly string[]).includes(l) ? (l as AmputationLevel) : null;
}

/** Valeurs initiales du formulaire : dossier patient (taille, côté atteint, profil prothétique). */
export function defaultsFromPatient(p: Patient | null | undefined): CaptureFormState {
  const prosth = p?.prosthesis;
  const level = engineLevel(prosth?.level);
  const pSide = prosth ? sideOfCore(prosth.side) : 'none';
  return {
    heightCm: p?.heightCm ? String(p.heightCm) : '',
    affectedSide: prosth && (pSide === 'L' || pSide === 'R') ? pSide : sideOfCore(p?.affectedSide),
    assistiveDevice: 'none',
    footwear: prosth ? 'prosthesis' : 'shoes',
    prostheticMode: !!prosth,
    prosthesisLevel: level ?? '',
    prosthesisSide: pSide === 'L' || pSide === 'R' ? pSide : '',
    speed: 'comfortable',
    instruction: '',
    targetCycles: String(DEFAULT_TARGET_CYCLES),
    modificationNote: '',
  };
}

const isOneOf = <T extends string>(list: readonly T[], v: string | undefined): v is T =>
  v !== undefined && (list as readonly string[]).includes(v);

/** « Refaire » : mêmes réglages que l'évaluation précédente (conditions enregistrées). */
export function formFromAssessment(a: Pick<Assessment, 'conditions'>, fallback: CaptureFormState): CaptureFormState {
  const c = a.conditions ?? {};
  const level = c['prosthesisLevel'];
  const pSide = c['prosthesisSide'];
  const prostheticMode = isOneOf(AMPUTATION_LEVELS, level);
  const affected = c['affectedSide'];
  const device = c['assistiveDevice'];
  const foot = c['footwear'];
  return {
    ...fallback,
    heightCm: c['heightCm'] ?? fallback.heightCm,
    affectedSide: isOneOf(['L', 'R', 'both', 'none'] as const, affected) ? affected : fallback.affectedSide,
    assistiveDevice: isOneOf(ASSISTIVE_DEVICES, device) ? device : fallback.assistiveDevice,
    footwear: isOneOf(['shoes', 'barefoot', 'prosthesis'] as const, foot) ? foot : fallback.footwear,
    prostheticMode,
    prosthesisLevel: prostheticMode ? (level as AmputationLevel) : '',
    prosthesisSide: prostheticMode && (pSide === 'L' || pSide === 'R') ? pSide : fallback.prosthesisSide,
    speed: c['speed'] === 'fast' ? 'fast' : 'comfortable',
    instruction: c['instruction'] ?? '',
    targetCycles: c['targetCycles'] ?? fallback.targetCycles,
    modificationNote: '',
  };
}

/** Entrée du moteur : taille, âge et sexe du dossier + réglages de la capture. */
export function patientInput(s: CaptureSettings, p: Patient | null | undefined, nowYear: number): GaitPatientInput {
  const age = p?.birthYear && p.birthYear > 1900 && p.birthYear <= nowYear ? nowYear - p.birthYear : undefined;
  const sex = p?.sex === 'male' ? 'M' : p?.sex === 'female' ? 'F' : undefined;
  return {
    heightCm: s.heightCm,
    ...(p?.weightKg ? { weightKg: p.weightKg } : {}),
    ...(age !== undefined ? { ageYears: age } : {}),
    ...(sex ? { sex } : {}),
    affectedSide: s.affectedSide,
    assistiveDevice: s.assistiveDevice,
    ...(s.prosthesis ? { prosthesis: s.prosthesis } : {}),
    speedCondition: s.speed,
  };
}

/** Conditions de capture enregistrées dans l'évaluation (contrat du brief : toutes en texte). */
export function conditionsOf(
  s: CaptureSettings,
  extra: { fps?: Partial<Record<GaitView, number>>; baselineId?: string } = {},
): Record<string, string> {
  const c: Record<string, string> = {
    heightCm: String(s.heightCm),
    affectedSide: s.affectedSide,
    assistiveDevice: s.assistiveDevice,
    footwear: s.footwear,
    speed: s.speed,
    targetCycles: String(s.targetCycles),
  };
  if (s.instruction) c['instruction'] = s.instruction;
  if (s.modificationNote) c['modification'] = s.modificationNote;
  if (s.prosthesis) {
    c['prosthesisLevel'] = s.prosthesis.level;
    c['prosthesisSide'] = s.prosthesis.side;
  }
  if (extra.baselineId) c['baselineAssessmentId'] = extra.baselineId;
  for (const [v, f] of Object.entries(extra.fps ?? {})) if (f) c[`fps:${v}`] = String(Math.round(f));
  return c;
}

// ---------------------------------------------------------------------------------------------------- Document `assessments`
/** Arrondit les nombres (4 décimales) et allège le résultat : l'échelle trame par trame n'est pas conservée. */
export function compactResult<T>(x: T): T {
  const round = (v: unknown, key?: string): unknown => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null;
    if (Array.isArray(v)) return key === 'series' ? [] : v.map((e) => round(e));
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, e]) => [k, round(e, k)]));
    return v;
  };
  return round(x) as T;
}

const coreSide = (s: Side | undefined): CoreSide | undefined => (s ? (s === 'L' ? 'left' : 'right') : undefined);

function metricResults(analyses: readonly GaitAnalysis[]): MetricResult[] {
  const out: MetricResult[] = [];
  for (const a of analyses)
    for (const m of a.metrics as readonly GaitMetric[]) {
      if (m.value === null || !Number.isFinite(m.value)) continue;
      const side = coreSide(m.side);
      out.push({
        metricId: m.id,
        value: Math.round(m.value * 10000) / 10000,
        unit: m.unit,
        confidence: Math.round(m.confidence * 100) / 100,
        ...(side ? { side } : {}),
        view: toCoreView(m.view),
        ...(m.norm && m.norm.z !== null ? { deviation: Math.round(m.norm.z * 100) / 100 } : {}),
        ...(m.norm ? { normId: m.norm.normId } : {}),
        ...(m.warning ? { warning: m.warning } : {}),
      });
    }
  return out;
}

const sideWord = (s: Side): string => (s === 'L' ? 'gauche' : 'droit');
const kept = (status: string): boolean => status === 'probable' || status === 'possible';

function findingResults(assessment: GaitAssessment, prosthetic?: ProstheticAssessment): CoreFindingResult[] {
  const out: CoreFindingResult[] = [];
  for (const f of assessment.findings)
    if (kept(f.status))
      out.push({
        findingId: f.id,
        confidence: Math.round(f.score * 100) / 100,
        because: [`Côté ${sideWord(f.side)} (${f.status})`, ...f.why.map((w) => w.text)],
      });
  for (const d of prosthetic?.deviations ?? [])
    if (kept(d.status))
      out.push({
        findingId: d.id,
        confidence: Math.round(d.score * 100) / 100,
        because: [`Côté ${sideWord(d.side)} (${d.status})`, ...d.why.map((w) => w.text)],
      });
  return out;
}

export interface BuildAssessmentArgs {
  readonly id: string;
  readonly patientId: string;
  readonly ownerUid: string;
  readonly nowIso: string;
  readonly settings: CaptureSettings;
  readonly views: readonly GaitView[];
  readonly assessment: GaitAssessment;
  readonly prosthetic?: ProstheticAssessment;
  readonly customMeasures?: Readonly<Record<string, MeasuredValue>>;
  readonly fps?: Partial<Record<GaitView, number>>;
  readonly baselineId?: string;
  readonly durationsS?: Partial<Record<GaitView, number>>;
}

/** Construit le document `assessments` (contrat du brief) à partir de l'évaluation du moteur. */
export function buildAssessmentDoc(a: BuildAssessmentArgs): Assessment {
  const result = compactResult({
    ...a.assessment,
    ...(a.prosthetic ? { prosthetic: a.prosthetic } : {}),
    capture: {
      views: a.views,
      fps: a.fps ?? {},
      durationsS: a.durationsS ?? {},
      targetCycles: a.settings.targetCycles,
    },
  });
  const custom = a.customMeasures && Object.keys(a.customMeasures).length ? { customMeasures: a.customMeasures } : {};
  return {
    schemaVersion: 1,
    id: a.id as AssessmentId,
    patientId: a.patientId as PatientId,
    kind: a.prosthetic ? 'prosthetic_gait' : 'gait',
    performedAt: a.nowIso as IsoDateTime,
    createdAt: a.nowIso as IsoDateTime,
    updatedAt: a.nowIso as IsoDateTime,
    ownerUid: a.ownerUid,
    views: a.views.map(toCoreView),
    conditions: conditionsOf(a.settings, {
      ...(a.fps ? { fps: a.fps } : {}),
      ...(a.baselineId ? { baselineId: a.baselineId } : {}),
    }),
    metrics: metricResults(a.assessment.analyses),
    findings: findingResults(a.assessment, a.prosthetic),
    videoRetained: false,
    engineVersion: ENGINE_VERSION,
    result,
    ...custom,
  };
}

/** Résultat stocké (GaitAssessment + prothèse éventuelle + capture) tel que relu depuis `assessments.result`. */
export interface StoredResult extends GaitAssessment {
  readonly prosthetic?: ProstheticAssessment;
  readonly capture?: {
    readonly views: readonly GaitView[];
    readonly fps: Partial<Record<GaitView, number>>;
    readonly durationsS: Partial<Record<GaitView, number>>;
    readonly targetCycles: number;
  };
}

/** Lecture défensive de `assessment.result` : null si le document n'est pas une évaluation de marche du moteur. */
export function readStoredResult(a: Pick<Assessment, 'result' | 'kind'>): StoredResult | null {
  if (a.kind !== 'gait' && a.kind !== 'prosthetic_gait') return null;
  const r = a.result as Partial<StoredResult> | undefined;
  if (!r || !Array.isArray(r.analyses) || !Array.isArray(r.determinants) || !Array.isArray(r.findings)) return null;
  return r as StoredResult;
}
