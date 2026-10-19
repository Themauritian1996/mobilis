// Mode clinicien : préparer un programme, l'envoyer par code / QR / lien, suivre et ajuster la progression du patient.
import { t, tr, getLang } from './i18n.js';
import { REGIONS, PATHOLOGIES } from './data/pathologies.js';
import { EXERCISES } from './data/exercises.js';
import { CONFIG } from './config.js';
import * as store from './store.js';
import { state, go, profile } from './state.js';
import { esc, icon, toast, nav, mountFigs, figSvg, sheet, copyText, shareText } from './ui.js';
import { layName } from './onboarding.js';

const $app = () => document.getElementById('app');
const fmtDate = (ts) => new Date(ts).toLocaleDateString(getLang() === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' });

export async function viewClinic() {
  const prof = profile();
  $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('patients')}</h1><button class="btn sm" data-go="#/clinic/new">${icon('plus', 16)} ${t('newRx')}</button></div>
    ${store.isCloud() ? '' : `<div class="banner" style="margin-bottom:12px">${icon('shield', 20)}<div>${t('clinLocal')}</div></div>`}
    <div id="rxlist"><div class="card muted">${t('loading')}</div></div></section>${nav('clinic', prof.role)}`;
  let list = [];
  try { list = await store.listMyRx(); } catch (e) { console.warn(e); }
  const box = $app().querySelector('#rxlist');
  if (!box) return;
  if (!list.length) { box.innerHTML = `<div class="card"><h3>${t('noRxYet')}</h3><p class="muted small" style="margin:4px 0 12px">${t('noRxYetD')}</p><button class="btn" data-go="#/clinic/new">${t('newRx')}</button></div>`; return; }
  box.innerHTML = list.map((rx) => {
    const pts = rx.patients || [];
    return `<div class="card"><div class="row between"><span class="eyebrow tnum">${store.fmtCode(rx.code)} · ${t('phase')} ${rx.phase}${rx.auto ? '' : ' · ' + t('locked')}</span><span class="small muted">${fmtDate(rx.updated)}</span></div>
      <h3 style="margin-top:6px">${esc(tr(PATHOLOGIES.find((p) => p.id === rx.pathology)?.name))}</h3>
      <div class="small muted">${rx.ids.length} ${t('exercises').toLowerCase()}${rx.label ? ' · ' + esc(rx.label) : ''}</div>
      ${pts.length ? pts.map((p) => {
        const adh = p.planned ? Math.round((p.sessions7 / p.planned) * 100) : 0;
        return `<div class="list" style="margin-top:10px"><div class="toggle"><span><b>${esc(p.name || t('patient'))}</b><br><small class="muted">${t('week')} ${p.week} · ${t('phase')} ${p.phase} · ${t('updated')} ${fmtDate(p.updated)}</small></span>${p.flare ? `<span class="chip neg">${t('flareShort')}</span>` : ''}</div>
          <div class="kpis"><div><b class="${adh >= 80 ? 'pos' : adh < 50 ? 'neg' : ''}">${p.sessions7}/${p.planned}</b><span>${t('sessions7')}</span></div><div><b class="${p.pain7 != null && p.pain7 > (PATHOLOGIES.find((x) => x.id === rx.pathology)?.painMax ?? 4) ? 'neg' : ''}">${p.pain7 ?? '–'}</b><span>${t('avgPain')}</span></div><div><b>${p.quality7 != null ? p.quality7 + '%' : '–'}</b><span>${t('quality')}</span></div></div></div>`;
      }).join('') : `<p class="small muted" style="margin:10px 0 0">${t('waitingPatient')}</p>`}
      <div class="row" style="margin-top:12px"><button class="btn sm ghost grow" data-share="${rx.code}">${icon('share', 16)} ${t('sendCode')}</button><button class="btn sm grow" data-go="#/clinic/rx/${rx.code}">${t('adjust')}</button></div></div>`;
  }).join('');
  box.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => { const rx = list.find((x) => x.code === b.dataset.share); shareSheet(rx.code, `${CONFIG.siteUrl}/#/rx/${rx.code}`); }));
}

