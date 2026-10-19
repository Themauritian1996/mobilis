// Coach IA « précis » : après chaque répétition (ou toutes les ~6–8 s en maintien / mode guidé), Gemini reçoit
//  - l'image clé du mouvement (point le plus avancé) avec le squelette dessiné et les articulations fautives en rouge ;
//  - les mesures anatomiques de la caméra (angle au sommet, % de l'amplitude visée, pire valeur de chaque contrôle vs sa limite, durée) ;
//  - la liste FERMÉE des corrections valides pour cet exercice et ce plan (rédigées par le clinicien).
// Il répond en JSON (correction choisie + confiance). L'app valide la réponse contre les mesures avant de la dire,
// et prononce la consigne validée (pas un texte libre), ce qui garantit une correction anatomiquement juste.
import { gemini } from './coach.js';
import { settings } from './store.js';
import { CUES, tr, langInfo } from './i18n.js';
import { METRIC_INFO } from './pose.js';

// Corrections jugeables visuellement selon le plan filmé (2D)
const VISUAL = {
  side: ['trunk', 'trunkSway', 'arch', 'heelDown', 'bodyLine', 'kneeStraight', 'hinge', 'elbowPin', 'shrug'],
  front: ['valgus', 'sideLean', 'pelvis', 'shrug', 'symmetry', 'headTilt', 'elbowSide', 'trunkSway'],
  guided: ['trunkSway', 'shrug', 'sideLean', 'arch'],
};

export function allowedFor(ex, plane, mode) {
  const spec = ex.track?.planes?.[plane];
  const measured = (spec?.checks || []).map((c) => c.cue);
  const anyPlane = new Set(Object.values(ex.track?.planes || {}).flatMap((p) => (p.checks || []).map((c) => c.cue)));
  const visual = (VISUAL[plane] || VISUAL.guided).filter((c) => anyPlane.has(c) || plane === 'guided');
  const ids = new Set([...measured, ...visual]);
  if (mode === 'reps') { ids.add('depth'); ids.add('slow'); }
  if (mode === 'hold') ids.add('holdIt');
  const keys = (ex.keys || []).map((k, i) => ({ id: `key${i + 1}`, en: k.en || tr(k) }));
  return { measured: new Set(measured), cues: [...ids].filter((k) => CUES[k]), keys };
}

function sysPrompt(c) {
  return `You are an expert musculoskeletal physiotherapy assistant, supervised by a physiatrist, checking a patient's exercise form from a 2D phone camera.
Exercise: ${c.exercise}. Patient condition: ${c.condition}. Camera plane: ${c.plane === 'side' ? 'SIDE view (sagittal plane): you can judge flexion/extension, trunk lean, depth, heel lift; you CANNOT judge knee valgus or left/right symmetry' : c.plane === 'front' ? 'FRONT view (frontal plane): you can judge knee valgus, side lean, pelvic level, symmetry, shrugging; you CANNOT judge forward trunk lean, depth or lumbar arch' : 'mirror view, fine movement: only judge gross posture'}.
Correct technique (authored by the clinician): ${c.steps.join(' ')}
The image is the key frame of the movement with the app's skeleton overlay (red joints = a measured fault). The image may be mirrored.
Measurements come from validated pose tracking; TRUST THEM over your visual impression for anything they measure. Use the image only for what the measurements cannot capture, and only if it is clearly visible.
Choose AT MOST ONE correction from the allowed list (ids). If the measurements show no fault and nothing is clearly wrong, answer cue "none" with a short encouragement.
Never invent a correction outside the list. Never diagnose. Never contradict the correct technique.
Reply JSON only. "say": max 10 words, in ${langInfo().label}, only used when cue is "none". "seen": max 15 words in English describing what you observed. "confidence": 0-1.`;
}

const SCHEMA = (ids) => ({
  type: 'OBJECT',
  properties: { cue: { type: 'STRING', enum: [...ids, 'none'] }, confidence: { type: 'NUMBER' }, say: { type: 'STRING' }, seen: { type: 'STRING' } },
  required: ['cue', 'confidence', 'say'],
});

async function askJSON(key, sys, parts, ids) {
  const txt = await gemini({ key, sys, parts, maxTokens: 160, temperature: 0.2, schema: SCHEMA(ids), timeout: 6000 });
  return JSON.parse(txt);
}

// Une mesure « clairement normale » contredit la correction proposée
function measuredOk(chk) {
  if (!chk) return false;
  const lim = Math.abs(chk.limit) || 1e-6;
  return chk.kind === 'max' ? chk.value < chk.limit - 0.3 * lim : chk.value > chk.limit + 0.3 * lim;
}

