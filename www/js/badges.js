// Badges d'assiduité et de progrès. Logique pure (évaluation, sans DOM) + affichage (vue, carte d'accueil, célébration).
// Forme des données : session = { id, date: ms, items: [{ id, change, ts, sets, pain, difficulty }] } ;
// profile.romLog / promLog / reportLog / badges = { id: ts } (voir spec v1.14). Un badge gagné n'est jamais retiré.
import { streak, isPlannedDay, todayKey } from './program.js';
import { t, locale } from './i18n.js';

const DAY = 86400000;
const UNIT_DAYS = 'bdgUnitDays';
const UNIT_SESS = 'bdgUnitSess';

// Jour (AAAA-MM-JJ) décalé de n jours ; midi pour éviter les effets de l'heure d'été
const addDays = (key, n) => { const d = new Date(key + 'T12:00'); d.setDate(d.getDate() + n); return todayKey(d.getTime()); };
const mondayOf = (key) => addDays(key, -((new Date(key + 'T12:00').getDay() + 6) % 7));
const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
const itemTs = (s, i) => i.ts ?? s.date;
const firstTs = (list) => { const v = (list || []).map((x) => x && x.ts).filter((x) => typeof x === 'number'); return v.length ? Math.min(...v) : null; };

// Série de jours prévus réalisés (program.js) : atteinte au premier moment où elle vaut N
const streakWhen = (N) => (c) => {
  if (streak(c.profile, c.sessions, c.now) < N) return null;
  for (const s of c.sessions) {
    if (s.date > c.now) break;
    const sub = c.sessions.filter((x) => x.date <= s.date);
    if (streak(c.profile, sub, s.date) >= N) return s.date;
  }
  return c.now;
};
const streakProgress = (N) => (c) => ({ n: Math.min(streak(c.profile, c.sessions, c.now), N), of: N, unit: UNIT_DAYS });
const countWhen = (N) => (c) => (c.sessions.length >= N ? c.sessions[N - 1].date : null);
const countProgress = (N) => (c) => ({ n: Math.min(c.sessions.length, N), of: N, unit: UNIT_SESS });

// Semaine complète : les jours prévus (Lun–Dim) sont tous réalisés ; les jours de repos ne comptent pas
function fullWeekWhen(c) {
  if (!c.sessions.length) return null;
  const byDay = new Map();
  for (const s of c.sessions) { const k = todayKey(s.date); byDay.set(k, Math.max(byDay.get(k) ?? 0, s.date)); }
  const lastMon = mondayOf(todayKey(c.now));
  for (let mon = mondayOf(todayKey(c.sessions[0].date)); mon <= lastMon; mon = addDays(mon, 7)) {
    const planned = [];
    for (let i = 0; i < 7; i++) { const k = addDays(mon, i); if (isPlannedDay(c.profile, k)) planned.push(k); }
    if (planned.length && planned.every((k) => byDay.has(k))) return Math.max(...planned.map((k) => byDay.get(k)));
  }
  return null;
}

// Changement de niveau : une séance où un exercice est passé à un niveau supérieur
function levelUpWhen(c) {
  let best = null;
  for (const s of c.sessions) for (const i of s.items || []) if ((i.change || 0) > 0) { const ts = itemTs(s, i); if (best == null || ts < best) best = ts; }
  return best;
}

// Amplitude : sur une mesure (test + côté) dont la dernière valeur dépasse la première de 10° ou plus.
// Mesures à faible confiance (< 0,5) ignorées.
function rangeWhen(c) {
  const groups = new Map();
  for (const r of c.profile.romLog || []) {
    if (!r || typeof r.deg !== 'number' || typeof r.ts !== 'number' || r.ts > c.now) continue;
    if (r.conf != null && r.conf < 0.5) continue;
    const k = `${r.test}|${r.side ?? ''}`;
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  let best = null;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.ts - b.ts);
    const base = g[0].deg;
    if (g[g.length - 1].deg < base + 10) continue;
    const hit = g.find((r, i) => i > 0 && r.deg >= base + 10);
    if (hit && (best == null || hit.ts < best)) best = hit.ts;
  }
  return best;
}

// Retour : une séance après au moins 7 jours sans séance
function comebackWhen(c) {
  for (let i = 1; i < c.sessions.length; i++) {
    const gap = dayNum(todayKey(c.sessions[i].date)) - dayNum(todayKey(c.sessions[i - 1].date));
    if (gap >= 7) return c.sessions[i].date;
  }
  return null;
}

// key : suffixe des clés i18n (bdg<key>T / bdg<key>D). icon : nom dans IC (ui.js)
export const BADGES = [
  { id: 'first', key: 'First', icon: 'play', when: (c) => (c.sessions.length ? c.sessions[0].date : null) },
  { id: 'streak3', key: 'Streak3', icon: 'flame', when: streakWhen(3), progress: streakProgress(3) },
  { id: 'streak7', key: 'Streak7', icon: 'flame', when: streakWhen(7), progress: streakProgress(7) },
  { id: 'streak14', key: 'Streak14', icon: 'flame', when: streakWhen(14), progress: streakProgress(14) },
  { id: 'streak30', key: 'Streak30', icon: 'flame', when: streakWhen(30), progress: streakProgress(30) },
  { id: 'sessions10', key: 'Sessions10', icon: 'cal', when: countWhen(10), progress: countProgress(10) },
  { id: 'sessions50', key: 'Sessions50', icon: 'cal', when: countWhen(50), progress: countProgress(50) },
  { id: 'sessions100', key: 'Sessions100', icon: 'cal', when: countWhen(100), progress: countProgress(100) },
  { id: 'fullWeek', key: 'FullWeek', icon: 'layers', when: fullWeekWhen },
  { id: 'levelUp', key: 'LevelUp', icon: 'chart', when: levelUpWhen },
  { id: 'rangeUp', key: 'RangeUp', icon: 'side', when: rangeWhen },
  { id: 'prom', key: 'Prom', icon: 'doc', when: (c) => firstTs(c.profile.promLog) },
  { id: 'report', key: 'Report', icon: 'share', when: (c) => firstTs(c.profile.reportLog) },
  { id: 'comeback', key: 'Comeback', icon: 'timer', when: comebackWhen },
];
const BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

