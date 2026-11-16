// Utilisation au long cours : migration des anciens profils, sauvegarde / restauration (fichier JSON), fin de programme.
// Fonctions pures (aucun accès au DOM ni au réseau) : testées dans tests/longterm.test.mjs.
import * as P from './program.js';

const DAY = 86400000;
export const BACKUP_APP = 'mobilis-backup';
export const BACKUP_VERSION = 1;

const isDay = (n) => Number.isInteger(n) && n >= 0 && n <= 6;
// Remet un ancien profil au format courant : champs absents → valeurs par défaut, types invalides → corrigés. Ne perd rien.
export function migrateProfile(p) {
  if (!p || typeof p !== 'object') return p;
  const o = { ...p };
  if (!o.role) o.role = 'patient';
  o.days = Array.isArray(o.days) && o.days.filter(isDay).length ? [...new Set(o.days.filter(isDay))].sort() : [1, 3, 5];
  o.perWeek = o.days.length;
  if (![1, 2, 3].includes(o.phase)) o.phase = 1;
  if (!o.levels || typeof o.levels !== 'object' || Array.isArray(o.levels)) o.levels = {};
  for (const k of ['rxDose', 'autoEx', 'maxLevel', 'partialEx', 'swaps', 'doseOver']) if (o[k] != null && (typeof o[k] !== 'object' || Array.isArray(o[k]))) delete o[k];
  if (o.plan && !(Array.isArray(o.plan.ids) && o.plan.ids.length)) o.plan = null;
  if (!Number.isFinite(o.joinedAt)) o.joinedAt = Number.isFinite(o.startDate) ? o.startDate : Date.now();
  if (!Number.isFinite(o.startDate)) o.startDate = o.joinedAt;
  if (!['low', 'med', 'high'].includes(o.irritability)) o.irritability = 'med';
  if (typeof o.painBase !== 'number') o.painBase = 3;
  if (o.rxCode && !Number.isFinite(o.rxVersion)) o.rxVersion = 1;
  if (o.rxCode && !Number.isFinite(o.rxAt)) o.rxAt = o.startDate; // début du programme actuel (sert à détecter sa fin)
  return o;
}
export function migrateSessions(list) {
  return (Array.isArray(list) ? list : []).filter((s) => s && typeof s === 'object' && s.id != null).map((s) => ({
    ...s, date: Number.isFinite(s.date) ? s.date : Date.now(),
    items: (Array.isArray(s.items) ? s.items : []).filter(Boolean).map((i) => ({ ...i, sets: Array.isArray(i.sets) ? i.sets : [] })),
  }));
}
export const migrateJournal = (j) => (Array.isArray(j) ? j.filter((e) => e && e.day) : []);

// ---------- Sauvegarde ----------
// Contient profil, séances et journal. Jamais de clé IA, de jeton ni de mot de passe.
export function makeBackup({ profile, sessions, journal, user } = {}) {
  return JSON.stringify({ app: BACKUP_APP, v: BACKUP_VERSION, exported: new Date().toISOString(), user: user || 'local', profile: profile || null, sessions: sessions || [], journal: journal || [] }, null, 2);
}
// Lit un fichier de sauvegarde (aussi l'ancien export sans « app »). Retourne { profile, sessions, journal } ou lève une erreur.
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (_) { throw new Error('json'); }
  if (!d || typeof d !== 'object' || (d.app && d.app !== BACKUP_APP)) throw new Error('format');
  if (!d.profile && !Array.isArray(d.sessions)) throw new Error('empty');
  const profile = d.profile ? migrateProfile(d.profile) : null;
  if (profile) { delete profile.geminiKey; delete profile.sharedAI; }
  return { profile, sessions: migrateSessions(d.sessions), journal: migrateJournal(d.journal) };
}
// Fusionne la sauvegarde dans les données actuelles : séances par id, journal par jour ; le profil sauvegardé remplace seulement s'il n'y en a pas
export function mergeBackup(cur, bk, { replaceProfile = false } = {}) {
  const ses = new Map((cur.sessions || []).map((s) => [s.id, s]));
  for (const s of bk.sessions) if (!ses.has(s.id)) ses.set(s.id, s);
  const jr = new Map((cur.journal || []).map((j) => [j.day, j]));
  for (const j of bk.journal) if (!jr.has(j.day)) jr.set(j.day, j);
  // Profil gardé : on y ajoute quand même les journaux de la sauvegarde (amplitudes, questionnaires, rapports, badges, objets)
  let profile = replaceProfile || !cur.profile ? bk.profile || cur.profile : cur.profile;
  if (!replaceProfile && cur.profile && bk.profile) {
    const mergeLog = (a = [], b = []) => { const k = (x) => JSON.stringify([x.ts, x.test || x.id || '', x.side || '']); const seen = new Set(a.map(k)); return [...a, ...b.filter((x) => x && !seen.has(k(x)))].sort((x, y) => (x.ts || 0) - (y.ts || 0)); };
    profile = { ...cur.profile };
    for (const f of ['romLog', 'promLog', 'reportLog']) if (Array.isArray(bk.profile[f])) profile[f] = mergeLog(cur.profile[f], bk.profile[f]);
    for (const f of ['badges', 'equipChoice']) if (bk.profile[f]) profile[f] = { ...bk.profile[f], ...(cur.profile[f] || {}) };
    if (!cur.profile.promActivities && bk.profile.promActivities) profile.promActivities = bk.profile.promActivities;
  }
  return {
    profile,
    sessions: [...ses.values()].sort((a, b) => a.date - b.date),
    journal: [...jr.values()].sort((a, b) => String(a.day).localeCompare(String(b.day))),
  };
}

