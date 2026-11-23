// Historique complet : séances, journal de douleur, amplitudes et questionnaires — avec plage de dates, modification, suppression
// (avec confirmation) et saisie d'une séance manquée (reprise de www/js/history.js).
// La logique pure est dans longterm.js (testée dans tests/maint.test.mjs).
import { t, locale } from '../../../www/js/i18n.js';
import { tr } from '../components/l10n.ts';
import * as P from '../../../www/js/program.js';
import * as store from '../../../www/js/store.js';
import { EXERCISES as EXERCISE_DATA } from '../../../www/js/data/exercises.js';
import { TESTS as ROM_TESTS } from '../../../www/js/data/romtests.js';
import { instrumentDef } from '../../../www/js/data/proms.js';
import {
  RANGES,
  inRange,
  editSession,
  makeManualSession,
  validPastDay,
  removeByTs,
  patchByTs,
} from '../../../www/js/longterm.js';
import {
  state,
  journal,
  go,
  profile,
  sessions,
  syncProgress,
  updateProfile,
  navRole,
  type JournalEntry,
  type Profile,
  type SessionRecord,
} from '../app-state.ts';
import type { LogEntry } from '../../domains/rehab/types.ts';
import { esc } from '../components/html.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { nav } from '../components/nav.ts';
import { sheet, confirmSheet } from '../components/sheet.ts';
import { isNil } from '../util.ts';

const EXERCISES = EXERCISE_DATA as unknown as Record<string, { name: unknown } | undefined>;
const TESTS = ROM_TESTS as unknown as Record<string, { name: unknown; unit?: string } | undefined>;

interface RomRow extends LogEntry {
  test: string;
  deg: number;
  method?: string | undefined;
}
interface PromRow extends LogEntry {
  id: string;
  score?: number | undefined;
}
type PromCustom = Parameters<typeof instrumentDef>[1];
interface HistProfile extends Profile {
  romLog?: RomRow[];
  promLog?: PromRow[];
  promCustom?: unknown[] | undefined;
  startDate?: number | undefined;
}

const $app = (): HTMLElement => document.getElementById('app')!;
const fmt = (
  ts: number,
  o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
): string => new Date(ts).toLocaleDateString(locale(), o);
const RANGE_KEY: Record<string, string> = { '4w': 'rg4w', '3m': 'rg3m', all: 'rgAll' };
const TABS: [string, string][] = [
  ['sessions', 'histSessions'],
  ['journal', 'histJournal'],
  ['rom', 'histRom'],
  ['prom', 'histProm'],
];
const SHOW = 25;

// Sélecteur de plage réutilisé par l'écran Progrès
export const rangeSeg = (cur: string): string =>
  `<div class="seg" role="group" aria-label="${t('rgLabel')}">${(RANGES as string[]).map((r) => `<button data-range="${r}" aria-pressed="${cur === r}" class="${cur === r ? 'on' : ''}">${t(RANGE_KEY[r] ?? r)}</button>`).join('')}</div>`;
export const getRange = (): string => ((RANGES as string[]).includes(state.range ?? '') ? state.range! : '3m');

const romLabel = (r: RomRow): string => {
  const T = TESTS[r.test];
  return `${T ? tr(T.name) : r.test}${r.side ? ' · ' + t(r.side === 'L' ? 'sideLeft' : 'sideRight') : ''}`;
};
const romVal = (r: RomRow): string => {
  const T = TESTS[r.test];
  return Number.isFinite(r.deg) ? `${Math.round(r.deg)}${T && T.unit === '%' ? ' %' : '°'}` : '–';
};
const dayKey = (ts: number): string => P.todayKey(ts);
// Garde l'heure d'origine si le jour n'a pas changé ; sinon midi du nouveau jour
const withDay = (ts: number, day: string): number => (dayKey(ts) === day ? ts : new Date(day + 'T12:00').getTime());
const exName = (id: string): string => {
  const ex = EXERCISES[id];
  return ex ? tr(ex.name) : id;
};
const clampPain = (v: number): number => Math.max(0, Math.min(10, Math.round(v)));