const ctxOf = (profile, sessions, now) => ({
  profile: profile || {},
  sessions: [...(sessions || [])].sort((a, b) => a.date - b.date),
  now,
});

// Évaluation pure. earned = badges déjà gagnés (profile.badges) + nouveaux { id: ts } ; newOnes = ids gagnés à cet appel seulement.
// Un badge déjà présent dans profile.badges n'est jamais recalculé ni retiré.
export function evaluateBadges(profile = {}, sessions = [], now = Date.now()) {
  const prev = (profile && profile.badges) || {};
  const earned = { ...prev };
  const newOnes = [];
  const c = ctxOf(profile, sessions, now);
  for (const b of BADGES) {
    if (prev[b.id] != null) continue;
    const ts = b.when(c);
    if (ts != null) { earned[b.id] = ts; newOnes.push(b.id); }
  }
  return { earned, newOnes };
}

// Progression affichée pour les badges de série et de compte (null sinon)
export function badgeProgress(b, profile, sessions, now = Date.now()) {
  return b.progress ? b.progress(ctxOf(profile, sessions, now)) : null;
}

// ---------- Célébration discrète (une à la fois, sans son) ----------
const queue = [];
let showing = false;
export function celebrate(ids = []) {
  for (const id of ids) if (BY_ID[id]) queue.push(id);
  if (!showing) next();
}
async function next() {
  const id = queue.shift();
  if (!id) { showing = false; return; }
  showing = true;
  if (typeof document === 'undefined') { showing = false; return; }
  const b = BY_ID[id];
  const { icon } = await import('./ui.js');
  const el = document.createElement('div');
  el.className = 'badge-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="bt-ic">${icon(b.icon, 20)}</span><span class="bt-txt"><small>${t('bdgNew')}</small><strong>${t('bdg' + b.key + 'T')}</strong><span>${t('bdg' + b.key + 'D')}</span></span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  let done = false;
  const close = () => {
    if (done) return; done = true;
    el.classList.remove('in');
    setTimeout(() => { el.remove(); next(); }, 250);
  };
  el.onclick = close;
  setTimeout(close, 4200);
}

// Évalue, enregistre les nouveaux badges dans le profil et célèbre ceux-ci (à appeler après chaque sauvegarde pertinente)
export async function syncBadges() {
  const { profile, sessions, updateProfile } = await import('./state.js');
  const p = profile();
  if (!p) return { earned: {}, newOnes: [] };
  const { earned, newOnes } = evaluateBadges(p, sessions(), Date.now());
  if (newOnes.length) { await updateProfile({ badges: earned }); celebrate(newOnes); }
  return { earned, newOnes };
}

// ---------- Affichage ----------
const fmtDate = (ts) => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

// Vue « #/badges » : grille de tous les badges, gagnés (date) ou verrouillés (comment les obtenir + progression)
export async function viewBadges($app) {
  const { profile, sessions } = await import('./state.js');
  const { icon } = await import('./ui.js');
  const prof = profile() || {};
  const sess = sessions() || [];
  const now = Date.now();
  const { earned } = evaluateBadges(prof, sess, now);
  const n = BADGES.filter((b) => earned[b.id] != null).length;
  const cards = BADGES.map((b) => {
    const ts = earned[b.id];
    const pr = badgeProgress(b, prof, sess, now);
    const pct = pr ? Math.round((pr.n / pr.of) * 100) : 0;
    const status = ts != null
      ? `<small class="bc-meta">${t('bdgEarned')} ${fmtDate(ts)}</small>`
      : `<small class="bc-meta">${t('bdgLocked')}</small>${pr ? `<div class="bc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.of}" aria-valuenow="${pr.n}"><i style="width:${pct}%"></i></div><small class="bc-meta">${pr.n} / ${pr.of} ${t(pr.unit)}</small>` : ''}`;
    return `<article class="badge-card ${ts != null ? 'earned' : 'locked'}"><span class="bc-ic">${icon(b.icon, 22)}</span><h2>${t('bdg' + b.key + 'T')}</h2><p>${t('bdg' + b.key + 'D')}</p>${status}</article>`;
  }).join('');
  $app.innerHTML = `<section class="screen badges-screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('bdgTitle')}</h1></div>
    <p class="muted">${t('bdgIntro')}</p><p class="badge-count"><strong>${n}</strong> / ${BADGES.length}</p>
    <div class="badge-grid">${cards}</div></section>`;
}

// Petite pastille pour l'accueil (d'après profile.badges déjà enregistré)
export function homeChipBadges(profile = {}) {
  const n = BADGES.filter((b) => (profile?.badges || {})[b.id] != null).length;
  return `<button class="chip badge-chip" data-go="#/badges">${t('bdgChip')} · ${n} / ${BADGES.length}</button>`;
}
