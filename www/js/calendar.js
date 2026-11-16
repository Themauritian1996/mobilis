// Calendrier de suivi : séances faites / prévues / manquées, rendez-vous, rappels (APK) et export agenda (web).
import { t, tp, tr, getLang, locale, dowNarrow } from './i18n.js';
import * as P from './program.js';
const { exceptionPatch } = P;
import * as store from './store.js';
import { state, profile, sessions, updateProfile, go, navRole } from './state.js';
import { esc, icon, toast, nav, sheet, saveFile, weekStartDay, weekOrder } from './ui.js';
import { canToggleDay, toggleDay, removeAt, buildIcs } from './longterm.js';
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
  const list = (prof.appointments || []).map((a, i) => ({ ...a, _i: i })); // _i : position dans profile.appointments (suppression d'un seul rendez-vous)
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
  const ws = weekStartDay(); // 1 = lundi, 0 = dimanche (réglage ; « auto » suit la langue)
  const offset = (first.getDay() - ws + 7) % 7;
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(m.getFullYear(), m.getMonth(), 1 - offset + i));
  const dw = dowNarrow(); const dow = weekOrder().map((d) => dw[d]);

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
  const webNotif = !native && typeof Notification !== 'undefined'; const webOn = webNotif && !!store.settings().webRemind && Notification.permission === 'granted';

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

    <h2>${selDate.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <div class="list">
      ${daySessions.map((s) => `<div class="card" style="margin-bottom:8px"><div class="row between"><b>${t('sessionDoneShort')}</b><span class="chip pos">${icon('check', 14)}</span></div>
        ${s.items.map((i) => { const ex = EXERCISES[i.id]; const ch = i.change > 0 ? '<span class="pos" title="+1">↑</span>' : i.change < 0 ? '<span class="neg" title="−1">↓</span>' : '';
          return `<div class="toggle" style="padding:8px 0"><span><b>${esc(ex ? tr(ex.name) : i.id)}</b><br><small class="muted">${t('level')} ${i.level ?? '–'}/5 ${ch} · ${(i.sets || []).length} ${t('calSets')}${i.pain != null ? ` · ${t('calPain')} ${i.pain}/10` : ''}${i.difficulty != null ? ` · ${t('calDifficulty')} ${i.difficulty}/5` : ''}</small></span></div>`; }).join('')}</div>`).join('')}
      ${!daySessions.length && si.planned ? `<div class="toggle"><span><b>${si.missed ? t('calMissed') : t('calPlanned')}</b><br><small class="muted">${tp('nEx', prog.length)}</small></span></div>
        ${prog.map((x) => `<div class="toggle" style="padding:8px 14px"><span>${esc(tr(EXERCISES[x.id].name))}<br><small class="muted">${t('level')} ${x.level}/5</small></span>${si.k <= key() ? `<button class="btn sm ghost" data-ex="${x.id}">${t('start')}</button>` : ''}</div>`).join('')}` : ''}
      ${!daySessions.length && !si.planned && !si.appt.length ? `<div class="toggle"><span class="muted">${inSkip ? t('calRestChosen') : t('restDay')}</span></div>` : ''}
      ${actions.length ? `<div class="row wrap" style="gap:8px;margin-top:4px">${actions.join('')}</div>` : ''}
      ${si.appt.map((a) => `<div class="toggle"><span><b>${t('calAppt')}${a.time ? ' · ' + esc(a.time) : ''}</b><br><small class="muted">${esc(a.note || '')}</small></span>${a.fromRx ? '' : `<button class="btn sm danger" data-del="${a._i}" aria-label="${t('remove')} ${esc(a.date)}">${t('remove')}</button>`}</div>`).join('')}
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
      <label class="field" style="margin:12px 0 0"><span>${t('time')}</span><input class="input" type="time" id="rt" value="${esc(remind.time || '18:00')}"></label>
      ${native ? '' : `${webNotif ? `<div class="toggle" style="padding:14px 0 0"><span><b>${t('webRemind')}</b><br><small class="muted">${t('webRemindD')}</small></span><button class="switch ${webOn ? 'on' : ''}" id="wrem" role="switch" aria-checked="${webOn}"></button></div>` : ''}
        <button class="btn ghost" id="ics" style="margin-top:12px">${icon('cal', 18)} ${t('addToAgenda')}</button>`}
    </div>
  </section>${nav('calendar', navRole())}`;

  const q = (s) => document.getElementById('app').querySelector(s), qa = (s) => document.getElementById('app').querySelectorAll(s);
  qa('[data-m]').forEach((b) => (b.onclick = () => { C.month = new Date(m.getFullYear(), m.getMonth() + +b.dataset.m, 1); viewCalendar(); }));
  qa('[data-d]').forEach((b) => (b.onclick = () => { C.sel = b.dataset.d; viewCalendar(); }));
  qa('[data-day]').forEach((b) => (b.onclick = async () => {
    const d = +b.dataset.day; const cur = prof.days || [1, 3, 5];
    if (!canToggleDay(cur, d)) return toast(t('calLastDay')); // le dernier jour d'entraînement ne se retire pas : on l'explique
    const days = toggleDay(cur, d);
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
    await updateProfile({ appointments: removeAt(profile().appointments || [], +b.dataset.del) });
    if (profile().remind?.on) await scheduleReminders(profile());
    toast(t('saved')); viewCalendar();
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
    // Date par défaut : le lendemain du jour sélectionné (jamais avant aujourd'hui)
    const nx = new Date(C.sel + 'T12:00'); nx.setDate(nx.getDate() + 1);
    const dflt = key(nx.getTime()) < key() ? key() : key(nx.getTime());
    const bg = sheet(`<h3>${t('calMoveTitle')}</h3><label class="field"><span>${t('calMoveTo')}</span><input class="input" type="date" id="mvd" min="${key()}" value="${dflt}"></label><p class="muted small" id="mvw" hidden>${t('calMoveBusy')}</p>
      <div class="row" style="gap:8px"><button class="btn ghost" id="mvc">${t('cancel')}</button><button class="btn" id="mvs">${t('save')}</button></div>`);
    bg.querySelector('#mvc').onclick = () => bg.remove();
    const mvd = bg.querySelector('#mvd'), warn = () => { bg.querySelector('#mvw').hidden = !(mvd.value && mvd.value !== C.sel && P.isPlannedDay(profile(), mvd.value)); };
    mvd.oninput = warn; warn();
    bg.querySelector('#mvs').onclick = async () => {
      const to = bg.querySelector('#mvd').value;
      if (!to || to < key()) return toast(t('calMoveFuture'));
      if (to === C.sel) return toast(t('calMoveSame')); // pas de sauvegarde silencieuse
      bg.remove(); await apply('move', to); C.sel = to; C.month = new Date(+to.slice(0, 4), +to.slice(5, 7) - 1, 1); viewCalendar();
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
  const rt = q('#rt'); if (rt) rt.onchange = async () => { const p = await updateProfile({ remind: { ...remind, time: rt.value || '18:00' } }); if (p.remind.on) await scheduleReminders(p); armWebReminder(); toast(t('saved')); };
  const wr = q('#wrem');
  if (wr) wr.onclick = async () => {
    if (webOn) { store.saveSettings({ webRemind: false }); armWebReminder(); return viewCalendar(); }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (_) {} }
    if (perm !== 'granted') { store.saveSettings({ webRemind: false }); toast(t('webRemindDenied'), 4000); return viewCalendar(); }
    store.saveSettings({ webRemind: true }); armWebReminder(); viewCalendar();
  };
  const ics = q('#ics'); if (ics) ics.onclick = () => downloadIcs(profile());
}

// ---------- Rappel du navigateur (web, au mieux) ----------
// Une notification les jours d'entraînement à l'heure choisie, tant que la page est ouverte ou active en arrière-plan.
// Limite : un navigateur ne réveille pas une page fermée sans serveur Web Push ; le fichier .ics reste le moyen fiable sur le web.
let wrTimer = 0;
export function armWebReminder() {
  clearTimeout(wrTimer); wrTimer = 0;
  const prof = profile();
  if (store.isNative() || !prof || prof.role === 'clinician' || !store.settings().webRemind || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const [h, m] = (prof.remind?.time || '18:00').split(':').map(Number);
  const now = new Date();
  let at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
  if (at.getTime() <= now.getTime() + 1000) at = new Date(at.getTime() + DAY);
  wrTimer = setTimeout(async () => {
    const p = profile();
    if (p && P.isPlannedDay(p, key()) && !sessions().some((x) => key(x.date) === key())) {
      const opts = { body: t('remindBody'), icon: 'icons/icon-192.png', tag: 'mobilis-daily' };
      try { const reg = await navigator.serviceWorker?.getRegistration?.(); if (reg?.showNotification) reg.showNotification('Mobilis', opts); else new Notification('Mobilis', opts); } catch (_) { try { new Notification('Mobilis', opts); } catch (__) {} }
    }
    armWebReminder();
  }, Math.min(at.getTime() - now.getTime(), 2147000000));
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) armWebReminder(); });

// ---------- Rappels (APK) ----------
// Les rappels sont ponctuels (6 semaines) : on les replanifie une fois par jour à l'ouverture de l'app
export function refreshReminders(prof) {
  armWebReminder();
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
// Commence un jour d'entraînement, à l'heure du rappel choisie. APK : Filesystem + feuille de partage ; web : téléchargement.
async function downloadIcs(prof) {
  const text = buildIcs({ days: prof.days, time: prof.remind?.time || '18:00', appts: appointments(prof), labels: { title: t('icsTitle'), desc: t('icsDesc'), appt: t('calAppt') } });
  try { await saveFile(text, 'mobilis.ics', 'text/calendar', { title: t('icsTitle') }); toast(t('icsDone'), 4000); }
  catch (e) { console.warn(e); toast(t('fileErr'), 4000); }
}
