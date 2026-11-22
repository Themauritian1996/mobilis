// Accueil du patient : diagnostic écrit ou questions simples, point de départ, sécurité.
// Import d'un programme préparé par un clinicien (code ou lien). Reprise de www/js/onboarding.js.
// Le cycle onboarding ↔ calendar est cassé : les rappels viennent de domains/rehab/calendar.ts (importé statiquement).
import { t, tr, getLang, setLang, locale, dowNarrow, isLang } from '../../../www/js/i18n.js';
import {
  REGIONS as REGION_DATA,
  PATHOLOGIES as PATHOLOGY_DATA,
  RED_FLAGS as RED_FLAG_DATA,
} from '../../../www/js/data/pathologies.js';
import {
  LAY as LAY_DATA,
  QUESTIONS as QUESTION_DATA,
  START_QS as START_DATA,
  startingPoint,
  matchDiagnosis,
  scoreAnswers,
} from '../../../www/js/data/triage.js';
import { EXERCISES as EXERCISE_DATA } from '../../../www/js/data/exercises.js';
import { protocolById } from '../../../www/js/data/protocols.js';
import * as P from '../../../www/js/program.js';
import * as store from '../../../www/js/store.js';
import { canToggleDay, toggleDay } from '../../../www/js/longterm.js';
import { doseText } from '../../domains/rehab/training.ts';
import { rxExtrasRom } from '../../domains/outcomes/rom.ts';
import { scheduleReminders } from '../../domains/rehab/calendar.ts';
import {
  state,
  go,
  render,
  profile,
  updateProfile,
  type OnboardState,
  type PathCandidate,
  type Profile,
} from '../app-state.ts';
import { esc } from '../components/html.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { mountFigs, figSvg } from '../components/figures.ts';
import { langPicker } from '../components/design.ts';
import { weekOrder } from '../components/week.ts';
import { isNil } from '../util.ts';
import { rxExtrasProm } from './proms.ts';
import { rxExtrasProtocol } from './protocol.ts';

interface Named {
  id: string;
  name: unknown;
}
interface Pathology extends Named {
  region: string;
}
interface Question {
  q: unknown;
  opts: { t: unknown }[];
}
interface StartQuestion {
  id: string;
  q: unknown;
  opts: { v: string; t: unknown }[];
  when?: (start: Record<string, string>) => boolean;
}
const REGIONS = REGION_DATA as unknown as Named[];
const PATHOLOGIES = PATHOLOGY_DATA as unknown as Pathology[];
const RED_FLAGS = RED_FLAG_DATA as unknown as unknown[];
const LAY = LAY_DATA as unknown as Record<string, { name: unknown } | undefined>;
const QUESTIONS = QUESTION_DATA as unknown as Record<string, Question[] | undefined>;
const START_QS = START_DATA as unknown as StartQuestion[];
const EXERCISES = EXERCISE_DATA as unknown as Record<string, { name: unknown; track?: boolean } | undefined>;

/** Profil lu / écrit par l'accueil et l'import d'un programme. */
interface ObProfile extends Profile {
  name?: string;
  levels?: Record<string, unknown>;
  joinedAt?: number;
  region?: string;
  painBase?: number;
  irritability?: string;
  days?: number[];
  perWeek?: number;
  rxCode?: string;
  rxVersion?: number;
  nextVisit?: string | null;
  clinician?: string;
  equipment?: unknown;
  side?: unknown;
  remind?: { on?: boolean; time?: string } | undefined;
}
/** Programme du clinicien (rx) : champs lus à l'import. */
interface Rx {
  code?: string;
  version?: number;
  lang?: string;
  clinician?: string;
  notes?: string;
  region?: string;
  pathology?: string;
  phase: number;
  ids: string[];
  levels?: Record<string, number>;
  dose?: Record<string, Record<string, unknown> | null>;
  days?: number[];
  auto?: boolean;
  autoEx?: Record<string, unknown>;
  maxLevel?: Record<string, unknown>;
  partial?: Record<string, unknown>;
  report?: { every?: unknown };
  nextVisit?: string;
  equip?: unknown;
  side?: unknown;
  ai?: unknown;
  protocol?: { id: string };
  [key: string]: unknown;
}

const $app = (): HTMLElement => document.getElementById('app')!;
const DAY = 86400000;
export const layName = (id: string): string => tr(LAY[id]?.name) || tr(PATHOLOGIES.find((p) => p.id === id)?.name);
export const medName = (id: string): string => tr(PATHOLOGIES.find((p) => p.id === id)?.name);
const DOW = dowNarrow;
export const daysPicker = (sel: number[]): string =>
  `<div class="days" role="group" aria-label="${t('trainDays')}">${(weekOrder() as number[]).map((d) => `<button data-day="${d}" class="${sel.includes(d) ? 'on' : ''}" aria-pressed="${sel.includes(d)}">${DOW()[d]}</button>`).join('')}</div>`;

