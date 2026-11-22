/**
 * Séance d'un exercice : logique pure (aucun accès au DOM). Reprise de www/js/train.js (v1.15) : bilan de série,
 * séries valides, enregistrement d'un exercice, ajustement du niveau et exercice suivant.
 * Le programme (dose, niveau) et le commentaire local du coach restent dans leurs modules legacy (tranche T1) :
 * chemin legacy en attendant.
 */
import { t } from '../../../www/js/i18n.js';
import * as P from '../../../www/js/program.js';
import { localComment } from '../../../www/js/coach.js';

/** Dose d'un exercice (séries × répétitions, ou maintien). */
export interface DoseLike {
  readonly type?: string;
  readonly sets: number;
  readonly reps: number;
  readonly hold: number;
  readonly holdTop?: number;
  readonly tempo?: string;
  readonly rest?: number;
  readonly romFactor?: number;
}

/** Dose telle que la lit `doseText` (le programme en fournit des variantes). */
export interface DoseArg {
  readonly type?: string | undefined;
  readonly sets: number;
  readonly reps?: number | undefined;
  readonly hold?: number | undefined;
  readonly holdTop?: number | undefined;
}

/** Texte de dose : « 3 × 10 · maintien 2 s » ou « 2 × 30 s ». */
export function doseText(d: DoseArg): string {
  if (d.type === 'hold')
    return `${d.sets > 1 ? d.sets + ' × ' : ''}${(d.reps ?? 0) > 1 ? d.reps + ' × ' : ''}${d.hold} ${t('sec')}`;
  return `${d.sets} × ${d.reps}${d.holdTop ? ` · ${t('hold')} ${d.holdTop} ${t('sec')}` : ''}`;
}

/** Détail d'une répétition (journal du suivi). */
export interface RepDetail {
  n: number;
  dur: number;
  faults: string[];
  meas?: { romPct: number } | null;
}

/** Bilan d'une série, tel que rendu par le suivi ou construit pour le mode guidé / la saisie manuelle. */
export interface SetSummary {
  mode: string;
  reps: number;
  full: number;
  partial: number;
  holdSec: number;
  quality: number | null;
  faults: Record<string, number>;
  plane?: string;
  manual?: boolean;
  reps_detail?: RepDetail[];
}

/** Série enregistrée dans la séance. */
export interface SetRecord {
  side: string | null;
  plane: string;
  mode: string;
  reps: number;
  full: number;
  partial: number;
  holdSec: number;
  quality: number | null;
  faults: Record<string, number>;
  empty?: boolean;
  manual?: boolean;
  moveOk?: number | null;
}

/** Séries réellement faites (une série à 0 répétition / 0 s ne compte pas, sauf saisie manuelle). */
export const validSets = (sets: readonly SetRecord[]): SetRecord[] =>
  sets.filter((x) => !x.empty && (x.manual || (x.mode === 'hold' ? x.holdSec > 0 : x.reps > 0)));

/** Série sans aucune répétition / seconde détectée ? */
export const isEmptySet = (sum: Pick<SetSummary, 'mode' | 'holdSec' | 'reps'>): boolean =>
  sum.mode === 'hold' ? !sum.holdSec : !sum.reps;

/** Bilan d'une série en mode guidé (minuteur) : `el` secondes écoulées, `reps` répétitions comptées. */
export function guidedSummary(dose: DoseLike, el: number, reps: number): SetSummary {
  return dose.type === 'hold'
    ? { mode: 'hold', holdSec: el, reps: 0, full: 0, partial: 0, quality: null, faults: {} }
    : { mode: 'reps', reps, full: reps, partial: 0, holdSec: 0, quality: null, faults: {} };
}

/** Bilan d'une série saisie à la main. */
export function manualSummary(hold: boolean, n: number): SetSummary {
  return hold
    ? { mode: 'hold', holdSec: n, reps: 0, full: 0, partial: 0, quality: null, faults: {} }
    : { mode: 'reps', reps: n, full: n, partial: 0, holdSec: 0, quality: null, faults: {} };
}