async function refresh(): Promise<void> {
  state.data = await store.loadData();
  try {
    await syncProgress();
  } catch {
    /* le partage du suivi est facultatif : on continue */
  }
}
async function del(msg: string | null, fn: () => unknown): Promise<void> {
  if (!(await confirmSheet({ title: t('histDelAsk'), text: t('histDelD'), ok: t('delete'), danger: true }))) return;
  await fn();
  await refresh();
  toast(msg || t('histDeleted'));
  viewHistory();
}

export function viewHistory(): void {
  const prof = profile() as HistProfile;
  const H = state.hist || (state.hist = { tab: 'sessions', more: 0 });
  const range = getRange();
  const now = Date.now();
  let rows: string;
  let total: number;
  if (H.tab === 'sessions') {
    const list = sessions()
      .filter((s) => inRange(s.date, range, now))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    total = list.length;
    rows = list
      .slice(0, SHOW + H.more)
      .map(
        (
          s,
        ) => `<div class="hist-row"><div class="grow"><b>${fmt(s.date ?? 0)}</b>${s.manual ? ` <span class="chip sm">${t('histManual')}</span>` : ''}
        <div class="small muted">${(s.items ?? []).map((i) => `${esc(exName(i.id))}${!isNil(i.pain) ? ' · ' + i.pain + '/10' : ''}${i.note ? ' — « ' + esc(i.note) + ' »' : ''}`).join('<br>')}</div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${esc(s.id)}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${esc(s.id)}" aria-label="${t('delete')} ${fmt(s.date ?? 0)}">${t('delete')}</button></div></div>`,
      )
      .join('');
  } else if (H.tab === 'journal') {
    const list = journal()
      .filter((j) => inRange(j.ts || new Date(j.day + 'T12:00').getTime(), range, now))
      .sort((a, b) => b.day.localeCompare(a.day));
    total = list.length;
    rows = list
      .slice(0, SHOW + H.more)
      .map(
        (
          j,
        ) => `<div class="hist-row"><div class="grow"><b>${fmt(new Date(j.day + 'T12:00').getTime())}</b><div class="small muted">${t('histPain')} : <b class="tnum">${j.pain}</b></div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${esc(j.day)}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${esc(j.day)}" aria-label="${t('delete')} ${esc(j.day)}">${t('delete')}</button></div></div>`,
      )
      .join('');
  } else if (H.tab === 'rom') {
    const list = (prof.romLog || []).filter((r) => inRange(r.ts, range, now)).sort((a, b) => b.ts - a.ts);
    total = list.length;
    rows = list
      .slice(0, SHOW + H.more)
      .map(
        (
          r,
        ) => `<div class="hist-row"><div class="grow"><b>${esc(romLabel(r))}</b><div class="small muted">${fmt(r.ts)} · <b class="tnum">${romVal(r)}</b>${r.method === 'manual' ? ' · ' + t('histManual') : ''}</div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${r.ts}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${r.ts}" aria-label="${t('delete')} ${esc(romLabel(r))}">${t('delete')}</button></div></div>`,
      )
      .join('');
  } else {
    const list = (prof.promLog || []).filter((r) => inRange(r.ts, range, now)).sort((a, b) => b.ts - a.ts);
    total = list.length;
    rows = list
      .slice(0, SHOW + H.more)
      .map((r) => {
        const def = instrumentDef(r.id, prof.promCustom as PromCustom);
        const nm: string = def ? tr(def.name) : r.id;
        return `<div class="hist-row"><div class="grow"><b>${esc(nm)}</b><div class="small muted">${fmt(r.ts)}${typeof r.score === 'number' ? ' · <b class="tnum">' + r.score + '</b>' : ''}</div></div>
        <div class="hist-act"><button class="btn sm ghost" data-edit="${r.ts}">${t('edit')}</button><button class="btn sm ghost danger" data-del="${r.ts}" aria-label="${t('delete')} ${esc(nm)}">${t('delete')}</button></div></div>`;
      })
      .join('');
  }
  $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('histTitle')}</h1></div>
    ${rangeSeg(range)}
    <div class="pills" role="tablist" style="margin-top:12px">${TABS.map(([id, k]) => `<button class="pill ${H.tab === id ? 'on' : ''}" role="tab" aria-selected="${H.tab === id}" data-tab="${id}">${t(k)}</button>`).join('')}</div>
    ${H.tab === 'sessions' && prof.pathology ? `<button class="btn ghost" data-a="past" style="margin-top:12px">${icon('plus', 18)} ${t('histAddPast')}</button>` : ''}
    <div class="list hist" style="margin-top:12px">${rows || `<div class="toggle muted">${t('histNone')}</div>`}</div>
    ${total > SHOW + H.more ? `<button class="btn ghost" data-a="more" style="margin-top:10px">${t('histMore')} (${total - SHOW - H.more})</button>` : ''}
    ${store.isCloud() ? `<p class="note">${t('histCloudNote')}</p>` : ''}
  </section>${nav('progress', navRole())}`;
  const q = (s: string): HTMLElement | null => $app().querySelector<HTMLElement>(s);
  const qa = (s: string): NodeListOf<HTMLElement> => $app().querySelectorAll<HTMLElement>(s);
  qa('[data-range]').forEach(
    (b) =>
      (b.onclick = () => {
        state.range = b.dataset['range'];
        H.more = 0;
        viewHistory();
      }),
  );
  qa('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        H.tab = b.dataset['tab'] ?? 'sessions';
        H.more = 0;
        viewHistory();
      }),
  );
  const more = q('[data-a="more"]');
  if (more)
    more.onclick = () => {
      H.more += SHOW;
      viewHistory();
    };
  const past = q('[data-a="past"]');
  if (past) past.onclick = () => pastSessionSheet();
  qa('[data-del]').forEach(
    (b) =>
      (b.onclick = () => {
        const k = b.dataset['del'] ?? '';
        if (H.tab === 'sessions') return del(null, () => store.deleteSession(k));
        if (H.tab === 'journal') return del(null, () => store.deleteJournal(k));
        if (H.tab === 'rom')
          return del(null, () => updateProfile({ romLog: removeByTs((profile() as HistProfile).romLog, +k) }));
        return del(null, () => updateProfile({ promLog: removeByTs((profile() as HistProfile).promLog, +k) }));
      }),
  );
  qa('[data-edit]').forEach(
    (b) =>
      (b.onclick = () => {
        const k = b.dataset['edit'] ?? '';
        if (H.tab === 'sessions') return editSessionSheet(sessions().find((s) => s.id === k));
        if (H.tab === 'journal') return editJournalSheet(journal().find((j) => j.day === k));
        if (H.tab === 'rom') return editRomSheet(((profile() as HistProfile).romLog || []).find((r) => r.ts === +k));
        return editPromSheet(((profile() as HistProfile).promLog || []).find((r) => r.ts === +k));
      }),
  );
}

const minDay = (): string => {
  const p = profile() as HistProfile | undefined;
  return p?.startDate ? dayKey(p.startDate) : '';
};
const dateErr = (day: string): string | null => {
  const e = validPastDay(day, (profile() as HistProfile | undefined)?.startDate);
  return e === 'future' ? t('histErrFuture') : e === 'before' ? t('histErrBefore') : e ? t('histErrFuture') : null;
};

function editSessionSheet(s: SessionRecord | undefined): void {
  if (!s) return;
  const items = s.items ?? [];
  const bg = sheet(`<h3>${t('histEditTitle')}</h3>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="hd" value="${dayKey(s.date ?? 0)}" max="${P.todayKey()}"></label>
    ${items
      .map(
        (i, k) => `<div class="card" style="margin-bottom:8px" data-it="${k}"><b>${esc(exName(i.id))}</b>
      <div class="grid2" style="margin-top:8px"><label class="field"><span>${t('histPain')}</span><input class="input tnum" type="number" min="0" max="10" step="1" inputmode="numeric" data-pain value="${i.pain ?? ''}"></label>
      <div class="field"><span>&nbsp;</span><button class="btn sm ghost danger" data-rm>${t('histRemoveEx')}</button></div></div>
      <label class="field"><span>${t('noteOpt')}</span><input class="input" data-note maxlength="400" value="${esc(i.note || '')}"></label></div>`,
      )
      .join('')}
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  const rm = new Set<number>();
  bg.querySelectorAll<HTMLElement>('[data-rm]').forEach(
    (b) =>
      (b.onclick = () => {
        const card = b.closest<HTMLElement>('[data-it]')!;
        const k = +(card.dataset['it'] ?? 0);
        const on = !rm.has(k);
        if (on) rm.add(k);
        else rm.delete(k);
        card.style.opacity = on ? '.45' : '';
        b.setAttribute('aria-pressed', String(on));
      }),
  );
  bg.querySelector<HTMLElement>('#hc')!.onclick = () => bg.remove();
  bg.querySelector<HTMLElement>('#hs')!.onclick = async () => {
    const day = bg.querySelector<HTMLInputElement>('#hd')!.value;
    const err = dateErr(day);
    if (err) return toast(err, 4000);
    const edits: Record<number, { pain: number | null; note: string }> = {};
    bg.querySelectorAll<HTMLElement>('[data-it]').forEach((el) => {
      const k = +(el.dataset['it'] ?? 0);
      const v = el.querySelector<HTMLInputElement>('[data-pain]')!.value;
      edits[k] = {
        pain: v === '' ? null : clampPain(+v),
        note: el.querySelector<HTMLInputElement>('[data-note]')!.value.trim(),
      };
    });
    if (rm.size >= items.length) {
      bg.remove();
      return del(null, () => store.deleteSession(s.id)); // plus aucun exercice : on supprime la séance (avec confirmation)
    }
    const ns = editSession(s, { day, items: edits, remove: [...rm] } as unknown as Parameters<typeof editSession>[1]);
    bg.remove();
    await store.saveSession(ns);
    await refresh();
    toast(t('saved'));
    viewHistory();
  };
}
function editJournalSheet(j: JournalEntry | undefined): void {
  if (!j) return;
  const bg =
    sheet(`<h3>${t('histEditTitle')}</h3><p class="small muted">${fmt(new Date(j.day + 'T12:00').getTime())}</p>
    <label class="field"><span>${t('histPain')}</span><input class="input tnum" type="number" min="0" max="10" step="1" inputmode="numeric" id="jp" value="${j.pain}"></label>
    <div class="row"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  bg.querySelector<HTMLElement>('#hc')!.onclick = () => bg.remove();
  bg.querySelector<HTMLElement>('#hs')!.onclick = async () => {
    const v = bg.querySelector<HTMLInputElement>('#jp')!.value;
    if (v === '') return;
    bg.remove();
    await store.saveJournal({ ...j, pain: clampPain(+v) });
    await refresh();
    toast(t('saved'));
    viewHistory();
  };
}
function editRomSheet(r: RomRow | undefined): void {
  if (!r) return;
  const T = TESTS[r.test];
  const bg = sheet(`<h3>${t('histEditTitle')}</h3><p class="small muted">${esc(romLabel(r))}</p>
    <label class="field"><span>${t('histDegrees')} (${T && T.unit === '%' ? '%' : '°'})</span><input class="input tnum" type="number" step="1" inputmode="decimal" id="rv" value="${Math.round(r.deg)}"></label>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="hd" value="${dayKey(r.ts)}" max="${P.todayKey()}"></label>
    <div class="row"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  bg.querySelector<HTMLElement>('#hc')!.onclick = () => bg.remove();
  bg.querySelector<HTMLElement>('#hs')!.onclick = async () => {
    const rv = bg.querySelector<HTMLInputElement>('#rv')!;
    const v = +rv.value;
    const day = bg.querySelector<HTMLInputElement>('#hd')!.value;
    const err = dateErr(day);
    if (!Number.isFinite(v) || rv.value === '') return;
    if (err) return toast(err, 4000);
    bg.remove();
    await updateProfile({
      romLog: patchByTs((profile() as HistProfile).romLog, r.ts, { deg: v, ts: withDay(r.ts, day), edited: true }),
    });
    await refresh();
    toast(t('saved'));
    viewHistory();
  };
}
function editPromSheet(r: PromRow | undefined): void {
  if (!r) return;
  const def = instrumentDef(r.id, (profile() as HistProfile | undefined)?.promCustom as PromCustom);
  const bg = sheet(`<h3>${t('histEditTitle')}</h3><p class="small muted">${esc(def ? tr(def.name) : r.id)}</p>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="hd" value="${dayKey(r.ts)}" max="${P.todayKey()}"></label><p class="note">${t('histPromNote')}</p>
    <div class="row"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  bg.querySelector<HTMLElement>('#hc')!.onclick = () => bg.remove();
  bg.querySelector<HTMLElement>('#hs')!.onclick = async () => {
    const day = bg.querySelector<HTMLInputElement>('#hd')!.value;
    const err = dateErr(day);
    if (err) return toast(err, 4000);
    bg.remove();
    await updateProfile({
      promLog: patchByTs((profile() as HistProfile).promLog, r.ts, { ts: withDay(r.ts, day), edited: true }),
    });
    await refresh();
    toast(t('saved'));
    viewHistory();
  };
}

interface ProgramItem {
  id: string;
  level: number;
  dose: { sets: number; type: string; hold?: number | undefined; reps?: number | undefined };
}

// Saisie d'une séance faite sans l'app (ou oubliée) : date passée, exercices cochés, douleur, note
export function pastSessionSheet(defaultDay?: string, onDone?: () => unknown): void {
  const prof = profile() as Profile;
  const prog: ProgramItem[] = P.todaysProgram(prof);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const day0 = defaultDay || P.todayKey(yest.getTime());
  const bg = sheet(`<h3>${t('histPastTitle')}</h3>
    <label class="field"><span>${t('date')}</span><input class="input" type="date" id="pd" value="${day0}" max="${P.todayKey()}" ${minDay() ? `min="${minDay()}"` : ''}></label>
    <h2 style="margin-top:12px">${t('histPastEx')}</h2>
    <div class="list">${prog.map((x) => `<button class="toggle" data-px="${x.id}" aria-pressed="true"><span><b>${esc(tr(EXERCISES[x.id]!.name))}</b><br><small class="muted">${x.dose.sets}×${x.dose.type === 'hold' ? x.dose.hold + ' ' + t('sec') : x.dose.reps}</small></span><span class="check on">${icon('check', 15)}</span></button>`).join('')}</div>
    <label class="field" style="margin-top:12px"><span>${t('histPain')}</span><input class="input tnum" type="number" min="0" max="10" step="1" inputmode="numeric" id="pp" value="" placeholder="–"></label>
    <label class="field"><span>${t('noteOpt')}</span><input class="input" id="pn" maxlength="400"></label>
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="hc">${t('cancel')}</button><button class="btn" id="hs">${t('save')}</button></div>`);
  const on = new Set(prog.map((x) => x.id));
  bg.querySelectorAll<HTMLElement>('[data-px]').forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset['px'] ?? '';
        const v = !on.has(id);
        if (v) on.add(id);
        else on.delete(id);
        b.setAttribute('aria-pressed', String(v));
        const c = b.querySelector<HTMLElement>('.check')!;
        c.classList.toggle('on', v);
        c.innerHTML = v ? icon('check', 15) : '';
      }),
  );
  bg.querySelector<HTMLElement>('#hc')!.onclick = () => bg.remove();
  bg.querySelector<HTMLElement>('#hs')!.onclick = async () => {
    const day = bg.querySelector<HTMLInputElement>('#pd')!.value;
    const err = dateErr(day);
    if (err) return toast(err, 4000);
    const picked = prog.filter((x) => on.has(x.id));
    if (!picked.length) return toast(t('histErrNoEx'), 4000);
    const pv = bg.querySelector<HTMLInputElement>('#pp')!.value;
    const pain = pv === '' ? null : clampPain(+pv);
    const note = bg.querySelector<HTMLInputElement>('#pn')!.value.trim();
    const s = makeManualSession({
      day,
      items: picked.map((x) => ({
        id: x.id,
        level: x.level,
        sets: x.dose.sets,
        reps: x.dose.type === 'hold' ? 0 : x.dose.reps,
        pain,
        note,
      })),
    } as Parameters<typeof makeManualSession>[0]);
    bg.remove();
    await store.saveSession(s);
    await refresh();
    toast(t('saved'));
    state.hist = state.hist || { tab: 'sessions', more: 0 };
    state.hist.tab = 'sessions';
    if (onDone) {
      await onDone();
      return;
    }
    if (location.hash === '#/history') viewHistory();
    else go('#/history');
  };
}