// Carte du corps (les points ouvrent la région)
const BODY_DOTS: Record<string, [number, number][]> = {
  cervical: [[100, 48]],
  thoracic: [[100, 74]],
  shoulder: [
    [74, 64],
    [126, 64],
  ],
  elbow: [
    [62, 104],
    [138, 104],
  ],
  wrist: [
    [54, 140],
    [146, 140],
  ],
  lumbar: [[100, 112]],
  hip: [
    [86, 136],
    [114, 136],
  ],
  knee: [
    [86, 186],
    [114, 186],
  ],
  ankle: [
    [86, 232],
    [114, 232],
  ],
  foot: [
    [80, 248],
    [120, 248],
  ],
};
export function bodyMap(sel?: string | null): string {
  let dots = '';
  for (const [rid, pts] of Object.entries(BODY_DOTS))
    for (const [x, y] of pts)
      dots += `<circle class="bm-dot ${sel === rid ? 'on' : ''}" data-region="${rid}" cx="${x}" cy="${y}" r="7"><title>${esc(tr(REGIONS.find((r) => r.id === rid)!.name))}</title></circle>`;
  return `<svg class="bodymap" viewBox="0 0 200 262" role="img" aria-label="${t('ob2')}"><g class="bm-body"><circle cx="100" cy="26" r="16"/>
    <path d="M76 56 Q100 48 124 56 L132 120 Q100 128 68 120 Z"/>
    <path d="M74 58 Q64 62 62 80 L56 140 Q54 148 50 150 L58 152 L66 102 L76 76Z"/><path d="M126 58 Q136 62 138 80 L144 140 Q146 148 150 150 L142 152 L134 102 L124 76Z"/>
    <path d="M70 120 Q100 130 130 120 L122 186 L118 240 L108 240 L104 150 L96 150 L92 240 L82 240 L78 186Z"/>
    <path d="M80 240 h14 v10 h-18z M106 240 h14 l4 10 h-18z"/></g>${dots}</svg>`;
}

