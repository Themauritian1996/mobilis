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
  if (flare) { d.romFactor = Math.max(0.5, d.romFactor - 0.15); flareCut(d); }
  d.loadNote = i === 4 ? 'load' : null;
  return d;
}
// Journée difficile : une série et un tiers de répétitions (ou de secondes) en moins
function flareCut(d) {
  d.sets = Math.max(1, d.sets - 1);
  if (d.hold) d.hold = Math.max(5, Math.round(d.hold * 0.6)); else d.reps = Math.max(4, Math.round(d.reps * 0.7));
  return d;
}
const lvIdx = (l) => Math.max(1, Math.min(5, l || 3)) - 1;
// Dose fixée par le clinicien à un niveau donné, adaptée à un autre niveau (même facteur relatif que doseFor)
export function scaleDose(exId, d, fromLv, toLv) {
  if (!d) return d;
  const r = { ...d };
  if (fromLv === toLv) return r;
  const hold = EXERCISES[exId]?.dose?.type === 'hold';
  const a = lvIdx(fromLv), b = lvIdx(toLv);
  if (hold) { if (d.hold) r.hold = Math.max(5, Math.round((d.hold * HOLD_F[b]) / HOLD_F[a] / 5) * 5); }
  else if (d.reps) r.reps = Math.max(3, Math.round((d.reps * REP_F[b]) / REP_F[a]));
  return r;
}
// Dose d'un exercice : niveau (doseFor) -> dose du clinicien adaptée au niveau (rxDose) -> réglages permanents du patient (doseOver)
// -> réglages d'aujourd'hui (todayOver)
export function doseOf(profile, id, level, flare = false, to = null) {
  const rd = profile.rxDose?.[id];
  let dose = doseFor(id, level, flare && !rd);
  dose.rest = DEFAULT_REST;
  if (rd) {
    const s = scaleDose(id, rd, rd.lv ?? level, level);
    const m = { ...dose };
    if (s.sets) m.sets = s.sets;
    if (s.reps && m.type === 'reps') m.reps = s.reps;
    if (s.hold && m.type === 'hold') m.hold = s.hold;
    if (s.rest != null) m.rest = s.rest;
    if (flare) { m.romFactor = doseFor(id, level, true).romFactor; flareCut(m); }
    dose = m;
    if (s.rest != null) dose.rest = s.rest;
  }
  to = to || todayOver(profile);
  dose = applyOver(applyOver(dose, profile.doseOver?.[id]), to.items?.[id]);
  if (!profile.doseOver?.[id] && !to.items?.[id]) delete dose.custom;
  return dose;
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
    const dose = doseOf(profile, id, level, flare, to);
    return { id, level, dose, flare, skipped: to.skip.includes(id), kept: !!profile.doseOver?.[id], rx: !!profile.rxDose?.[id] };
  }).filter((x) => withSkipped || !x.skipped);
}
// Durée estimée d'un exercice (secondes) : séries × (répétitions × tempo, ou maintien) + repos + mise en place
export function exerciseSeconds(d) {
  const tempo = (d.tempo || '2-1-2').split('-').map(Number);
  const rep = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (d.holdTop || 0));
  const work = d.type === 'hold' ? (d.reps || 1) * (d.hold + 4) : d.reps * rep;
  return d.sets * work + Math.max(0, d.sets - 1) * (d.rest ?? DEFAULT_REST) + 40;
}

// Séances précédentes d'un exercice : un seul essai par jour (le dernier), jours différents de `dayKey`, du plus ancien au plus récent
export function priorItems(sessions, id, dayKey, n = 3) {
  const byDay = new Map();
  for (const s of sessions || []) for (const i of s.items || []) {
    if (i.id !== id) continue;
    const ts = i.ts ?? s.date, k = todayKey(ts);
    if (k === dayKey) continue;
    const o = byDay.get(k);
    if (!o || ts >= o.ts) byDay.set(k, { ...i, ts });
  }
  return [...byDay.values()].sort((a, b) => a.ts - b.ts).slice(-n);
}
export const itemQuality = (i) => avg((i.sets || []).map((s) => s.quality).filter((x) => x != null));
export function lastItem(sessions, id) {
  let best = null;
  for (const s of sessions || []) for (const i of s.items || []) if (i.id === id && (!best || (i.ts ?? s.date) >= (best.ts ?? 0))) best = { ...i, ts: i.ts ?? s.date };
  return best;
}