// ---------- Fin de programme ----------
// Un programme (clinicien) est « terminé » après 12 semaines si la phase 3 est atteinte (ou fixée par le clinicien),
// ou à la fin de la dernière phase d'un protocole à durée définie. Les exercices restent disponibles : seul un message s'affiche.
export const PROGRAM_DAYS = 84;
export function programEnded(profile, now = Date.now()) {
  if (!profile?.pathology || profile.role === 'clinician') return false;
  const ps = P.protocolStatus(profile, now);
  if (ps) { const end = ps.phase?.weeks?.[1]; return !!(ps.last && end != null && ps.weeksSince >= end); }
  if (!profile.rxCode && !profile.clinician) return false; // programme auto-évalué : pas de « renouvellement »
  const ref = profile.rxAt || profile.startDate || now;
  return (now - ref) / DAY >= PROGRAM_DAYS && ((profile.phase || 1) >= 3 || !!profile.lockPhase);
}

// ---------- Semaine (début lundi ou dimanche) ----------
// Réglage « auto » : première jour de la semaine de la langue (Intl) ; repli : dimanche en Amérique du Nord / Brésil / Mexique / Japon, lundi ailleurs.
export function localeWeekStart(loc = 'fr-CA') {
  try {
    const L = new Intl.Locale(loc);
    const wi = typeof L.getWeekInfo === 'function' ? L.getWeekInfo() : L.weekInfo;
    if (wi && wi.firstDay) return wi.firstDay === 7 ? 0 : wi.firstDay === 1 ? 1 : wi.firstDay % 7;
    const region = (L.maximize().region || '').toUpperCase();
    return ['US', 'CA', 'MX', 'BR', 'JP', 'IL', 'SA', 'AU', 'KR', 'PH'].includes(region) ? 0 : 1;
  } catch (_) { return 1; }
}
/** setting : 'auto' | 0 | 1 (0 = dimanche). → 0 | 1 */
export const weekStartFor = (setting, loc) => (setting === 0 || setting === 1 || setting === '0' || setting === '1' ? +setting : localeWeekStart(loc));
/** Ordre des jours (0 = dimanche) en commençant par `start`. */
export const weekOrder = (start) => (start === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]);

// ---------- Jours d'entraînement ----------
/** Retirer le dernier jour d'entraînement est refusé (un programme sans jour n'a pas de sens). */
export const canToggleDay = (days, d) => !(Array.isArray(days) && days.length === 1 && days[0] === d);
export const toggleDay = (days, d) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]).sort((a, b) => a - b);

// ---------- Rendez-vous ----------
/** Supprime UN seul élément (par position) sans toucher aux autres, même s'ils ont la même date et la même heure. */
export const removeAt = (list, i) => (Array.isArray(list) ? list.filter((_, k) => k !== i) : []);

