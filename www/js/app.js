import { firebaseEnabled } from './config.js';
import { t, tr, getLang, setLang, locale, langInfo } from './i18n.js';
import { EXERCISES, EQUIP } from './data/exercises.js';
import { REGIONS, PATHOLOGIES } from './data/pathologies.js';
import * as store from './store.js';
import * as P from './program.js';
import { coachComment, speakRich, cueText } from './coach.js';
import { state, setRender, render, go, profile, sessions, todaySession, nextExercise, updateProfile, syncProgress, inTrial, navRole } from './state.js';
import { esc, icon, IC, toast, stopFigs, mountFigs, figSvg, figureBlock, nav, applyTheme, lvlBar, sheet, shareText, copyText, langPicker } from './ui.js';
import { viewOnboard, viewCodeEntry, viewRxImport, checkRxUpdate, layName, medName } from './onboarding.js';
import { viewTrain, doseText } from './train.js';
import { viewCalendar, appointments } from './calendar.js';
import { viewClinic, viewRxEditor, viewTestStart } from './clinic.js';

const $app = document.getElementById('app');
let cleanup = [];

// ---------- Démarrage et routes ----------
async function boot() {
  await setLang(getLang());
  applyTheme();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (_) {}
  await store.initAuth(async (u) => {
    state.user = u;
    state.data = u ? await store.loadData() : null;
    if (state.data?.profile?.lang && state.data.profile.lang !== getLang()) await setLang(state.data.profile.lang);
    render();
  });
}
window.addEventListener('hashchange', render);
setRender(route);

// Changement de langue (tous les sélecteurs)
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-lang-select]');
  if (!sel) return;
  try { sessionStorage.setItem('mobilis.langChosen', '1'); } catch (_) {}
  await setLang(sel.value);
  if (profile()) await updateProfile({ lang: sel.value });
  render();
});

function route() {
  stopFigs();
  cleanup.forEach((f) => { try { f(); } catch (_) {} }); cleanup = [];
  document.querySelectorAll('.sheet-bg').forEach((x) => x.remove());
  window.scrollTo(0, 0);
  const r = location.hash.replace(/^#\/?/, '');
  const [name, arg, arg2] = r.split('/');
  if (name === 'rx' && arg) {
    try { localStorage.setItem('mobilis.pendingRx', arg); } catch (_) {}
    // Le lien porte la langue choisie par le clinicien (#/rx/CODE/es)
    let chosen = false; try { chosen = !!sessionStorage.getItem('mobilis.langChosen'); } catch (_) {}
    if (arg2 && arg2 !== getLang() && langInfo(arg2).id === arg2 && !chosen) { setLang(arg2).then(render); return; }
    if (state.user) return viewRxImport(arg);
  }
  if (!state.user) return viewAuth();
  let pending = null; try { pending = localStorage.getItem('mobilis.pendingRx'); } catch (_) {}
  if (pending && name !== 'rx') return go('#/rx/' + pending.split('/')[0]);
  if (name === 'code') return viewCodeEntry();
  const prof = profile();
  if (!prof?.role || name === 'onboard' || (prof.role === 'patient' && !prof.pathology)) return viewOnboard();
  if (name === 'clinic' && arg === 'new') return viewRxEditor(null);
  if (name === 'clinic' && arg === 'rx' && arg2) return viewRxEditor(arg2);
  if (name === 'clinic') return viewClinic();
  if (name === 'library') return viewLibrary();
  if (name === 'ex' && arg) return viewExercise(arg);
  if (name === 'profile') return viewProfile();
  if (name === 'train' && arg) return viewTrain(arg, cleanup);
  if (prof.role === 'clinician' && !prof.pathology) return viewTestStart();
  if (name === 'calendar') return viewCalendar();
  if (name === 'progress') return viewProgress();
  if (name === 'report') return viewReport();
  if (name === 'adjust') return viewAdjust();
  return viewHome();
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const a = e.target.closest('[data-act="quickstart"]');
  if (a) { const n = nextExercise(); go(n ? `#/train/${n.id}` : '#/home'); }
});

