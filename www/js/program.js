// Personnalisation : programme par phase, dose par niveau, progression selon douleur / difficulté / qualité,
// plan imposé par le clinicien, journée difficile (poussée de douleur).
import { EXERCISES } from './data/exercises.js';
import { PATHOLOGIES } from './data/pathologies.js';

export const pathologyById = (id) => PATHOLOGIES.find((p) => p.id === id);
const DAY = 86400000;

export function weekNumber(profile, now = Date.now()) {
  return Math.max(1, Math.floor((now - (profile.startDate || now)) / (7 * DAY)) + 1);
}
export function calendarPhase(week) { return week <= 2 ? 1 : week <= 6 ? 2 : 3; }
export const startLevel = (irr) => (irr === 'high' ? 1 : irr === 'med' ? 2 : 3);
export const inFlare = (profile, now = Date.now()) => !!(profile.flareUntil && profile.flareUntil > now);

const REP_F = [0.6, 0.8, 1, 1.2, 1.4];
const HOLD_F = [0.5, 0.75, 1, 1.25, 1.5];
const ROM_F = [0.6, 0.75, 0.85, 0.95, 1];

export function doseFor(exId, level = 3, flare = false) {
  const ex = EXERCISES[exId];
  const b = ex.dose; const i = Math.max(1, Math.min(5, level)) - 1;
  const d = { type: b.type, sets: Math.max(1, b.sets - (i === 0 ? 1 : 0)), tempo: b.tempo, holdTop: b.holdTop, romFactor: ROM_F[i] };
  if (b.type === 'hold') { d.hold = Math.round((b.hold * HOLD_F[i]) / 5) * 5 || 5; d.reps = b.reps; }
  else d.reps = Math.max(4, Math.round(b.reps * REP_F[i]));
  if (flare) { d.sets = Math.max(1, d.sets - 1); d.romFactor = Math.max(0.5, d.romFactor - 0.15); if (d.hold) d.hold = Math.max(5, Math.round(d.hold * 0.6)); else d.reps = Math.max(4, Math.round(d.reps * 0.7)); }
  d.loadNote = i === 4 ? 'load' : null;
  return d;
}

// Exercices de la phase : plan du clinicien s'il correspond à la phase, sinon protocole de la pathologie
export function exerciseIds(profile, phase = profile.phase || 1) {
  let ids;
  if (profile.plan && profile.plan.phase === phase && profile.plan.ids?.length) ids = profile.plan.ids;
  else { const path = pathologyById(profile.pathology); ids = path ? path.phases[phase] || path.phases[1] : []; }
  // Remplacements choisis (matériel manquant) : exercice d'origine → exercice équivalent
  const sw = profile.swaps || {};
  return [...new Set(ids.map((id) => (sw[id] && EXERCISES[sw[id]] ? sw[id] : id)))];
}
export const swappedFrom = (profile, id) => Object.entries(profile.swaps || {}).find(([, v]) => v === id)?.[0] || null;

export function levelOf(profile, id) {
  return profile.levels?.[id] ?? profile.baseLevel ?? startLevel(profile.irritability);
}

// Réglages du patient avant la séance : pour aujourd'hui seulement (todayOver) ou permanents (doseOver)
export const DEFAULT_REST = 30;
export function todayOver(profile) { const o = profile.todayOver; return o && o.date === todayKey() ? o : { date: todayKey(), items: {}, skip: [] }; }
export function applyOver(d, o) {
  if (!o) return d;
  const r = { ...d };
  if (o.sets) r.sets = o.sets;
  if (o.reps) r.reps = o.reps;
  if (o.hold && r.type === 'hold') r.hold = o.hold;
  if (o.rest != null) r.rest = o.rest;
  r.custom = true;
  return r;
}
export function todaysProgram(profile, { withSkipped = false } = {}) {
  const flare = inFlare(profile);
  const to = todayOver(profile);
  return exerciseIds(profile).map((id) => {
    const lv = levelOf(profile, id);
    const level = flare ? Math.max(1, lv - 1) : lv;
    let dose = doseFor(id, level, flare);
    dose.rest = DEFAULT_REST;
    dose = applyOver(applyOver(dose, profile.doseOver?.[id]), to.items[id]);
    if (!profile.doseOver?.[id] && !to.items[id]) delete dose.custom;
    return { id, level, dose, flare, skipped: to.skip.includes(id), kept: !!profile.doseOver?.[id] };
  }).filter((x) => withSkipped || !x.skipped);
}
// Durée estimée d'un exercice (secondes) : séries × (répétitions × tempo, ou maintien) + repos + mise en place
export function exerciseSeconds(d) {
  const tempo = (d.tempo || '2-1-2').split('-').map(Number);
  const rep = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (d.holdTop || 0));
  const work = d.type === 'hold' ? (d.reps || 1) * (d.hold + 4) : d.reps * rep;
  return d.sets * work + Math.max(0, d.sets - 1) * (d.rest ?? DEFAULT_REST) + 40;
}