/** Pas et plafond du pas-à-pas de la saisie manuelle. */
export const manualBounds = (hold: boolean, holdTarget: number): { max: number; step: number } => ({
  max: hold ? 600 : 99,
  step: hold && holdTarget >= 20 ? 5 : 1,
});

/** Part (%) du temps où le mouvement correspondait à la démonstration ; null s'il n'est pas mesurable. */
export function moveMatchPct(
  mm: { usable?: boolean; totalTime: number; wrongShare: number } | null | undefined,
  manual: boolean | undefined,
): number | null {
  return !manual && mm?.usable && mm.totalTime > 3 ? Math.round((1 - mm.wrongShare) * 100) : null;
}

/** Mouvement non conforme (< 70 %) : la série compte une faute « wrongMove » et la qualité est plafonnée à 0,4. */
export function applyMoveMismatch(sum: SetSummary, moveOk: number | null): SetSummary {
  if (moveOk !== null && moveOk < 70) {
    sum.faults = { ...(sum.faults || {}), wrongMove: Math.max(1, sum.faults?.['wrongMove'] || 0) };
    if (sum.quality !== null) sum.quality = Math.min(sum.quality, 0.4);
  }
  return sum;
}

/** Fautes triées par fréquence décroissante. */
export const sortedFaults = (sum: Pick<SetSummary, 'faults'>): [string, number][] =>
  Object.entries(sum.faults || {}).sort((a, b) => b[1] - a[1]);

export interface SetDataInput {
  exercise: string;
  condition: string;
  sum: SetSummary;
  level: number;
  dose: DoseLike;
  holdTarget: number;
  painMax: number;
  set: number;
  totalSets: number;
  moveOk: number | null;
  aiNotes?: readonly string[] | null;
}
/** Données de la série envoyées au coach (local ou IA). */
export function setSummaryData(i: SetDataInput): Record<string, unknown> {
  const { sum } = i;
  const faults = sortedFaults(sum);
  const reps = (sum.reps_detail || []).slice(-12);
  return {
    kind: 'set',
    exercise: i.exercise,
    condition: i.condition,
    plane: sum.plane,
    level: i.level,
    target: i.dose.type === 'hold' ? `${i.holdTarget}s` : i.dose.reps,
    mode: sum.mode,
    reps: sum.reps,
    full: sum.full,
    partial: sum.partial,
    holdSec: sum.holdSec,
    quality: sum.quality,
    faults: Object.fromEntries(faults.map(([k, v]) => [k, Math.round(v)])),
    painLimit: i.painMax,
    set: i.set + 1,
    totalSets: i.totalSets,
    movementMatchesDemoPct: i.moveOk,
    perRep: reps.map((r) => ({ n: r.n, rangePct: r.meas?.romPct, sec: r.dur, faults: r.faults })),
    liveCoachRemarks: (i.aiNotes || []).slice(-4),
    ...(sum.plane === 'guided' || sum.manual ? { techniqueNotAnalysed: true } : {}),
  };
}

/** Commentaire local du bilan de série. Pas de « belle exécution » quand la technique n'a pas été analysée
 *  (mode guidé, saisie manuelle) ou qu'aucune répétition n'était complète. */
export function localSetComment(sum: SetSummary, moveOk: number | null, data: Record<string, unknown>): string {
  const faults = sortedFaults(sum);
  const noTech = sum.plane === 'guided' || !!sum.manual;
  const noFull = sum.mode !== 'hold' && sum.reps > 0 && !sum.full;
  return moveOk !== null && moveOk < 70
    ? `${t('mv_wrongSet')} ${t('mv_seeDemo')}`
    : noTech
      ? sum.mode === 'hold'
        ? t('lcGuidedHold', { n: sum.holdSec })
        : t('lcGuidedReps')
      : noFull && !faults.length
        ? `${t('lcReps', { full: 0, reps: sum.reps })} ${t('lcNoFull')}`
        : localComment(data);
}

