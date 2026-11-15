// Rapports : rapport patient périodique (court formulaire) + PDF partageable avec le clinicien.
// Logique pure (testée dans tests/report.test.mjs) : reportDue, reportPeriod, buildReportData, dataFromSummary, summaryPart, rxExtrasReport.
// Affichage : carte d'accueil, vue #/rapport, section de l'éditeur de programme, bouton PDF de la fiche patient.
// Le PDF est dessiné par reportpdf.js (jsPDF vendu en local, chargé à la demande).
import { t, tr, getLang } from './i18n.js';
import { state, profile, sessions as stateSessions, updateProfile, go as stateGo } from './state.js';
import * as P from './program.js';
import { EXERCISES } from './data/exercises.js';
import { TESTS } from './data/romtests.js';
import { protocolById } from './data/protocols.js';
import { instrumentDef, trend as promTrend } from './data/proms.js';
import { seriesOf as romSeries, trend as romTrend } from './rom.js';
import { pdfLang, renderPdf, sharePdf } from './reportpdf.js';

// ui.js touche document à l'import : chargé à la demande pour que la logique reste testable sous node
let UI = null;
import('./ui.js').then((m) => { UI = m; }, () => {});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, s = 18) => (UI ? UI.icon(n, s) : '');
const toast = (m, ms) => { if (UI) UI.toast(m, ms); };
const rootOf = ($app) => (typeof $app === 'function' ? $app() : $app);

const DAY = 86400000;
export const REPORT_EVERY = [0, 2, 4, 6, 8, 12];
const LOG_CAP = 60;

// =====================================================================================================================
// Échéance
// =====================================================================================================================
const startOf = (p) => p?.reportStart || p?.joinedAt || p?.startDate || 0;
export const lastReportTs = (p) => (p?.reportLog || []).reduce((m, r) => (r && r.ts > m ? r.ts : m), 0) || null;

/** Rapport dû ? plan { every semaines } (fixé par le clinicien) ; le premier est dû `every` semaines après l'arrivée, puis `every` semaines après le dernier rapport. */
export function reportDue(p, now = Date.now()) {
  const every = +p?.reportPlan?.every;
  if (!(every > 0)) return false;
  const base = lastReportTs(p) ?? startOf(p);
  if (!base) return false;
  return now >= base + every * 7 * DAY;
}
/** Période couverte par le prochain rapport : depuis le dernier rapport (sinon depuis le début) jusqu'à maintenant. */
export function reportPeriod(p, sess = [], now = Date.now()) {
  const first = sess.length ? Math.min(...sess.map((s) => s.date)) : null;
  const from = lastReportTs(p) ?? (startOf(p) || first || now - 28 * DAY);
  return { from: Math.min(from, now), to: now };
}

// =====================================================================================================================
// Données du rapport (pur)
// =====================================================================================================================
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const dayKey = P.todayKey;
const nameOfEx = (id) => EXERCISES[id]?.name || id;

function cleanFields(f, lang) {
  if (!f) return null;
  const out = {};
  if (Number.isFinite(+f.global) && f.global !== '' && f.global != null) out.global = Math.max(-2, Math.min(2, Math.round(+f.global)));
  if (f.pain != null && f.pain !== '' && Number.isFinite(+f.pain)) out.pain = Math.max(0, Math.min(10, Math.round(+f.pain)));
  if (f.goalsProgress != null && f.goalsProgress !== '' && Number.isFinite(+f.goalsProgress)) out.goalsProgress = Math.max(0, Math.min(3, Math.round(+f.goalsProgress)));
  for (const k of ['goals', 'difficulties', 'comment']) if (f[k] && String(f[k]).trim()) out[k] = String(f[k]).trim().slice(0, 1200);
  const ids = (f.hardEx || []).filter((id) => EXERCISES[id]);
  if (ids.length) { out.hardExIds = ids; out.hardEx = ids.map(nameOfEx); }
  return Object.keys(out).length ? out : null;
}