export async function viewRxEditor(code) {
  const prof = profile();
  let rx = null;
  if (code && !(state.clinic && state.clinic.code === code)) {
    $app().innerHTML = `<section class="screen"><div class="card muted">${t('loading')}</div></section>`;
    try { rx = await store.getRx(code); } catch (_) {}
    if (!rx) { toast(t('rxNotFound')); return go('#/clinic'); }
  }
  const f = state.clinic && state.clinic.code === (code || null) ? state.clinic : (state.clinic = {
    code: code || null, clinician: rx?.clinician || prof.clinicianName || prof.name || '', region: rx?.region || 'shoulder', pathology: rx?.pathology || null,
    phase: rx?.phase || 1, ids: rx?.ids || [], levels: { ...(rx?.levels || {}) }, auto: rx ? !!rx.auto : true, notes: rx?.notes || '', nextVisit: rx?.nextVisit || '',
    label: rx?.label || '', version: rx?.version || 0, created: rx?.created || null, days: rx?.days || [1, 3, 5],
  });
  const path = PATHOLOGIES.find((p) => p.id === f.pathology);
  const regionEx = [...new Set(PATHOLOGIES.filter((p) => p.region === f.region).flatMap((p) => Object.values(p.phases).flat()))];
  const others = regionEx.filter((id) => !f.ids.includes(id));
  const draw = () => viewRxEditor(code);
  const scroll = (fn) => { const y = window.scrollY; fn(); draw(); window.scrollTo(0, y); };

  $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/clinic" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${code ? t('adjustRx') : t('newRx')}</h1></div>
    <label class="field"><span>${t('yourName')}</span><input class="input" id="cn" value="${esc(f.clinician)}" placeholder="${t('clinNamePh')}"></label>
    <label class="field"><span>${t('rxLabel')}</span><input class="input" id="lb" value="${esc(f.label)}" placeholder="${t('rxLabelPh')}"></label>
    <h2>${t('region')}</h2><div class="pills">${REGIONS.map((r) => `<button class="pill ${f.region === r.id ? 'on' : ''}" data-r="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>
    <h2>${t('condition')}</h2>${PATHOLOGIES.filter((p) => p.region === f.region).map((p) => `<button class="choice ${f.pathology === p.id ? 'on' : ''}" data-p="${p.id}"><span class="radio"></span><span><b>${esc(tr(p.name))}</b><small>${t('patientSees')} : ${esc(layName(p.id))}</small></span></button>`).join('')}
    ${path ? `
    <h2>${t('phase')}</h2><div class="seg">${[1, 2, 3].map((n) => `<button data-ph="${n}" class="${f.phase === n ? 'on' : ''}">${n} · ${t('phaseName' + n)}</button>`).join('')}</div>
    <h2>${t('exercises')} (${f.ids.length})</h2>
    <div class="list">${f.ids.map((id) => `<div class="ex-item"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id].name))}</b><small>${EXERCISES[id].track ? t('tracked') : t('guidedShort')}</small></span>
      <span class="stepper"><button data-lv="${id}" data-d="-1" aria-label="-">−</button><b class="tnum">${f.levels[id] || 2}</b><button data-lv="${id}" data-d="1" aria-label="+">+</button></span>
      <button class="icon-btn" data-rm="${id}" aria-label="${t('remove')}" style="width:34px;height:34px">${icon('close', 16)}</button></div>`).join('') || `<div class="toggle muted">${t('noExSelected')}</div>`}</div>
    ${others.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700">${t('addExercise')} (${others.length})</summary><div class="list" style="margin-top:8px">${others.map((id) => `<button class="ex-item" data-add="${id}"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id].name))}</b></span>${icon('plus', 18)}</button>`).join('')}</div></details>` : ''}
    <h2>${t('trainDays')}</h2><div class="seg">${[2, 3, 4, 5, 6].map((n) => `<button data-pw="${n}" class="${f.days.length === n ? 'on' : ''}">${n}×</button>`).join('')}</div>
    <div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('autoProg')}</b><br><small class="muted">${t('autoProgD')}</small></span><button class="switch ${f.auto ? 'on' : ''}" id="auto" role="switch" aria-checked="${f.auto}"></button></div></div>
    <label class="field" style="margin-top:14px"><span>${t('notesForPatient')}</span><textarea class="input" id="nt" placeholder="${t('notesPh')}">${esc(f.notes)}</textarea></label>
    <label class="field"><span>${t('nextVisit')}</span><input class="input" type="date" id="nv" value="${esc(f.nextVisit)}"></label>` : ''}
    <div style="height:96px"></div>
    <div class="sticky-cta"><div><button class="btn" id="save" ${path && f.ids.length ? '' : 'disabled'}>${code ? t('saveChanges') : t('createSend')}</button></div></div></section>
    <div class="desk-only">${nav('clinic', prof.role)}</div>`;
  mountFigs($app());
  const q = (s) => $app().querySelector(s), qa = (s) => $app().querySelectorAll(s);
  q('#cn').oninput = (e) => { f.clinician = e.target.value; };
  q('#lb').oninput = (e) => { f.label = e.target.value; };
  qa('[data-r]').forEach((b) => (b.onclick = () => { f.region = b.dataset.r; f.pathology = null; f.ids = []; draw(); }));
  qa('[data-p]').forEach((b) => (b.onclick = () => scroll(() => { f.pathology = b.dataset.p; f.ids = [...PATHOLOGIES.find((p) => p.id === f.pathology).phases[f.phase]]; })));
  qa('[data-ph]').forEach((b) => (b.onclick = () => scroll(() => { f.phase = +b.dataset.ph; f.ids = [...path.phases[f.phase]]; })));
  qa('[data-lv]').forEach((b) => (b.onclick = () => scroll(() => { const id = b.dataset.lv; f.levels[id] = Math.max(1, Math.min(5, (f.levels[id] || 2) + +b.dataset.d)); })));
  qa('[data-rm]').forEach((b) => (b.onclick = () => scroll(() => { f.ids = f.ids.filter((x) => x !== b.dataset.rm); })));
  qa('[data-add]').forEach((b) => (b.onclick = () => scroll(() => { f.ids = [...f.ids, b.dataset.add]; })));
  qa('[data-pw]').forEach((b) => (b.onclick = () => scroll(() => { f.days = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] }[+b.dataset.pw]; })));
  const au = q('#auto'); if (au) au.onclick = () => scroll(() => { f.auto = !f.auto; });
  const nt = q('#nt'); if (nt) nt.oninput = (e) => { f.notes = e.target.value; };
  const nv = q('#nv'); if (nv) nv.onchange = (e) => { f.nextVisit = e.target.value; };
  q('#save').onclick = async () => {
    q('#save').disabled = true;
    const levels = Object.fromEntries(f.ids.map((id) => [id, f.levels[id] || 2]));
    const data = { code: f.code, clinician: f.clinician.trim(), label: f.label.trim(), region: f.region, pathology: f.pathology, phase: f.phase, ids: f.ids, levels, auto: f.auto, notes: f.notes.trim(), nextVisit: f.nextVisit || null, days: f.days, version: f.version, created: f.created, lang: getLang() };
    try {
      const res = await store.saveRx(data);
      if (f.clinician.trim() && f.clinician.trim() !== prof.clinicianName) await store.saveProfile({ ...profile(), clinicianName: f.clinician.trim() });
      state.clinic = null;
      toast(code ? t('rxSaved') : t('rxCreated'));
      if (code) return go('#/clinic');
      shareSheet(res.code, res.link, () => go('#/clinic'));
    } catch (e) { console.warn(e); toast(t('rxSaveErr') + ' ' + (e.code || e.message), 5000); q('#save').disabled = false; }
  };
}