// ---------- Export agenda (.ics) ----------
const pad2 = (n) => String(n).padStart(2, '0');
const icsDt = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
/** Premier jour (à partir d'aujourd'hui) dont le jour de la semaine est un jour d'entraînement, à l'heure du rappel. */
export function firstTrainingStart(days, time = '18:00', now = new Date()) {
  const [h, m] = String(time || '18:00').split(':').map(Number);
  const ds = days && days.length ? days : [1, 3, 5];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, Number.isFinite(h) ? h : 18, Number.isFinite(m) ? m : 0);
    if (ds.includes(d.getDay())) return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
}
/** labels : { title, desc, appt } ; appts : [{ date, time, note }]. */
export function buildIcs({ days, time = '18:00', appts = [], labels = {}, now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const by = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ds = days && days.length ? days : [1, 3, 5];
  const start = firstTrainingStart(ds, time, now), end = new Date(start.getTime() + 30 * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mobilis//FR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:mobilis-plan-${stamp}`, `DTSTAMP:${stamp}`, `DTSTART:${icsDt(start)}`, `DTEND:${icsDt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${ds.map((d) => by[d]).join(',')}`, `SUMMARY:${icsEsc(labels.title || 'Mobilis')}`,
    `DESCRIPTION:${icsEsc(labels.desc || '')}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(labels.title || 'Mobilis')}`, 'END:VALARM', 'END:VEVENT'];
  appts.forEach((a, i) => {
    const s = new Date(`${a.date}T${a.time || '09:00'}`), e = new Date(s.getTime() + 45 * 60000);
    if (Number.isNaN(s.getTime())) return;
    lines.push('BEGIN:VEVENT', `UID:mobilis-appt-${i}-${a.date}`, `DTSTAMP:${stamp}`, `DTSTART:${icsDt(s)}`, `DTEND:${icsDt(e)}`, `SUMMARY:${icsEsc((labels.appt || 'Appointment') + (a.note ? ' — ' + a.note : ''))}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------- Historique : plage, modification, saisie manuelle ----------
export const RANGES = ['4w', '3m', 'all'];
/** Date de début (ms) d'une plage : '4w' = 28 jours, '3m' = 91 jours, 'all' = null. */
export const rangeCutoff = (range, now = Date.now()) => (range === '4w' ? now - 28 * DAY : range === '3m' ? now - 91 * DAY : null);
export function inRange(ts, range, now = Date.now()) { const c = rangeCutoff(range, now); return c == null || ts >= c; }
/** Nombre de semaines de programme à afficher dans les graphiques d'une plage. */
export const rangeWeeks = (range) => (range === '4w' ? 4 : range === '3m' ? 13 : Infinity);

const dayStart = (key) => new Date(key + 'T12:00').getTime();
/** Séance saisie à la main (faite hors de l'app) à la date `day` (AAAA-MM-JJ). items : [{ id, level, sets, reps, pain, note }]. */
export function makeManualSession({ day, items = [], now = Date.now() }) {
  const ts = dayStart(day);
  return {
    id: 'm' + now.toString(36) + Math.floor(Math.random() * 1e4), date: ts, manual: true, checkin: null,
    items: items.map((i) => ({ id: i.id, level: i.level ?? null, ts, pain: i.pain ?? null, difficulty: null, note: i.note || '', change: 0, manual: true,
      sets: Array.from({ length: Math.max(1, i.sets || 1) }, () => ({ reps: i.reps ?? 0, full: i.reps ?? 0, manual: true })) })),
  };
}
/** Validation de la date d'une séance manuelle : pas dans le futur, pas avant le début du programme. */
export function validPastDay(day, startTs, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return 'format';
  const d = dayStart(day);
  if (Number.isNaN(d)) return 'format';
  const todayK = P.todayKey(now);
  if (day > todayK) return 'future';
  if (startTs && day < P.todayKey(startTs)) return 'before';
  return null;
}
/** Applique les modifications d'une séance : nouvelle date, douleur / note par exercice, exercices retirés. */
export function editSession(s, { day, items = {}, remove = [] } = {}) {
  const out = { ...s };
  if (day) {
    const cur = P.todayKey(s.date);
    if (day !== cur) { out.date = dayStart(day); }
  }
  out.items = (s.items || []).map((it, k) => ({ it, k })).filter(({ k }) => !remove.includes(k)).map(({ it, k }) => {
    const e = items[k];
    return e ? { ...it, ...(e.pain !== undefined ? { pain: e.pain } : {}), ...(e.note !== undefined ? { note: e.note } : {}) } : it;
  });
  return out;
}
export const removeById = (list, id) => (Array.isArray(list) ? list.filter((x) => x.id !== id) : []);
/** Entrée de journal / mesure / questionnaire : suppression ou modification par `ts`. */
export const removeByTs = (list, ts) => (Array.isArray(list) ? list.filter((x) => x.ts !== ts) : []);
export const patchByTs = (list, ts, patch) => (Array.isArray(list) ? list.map((x) => (x.ts === ts ? { ...x, ...patch } : x)) : []);

// ---------- CSV : résumé d'un patient (clinicien) ----------
const csvCell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** summary = résumé partagé (fullSummary). nameOf(id) → libellé d'exercice. → texte CSV (UTF-8, séparateur virgule). */
export function patientCsv(p, { nameOf = (x) => x, headers = ['section', 'item', 'value', 'detail'] } = {}) {
  const rows = [headers];
  const add = (...r) => rows.push(r);
  const day = (ts) => (ts ? P.todayKey(ts) : '');
  add('patient', 'name', p.name || '', ''); add('patient', 'week', p.week, ''); add('patient', 'phase', p.phase, '');
  add('week', 'sessions', p.sessions7, `planned ${p.planned}`); add('week', 'pain', p.pain7 ?? '', '/10'); add('week', 'quality', p.quality7 ?? '', '%'); add('week', 'flare', p.flare ? 1 : 0, '');
  add('patient', 'updated', day(p.updated), '');
  for (const [id, e] of Object.entries(p.ex || {})) add('exercise', nameOf(id), e.level, `difficulty ${e.lastDifficulty ?? ''}; pain ${e.lastPain ?? ''}; trend ${e.trend || ''}`);
  for (const r of p.rom || []) add('rom', r.t + (r.s ? ' ' + r.s : ''), r.l ?? '', `baseline ${r.b ?? ''}; gain ${r.g ?? ''}; n ${r.n}; ${day(r.ts)}`);
  for (const q of p.prom || []) add('prom', q.id, q.last ?? '', `delta ${q.delta ?? ''}; n ${q.n ?? ''}`);
  for (const n of p.notes || []) add('comment', nameOf(n.ex), n.text, `${day(n.date)}${n.pain != null ? '; pain ' + n.pain : ''}`);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