/**
 * Données du rapport (aucun DOM). Noms cliniques = objets { fr, en } (le PDF choisit la langue).
 * profile, sessions [{ id, date, items:[{ id, level, sets:[{ reps, full, partial, holdSec }], pain, difficulty, change, note, ts }] }],
 * journal [{ day:'AAAA-MM-JJ', pain, ts }], opts { from, to, fields, now, includeName }.
 */
export function buildReportData(prof = {}, sess = [], journal = [], opts = {}) {
  const now = opts.now ?? Date.now();
  const per = reportPeriod(prof, sess, now);
  const to = opts.to ?? per.to, from = Math.min(opts.from ?? per.from, to);
  const inP = (ts) => ts != null && ts >= from && ts <= to;
  const sP = sess.filter((s) => inP(s.date)).sort((a, b) => a.date - b.date);

  // Adhérence : jours prévus (hors aujourd'hui s'il n'est pas encore fait) réalisés
  const doneDays = new Set(sess.map((s) => dayKey(s.date)));
  const fromK = dayKey(from), toK = dayKey(Math.min(to, now)), today = dayKey(now);
  let planned = 0, hit = 0;
  for (let d = new Date(from); ; d = new Date(d.getTime() + DAY)) {
    const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime());
    if (k > toK) break;
    if (k >= fromK && P.isPlannedDay(prof, k)) {
      if (doneDays.has(k)) { planned++; hit++; } else if (k < today) planned++;
    }
  }

  // Douleur : moyenne par séance + journal quotidien
  const painPts = [];
  for (const s of sP) { const v = avg(s.items.map((i) => i.pain).filter((x) => x != null)); if (v != null) painPts.push({ ts: s.date, v: r1(v), src: 's' }); }
  for (const j of journal || []) {
    if (j == null || j.pain == null) continue;
    const ts = j.ts ?? new Date((j.day || '') + 'T12:00').getTime();
    if (inP(ts)) painPts.push({ ts, v: +j.pain, src: 'j' });
  }
  painPts.sort((a, b) => a.ts - b.ts);
  const pv = painPts.map((p) => p.v);
  const pain = { series: painPts, avg: r1(avg(pv)), first: pv.length ? pv[0] : null, last: pv.length ? pv[pv.length - 1] : null, delta: pv.length > 1 ? r1(pv[pv.length - 1] - pv[0]) : null, min: pv.length ? Math.min(...pv) : null, max: pv.length ? Math.max(...pv) : null };

  // Exercices : programme actuel + ceux réalisés dans la période
  const progIds = (() => { try { return P.exerciseIds(prof); } catch (_) { return []; } })();
  const seen = [...new Set(sP.flatMap((s) => s.items.map((i) => i.id)))];
  const exercises = [...new Set([...progIds, ...seen])].filter((id) => EXERCISES[id]).map((id) => {
    const its = sP.flatMap((s) => s.items.filter((i) => i.id === id)).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const dif = its.map((i) => i.difficulty).filter((x) => x != null), pn = its.map((i) => i.pain).filter((x) => x != null);
    const ch = its.reduce((a, i) => a + (i.change || 0), 0);
    const level = progIds.includes(id) ? P.levelOf(prof, id) : (its.length ? its[its.length - 1].level : null);
    return { id, name: nameOfEx(id), level, levelStart: its.length ? its[0].level ?? null : null, sessions: its.length, difficulty: r1(avg(dif)), pain: r1(avg(pn)), trend: ch > 0 ? 'up' : ch < 0 ? 'down' : 'steady' };
  }).sort((a, b) => b.sessions - a.sessions);

  // Amplitudes : toutes mesures jusqu'à la fin de la période (départ = 1re mesure)
  const romLog = (prof.romLog || []).filter((r) => r && r.ts <= to);
  const rom = [];
  const romKeys = new Map();
  for (const r of romLog) { const T = TESTS[r.test]; if (T) { const sd = T.sided ? (r.side || null) : null; romKeys.set(r.test + '|' + sd, { test: r.test, side: sd }); } }
  for (const { test, side } of romKeys.values()) {
    const T = TESTS[test], ser = romSeries(romLog, test, side), tr_ = romTrend(romLog, test, side);
    if (!ser.length) continue;
    rom.push({ test, name: T.name, side, unit: T.unit || '°', baseline: r1(tr_.baseline), last: r1(tr_.last), gain: tr_.gain, pctNormal: tr_.pctNormal, normal: { lo: T.normal?.lo ?? null, hi: T.normal?.hi ?? null, ref: T.normal?.ref ?? null }, n: ser.length, lastTs: tr_.lastTs, series: ser.map((x) => [x.ts, r1(x.deg)]) });
  }
  rom.sort((a, b) => (a.test < b.test ? -1 : a.test > b.test ? 1 : (a.side || '') < (b.side || '') ? -1 : 1));

  // Questionnaires
  const promLog = (prof.promLog || []).filter((r) => r && r.ts <= to);
  const prom = [...new Set(promLog.map((l) => l.id))].map((id) => {
    const def = instrumentDef(id, prof.promCustom || []); if (!def) return null;
    const tr_ = promTrend(promLog, id, def);
    if (!tr_.n) return null;
    return { id, name: def.name, n: tr_.n, baseline: tr_.baseline, last: tr_.last, delta: tr_.delta, improvement: tr_.improvement, mcid: def.mcid || null, mcidReached: !!tr_.mcidReached, higherIsBetter: def.higherIsBetter, range: def.range || null, lastTs: tr_.lastTs };
  }).filter(Boolean);

  // Badges
  const bg = prof.badges || {};
  const badges = { total: Object.keys(bg).length, inPeriod: Object.values(bg).filter((ts) => inP(ts)).length };

  // Journal des séances (période seulement, les plus récentes si trop long)
  let logAll = sP.map((s) => ({
    ts: s.date,
    items: s.items.map((i) => {
      const sets = i.sets || [];
      const sum = (k) => sets.reduce((a, x) => a + (+x[k] || 0), 0);
      return { id: i.id, name: nameOfEx(i.id), sets: sets.length, reps: sum('reps'), full: sum('full'), partial: sum('partial'), holdSec: sum('holdSec'), pain: i.pain ?? null, difficulty: i.difficulty ?? null };
    }),
    pain: r1(avg(s.items.map((i) => i.pain).filter((x) => x != null))), difficulty: r1(avg(s.items.map((i) => i.difficulty).filter((x) => x != null))),
  }));
  const logTruncated = logAll.length > LOG_CAP;
  if (logTruncated) logAll = logAll.slice(-LOG_CAP);

  const notes = sP.flatMap((s) => s.items.filter((i) => i.note).map((i) => ({ ts: i.ts || s.date, ex: i.id, exName: nameOfEx(i.id), pain: i.pain ?? null, text: String(i.note).slice(0, 400) }))).sort((a, b) => a.ts - b.ts).slice(-30);

  // Identité / problème
  const path = P.pathologyById(prof.pathology);
  const st = (() => { try { return P.protocolStatus(prof, now); } catch (_) { return null; } })();
  const protocol = st ? { id: st.id, name: protocolById(st.id)?.name || st.id, week: st.week, phase: st.phaseIndex + 1, phases: st.phaseCount, preop: st.preop, surgeryDate: prof.protocol?.surgeryDate || null } : null;

  return {
    version: 1, generatedAt: now, source: 'full', period: { from, to, days: Math.max(1, Math.round((to - from) / DAY)) },
    patient: { name: opts.includeName === false ? '' : String(prof.name || '').trim() },
    condition: { pathology: path ? path.name : null, region: path?.region || null, phase: prof.phase || null, week: prof.startDate ? P.weekNumber(prof, now) : null, protocol, clinician: prof.clinician || '' },
    adherence: { planned, done: hit, pct: planned ? Math.round((hit / planned) * 100) : null },
    sessionsCount: sP.length,
    pain, exercises, rom, prom, badges,
    fields: cleanFields(opts.fields),
    log: logAll, logTruncated, notes,
  };
}

