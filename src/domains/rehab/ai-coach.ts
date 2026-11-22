// Coach IA « précis » : après chaque répétition (ou toutes les ~6–8 s en maintien / mode guidé), l'IA reçoit
//  - l'image clé du mouvement (point le plus avancé) avec le squelette dessiné et les articulations fautives en rouge ;
//  - les mesures anatomiques de la caméra (angle au sommet, % de l'amplitude visée, pire valeur de chaque contrôle vs sa limite, durée) ;
//  - la liste FERMÉE des corrections valides pour cet exercice et ce plan (rédigées par le clinicien).
// Elle répond en JSON (correction choisie + confiance). L'app valide la réponse contre les mesures avant de la dire,
// et prononce la consigne validée (pas un texte libre), ce qui garantit une correction anatomiquement juste.
// L'appel à l'IA est injecté (voir src/ui/compat/ai-coach.ts) : le domaine ne connaît ni Gemini ni la clé.
import { CUES, aiLangInfo, tr, type Localized } from '../../core/i18n/engine.ts';
import { fineKind, planeText, type ViewedExercise } from '../../vision/exercise-view.ts';

export { fineKind, planeText };

// Corrections jugeables visuellement selon le plan filmé (2D)
const VISUAL: Readonly<Record<string, readonly string[]>> = {
  side: ['trunk', 'trunkSway', 'arch', 'heelDown', 'bodyLine', 'kneeStraight', 'hinge', 'elbowPin', 'shrug'],
  front: ['valgus', 'sideLean', 'pelvis', 'shrug', 'symmetry', 'headTilt', 'elbowSide', 'trunkSway'],
  guided: ['trunkSway', 'shrug', 'sideLean', 'arch'],
  // mouvements fins : seules des corrections de la main / du pied ont un sens (jamais « redresse le tronc » pour un poignet)
  hand: ['forearmStill', 'handInView'],
  foot: ['legStill', 'footInView'],
};

/** Exercice tel que le lit le coach (champs utilisés seulement). */
export interface CoachExercise extends ViewedExercise {
  track?: { planes?: Record<string, { checks?: { cue: string }[] } | undefined> | undefined } | null | undefined;
  keys?: Localized<string>[] | undefined;
}

export interface AllowedCorrections {
  measured: Set<string>;
  cues: string[];
  keys: { id: string; en: string }[];
}

export function allowedFor(ex: CoachExercise, plane: string, mode: string): AllowedCorrections {
  const spec = ex.track?.planes?.[plane];
  const measured = (spec?.checks || []).map((c) => c.cue);
  const anyPlane = new Set(
    Object.values(ex.track?.planes || {}).flatMap((p) => ((p && p.checks) || []).map((c) => c.cue)),
  );
  const fine = fineKind(ex);
  const visual = fine
    ? (VISUAL[fine] as readonly string[])
    : ((VISUAL[plane] || VISUAL['guided']) as readonly string[]).filter((c) => anyPlane.has(c) || plane === 'guided');
  const ids = new Set([...measured, ...visual]);
  if (mode === 'reps') {
    ids.add('depth');
    ids.add('slow');
  }
  if (mode === 'hold') ids.add('holdIt');
  const keys = (ex.keys || []).map((k, i) => ({ id: `key${i + 1}`, en: k.en || tr(k) }));
  return { measured: new Set(measured), cues: [...ids].filter((k) => CUES[k]), keys };
}

/** Contexte d'un exercice filmé. */
export interface PreciseContext {
  ex: CoachExercise;
  exercise: string;
  condition: string;
  steps: string[];
  plane: string;
  mode: string;
  target?: number | string | undefined;
  tempo?: string | undefined;
}

function sysPrompt(c: PreciseContext): string {
  return `You are an expert musculoskeletal physiotherapy assistant, supervised by a physiatrist, checking a patient's exercise form from a 2D phone camera.
Exercise: ${c.exercise}. Patient condition: ${c.condition}. Camera: ${planeText(c)}.
Correct technique (authored by the clinician): ${c.steps.join(' ')}
The image is the key frame of the movement with the app's skeleton overlay (red joints = a measured fault; for hand exercises, the 21-point hand skeleton). The image may be mirrored.
${c.ex && fineKind(c.ex) ? `If the ${fineKind(c.ex)} is not clearly visible in the image, answer cue "${fineKind(c.ex)}InView" with confidence 1.` : ''}
Measurements come from validated pose tracking; TRUST THEM over your visual impression for anything they measure. Use the image only for what the measurements cannot capture, and only if it is clearly visible.
Choose AT MOST ONE correction from the allowed list (ids). If the measurements show no fault and nothing is clearly wrong, answer cue "none" with a short encouragement.
Never invent a correction outside the list. Never diagnose. Never contradict the correct technique.
Reply JSON only. "say": max 10 words, in ${aiLangInfo().label} (informal register), only used when cue is "none". "seen": max 15 words in English describing what you observed. "confidence": 0-1.`;
}