/** Valide la réponse de l'IA contre les mesures. Retourne { cue, keyIdx, text, kind } ou null. */
export function validate(res, allowed, meas, ex) {
  if (!res || typeof res.cue !== 'string') return null;
  const conf = +res.confidence || 0;
  if (res.cue === 'none' && meas?.move && /MISMATCH/.test(meas.move)) return null; // jamais « excellent » si le mouvement ne correspond pas
  if (res.cue === 'none') return { kind: 'ok', text: String(res.say || '').split(/\s+/).slice(0, 12).join(' '), conf };
  const km = /^key(\d+)$/.exec(res.cue);
  if (km) {
    const i = +km[1] - 1;
    if (!ex.keys?.[i] || conf < 0.8) return null;
    return { kind: 'key', keyIdx: i, text: tr(ex.keys[i]), conf };
  }
  if (!allowed.cues.includes(res.cue)) return null;
  if (meas) {
    if (res.cue === 'depth' && meas.romPct >= 90) return null;
    if (res.cue === 'slow' && meas.dur >= (meas.minRepSec || 1) * 1.3) return null;
    const chk = (meas.checks || []).find((c) => c.cue === res.cue);
    if (allowed.measured.has(res.cue) && measuredOk(chk)) return null; // la mesure dit que c'est correct
  }
  if (!allowed.measured.has(res.cue) && conf < 0.7) return null; // correction purement visuelle : il faut être sûr
  return { kind: 'fix', cue: res.cue, text: tr(CUES[res.cue]), conf };
}

function describe(meas, ctx) {
  if (!meas) return 'No pose measurements available.';
  const lines = [];
  if (meas.metric) lines.push(`Main movement: ${METRIC_INFO[meas.metric] || meas.metric}. Peak value this rep: ${meas.peakValue} (target ${meas.targetValue}); range reached: ${meas.romPct}% of the prescribed range.`);
  if (meas.dur != null) lines.push(`Rep duration: ${meas.dur}s (minimum controlled ${meas.minRepSec}s; prescribed tempo ${ctx.tempo}).`);
  if (meas.holdSec != null) lines.push(`Holding ${meas.holdSec}s of ${ctx.target}s; main value ${meas.value} (valid range ${meas.range?.join('–')}).`);
  for (const c of meas.checks || []) lines.push(`Check "${c.cue}": ${METRIC_INFO[c.metric] || c.metric}${c.relative ? ' (change from the start position)' : ''} = ${c.value}, allowed ${c.kind === 'max' ? '≤' : '≥'} ${c.limit} → ${c.kind === 'max' ? (c.value > c.limit ? 'FAULT' : 'ok') : (c.value < c.limit ? 'FAULT' : 'ok')}.`);
  if (meas.faults?.length) lines.push(`Faults flagged by the app this rep: ${meas.faults.join(', ')}.`);
  if (meas.move) lines.push(meas.move);
  return lines.join('\n');
}

/**
 * Coach précis. ctx : { ex, exercise, condition, steps[], plane, mode, target, tempo }
 * onResult({ text, kind, cue, seen }) ; onState('live' | 'error' | 'off')
 */
export function createPreciseCoach(ctx, { onResult, onState }) {
  const key = settings().geminiKey;
  const allowed = allowedFor(ctx.ex, ctx.plane, ctx.mode);
  const ids = [...allowed.cues, ...allowed.keys.map((k) => k.id)];
  const sys = sysPrompt(ctx);
  const list = [
    ...allowed.cues.map((c) => `- ${c}: ${CUES[c].en}${allowed.measured.has(c) ? ' (measured by the app)' : ' (visual only)'}`),
    ...allowed.keys.map((k) => `- ${k.id}: key point "${k.en}" (visual only)`),
  ].join('\n');
  let pending = false, stopped = false, errors = 0, lastSpoken = '', lastAt = 0, okCount = 0;
  onState('live');

  async function review(frameB64, meas, recent = []) {
    if (stopped || pending || !key) return;
    pending = true;
    try {
      const parts = [{ text: `Allowed corrections:\n${list}\n\nMeasurements:\n${describe(meas, ctx)}${recent.length ? `\nPrevious reps: ${recent.map((r) => `#${r.n} range ${r.romPct}%${r.faults?.length ? ' faults ' + r.faults.join('/') : ''}`).join('; ')}` : ''}` }];
      if (frameB64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: frameB64 } });
      const res = await askJSON(key, sys, parts, ids);
      errors = 0;
      const v = validate(res, allowed, meas, ctx.ex);
      if (stopped || !v) { pending = false; return; }
      // Mesure de la caméra prioritaire : l'app a déjà dit la consigne en direct → on ne la répète pas
      if (meas?.faults?.length && (v.kind === 'ok' || meas.faults.includes(v.cue))) { pending = false; return; }
      if (v.kind === 'ok') { okCount++; if (okCount % 3 !== 1 || !v.text) { pending = false; return; } }
      const now = Date.now();
      if (v.text === lastSpoken && now - lastAt < 12000) { pending = false; return; }
      lastSpoken = v.text; lastAt = now;
      onResult({ ...v, seen: res.seen || '' });
    } catch (e) {
      console.warn('ai precise', e);
      if (++errors >= 2) onState('error');
    }
    pending = false;
  }
  return { review, stop() { stopped = true; onState('off'); }, get busy() { return pending; } };
}