// ---------- Connexion ----------
function viewAuth() {
  const fbOn = firebaseEnabled();
  let pending = null; try { pending = localStorage.getItem('mobilis.pendingRx'); } catch (_) {}
  $app.innerHTML = `<section class="screen auth">
    <div class="row between"><div class="brand-lg">${icon('logo', 30, 'style="color:var(--ink)"')} Mobilis</div>
      ${langPicker()}</div>
    <h1>${t('heroTitle')}</h1><p class="muted" style="margin:0">${t('tagline')}</p>
    <svg class="hero-fig" data-fig="squat" data-static="0" data-keys="0" data-anat="0"></svg>
    ${pending ? `<div class="banner pos" style="margin-bottom:12px">${icon('stetho', 20)}<div>${t('pendingRx')}</div></div>` : ''}
    <div class="stack">
      ${fbOn ? `<button class="btn" data-a="google"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${t('googleBtn')}</button>
      <button class="btn ghost" data-a="emailToggle">${t('emailBtn')}</button>
      <div id="emailBox" hidden class="card">
        <label class="field"><span>${t('email')}</span><input class="input" id="em" type="email" autocomplete="email"></label>
        <label class="field"><span>${t('password')}</span><input class="input" id="pw" type="password" autocomplete="current-password" minlength="6"></label>
        <div class="row"><button class="btn" data-a="signin">${t('signIn')}</button><button class="btn ghost" data-a="signup">${t('signUp')}</button></div>
        <button class="link small" data-a="reset" style="margin-top:12px">${t('forgot')}</button>
      </div>
      <p class="err" id="err" hidden></p>
      <div class="divider">${t('or')}</div>` : ''}
      <button class="btn ${fbOn ? 'soft' : ''}" data-a="local">${fbOn ? t('demoBtn') : t('start')}</button>
    </div>
    <p class="note" style="margin-top:18px">${t('disclaimer')}</p>
  </section>`;
  mountFigs($app);
  const q = (s) => $app.querySelector(s);
  const err = (e) => { const p = q('#err'); if (p) { p.hidden = false; p.textContent = t('authErr') + (e.code || e.message); } };
  q('[data-a="local"]').onclick = () => store.signInLocal(async (u) => { state.user = u; state.data = await store.loadData(); render(); });
  if (!fbOn) return;
  q('[data-a="google"]').onclick = () => store.signInGoogle().catch(err);
  q('[data-a="emailToggle"]').onclick = () => { q('#emailBox').hidden = !q('#emailBox').hidden; };
  const em = () => q('#em').value.trim(), pw = () => q('#pw').value;
  q('[data-a="signin"]').onclick = () => store.signInEmail(em(), pw(), false).catch(err);
  q('[data-a="signup"]').onclick = () => store.signInEmail(em(), pw(), true).catch(err);
  q('[data-a="reset"]').onclick = () => { if (!em()) return err({ message: t('enterEmailFirst') }); store.resetPassword(em()).then(() => toast(t('resetSent'), 4000)).catch(err); };
}

// ---------- Accueil ----------
function exItem(x, done = false) {
  const ex = EXERCISES[x.id];
  return `<button class="ex-item" data-go="#/ex/${x.id}"><span class="ex-thumb">${figSvg(x.id, { stat: true })}</span>
    <span class="meta"><b>${esc(tr(ex.name))}</b><small>${doseText(x.dose)} · ${ex.track ? t('tracked') : t('guidedShort')}</small></span>
    <span class="check ${done ? 'on' : ''}">${done ? icon('check', 15) : ''}</span></button>`;
}

async function weeklyMaybe() {
  const prof = profile();
  const rv = P.weeklyReview(prof, sessions());
  if (rv.phase !== (prof.phase || 1)) {
    const up = rv.phase > (prof.phase || 1);
    await updateProfile({ phase: rv.phase });
    toast(`${t('phase')} ${rv.phase} · ${t('phaseName' + rv.phase)}${up ? ' ↑' : ' ↓'}`, 3500);
    syncProgress();
    render();
  }
}