interface ShellOptions {
  back?: boolean;
  cta?: string;
  canNext?: boolean;
  progress?: number;
}
function shell(body: string, { back = true, cta = '', canNext = true, progress = 0 }: ShellOptions = {}): void {
  $app().innerHTML = `<section class="screen">
    <div class="topbar">${back ? `<button class="icon-btn" data-ob="back" aria-label="${t('back')}">${icon('back', 20)}</button>` : ''}<h1></h1>
      ${profile()?.pathology || state.obTest ? `<button class="icon-btn" data-ob="cancel" aria-label="${t('close')}">${icon('close', 20)}</button>` : ''}</div>
    <div class="steps-dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= progress ? 'on' : ''}"></i>`).join('')}</div>
    ${body}<div style="height:96px"></div>
    <div class="sticky-cta"><div>${cta || `<button class="btn" data-ob="next" ${canNext ? '' : 'disabled'}>${t('next')}</button>`}</div></div></section>`;
  mountFigs($app());
  const c = $app().querySelector<HTMLElement>('[data-ob="cancel"]');
  if (c)
    c.onclick = () => {
      state.ob = null;
      state.obTest = false;
      state.obChange = false;
      go('#/home');
    };
}

export function viewOnboard(): void {
  const prev = profile() as ObProfile | undefined;
  const o: OnboardState =
    state.ob ||
    (state.ob = {
      step: state.obTest || state.obChange ? 'diag' : 'name',
      hist: [],
      name: prev?.name || state.user?.name || '',
      role: prev?.role || 'patient',
      text: '',
      matches: null,
      region: prev?.region || null,
      answers: {},
      pathology: null,
      start: {},
      painBase: prev?.painBase ?? 3,
      irritability: prev?.irritability || 'med',
      days: prev?.days || [1, 3, 5],
      flags: new Set(),
      noFlag: false,
    });
  const to = (s: string): void => {
    o.hist.push(o.step);
    o.step = s;
    viewOnboard();
  };
  const back = (): void => {
    o.step = o.hist.pop() || (state.obTest || state.obChange ? 'diag' : 'name');
    viewOnboard();
  };
  const q = <T extends HTMLElement = HTMLElement>(s: string): T => $app().querySelector<T>(s)!;
  const qa = (s: string): NodeListOf<HTMLElement> => $app().querySelectorAll<HTMLElement>(s);
  const bind = (): void => {
    const b = $app().querySelector<HTMLElement>('[data-ob="back"]');
    if (b) b.onclick = back;
  };
  const keepScroll = (): void => {
    const y = window.scrollY;
    viewOnboard();
    window.scrollTo(0, y);
  };

  if (o.step === 'name') {
    shell(
      `<h1 class="ob-title">${t('welcome')}</h1><p class="muted">${t('ob1s')}</p>
      <label class="field" style="margin-top:18px"><span>${t('namePh')}</span><input class="input" id="nm" value="${esc(o.name)}" autocomplete="given-name"></label>
      <div class="field"><span>${t('iAm')}</span><div class="seg"><button data-role="patient" class="${o.role === 'patient' ? 'on' : ''}">${t('rolePatient')}</button><button data-role="clinician" class="${o.role === 'clinician' ? 'on' : ''}">${t('roleClinician')}</button></div></div>
      <div class="field"><span>${t('language')}</span>${langPicker()}</div>
      ${o.role === 'patient' ? `<div class="card row" style="margin-top:6px">${icon('stetho', 22)}<div class="grow"><b>${t('haveCode')}</b><div class="small muted">${t('haveCodeD')}</div></div><button class="btn sm ghost" data-go="#/code">${t('enterCode')}</button></div>` : ''}`,
      { back: false, canNext: o.name.trim().length > 0, progress: 0 },
    );
    bind();
    const nm = q<HTMLInputElement>('#nm');
    nm.oninput = () => {
      o.name = nm.value;
      q<HTMLButtonElement>('[data-ob="next"]').disabled = !nm.value.trim();
    };
    qa('[data-role]').forEach(
      (x) =>
        (x.onclick = () => {
          o.role = x.dataset['role'] ?? 'patient';
          viewOnboard();
        }),
    );
    q('[data-ob="next"]').onclick = async () => {
      if (o.role === 'clinician') {
        await updateProfile({ name: o.name.trim(), role: 'clinician', lang: getLang() });
        state.ob = null;
        return go('#/clinic');
      }
      to('diag');
    };
    return;
  }

  if (o.step === 'diag') {
    const m = o.matches;
    shell(
      `<h1 class="ob-title">${t('diagTitle')}</h1><p class="muted">${t('diagSub')}</p>
      <label class="field" style="margin-top:14px"><span>${t('diagLabel')}</span><textarea class="input" id="dx" placeholder="${t('diagPh')}">${esc(o.text)}</textarea></label>
      <button class="btn ghost" data-a="analyse">${icon('search', 18)} ${t('analyse')}</button>
      ${
        m
          ? m.length
            ? `<h2>${t('diagFound')}</h2>${m.map((x) => `<button class="choice ${o.pathology === x.id ? 'on' : ''}" data-path="${x.id}"><span class="radio"></span><span><b>${esc(layName(x.id))}</b><small>${t('medTerm')} : ${esc(medName(x.id))}</small></span></button>`).join('')}`
            : `<div class="banner" style="margin-top:12px">${icon('search', 20)}<div>${t('diagNone')}</div></div>`
          : ''
      }
      <div class="divider">${t('or')}</div>
      <button class="btn soft" data-a="questions">${t('noDiag')}</button>`,
      { canNext: !!o.pathology, progress: 1 },
    );
    bind();
    const dx = q<HTMLTextAreaElement>('#dx');
    dx.oninput = () => {
      o.text = dx.value;
    };
    q('[data-a="analyse"]').onclick = () => {
      o.text = dx.value;
      const r: PathCandidate[] & { regions?: string[] } = matchDiagnosis(
        o.text,
        PATHOLOGIES,
        ['fr', 'en'].includes(getLang()) ? {} : { tr, regions: REGIONS },
      );
      o.matches = [...r];
      o.pathology = r[0]?.id || null;
      if (!r.length && r.regions?.length) {
        o.region = r.regions[0];
        toast(t('diagRegionOnly'));
        return to('questions');
      }
      viewOnboard();
    };
    qa('[data-path]').forEach(
      (x) =>
        (x.onclick = () => {
          o.pathology = x.dataset['path'];
          viewOnboard();
        }),
    );
    q('[data-a="questions"]').onclick = () => to('region');
    q('[data-ob="next"]').onclick = () => {
      o.region = PATHOLOGIES.find((p) => p.id === o.pathology)!.region;
      to('start');
    };
    return;
  }

  if (o.step === 'region') {
    shell(
      `<h1 class="ob-title">${t('ob2')}</h1><p class="muted">${t('ob2s')}</p>${bodyMap(o.region)}
      <div class="region-grid" style="margin-top:12px">${REGIONS.map((r) => `<button class="region-btn ${o.region === r.id ? 'on' : ''}" data-region="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>`,
      { canNext: !!o.region, progress: 1 },
    );
    bind();
    qa('[data-region]').forEach(
      (x) =>
        (x.onclick = () => {
          if (o.region !== x.dataset['region']) o.answers = {};
          o.region = x.dataset['region'];
          viewOnboard();
        }),
    );
    q('[data-ob="next"]').onclick = () => to('questions');
    return;
  }

  if (o.step === 'questions') {
    const qs = QUESTIONS[o.region ?? ''] || [];
    const all = qs.every((_, i) => !isNil(o.answers[i]));
    shell(
      `<span class="eyebrow">${esc(tr(REGIONS.find((r) => r.id === o.region)!.name))}</span><h1 class="ob-title">${t('qTitle')}</h1><p class="muted">${t('qSub')}</p>
      ${qs.map((qq, i) => `<h2>${esc(tr(qq.q))}</h2>${qq.opts.map((op, j) => `<button class="choice ${o.answers[i] === j ? 'on' : ''}" data-q="${i}" data-o="${j}"><span class="radio"></span><span>${esc(tr(op.t))}</span></button>`).join('')}`).join('')}`,
      { canNext: all, progress: 2 },
    );
    bind();
    qa('[data-q]').forEach(
      (x) =>
        (x.onclick = () => {
          o.answers[+(x.dataset['q'] ?? 0)] = +(x.dataset['o'] ?? 0);
          keepScroll();
        }),
    );
    q('[data-ob="next"]').onclick = () => {
      const sc: PathCandidate[] = scoreAnswers(o.region, o.answers, PATHOLOGIES);
      o.candidates = sc.filter((s) => (s.score ?? 0) > 0).slice(0, 3);
      if (!o.candidates.length) o.candidates = sc.slice(0, 3);
      o.pathology = o.candidates[0]?.id;
      o.showAll = false;
      to('confirm');
    };
    return;
  }

  if (o.step === 'confirm') {
    const list: PathCandidate[] = o.showAll
      ? PATHOLOGIES.filter((p) => p.region === o.region).map((p) => ({ id: p.id }))
      : (o.candidates ?? []);
    shell(
      `<h1 class="ob-title">${t('looksLike')}</h1><p class="muted">${t('looksLikeSub')}</p>
      ${list.map((x, i) => `<button class="choice ${o.pathology === x.id ? 'on' : ''}" data-path="${x.id}"><span class="radio"></span><span><b>${esc(layName(x.id))}</b>${i === 0 && !o.showAll ? `<small class="pos">${t('mostLikely')}</small>` : ''}<small>${t('medTerm')} : ${esc(medName(x.id))}</small></span></button>`).join('')}
      ${o.showAll ? '' : `<button class="link" style="margin-top:14px" data-a="all">${t('noneOfThese')}</button>`}
      <div class="banner" style="margin-top:16px">${icon('shield', 20)}<div>${t('notDiagnosis')}</div></div>`,
      { canNext: !!o.pathology, progress: 2 },
    );
    bind();
    qa('[data-path]').forEach(
      (x) =>
        (x.onclick = () => {
          o.pathology = x.dataset['path'];
          viewOnboard();
        }),
    );
    const a = $app().querySelector<HTMLElement>('[data-a="all"]');
    if (a)
      a.onclick = () => {
        o.showAll = true;
        viewOnboard();
      };
    q('[data-ob="next"]').onclick = () => to('start');
    return;
  }

  if (o.step === 'start') {
    const visible = START_QS.filter((s) => !s.when || s.when(o.start));
    const all = visible.every((s) => o.start[s.id]) && o.days.length > 0;
    const irr = (k: string): string =>
      `<button class="choice ${o.irritability === k ? 'on' : ''}" data-irr="${k}"><span class="radio"></span><span><b>${t('irr_' + k)}</b><small>${t('irr_' + k + 'D')}</small></span></button>`;
    shell(
      `<h1 class="ob-title">${t('whereTitle')}</h1><p class="muted">${t('whereSub')}</p>
      ${visible.map((s) => `<h2>${esc(tr(s.q))}</h2>${s.opts.map((op) => `<button class="choice ${o.start[s.id] === op.v ? 'on' : ''}" data-s="${s.id}" data-v="${op.v}"><span class="radio"></span><span>${esc(tr(op.t))}</span></button>`).join('')}`).join('')}
      <h2>${t('painNow')}</h2><div class="card"><div class="row between"><span class="muted small">0 = ${t('noPain')} · 10 = ${t('worstPain')}</span><span class="mid" id="pv">${o.painBase}</span></div>
        <input type="range" min="0" max="10" value="${o.painBase}" id="pain" aria-label="${t('painNow')}"></div>
      <h2>${t('irritability')}</h2>${irr('low')}${irr('med')}${irr('high')}
      <h2>${t('trainDays')}</h2>${daysPicker(o.days)}<p class="note" style="margin-top:8px">${t('trainDaysD')}</p>`,
      { canNext: all, progress: 3 },
    );
    bind();
    qa('[data-s]').forEach(
      (x) =>
        (x.onclick = () => {
          const sid = x.dataset['s'] ?? '';
          o.start[sid] = x.dataset['v'] ?? '';
          if (sid === 'prior' && x.dataset['v'] === 'no') Reflect.deleteProperty(o.start, 'how');
          keepScroll();
        }),
    );
    qa('[data-irr]').forEach(
      (x) =>
        (x.onclick = () => {
          o.irritability = x.dataset['irr'] ?? 'med';
          keepScroll();
        }),
    );
    qa('[data-day]').forEach(
      (x) =>
        (x.onclick = () => {
          const d = +(x.dataset['day'] ?? 0);
          if (!canToggleDay(o.days, d)) return toast(t('calLastDay'));
          o.days = toggleDay(o.days, d);
          keepScroll();
        }),
    );
    const pain = q<HTMLInputElement>('#pain');
    pain.oninput = () => {
      o.painBase = +pain.value;
      q('#pv').textContent = pain.value;
    };
    q('[data-ob="next"]').onclick = () => to('flags');
    return;
  }

  if (o.step === 'flags') {
    flagsScreen(o, () => to('ready'), bind);
    return;
  }

  // Prêt
  const sp: { phase: number; level: number; weeksDone: number } = startingPoint(o.start, o.irritability);
  const tmp = {
    pathology: o.pathology,
    irritability: o.irritability,
    phase: sp.phase,
    baseLevel: sp.level,
    levels: {},
  };
  const prog: { id: string }[] = P.todaysProgram(tmp);
  shell(
    `<h1 class="ob-title">${t('ob6')}</h1><p class="muted">${t('ob6s')}</p>
    <div class="card" style="margin:14px 0"><span class="eyebrow">${t('phase')} ${sp.phase} · ${t('phaseName' + sp.phase)}</span><h3 style="margin-top:6px">${esc(layName(o.pathology ?? ''))}</h3>
      <div class="small muted">${prog.length} ${t('exercises').toLowerCase()} · ${o.days.length}× / ${t('week').toLowerCase()} · ${t('level')} ${sp.level}/5</div>
      ${sp.phase > 1 ? `<div class="small" style="margin-top:8px">${t('startAdapted')}</div>` : ''}</div>
    <div class="list">${prog.map((x) => `<div class="ex-item"><span class="ex-thumb">${figSvg(x.id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[x.id]!.name))}</b></span></div>`).join('')}</div>`,
    { cta: `<button class="btn" data-ob="finish">${t('start')}</button>`, progress: 4 },
  );
  bind();
  q('[data-ob="finish"]').onclick = async () => {
    const p = {
      ...(prev || {}),
      role: prev?.role === 'clinician' ? 'clinician' : 'patient',
      trial: prev?.role === 'clinician',
      name: o.name.trim() || prev?.name || '',
      region: o.region,
      pathology: o.pathology,
      painBase: o.painBase,
      irritability: o.irritability,
      days: o.days,
      perWeek: o.days.length,
      phase: sp.phase,
      baseLevel: sp.level,
      levels: prev?.pathology === o.pathology ? prev?.levels || {} : {},
      startDate: Date.now() - sp.weeksDone * 7 * DAY,
      joinedAt: prev?.joinedAt || Date.now(),
      lang: getLang(),
      triage: { text: o.text, answers: o.answers, start: o.start },
      plan: null,
      lockPhase: false,
    };
    await store.saveProfile(p);
    state.data = await store.loadData();
    state.ob = null;
    state.obChange = false;
    if (state.obTest) {
      state.obTest = false;
      toast(t('trialStarted'), 3500);
    }
    go('#/home');
  };
}