// Règle de progression après chaque exercice (modèle de surveillance de la douleur)
export function adjustLevel(profile, item, sessions, checkin) {
  const path = pathologyById(profile.pathology);
  const painMax = path?.painMax ?? 4;
  const cur = levelOf(profile, item.id);
  if (inFlare(profile)) return { level: cur, change: 0, reason: 'flare' };
  const q = avg(item.sets.map((s) => s.quality).filter((x) => x != null));
  const prev = sessions.slice(-3).flatMap((s) => s.items.filter((i) => i.id === item.id)).slice(-1)[0];
  let next = cur, reason = 'same';
  if (item.pain > painMax || checkin === 'worse') { next = cur - 1; reason = 'pain'; }
  else if (item.difficulty >= 5 || (q != null && q < 0.5)) { next = cur - 1; reason = 'hard'; }
  else if (item.difficulty <= 2 && (q == null || q >= 0.8) && item.pain <= painMax - 1) {
    if (prev && prev.difficulty <= 2 && prev.pain <= painMax - 1) { next = cur + 1; reason = 'easy'; }
  }
  next = Math.max(1, Math.min(5, next));
  return { level: next, change: Math.sign(next - cur), reason };
}

// Revue hebdomadaire : avance la phase seulement si la douleur est sous contrôle (sauf si le clinicien verrouille)
export function weeklyReview(profile, sessions, now = Date.now()) {
  const week = weekNumber(profile, now);
  if (profile.lockPhase) return { week, phase: profile.phase || 1 };
  const target = calendarPhase(week);
  const path = pathologyById(profile.pathology);
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7.flatMap((s) => s.items.map((i) => i.pain)).filter((x) => x != null);
  const painMax = path?.painMax ?? 4;
  const painOk = !pains.length || avg(pains) <= painMax;
  let phase = profile.phase || 1;
  if (target > phase && painOk && last7.length >= 2) phase = phase + 1;
  if (!painOk && phase > 1 && avg(pains) > painMax + 2) phase = phase - 1;
  return { week, phase };
}

// Ce qui manque pour passer à la phase suivante (affiché au patient)
export function nextPhaseInfo(profile, sessions, now = Date.now()) {
  const phase = profile.phase || 1;
  if (phase >= 3) return { done: true };
  const path = pathologyById(profile.pathology);
  const painMax = path?.painMax ?? 4;
  const week = weekNumber(profile, now);
  const needWeek = phase === 1 ? 3 : 7;
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7.flatMap((s) => s.items.map((i) => i.pain)).filter((x) => x != null);
  return {
    done: false, phase, painMax, locked: !!profile.lockPhase,
    weeksLeft: Math.max(0, needWeek - week), sessionsNeeded: Math.max(0, 2 - last7.length),
    painOk: !pains.length || avg(pains) <= painMax, painAvg: avg(pains),
  };
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
    res.push({ week: w, sessions: r.sessions, pain: avg(r.pain), quality: avg(r.quality), difficulty: avg(r.difficulty), planned: plannedPerWeek(profile) });
  }
  return res;
}

export const plannedPerWeek = (profile) => (profile.days?.length || profile.perWeek || 3);

// Série de jours consécutifs (au calendrier prévu) sans séance manquée
export function streak(profile, sessions, now = Date.now()) {
  const done = new Set(sessions.map((s) => todayKey(s.date)));
  const days = profile.days?.length ? profile.days : [1, 3, 5];
  let n = 0;
  const since = profile.joinedAt || profile.startDate || 0;
  for (let i = 0; i < 120; i++) {
    const d = new Date(now - i * DAY);
    if (d.getTime() < since - DAY) break;
    if (!days.includes(d.getDay())) continue;
    const k = todayKey(d.getTime());
    if (done.has(k)) n++;
    else if (i === 0) continue; // aujourd'hui pas encore fait : ne casse pas la série
    else break;
  }
  return n;
}

// Résumé partagé avec le clinicien (aucune vidéo, aucune donnée inutile)
export function progressSummary(profile, sessions, now = Date.now()) {
  const last7 = sessions.filter((s) => now - s.date < 7 * DAY);
  const pains = last7.flatMap((s) => s.items.map((i) => i.pain)).filter((x) => x != null);
  const qs = last7.flatMap((s) => s.items.flatMap((i) => i.sets.map((x) => x.quality))).filter((x) => x != null);
  return {
    name: profile.name || '', week: weekNumber(profile, now), phase: profile.phase || 1,
    sessions7: last7.length, planned: plannedPerWeek(profile),
    pain7: pains.length ? +avg(pains).toFixed(1) : null, quality7: qs.length ? Math.round(avg(qs) * 100) : null,
    levels: profile.levels || {}, flare: inFlare(profile, now),
    last: sessions.slice(-5).reverse().map((s) => ({ date: s.date, n: s.items.length, pain: avg(s.items.map((i) => i.pain)) })),
    notes: recentNotes(sessions, 5),
  };
}
// Commentaires écrits / dictés par le patient après ses exercices (les plus récents d'abord)
export function recentNotes(sessions, n = 5) {
  return sessions.flatMap((s) => s.items.filter((i) => i.note).map((i) => ({ date: i.ts || s.date, ex: i.id, pain: i.pain ?? null, text: String(i.note).slice(0, 400) })))
    .sort((a, b) => b.date - a.date).slice(0, n);
}

export function avg(a) { return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
export const todayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