/**
 * Même structure à partir du résumé que le patient partage (progressSummary + summaryPart des modules), pour le clinicien.
 * Lacunes (le résumé ne les contient pas) : période réelle (7 derniers jours seulement), séries / répétitions, adhérence sur la période,
 * douleur au-delà des 5 dernières séances, nom de la pathologie (passer extra.pathology = id ou { fr, en }), niveau de départ des exercices.
 */
export function dataFromSummary(sum = {}, extra = {}) {
  const now = extra.now ?? Date.now();
  const last = (sum.last || []).slice().sort((a, b) => a.date - b.date);
  const ps = last.filter((l) => l.pain != null).map((l) => ({ ts: l.date, v: r1(l.pain), src: 's' }));
  const pv = ps.map((p) => p.v);
  const rom = (sum.rom || []).map((r) => {
    const T = TESTS[r.t]; if (!T) return null;
    return { test: r.t, name: T.name, side: r.s || null, unit: T.unit || '°', baseline: r.b, last: r.l, gain: r.g, pctNormal: T.normal?.ref > 0 && !T.deficit && r.l != null ? Math.round((r.l / T.normal.ref) * 100) : null, normal: { lo: T.normal?.lo ?? null, hi: T.normal?.hi ?? null, ref: T.normal?.ref ?? null }, n: r.n, lastTs: r.ts, series: r.p || [] };
  }).filter(Boolean);
  const prom = (sum.prom || []).map((p) => ({ id: p.id, name: p.name, n: p.n, baseline: p.baseline, last: p.last, delta: p.delta, improvement: p.improvement, mcid: p.mcidReached ? true : null, mcidReached: !!p.mcidReached, higherIsBetter: p.higherIsBetter, range: p.range, lastTs: p.lastTs }));
  const pr = sum.protocol && protocolById(sum.protocol.id) ? { id: sum.protocol.id, name: protocolById(sum.protocol.id).name, week: sum.protocol.week, phase: sum.protocol.phase, phases: sum.protocol.phases, preop: !!sum.protocol.preop, surgeryDate: extra.surgeryDate || null } : null;
  const pathName = typeof extra.pathology === 'string' ? P.pathologyById(extra.pathology)?.name || null : extra.pathology || null;
  const exercises = Object.entries(sum.ex || {}).filter(([id]) => EXERCISES[id]).map(([id, e]) => ({ id, name: nameOfEx(id), level: e.level, levelStart: null, sessions: null, difficulty: e.lastDifficulty, pain: e.lastPain, trend: e.trend || 'steady' }));
  const rep = sum.report || null;
  return {
    version: 1, generatedAt: now, source: 'summary', period: { from: now - 7 * DAY, to: now, days: 7 },
    patient: { name: String(sum.name || '').trim() },
    condition: { pathology: pathName, region: null, phase: sum.phase || null, week: sum.week ?? null, protocol: pr, clinician: '' },
    adherence: { planned: sum.planned ?? null, done: sum.sessions7 ?? 0, pct: sum.planned ? Math.min(100, Math.round(((sum.sessions7 || 0) / sum.planned) * 100)) : null },
    sessionsCount: sum.sessions7 ?? 0,
    pain: { series: ps, avg: sum.pain7 ?? r1(avg(pv)), first: pv.length ? pv[0] : null, last: pv.length ? pv[pv.length - 1] : null, delta: pv.length > 1 ? r1(pv[pv.length - 1] - pv[0]) : null, min: pv.length ? Math.min(...pv) : null, max: pv.length ? Math.max(...pv) : null },
    exercises, rom, prom, badges: { total: Array.isArray(sum.badges) ? sum.badges.length : (sum.badges?.total ?? 0), inPeriod: 0 },
    fields: cleanFields(rep?.fields), log: last.slice().reverse().map((l) => ({ ts: l.date, n: l.n, pain: r1(l.pain) })).reverse(), logTruncated: false,
    notes: (sum.notes || []).slice().sort((a, b) => a.date - b.date).map((n) => ({ ts: n.date, ex: n.ex, exName: nameOfEx(n.ex), pain: n.pain ?? null, text: n.text })),
  };
}