function flagsScreen(o: OnboardState, next: () => unknown, bind: () => void): void {
  shell(
    `<h1 class="ob-title">${t('ob5')}</h1><p class="muted">${t('ob5s')}</p><div style="margin-top:14px">
    ${RED_FLAGS.map((f, i) => `<button class="choice flag ${o.flags.has(i) ? 'on' : ''}" data-flag="${i}"><span class="radio"></span><span>${esc(tr(f))}</span></button>`).join('')}
    <button class="choice ${o.noFlag ? 'on' : ''}" data-noflag="1"><span class="radio"></span><span><b>${t('none')}</b></span></button></div>
    ${o.flags.size ? `<div class="banner neg" style="margin-top:14px">${icon('shield', 20)}<div><b>${t('rfStop')}</b><br>${t('rfStopD')}</div></div>` : ''}`,
    { canNext: o.noFlag && !o.flags.size, progress: 3 },
  );
  bind();
  const qa = (s: string): NodeListOf<HTMLElement> => document.getElementById('app')!.querySelectorAll<HTMLElement>(s);
  qa('[data-flag]').forEach(
    (x) =>
      (x.onclick = () => {
        const i = +(x.dataset['flag'] ?? 0);
        if (o.flags.has(i)) o.flags.delete(i);
        else o.flags.add(i);
        o.noFlag = false;
        flagsScreen(o, next, bind);
      }),
  );
  qa('[data-noflag]').forEach(
    (x) =>
      (x.onclick = () => {
        o.flags.clear();
        o.noFlag = true;
        flagsScreen(o, next, bind);
      }),
  );
  document.querySelector<HTMLElement>('[data-ob="next"]')!.onclick = next;
}

