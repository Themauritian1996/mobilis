// Historique complet : séances, journal de douleur, amplitudes et questionnaires — avec plage de dates, modification, suppression
// (avec confirmation) et saisie d'une séance manquée. La logique pure est dans longterm.js (testée dans tests/maint.test.mjs).
import { t, tr, locale } from './i18n.js';
import * as P from './program.js';
import * as store from './store.js';
import { state, go, profile, sessions, syncProgress, updateProfile, navRole } from './state.js';
import { esc, icon, toast, nav, sheet, confirmSheet } from './ui.js';
import { EXERCISES } from './data/exercises.js';
import { TESTS } from './data/romtests.js';
import { instrumentDef } from './data/proms.js';
import { RANGES, inRange, editSession, makeManualSession, validPastDay, removeById, removeByTs, patchByTs } from './longterm.js';

const $app = () => document.getElementById('app');
const fmt = (ts, o = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => new Date(ts).toLocaleDateString(locale(), o);
const RANGE_KEY = { '4w': 'rg4w', '3m': 'rg3m', all: 'rgAll' };
const TABS = [['sessions', 'histSessions'], ['journal', 'histJournal'], ['rom', 'histRom'], ['prom', 'histProm']];
const SHOW = 25;

// Sélecteur de plage réutilisé par l'écran Progrès
export const rangeSeg = (cur) => `<div class="seg" role="group" aria-label="${t('rgLabel')}">${RANGES.map((r) => `<button data-range="${r}" aria-pressed="${cur === r}" class="${cur === r ? 'on' : ''}">${t(RANGE_KEY[r])}</button>`).join('')}</div>`;
export const getRange = () => (RANGES.includes(state.range) ? state.range : '3m');

const romLabel = (r) => { const T = TESTS[r.test]; return `${T ? tr(T.name) : r.test}${r.side ? ' · ' + t(r.side === 'L' ? 'sideLeft' : 'sideRight') : ''}`; };
const romVal = (r) => { const T = TESTS[r.test]; return Number.isFinite(r.deg) ? `${Math.round(r.deg)}${T && T.unit === '%' ? ' %' : '°'}` : '–'; };
const dayKey = (ts) => P.todayKey(ts);
// Garde l'heure d'origine si le jour n'a pas changé ; sinon midi du nouveau jour
const withDay = (ts, day) => (dayKey(ts) === day ? ts : new Date(day + 'T12:00').getTime());

async function refresh() { state.data = await store.loadData(); try { await syncProgress(); } catch (_) {} }
async function del(msg, fn) {
  if (!(await confirmSheet({ title: t('histDelAsk'), text: t('histDelD'), ok: t('delete'), danger: true }))) return;
  await fn(); await refresh(); toast(msg || t('histDeleted')); viewHistory();
}

export function viewHistory() {
  const prof = profile(), H = state.hist || (state.hist = { tab: 'sessions', more: 0 });
  const range = getRange();
  const now = Date.now();
  let rows = '', total = 0;
  if (H.tab === 'sessions') {
    const list = sessions().filter((s) => inRange(s.date, range, now)).sort((a, b) => b.date - a.date);
    total = list.length;
    rows = list.slice(0, SHOW + H.more).map((s) => `<div class="hist-row"><div class="grow"><b>${fmt(s.date)}</b>${s.manual ? ` <span class="chip sm">${t('histManual')}</span>` : ''}
        <div class="small muted">${s.items.map((i) => `${esc(EXERCISES[i.id] ? tr(EXERCISES[i.id].name) : i.id)}${i.pain != null ? ' · ' + i.pain + '/10' : ''}${i.note ? ' — « ' + esc(i.note) + ' »' : ''}`).join('<br>')}</div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${esc(s.id)}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${esc(s.id)}" aria-label="${t('delete')} ${fmt(s.date)}">${t('delete')}</button></div></div>`).join('');
  } else if (H.tab === 'journal') {
    const list = (state.data.journal || []).filter((j) => inRange(j.ts || new Date(j.day + 'T12:00').getTime(), range, now)).sort((a, b) => b.day.localeCompare(a.day));
    total = list.length;
    rows = list.slice(0, SHOW + H.more).map((j) => `<div class="hist-row"><div class="grow"><b>${fmt(new Date(j.day + 'T12:00').getTime())}</b><div class="small muted">${t('histPain')} : <b class="tnum">${j.pain}</b></div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${esc(j.day)}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${esc(j.day)}" aria-label="${t('delete')} ${esc(j.day)}">${t('delete')}</button></div></div>`).join('');
  } else if (H.tab === 'rom') {
    const list = (prof.romLog || []).filter((r) => inRange(r.ts, range, now)).sort((a, b) => b.ts - a.ts);
    total = list.length;
    rows = list.slice(0, SHOW + H.more).map((r) => `<div class="hist-row"><div class="grow"><b>${esc(romLabel(r))}</b><div class="small muted">${fmt(r.ts)} · <b class="tnum">${romVal(r)}</b>${r.method === 'manual' ? ' · ' + t('histManual') : ''}</div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${r.ts}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${r.ts}" aria-label="${t('delete')} ${esc(romLabel(r))}">${t('delete')}</button></div></div>`).join('');
  } else {
    const list = (prof.promLog || []).filter((r) => inRange(r.ts, range, now)).sort((a, b) => b.ts - a.ts);
    total = list.length;
    rows = list.slice(0, SHOW + H.more).map((r) => { const def = instrumentDef(r.id, prof.promCustom); const nm = def ? tr(def.name) : r.id;
      return `<div class="hist-row"><div class="grow"><b>${esc(nm)}</b><div class="small muted">${fmt(r.ts)}${typeof r.score === 'number' ? ' · <b class="tnum">' + r.score + '</b>' : ''}</div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${r.ts}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${r.ts}" aria-label="${t('delete')} ${esc(nm)}">${t('delete')}</button></div></div>`; }).join('');
  }
  $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('histTitle')}</h1></div>
    ${rangeSeg(range)}
    <div class="pills" role="tablist" style="margin-top:12px">${TABS.map(([id, k]) => `<button class="pill ${H.tab === id ? 'on' : ''}" role="tab" aria-selected="${H.tab === id}" data-tab="${id}">${t(k)}</button>`).join('')}</div>
    ${H.tab === 'sessions' && prof.pathology ? `<button class="btn ghost" data-a="past" style="margin-top:12px">${icon('plus', 18)} ${t('histAddPast')}</button>` : ''}
    <div class="list hist" style="margin-top:12px">${rows || `<div class="toggle muted">${t('histNone')}</div>`}</div>
    ${total > SHOW + H.more ? `<button class="btn ghost" data-a="more" style="margin-top:10px">${t('histMore')} (${total - SHOW - H.more})</button>` : ''}
    ${store.isCloud() ? `<p class="note">${t('histCloudNote')}</p>` : ''}
  </section>${nav('progress', navRole())}`;
  const q = (s) => $app().querySelector(s), qa = (s) => $app().querySelectorAll(s);
  qa('[data-range]').forEach((b) => (b.onclick = () => { state.range = b.dataset.range; H.more = 0; viewHistory(); }));
  qa('[data-tab]').forEach((b) => (b.onclick = () => { H.tab = b.dataset.tab; H.more = 0; viewHistory(); }));
  const more = q('[data-a="more"]'); if (more) more.onclick = () => { H.more += SHOW; viewHistory(); };
  const past = q('[data-a="past"]'); if (past) past.onclick = () => pastSessionSheet();
  qa('[data-del]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.del;
    if (H.tab === 'sessions') return del(null, () => store.deleteSession(k));
    if (H.tab === 'journal') return del(null, () => store.deleteJournal(k));
    if (H.tab === 'rom') return del(null, () => updateProfile({ romLog: removeByTs(profile().romLog, +k) }));
    return del(null, () => updateProfile({ promLog: removeByTs(profile().promLog, +k) }));
  }));
  qa('[data-edit]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.edit;
    if (H.tab === 'sessions') return editSessionSheet(sessions().find((s) => s.id === k));
    if (H.tab === 'journal') return editJournalSheet((state.data.journal || []).find((j) => j.day === k));
    if (H.tab === 'rom') return editRomSheet((profile().romLog || []).find((r) => r.ts === +k));
    return editPromSheet((profile().promLog || []).find((r) => r.ts === +k));
  }));
}

const minDay = () => { const p = profile(); return p?.startDate ? dayKey(p.startDate) : ''; };
const dateErr = (day) => { const e = validPastDay(day, profile()?.startDate); return e === 'future' ? t('histErrFuture') : e === 'before' ? t('histErrBefore') : e ? t('histErrFuture') : null; };

function editSessionSheet(s) {
  if (!s) return;
  const bg = sheet(`<h3>${t('histEditTitle')}</h3>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="hd" value="${dayKey(s.date)}" max="${P.todayKey()}"></label>
    ${s.items.map((i, k) => `<div class="card" style="margin-bottom:8px" data-it="${k}"><b>${esc(EXERCISES[i.id] ? tr(EXERCISES[i.id].name) : i.id)}</b>
      <div class="grid2" style="margin-top:8px"><label class="field"><span>${t('histPain')}</span><input class="input tnum" type="number" min="0" max="10" step="1" inputmode="numeric" data-pain value="${i.pain ?? ''}"></label>
      <div class="field"><span>&nbsp;</span><button class="btn sm ghost danger" data-rm>${t('histRemoveEx')}</button></div></div>
      <label class="field"><span>${t('noteOpt')}</span><input class="input" data-note maxlength="400" value="${esc(i.note || '')}"></label></div>`).join('')}
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  const rm = new Set();
  bg.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { const k = +b.closest('[data-it]').dataset.it; const on = !rm.has(k); on ? rm.add(k) : rm.delete(k); b.closest('[data-it]').style.opacity = on ? '.45' : ''; b.setAttribute('aria-pressed', String(on)); }));
  bg.querySelector('#hc').onclick = () => bg.remove();
  bg.querySelector('#hs').onclick = async () => {
    const day = bg.querySelector('#hd').value, err = dateErr(day); if (err) return toast(err, 4000);
    const items = {};
    bg.querySelectorAll('[data-it]').forEach((el) => { const k = +el.dataset.it, v = el.querySelector('[data-pain]').value; items[k] = { pain: v === '' ? null : Math.max(0, Math.min(10, Math.round(+v))), note: el.querySelector('[data-note]').value.trim() }; });
    if (rm.size >= s.items.length) { bg.remove(); return del(null, () => store.deleteSession(s.id)); } // plus aucun exercice : on supprime la séance (avec confirmation)
    const ns = editSession(s, { day, items, remove: [...rm] });
    bg.remove(); await store.saveSession(ns); await refresh(); toast(t('saved')); viewHistory();
  };
}
function editJournalSheet(j) {
  if (!j) return;
  const bg = sheet(`<h3>${t('histEditTitle')}</h3><p class="small muted">${fmt(new Date(j.day + 'T12:00').getTime())}</p>
    <label class="field"><span>${t('histPain')}</span><input class="input tnum" type="number" min="0" max="10" step="1" inputmode="numeric" id="jp" value="${j.pain}"></label>
    <div class="row"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  bg.querySelector('#hc').onclick = () => bg.remove();
  bg.querySelector('#hs').onclick = async () => { const v = bg.querySelector('#jp').value; if (v === '') return; bg.remove(); await store.saveJournal({ ...j, pain: Math.max(0, Math.min(10, Math.round(+v))) }); await refresh(); toast(t('saved')); viewHistory(); };
}
function editRomSheet(r) {
  if (!r) return;
  const T = TESTS[r.test];
  const bg = sheet(`<h3>${t('histEditTitle')}</h3><p class="small muted">${esc(romLabel(r))}</p>
    <label class="field"><span>${t('histDegrees')} (${T && T.unit === '%' ? '%' : '°'})</span><input class="input tnum" type="number" step="1" inputmode="decimal" id="rv" value="${Math.round(r.deg)}"></label>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="hd" value="${dayKey(r.ts)}" max="${P.todayKey()}"></label>
    <div class="row"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  bg.querySelector('#hc').onclick = () => bg.remove();
  bg.querySelector('#hs').onclick = async () => {
    const v = +bg.querySelector('#rv').value, day = bg.querySelector('#hd').value, err = dateErr(day);
    if (!Number.isFinite(v) || bg.querySelector('#rv').value === '') return; if (err) return toast(err, 4000);
    bg.remove(); await updateProfile({ romLog: patchByTs(profile().romLog, r.ts, { deg: v, ts: withDay(r.ts, day), edited: true }) }); await refresh(); toast(t('saved')); viewHistory();
  };
}
function editPromSheet(r) {
  if (!r) return;
  const def = instrumentDef(r.id, profile()?.promCustom);
  const bg = sheet(`<h3>${t('histEditTitle')}</h3><p class="small muted">${esc(def ? tr(def.name) : r.id)}</p>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="hd" value="${dayKey(r.ts)}" max="${P.todayKey()}"></label><p class="note">${t('histPromNote')}</p>
    <div class="row"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  bg.querySelector('#hc').onclick = () => bg.remove();
  bg.querySelector('#hs').onclick = async () => {
    const day = bg.querySelector('#hd').value, err = dateErr(day); if (err) return toast(err, 4000);
    bg.remove(); await updateProfile({ promLog: patchByTs(profile().promLog, r.ts, { ts: withDay(r.ts, day), edited: true }) }); await refresh(); toast(t('saved')); viewHistory();
  };
}

// Saisie d'une séance faite sans l'app (ou oubliée) : date passée, exercices cochés, douleur, note
export function pastSessionSheet(defaultDay) {
  const prof = profile();
  const prog = P.todaysProgram(prof);
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const day0 = defaultDay || P.todayKey(yest.getTime());
  const bg = sheet(`<h3>${t('histPastTitle')}</h3>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="pd" value="${day0}" max="${P.todayKey()}" ${minDay() ? `min="${minDay()}"` : ''}></label>
    <h2 style="margin-top:12px">${t('histPastEx')}</h2>
    <div class="list">${prog.map((x) => `<button class="toggle" data-px="${x.id}" aria-pressed="true"><span><b>${esc(tr(EXERCISES[x.id].name))}</b><br><small class="muted">${x.dose.sets}×${x.dose.type === 'hold' ? x.dose.hold + ' ' + t('sec') : x.dose.reps}</small></span><span class="check on">${icon('check', 15)}</span></button>`).join('')}</div>
    <label class="field" style="margin-top:12px"><span>${t('histPain')}</span><input class="input tnum" type="number" min="0" max="10" step="1" inputmode="numeric" id="pp" value="" placeholder="–"></label>
    <label class="field"><span>${t('noteOpt')}</span><input class="input" id="pn" maxlength="400"></label>
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  const on = new Set(prog.map((x) => x.id));
  bg.querySelectorAll('[data-px]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.px, v = !on.has(id); v ? on.add(id) : on.delete(id);
    b.setAttribute('aria-pressed', String(v)); const c = b.querySelector('.check'); c.classList.toggle('on', v); c.innerHTML = v ? icon('check', 15) : '';
  }));
  bg.querySelector('#hc').onclick = () => bg.remove();
  bg.querySelector('#hs').onclick = async () => {
    const day = bg.querySelector('#pd').value, err = dateErr(day); if (err) return toast(err, 4000);
    const picked = prog.filter((x) => on.has(x.id)); if (!picked.length) return toast(t('histErrNoEx'), 4000);
    const pv = bg.querySelector('#pp').value, pain = pv === '' ? null : Math.max(0, Math.min(10, Math.round(+pv))), note = bg.querySelector('#pn').value.trim();
    const s = makeManualSession({ day, items: picked.map((x) => ({ id: x.id, level: x.level, sets: x.dose.sets, reps: x.dose.type === 'hold' ? 0 : x.dose.reps, pain, note })) });
    bg.remove(); await store.saveSession(s); await refresh(); toast(t('saved')); state.hist = state.hist || { tab: 'sessions', more: 0 }; state.hist.tab = 'sessions';
    if (location.hash === '#/history') viewHistory(); else go('#/history');
  };
}