/** Exercice déjà enregistré dans la séance (champs lus). */
export interface ItemLike {
  id: string;
  partial?: boolean | undefined;
  redo?: unknown;
}

/** Exercice enregistré dans la séance du jour. */
export interface SessionItem {
  id: string;
  level: number;
  sets: SetRecord[];
  ts: number;
  partial?: boolean;
  pain?: number;
  difficulty?: number;
  note?: string;
  change?: number;
  reason?: string | undefined;
  redo?: number;
  [key: string]: unknown;
}

/** Exercice terminé en cours de route (retour système, changement d'écran) : on garde les séries faites.
 *  null si un exercice complet existe déjà aujourd'hui (il n'est pas écrasé) ou si aucune série n'est valide. */
export function partialItem(
  id: string,
  level: number,
  sets: readonly SetRecord[],
  existing: readonly ItemLike[],
  now: number = Date.now(),
): SessionItem | null {
  const valid = validSets(sets);
  if (!valid.length) return null;
  const prev = existing.find((i) => i.id === id);
  if (prev && !prev.partial) return null;
  return { id, level, sets: valid, partial: true, ts: now };
}

export interface LevelAdjustment {
  level: number;
  change: number;
  reason?: string | undefined;
}
export interface FeedbackInput {
  id: string;
  level: number;
  sets: SetRecord[];
  pain: number;
  difficulty: number;
  note: string;
  now?: number;
}
/** Exercice terminé avec le ressenti du patient : ajoute l'ajustement de niveau (programme) et le compteur de reprises du jour. */
export function finishItem(
  f: FeedbackInput,
  profile: unknown,
  all: readonly unknown[],
  checkin: string | undefined,
  existing: readonly ItemLike[],
): { item: SessionItem; adj: LevelAdjustment } {
  const noteTxt = (f.note || '').trim();
  const item: SessionItem = {
    id: f.id,
    level: f.level,
    sets: f.sets,
    pain: f.pain,
    difficulty: f.difficulty,
    ts: f.now ?? Date.now(),
  };
  if (noteTxt) item.note = noteTxt;
  const adj = (P.adjustLevel as (p: unknown, it: unknown, s: unknown, c: unknown) => LevelAdjustment)(
    profile,
    item,
    all,
    checkin,
  );
  item.change = adj.change;
  item.reason = adj.reason;
  const prev = existing.find((i) => i.id === f.id);
  if (prev && !prev.partial) item.redo = ((prev.redo as number | undefined) || 0) + 1; // exercice refait le même jour : on garde le dernier essai
  return { item, adj };
}

/** Message affiché après l'ajustement du niveau. */
export function levelToastText(adj: LevelAdjustment): string {
  return adj.reason === 'flare'
    ? t('flareKeep')
    : adj.change > 0
      ? `${t('lvlUp')} ${adj.level}`
      : adj.change < 0
        ? `${t('lvlDown')} ${adj.level}`
        : `${t('lvlSame')} ${adj.level}`;
}

/** Exercice suivant après l'enregistrement : la file « refaire » prime sur le programme du jour.
 *  Rend l'exercice suivant (ou null) et la file restante (null quand elle est épuisée). */
export function nextAfterSave<N extends { id: string }>(
  id: string,
  programNext: N | null,
  redoQueue: readonly string[] | null | undefined,
): { next: N | { id: string } | null; redoQueue: readonly string[] | null | undefined } {
  if (redoQueue?.length) {
    const n = redoQueue[redoQueue.indexOf(id) + 1];
    return n ? { next: { id: n }, redoQueue } : { next: null, redoQueue: null };
  }
  return { next: programNext, redoQueue };
}
