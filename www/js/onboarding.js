// Accueil du patient : diagnostic écrit ou questions simples, point de départ, sécurité.
// Import d'un programme préparé par un clinicien (code ou lien).
import { t, tr, getLang, setLang } from './i18n.js';
import { REGIONS, PATHOLOGIES, RED_FLAGS } from './data/pathologies.js';
import { LAY, QUESTIONS, START_QS, startingPoint, matchDiagnosis, scoreAnswers } from './data/triage.js';
import { EXERCISES } from './data/exercises.js';
import * as P from './program.js';
import * as store from './store.js';
import { state, go, render, profile, updateProfile } from './state.js';
import { esc, icon, mountFigs, figSvg, toast } from './ui.js';

const $app = () => document.getElementById('app');
const DAY = 86400000;
export const layName = (id) => tr(LAY[id]?.name) || tr(PATHOLOGIES.find((p) => p.id === id)?.name);
export const medName = (id) => tr(PATHOLOGIES.find((p) => p.id === id)?.name);
const DOW = () => (getLang() === 'fr' ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
export const daysPicker = (sel) => `<div class="days" role="group" aria-label="${t('trainDays')}">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button data-day="${d}" class="${sel.includes(d) ? 'on' : ''}" aria-pressed="${sel.includes(d)}">${DOW()[d]}</button>`).join('')}</div>`;

// Carte du corps (les points ouvrent la région)
const BODY_DOTS = {
  cervical: [[100, 48]], thoracic: [[100, 74]], shoulder: [[74, 64], [126, 64]], elbow: [[62, 104], [138, 104]],
  wrist: [[54, 140], [146, 140]], lumbar: [[100, 112]], hip: [[86, 136], [114, 136]], knee: [[86, 186], [114, 186]],
  ankle: [[86, 232], [114, 232]], foot: [[80, 248], [120, 248]],
};
export function bodyMap(sel) {
  let dots = '';
  for (const [rid, pts] of Object.entries(BODY_DOTS)) for (const [x, y] of pts)
    dots += `<circle class="bm-dot ${sel === rid ? 'on' : ''}" data-region="${rid}" cx="${x}" cy="${y}" r="7"><title>${esc(tr(REGIONS.find((r) => r.id === rid).name))}</title></circle>`;
  return `<svg class="bodymap" viewBox="0 0 200 262" role="img" aria-label="${t('ob2')}"><g class="bm-body"><circle cx="100" cy="26" r="16"/>
    <path d="M76 56 Q100 48 124 56 L132 120 Q100 128 68 120 Z"/>
    <path d="M74 58 Q64 62 62 80 L56 140 Q54 148 50 150 L58 152 L66 102 L76 76Z"/><path d="M126 58 Q136 62 138 80 L144 140 Q146 148 150 150 L142 152 L134 102 L124 76Z"/>
    <path d="M70 120 Q100 130 130 120 L122 186 L118 240 L108 240 L104 150 L96 150 L92 240 L82 240 L78 186Z"/>
    <path d="M80 240 h14 v10 h-18z M106 240 h14 l4 10 h-18z"/></g>${dots}</svg>`;
}

function shell(body, { back = true, cta = '', canNext = true, progress = 0 } = {}) {
  $app().innerHTML = `<section class="screen">
    <div class="topbar">${back ? `<button class="icon-btn" data-ob="back" aria-label="${t('back')}">${icon('back', 20)}</button>` : ''}<h1></h1>
      ${profile()?.pathology ? `<button class="icon-btn" data-ob="cancel" aria-label="${t('close')}">${icon('close', 20)}</button>` : ''}</div>
    <div class="steps-dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= progress ? 'on' : ''}"></i>`).join('')}</div>
    ${body}<div style="height:96px"></div>
    <div class="sticky-cta"><div>${cta || `<button class="btn" data-ob="next" ${canNext ? '' : 'disabled'}>${t('next')}</button>`}</div></div></section>`;
  mountFigs($app());
  const c = $app().querySelector('[data-ob="cancel"]');
  if (c) c.onclick = () => { state.ob = null; go('#/home'); };
}