// ---------- Programme envoyé par le clinicien ----------
export function viewCodeEntry(): void {
  $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" onclick="history.back()" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('enterCode')}</h1></div>
    <p class="muted">${t('codeSub')}</p>
    <label class="field"><span>${t('codeLabel')}</span><input class="input tnum" id="code" autocomplete="off" autocapitalize="characters" placeholder="ABC-234" style="font-size:24px;letter-spacing:.12em;text-align:center"></label>
    <p class="err" id="err" hidden></p>
    <button class="btn" id="go">${t('next')}</button></section>`;
  const c = $app().querySelector<HTMLInputElement>('#code')!;
  $app().querySelector<HTMLElement>('#go')!.onclick = () => {
    const v: string = store.cleanCode(c.value);
    if (v.length === 6) go('#/rx/' + v);
    else {
      const e = $app().querySelector<HTMLElement>('#err')!;
      e.hidden = false;
      e.textContent = t('codeInvalid');
    }
  };
}

// Réglages fins du clinicien : dose par exercice (avec le niveau auquel elle a été fixée), progression auto, niveau maximal
export function rxExtras(rx: Rx, prev: ObProfile | null = null): Record<string, unknown> {
  const rxDose: Record<string, unknown> = {};
  for (const [id, d] of Object.entries(rx.dose || {}))
    if (d && rx.ids?.includes(id)) rxDose[id] = { ...d, lv: rx.levels?.[id] || 2 };
  return {
    rxDose,
    autoEx: { ...(rx.autoEx || {}) },
    maxLevel: { ...(rx.maxLevel || {}) },
    partialEx: { ...(rx.partial || {}) },
    ...rxExtrasProm(rx as never),
    ...rxExtrasRom(rx),
    ...rxExtrasProtocol(rx as never, prev as never),
    reportPlan: rx.report && +(rx.report.every as number) > 0 ? { every: +(rx.report.every as number) } : null,
  };
}

// Protocole sans pathologie dans le programme : on prend la première pathologie de sa région
const protocolPathology = (rx: Rx, prev: ObProfile | undefined): { pathology?: string | null } =>
  rx.pathology || prev?.pathology || !rx.protocol
    ? {}
    : {
        pathology: PATHOLOGIES.find((x) => x.region === protocolById(rx.protocol!.id)?.region)?.id || null,
      };

// Profil patient construit à partir d'un programme du clinicien
function rxToProfile(
  rx: Rx,
  prev: ObProfile | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const weeks = ({ 1: 0, 2: 2, 3: 6 } as Record<number, number>)[rx.phase] || 0;
  return {
    ...(prev || {}),
    role: prev?.role === 'clinician' ? 'clinician' : 'patient',
    region: rx.region,
    pathology: rx.pathology,
    phase: rx.phase,
    plan: { phase: rx.phase, ids: rx.ids },
    levels: { ...(rx.levels || {}) },
    baseLevel: 2,
    lockPhase: !rx.auto,
    irritability: prev?.irritability || 'med',
    painBase: prev?.painBase ?? 3,
    days: rx.days || prev?.days || [1, 3, 5],
    perWeek: (rx.days || prev?.days || [1, 3, 5]).length,
    startDate: Date.now() - weeks * 7 * DAY,
    joinedAt: prev?.joinedAt || Date.now(),
    rxCode: rx.code || null,
    rxVersion: rx.version || 1,
    rxAt: Date.now(),
    clinician: rx.clinician || '',
    rxNotes: rx.notes || '',
    nextVisit: rx.nextVisit || prev?.nextVisit || null,
    lang: getLang(),
    flareUntil: 0,
    equipment: rx.equip || prev?.equipment || null,
    side: rx.side || prev?.side || null,
    ...rxExtras(rx, prev ?? null),
    ...protocolPathology(rx, prev),
    ...extra,
  };
}

// Clinicien : charge un programme sur son propre appareil pour le vivre comme le patient (rien n'est envoyé au patient)
export async function startTrial(rx: Rx): Promise<void> {
  const prev = profile() as ObProfile | undefined;
  const p = rxToProfile(rx, prev, {
    role: 'clinician',
    trial: true,
    rxCode: null,
    shareProgress: false,
    name: prev?.name || '',
  });
  await store.saveProfile(p);
  state.data = await store.loadData();
  toast(t('trialStarted'), 3500);
  go('#/home');
}

export async function viewRxImport(code: string): Promise<void> {
  $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('rxTitle')}</h1></div><div class="card muted">${t('loading')}</div><button class="btn ghost" data-a="cancelRx" style="margin-top:12px">${t('cancel')}</button></section>`;
  const cx = $app().querySelector<HTMLElement>('[data-a="cancelRx"]');
  if (cx)
    cx.onclick = () => {
      store.clearPendingRx();
      go('#/home');
    };
  // Échec (code introuvable ou réseau) : le code en attente est effacé (sinon toutes les routes y redirigent) et on peut toujours partir
  const { rx, error } = (await store.lookupRx(code)) as { rx: Rx | null; error?: string };
  if (!location.hash.startsWith('#/rx/')) return; // l'utilisateur est parti pendant la recherche
  if (!rx) {
    const net = error === 'network';
    $app().innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="${profile()?.pathology ? '#/home' : '#/code'}" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('rxTitle')}</h1></div>
      <div class="banner neg" role="alert">${icon('shield', 20)}<div>${net ? t('rxNoNet') : t('rxNotFound')}</div></div>
      <div class="stack" style="margin-top:14px">${net ? `<button class="btn" data-a="retry">${t('retry')}</button>` : `<button class="btn" data-go="#/code">${t('enterCode')}</button>`}
        <button class="btn ghost" data-go="#/home">${t('home')}</button></div></section>`;
    const rt = $app().querySelector<HTMLElement>('[data-a="retry"]');
    if (rt)
      rt.onclick = () => {
        store.setPendingRx(code);
        void viewRxImport(code);
      };
    return;
  }
  // Langue choisie par le clinicien, sauf si le patient en a choisi une autre sur cet écran
  let chosen = false;
  try {
    chosen = !!sessionStorage.getItem('mobilis.langChosen');
  } catch {
    /* stockage de session indisponible : pas de langue déjà choisie */
  }
  if (rx.lang && isLang(rx.lang) && rx.lang !== getLang() && !chosen) await setLang(rx.lang);
  const prev = profile() as ObProfile | undefined;
  const o: OnboardState =
    state.rxo && state.rxo.code === code
      ? state.rxo
      : (state.rxo = {
          code,
          name: prev?.name || state.user?.name || '',
          days: rx.days || prev?.days || [1, 3, 5],
          share: store.isCloud() && !!rx.code,
          flags: new Set(),
          noFlag: false,
          step: 'summary',
          hist: [],
          role: 'patient',
          text: '',
          matches: null,
          region: null,
          answers: {},
          pathology: null,
          start: {},
          painBase: 3,
          irritability: 'med',
        });
  const draw = (): void => {
    if (o.step === 'flags') {
      flagsScreen(o, finish, () => {
        const b = document.querySelector<HTMLElement>('[data-ob="back"]');
        if (b)
          b.onclick = () => {
            o.step = 'summary';
            draw();
          };
      });
      return;
    }
    $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('rxTitle')}</h1>${langPicker()}</div>
      <div class="card"><span class="eyebrow">${t('preparedBy')} ${esc(rx.clinician || t('yourClinician'))}</span>
        <h3 style="margin-top:6px">${esc(layName(rx.pathology ?? ''))}</h3><div class="small muted">${t('medTerm')} : ${esc(medName(rx.pathology ?? ''))}</div>
        <div class="row wrap" style="margin-top:10px"><span class="chip">${t('phase')} ${rx.phase} · ${t('phaseName' + rx.phase)}</span><span class="chip">${rx.ids.length} ${t('exercises').toLowerCase()}</span>
        ${rx.nextVisit ? `<span class="chip">${t('nextVisit')} ${new Date(rx.nextVisit + 'T12:00').toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}</span>` : ''}</div>
        ${rx.notes ? `<p style="margin:12px 0 0;white-space:pre-line">${esc(rx.notes)}</p>` : ''}</div>
      <h2>${t('exercises')}</h2><div class="list">${rx.ids.map((id) => `<div class="ex-item lg"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id]!.name))}</b><small>${t('level')} ${rx.levels?.[id] || 2}/5 · ${doseText(rx.dose?.[id] ? { ...P.doseFor(id, rx.levels?.[id] || 2), ...rx.dose[id] } : P.doseFor(id, rx.levels?.[id] || 2))}</small><br><small>${EXERCISES[id]!.track ? icon('cam', 13) + ' ' + t('tracked') : icon('timer', 13) + ' ' + t('guidedShort')}</small></span></div>`).join('')}</div>
      <p class="note" style="margin-top:8px">${rx.ids.some((id) => EXERCISES[id]!.track) ? t('camAnalysis') : t('guidedAnalysis')}</p>
      <h2>${t('aboutYou')}</h2>
      <label class="field"><span>${t('namePh')}</span><input class="input" id="nm" value="${esc(o.name)}"></label>
      <div class="field"><span>${t('trainDays')}</span>${daysPicker(o.days)}</div>
      ${
        rx.code
          ? store.isCloud()
            ? `<div class="list"><div class="toggle"><span><b>${t('shareWithClin')}</b><br><small class="muted">${t('shareWithClinD')}</small></span><button class="switch ${o.share ? 'on' : ''}" id="share" role="switch" aria-checked="${!!o.share}"></button></div></div>`
            : `<p class="note">${t('shareNeedsAccount')}</p>`
          : ''
      }
      <div style="height:96px"></div>
      <div class="sticky-cta"><div><button class="btn" id="next" ${o.name.trim() && o.days.length ? '' : 'disabled'}>${t('next')}</button></div></div></section>`;
    mountFigs($app());
    const q = <T extends HTMLElement = HTMLElement>(s: string): T | null => $app().querySelector<T>(s);
    q<HTMLInputElement>('#nm')!.oninput = (e) => {
      o.name = (e.target as HTMLInputElement).value;
      q<HTMLButtonElement>('#next')!.disabled = !o.name.trim() || !o.days.length;
    };
    $app()
      .querySelectorAll<HTMLElement>('[data-day]')
      .forEach(
        (x) =>
          (x.onclick = () => {
            const d = +(x.dataset['day'] ?? 0);
            if (!canToggleDay(o.days, d)) return toast(t('calLastDay'));
            o.days = toggleDay(o.days, d);
            draw();
          }),
      );
    const sh = q('#share');
    if (sh)
      sh.onclick = () => {
        o.share = !o.share;
        draw();
      };
    q('#next')!.onclick = () => {
      o.step = 'flags';
      draw();
    };
  };
  async function finish(): Promise<void> {
    const p = rxToProfile({ ...rx, days: o.days } as Rx, prev, {
      name: o.name.trim(),
      shareProgress: o.share,
      trial: prev?.role === 'clinician',
    });
    await store.saveProfile(p);
    store.clearPendingRx();
    state.data = await store.loadData();
    state.ob = null;
    state.rxo = null;
    if (prev?.role !== 'clinician') store.applySharedAI(rx); // accès IA du clinicien (ou retrait s'il n'en partage plus)
    toast(t('rxAdded'));
    go('#/home');
  }
  draw();
}

