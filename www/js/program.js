// Personnalisation : programme par phase, dose par niveau, progression selon douleur / difficulté / qualité.
import { EXERCISES } from './data/exercises.js';
import { PATHOLOGIES } from './data/pathologies.js';

export const pathologyById = (id) => PATHOLOGIES.find((p) => p.id === id);
const DAY = 86400000;

export function weekNumber(profile, now = Date.now()) {
  return Math.max(1, Math.floor((now - (profile.startDate || now)) / (7 * DAY)) + 1);
}
export function calendarPhase(week) { return week <= 2 ? 1 : week <= 6 ? 2 : 3; }

// Niveau de départ selon l'irritabilité
export const startLevel = (irr) => (irr === 'high' ? 1 : irr === 'med' ? 2 : 3);

const REP_F = [0.6, 0.8, 1, 1.2, 1.4];
const HOLD_F = [0.5, 0.75, 1, 1.25, 1.5];
const ROM_F = [0.6, 0.75, 0.85, 0.95, 1];

export function doseFor(exId, level = 3) {
  const ex = EXERCISES[exId];
  const b = ex.dose; const i = Math.max(1, Math.min(5, level)) - 1;
  const d = { type: b.type, sets: Math.max(1, b.sets - (i === 0 ? 1 : 0)), tempo: b.tempo, holdTop: b.holdTop, romFactor: ROM_F[i] };
  if (b.type === 'hold') { d.hold = Math.round((b.hold * HOLD_F[i]) / 5) * 5 || 5; d.reps = b.reps; }
  else d.reps = Math.max(4, Math.round(b.reps * REP_F[i]));
  d.loadNote = i === 4 ? 'load' : null; // niveau 5 : ajouter une charge / version unipodale
  return d;
}

export function todaysProgram(profile) {
  const path = pathologyById(profile.pathology);
  if (!path) return [];
  const phase = profile.phase || 1;
  const ids = path.phases[phase] || path.phases[1];
  return ids.map((id) => ({ id, level: profile.levels?.[id] ?? startLevel(profile.irritability), dose: doseFor(id, profile.levels?.[id] ?? startLevel(profile.irritability)) }));
}

// Règle de progression après chaque exercice (modèle de surveillance de la douleur)
export function adjustLevel(profile, item, sessions, checkin) {
  const path = pathologyById(profile.pathology);
  const painMax = path?.painMax ?? 4;
  const cur = profile.levels?.[item.id] ?? startLevel(profile.irritability);
  const q = avg(item.sets.map((s) => s.quality).filter((x) => x != null));
  const prev = sessions.slice(-3).flatMap((s) => s.items.filter((i) => i.id === item.id)).slice(-1)[0];
  let next = cur, reason = 'same';
  if (item.pain > painMax || checkin === 'worse') { next = cur - 1; reason = 'pain'; }
  else if (item.difficulty >= 5 || (q != null && q < 0.5)) { next = cur - 1; reason = 'hard'; }
  else if (item.difficulty <= 2 && (q == null || q >= 0.8) && item.pain <= painMax - 1) {
    // deux séances consécutives faciles et bien exécutées → on monte
    if (prev && prev.difficulty <= 2 && prev.pain <= painMax - 1) { next = cur + 1; reason = 'easy'; }
  }
  next = Math.max(1, Math.min(5, next));
  return { level: next, change: Math.sign(next - cur), reason };
}

// Revue hebdomadaire : avance la phase seulement si la douleur est sous contrôle
export function weeklyReview(profile, sessions, now = Date.now()) {
  const week = weekNumber(profile, now);
  const target = calendarPhase(week);
  const path = pathologyById(profile.pathology);
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7.flatMap((s) => s.items.map((i) => i.pain)).filter((x) => x != null);
  const painOk = !pains.length || avg(pains) <= (path?.painMax ?? 4);
  let phase = profile.phase || 1;
  if (target > phase && painOk && last7.length >= 2) phase = phase + 1;
  if (!painOk && phase > 1 && avg(pains) > (path?.painMax ?? 4) + 2) phase = phase - 1;
  return { week, phase };
}

export function weeklyStats(profile, sessions) {
  const out = [];
  if (!profile?.startDate) return out;
  for (const s of sessions) {
    const w = weekNumber(profile, s.date);
    const row = out[w - 1] || (out[w - 1] = { week: w, sessions: 0, pain: [], quality: [], difficulty: [] });
    row.sessions++;
    for (const i of s.items) {
      if (i.pain != null) row.pain.push(i.pain);
      if (i.difficulty != null) row.difficulty.push(i.difficulty);
      for (const st of i.sets) if (st.quality != null) row.quality.push(st.quality);
    }
  }
  const nWeeks = weekNumber(profile);
  const res = [];
  for (let w = 1; w <= nWeeks; w++) {
    const r = out[w - 1] || { week: w, sessions: 0, pain: [], quality: [], difficulty: [] };
    res.push({ week: w, sessions: r.sessions, pain: avg(r.pain), quality: avg(r.quality), difficulty: avg(r.difficulty), planned: profile.perWeek || 3 });
  }
  return res;
}

export function avg(a) { return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
export const todayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