/** Petit résumé pour le clinicien (à ajouter à progressSummary) : dernier rapport du patient. */
export function summaryPart(prof) {
  const r = (prof?.reportLog || []).filter((x) => x && x.ts).sort((a, b) => b.ts - a.ts)[0];
  if (!r) return {};
  return { report: { ts: r.ts, every: prof.reportPlan?.every || null, fields: r.fields || null, n: (prof.reportLog || []).length } };
}

/** Profil patient ← rx : { reportPlan }. */
export const rxExtrasReport = (rx) => ({ reportPlan: +rx?.report?.every > 0 ? { every: +rx.report.every } : null });

// =====================================================================================================================
// Éditeur de programme (clinicien)
// =====================================================================================================================
export function rxSectionReport(rx = {}) {
  const cur = +rx?.report?.every > 0 ? +rx.report.every : 0;
  const html = `<h2>${esc(t('rp_secTitle'))}</h2><div class="card" data-rp-sec>
    <p class="muted small" style="margin:0 0 10px">${esc(t('rp_secD'))}</p>
    <label class="field" style="margin:0"><span>${esc(t('rp_freq'))}</span><select class="input" data-rp-every>${REPORT_EVERY.map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${esc(n ? t('rp_everyN', { n }) : t('rp_none'))}</option>`).join('')}</select></label></div>`;
  return {
    html,
    bind() {},
    /** → { report: { every } | null } */
    read(root) {
      const sel = root?.querySelector?.('[data-rp-every]');
      if (!sel) return { report: rx?.report || null };
      const n = +sel.value || 0;
      return { report: n > 0 ? { every: n } : null };
    },
  };
}

// =====================================================================================================================
// Accueil patient
// =====================================================================================================================
export function homeCardReport(prof, now = Date.now()) {
  if (!prof || !reportDue(prof, now)) return '';
  return `<div class="card rp-card" data-rp-card><div class="row between"><span class="eyebrow">${esc(t('rp_dueTitle'))}</span></div>
    <button class="rp-due" data-rp-go><span class="grow"><b>${esc(t('rp_title'))}</b><small class="muted">${esc(t('rp_dueD'))}</small></span>${icon('doc', 20)}</button></div>`;
}
export function bindHomeCardReport(root, go = stateGo) {
  root?.querySelectorAll?.('[data-rp-go]').forEach((b) => { b.onclick = () => go('#/rapport'); });
}

// =====================================================================================================================
// Vue patient : #/rapport
// =====================================================================================================================
const dateLong = (ts) => new Date(ts).toLocaleDateString(getLang() === 'fr' ? 'fr-CA' : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pdfFileName = (now = Date.now()) => `Mobilis-rapport-${P.todayKey(now)}.pdf`;
const GLOBAL = [-2, -1, 0, 1, 2];

async function makePdf(prof, fields, includeName) {
  const sess = stateSessions(), journal = state.data?.journal || [];
  const data = buildReportData(prof, sess, journal, { fields, includeName });
  const blob = await renderPdf(data, pdfLang(getLang()));
  return { data, blob };
}
async function shareResult(blob, name) {
  const how = await sharePdf(blob, name, { title: t('rp_shareTitle') });
  if (how === 'download') toast(t('rp_downloaded'));
  return how;
}

export function viewPatientReport($app) {
  const root = rootOf($app); if (!root) return;
  const prof = profile(); if (!prof) return stateGo('#/home');
  const sess = stateSessions();
  const per = reportPeriod(prof, sess);
  const last = lastReportTs(prof);
  const f = { global: null, pain: null, goalsProgress: null, goals: '', hardEx: [], difficulties: '', comment: '', includeName: true, sendClin: false };
  let busy = false, done = null;
  const progIds = (() => { try { return P.exerciseIds(prof); } catch (_) { return []; } })().filter((id) => EXERCISES[id]);
  const canSend = !!prof.rxCode;

  const seg = (name, vals, cur, label) => `<div class="rp-seg" role="radiogroup" aria-label="${esc(name)}">${vals.map((v) => `<button type="button" role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-rp-${name}="${v}">${label(v)}</button>`).join('')}</div>`;

  function draw() {
    root.innerHTML = `<section class="screen rp-screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(t('rp_title'))}</h1></div>
      <p class="muted small">${esc(t('rp_intro'))}</p>
      <div class="card rp-meta"><div class="row between"><span class="small muted">${esc(t('rp_period'))}</span><b class="small">${esc(dateLong(per.from))} – ${esc(dateLong(per.to))}</b></div>
        <div class="row between" style="margin-top:6px"><span class="small muted">${esc(t('rp_lastReport'))}</span><b class="small">${last ? esc(dateLong(last)) : esc(t('rp_never'))}</b></div></div>
      ${done ? `<div class="card rp-done" role="status"><b>${icon('check', 18)} ${esc(t('rp_done'))}</b><p class="small muted" style="margin:6px 0 12px">${esc(t('rp_doneD'))}</p>
        <div class="row wrap"><button class="btn" data-rp-again>${icon('share', 18)} ${esc(t('rp_shareAgain'))}</button><button class="btn ghost" data-go="#/home">${esc(t('done'))}</button></div></div>` : `
      <h2>${esc(t('rp_global'))}</h2>${seg('g', GLOBAL, f.global, (v) => esc(t('rp_g' + (v < 0 ? 'm' + -v : v))))}
      <h2>${esc(t('rp_painNow'))}</h2><p class="small muted" style="margin:-4px 0 8px">${esc(t('rp_painD'))}</p>
      <div class="rp-scale" role="radiogroup" aria-label="${esc(t('rp_painNow'))}">${Array.from({ length: 11 }, (_, i) => `<button type="button" role="radio" aria-checked="${f.pain === i}" class="${f.pain === i ? 'on' : ''}" data-rp-p="${i}">${i}</button>`).join('')}</div>
      <h2>${esc(t('rp_goalsProg'))}</h2>${seg('gp', [0, 1, 2, 3], f.goalsProgress, (v) => esc(t('rp_gp' + v)))}
      <label class="field" style="margin-top:10px"><span>${esc(t('rp_goals'))}</span><textarea class="input" rows="2" data-rp-f="goals" placeholder="${esc(t('rp_goalsPh'))}">${esc(f.goals)}</textarea></label>
      ${progIds.length ? `<h2>${esc(t('rp_hardEx'))}</h2><div class="pills wrapped">${progIds.map((id) => `<button type="button" class="pill ${f.hardEx.includes(id) ? 'on' : ''}" aria-pressed="${f.hardEx.includes(id)}" data-rp-ex="${id}">${esc(tr(EXERCISES[id].name))}</button>`).join('')}</div>` : ''}
      <label class="field" style="margin-top:12px"><span>${esc(t('rp_diff'))}</span><textarea class="input" rows="3" data-rp-f="difficulties" placeholder="${esc(t('rp_diffPh'))}">${esc(f.difficulties)}</textarea></label>
      <label class="field"><span>${esc(t('rp_comment'))}</span><textarea class="input" rows="3" data-rp-f="comment">${esc(f.comment)}</textarea></label>
      <div class="list">
        ${prof.name ? `<div class="toggle"><span>${esc(t('rp_includeName'))}</span><button type="button" class="switch ${f.includeName ? 'on' : ''}" role="switch" aria-checked="${f.includeName}" data-rp-sw="includeName"></button></div>` : ''}
        ${canSend ? `<div class="toggle"><span>${esc(t('rp_sendClin'))}<br><small class="muted">${esc(t('rp_sendClinD'))}</small></span><button type="button" class="switch ${f.sendClin ? 'on' : ''}" role="switch" aria-checked="${f.sendClin}" data-rp-sw="sendClin"></button></div>` : ''}
      </div>
      <div class="stack" style="margin-top:16px"><button class="btn" data-rp-make ${busy ? 'disabled' : ''}>${icon('doc', 18)} ${esc(busy ? t('rp_working') : t('rp_make'))}</button>
        <button class="btn ghost" data-rp-adhoc ${busy ? 'disabled' : ''}>${esc(t('rp_adhoc'))}</button></div>
      <p class="note" style="margin-top:12px">${esc(t('rp_privacy'))}</p>`}
    </section>${UI ? UI.nav('progress', 'patient') : ''}`;
    wire();
  }

  function wire() {
    const q = (s) => root.querySelectorAll(s);
    q('[data-rp-g]').forEach((b) => (b.onclick = () => { f.global = +b.dataset.rpG; draw(); }));
    q('[data-rp-gp]').forEach((b) => (b.onclick = () => { f.goalsProgress = +b.dataset.rpGp; draw(); }));
    q('[data-rp-p]').forEach((b) => (b.onclick = () => { f.pain = +b.dataset.rpP; draw(); }));
    q('[data-rp-ex]').forEach((b) => (b.onclick = () => { const id = b.dataset.rpEx; f.hardEx = f.hardEx.includes(id) ? f.hardEx.filter((x) => x !== id) : [...f.hardEx, id]; draw(); }));
    q('[data-rp-f]').forEach((el) => (el.oninput = () => { f[el.dataset.rpF] = el.value; }));
    q('[data-rp-sw]').forEach((b) => (b.onclick = () => { const k = b.dataset.rpSw; f[k] = !f[k]; draw(); }));
    const mk = root.querySelector('[data-rp-make]'), ad = root.querySelector('[data-rp-adhoc]'), again = root.querySelector('[data-rp-again]');
    if (mk) mk.onclick = () => run(true);
    if (ad) ad.onclick = () => run(false);
    if (again) again.onclick = () => done && shareResult(done.blob, done.name);
  }

  async function run(withForm) {
    if (busy) return;
    busy = true; draw();
    try {
      const p0 = profile();
      const fields = withForm ? { global: f.global, pain: f.pain, goalsProgress: f.goalsProgress, goals: f.goals, hardEx: f.hardEx, difficulties: f.difficulties, comment: f.comment } : null;
      const { data, blob } = await makePdf(p0, fields, f.includeName);
      const name = pdfFileName();
      if (withForm) {
        const ts = Date.now();
        await updateProfile({ reportLog: [...(p0.reportLog || []), { ts, fields: data.fields || {}, pdfName: name }] });
        try { (await import('./badges.js')).syncBadges(); } catch (_) {}
        if (f.sendClin) sendToClinician().catch(() => {});
      }
      done = { blob, name };
      busy = false; draw();
      await shareResult(blob, name);
    } catch (e) {
      console.warn('rapport', e);
      busy = false; draw(); toast(t('rp_err'), 4000);
    }
  }
  async function sendToClinician() {
    const store = await import('./store.js');
    const p = profile();
    if (!store.isCloud() || !p?.rxCode) { toast(t('shareNeedsAccount')); return; }
    await store.pushProgress(p.rxCode, { ...P.progressSummary(p, stateSessions()), ...summaryPart(p) });
    toast(t('rp_sentOk'));
  }
  draw();
}

// =====================================================================================================================
// Clinicien : PDF depuis le résumé du patient
// =====================================================================================================================
export function clinicPdfButton(summary) {
  if (!summary) return '';
  return `<div class="rp-clin"><button class="btn ghost sm" data-rp-clinpdf>${icon('doc', 16)} ${esc(t('rp_pdfClin'))}</button><small class="muted" style="display:block;margin-top:4px">${esc(t('rp_pdfClinD'))}</small></div>`;
}
/** extra : { pathology (id | { fr, en }), surgeryDate } facultatifs, connus de la fiche patient. */
export function bindClinicPdf(root, summary, extra = {}) {
  const b = root?.querySelector?.('[data-rp-clinpdf]'); if (!b) return;
  b.onclick = async () => {
    b.disabled = true;
    try {
      const data = dataFromSummary(summary, extra);
      const blob = await renderPdf(data, pdfLang(getLang()));
      await sharePdf(blob, `Mobilis-rapport-patient-${P.todayKey()}.pdf`, { title: t('rp_shareTitle') });
    } catch (e) { console.warn('pdf clinicien', e); toast(t('rp_err'), 4000); }
    b.disabled = false;
  };
}