// Applique les mises à jour faites par le clinicien (vérifié à l'ouverture)
export async function checkRxUpdate(): Promise<void> {
  const p = profile() as ObProfile | undefined;
  if (!p?.rxCode || !navigator.onLine) return;
  const last = +(sessionStorage.getItem('mobilis.rxCheck') || 0);
  if (Date.now() - last < 10 * 60000) return;
  sessionStorage.setItem('mobilis.rxCheck', String(Date.now()));
  try {
    const rx: Rx | null = await store.getRx(p.rxCode);
    if (!rx) {
      if (p.role !== 'clinician' && store.settings().sharedAI?.rxCode === p.rxCode) store.applySharedAI(null);
      return;
    } // programme supprimé : l'accès IA s'arrête
    if ((rx.version || 1) <= (p.rxVersion || 1)) {
      if (p.role !== 'clinician' && rx.ai && !store.settings().sharedAI) store.applySharedAI(rx);
      return;
    }
    const days = rx.days?.length ? rx.days : p.days;
    const np = (await updateProfile({
      phase: rx.phase,
      plan: { phase: rx.phase, ids: rx.ids },
      levels: { ...(p.levels || {}), ...(rx.levels || {}) },
      lockPhase: !rx.auto,
      rxVersion: rx.version,
      rxAt: Date.now(),
      rxNotes: rx.notes || '',
      nextVisit: rx.nextVisit || p.nextVisit,
      clinician: rx.clinician || p.clinician,
      days,
      perWeek: days?.length || p.perWeek,
      equipment: rx.equip || p.equipment || null,
      side: rx.side || p.side || null,
      ...rxExtras(rx, p),
    } as Partial<Profile>)) as ObProfile;
    if (np.role !== 'clinician') store.applySharedAI(rx); // ajout, changement ou retrait de l'accès IA
    if (np.remind?.on) {
      try {
        void scheduleReminders(np);
      } catch (e) {
        console.warn(e);
      }
    }
    toast(t('rxUpdated'), 4000);
    render();
  } catch (e) {
    console.warn(e);
  }
}
