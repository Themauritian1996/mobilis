// Calendrier de suivi : séances faites / prévues / manquées, rendez-vous, rappels (APK) et export agenda (web).
import { t, tr, getLang, locale, dowNarrow } from './i18n.js';
import * as P from './program.js';
const { exceptionPatch } = P;
import * as store from './store.js';
import { state, profile, sessions, updateProfile, go, navRole } from './state.js';
import { esc, icon, toast, nav, sheet } from './ui.js';
import { EXERCISES } from './data/exercises.js';
import { daysPicker } from './onboarding.js';

const DAY = 86400000;
const key = P.todayKey;

function dayInfo(prof, d, done, appts) {
  const k = key(d.getTime());
  const today = key();
  const planned = P.isPlannedDay(prof, k);
  return {
    k, done: done.has(k), planned, appt: appts.filter((a) => a.date === k),
    missed: planned && !done.has(k) && k < today, future: k >= today,
  };
}
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

const hasException = (prof, k) => (prof.calSkip || []).includes(k) || (prof.calExtra || []).includes(k) || (prof.calMoves || {})[k] != null || Object.values(prof.calMoves || {}).includes(k);

export function appointments(prof) {
  const list = [...(prof.appointments || [])];
  if (prof.nextVisit && !list.some((a) => a.date === prof.nextVisit)) list.push({ date: prof.nextVisit, time: '', note: prof.clinician ? `${t('nextVisit')} — ${prof.clinician}` : t('nextVisit'), fromRx: true });
  return list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function viewCalendar() {
  const prof = profile();
  const C = state.cal;
  const now = new Date();
  if (!C.month) C.month = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!C.sel) C.sel = key();
  const done = new Set(sessions().map((s) => key(s.date)));
  const appts = appointments(prof);
  const m = C.month;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // semaine qui commence lundi
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(m.getFullYear(), m.getMonth(), 1 - offset + i));
  const dw = dowNarrow(); const dow = [1, 2, 3, 4, 5, 6, 0].map((d) => dw[d]);

  const selDate = new Date(C.sel + 'T12:00');
  const si = dayInfo(prof, selDate, done, appts);
  const daySessions = sessions().filter((s) => key(s.date) === C.sel);
  const adh = P.monthAdherence(prof, sessions(), m.getFullYear(), m.getMonth());
  const monthDone = adh.sessions;
  const native = store.isNative();
  const prog = P.todaysProgram(prof);
  const inSkip = (prof.calSkip || []).includes(C.sel);
  const actions = [];
  if (!daySessions.length) {
    if (si.planned && si.k <= key()) actions.push(`<button class="btn sm" data-act="quickstart">${t('calDoNow')}</button>`);
    if (si.planned) actions.push(`<button class="btn sm ghost" id="calMove">${t('calMove')}</button>`, `<button class="btn sm ghost" id="calRest">${t('calRestBtn')}</button>`);
    else if (si.k >= key()) actions.push(`<button class="btn sm ghost" id="calAdd">${icon('plus', 14)} ${t('calAddSession')}</button>`);
  }
  if (hasException(prof, C.sel)) actions.push(`<button class="btn sm ghost" id="calUndo">${t('calUndo')}</button>`);
  const remind = prof.remind || { on: false, time: '18:00' };

  document.getElementById('app').innerHTML = `<section class="screen">
    <div class="topbar"><h1>${t('calendar')}</h1><span class="chip">${icon('flame', 14)} ${P.streak(prof, sessions())} ${t('streak')}</span></div>
    <div class="card">
      <div class="row between" style="margin-bottom:12px"><button class="icon-btn" data-m="-1" aria-label="${t('prevMonth')}">${icon('back', 18)}</button>
        <b style="text-transform:capitalize">${m.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</b>
        <button class="icon-btn" data-m="1" aria-label="${t('nextMonth')}" style="transform:scaleX(-1)">${icon('back', 18)}</button></div>
      <div class="cal-head">${dow.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal">${cells.map((d) => {
        const info = dayInfo(prof, d, done, appts);
        const dots = [info.done ? 'd-done' : info.missed ? 'd-miss' : info.planned && info.future ? 'd-plan' : '', info.appt.length ? 'd-appt' : ''].filter(Boolean);
        return `<button data-d="${info.k}" class="${d.getMonth() !== m.getMonth() ? 'out' : ''} ${info.k === key() ? 'today' : ''} ${info.k === C.sel ? 'sel' : ''}" aria-label="${d.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}">${d.getDate()}<span class="dots">${dots.map((c) => `<i class="${c}"></i>`).join('')}</span></button>`;
      }).join('')}</div>
      <div class="legend" style="margin-top:12px"><span><i class="d-done"></i>${t('calDone')}</span><span><i class="d-plan" style="height:6px;width:6px;border-radius:50%"></i>${t('calPlanned')}</span><span><i class="d-miss"></i>${t('calMissed')}</span><span><i class="d-appt"></i>${t('calAppt')}</span></div>
    </div>
    <div class="list" style="margin-top:10px"><div class="kpis"><div><b>${monthDone}</b><span>${t('sessionsMonth')}</span></div><div><b>${adh.pct}%</b><span>${t('adherence')}</span></div><div><b>${P.weekNumber(prof)}</b><span>${t('week')}</span></div></div></div>

    <h2 style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--ink)">${selDate.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <div class="list">
      ${daySessions.map((s) => `<div class="card" style="margin-bottom:8px"><div class="row between"><b>${t('sessionDoneShort')}</b><span class="chip pos">${icon('check', 14)}</span></div>
        ${s.items.map((i) => { const ex = EXERCISES[i.id]; const ch = i.change > 0 ? '<span class="pos" title="+1">↑</span>' : i.change < 0 ? '<span class="neg" title="−1">↓</span>' : '';
          return `<div class="toggle" style="padding:8px 0"><span><b>${esc(ex ? tr(ex.name) : i.id)}</b><br><small class="muted">${t('level')} ${i.level ?? '–'}/5 ${ch} · ${(i.sets || []).length} ${t('calSets')}${i.pain != null ? ` · ${t('calPain')} ${i.pain}/10` : ''}${i.difficulty != null ? ` · ${t('calDifficulty')} ${i.difficulty}/5` : ''}</small></span></div>`; }).join('')}</div>`).join('')}
      ${!daySessions.length && si.planned ? `<div class="toggle"><span><b>${si.missed ? t('calMissed') : t('calPlanned')}</b><br><small class="muted">${prog.length} ${t('exercises').toLowerCase()}</small></span></div>
        ${prog.map((x) => `<div class="toggle" style="padding:8px 14px"><span>${esc(tr(EXERCISES[x.id].name))}<br><small class="muted">${t('level')} ${x.level}/5</small></span>${si.k <= key() ? `<button class="btn sm ghost" data-ex="${x.id}">${t('start')}</button>` : ''}</div>`).join('')}` : ''}
      ${!daySessions.length && !si.planned && !si.appt.length ? `<div class="toggle"><span class="muted">${inSkip ? t('calRestChosen') : t('restDay')}</span></div>` : ''}
      ${actions.length ? `<div class="row wrap" style="gap:8px;margin-top:4px">${actions.join('')}</div>` : ''}
      ${si.appt.map((a) => `<div class="toggle"><span><b>${t('calAppt')}${a.time ? ' · ' + esc(a.time) : ''}</b><br><small class="muted">${esc(a.note || '')}</small></span>${a.fromRx ? '' : `<button class="btn sm danger" data-del="${esc(a.date + '|' + a.time)}">${t('remove')}</button>`}</div>`).join('')}
      ${!daySessions.length && !si.planned && !si.appt.length ? `<div class="toggle"><span class="muted">${t('restDay')}</span></div>` : ''}
    </div>

    <h2>${t('addAppt')}</h2>
    <div class="card"><div class="grid2"><label class="field"><span>${t('date')}</span><input class="input" type="date" id="ad" value="${C.sel}"></label><label class="field"><span>${t('time')}</span><input class="input" type="time" id="at" value="09:00"></label></div>
      <label class="field"><span>${t('noteOpt')}</span><input class="input" id="an" placeholder="${t('apptPh')}"></label>
      <button class="btn ghost" id="addAppt">${icon('plus', 18)} ${t('addAppt')}</button></div>

    <h2>${t('trainDays')}</h2>
    <div class="card">${daysPicker(prof.days || [1, 3, 5])}
      <div class="toggle" style="padding:14px 0 0"><span><b>${t('reminders')}</b><br><small class="muted">${native ? t('remindersD') : t('remindersWeb')}</small></span>
        ${native ? `<button class="switch ${remind.on ? 'on' : ''}" id="rem" role="switch" aria-checked="${remind.on}"></button>` : ''}</div>
      ${native ? `<label class="field" style="margin:12px 0 0"><span>${t('time')}</span><input class="input" type="time" id="rt" value="${remind.time}"></label>`
        : `<button class="btn ghost" id="ics" style="margin-top:12px">${icon('cal', 18)} ${t('addToAgenda')}</button>`}
    </div>
  </section>${nav('calendar', navRole())}`;

  const q = (s) => document.getElementById('app').querySelector(s), qa = (s) => document.getElementById('app').querySelectorAll(s);
  qa('[data-m]').forEach((b) => (b.onclick = () => { C.month = new Date(m.getFullYear(), m.getMonth() + +b.dataset.m, 1); viewCalendar(); }));
  qa('[data-d]').forEach((b) => (b.onclick = () => { C.sel = b.dataset.d; viewCalendar(); }));
  qa('[data-day]').forEach((b) => (b.onclick = async () => {
    const d = +b.dataset.day; let days = prof.days || [1, 3, 5];
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    if (!days.length) return;
    await updateProfile({ days, perWeek: days.length });
    if (profile().remind?.on) await scheduleReminders(profile());
    viewCalendar();
  }));
  q('#addAppt').onclick = async () => {
    const date = q('#ad').value; if (!date) return;
    const list = [...(prof.appointments || []), { date, time: q('#at').value, note: q('#an').value.trim() }];
    await updateProfile({ appointments: list });
    if (profile().remind?.on) await scheduleReminders(profile());
    C.sel = date; toast(t('apptAdded')); viewCalendar();
  };
  qa('[data-del]').forEach((b) => (b.onclick = async () => {
    const [date, time] = b.dataset.del.split('|');
    await updateProfile({ appointments: (prof.appointments || []).filter((a) => !(a.date === date && a.time === time)) });
    viewCalendar();
  }));
  const apply = async (op, to) => {
    await updateProfile(exceptionPatch(profile(), op, C.sel, to));
    if (profile().remind?.on) await scheduleReminders(profile());
    toast(t('saved')); viewCalendar();
  };
  qa('[data-ex]').forEach((b) => (b.onclick = () => go('#/ex/' + b.dataset.ex)));
  const bRest = q('#calRest'); if (bRest) bRest.onclick = () => apply('rest');
  const bAdd = q('#calAdd'); if (bAdd) bAdd.onclick = () => apply('add');
  const bUndo = q('#calUndo'); if (bUndo) bUndo.onclick = () => apply('undo');
  const bMove = q('#calMove');
  if (bMove) bMove.onclick = () => {
    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    const bg = sheet(`<h3>${t('calMoveTitle')}</h3><label class="field"><span>${t('calMoveTo')}</span><input class="input" type="date" id="mvd" min="${key()}" value="${key(tmr.getTime())}"></label>
      <div class="row" style="gap:8px"><button class="btn ghost" id="mvc">${t('cancel')}</button><button class="btn" id="mvs">${t('save')}</button></div>`);
    bg.querySelector('#mvc').onclick = () => bg.remove();
    bg.querySelector('#mvs').onclick = async () => {
      const to = bg.querySelector('#mvd').value; if (!to || to < key()) return;
      bg.remove(); if (to === C.sel) return; await apply('move', to); C.sel = to; C.month = new Date(+to.slice(0, 4), +to.slice(5, 7) - 1, 1); viewCalendar();
    };
  };
  const rem = q('#rem');
  if (rem) rem.onclick = async () => {
    const on = !remind.on;
    const p = await updateProfile({ remind: { ...remind, on } });
    const ok = on ? await scheduleReminders(p) : await clearReminders();
    if (on && !ok) { await updateProfile({ remind: { ...remind, on: false } }); toast(t('notifDenied'), 4000); }
    viewCalendar();
  };
  const rt = q('#rt'); if (rt) rt.onchange = async () => { const p = await updateProfile({ remind: { ...remind, time: rt.value } }); if (p.remind.on) await scheduleReminders(p); toast(t('saved')); };
  const ics = q('#ics'); if (ics) ics.onclick = () => downloadIcs(profile());
}