export function viewOnboard() {
  const prev = profile();
  const o = state.ob || (state.ob = {
    step: 'name', hist: [], name: prev?.name || state.user?.name || '', role: prev?.role || 'patient', text: '', matches: null, region: prev?.region || null,
    answers: {}, pathology: null, start: {}, painBase: prev?.painBase ?? 3, irritability: prev?.irritability || 'med',
    days: prev?.days || [1, 3, 5], flags: new Set(), noFlag: false,
  });
  const to = (s) => { o.hist.push(o.step); o.step = s; viewOnboard(); };
  const back = () => { o.step = o.hist.pop() || 'name'; viewOnboard(); };
  const q = (s) => $app().querySelector(s), qa = (s) => $app().querySelectorAll(s);
  const bind = () => {
    const b = q('[data-ob="back"]'); if (b) b.onclick = back;
    qa('[data-lang]').forEach((x) => (x.onclick = () => { setLang(x.dataset.lang); viewOnboard(); }));
  };

  if (o.step === 'name') {
    shell(`<h1 class="ob-title">${t('welcome')}</h1><p class="muted">${t('ob1s')}</p>
      <label class="field" style="margin-top:18px"><span>${t('namePh')}</span><input class="input" id="nm" value="${esc(o.name)}" autocomplete="given-name"></label>
      <div class="field"><span>${t('iAm')}</span><div class="seg"><button data-role="patient" class="${o.role === 'patient' ? 'on' : ''}">${t('rolePatient')}</button><button data-role="clinician" class="${o.role === 'clinician' ? 'on' : ''}">${t('roleClinician')}</button></div></div>
      <div class="field"><span>${t('language')}</span><div class="seg"><button data-lang="fr" class="${getLang() === 'fr' ? 'on' : ''}">Français</button><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">English</button></div></div>
      ${o.role === 'patient' ? `<div class="card row" style="margin-top:6px">${icon('stetho', 22)}<div class="grow"><b>${t('haveCode')}</b><div class="small muted">${t('haveCodeD')}</div></div><button class="btn sm ghost" data-go="#/code">${t('enterCode')}</button></div>` : ''}`,
      { back: false, canNext: o.name.trim().length > 0, progress: 0 });
    bind();
    const nm = q('#nm'); nm.oninput = () => { o.name = nm.value; q('[data-ob="next"]').disabled = !nm.value.trim(); };
    qa('[data-role]').forEach((x) => (x.onclick = () => { o.role = x.dataset.role; viewOnboard(); }));
    q('[data-ob="next"]').onclick = async () => {
      if (o.role === 'clinician') {
        await updateProfile({ name: o.name.trim(), role: 'clinician', lang: getLang() });
        state.ob = null; return go('#/clinic');
      }
      to('diag');
    };
    return;
  }

  if (o.step === 'diag') {
    const m = o.matches;
    shell(`<h1 class="ob-title">${t('diagTitle')}</h1><p class="muted">${t('diagSub')}</p>
      <label class="field" style="margin-top:14px"><span>${t('diagLabel')}</span><textarea class="input" id="dx" placeholder="${t('diagPh')}">${esc(o.text)}</textarea></label>
      <button class="btn ghost" data-a="analyse">${icon('search', 18)} ${t('analyse')}</button>
      ${m ? (m.length ? `<h2>${t('diagFound')}</h2>${m.map((x) => `<button class="choice ${o.pathology === x.id ? 'on' : ''}" data-path="${x.id}"><span class="radio"></span><span><b>${esc(layName(x.id))}</b><small>${t('medTerm')} : ${esc(medName(x.id))}</small></span></button>`).join('')}`
        : `<div class="banner" style="margin-top:12px">${icon('search', 20)}<div>${t('diagNone')}</div></div>`) : ''}
      <div class="divider">${t('or')}</div>
      <button class="btn soft" data-a="questions">${t('noDiag')}</button>`,
      { canNext: !!o.pathology, progress: 1 });
    bind();
    const dx = q('#dx'); dx.oninput = () => { o.text = dx.value; };
    q('[data-a="analyse"]').onclick = () => {
      o.text = dx.value; const r = matchDiagnosis(o.text, PATHOLOGIES); o.matches = [...r]; o.pathology = r[0]?.id || null;
      if (!r.length && r.regions?.length) { o.region = r.regions[0]; toast(t('diagRegionOnly')); return to('questions'); }
      viewOnboard();
    };
    qa('[data-path]').forEach((x) => (x.onclick = () => { o.pathology = x.dataset.path; viewOnboard(); }));
    q('[data-a="questions"]').onclick = () => to('region');
    q('[data-ob="next"]').onclick = () => { o.region = PATHOLOGIES.find((p) => p.id === o.pathology).region; to('start'); };
    return;
  }

  if (o.step === 'region') {
    shell(`<h1 class="ob-title">${t('ob2')}</h1><p class="muted">${t('ob2s')}</p>${bodyMap(o.region)}
      <div class="region-grid" style="margin-top:12px">${REGIONS.map((r) => `<button class="region-btn ${o.region === r.id ? 'on' : ''}" data-region="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>`,
      { canNext: !!o.region, progress: 1 });
    bind();
    qa('[data-region]').forEach((x) => (x.onclick = () => { if (o.region !== x.dataset.region) o.answers = {}; o.region = x.dataset.region; viewOnboard(); }));
    q('[data-ob="next"]').onclick = () => to('questions');
    return;
  }

  if (o.step === 'questions') {
    const qs = QUESTIONS[o.region] || [];
    const all = qs.every((_, i) => o.answers[i] != null);
    shell(`<span class="eyebrow">${esc(tr(REGIONS.find((r) => r.id === o.region).name))}</span><h1 class="ob-title">${t('qTitle')}</h1><p class="muted">${t('qSub')}</p>
      ${qs.map((qq, i) => `<h2>${esc(tr(qq.q))}</h2>${qq.opts.map((op, j) => `<button class="choice ${o.answers[i] === j ? 'on' : ''}" data-q="${i}" data-o="${j}"><span class="radio"></span><span>${esc(tr(op.t))}</span></button>`).join('')}`).join('')}`,
      { canNext: all, progress: 2 });
    bind();
    qa('[data-q]').forEach((x) => (x.onclick = () => { o.answers[+x.dataset.q] = +x.dataset.o; const y = window.scrollY; viewOnboard(); window.scrollTo(0, y); }));
    q('[data-ob="next"]').onclick = () => {
      const sc = scoreAnswers(o.region, o.answers, PATHOLOGIES);
      o.candidates = sc.filter((s) => s.score > 0).slice(0, 3);
      if (!o.candidates.length) o.candidates = sc.slice(0, 3);
      o.pathology = o.candidates[0]?.id; o.showAll = false;
      to('confirm');
    };
    return;
  }

  if (o.step === 'confirm') {
    const list = o.showAll ? PATHOLOGIES.filter((p) => p.region === o.region).map((p) => ({ id: p.id })) : o.candidates;
    shell(`<h1 class="ob-title">${t('looksLike')}</h1><p class="muted">${t('looksLikeSub')}</p>
      ${list.map((x, i) => `<button class="choice ${o.pathology === x.id ? 'on' : ''}" data-path="${x.id}"><span class="radio"></span><span><b>${esc(layName(x.id))}</b>${i === 0 && !o.showAll ? `<small class="pos">${t('mostLikely')}</small>` : ''}<small>${t('medTerm')} : ${esc(medName(x.id))}</small></span></button>`).join('')}
      ${o.showAll ? '' : `<button class="link" style="margin-top:14px" data-a="all">${t('noneOfThese')}</button>`}
      <div class="banner" style="margin-top:16px">${icon('shield', 20)}<div>${t('notDiagnosis')}</div></div>`,
      { canNext: !!o.pathology, progress: 2 });
    bind();
    qa('[data-path]').forEach((x) => (x.onclick = () => { o.pathology = x.dataset.path; viewOnboard(); }));
    const a = q('[data-a="all"]'); if (a) a.onclick = () => { o.showAll = true; viewOnboard(); };
    q('[data-ob="next"]').onclick = () => to('start');
    return;
  }

  if (o.step === 'start') {
    const visible = START_QS.filter((s) => !s.when || s.when(o.start));
    const all = visible.every((s) => o.start[s.id]) && o.days.length > 0;
    const irr = (k) => `<button class="choice ${o.irritability === k ? 'on' : ''}" data-irr="${k}"><span class="radio"></span><span><b>${t('irr_' + k)}</b><small>${t('irr_' + k + 'D')}</small></span></button>`;
    shell(`<h1 class="ob-title">${t('whereTitle')}</h1><p class="muted">${t('whereSub')}</p>
      ${visible.map((s) => `<h2>${esc(tr(s.q))}</h2>${s.opts.map((op) => `<button class="choice ${o.start[s.id] === op.v ? 'on' : ''}" data-s="${s.id}" data-v="${op.v}"><span class="radio"></span><span>${esc(tr(op.t))}</span></button>`).join('')}`).join('')}
      <h2>${t('painNow')}</h2><div class="card"><div class="row between"><span class="muted small">0 = ${t('noPain')} · 10 = ${t('worstPain')}</span><span class="mid" id="pv">${o.painBase}</span></div>
        <input type="range" min="0" max="10" value="${o.painBase}" id="pain" aria-label="${t('painNow')}"></div>
      <h2>${t('irritability')}</h2>${irr('low')}${irr('med')}${irr('high')}
      <h2>${t('trainDays')}</h2>${daysPicker(o.days)}<p class="note" style="margin-top:8px">${t('trainDaysD')}</p>`,
      { canNext: all, progress: 3 });
    bind();
    qa('[data-s]').forEach((x) => (x.onclick = () => { o.start[x.dataset.s] = x.dataset.v; if (x.dataset.s === 'prior' && x.dataset.v === 'no') delete o.start.how; const y = window.scrollY; viewOnboard(); window.scrollTo(0, y); }));
    qa('[data-irr]').forEach((x) => (x.onclick = () => { o.irritability = x.dataset.irr; const y = window.scrollY; viewOnboard(); window.scrollTo(0, y); }));
    qa('[data-day]').forEach((x) => (x.onclick = () => { const d = +x.dataset.day; o.days = o.days.includes(d) ? o.days.filter((z) => z !== d) : [...o.days, d]; const y = window.scrollY; viewOnboard(); window.scrollTo(0, y); }));
    const pain = q('#pain'); pain.oninput = () => { o.painBase = +pain.value; q('#pv').textContent = pain.value; };
    q('[data-ob="next"]').onclick = () => to('flags');
    return;
  }

  if (o.step === 'flags') {
    flagsScreen(o, () => to('ready'), bind);
    return;
  }

  // Prêt
  const sp = startingPoint(o.start, o.irritability);
  const tmp = { pathology: o.pathology, irritability: o.irritability, phase: sp.phase, baseLevel: sp.level, levels: {} };
  const prog = P.todaysProgram(tmp);
  shell(`<h1 class="ob-title">${t('ob6')}</h1><p class="muted">${t('ob6s')}</p>
    <div class="card" style="margin:14px 0"><span class="eyebrow">${t('phase')} ${sp.phase} · ${t('phaseName' + sp.phase)}</span><h3 style="margin-top:6px">${esc(layName(o.pathology))}</h3>
      <div class="small muted">${prog.length} ${t('exercises').toLowerCase()} · ${o.days.length}× / ${t('week').toLowerCase()} · ${t('level')} ${sp.level}/5</div>
      ${sp.phase > 1 ? `<div class="small" style="margin-top:8px">${t('startAdapted')}</div>` : ''}</div>
    <div class="list">${prog.map((x) => `<div class="ex-item"><span class="ex-thumb">${figSvg(x.id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[x.id].name))}</b></span></div>`).join('')}</div>`,
    { cta: `<button class="btn" data-ob="finish">${t('start')}</button>`, progress: 4 });
  bind();
  q('[data-ob="finish"]').onclick = async () => {
    const p = {
      ...(prev || {}), role: 'patient', name: o.name.trim(), region: o.region, pathology: o.pathology, painBase: o.painBase, irritability: o.irritability,
      days: o.days, perWeek: o.days.length, phase: sp.phase, baseLevel: sp.level, levels: prev?.pathology === o.pathology ? prev.levels || {} : {},
      startDate: Date.now() - sp.weeksDone * 7 * DAY, joinedAt: prev?.joinedAt || Date.now(), lang: getLang(), triage: { text: o.text, answers: o.answers, start: o.start },
      plan: null, lockPhase: false,
    };
    await store.saveProfile(p); state.data = await store.loadData(); state.ob = null;
    go('#/home');
  };
}

