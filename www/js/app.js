import { CONFIG, firebaseEnabled } from './config.js';
import { t, tr, getLang, setLang, CUES } from './i18n.js';
import { EXERCISES, EQUIP } from './data/exercises.js';
import { REGIONS, PATHOLOGIES, RED_FLAGS } from './data/pathologies.js';
import { renderFigure } from './figure.js';
import * as store from './store.js';
import * as P from './program.js';
import { loadPose, detect, toPx, Tracker, drawSkeleton, FAULT_JOINTS, detectPlane, bodyVisible } from './pose.js';
import { speak, cue, cueText, countAloud, coachComment, speakRich, grabFrame } from './coach.js';

const $app = document.getElementById('app');
const state = { user: null, data: null, ob: null, lib: { region: 'all', q: '' } };
let figs = [];
let cleanup = [];

// ---------- Icônes ----------
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const IC = {
  home: I('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  book: I('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h5z"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  play: I('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
  back: I('<path d="M15 18l-6-6 6-6"/>'),
  close: I('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: I('<path d="M20 6 9 17l-5-5"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  flip: I('<path d="M3 7h13l-3-3M21 17H8l3 3"/>'),
  spark: I('<path d="M12 3l1.8 4.8L18.6 9.6l-4.8 1.8L12 16.2l-1.8-4.8L5.4 9.6l4.8-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  side: I('<circle cx="12" cy="5" r="2.2"/><path d="M12 8v6l-2 7M12 14l3 7M12 10l4 2"/>'),
  front: I('<circle cx="12" cy="5" r="2.2"/><path d="M12 8v6M7 11l5-2 5 2M12 14l-3 7M12 14l3 7"/>'),
  shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/>'),
  cam: I('<path d="M3 8h3l2-3h8l2 3h3v12H3z"/><circle cx="12" cy="13" r="4"/>'),
  timer: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  vol: I('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>'),
  logo: '<svg viewBox="0 0 32 32" width="30" height="30"><rect width="32" height="32" rx="10" fill="#fff" fill-opacity=".22"/><circle cx="17" cy="8" r="3" fill="#fff"/><path d="M17 12l-3 7 5 2-2 6M14 19l-5 2M17 13l5 3" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 2600) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), ms);
}
function stopAll() { figs.forEach((f) => f.stop()); figs = []; cleanup.forEach((f) => { try { f(); } catch (_) {} }); cleanup = []; }
function mountFigs(root = document) {
  root.querySelectorAll('svg[data-fig]').forEach((svg) => {
    const ex = EXERCISES[svg.dataset.fig];
    if (!ex) return;
    figs.push(renderFigure(svg, ex.fig, { static: svg.dataset.static === '1', keys: svg.dataset.keys === '1' ? ex.keys : [] }));
  });
}
const figSvg = (id, { stat = false, keys = false } = {}) => `<svg data-fig="${id}" data-static="${stat ? 1 : 0}" data-keys="${keys ? 1 : 0}" role="img" aria-label="${esc(tr(EXERCISES[id].name))}"></svg>`;

// ---------- Démarrage ----------
async function boot() {
  setLang(getLang());
  await store.initAuth(async (u) => {
    state.user = u;
    state.data = u ? await store.loadData() : null;
    render();
  });
}
window.addEventListener('hashchange', render);
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
const profile = () => state.data?.profile;

function render() {
  stopAll();
  const r = location.hash.replace(/^#\/?/, '');
  const [name, arg] = r.split('/');
  if (!state.user) return viewAuth();
  if (!profile()?.pathology || name === 'onboard') return viewOnboard();
  if (name === 'train' && arg) return viewTrain(arg);
  if (name === 'ex' && arg) return viewExercise(arg);
  if (name === 'library') return viewLibrary();
  if (name === 'progress') return viewProgress();
  if (name === 'profile') return viewProfile();
  return viewHome();
}

function nav(active) {
  const b = (id, icon, label) => `<button data-go="#/${id}" class="${active === id ? 'on' : ''}">${icon}<span>${label}</span></button>`;
  return `<nav class="nav"><div class="tabs">${b('home', IC.home, t('home'))}${b('library', IC.book, t('library'))}${b('progress', IC.chart, t('progress'))}${b('profile', IC.user, t('profile'))}</div>
  <button class="fab" data-act="quickstart" aria-label="${t('startSession')}">${IC.play}</button></nav>`;
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); go(g.dataset.go); }
  const a = e.target.closest('[data-act="quickstart"]');
  if (a) { const next = nextExercise(); if (next) go(`#/train/${next.id}`); else go('#/home'); }
});

// ---------- Authentification ----------
function viewAuth() {
  const fbOn = firebaseEnabled();
  $app.innerHTML = `<section class="screen">
    <div class="auth-hero">
      <div class="row"><div class="brand">${IC.logo} ${CONFIG.appName}</div>
        <div class="lang-switch"><button data-lang="fr" class="${getLang() === 'fr' ? 'on' : ''}">FR</button><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button></div></div>
      <h1>${t('heroTitle')}</h1><p>${t('tagline')}</p>
      <svg class="hero-fig" data-fig="squat" data-static="0" data-keys="0" style="--fig-body:#fff;--fig-far:rgba(255,255,255,.5);--fig-joint:#0f8f80;--fig-prop:transparent;--line:transparent;--accent:#ffd2c2"></svg>
      <svg class="waves" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 30 C 80 0, 160 60, 240 30 S 360 10, 400 30 V60 H0Z" fill="var(--bg)" opacity=".55"/><path d="M0 42 C 90 22, 170 62, 260 40 S 360 30, 400 44 V60 H0Z" fill="var(--bg)"/></svg>
    </div>
    <div class="card auth-card stack">
      ${fbOn ? `<button class="btn g-btn" data-a="google"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${t('googleBtn')}</button>
      <div class="divider">${t('or')}</div>
      <label class="field"><span>${t('email')}</span><input class="input" id="em" type="email" autocomplete="email"></label>
      <label class="field"><span>${t('password')}</span><input class="input" id="pw" type="password" autocomplete="current-password" minlength="6"></label>
      <div class="row"><button class="btn" data-a="signin">${t('signIn')}</button><button class="btn ghost" data-a="signup">${t('signUp')}</button></div>
      <p class="err" id="err" hidden></p>
      <div class="divider">${t('or')}</div>` : ''}
      <button class="btn ${fbOn ? 'ghost' : ''}" data-a="local">${fbOn ? t('demoBtn') : t('start')}</button>
      ${fbOn ? '' : `<p class="note">${t('localMode')}</p>`}
    </div>
    <p class="note">${IC.shield.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} ${t('disclaimer')}</p>
  </section>`;
  mountFigs();
  $app.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); render(); }));
  const err = (e) => { const p = $app.querySelector('#err'); if (p) { p.hidden = false; p.textContent = t('authErr') + (e.code || e.message); } };
  $app.querySelector('[data-a="local"]').onclick = () => store.signInLocal(async (u) => { state.user = u; state.data = await store.loadData(); render(); });
  const gb = $app.querySelector('[data-a="google"]');
  if (gb) gb.onclick = () => store.signInGoogle().catch(err);
  const em = () => $app.querySelector('#em').value.trim(), pw = () => $app.querySelector('#pw').value;
  const si = $app.querySelector('[data-a="signin"]'), su = $app.querySelector('[data-a="signup"]');
  if (si) si.onclick = () => store.signInEmail(em(), pw(), false).catch(err);
  if (su) su.onclick = () => store.signInEmail(em(), pw(), true).catch(err);
}