// ---------- Rappels (APK) ----------
// Les rappels sont ponctuels (6 semaines) : on les replanifie une fois par jour à l'ouverture de l'app
export function refreshReminders(prof) {
  if (!prof?.remind?.on || !store.isNative()) return;
  try { if (localStorage.getItem('mobilis.remindDay') === P.todayKey()) return; localStorage.setItem('mobilis.remindDay', P.todayKey()); } catch (_) {}
  scheduleReminders(prof);
}
async function clearReminders() {
  try {
    const { LocalNotifications } = await store.cap();
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    return true;
  } catch (_) { return false; }
}
export async function scheduleReminders(prof) {
  if (!store.isNative()) return false;
  try {
    const { LocalNotifications } = await store.cap();
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await clearReminders();
    const [h, mi] = (prof.remind?.time || '18:00').split(':').map(Number);
    // Rappels ponctuels pour les 6 prochaines semaines, jour par jour (respecte les jours déplacés, de repos et ajoutés) ;
    // replanifiés à chaque ouverture de l'app
    const notifications = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0, n = 0; i < 42 && n < 60; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, h, mi);
      if (d.getTime() <= Date.now() || !P.isPlannedDay(prof, P.todayKey(d.getTime()))) continue;
      notifications.push({ id: 100 + n++, title: 'Mobilis', body: t('remindBody'), schedule: { at: d, allowWhileIdle: true } });
    }
    for (const [i, a] of appointments(prof).entries()) {
      const at = new Date(`${a.date}T${a.time || '09:00'}`); at.setDate(at.getDate() - 1); at.setHours(18, 0, 0, 0);
      if (at.getTime() > Date.now()) notifications.push({ id: 500 + i, title: 'Mobilis', body: `${t('apptTomorrow')}${a.time ? ' ' + a.time : ''}${a.note ? ' — ' + a.note : ''}`, schedule: { at, allowWhileIdle: true } });
    }
    await LocalNotifications.schedule({ notifications });
    return true;
  } catch (e) { console.warn(e); return false; }
}

// ---------- Export agenda (.ics) pour le site web ----------
function downloadIcs(prof) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const by = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const start = new Date(); start.setHours(18, 0, 0, 0);
  const dt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const end = new Date(start.getTime() + 30 * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mobilis//FR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:mobilis-plan-${stamp}`, `DTSTAMP:${stamp}`, `DTSTART:${dt(start)}`, `DTEND:${dt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${(prof.days || [1, 3, 5]).map((d) => by[d]).join(',')}`, `SUMMARY:${t('icsTitle')}`,
    `DESCRIPTION:${t('icsDesc')}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${t('icsTitle')}`, 'END:VALARM', 'END:VEVENT'];
  appointments(prof).forEach((a, i) => {
    const s = new Date(`${a.date}T${a.time || '09:00'}`), e = new Date(s.getTime() + 45 * 60000);
    lines.push('BEGIN:VEVENT', `UID:mobilis-appt-${i}-${a.date}`, `DTSTAMP:${stamp}`, `DTSTART:${dt(s)}`, `DTEND:${dt(e)}`, `SUMMARY:${t('calAppt')}${a.note ? ' — ' + a.note.replace(/[,;\n]/g, ' ') : ''}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mobilis.ics'; a.click();
  toast(t('icsDone'), 4000);
}