function viewHome() {
  const prof = profile();
  weeklyMaybe(); checkRxUpdate();
  const week = P.weekNumber(prof); const phase = prof.phase || 1;
  const prog = P.todaysProgram(prof); const s = todaySession();
  const done = new Set((s?.items || []).map((i) => i.id));
  const nDone = prog.filter((x) => done.has(x.id)).length;
  const pct = prog.length ? Math.round((nDone / prog.length) * 100) : 0;
  const ws = P.weeklyStats(prof, sessions()).slice(-1)[0] || {};
  const next = nextExercise();
  const today = P.todayKey();
  const journal = (state.data.journal || []).find((j) => j.day === today);
  const flare = P.inFlare(prof);
  const appt = appointments(prof).find((a) => a.date >= today);
  const isTrainDay = (prof.days || [1, 3, 5]).includes(new Date().getDay());
  const npi = P.nextPhaseInfo(prof, sessions());
  const path = P.pathologyById(prof.pathology);

  $app.innerHTML = `<section class="screen">${trialBar()}
    <div class="hello"><div class="avatar">${esc((prof.name || '?')[0].toUpperCase())}</div><div class="grow"><span class="eyebrow">${new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</span><div style="font-size:19px;font-weight:700">${t('hello')} ${esc(prof.name)}</div></div>
      <span class="chip" title="${t('streak')}">${icon('flame', 14)} ${P.streak(prof, sessions())}</span></div>

    <div class="card today">
      <div class="row between"><div class="grow"><span class="eyebrow">${t('week')} ${week} · ${t('phase')} ${phase} · ${t('phaseName' + phase)}</span><h3 style="margin-top:6px">${esc(layName(prof.pathology))}</h3></div><div class="big">${pct}<span style="font-size:18px">%</span></div></div>
      <div class="bar pos" style="margin:14px 0"><i style="width:${pct}%"></i></div>
      ${flare ? `<div class="banner neg" style="margin-bottom:12px">${icon('flame', 20)}<div><b>${t('flareOn')}</b><br>${t('flareOnD')} <button class="link" data-a="flareOff">${t('flareEnd')}</button></div></div>` : ''}
      ${next ? `<button class="btn" data-go="#/train/${next.id}">${IC.play.replace('<svg', '<svg width="16" height="16"')} ${nDone ? t('continueSession') : isTrainDay ? t('startSession') : t('startExtra')}</button>` : `<button class="btn soft" disabled>${t('sessionDone')}</button>`}
    </div>

    ${journal ? '' : `<div class="card" style="margin-top:10px"><div class="row between"><b>${t('dailyQ')}</b><span class="small muted">0–10</span></div>
      <div class="seg" style="margin-top:10px">${[0, 2, 4, 6, 8, 10].map((n) => `<button data-jp="${n}">${n}</button>`).join('')}</div></div>`}

    <div class="list" style="margin-top:10px"><div class="kpis">
      <div><b>${ws.sessions ?? 0}<small style="font-size:13px;color:var(--muted)">/${P.plannedPerWeek(prof)}</small></b><span>${t('sessions')}</span></div>
      <div><b>${ws.pain != null ? ws.pain.toFixed(1) : '–'}</b><span>${t('avgPain')}</span></div>
      <div><b>${ws.quality != null ? Math.round(ws.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div></div></div>

    ${prof.rxNotes ? `<h2>${t('fromClinician')}</h2><div class="card"><span class="eyebrow">${esc(prof.clinician || t('yourClinician'))}</span><p style="margin:6px 0 0;white-space:pre-line">${esc(prof.rxNotes)}</p></div>` : ''}
    ${appt ? `<div class="card row" style="margin-top:10px">${icon('cal', 22)}<div class="grow"><b>${t('calAppt')}</b><div class="small muted">${new Date(appt.date + 'T12:00').toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}${appt.time ? ' · ' + esc(appt.time) : ''}${appt.note ? ' · ' + esc(appt.note) : ''}</div></div></div>` : ''}

    <h2>${t('today')}</h2>
    <div class="list">${prog.map((x) => exItem(x, done.has(x.id))).join('')}</div>
    ${!flare ? `<button class="btn ghost" data-a="flare" style="margin-top:10px">${icon('flame', 18)} ${t('flareBtn')}</button>` : ''}

    <h2>${t('nextStep')}</h2><div class="card">${npi.done ? `<span class="small">${t('lastPhase')}</span>` : npi.locked ? `<span class="small">${t('phaseLocked')}</span>` : `
      <div class="small"><b>${t('toReachPhase')} ${npi.phase + 1} · ${t('phaseName' + (npi.phase + 1))}</b></div>
      <ul class="list-plain small">
        <li class="${npi.weeksLeft ? '' : 'pos'}">${npi.weeksLeft ? t('weeksLeft').replace('{n}', npi.weeksLeft) : t('weeksOk')}</li>
        <li class="${npi.sessionsNeeded ? '' : 'pos'}">${npi.sessionsNeeded ? t('sessionsNeeded').replace('{n}', npi.sessionsNeeded) : t('sessionsOk')}</li>
        <li class="${npi.painOk ? 'pos' : 'neg'}">${(npi.painOk ? t('painOk') : t('painHigh')).replace('{m}', npi.painMax)}</li></ul>`}</div>

    ${path?.edu ? `<h2>${t('education')}</h2><div class="card"><ul class="list-plain">${tr(path.edu).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      ${path.avoid ? `<div class="banner" style="margin-top:10px">${icon('shield', 20)}<div><b>${t('avoid')}${t('colon')}</b> ${tr(path.avoid).map(esc).join(' ')}</div></div>` : ''}</div>` : ''}
  </section>${nav('home', navRole())}`;
  mountFigs($app);
  bindTrialBar();
  $app.querySelectorAll('[data-jp]').forEach((b) => (b.onclick = async () => { await store.saveJournal({ day: today, pain: +b.dataset.jp, ts: Date.now() }); state.data = await store.loadData(); toast(t('saved')); render(); }));
  const fl = $app.querySelector('[data-a="flare"]');
  if (fl) fl.onclick = () => {
    const bg = sheet(`<h3>${t('flareTitle')}</h3><p class="muted small" style="margin:6px 0 14px">${t('flareD')}</p>
      <div class="banner" style="margin-bottom:14px">${icon('shield', 20)}<div>${t('flareWarn')}</div></div>
      <button class="btn" id="f2">${t('flare2days')}</button>`);
    bg.querySelector('#f2').onclick = async () => { await updateProfile({ flareUntil: Date.now() + 2 * 86400000 }); bg.remove(); syncProgress(); toast(t('flareSet')); render(); };
  };
  const fo = $app.querySelector('[data-a="flareOff"]');
  if (fo) fo.onclick = async () => { await updateProfile({ flareUntil: 0 }); render(); };
}

// Bandeau « mode test patient » (clinicien)
function trialBar() {
  if (!inTrial()) return '';
  return `<div class="trialbar"><div class="tb-top">${icon('stetho', 20)}<div class="grow"><b>${t('trialOn')}</b>${t('trialOnD')}</div></div><div class="tb-btns"><button data-a="trialBack">${icon('back', 14)} ${t('backToPatients')}</button><button data-a="trialExit">${icon('close', 14)} ${t('trialExit')}</button></div></div>`;
}
function bindTrialBar() {
  const b = $app.querySelector('[data-a="trialBack"]'); if (b) b.onclick = () => go('#/clinic');
  const x = $app.querySelector('[data-a="trialExit"]');
  if (x) x.onclick = async () => { await updateProfile({ pathology: null, plan: null, trial: false, rxNotes: '', clinician: '', nextVisit: null, flareUntil: 0 }); go('#/clinic'); };
}

// ---------- Bibliothèque ----------
function viewLibrary() {
  const L = state.lib; const prof = profile();
  const regionIds = (r) => new Set(PATHOLOGIES.filter((p) => p.region === r).flatMap((p) => Object.values(p.phases).flat()));
  const set = L.region === 'all' ? null : regionIds(L.region);
  const items = Object.entries(EXERCISES).filter(([id, e]) => (!set || set.has(id) || e.region === L.region) && (!L.q || tr(e.name).toLowerCase().includes(L.q.toLowerCase())));
  $app.innerHTML = `<section class="screen">
    <div class="topbar"><h1>${t('library')}</h1><span class="chip">${items.length}</span></div>
    <div class="search">${icon('search', 18)}<input class="input" id="q" placeholder="${t('searchPh')}" value="${esc(L.q)}" aria-label="${t('searchPh')}"></div>
    <div class="pills"><button class="pill ${L.region === 'all' ? 'on' : ''}" data-r="all">${t('allRegions')}</button>${REGIONS.map((r) => `<button class="pill ${L.region === r.id ? 'on' : ''}" data-r="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>
    <div class="list" id="list">${items.map(([id]) => exItem({ id, dose: P.doseFor(id, P.levelOf(prof, id)) })).join('')}</div>
  </section>${nav('library', prof.role)}`;
  mountFigs($app);
  $app.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { L.region = b.dataset.r; viewLibrary(); }));
  const q = $app.querySelector('#q');
  q.oninput = () => { L.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { viewLibrary(); const n = $app.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

// ---------- Détail d'un exercice ----------
function viewExercise(id) {
  const ex = EXERCISES[id]; if (!ex) return go('#/library');
  const prof = profile();
  const level = P.levelOf(prof, id);
  const d = (prof.pathology && P.todaysProgram(prof).find((x) => x.id === id) || {}).dose || P.doseFor(id, level);
  const planes = ex.track ? Object.keys(ex.track.planes) : [];
  const plane = (k) => `<div class="plane ${planes.includes(k) ? '' : 'off'}">${icon(k === 'side' ? 'side' : 'front', 30)}<div><b>${t(k === 'side' ? 'planeSide' : 'planeFront')}</b><small>${t(k === 'side' ? 'planeSideD' : 'planeFrontD')}</small></div></div>`;
  const canTrain = true;
  $app.innerHTML = `<section class="screen">
    <div class="topbar"><button class="icon-btn" data-back aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(tr(ex.name))}</h1></div>
    ${figureBlock(id)}
    <div class="row wrap" style="margin:12px 0 4px;gap:6px"><span class="chip ink">${t('level')} ${level}/5</span><span class="chip">${doseText(d)}</span>${d.tempo ? `<span class="chip">${t('tempo')} ${d.tempo}</span>` : ''}
      ${ex.equip.map((e) => `<span class="chip">${esc(tr(EQUIP[e]))}</span>`).join('')}</div>
    <h2>${t('keyPoints')}</h2><div class="list"><ul class="keylist">${ex.keys.map((k, i) => `<li><span class="n">${i + 1}</span><span>${esc(tr(k))}</span></li>`).join('')}</ul></div>
    <h2>${t('howTo')}</h2><div class="list"><ol class="steplist">${tr(ex.steps).map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol></div>
    <h2>${t('planes')}</h2>${ex.track ? `<div class="planes">${plane('side')}${plane('front')}</div>` : `<div class="card small row">${icon('timer', 22)}<div><b>${t('guided')}</b><br><span class="muted">${t('guidedD')}</span></div></div>`}
    <div style="height:96px"></div>
    ${canTrain ? `<div class="sticky-cta"><div><button class="btn" data-go="#/train/${id}">${ex.track ? icon('cam', 20) + ' ' + t('try') : IC.play.replace('<svg', '<svg width="16" height="16"') + ' ' + t('start')}</button></div></div>` : ''}
  </section>`;
  mountFigs($app);
  $app.querySelector('[data-back]').onclick = () => (history.length > 1 ? history.back() : go('#/home'));
}

// ---------- Progrès ----------
function lineChart(rows, series, { max = 10, h = 150, label = (r) => 'S' + r.week } = {}) {
  const W = 320, H = h, pad = 26, n = rows.length;
  const x = (i) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i * (W - pad - 12)) / (n - 1));
  const y = (v) => H - 20 - (v / max) * (H - 36);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (const gv of [0, max / 2, max]) s += `<line class="ax" x1="${pad}" x2="${W - 8}" y1="${y(gv)}" y2="${y(gv)}"/><text x="4" y="${y(gv) + 3}">${gv}</text>`;
  const every = Math.ceil(n / 8);
  rows.forEach((r, i) => { if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${label(r)}</text>`; });
  for (const se of series) {
    const pts = rows.map((r, i) => [x(i), se.get(r)]).filter((p) => p[1] != null);
    if (pts.length > 1) s += `<polyline points="${pts.map((p) => `${p[0]},${y(p[1])}`).join(' ')}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => (s += `<circle cx="${p[0]}" cy="${y(p[1])}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${i === pts.length - 1 ? se.color : 'var(--surface)'}" stroke="${se.color}" stroke-width="2"/>`));
  }
  return s + '</svg>';
}
function barChart(rows) {
  const W = 320, H = 120, pad = 18, n = Math.max(1, rows.length), bw = Math.min(26, (W - pad * 2) / n - 8);
  const max = Math.max(...rows.map((r) => Math.max(r.sessions, r.planned)), 1);
  const y = (v) => H - 20 - (v / max) * (H - 32);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img"><line class="ax" x1="${pad}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => {
    const cx = pad + ((i + 0.5) * (W - pad * 2)) / n;
    s += `<rect x="${cx - bw / 2}" y="${y(r.planned)}" width="${bw}" height="${y(0) - y(r.planned)}" rx="5" fill="var(--surface-2)"/>`;
    if (r.sessions) s += `<rect x="${cx - bw / 2}" y="${y(Math.min(r.sessions, max))}" width="${bw}" height="${y(0) - y(Math.min(r.sessions, max))}" rx="5" fill="${r.sessions >= r.planned ? 'var(--pos)' : 'var(--ink)'}"/>`;
    s += `<text x="${cx}" y="${H - 4}" text-anchor="middle">S${r.week}</text>`;
  });
  return s + '</svg>';
}

function viewProgress() {
  const prof = profile();
  const rows = P.weeklyStats(prof, sessions()).slice(-8);
  const has = sessions().length > 0;
  const prog = P.todaysProgram(prof);
  const hist = sessions().slice(-10).reverse();
  const j = (state.data.journal || []).slice(-14);
  $app.innerHTML = `<section class="screen"><div class="topbar"><h1>${t('progress')}</h1><span class="chip">${t('week')} ${P.weekNumber(prof)} · ${t('phase')} ${prof.phase || 1}</span></div>
    <button class="btn ghost" data-go="#/report">${icon('doc', 18)} ${t('reportBtn')}</button>
    ${!has ? `<div class="card muted" style="margin-top:12px">${t('noData')}</div>` : `
    <h2>${t('weekly')}</h2><div class="card chart">${lineChart(rows, [
      { get: (r) => r.pain, color: 'var(--neg)' },
      { get: (r) => (r.quality != null ? r.quality * 10 : null), color: 'var(--pos)' },
      { get: (r) => (r.difficulty != null ? r.difficulty * 2 : null), color: 'var(--muted)' },
    ])}<div class="legend"><span><i style="background:var(--neg)"></i>${t('painTrend')} /10</span><span><i style="background:var(--pos)"></i>${t('qualityTrend')} (×10 %)</span><span><i style="background:var(--muted)"></i>${t('difficulty')} (×2)</span></div></div>
    <h2>${t('adherence')}</h2><div class="card chart">${barChart(rows)}</div>
    <h2>${t('weekReport')}</h2><div class="card"><p id="wr" class="muted small" style="margin:0 0 10px">${t('weekReportD')}</p><button class="btn sm ghost" data-a="wr">${icon('spark', 16)} ${t('genReport')}</button></div>`}
    ${j.length > 1 ? `<h2>${t('dailyLog')}</h2><div class="card chart">${lineChart(j, [{ get: (r) => r.pain, color: 'var(--neg)' }], { label: (r) => r.day.slice(8) })}</div>` : ''}
    <h2>${t('levels')}</h2><div class="list">${prog.map((x) => `<div class="toggle"><span class="small"><b>${esc(tr(EXERCISES[x.id].name))}</b></span>${lvlBar(x.level)}</div>`).join('')}</div>
    ${hist.length ? `<h2>${t('history')}</h2><div class="list">${hist.map((s) => `<div class="toggle"><span><b>${new Date(s.date).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}</b><br><small class="muted">${s.items.map((i) => `${esc(tr(EXERCISES[i.id]?.name))} · ${i.pain}/10${i.change > 0 ? ' ↑' : i.change < 0 ? ' ↓' : ''}${i.note ? `<br><span style="color:var(--ink)">« ${esc(i.note)} »</span>` : ''}`).join('<br>')}</small></span></div>`).join('')}</div>` : ''}
  </section>${nav('progress', navRole())}`;
  const b = $app.querySelector('[data-a="wr"]');
  if (b) b.onclick = async () => {
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    const p = $app.querySelector('#wr'); p.textContent = t('thinking');
    const { text } = await coachComment({ kind: 'week', condition: tr(P.pathologyById(prof.pathology).name), week: cur.week, sessions: cur.sessions, planned: cur.planned, pain: cur.pain, quality: cur.quality, painDelta: prev?.pain != null && cur.pain != null ? cur.pain - prev.pain : 0, phase: prof.phase || 1, comments: P.recentNotes(sessions(), 5).map((n) => n.text) });
    p.textContent = text; p.classList.remove('muted'); speakRich(text);
  };
}

function reportText(prof) {
  const s = P.progressSummary(prof, sessions());
  const c = t('colon');
  return [
    `Mobilis — ${t('rptTitle')} (${new Date().toLocaleDateString(locale())})`,
    `${t('rptPatient')}${c} ${prof.name}`,
    `${t('rptCondition')}${c} ${medName(prof.pathology)} (${layName(prof.pathology)})`,
    `${t('rptWeek')} ${s.week} · ${t('phase')} ${s.phase}${s.flare ? ' · ' + t('rptFlare') : ''}`,
    `${t('rptSessions')}${c} ${s.sessions7}/${s.planned}`,
    `${t('rptPain')}${c} ${s.pain7 ?? '–'}/10`,
    `${t('rptQuality')}${c} ${s.quality7 != null ? s.quality7 + ' %' : '–'}`,
    '', t('rptExercises'),
    ...P.todaysProgram(prof).map((x) => `- ${tr(EXERCISES[x.id].name)}${c} ${x.level}/5 (${doseText(x.dose)})`),
    ...(s.notes.length ? ['', t('rptComments'), ...s.notes.map((n) => `- ${new Date(n.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} · ${tr(EXERCISES[n.ex]?.name)}${n.pain != null ? ' · ' + n.pain + '/10' : ''}${c} « ${n.text} »`)] : []),
  ].join('\n');
}
function viewReport() {
  const prof = profile();
  const txt = reportText(prof);
  $app.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('reportTitle')}</h1></div>
    <p class="muted small">${t('reportD')}</p>
    <div class="card"><pre style="white-space:pre-wrap;font:inherit;margin:0;font-size:14px">${esc(txt)}</pre></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="cp">${icon('copy', 18)} ${t('copy')}</button><button class="btn" id="sh">${icon('share', 18)} ${t('share')}</button></div>
    ${prof.rxCode ? `<div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('shareWithClin')}</b><br><small class="muted">${store.isCloud() ? t('shareWithClinD') : t('shareNeedsAccount')}</small></span>${store.isCloud() ? `<button class="switch ${prof.shareProgress ? 'on' : ''}" id="auto" role="switch" aria-checked="${!!prof.shareProgress}"></button>` : ''}</div></div>` : ''}
  </section>${nav('progress', navRole())}`;
  $app.querySelector('#cp').onclick = () => copyText(txt);
  $app.querySelector('#sh').onclick = () => shareText(t('reportTitle'), txt);
  const au = $app.querySelector('#auto');
  if (au) au.onclick = async () => { await updateProfile({ shareProgress: !prof.shareProgress }); syncProgress(); viewReport(); };
}