/** Schéma de réponse JSON demandé à l'IA. */
export const replySchema = (ids: readonly string[]): object => ({
  type: 'OBJECT',
  properties: {
    cue: { type: 'STRING', enum: [...ids, 'none'] },
    confidence: { type: 'NUMBER' },
    say: { type: 'STRING' },
    seen: { type: 'STRING' },
  },
  required: ['cue', 'confidence', 'say'],
});

/** Contrôle mesuré par la caméra (une limite, une valeur). */
export interface MeasuredCheck {
  cue: string;
  metric: string;
  kind: 'max' | 'min';
  value: number;
  limit: number;
  relative?: boolean;
}

/** Mesures de la répétition (ou du maintien) courante. */
export interface PreciseMeasures {
  metric?: string;
  peakValue?: number;
  targetValue?: number;
  romPct?: number;
  dur?: number | null;
  minRepSec?: number;
  holdSec?: number | null;
  value?: number;
  range?: number[];
  checks?: MeasuredCheck[];
  faults?: string[];
  move?: string;
}

/** Réponse JSON de l'IA. */
export interface AiReply {
  cue?: unknown;
  confidence?: unknown;
  say?: unknown;
  seen?: string;
}

/** Réponse validée : ce que l'app dit au patient. */
export interface ValidatedReply {
  kind: 'ok' | 'key' | 'fix';
  text: string;
  conf: number;
  cue?: string;
  keyIdx?: number;
}

// Une mesure « clairement normale » contredit la correction proposée
function measuredOk(chk: MeasuredCheck | undefined): boolean {
  if (!chk) return false;
  const lim = Math.abs(chk.limit) || 1e-6;
  return chk.kind === 'max' ? chk.value < chk.limit - 0.3 * lim : chk.value > chk.limit + 0.3 * lim;
}

/** Valide la réponse de l'IA contre les mesures. Retourne { cue, keyIdx, text, kind } ou null. */
export function validate(
  res: AiReply | null | undefined,
  allowed: AllowedCorrections,
  meas: PreciseMeasures | null | undefined,
  ex: CoachExercise,
): ValidatedReply | null {
  if (!res || typeof res.cue !== 'string') return null;
  const conf = +(res.confidence as number) || 0;
  if (res.cue === 'none' && meas?.move && /MISMATCH/.test(meas.move)) return null; // jamais « excellent » si le mouvement ne correspond pas
  if (res.cue === 'none')
    return {
      kind: 'ok',
      text: String(res.say || '')
        .split(/\s+/)
        .slice(0, 12)
        .join(' '),
      conf,
    };
  const km = /^key(\d+)$/.exec(res.cue);
  if (km) {
    const i = +(km[1] as string) - 1;
    const key = ex.keys?.[i];
    if (!key || conf < 0.8) return null;
    return { kind: 'key', keyIdx: i, text: tr(key), conf };
  }
  if (!allowed.cues.includes(res.cue)) return null;
  if (meas) {
    if (res.cue === 'depth' && (meas.romPct as number) >= 90) return null;
    if (res.cue === 'slow' && (meas.dur as number) >= (meas.minRepSec || 1) * 1.3) return null;
    const chk = (meas.checks || []).find((c) => c.cue === res.cue);
    if (allowed.measured.has(res.cue) && measuredOk(chk)) return null; // la mesure dit que c'est correct
  }
  if (!allowed.measured.has(res.cue) && conf < 0.7) return null; // correction purement visuelle : il faut être sûr
  return { kind: 'fix', cue: res.cue, text: tr(CUES[res.cue]), conf };
}

function describe(
  meas: PreciseMeasures | null | undefined,
  ctx: PreciseContext,
  metricInfo: Readonly<Record<string, string>>,
): string {
  if (!meas) return 'No pose measurements available.';
  const info = (m: string): string => metricInfo[m] || m;
  const lines: string[] = [];
  if (meas.metric)
    lines.push(
      `Main movement: ${info(meas.metric)}. Peak value this rep: ${meas.peakValue} (target ${meas.targetValue}); range reached: ${meas.romPct}% of the prescribed range.`,
    );
  if (meas.dur !== undefined && meas.dur !== null)
    lines.push(`Rep duration: ${meas.dur}s (minimum controlled ${meas.minRepSec}s; prescribed tempo ${ctx.tempo}).`);
  if (meas.holdSec !== undefined && meas.holdSec !== null)
    lines.push(
      `Holding ${meas.holdSec}s of ${ctx.target}s; main value ${meas.value} (valid range ${meas.range?.join('–')}).`,
    );
  for (const c of meas.checks || [])
    lines.push(
      `Check "${c.cue}": ${info(c.metric)}${c.relative ? ' (change from the start position)' : ''} = ${c.value}, allowed ${c.kind === 'max' ? '≤' : '≥'} ${c.limit} → ${c.kind === 'max' ? (c.value > c.limit ? 'FAULT' : 'ok') : c.value < c.limit ? 'FAULT' : 'ok'}.`,
    );
  if (meas.faults?.length) lines.push(`Faults flagged by the app this rep: ${meas.faults.join(', ')}.`);
  if (meas.move) lines.push(meas.move);
  return lines.join('\n');
}