function flagsScreen(o, next, bind) {
  shell(`<h1 class="ob-title">${t('ob5')}</h1><p class="muted">${t('ob5s')}</p><div style="margin-top:14px">
    ${RED_FLAGS.map((f, i) => `<button class="choice flag ${o.flags.has(i) ? 'on' : ''}" data-flag="${i}"><span class="radio"></span><span>${esc(tr(f))}</span></button>`).join('')}
    <button class="choice ${o.noFlag ? 'on' : ''}" data-noflag="1"><span class="radio"></span><span><b>${t('none')}</b></span></button></div>
    ${o.flags.size ? `<div class="banner neg" style="margin-top:14px">${icon('shield', 20)}<div><b>${t('rfStop')}</b><br>${t('rfStopD')}</div></div>` : ''}`,
    { canNext: o.noFlag && !o.flags.size, progress: 3 });
  bind();
  const qa = (s) => document.getElementById('app').querySelectorAll(s);
  qa('[data-flag]').forEach((x) => (x.onclick = () => { const i = +x.dataset.flag; o.flags.has(i) ? o.flags.delete(i) : o.flags.add(i); o.noFlag = false; flagsScreen(o, next, bind); }));
  qa('[data-noflag]').forEach((x) => (x.onclick = () => { o.flags.clear(); o.noFlag = true; flagsScreen(o, next, bind); }));
  document.querySelector('[data-ob="next"]').onclick = next;
}