// Feuille d'envoi : code, QR, lien
export async function shareSheet(code, link, onClose) {
  let qrSvg = '';
  try {
    const { default: qrcode } = await import('../vendor/qrcode.js');
    const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) { console.warn(e); }
  const bg = sheet(`<h3>${t('sendToPatient')}</h3><p class="small muted" style="margin:4px 0 14px">${code ? t('sendCodeD') : t('sendLinkD')}</p>
    ${code ? `<div class="code-big">${store.fmtCode(code)}</div><p class="small muted" style="text-align:center;margin:4px 0 14px">${t('codeHowTo')}</p>` : ''}
    ${qrSvg ? `<div class="qr" aria-label="QR">${qrSvg}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn ghost" id="cp">${icon('copy', 18)} ${t('copyLink')}</button><button class="btn" id="sh">${icon('share', 18)} ${t('share')}</button></div>
    <button class="btn soft" id="done" style="margin-top:10px">${t('done')}</button>`, { onClose });
  const msg = code ? t('shareMsgCode').replace('{code}', store.fmtCode(code)) : t('shareMsgLink');
  bg.querySelector('#cp').onclick = () => copyText(link);
  bg.querySelector('#sh').onclick = () => shareText('Mobilis', msg, link);
  bg.querySelector('#done').onclick = () => { bg.remove(); onClose && onClose(); };
}
