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
  return {
    profile: replaceProfile || !cur.profile ? bk.profile || cur.profile : cur.profile,
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