// ---------- Carte du corps ----------
const BODY_DOTS = {
  cervical: [[100, 48]], thoracic: [[100, 74]], shoulder: [[74, 64], [126, 64]], elbow: [[62, 104], [138, 104]],
  wrist: [[54, 140], [146, 140]], lumbar: [[100, 112]], hip: [[86, 136], [114, 136]], knee: [[86, 186], [114, 186]],
  ankle: [[86, 232], [114, 232]], foot: [[80, 248], [120, 248]],
};
function bodyMap(sel) {
  let dots = '';
  for (const [rid, pts] of Object.entries(BODY_DOTS)) for (const [x, y] of pts) {
    if (sel === rid) dots += `<circle class="bm-pulse" cx="${x}" cy="${y}" r="7"/>`;
    dots += `<circle class="bm-dot ${sel === rid ? 'on' : ''}" data-region="${rid}" cx="${x}" cy="${y}" r="7"><title>${esc(tr(REGIONS.find((r) => r.id === rid).name))}</title></circle>`;
  }
  return `<svg class="bodymap" viewBox="0 0 200 262" role="img" aria-label="body map">
    <g class="bm-body"><circle cx="100" cy="26" r="16"/>
    <path d="M76 56 Q100 48 124 56 L132 120 Q100 128 68 120 Z"/>
    <path d="M74 58 Q64 62 62 80 L56 140 Q54 148 50 150 L58 152 L66 102 L76 76Z"/><path d="M126 58 Q136 62 138 80 L144 140 Q146 148 150 150 L142 152 L134 102 L124 76Z"/>
    <path d="M70 120 Q100 130 130 120 L122 186 L118 240 L108 240 L104 150 L96 150 L92 240 L82 240 L78 186Z"/>
    <path d="M80 240 h14 v10 h-18z M106 240 h14 l4 10 h-18z"/></g>${dots}</svg>`;
}