// Règle de progression après chaque exercice (échelle de difficulté 1 très facile … 5 trop difficile)
// reason : pain | hard | easy | steady | locked | max | flare
export function adjustLevel(profile, item, sessions, checkin) {
  const path = pathologyById(profile.pathology);
  const painMax = path?.painMax ?? 4;
  const cur = levelOf(profile, item.id);
  const cap = Math.max(1, Math.min(5, profile.maxLevel?.[item.id] ?? 5));
  if (inFlare(profile)) return { level: cur, change: 0, reason: 'flare' };
  const q = itemQuality(item);
  const d = item.difficulty, pain = item.pain ?? 0;
  const calm = (i) => (i.pain ?? 0) <= painMax - 1;
  const okQ = (x) => x == null || x >= 0.8;
  const prior = priorItems(sessions, item.id, todayKey(item.ts ?? Date.now()), 3);
  const down = (reason) => ({ level: Math.max(1, cur - 1), change: cur > 1 ? -1 : 0, reason });
  // Sécurité : une douleur au-delà de la limite fait toujours baisser d'un niveau, même si le clinicien gère la progression
  if (pain > painMax || checkin === 'worse') return down('pain');
  if (profile.autoEx?.[item.id] === false) return { level: cur, change: 0, reason: 'locked' };
  if (d >= 5 || (q != null && q < 0.5)) return down('hard');
  let up = false;
  if (d <= 2 && okQ(q) && calm(item)) {
    const p = prior.slice(-1)[0];
    up = !!p && p.difficulty <= 2 && calm(p) && okQ(itemQuality(p));
  } else if (d === 3 && okQ(q) && calm(item)) {
    const p = prior.slice(-2);
    up = p.length === 2 && p.every((i) => i.difficulty === 3 && calm(i) && okQ(itemQuality(i)));
  }
  if (up) {
    if (cur >= cap) return { level: cur, change: 0, reason: 'max' };
    return { level: Math.min(5, cur + 1), change: 1, reason: 'easy' };
  }
  return { level: cur, change: 0, reason: 'steady' };
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

// Jour prévu ? Fonction pure unique : jours de la semaine du profil + exceptions du calendrier
// (calSkip : repos volontaire ; calExtra : séance ajoutée ; calMoves : { jour prévu: nouveau jour }).
export function isPlannedDay(profile, dateKey) {
  const p = profile || {};
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

// Modifie les exceptions : op = rest | add | move (k -> to) | undo ; renvoie le patch de profil
export function exceptionPatch(prof, op, k, to) {
  const moves = { ...(prof.calMoves || {}) }; let skip = [...(prof.calSkip || [])]; let extra = [...(prof.calExtra || [])];
  const origin = Object.keys(moves).find((o) => moves[o] === k);
  if (op === 'rest') { if (!skip.includes(k)) skip.push(k); extra = extra.filter((x) => x !== k); }
  else if (op === 'add') { if (!extra.includes(k)) extra.push(k); skip = skip.filter((x) => x !== k); }
  else if (op === 'move') {
    skip = skip.filter((x) => x !== to);
    if (extra.includes(k)) extra = [...extra.filter((x) => x !== k), to];
    else if (origin) { if (origin === to) delete moves[origin]; else moves[origin] = to; }
    else moves[k] = to;
  } else if (op === 'undo') {
    skip = skip.filter((x) => x !== k); extra = extra.filter((x) => x !== k);
    for (const o of Object.keys(moves)) if (o === k || moves[o] === k) delete moves[o];
  }
  return { calMoves: moves, calSkip: skip, calExtra: extra };
}
// Série de jours prévus consécutifs réalisés, sans séance manquée
export function streak(profile, sessions, now = Date.now()) {
  const done = new Set(sessions.map((s) => todayKey(s.date)));
  const today = todayKey(now);
  let n = 0;
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 400; i++, d.setDate(d.getDate() - 1)) {
    const k = todayKey(d.getTime());
    if (k < '2000-01-01') break;
    if (!isPlannedDay(profile, k)) {
      if (profile?.joinedAt && k < todayKey(profile.joinedAt) && !(profile.calExtra || []).includes(k)) break;
      continue;
    }
    if (done.has(k)) n++;
    else if (k === today) continue; // aujourd'hui pas encore fait : ne casse pas la série
    else break;
  }
  return n;
}

// Adhérence d'un mois (m : 0-11) : jours prévus jusqu'à aujourd'hui et ceux réalisés
export function monthAdherence(profile, sessions, year, m, now = Date.now()) {
  const done = new Set(sessions.map((s) => todayKey(s.date)));
  const today = todayKey(now);
  let planned = 0, hit = 0, count = 0;
  const n = new Date(year, m + 1, 0).getDate();
  for (let i = 1; i <= n; i++) {
    const k = todayKey(new Date(year, m, i, 12).getTime());
    if (done.has(k)) count++;
    if (k <= today && isPlannedDay(profile, k)) { planned++; if (done.has(k)) hit++; }
  }
  return { sessions: count, planned, hit, pct: planned ? Math.round((hit / planned) * 100) : 0 };
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
    levels: profile.levels || {}, flare: inFlare(profile, now), ex: exerciseSummary(profile, sessions),
    last: sessions.slice(-5).reverse().map((s) => ({ date: s.date, n: s.items.length, pain: avg(s.items.map((i) => i.pain)) })),
    notes: recentNotes(sessions, 5),
  };
}
// Par exercice du programme : niveau, dernière difficulté et douleur, tendance (up | down | steady) d'après les 3 dernières séances
export function exerciseSummary(profile, sessions) {
  const out = {};
  for (const id of exerciseIds(profile)) {
    const items = priorItems(sessions, id, '', 3);
    const last = items.slice(-1)[0];
    const ch = items.reduce((a, i) => a + (i.change || 0), 0);
    out[id] = { level: levelOf(profile, id), lastDifficulty: last?.difficulty ?? null, lastPain: last?.pain ?? null, trend: ch > 0 ? 'up' : ch < 0 ? 'down' : 'steady' };
  }
  return out;
}
// Commentaires écrits / dictés par le patient après ses exercices (les plus récents d'abord)
export function recentNotes(sessions, n = 5) {
  return sessions.flatMap((s) => s.items.filter((i) => i.note).map((i) => ({ date: i.ts || s.date, ex: i.id, pain: i.pain ?? null, text: String(i.note).slice(0, 400) })))
    .sort((a, b) => b.date - a.date).slice(0, n);
}

export function avg(a) { return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
export const todayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
