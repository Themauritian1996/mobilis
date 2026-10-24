// Aperçu de la séance : exercices du jour, matériel, durée, consignes générales ; réglage des séries / répétitions /
// maintien / repos avant de commencer (pour aujourd'hui ou pour les prochaines séances), exercice à passer aujourd'hui.
import { t, tr } from './i18n.js';
import { EXERCISES, EQUIP } from './data/exercises.js';
import * as P from './program.js';
import { LAY } from './data/triage.js';
import { state, go, profile, todaySession, updateProfile, navRole } from './state.js';
import { esc, icon, IC, toast, mountFigs, figSvg, nav } from './ui.js';
import { doseText } from './train.js';
import { EQUIP_IDS, haveList, missing, alternatives } from './equip.js';

const $app = () => document.getElementById('app');
const mins = (sec) => Math.max(1, Math.round(sec / 60));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function viewSession() {
  const prof = profile();
  if (!prof?.pathology) return go('#/home');
  const layName = (id) => tr(LAY[id]?.name) || tr(P.pathologyById(id)?.name);
  const items = P.todaysProgram(prof, { withSkipped: true });
  const done = new Set((todaySession()?.items || []).map((i) => i.id));
  const active = items.filter((x) => !x.skipped);
  const todo = active.filter((x) => !done.has(x.id));
  const path = P.pathologyById(prof.pathology);
  const total = todo.reduce((a, x) => a + P.exerciseSeconds(x.dose), 0);
  const equip = [...new Set(active.flatMap((x) => EXERCISES[x.id].equip || []))];
  const have = haveList(prof);
  const cam = active.filter((x) => EXERCISES[x.id].track);
  const planes = [...new Set(cam.flatMap((x) => Object.keys(EXERCISES[x.id].track.planes)))];
  const floor = active.some((x) => (EXERCISES[x.id].equip || []).includes('mat'));
  const open = state.sessOpen || null;
  const week = P.weekNumber(prof);

  const row = (x) => {
    const ex = EXERCISES[x.id], d = x.dose, isDone = done.has(x.id), isOpen = open === x.id;
    const miss = missing(x.id, have), from = P.swappedFrom(prof, x.id);
    const alts = miss.length ? alternatives(x.id, have) : [];
    return `<div class="sess-item ${x.skipped ? 'skipped' : ''} ${isDone ? 'done' : ''}">
      <div class="ex-item" style="padding:10px 12px 10px 10px">
        <div class="ex-thumb">${figSvg(x.id, { stat: true })}</div>
        <div class="grow" style="min-width:0"><b>${esc(tr(ex.name))}</b>
          <div class="small muted">${x.skipped ? t('sessSkipped') : `${doseText(d)}${d.sets > 1 ? ` · ${t('restShort')} ${d.rest}${t('sec')}` : ''} · ~${mins(P.exerciseSeconds(d))} min`}</div>
          <div class="row wrap" style="gap:4px;margin-top:4px">
            <span class="chip sm">${ex.track ? `${icon('cam', 12)} ${t('tracked')}` : `${icon('timer', 12)} ${t('guidedShort')}`}</span>
            ${(ex.equip || []).map((e) => `<span class="chip sm">${esc(tr(EQUIP[e]))}</span>`).join('')}
            ${d.custom ? `<span class="chip sm ink">${t(x.kept ? 'sessCustomKept' : 'sessCustomToday')}</span>` : ''}
          </div></div>
        ${isDone ? `<div class="stack" style="gap:6px;align-items:flex-end"><span class="chip pos">${icon('check', 14)} ${t('doneShort')}</span><button class="btn sm ghost" data-redo="${x.id}">${icon('flip', 14)} ${t('redoEx')}</button></div>` : `<button class="btn sm ghost" data-edit="${x.id}" aria-expanded="${isOpen}">${t(isOpen ? 'close' : 'sessEdit')}</button>`}
      </div>
      ${miss.length ? `<div class="sess-miss"><b>${icon('shield', 14)} ${t('missingEq')} ${miss.map((e) => esc(tr(EQUIP[e]))).join(', ')}</b>
        <div class="small">${miss.map((e) => `${t('subFor')} ${esc(tr(EQUIP[e]).toLowerCase())} : ${t('sub_' + e)}`).join('<br>')}</div>
        ${alts.length ? `<div class="small muted" style="margin-top:6px">${t('orSwap')}</div><div class="row wrap" style="gap:6px;margin-top:4px">${alts.map((a) => `<button class="btn sm ghost" data-swap="${x.id}" data-to="${a}">${esc(tr(EXERCISES[a].name))}</button>`).join('')}</div>` : ''}</div>` : ''}
      ${from ? `<div class="sess-miss ok small">${t('swappedFrom')} ${esc(tr(EXERCISES[from].name))} <button class="link" data-unswap="${from}">${t('undoSwap')}</button></div>` : ''}
      ${isOpen && !isDone ? editor(x) : ''}</div>`;
  };
  const editor = (x) => {
    const d = x.dose, hold = d.type === 'hold';
    const st = (k, label, v, unit) => `<div class="toggle"><span>${label}</span><div class="stepper"><button data-st="${k}" data-dir="-1" aria-label="−">−</button><b class="tnum">${v}${unit || ''}</b><button data-st="${k}" data-dir="1" aria-label="+">+</button></div></div>`;
    return `<div class="sess-edit" data-ed="${x.id}">
      ${st('sets', t('setsLbl'), d.sets)}
      ${hold ? st('hold', t('holdLbl'), d.hold, ' ' + t('sec')) : st('reps', t('repsLbl'), d.reps)}
      ${hold && d.reps > 1 ? st('reps', t('holdRepsLbl'), d.reps) : ''}
      ${st('rest', t('restLbl'), d.rest, ' ' + t('sec'))}
      <div class="toggle"><span>${t('sessKeep')}<br><small class="muted">${t('sessKeepD')}</small></span><button class="switch ${x.kept ? 'on' : ''}" data-keep role="switch" aria-checked="${x.kept}"></button></div>
      <div class="row" style="padding:10px 12px 12px;gap:8px"><button class="btn sm ghost grow" data-reset>${t('sessReset')}</button><button class="btn sm ghost grow" data-skip>${t(x.skipped ? 'sessUnskip' : 'sessSkip')}</button><button class="btn sm ghost grow" data-go="#/ex/${x.id}">${icon('demo', 14)} ${t('sessSee')}</button></div>
    </div>`;
  };

  $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/home" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('sessTitle')}</h1></div>
    <div class="card">
      <span class="eyebrow">${t('week')} ${week} · ${t('phase')} ${prof.phase || 1}</span>
      <h3 style="margin:6px 0 10px">${esc(layName(prof.pathology))}</h3>
      <div class="kpis"><div><b>${todo.length}</b><span>${t('exercises')}</span></div><div><b>~${mins(total)}</b><span>min</span></div><div><b>≤ ${path?.painMax ?? 4}</b><span>${t('sessPainMax')}</span></div></div>
    </div>
    ${P.inFlare(prof) ? `<div class="banner neg" style="margin-top:10px">${icon('flame', 20)}<div><b>${t('flareOn')}</b><br>${t('flareOnD')}</div></div>` : ''}
    ${prof.rxNotes ? `<div class="banner" style="margin-top:10px">${icon('stetho', 20)}<div><b>${t('fromClinician')}</b><br>${esc(prof.rxNotes)}</div></div>` : ''}
    <h2>${t('sessEquip')}</h2>
    <div class="card"><div class="row wrap" style="gap:6px">${equip.length ? equip.map((e) => `<span class="chip ${have && !have.includes(e) ? 'neg' : ''}">${esc(tr(EQUIP[e]))}</span>`).join('') : `<span class="muted">${t('sessNoEquip')}</span>`}</div>
      <details class="my-equip" ${state.equipOpen ? 'open' : ''}><summary>${t('myEquip')}${have ? '' : ` · <span class="muted">${t('myEquipUnset')}</span>`}</summary>
        <p class="small muted" style="margin:6px 0 8px">${t('myEquipD')}</p>
        <div class="row wrap" style="gap:6px">${EQUIP_IDS.map((e) => `<button class="pill ${!have || have.includes(e) ? 'on' : ''}" data-eq="${e}">${esc(tr(EQUIP[e]))}</button>`).join('')}</div></details>
      <ul class="list-plain small" style="margin-top:10px">
        ${cam.length ? `<li>${t('sessCamSpace')}</li>${planes.length > 1 ? `<li>${t('sessBothPlanes')}</li>` : ''}` : ''}
        ${floor ? `<li>${t('sessFloor')}</li>` : ''}
        <li>${t('sessClothes')}</li>
      </ul></div>
    <h2>${t('sessBefore')}</h2>
    <div class="card"><ul class="list-plain small" style="margin:0">
      <li>${t('sessWarm')}</li><li>${t('sessPainRule', { n: path?.painMax ?? 4 })}</li><li>${t('sessStop')}</li><li>${t('sessAdjustTip')}</li></ul></div>
    <h2>${t('sessList')}</h2>
    <div class="list">${items.map(row).join('')}</div>
    <p class="note">${t('sessOverNote')}</p>
    <div class="sticky-cta"><div>${todo.length ? `<button class="btn" data-a="start">${IC.play.replace('<svg', '<svg width="16" height="16"')} ${t(done.size ? 'continueSession' : 'startSession')} · ~${mins(total)} min</button>` : `<button class="btn" data-a="again">${icon('flip', 16)} ${t('redoSession')}</button>`}</div></div>
  </section>`;
  mountFigs($app());

  const q = (s) => $app().querySelector(s);
  // Refaire un exercice ou toute la séance le même jour (les séances refaites s'ajoutent à l'historique)
  $app().querySelectorAll('[data-redo]').forEach((b) => (b.onclick = () => { state.redo = true; go(`#/train/${b.dataset.redo}`); }));
  // Matériel du patient et remplacements
  $app().querySelectorAll('[data-eq]').forEach((b) => (b.onclick = async () => {
    const cur = haveList(profile()) || [...EQUIP_IDS]; const e = b.dataset.eq;
    state.equipOpen = true; const y = scrollY;
    await updateProfile({ equipment: cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e] }); viewSession(); scrollTo(0, y);
  }));
  $app().querySelectorAll('[data-swap]').forEach((b) => (b.onclick = async () => {
    const y = scrollY; await updateProfile({ swaps: { ...(profile().swaps || {}), [b.dataset.swap]: b.dataset.to } }); toast(t('swapDone')); viewSession(); scrollTo(0, y);
  }));
  $app().querySelectorAll('[data-unswap]').forEach((b) => (b.onclick = async () => {
    const sw = { ...(profile().swaps || {}) }; delete sw[b.dataset.unswap]; const y = scrollY; await updateProfile({ swaps: sw }); viewSession(); scrollTo(0, y);
  }));
  const ag = q('[data-a="again"]'); if (ag) ag.onclick = () => { state.redoQueue = active.map((x) => x.id); state.redo = true; go(`#/train/${active[0].id}`); };
  const st = q('[data-a="start"]'); if (st) st.onclick = () => { state.sessOpen = null; go(`#/train/${todo[0].id}`); };
  $app().querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { state.sessOpen = open === b.dataset.edit ? null : b.dataset.edit; const y = scrollY; viewSession(); scrollTo(0, y); }));

  const ed = q('[data-ed]'); if (!ed) return;
  const id = ed.dataset.ed, x = items.find((i) => i.id === id);
  const save = async (patch) => {
    const p = profile();
    const to = P.todayOver(p);
    const cur = { sets: x.dose.sets, reps: x.dose.reps, hold: x.dose.hold, rest: x.dose.rest, ...patch.values };
    const keep = patch.keep ?? x.kept;
    const doseOver = { ...(p.doseOver || {}) }; const items2 = { ...to.items };
    if (patch.reset) { delete doseOver[id]; delete items2[id]; }
    else if (keep) { doseOver[id] = cur; delete items2[id]; }
    else { delete doseOver[id]; items2[id] = cur; }
    const skip = patch.skip == null ? to.skip : patch.skip ? [...new Set([...to.skip, id])] : to.skip.filter((s) => s !== id);
    await updateProfile({ doseOver, todayOver: { date: to.date, items: items2, skip } });
    const y = scrollY; viewSession(); scrollTo(0, y);
  };
  const LIM = { sets: [1, 6, 1], reps: [3, 30, 1], hold: [5, 120, 5], rest: [0, 180, 15] };
  ed.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.st, [lo, hi, step] = k === 'reps' && x.dose.type === 'hold' ? [1, 10, 1] : LIM[k];
    const v = clamp((x.dose[k] ?? 0) + step * +b.dataset.dir, lo, hi);
    if (v !== x.dose[k]) save({ values: { [k]: v } });
  }));
  ed.querySelector('[data-keep]').onclick = () => save({ keep: !x.kept });
  ed.querySelector('[data-reset]').onclick = () => { save({ reset: true }); toast(t('sessResetDone')); };
  ed.querySelector('[data-skip]').onclick = () => { state.sessOpen = null; save({ skip: !x.skipped }); };
}