/** Ce que le domaine attend du monde extérieur. */
export interface PreciseDeps {
  /** Clé personnelle de l'utilisateur : sans clé, le coach précis ne fait rien. */
  key: string;
  /** Interroge l'IA (image comprise si le patient y a consenti) : réponse JSON analysée. */
  askJSON(
    key: string,
    sys: string,
    parts: readonly Record<string, unknown>[],
    ids: readonly string[],
  ): Promise<unknown>;
  /** Sens anatomique de chaque mesure (METRIC_INFO de la vision). */
  metricInfo: Readonly<Record<string, string>>;
}

export interface PreciseResult extends ValidatedReply {
  seen: string;
}

export interface PreciseHandlers {
  onResult(r: PreciseResult): void;
  onState(s: 'live' | 'error' | 'off'): void;
}

export interface RecentRep {
  n: number;
  romPct: number;
  faults?: string[];
}

export interface PreciseCoach {
  review(
    frameB64: string | null | undefined,
    meas: PreciseMeasures | null | undefined,
    recent?: RecentRep[],
  ): Promise<void>;
  stop(): void;
  readonly busy: boolean;
}

/**
 * Coach précis. ctx : { ex, exercise, condition, steps[], plane, mode, target, tempo }
 * onResult({ text, kind, cue, seen }) ; onState('live' | 'error' | 'off')
 */
export function createPreciseCoach(
  ctx: PreciseContext,
  { onResult, onState }: PreciseHandlers,
  deps: PreciseDeps,
): PreciseCoach {
  const key = deps.key;
  const allowed = allowedFor(ctx.ex, ctx.plane, ctx.mode);
  const ids = [...allowed.cues, ...allowed.keys.map((k) => k.id)];
  const sys = sysPrompt(ctx);
  const list = [
    ...allowed.cues.map(
      (c) => `- ${c}: ${CUES[c]?.en}${allowed.measured.has(c) ? ' (measured by the app)' : ' (visual only)'}`,
    ),
    ...allowed.keys.map((k) => `- ${k.id}: key point "${k.en}" (visual only)`),
  ].join('\n');
  let pending = false,
    stopped = false,
    errors = 0,
    lastSpoken = '',
    lastAt = 0,
    okCount = 0;
  onState('live');

  async function review(
    frameB64: string | null | undefined,
    meas: PreciseMeasures | null | undefined,
    recent: RecentRep[] = [],
  ): Promise<void> {
    if (stopped || pending || !key) return;
    pending = true;
    try {
      const parts: Record<string, unknown>[] = [
        {
          text: `Allowed corrections:\n${list}\n\nMeasurements:\n${describe(meas, ctx, deps.metricInfo)}${recent.length ? `\nPrevious reps: ${recent.map((r) => `#${r.n} range ${r.romPct}%${r.faults?.length ? ' faults ' + r.faults.join('/') : ''}`).join('; ')}` : ''}`,
        },
      ];
      if (frameB64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: frameB64 } });
      const res = (await deps.askJSON(key, sys, parts, ids)) as AiReply;
      errors = 0;
      const v = validate(res, allowed, meas, ctx.ex);
      if (stopped || !v) {
        pending = false;
        return;
      }
      // Mesure de la caméra prioritaire : l'app a déjà dit la consigne en direct → on ne la répète pas
      if (meas?.faults?.length && (v.kind === 'ok' || meas.faults.includes(v.cue as string))) {
        pending = false;
        return;
      }
      if (v.kind === 'ok') {
        okCount++;
        if (okCount % 3 !== 1 || !v.text) {
          pending = false;
          return;
        }
      }
      const now = Date.now();
      if (v.text === lastSpoken && now - lastAt < 12000) {
        pending = false;
        return;
      }
      lastSpoken = v.text;
      lastAt = now;
      onResult({ ...v, seen: res.seen || '' });
    } catch (e) {
      console.warn('ai precise', e);
      if (++errors >= 2) onState('error');
    }
    pending = false;
  }
  return {
    review,
    stop() {
      stopped = true;
      onState('off');
    },
    get busy() {
      return pending;
    },
  };
}