// ---------- Onboarding ----------
function viewOnboard() {
  const prev = profile();
  state.ob = state.ob || { step: 0, name: prev?.name || state.user?.name || '', region: prev?.region || null, pathology: prev?.pathology || null, painBase: prev?.painBase ?? 4, irritability: prev?.irritability || 'med', perWeek: prev?.perWeek || 3, flags: new Set(), noFlag: false };
  const o = state.ob; const N = 6;
  const dots = `<div class="steps-dots">${Array.from({ length: N }, (_, i) => `<i class="${i === o.step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '', canNext = true;
  if (o.step === 0) {
    body = `<h1 class="ob-title">${t('ob1')}</h1><p class="muted">${t('tagline')}</p>
      <label class="field" style="margin-top:20px"><input class="input" id="nm" placeholder="${t('namePh')}" value="${esc(o.name)}" autocomplete="given-name"></label>
      <div class="card"><div class="toggle" style="border:0;padding:0"><b>${t('language')}</b><div class="row">
      <button class="pill ${getLang() === 'fr' ? 'on' : ''}" data-lang="fr">Français</button><button class="pill ${getLang() === 'en' ? 'on' : ''}" data-lang="en">English</button></div></div></div>`;
    canNext = o.name.trim().length > 0;
  } else if (o.step === 1) {
    body = `<h1 class="ob-title">${t('ob2')}</h1><p class="muted">${t('ob2s')}</p>${bodyMap(o.region)}
      <div class="region-grid" style="margin-top:12px">${REGIONS.map((r) => `<button class="region-btn ${o.region === r.id ? 'on' : ''}" data-region="${r.id}"><span class="ic">${esc(tr(r.name).slice(0, 2))}</span>${esc(tr(r.name))}</button>`).join('')}</div>`;
    canNext = !!o.region;
  } else if (o.step === 2) {
    const list = PATHOLOGIES.filter((p) => p.region === o.region);
    body = `<h1 class="ob-title">${t('ob3')}</h1><p class="muted">${t('ob3s')}</p><div style="margin-top:16px">${list.map((p) => `<button class="choice ${o.pathology === p.id ? 'on' : ''}" data-path="${p.id}"><span class="radio"></span><span><b>${esc(tr(p.name))}</b></span></button>`).join('')}</div>`;
    canNext = !!o.pathology && list.some((p) => p.id === o.pathology);
  } else if (o.step === 3) {
    const irr = (k, d) => `<button class="choice ${o.irritability === k ? 'on' : ''}" data-irr="${k}"><span class="radio"></span><span><b>${t(d)}</b><small>${t(d + 'D')}</small></span></button>`;
    body = `<h1 class="ob-title">${t('ob4')}</h1>
      <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><b>${t('painNow')}</b><span class="bignum" id="pv">${o.painBase}</span></div>
      <input type="range" min="0" max="10" step="1" value="${o.painBase}" id="pain"><div class="scale"><span>0</span><span>5</span><span>10</span></div></div>
      <h2>${t('irritability')}</h2>${irr('low', 'irrLow')}${irr('med', 'irrMed')}${irr('high', 'irrHigh')}
      <h2>${t('freq')}</h2><div class="seg">${[2, 3, 4, 5, 6].map((n) => `<button data-freq="${n}" class="${o.perWeek === n ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  } else if (o.step === 4) {
    body = `<h1 class="ob-title">${t('ob5')}</h1><p class="muted">${t('ob5s')}</p><div style="margin-top:14px">
      ${RED_FLAGS.map((f, i) => `<button class="choice danger ${o.flags.has(i) ? 'on' : ''}" data-flag="${i}"><span class="radio"></span><span>${esc(tr(f))}</span></button>`).join('')}
      <button class="choice ${o.noFlag ? 'on' : ''}" data-noflag="1"><span class="radio"></span><span><b>${t('none')}</b></span></button></div>
      ${o.flags.size ? `<div class="banner" style="margin-top:14px">${IC.shield.replace('<svg', '<svg width="22" height="22" style="flex:none;color:#c24e2c"')}<div><b>${t('rfStop')}</b><br>${t('rfStopD')}</div></div>` : ''}`;
    canNext = o.noFlag && !o.flags.size;
  } else {
    const tmp = { pathology: o.pathology, irritability: o.irritability, phase: 1, levels: {} };
    const prog = P.todaysProgram(tmp); const path = P.pathologyById(o.pathology);
    body = `<h1 class="ob-title">${t('ob6')}</h1><p class="muted">${t('ob6s')}</p>
      <div class="card hero" style="margin:16px 0"><span class="chip">${t('phase')} 1 · ${t('phaseName1')}</span><h3>${esc(tr(path.name))}</h3><p>${prog.length} ${t('exercises').toLowerCase()} · ${o.perWeek}× / ${t('week').toLowerCase()}</p></div>
      ${prog.map((x) => exItem(x)).join('')}`;
  }
  $app.innerHTML = `<section class="screen">
    <div class="topbar">${o.step > 0 ? `<button class="icon-btn" data-ob="back" aria-label="${t('back')}">${IC.back}</button>` : '<span></span>'}<h1></h1>${prev?.pathology ? `<button class="icon-btn" data-ob="cancel">${IC.close}</button>` : ''}</div>
    ${dots}${body}
    <div class="sticky-cta"><div><button class="btn" data-ob="next" ${canNext ? '' : 'disabled'}>${o.step === N - 1 ? t('start') : t('next')}</button></div></div>
    <div style="height:80px"></div></section>`;
  mountFigs();
  const q = (s) => $app.querySelector(s), qa = (s) => $app.querySelectorAll(s);
  const rr = () => viewOnboard();
  q('[data-ob="next"]').onclick = async () => {
    if (o.step < N - 1) { o.step++; return rr(); }
    const prof = {
      ...(prev || {}), name: o.name.trim(), region: o.region, pathology: o.pathology, painBase: o.painBase, irritability: o.irritability, perWeek: o.perWeek,
      startDate: prev?.pathology === o.pathology ? prev.startDate : Date.now(), phase: prev?.pathology === o.pathology ? prev.phase : 1,
      levels: prev?.pathology === o.pathology ? prev.levels : {}, lang: getLang(),
    };
    await store.saveProfile(prof); state.data = await store.loadData(); state.ob = null;
    location.hash = '#/home'; render();
  };
  const back = q('[data-ob="back"]'); if (back) back.onclick = () => { o.step--; rr(); };
  const cancel = q('[data-ob="cancel"]'); if (cancel) cancel.onclick = () => { state.ob = null; go('#/home'); };
  const nm = q('#nm'); if (nm) nm.oninput = () => { o.name = nm.value; q('[data-ob="next"]').disabled = !nm.value.trim(); };
  qa('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); rr(); }));
  qa('[data-region]').forEach((b) => (b.onclick = () => { if (o.region !== b.dataset.region) o.pathology = null; o.region = b.dataset.region; rr(); }));
  qa('[data-path]').forEach((b) => (b.onclick = () => { o.pathology = b.dataset.path; rr(); }));
  qa('[data-irr]').forEach((b) => (b.onclick = () => { o.irritability = b.dataset.irr; rr(); }));
  qa('[data-freq]').forEach((b) => (b.onclick = () => { o.perWeek = +b.dataset.freq; rr(); }));
  qa('[data-flag]').forEach((b) => (b.onclick = () => { const i = +b.dataset.flag; o.flags.has(i) ? o.flags.delete(i) : o.flags.add(i); o.noFlag = false; rr(); }));
  qa('[data-noflag]').forEach((b) => (b.onclick = () => { o.flags.clear(); o.noFlag = true; rr(); }));
  const pain = q('#pain'); if (pain) pain.oninput = () => { o.painBase = +pain.value; q('#pv').textContent = pain.value; };
}

// ---------- Séance du jour ----------
function todaySession(create = false) {
  const s = state.data.sessions.find((x) => P.todayKey(x.date) === P.todayKey());
  if (s || !create) return s;
  const ns = { id: 's' + Date.now(), date: Date.now(), items: [], checkin: null };
  return ns;
}
function nextExercise() {
  if (!profile()) return null;
  const prog = P.todaysProgram(profile());
  const s = todaySession();
  const done = new Set((s?.items || []).map((i) => i.id));
  return prog.find((x) => !done.has(x.id)) || null;
}
function doseText(d) {
  if (d.type === 'hold') return `${d.sets > 1 ? d.sets + ' × ' : ''}${d.reps > 1 ? d.reps + ' × ' : ''}${d.hold} ${t('sec')}`;
  return `${d.sets} × ${d.reps}${d.holdTop ? ` · ${t('hold')} ${d.holdTop} ${t('sec')}` : ''}`;
}
function exItem(x, done = false) {
  const ex = EXERCISES[x.id];
  return `<button class="ex-item" data-go="#/ex/${x.id}"><span class="ex-thumb">${figSvg(x.id, { stat: true })}</span>
    <span class="meta"><b>${esc(tr(ex.name))}</b><small>${doseText(x.dose)} · ${ex.track ? t('tracked') : t('guided').split(' (')[0]}</small></span>
    <span class="check ${done ? 'on' : ''}">${done ? IC.check : ''}</span></button>`;
}

async function weeklyMaybe() {
  const prof = profile();
  const rv = P.weeklyReview(prof, state.data.sessions);
  if (rv.phase !== (prof.phase || 1)) {
    const up = rv.phase > (prof.phase || 1);
    await store.saveProfile({ ...prof, phase: rv.phase });
    toast(`${t('phase')} ${rv.phase} · ${t('phaseName' + rv.phase)}${up ? ' ↑' : ''}`);
  }
}

function viewHome() {
  weeklyMaybe();
  const prof = profile(); const path = P.pathologyById(prof.pathology);
  const week = P.weekNumber(prof); const phase = prof.phase || 1;
  const prog = P.todaysProgram(prof); const s = todaySession();
  const done = new Set((s?.items || []).map((i) => i.id));
  const pct = prog.length ? Math.round((prog.filter((x) => done.has(x.id)).length / prog.length) * 100) : 0;
  const ws = P.weeklyStats(prof, state.data.sessions).slice(-1)[0] || {};
  const next = nextExercise();
  $app.innerHTML = `<section class="screen">
    <div class="hello"><div class="avatar">${esc((prof.name || '?')[0].toUpperCase())}</div><div><small>${t('hello')},</small><b>${esc(prof.name)}</b></div><span class="spacer"></span>
      <span class="chip">${t('week')} ${week}</span></div>
    <div class="card hero">
      <div class="row" style="justify-content:space-between;position:relative;z-index:1"><span class="chip">${t('phase')} ${phase} · ${t('phaseName' + phase)}</span><span style="font-weight:800">${pct}%</span></div>
      <h3 style="position:relative;z-index:1">${esc(tr(path.name))}</h3>
      <p style="position:relative;z-index:1">${t('today')} · ${prog.length} ${t('exercises').toLowerCase()}</p>
      <div class="bar" style="position:relative;z-index:1"><i style="width:${pct}%"></i></div>
      <div style="margin-top:16px">${next ? `<button class="btn light" data-go="#/train/${next.id}">${IC.play.replace('<svg', '<svg width="18" height="18"')} ${s?.items?.length ? t('continueSession') : t('startSession')}</button>` : `<button class="btn light" disabled>${t('sessionDone')}</button>`}</div>
    </div>
    <h2>${t('thisWeek')}</h2>
    <div class="stats">
      <div class="stat"><b>${ws.sessions ?? 0}<small style="font-size:13px;color:var(--muted)">/${prof.perWeek || 3}</small></b><span>${t('sessions')}</span></div>
      <div class="stat"><b>${ws.pain != null ? ws.pain.toFixed(1) : '–'}</b><span>${t('avgPain')}</span></div>
      <div class="stat"><b>${ws.quality != null ? Math.round(ws.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div>
    </div>
    <h2>${t('today')}</h2>
    ${prog.map((x) => exItem(x, done.has(x.id))).join('')}
    ${path.edu ? `<h2>${t('education')}</h2><div class="card"><ul class="list-plain">${tr(path.edu).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      ${path.avoid ? `<div class="banner" style="margin-top:10px"><div><b>${t('avoid')}${getLang() === 'fr' ? ' :' : ':'}</b> ${tr(path.avoid).map(esc).join(' ')}</div></div>` : ''}</div>` : ''}
  </section>${nav('home')}`;
  mountFigs();
}

// ---------- Bibliothèque ----------
function viewLibrary() {
  const L = state.lib;
  const prof = profile();
  const items = Object.entries(EXERCISES).filter(([id, e]) => (L.region === 'all' || e.region === L.region || PATHOLOGIES.some((p) => p.region === L.region && Object.values(p.phases).flat().includes(id)))
    && (!L.q || tr(e.name).toLowerCase().includes(L.q.toLowerCase())));
  const paths = L.region === 'all' ? [] : PATHOLOGIES.filter((p) => p.region === L.region);
  $app.innerHTML = `<section class="screen">
    <div class="topbar"><h1>${t('library')}</h1><span class="chip ghost">${Object.keys(EXERCISES).length}</span></div>
    <div class="search">${IC.search}<input class="input" id="q" placeholder="${t('searchPh')}" value="${esc(L.q)}"></div>
    <div class="pills"><button class="pill ${L.region === 'all' ? 'on' : ''}" data-r="all">${t('allRegions')}</button>${REGIONS.map((r) => `<button class="pill ${L.region === r.id ? 'on' : ''}" data-r="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>
    ${paths.length ? `<div class="card" style="margin:6px 0 14px"><b class="small muted">${t('ob3')}</b><ul class="list-plain small">${paths.map((p) => `<li>${esc(tr(p.name))}</li>`).join('')}</ul></div>` : ''}
    <div id="list">${items.map(([id]) => exItem({ id, dose: P.doseFor(id, prof.levels?.[id] ?? P.startLevel(prof.irritability)) })).join('')}</div>
  </section>${nav('library')}`;
  mountFigs();
  $app.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { L.region = b.dataset.r; viewLibrary(); }));
  const q = $app.querySelector('#q');
  q.oninput = () => { L.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { viewLibrary(); const n = $app.querySelector('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

// ---------- Détail d'un exercice ----------
function viewExercise(id) {
  const ex = EXERCISES[id]; if (!ex) return go('#/library');
  const prof = profile();
  const level = prof.levels?.[id] ?? P.startLevel(prof.irritability);
  const d = P.doseFor(id, level);
  const planes = ex.track ? Object.keys(ex.track.planes) : [];
  const plane = (k) => `<div class="plane ${planes.includes(k) ? 'on' : 'off'}">${k === 'side' ? IC.side : IC.front}<div><b>${t(k === 'side' ? 'planeSide' : 'planeFront')}</b><small>${t(k === 'side' ? 'planeSideD' : 'planeFrontD')}</small></div></div>`;
  $app.innerHTML = `<section class="screen">
    <div class="topbar"><button class="icon-btn" onclick="history.back()" aria-label="${t('back')}">${IC.back}</button><h1>${esc(tr(ex.name))}</h1></div>
    <div class="fig-wrap">${ex.caption ? `<span class="chip cap">${esc(tr(ex.caption))}</span>` : ''}${figSvg(id, { keys: true })}</div>
    <div class="dose"><span class="chip">${t('level')} ${level}/5</span><span class="chip">${doseText(d)}</span>${d.tempo ? `<span class="chip ghost">${t('tempo')} ${d.tempo}</span>` : ''}
      ${ex.equip.map((e) => `<span class="chip ghost">${esc(tr(EQUIP[e]))}</span>`).join('')}</div>
    <h2>${t('keyPoints')}</h2><div class="card"><ul class="keylist">${ex.keys.map((k, i) => `<li><span class="n">${i + 1}</span><span>${esc(tr(k))}</span></li>`).join('')}</ul></div>
    <h2>${t('howTo')}</h2><div class="card"><ol class="steplist">${tr(ex.steps).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <h2>${t('planes')}</h2>${ex.track ? `<div class="planes">${plane('side')}${plane('front')}</div>` : `<div class="card small">${IC.timer.replace('<svg', '<svg width="18" height="18" style="vertical-align:-4px;color:var(--primary)"')} <b>${t('guided')}</b><br><span class="muted">${t('guidedD')}</span></div>`}
    <div style="height:90px"></div>
    <div class="sticky-cta"><div><button class="btn" data-go="#/train/${id}">${ex.track ? IC.cam.replace('<svg', '<svg width="20" height="20"') + ' ' + t('try') : IC.play.replace('<svg', '<svg width="18" height="18"') + ' ' + t('start')}</button></div></div>
  </section>`;
  mountFigs();
}

// ---------- Entraînement (caméra ou guidé) ----------
function viewTrain(id) {
  const ex = EXERCISES[id]; if (!ex) return go('#/home');
  const prof = profile();
  const level = prof.levels?.[id] ?? P.startLevel(prof.irritability);
  const dose = P.doseFor(id, level);
  const path = P.pathologyById(prof.pathology);
  const planes = ex.track ? Object.keys(ex.track.planes) : [];
  const totalSets = dose.type === 'hold' ? dose.sets * (dose.reps || 1) : dose.sets;
  const T = { set: 0, sets: [], stream: null, video: null, raf: 0, tracker: null, mode: ex.track ? 'camera' : 'guided', facing: store.settings().camera, active: false, guidedTimer: null };
  const planeFor = (i) => planes[i % planes.length];
  const holdTarget = dose.type === 'hold' ? dose.hold : 0;

  const root = document.createElement('div');
  root.className = 'train';
  root.innerHTML = `<div class="stage"><video playsinline muted></video><canvas class="overlay"></canvas>
    <div class="hud-top"><button class="icon-btn" data-t="close" aria-label="${t('close')}">${IC.close}</button>
      <div class="hud-title"><b>${esc(tr(ex.name))}</b><small id="setlbl"></small><div id="pbadge"></div></div>
      <button class="icon-btn" data-t="flip" aria-label="${t('camSwitch')}">${IC.flip}</button></div>
    <div class="depth" hidden><i style="height:0"></i></div>
    <div class="counter" hidden><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.2)" stroke-width="8" fill="none"/><circle id="ring" cx="50" cy="50" r="44" stroke="#2ee6c8" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><div class="val"><div><b id="cnt">0</b><small id="cntlbl"></small></div></div></div>
    <div class="mini-fig" hidden>${figSvg(id)}</div>
    <div class="cue" hidden><span></span></div>
    <div class="center-msg" hidden></div>
    <div class="setup" hidden></div></div>
    <div class="bottom"><button class="btn ghost" data-t="guided" style="background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.15)">${t('doGuided')}</button><button class="btn" data-t="end" hidden>${t('endSet')}</button></div>`;
  document.body.appendChild(root);
  $app.innerHTML = '';
  const $ = (s) => root.querySelector(s);
  const video = $('video'), canvas = $('canvas.overlay'), g = canvas.getContext('2d');
  mountFigs(root);

  function close() {
    T.active = false; cancelAnimationFrame(T.raf); clearInterval(T.guidedTimer);
    if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop());
    try { speechSynthesis.cancel(); } catch (_) {}
    root.remove();
  }
  cleanup.push(close);
  $('[data-t="close"]').onclick = () => go('#/home');

  function setLabel() {
    $('#setlbl').textContent = `${t('set')} ${T.set + 1} ${t('of')} ${totalSets} · ${doseText(dose)}`;
    if (T.mode === 'camera') {
      const pl = planeFor(T.set);
      $('#pbadge').innerHTML = `<span class="plane-badge">${pl === 'side' ? IC.side.replace('<svg', '<svg width="14" height="14"') : IC.front.replace('<svg', '<svg width="14" height="14"')} ${t(pl === 'side' ? 'planeSide' : 'planeFront')} · ${t(pl === 'side' ? 'planeSideD' : 'planeFrontD')}</span>`;
    } else $('#pbadge').innerHTML = '';
  }
  function showCue(text, bad) { const c = $('.cue'); c.hidden = !text; c.querySelector('span').textContent = text || ''; c.querySelector('span').className = bad ? 'bad' : ''; }
  function center(html) { const c = $('.center-msg'); c.hidden = !html; c.innerHTML = html || ''; }

  // ----- Préparation de la série -----
  function setup() {
    setLabel(); showCue(''); center('');
    $('[data-t="end"]').hidden = true;
    $('.counter').hidden = true; $('.depth').hidden = true; $('.mini-fig').hidden = true;
    const s = $('.setup'); s.hidden = false;
    if (T.mode === 'camera') {
      const pl = planeFor(T.set);
      s.innerHTML = `<h3>${t('setupTitle')}</h3><p class="small">${t(pl === 'side' ? 'setupSide' : 'setupFront')}</p>
        <div class="fig-wrap">${figSvg(id)}</div><p class="small muted">${t('setupTip')}</p>
        <button class="btn" data-t="go">${IC.cam.replace('<svg', '<svg width="20" height="20"')} ${t('camStart')}</button>`;
      $('[data-t="guided"]').hidden = false;
    } else {
      s.innerHTML = `<h3>${esc(tr(ex.name))}</h3><div class="fig-wrap">${figSvg(id, { keys: true })}</div>
        <ol class="steplist small">${tr(ex.steps).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <button class="btn" data-t="go">${IC.play.replace('<svg', '<svg width="18" height="18"')} ${t('start')}</button>`;
      $('[data-t="guided"]').hidden = true;
    }
    mountFigs(s);
    s.querySelector('[data-t="go"]').onclick = () => (T.mode === 'camera' ? startCamera() : startGuided());
  }
  $('[data-t="guided"]').onclick = () => { T.mode = 'guided'; if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop()); T.stream = null; video.srcObject = null; setup(); };
  $('[data-t="flip"]').onclick = async () => {
    T.facing = T.facing === 'user' ? 'environment' : 'user'; store.saveSettings({ camera: T.facing });
    if (T.stream) { T.stream.getTracks().forEach((tk) => tk.stop()); T.stream = null; await openCam(); }
  };

  async function openCam() {
    T.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: T.facing, width: { ideal: 960 }, height: { ideal: 720 } } });
    video.srcObject = T.stream; await video.play();
    video.classList.toggle('mirror', T.facing === 'user');
  }

  async function startCamera() {
    $('.setup').hidden = true; center(`<div><div class="spinner"></div>${t('loadingModel')}</div>`);
    try {
      if (!T.stream) await openCam();
      await loadPose();
    } catch (e) {
      console.error(e); center(''); toast(e && e.name === 'NotAllowedError' ? t('camDenied') : t('modelErr'), 4500);
      T.mode = 'guided'; return setup();
    }
    // Compte à rebours
    for (const n of [3, 2, 1]) { center(`<div class="big">${n}</div>`); speak(String(n), { interrupt: true }); await sleep(900); }
    center(''); speak(cueText('go'));
    runSet();
  }

  function runSet() {
    const pl = planeFor(T.set);
    const recentFaults = new Map();
    T.frame = null;
    T.tracker = new Tracker(ex, pl, {
      romFactor: dose.romFactor,
      onCue: (k) => { if (cue(k)) { showCue(cueText(k), true); recentFaults.set(k, performance.now()); setTimeout(() => showCue(''), 2200); } },
      onRep: (rep) => {
        countAloud(T.tracker.reps);
        if (rep.full && !rep.faults.length && T.tracker.full % 3 === 0) cue('great');
        if (dose.type !== 'hold' && T.tracker.reps === dose.reps - 1) setTimeout(() => cue('lastRep'), 600);
        if (store.settings().sendFrame && (!T.frame || rep.faults.length)) T.frame = grabFrame(video, T.facing === 'user');
        if (dose.type !== 'hold' && T.tracker.reps >= dose.reps) setTimeout(endSet, 900);
      },
    });
    $('.counter').hidden = false; $('.depth').hidden = dose.type === 'hold'; $('.mini-fig').hidden = false;
    $('[data-t="end"]').hidden = false; $('[data-t="guided"]').hidden = true;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    T.active = true;
    let lastWarn = 0;
    const loop = () => {
      if (!T.active) return;
      const now = performance.now();
      const lm = detect(video, now);
      const W = canvas.width = canvas.clientWidth * devicePixelRatio, H = canvas.height = canvas.clientHeight * devicePixelRatio;
      // l'image vidéo est en « cover » : on projette les points dans le même cadre
      const fj = new Set();
      for (const [k, ts] of recentFaults) if (now - ts < 1500) (FAULT_JOINTS[k] || []).forEach((j) => fj.add(j));
      if (lm) {
        const vw = video.videoWidth, vh = video.videoHeight;
        const sc = Math.max(W / vw, H / vh), ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
        const proj = lm.map((l) => ({ x: (l.x * vw * sc + ox) / W, y: (l.y * vh * sc + oy) / H, visibility: l.visibility }));
        drawSkeleton(g, proj, W, H, fj, T.facing === 'user');
        const p = toPx(lm, vw, vh);
        if (!bodyVisible(p)) { if (now - lastWarn > 3000) { lastWarn = now; cue('notVisible'); showCue(t('notVisible'), true); } }
        else {
          const dp = detectPlane(p);
          if (dp && dp !== 'between' && dp !== pl && ['side', 'front'].includes(dp) && !T.tracker.calibrated) {
            if (now - lastWarn > 3500) { lastWarn = now; const k = pl === 'side' ? 'turnSide' : 'turnFront'; cue(k); showCue(t(k), true); }
          } else {
            const st = T.tracker.update(p, now);
            if (st.phase === 'calibrating') showCue(t('calibrating'));
            else if ($('.cue span').textContent === t('calibrating')) showCue('');
            if (dose.type === 'hold') {
              $('#cnt').textContent = Math.floor(st.holdSec || 0);
              $('#ring').style.strokeDashoffset = 276.5 * (1 - Math.min(1, (st.holdSec || 0) / holdTarget));
              if ((st.holdSec || 0) >= holdTarget) { endSet(); return; }
            } else {
              $('#cnt').textContent = st.reps || 0;
              $('#ring').style.strokeDashoffset = 276.5 * (1 - Math.min(1, (st.reps || 0) / dose.reps));
              $('.depth i').style.height = `${Math.round((st.progress || 0) * 100)}%`;
            }
          }
        }
      } else g.clearRect(0, 0, W, H);
      T.raf = requestAnimationFrame(loop);
    };
    T.raf = requestAnimationFrame(loop);
  }
  $('[data-t="end"]').onclick = () => (T.mode === 'camera' ? endSet() : endGuided());

  async function endSet() {
    if (!T.active) return;
    T.active = false; cancelAnimationFrame(T.raf); g.clearRect(0, 0, canvas.width, canvas.height); showCue('');
    const sum = T.tracker.summary();
    const pl = planeFor(T.set);
    T.sets.push({ plane: pl, ...sum, reps_detail: undefined });
    speak(cueText('setDone'), { interrupt: true });
    summarySheet({ ...sum, plane: pl });
  }

  // ----- Mode guidé (voix + minuterie) -----
  function startGuided() {
    $('.setup').hidden = true; $('.counter').hidden = false; $('[data-t="end"]').hidden = false; $('[data-t="guided"]').hidden = true;
    center(`<div style="width:min(340px,90vw)" class="fig-wrap">${figSvg(id, { keys: true })}</div>`); mountFigs(root.querySelector('.center-msg'));
    T.active = true;
    const tempo = (dose.tempo || '2-1-2').split('-').map(Number);
    const repSec = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (dose.holdTop || 0));
    let el = 0, reps = 0;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    speak(cueText('go'));
    T.guidedTimer = setInterval(() => {
      el++;
      if (dose.type === 'hold') {
        $('#cnt').textContent = el; $('#ring').style.strokeDashoffset = 276.5 * (1 - Math.min(1, el / holdTarget));
        const left = holdTarget - el;
        if ([10, 5, 3, 2, 1].includes(left)) speak(String(left), { interrupt: true });
        if (el >= holdTarget) endGuided();
      } else if (el % repSec === 0) {
        reps++; countAloud(reps); $('#cnt').textContent = reps;
        $('#ring').style.strokeDashoffset = 276.5 * (1 - Math.min(1, reps / dose.reps));
        if (reps >= dose.reps) endGuided();
      }
    }, 1000);
    T.guidedEl = () => ({ el, reps });
  }
  function endGuided() {
    if (!T.active) return;
    T.active = false; clearInterval(T.guidedTimer); center('');
    const { el, reps } = T.guidedEl();
    const sum = dose.type === 'hold' ? { mode: 'hold', holdSec: el, reps: 0, full: 0, partial: 0, quality: null, faults: {} } : { mode: 'reps', reps, full: reps, partial: 0, quality: null, faults: {} };
    T.sets.push({ plane: 'guided', ...sum });
    speak(cueText('setDone'), { interrupt: true });
    summarySheet({ ...sum, plane: 'guided' });
  }

  // ----- Résumé de série + commentaire du coach -----
  function summarySheet(sum) {
    const last = T.set + 1 >= totalSets;
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    const faults = Object.entries(sum.faults || {}).sort((a, b) => b[1] - a[1]);
    bg.innerHTML = `<div class="sheet"><div class="grab"></div><h3>${t('setSummary')} · ${t('set')} ${T.set + 1}/${totalSets}</h3>
      <div class="stats" style="margin:12px 0">${sum.mode === 'hold'
        ? `<div class="stat"><b>${sum.holdSec}s</b><span>${t('holdTime')}</span></div>`
        : `<div class="stat"><b>${sum.full}</b><span>${t('fullReps')}</span></div><div class="stat"><b>${sum.partial}</b><span>${t('partialReps')}</span></div>`}
        <div class="stat"><b>${sum.quality != null ? Math.round(sum.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div></div>
      ${faults.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:12px">${faults.slice(0, 3).map(([k]) => `<span class="chip accent">${esc(cueText(k))}</span>`).join('')}</div>` : ''}
      <div class="coach-box"><span class="ai">${IC.spark}</span><div><b class="small">${t('coachSays')}</b><p id="coachtxt" class="muted">${t('thinking')}</p></div></div>
      <div class="row" style="margin-top:16px">${last ? `<button class="btn" data-s="finish">${t('finishEx')}</button>` : `<button class="btn ghost" data-s="finish">${t('finishEx')}</button><button class="btn" data-s="next">${t('nextSet')}</button>`}</div></div>`;
    root.appendChild(bg);
    const data = {
      kind: 'set', exercise: tr(ex.name), condition: tr(path.name), plane: sum.plane, level, target: dose.type === 'hold' ? `${holdTarget}s` : dose.reps,
      mode: sum.mode, reps: sum.reps, full: sum.full, partial: sum.partial, holdSec: sum.holdSec, quality: sum.quality, faults: Object.fromEntries(faults.map(([k, v]) => [cueText(k), Math.round(v)])),
      painLimit: path.painMax, set: T.set + 1, totalSets,
    };
    data.faults = Object.fromEntries(faults.map(([k, v]) => [k, Math.round(v)]));
    coachComment(data, store.settings().sendFrame ? T.frame : null).then(({ text }) => {
      const p = bg.querySelector('#coachtxt'); if (p) { p.textContent = text; p.classList.remove('muted'); }
      speakRich(text);
    });
    bg.querySelector('[data-s="finish"]').onclick = () => { bg.remove(); feedbackSheet(); };
    const nx = bg.querySelector('[data-s="next"]');
    if (nx) nx.onclick = () => { bg.remove(); T.set++; if (T.mode === 'camera') { setup(); } else setup(); };
  }

  // ----- Rétroaction du patient + ajustement du niveau -----
  async function feedbackSheet() {
    const sessions = state.data.sessions;
    let sess = todaySession(true);
    const needCheckin = !sess.checkin && !sess.items.length && sessions.length > 0;
    const fb = { pain: Math.min(prof.painBase ?? 2, path.painMax), difficulty: 3, checkin: sess.checkin };
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    const draw = () => {
      bg.innerHTML = `<div class="sheet"><div class="grab"></div><h3>${t('feedbackTitle')}</h3>
        ${needCheckin ? `<div class="card" style="margin:12px 0"><b class="small">${t('checkinTitle')}</b><p class="small muted" style="margin:2px 0 8px">${t('checkinQ')}</p>
          <div class="seg" style="grid-template-columns:repeat(3,1fr)">${['better', 'same', 'worse'].map((k) => `<button data-ci="${k}" class="${fb.checkin === k ? 'on' : ''}">${t(k)}</button>`).join('')}</div></div>` : ''}
        <div class="card" style="margin:12px 0"><div class="row" style="justify-content:space-between"><b>${t('painDuring')}</b><span class="bignum" id="pv" style="color:${fb.pain > path.painMax ? 'var(--accent)' : 'var(--primary)'}">${fb.pain}</span></div>
        <input type="range" min="0" max="10" value="${fb.pain}" id="pain"><div class="scale"><span>0</span><span>${t('limit')} ${path.painMax}</span><span>10</span></div>
        <div id="pw" class="banner" style="margin-top:8px" ${fb.pain > path.painMax ? '' : 'hidden'}>${t('painStop')}</div></div>
        <b>${t('difficulty')}</b><div class="seg" style="margin:8px 0 16px">${[1, 2, 3, 4, 5].map((n) => `<button data-df="${n}" class="${fb.difficulty === n ? 'on' : ''}">${t('d' + n)}</button>`).join('')}</div>
        <button class="btn" data-s="save" ${needCheckin && !fb.checkin ? 'disabled' : ''}>${t('save')}</button></div>`;
      bg.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = () => { fb.checkin = b.dataset.ci; draw(); }));
      bg.querySelectorAll('[data-df]').forEach((b) => (b.onclick = () => { fb.difficulty = +b.dataset.df; draw(); }));
      const r = bg.querySelector('#pain');
      r.oninput = () => { fb.pain = +r.value; const pv = bg.querySelector('#pv'); pv.textContent = r.value; pv.style.color = fb.pain > path.painMax ? 'var(--accent)' : 'var(--primary)'; bg.querySelector('#pw').hidden = fb.pain <= path.painMax; };
      bg.querySelector('[data-s="save"]').onclick = save;
    };
    async function save() {
      const item = { id, level, sets: T.sets, pain: fb.pain, difficulty: fb.difficulty };
      if (needCheckin) sess.checkin = fb.checkin;
      const adj = P.adjustLevel(prof, item, sessions, sess.checkin);
      item.change = adj.change;
      sess.items = sess.items.filter((i) => i.id !== id).concat(item);
      await store.saveSession(sess);
      const np = { ...prof, levels: { ...(prof.levels || {}), [id]: adj.level } };
      await store.saveProfile(np);
      state.data = await store.loadData();
      toast(adj.change > 0 ? `${t('lvlUp')} ${adj.level} ↑` : adj.change < 0 ? `${t('lvlDown')} ${adj.level}` : `${t('lvlSame')} ${adj.level}`);
      bg.remove();
      const nxt = nextExercise();
      go(nxt ? `#/ex/${nxt.id}` : '#/home');
    }
    draw(); root.appendChild(bg);
  }

  setup();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Progrès ----------
function lineChart(rows, series, { max = 10, h = 150 } = {}) {
  const W = 320, H = h, pad = 26, n = rows.length;
  const x = (i) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i * (W - pad * 2)) / (n - 1));
  const y = (v) => H - 20 - (v / max) * (H - 36);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (const gv of [0, max / 2, max]) s += `<line class="ax" x1="${pad}" x2="${W - 8}" y1="${y(gv)}" y2="${y(gv)}"/><text x="2" y="${y(gv) + 3}">${gv}</text>`;
  rows.forEach((r, i) => (s += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">S${r.week}</text>`));
  for (const se of series) {
    const pts = rows.map((r, i) => [x(i), se.get(r)]).filter((p) => p[1] != null);
    if (pts.length > 1) s += `<polyline points="${pts.map((p) => `${p[0]},${y(p[1])}`).join(' ')}" fill="none" stroke="${se.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p) => (s += `<circle cx="${p[0]}" cy="${y(p[1])}" r="4" fill="var(--surface)" stroke="${se.color}" stroke-width="2.5"/>`));
  }
  return s + '</svg>';
}
function barChart(rows) {
  const W = 320, H = 130, pad = 26, n = Math.max(1, rows.length), bw = Math.min(28, (W - pad * 2) / n - 8);
  const max = Math.max(...rows.map((r) => Math.max(r.sessions, r.planned)), 1);
  const y = (v) => H - 20 - (v / max) * (H - 36);
  let s = `<svg viewBox="0 0 ${W} ${H}"><line class="ax" x1="${pad}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => {
    const cx = pad + ((i + 0.5) * (W - pad * 2)) / n;
    s += `<rect x="${cx - bw / 2}" y="${y(r.planned)}" width="${bw}" height="${y(0) - y(r.planned)}" rx="7" fill="var(--primary-soft)"/>`;
    if (r.sessions) s += `<rect x="${cx - bw / 2}" y="${y(Math.min(r.sessions, max))}" width="${bw}" height="${y(0) - y(Math.min(r.sessions, max))}" rx="7" fill="var(--primary)"/>`;
    s += `<text x="${cx}" y="${H - 4}" text-anchor="middle">S${r.week}</text>`;
  });
  return s + '</svg>';
}

function viewProgress() {
  const prof = profile();
  const rows = P.weeklyStats(prof, state.data.sessions).slice(-8);
  const has = state.data.sessions.length > 0;
  const prog = P.todaysProgram(prof);
  const lv = (n) => `<span class="lvl">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const hist = state.data.sessions.slice(-10).reverse();
  $app.innerHTML = `<section class="screen"><div class="topbar"><h1>${t('progress')}</h1><span class="chip">${t('week')} ${P.weekNumber(prof)} · ${t('phase')} ${prof.phase || 1}</span></div>
    ${!has ? `<div class="card muted">${t('noData')}</div>` : `
    <div class="card chart"><h3>${t('weekly')}</h3>${lineChart(rows, [
      { get: (r) => r.pain, color: 'var(--accent)' },
      { get: (r) => (r.quality != null ? r.quality * 10 : null), color: 'var(--primary)' },
      { get: (r) => (r.difficulty != null ? r.difficulty * 2 : null), color: 'var(--muted)' },
    ])}
      <div class="legend"><span><i style="background:var(--accent)"></i>${t('painTrend')} /10</span><span><i style="background:var(--primary)"></i>${t('qualityTrend')} (×10%)</span><span><i style="background:var(--muted)"></i>${t('difficulty')} (×2)</span></div></div>
    <div class="card chart"><h3>${t('adherence')}</h3>${barChart(rows)}</div>
    <div class="card"><h3>${t('weekReport')}</h3><p id="wr" class="muted small" style="margin:6px 0 10px">—</p><button class="btn small ghost" data-a="wr">${IC.spark.replace('<svg', '<svg width="16" height="16"')} ${t('genReport')}</button></div>`}
    <h2>${t('levels')}</h2><div class="card">${prog.map((x) => `<div class="toggle"><span class="small"><b>${esc(tr(EXERCISES[x.id].name))}</b></span>${lv(x.level)}</div>`).join('')}</div>
    ${hist.length ? `<h2>${t('history')}</h2>${hist.map((s) => `<div class="card"><div class="row" style="justify-content:space-between"><b>${new Date(s.date).toLocaleDateString(getLang() === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', day: 'numeric', month: 'short' })}</b><span class="chip ghost">${s.items.length} ${t('exercises').toLowerCase()}</span></div>
      <div class="small muted" style="margin-top:6px">${s.items.map((i) => `${esc(tr(EXERCISES[i.id]?.name))} · ${t('painTrend').toLowerCase()} ${i.pain}/10${i.change > 0 ? ' ↑' : i.change < 0 ? ' ↓' : ''}`).join('<br>')}</div></div>`).join('')}` : ''}
  </section>${nav('progress')}`;
  const b = $app.querySelector('[data-a="wr"]');
  if (b) b.onclick = async () => {
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    const p = $app.querySelector('#wr'); p.textContent = t('thinking');
    const { text } = await coachComment({ kind: 'week', condition: tr(P.pathologyById(prof.pathology).name), week: cur.week, sessions: cur.sessions, planned: cur.planned, pain: cur.pain, quality: cur.quality, painDelta: prev?.pain != null && cur.pain != null ? cur.pain - prev.pain : 0, phase: prof.phase || 1 });
    p.textContent = text; p.classList.remove('muted');
  };
}

// ---------- Profil / réglages ----------
function viewProfile() {
  const prof = profile(); const st = store.settings(); const u = state.user;
  const sw = (k, on) => `<button class="switch ${on ? 'on' : ''}" data-sw="${k}" role="switch" aria-checked="${on}"></button>`;
  $app.innerHTML = `<section class="screen"><div class="topbar"><h1>${t('profile')}</h1></div>
    <div class="card hero"><div class="row" style="position:relative;z-index:1"><div class="avatar" style="background:rgba(255,255,255,.2)">${esc((prof.name || '?')[0].toUpperCase())}</div>
      <div><b style="font-size:18px">${esc(prof.name)}</b><div class="small" style="opacity:.85">${u.local ? t('localMode') : esc(u.email || '')}</div></div></div>
      <p style="margin-top:12px;position:relative;z-index:1">${esc(tr(P.pathologyById(prof.pathology).name))}</p>
      <div style="margin-top:12px;position:relative;z-index:1"><button class="btn light small" data-a="change">${t('changeProgram')}</button></div></div>
    <h2>${t('settings')}</h2><div class="card">
      <div class="toggle"><b>${t('language')}</b><div class="row"><button class="pill ${getLang() === 'fr' ? 'on' : ''}" data-lang="fr">FR</button><button class="pill ${getLang() === 'en' ? 'on' : ''}" data-lang="en">EN</button></div></div>
      <div class="toggle" style="display:block"><b>${t('voice')}</b><div class="seg" style="grid-template-columns:repeat(3,1fr);margin-top:8px">
        ${['local', 'gemini', 'off'].map((v) => `<button data-voice="${v}" class="${st.voice === v ? 'on' : ''}">${t(v === 'local' ? 'voiceLocal' : v === 'gemini' ? 'voiceGemini' : 'voiceOff')}</button>`).join('')}</div></div>
      <div class="toggle"><span>${t('countAloud')}</span>${sw('countAloud', st.countAloud)}</div>
    </div>
    <h2>${t('aiCoach')}</h2><div class="card">
      <label class="field"><span>${t('geminiKey')}</span><input class="input" id="gk" type="password" value="${esc(st.geminiKey)}" placeholder="AIza…" autocomplete="off"></label>
      <p class="small muted" style="margin-top:-6px">${t('geminiKeyD')}</p>
      <div class="toggle"><span><span>${t('sendFrame')}</span><br><small class="muted">${t('sendFrameD')}</small></span>${sw('sendFrame', st.sendFrame)}</div>
    </div>
    <h2>${t('about')}</h2><div class="card small"><p style="margin-top:0">${t('aboutD')}</p><p class="muted" style="margin-bottom:0">${t('disclaimer')}</p></div>
    <div class="stack" style="margin-top:16px"><button class="btn ghost" data-a="export">${t('exportData')}</button>
      ${u.local ? `<button class="btn ghost" data-a="erase" style="color:var(--danger)">${t('deleteLocal')}</button>` : ''}
      <button class="btn ghost" data-a="out">${t('signOut')}</button></div>
  </section>${nav('profile')}`;
  const q = (s) => $app.querySelector(s);
  $app.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = async () => { setLang(b.dataset.lang); await store.saveProfile({ ...prof, lang: b.dataset.lang }); render(); }));
  $app.querySelectorAll('[data-voice]').forEach((b) => (b.onclick = () => { store.saveSettings({ voice: b.dataset.voice }); viewProfile(); if (b.dataset.voice !== 'off') speakRich(cueText('good')); }));
  $app.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = () => { const k = b.dataset.sw; store.saveSettings({ [k]: !store.settings()[k] }); viewProfile(); }));
  q('#gk').onchange = () => { store.saveSettings({ geminiKey: q('#gk').value.trim() }); toast('✓'); };
  q('[data-a="change"]').onclick = () => { state.ob = null; go('#/onboard'); };
  q('[data-a="export"]').onclick = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mobilis-${P.todayKey()}.json`; a.click();
  };
  const er = q('[data-a="erase"]'); if (er) er.onclick = async () => { if (confirm(t('confirmDelete'))) { store.eraseLocal(); await store.signOut((u2) => { state.user = u2; state.data = null; }); go('#/'); } };
  q('[data-a="out"]').onclick = () => store.signOut((u2) => { state.user = u2; state.data = null; go('#/'); });
}

boot();