// ---------- Programme envoyé par le clinicien ----------
export function viewCodeEntry() {
  $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" onclick="history.back()" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('enterCode')}</h1></div>
    <p class="muted">${t('codeSub')}</p>
    <label class="field"><span>${t('codeLabel')}</span><input class="input tnum" id="code" autocomplete="off" autocapitalize="characters" placeholder="ABC-234" style="font-size:24px;letter-spacing:.12em;text-align:center"></label>
    <p class="err" id="err" hidden></p>
    <button class="btn" id="go">${t('next')}</button></section>`;
  const c = $app().querySelector('#code');
  $app().querySelector('#go').onclick = () => { const v = store.cleanCode(c.value); if (v.length === 6) go('#/rx/' + v); else { const e = $app().querySelector('#err'); e.hidden = false; e.textContent = t('codeInvalid'); } };
}

export async function viewRxImport(code) {
  $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('rxTitle')}</h1></div><div class="card muted">${t('loading')}</div></section>`;
  let rx = null;
  try { rx = await store.getRx(code); } catch (e) { console.warn(e); }
  if (!rx) {
    $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/code">${icon('back', 20)}</button><h1>${t('rxTitle')}</h1></div><div class="banner neg">${icon('shield', 20)}<div>${t('rxNotFound')}</div></div></section>`;
    return;
  }
  try { localStorage.removeItem('mobilis.pendingRx'); } catch (_) {}
  const prev = profile();
  const o = { name: prev?.name || state.user?.name || '', days: prev?.days || rx.days || [1, 3, 5], share: store.isCloud() && !!rx.code, flags: new Set(), noFlag: false, step: 'summary' };
  const draw = () => {
    if (o.step === 'flags') return flagsScreen(o, finish, () => { const b = document.querySelector('[data-ob="back"]'); if (b) b.onclick = () => { o.step = 'summary'; draw(); }; });
    $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('rxTitle')}</h1></div>
      <div class="card"><span class="eyebrow">${t('preparedBy')} ${esc(rx.clinician || t('yourClinician'))}</span>
        <h3 style="margin-top:6px">${esc(layName(rx.pathology))}</h3><div class="small muted">${t('medTerm')} : ${esc(medName(rx.pathology))}</div>
        <div class="row wrap" style="margin-top:10px"><span class="chip">${t('phase')} ${rx.phase} · ${t('phaseName' + rx.phase)}</span><span class="chip">${rx.ids.length} ${t('exercises').toLowerCase()}</span>
        ${rx.nextVisit ? `<span class="chip">${t('nextVisit')} ${new Date(rx.nextVisit + 'T12:00').toLocaleDateString(getLang() === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long' })}</span>` : ''}</div>
        ${rx.notes ? `<p style="margin:12px 0 0;white-space:pre-line">${esc(rx.notes)}</p>` : ''}</div>
      <h2>${t('exercises')}</h2><div class="list">${rx.ids.map((id) => `<div class="ex-item"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id].name))}</b><small>${t('level')} ${rx.levels?.[id] || 2}/5</small></span></div>`).join('')}</div>
      <h2>${t('aboutYou')}</h2>
      <label class="field"><span>${t('namePh')}</span><input class="input" id="nm" value="${esc(o.name)}"></label>
      <div class="field"><span>${t('trainDays')}</span>${daysPicker(o.days)}</div>
      ${rx.code ? (store.isCloud() ? `<div class="list"><div class="toggle"><span><b>${t('shareWithClin')}</b><br><small class="muted">${t('shareWithClinD')}</small></span><button class="switch ${o.share ? 'on' : ''}" id="share" role="switch" aria-checked="${o.share}"></button></div></div>`
        : `<p class="note">${t('shareNeedsAccount')}</p>`) : ''}
      <div style="height:96px"></div>
      <div class="sticky-cta"><div><button class="btn" id="next" ${o.name.trim() && o.days.length ? '' : 'disabled'}>${t('next')}</button></div></div></section>`;
    mountFigs($app());
    const q = (s) => $app().querySelector(s);
    q('#nm').oninput = (e) => { o.name = e.target.value; q('#next').disabled = !o.name.trim() || !o.days.length; };
    $app().querySelectorAll('[data-day]').forEach((x) => (x.onclick = () => { const d = +x.dataset.day; o.days = o.days.includes(d) ? o.days.filter((z) => z !== d) : [...o.days, d]; draw(); }));
    const sh = q('#share'); if (sh) sh.onclick = () => { o.share = !o.share; draw(); };
    q('#next').onclick = () => { o.step = 'flags'; draw(); };
  };
  async function finish() {
    const weeks = { 1: 0, 2: 2, 3: 6 }[rx.phase] || 0;
    const p = {
      ...(prev || {}), role: prev?.role === 'clinician' ? 'clinician' : 'patient', name: o.name.trim(), region: rx.region, pathology: rx.pathology,
      phase: rx.phase, plan: { phase: rx.phase, ids: rx.ids }, levels: { ...(rx.levels || {}) }, baseLevel: 2, lockPhase: !rx.auto,
      irritability: prev?.irritability || 'med', painBase: prev?.painBase ?? 3, days: o.days, perWeek: o.days.length,
      startDate: Date.now() - weeks * 7 * DAY, joinedAt: prev?.joinedAt || Date.now(), rxCode: rx.code || null, rxVersion: rx.version || 1, clinician: rx.clinician || '', rxNotes: rx.notes || '',
      nextVisit: rx.nextVisit || prev?.nextVisit || null, shareProgress: o.share, lang: getLang(),
    };
    await store.saveProfile(p); state.data = await store.loadData(); state.ob = null;
    toast(t('rxAdded'));
    go('#/home');
  }
  draw();
}

// Applique les mises à jour faites par le clinicien (vérifié à l'ouverture)
export async function checkRxUpdate() {
  const p = profile();
  if (!p?.rxCode || !navigator.onLine) return;
  const last = +(sessionStorage.getItem('mobilis.rxCheck') || 0);
  if (Date.now() - last < 10 * 60000) return;
  sessionStorage.setItem('mobilis.rxCheck', String(Date.now()));
  try {
    const rx = await store.getRx(p.rxCode);
    if (!rx || (rx.version || 1) <= (p.rxVersion || 1)) return;
    await updateProfile({ phase: rx.phase, plan: { phase: rx.phase, ids: rx.ids }, levels: { ...(p.levels || {}), ...(rx.levels || {}) }, lockPhase: !rx.auto, rxVersion: rx.version, rxNotes: rx.notes || '', nextVisit: rx.nextVisit || p.nextVisit, clinician: rx.clinician || p.clinician });
    toast(t('rxUpdated'), 4000);
    render();
  } catch (e) { console.warn(e); }
}