// ---------- Ajuster mon programme ----------
function viewAdjust() {
  const prof = profile();
  const prog = P.todaysProgram(prof);
  $app.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/profile" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('adjustTitle')}</h1></div>
    <p class="muted small">${prof.lockPhase ? t('adjustLocked') : t('adjustD')}</p>
    <h2>${t('phase')}</h2><div class="seg">${[1, 2, 3].map((n) => `<button data-ph="${n}" class="${(prof.phase || 1) === n ? 'on' : ''}" ${prof.lockPhase ? 'disabled' : ''}>${n} · ${t('phaseName' + n)}</button>`).join('')}</div>
    <h2>${t('levels')}</h2><div class="list">${prog.map((x) => `<div class="toggle"><span class="small"><b>${esc(tr(EXERCISES[x.id].name))}</b><br><span class="muted">${doseText(x.dose)}</span></span>
      <span class="stepper"><button data-lv="${x.id}" data-d="-1" aria-label="-">−</button><b>${P.levelOf(prof, x.id)}</b><button data-lv="${x.id}" data-d="1" aria-label="+">+</button></span></div>`).join('')}</div>
    <div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('changeProblem')}</b><br><small class="muted">${esc(layName(prof.pathology))}</small></span><button class="btn sm ghost" data-a="redo">${t('change')}</button></div>
      <div class="toggle"><span><b>${t('haveCode')}</b><br><small class="muted">${prof.rxCode ? t('linkedTo') + ' ' + store.fmtCode(prof.rxCode) : t('haveCodeD')}</small></span><button class="btn sm ghost" data-go="#/code">${t('enterCode')}</button></div></div>
  </section>${nav('profile', navRole())}`;
  $app.querySelectorAll('[data-ph]').forEach((b) => (b.onclick = async () => { await updateProfile({ phase: +b.dataset.ph }); toast(t('saved')); syncProgress(); viewAdjust(); }));
  $app.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.lv; const v = Math.max(1, Math.min(5, P.levelOf(profile(), id) + +b.dataset.d));
    await updateProfile({ levels: { ...(profile().levels || {}), [id]: v } }); syncProgress(); viewAdjust();
  }));
  $app.querySelector('[data-a="redo"]').onclick = () => { state.ob = null; go('#/onboard'); };
}

// ---------- Profil ----------
function viewProfile() {
  const prof = profile(); const st = store.settings(); const u = state.user;
  const sw = (k, on) => `<button class="switch ${on ? 'on' : ''}" data-sw="${k}" role="switch" aria-checked="${on}"></button>`;
  $app.innerHTML = `<section class="screen">${trialBar()}<div class="topbar"><h1>${t('profile')}</h1></div>
    <div class="card row"><div class="avatar">${esc((prof.name || '?')[0].toUpperCase())}</div><div class="grow"><b>${esc(prof.name)}</b><div class="small muted">${u.local ? t('localMode') : esc(u.email || '')}</div></div>
      <span class="chip">${prof.role === 'clinician' ? t('roleClinician') : t('rolePatient')}</span></div>
    ${prof.pathology ? `<div class="list" style="margin-top:10px"><button class="toggle" data-go="#/adjust" style="width:100%;border:0;background:transparent;text-align:left;color:inherit"><span><b>${t('adjustTitle')}</b><br><small class="muted">${esc(layName(prof.pathology))} · ${t('phase')} ${prof.phase || 1}</small></span>${icon('back', 18, 'style="transform:scaleX(-1)"')}</button></div>` : ''}
    <h2>${t('settings')}</h2><div class="list">
      <div class="toggle"><span>${t('language')}${['fr', 'en'].includes(getLang()) ? '' : `<br><small class="muted">${t('langBeta')}</small>`}</span>${langPicker()}</div>
      <div class="toggle"><span>${t('theme')}</span><div class="seg" style="width:210px">${['auto', 'light', 'dark'].map((v) => `<button data-theme-set="${v}" class="${st.theme === v ? 'on' : ''}">${t('theme_' + v)}</button>`).join('')}</div></div>
      <div class="toggle" style="display:block"><span>${t('voice')}</span><div class="seg" style="margin-top:8px">${['local', 'gemini', 'off'].map((v) => `<button data-voice="${v}" class="${st.voice === v ? 'on' : ''}">${t(v === 'local' ? 'voiceLocal' : v === 'gemini' ? 'voiceGemini' : 'voiceOff')}</button>`).join('')}</div></div>
      <div class="toggle"><span>${t('countAloud')}</span>${sw('countAloud', st.countAloud)}</div>
      <div class="toggle"><span>${t('selfViewSetting')}<br><small class="muted">${t('selfViewSettingD')}</small></span>${sw('selfView', st.selfView !== false)}</div>
      <div class="toggle"><span>${t('anatomyDefault')}</span>${sw('anatomy', st.anatomy)}</div>
    </div>
    <h2>${t('aiCoach')}</h2><div class="card">
      <label class="field"><span>${t('geminiKey')}</span><input class="input" id="gk" type="password" value="${esc(st.geminiKey)}" placeholder="AIza…" autocomplete="off"></label>
      <p class="note" style="margin-top:-6px">${t('geminiKeyD')}</p>
      <div class="toggle" style="padding:12px 0 0"><span><span>${t('sendFrame')}</span><br><small class="muted">${t('sendFrameD')}</small></span>${sw('sendFrame', st.sendFrame)}</div>
    </div>
    <h2>${t('mode')}</h2><div class="list"><div class="toggle"><span><b>${prof.role === 'clinician' ? t('switchToPatient') : t('switchToClin')}</b><br><small class="muted">${t('switchD')}</small></span><button class="btn sm ghost" data-a="role">${t('change')}</button></div></div>
    <h2>${t('about')}</h2><div class="card small"><p style="margin-top:0">${t('aboutD')}</p><p class="muted" style="margin-bottom:0">${t('disclaimer')}</p></div>
    <div class="stack" style="margin-top:16px"><button class="btn ghost" data-a="export">${t('exportData')}</button>
      ${u.local ? `<button class="btn danger" data-a="erase">${t('deleteLocal')}</button>` : ''}
      <button class="btn ghost" data-a="out">${t('signOut')}</button></div>
  </section>${nav('profile', navRole())}`;
  const q = (s) => $app.querySelector(s);
  bindTrialBar();
  $app.querySelectorAll('[data-theme-set]').forEach((b) => (b.onclick = () => { store.saveSettings({ theme: b.dataset.themeSet }); applyTheme(); viewProfile(); }));
  $app.querySelectorAll('[data-voice]').forEach((b) => (b.onclick = () => { store.saveSettings({ voice: b.dataset.voice }); viewProfile(); if (b.dataset.voice !== 'off') speakRich(cueText('good')); }));
  $app.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = () => { const k = b.dataset.sw; store.saveSettings({ [k]: !store.settings()[k] }); viewProfile(); }));
  q('#gk').onchange = () => { store.saveSettings({ geminiKey: q('#gk').value.trim() }); toast(t('saved')); };
  q('[data-a="role"]').onclick = async () => {
    const role = prof.role === 'clinician' ? 'patient' : 'clinician';
    await updateProfile({ role, trial: false });
    go(role === 'clinician' ? '#/clinic' : prof.pathology ? '#/home' : '#/onboard');
  };
  q('[data-a="export"]').onclick = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mobilis-${P.todayKey()}.json`; a.click();
  };
  const er = q('[data-a="erase"]');
  if (er) er.onclick = () => {
    const bg = sheet(`<h3>${t('confirmDelete')}</h3><div class="row" style="margin-top:14px"><button class="btn ghost" id="no">${t('cancel')}</button><button class="btn danger" id="yes">${t('deleteLocal')}</button></div>`);
    bg.querySelector('#no').onclick = () => bg.remove();
    bg.querySelector('#yes').onclick = async () => { store.eraseLocal(); bg.remove(); await store.signOut((u2) => { state.user = u2; state.data = null; }); go('#/'); };
  };
  q('[data-a="out"]').onclick = () => store.signOut((u2) => { state.user = u2; state.data = null; go('#/'); });
}

boot();
