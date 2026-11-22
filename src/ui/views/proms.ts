// Questionnaires (PROM) : interface patient + clinicien (reprise de www/js/questionnaires.js).
// La logique pure (scores, échéances, tendance) est dans data/proms.js (migré par la tranche T1).
// Licences : le texte des questionnaires protégés est importé par le clinicien (JSON) et gardé dans les réglages de l'appareil
// (store.settings().promLicenses = { instrumentId: { items:[{fr,en}], options:[{fr,en}]|null, importedAt } }) ; jamais dans le code ni dans la prescription.
import { t, tr, locale } from '../../../www/js/i18n.js';
import * as store from '../../../www/js/store.js';
import * as M from '../../../www/js/data/proms.js';
import { profile, updateProfile, syncProgress, type Profile } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { sheet, confirmSheet } from '../components/sheet.ts';
import { hostOf, isNil, type Host } from '../util.ts';

export {
  score,
  due,
  trend,
  summaryPart,
  suggestFor,
  validateLicense,
  INSTRUMENTS,
  customToDef,
} from '../../../www/js/data/proms.js';

interface PromOptions {
  min: number;
  max: number;
  step?: number;
  labels?: unknown[];
  ends?: [unknown, unknown];
}
interface PromDef {
  id: string;
  kind?: string;
  name: unknown;
  items: { text: unknown }[];
  options: PromOptions;
  stem?: unknown;
  dynamicItems?: { min: number; max: number };
  available?: boolean;
  range: [number, number];
  higherIsBetter?: boolean;
  noBaseline?: boolean;
  mcid?: { value: number };
}
interface PromTrend {
  n: number;
  delta: number | null;
  improvement: number | null;
  mcidReached?: boolean;
  last: number | null;
}
interface PromPlanItem {
  id: string;
  every: number;
  first: number;
}
interface CustomProm {
  id: string;
  title: string;
  questions: { text: string }[];
  scale: string;
  score: string;
  higherIsBetter: boolean;
  [key: string]: unknown;
}
interface PromLogEntry {
  id: string;
  ts: number;
  answers?: (number | null)[];
  score?: number;
  sub?: Record<string, unknown>;
  acts?: string[];
}
interface PromProfile extends Profile {
  promPlan?: PromPlanItem[];
  promLog?: PromLogEntry[];
  promActivities?: string[];
  promCustom?: CustomProm[];
  promTexts?: unknown;
  joinedAt?: number;
  startDate?: number;
  region?: string;
}
interface PromCtx {
  custom: CustomProm[];
  licenses: Record<string, unknown>;
  activities: string[];
}
/** Programme du clinicien (rx) : champs lus par la section « questionnaires ». */
interface PromRx {
  prom?: { id: string; every?: unknown; first?: unknown }[];
  promCustom?: CustomProm[];
  promTexts?: unknown;
  region?: string;
}
interface LicenseResult {
  ok: boolean;
  id?: string;
  entry?: unknown;
  error?: string;
}
/** Ligne de la fiche patient clinicien : `summaryPart(...).prom`. */
interface PromSummaryRow {
  name: unknown;
  range?: [number, number];
  higherIsBetter?: boolean;
  delta?: number | null;
  improvement?: number | null;
  mcidReached?: boolean;
  worsened?: boolean;
  baseline?: number | null;
  last?: number | null;
  lastTs?: number;
  series?: [number, number][];
}

const num = (x: number | null | undefined): string =>
  isNil(x) ? '–' : new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(x);
const licenses = (): Record<string, unknown> => {
  try {
    return store.settings().promLicenses || {};
  } catch {
    return {};
  }
};
// Textes sous licence : ceux importés sur cet appareil (clinicien), sinon ceux embarqués dans la prescription (profil.promTexts)
const ctxOf = (
  prof: PromProfile = (profile() || {}) as PromProfile,
  custom: CustomProm[] | undefined = prof.promCustom,
): PromCtx => ({
  custom: custom || [],
  licenses: mergeLic(prof.promTexts),
  activities: prof.promActivities || [],
});
const nameOf = (def: { name: unknown }): string => tr(def.name);
/** Textes sous licence : ceux embarqués dans la prescription, complétés par ceux de l'appareil. */
const mergeLic = (embedded: unknown): Record<string, unknown> =>
  M.mergeLicenses(embedded, licenses()) as Record<string, unknown>;
const resolveDef = (id: string, ctx: PromCtx): PromDef | null | undefined =>
  M.resolveDef(id, ctx as Parameters<typeof M.resolveDef>[1]) as PromDef | null | undefined;
const isAvail = (id: string, ctx: Partial<PromCtx>): boolean =>
  M.isAvailable(id, ctx as Parameters<typeof M.isAvailable>[1]);
const defOf = (id: string, custom: CustomProm[]): PromDef | null | undefined =>
  M.instrumentDef(id, custom) as PromDef | null | undefined;

// Importe un fichier de licence { instrument, items, options } : conservé sur cet appareil (réglages). -> { ok, id?, error? }
export function importPromLicense(json: unknown): LicenseResult {
  const v: LicenseResult = M.validateLicense(json);
  if (!v.ok) return v;
  store.saveSettings({ promLicenses: { ...licenses(), [v.id ?? '']: v.entry } });
  return v;
}
export const removePromLicense = (id: string): void => {
  const l = { ...licenses() };
  Reflect.deleteProperty(l, id);
  store.saveSettings({ promLicenses: l });
};

// Textes sous licence des instruments du plan (importés sur l'appareil du clinicien) : embarqués dans la prescription pour que le patient puisse répondre
export const packTexts = (plan: { id: string }[] | null | undefined, embedded: unknown): Record<string, unknown> => {
  const all = mergeLic(embedded);
  return Object.fromEntries(
    (plan || [])
      .map((p) => p.id)
      .filter((id) => all[id])
      .map((id) => [id, all[id]]),
  );
};
// Profil patient : plan + questionnaires personnalisés recopiés depuis la prescription
export const rxExtrasProm = (
  rx?: PromRx | null,
): { promPlan: PromPlanItem[]; promTexts: unknown; promCustom: unknown } => ({
  promPlan: (rx?.prom || []).map((p) => ({
    id: p.id,
    every: +(p.every as number) || 0,
    first: +(p.first as number) || 0,
  })),
  promTexts: JSON.parse(JSON.stringify(rx?.promTexts || {})),
  promCustom: JSON.parse(JSON.stringify(rx?.promCustom || [])),
});

// Questionnaires dus et remplissables maintenant
function dueList(prof: PromProfile): { id: string }[] {
  const ctx = ctxOf(prof);
  const start = prof.joinedAt || prof.startDate || 0;
  return (M.due(prof.promPlan || [], prof.promLog || [], start, Date.now()) as { id: string }[]).filter((d) => {
    const def = defOf(d.id, ctx.custom);
    return def && (def.dynamicItems || isAvail(d.id, ctx));
  });
}

// ---------- Graphique ----------
function lineSvg(
  series: [number, number][],
  def: { range: [number, number] },
  { w = 300, h = 90, full = true, label = '' }: { w?: number; h?: number; full?: boolean; label?: string } = {},
): string {
  if (!series.length) return '';
  const pad = full ? 14 : 3;
  let lo = def.range[0];
  let hi = def.range[1];
  if (!full) {
    const v = series.map((p) => p[1]);
    lo = Math.min(...v);
    hi = Math.max(...v);
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
  }
  const xs = (i: number): number =>
    pad + (series.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (series.length - 1));
  const ys = (v: number): number => h - pad - ((v - lo) / (hi - lo || 1)) * (h - 2 * pad);
  const pts = series.map((p, i): [number, number] => [xs(i), ys(p[1])]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="prom-svg">${full ? `<line class="ax" x1="${pad}" x2="${w - pad}" y1="${h - pad}" y2="${h - pad}"/><text x="${pad}" y="${h - 1}">${num(def.range[0])}</text><text x="${w - pad}" y="${h - 1}" text-anchor="end">${num(def.range[1])}</text>` : ''}
    <path d="${d}" fill="none" stroke="var(--brand)" stroke-width="${full ? 2 : 1.6}" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${full ? 3.2 : i === pts.length - 1 ? 2.6 : 0}" fill="${i === pts.length - 1 ? 'var(--brand)' : 'var(--surface)'}" stroke="var(--brand)" stroke-width="1.4"/>`).join('')}</svg>`;
}

// Phrase simple sur l'évolution
function changeText(tn: PromTrend, def: PromDef): string {
  if (def.noBaseline || tn.n < 2 || isNil(tn.improvement)) return tn.n < 2 && !def.noBaseline ? t('pmFirst') : '';
  const a = num(Math.abs(tn.delta ?? 0));
  const s = tn.improvement > 0 ? t('pmBetter', { d: a }) : tn.improvement < 0 ? t('pmWorse', { d: a }) : t('pmSame');
  return s + (tn.mcidReached ? ' ' + t('pmMcidYes') : '');
}

// ---------- Accueil : carte « Questionnaire à remplir » ----------
export function homeCardProm(prof?: PromProfile | null): string {
  if (!prof) return '';
  const list = dueList(prof);
  if (!list.length) return '';
  const ctx = ctxOf(prof);
  return `<div class="card prom-card" data-prom-card><div class="row between"><span class="eyebrow">${t('pmDueTitle')}</span><span class="chip sm">${list.length}</span></div>
    ${list.map((d) => `<button class="prom-due" data-prom-go="${esc(d.id)}"><span class="grow"><b>${esc(nameOf(M.instrumentDef(d.id, ctx.custom)))}</b><small class="muted">${t('pmTakes', { n: Math.max(1, Math.round(M.nItemsOf(M.instrumentDef(d.id, ctx.custom)) * 0.25)) })}</small></span>${icon('play', 18)}</button>`).join('')}</div>`;
}
export function bindHomeCardProm(root: ParentNode, go: (hash: string) => unknown): void {
  root.querySelectorAll<HTMLElement>('[data-prom-go]').forEach((b) => {
    b.onclick = () => {
      go('#/prom/' + b.dataset['promGo']);
    };
  });
}

// ---------- Remplissage : une question par écran ----------
let keyOff: (() => void) | null = null; // un seul écouteur clavier à la fois
interface FillState {
  i: number;
  a: (number | null)[];
  acts: string[];
  phase: 'setup' | 'ask';
}
export function viewProm($app: Host, id: string): void {
  if (keyOff) keyOff();
  const root = hostOf($app);
  const prof = (profile() || {}) as PromProfile;
  const def0 = resolveDef(id, ctxOf(prof));
  const back = `<div class="topbar"><button class="icon-btn" data-go="#/home" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(def0 ? nameOf(def0) : t('pmTitle'))}</h1></div>`;
  if (!def0) {
    root.innerHTML = `<section class="screen prom-screen">${back}<div class="card muted">${t('pmNotFound')}</div></section>`;
    return;
  }
  if (def0.kind === 'licensed' && !def0.available) {
    root.innerHTML = `<section class="screen prom-screen">${back}<div class="card"><span class="chip neg">${t('pmLicReq')}</span><p style="margin:10px 0 0">${t('pmLicHelp')}</p></div></section>`;
    return;
  }
  let def: PromDef = def0;
  const st: FillState = {
    i: 0,
    a: [],
    acts: [],
    phase: def.dynamicItems && !def.available ? 'setup' : 'ask',
  };
  st.acts = (prof.promActivities || []).slice();
  const o = def.options;
  const optList = (): { v: number; text: string }[] | null =>
    o.labels ? o.labels.map((l, k) => ({ v: o.min + k, text: tr(l) })) : null;
  const mk = (fn: () => string): void => {
    root.innerHTML = fn();
    root.querySelector<HTMLElement>('.prom-screen')?.focus?.({ preventScroll: true });
  };
  const q = <T extends Element>(sel: string): T => root.querySelector<T>(sel)!;

  const drawSetup = (): void =>
    mk(() => {
      const rows = st.acts.length ? st.acts : ['', '', ''];
      st.acts = rows;
      return `<section class="screen prom-screen" tabindex="-1">${back}<p>${t('pmActIntro')}</p>
      <div class="stack">${rows.map((a, k) => `<input class="input" data-act="${k}" maxlength="60" value="${esc(a)}" placeholder="${t('pmActPh')}" aria-label="${t('pmActN', { n: k + 1 })}">`).join('')}</div>
      <div class="row" style="margin-top:12px">${rows.length < (def.dynamicItems?.max ?? 0) ? `<button class="btn sm ghost" data-act-add>${icon('plus', 16)} ${t('pmActAdd')}</button>` : ''}</div>
      <div class="prom-nav"><button class="btn" data-act-ok>${t('pmNext')}</button></div></section>`;
    });
  const bindSetup = (): void => {
    root.querySelectorAll<HTMLInputElement>('[data-act]').forEach((i) => {
      i.oninput = () => {
        st.acts[+(i.dataset['act'] ?? 0)] = i.value;
      };
    });
    const add = root.querySelector<HTMLElement>('[data-act-add]');
    if (add)
      add.onclick = () => {
        st.acts.push('');
        drawSetup();
        bindSetup();
      };
    q<HTMLElement>('[data-act-ok]').onclick = async () => {
      const acts = st.acts.map((x) => x.trim()).filter(Boolean);
      const dyn = def.dynamicItems!;
      if (acts.length < dyn.min) return toast(t('pmActMin', { n: dyn.min }));
      await updateProfile({ promActivities: acts.slice(0, dyn.max) });
      def = resolveDef(id, ctxOf(profile() as PromProfile))!;
      st.phase = 'ask';
      draw();
    };
  };

  const drawAsk = (): void => {
    const items = def.items;
    const n = items.length;
    const it = items[st.i]!;
    const cur = st.a[st.i];
    const ol = optList();
    const stem = def.stem ? `<p class="muted prom-stem">${esc(tr(def.stem))}</p>` : '';
    const qtext = def.id === 'activities' ? t('pmActQ', { a: tr(it.text) }) : tr(it.text);
    let ctl: string;
    if (def.id === 'sane') {
      const v = cur ?? 50;
      ctl = `<div class="prom-slider"><output class="prom-big tnum" id="pv">${isNil(cur) ? '–' : v + ' %'}</output><input type="range" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${v}" id="pr" aria-label="${esc(qtext)}"></div>
        <div class="row between small muted"><span>${esc(tr(o.ends?.[0]))}</span><span style="text-align:end">${esc(tr(o.ends?.[1]))}</span></div>`;
    } else if (ol && ol.length <= 7) {
      ctl = `<div class="prom-opts" role="radiogroup" aria-label="${esc(qtext)}">${ol.map((x) => `<button class="prom-opt ${cur === x.v ? 'on' : ''}" role="radio" aria-checked="${cur === x.v}" data-v="${x.v}">${esc(x.text)}</button>`).join('')}</div>`;
    } else {
      const vals = Array.from({ length: o.max - o.min + 1 }, (_, k) => o.min + k);
      ctl = `<div class="prom-grid" dir="ltr" role="radiogroup" aria-label="${esc(qtext)}">${vals.map((v) => `<button class="prom-num ${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-v="${v}">${v}</button>`).join('')}</div>
        ${o.ends ? `<div class="row between small muted" dir="ltr" style="margin-top:8px;gap:12px"><span dir="auto" style="text-align:left"><bdi>${o.min}</bdi> : ${esc(tr(o.ends[0]))}</span><span dir="auto" style="text-align:right"><bdi>${o.max}</bdi> : ${esc(tr(o.ends[1]))}</span></div>` : ''}`;
    }
    const canSkip = n > 1 && def.id !== 'activities';
    mk(
      () => `<section class="screen prom-screen" tabindex="-1"><div class="topbar"><button class="icon-btn" data-prev aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(nameOf(def))}</h1></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${st.i + 1}"><i style="width:${((st.i + 1) / n) * 100}%"></i></div>
      <div class="small muted" style="margin:8px 0 14px">${t('pmQn', { n: st.i + 1, total: n })}</div>
      ${stem}<h2 class="prom-q">${esc(qtext)}</h2>${ctl}
      <div class="prom-nav">${canSkip ? `<button class="link" data-skip>${t('pmSkip')}</button>` : '<span></span>'}<button class="btn" data-next ${isNil(cur) ? 'disabled' : ''}>${st.i === n - 1 ? t('pmFinish') : t('pmNext')}</button></div></section>`,
    );
    const nx = q<HTMLButtonElement>('[data-next]');
    root.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => {
      b.onclick = () => {
        st.a[st.i] = +(b.dataset['v'] ?? 0);
        drawAsk();
      };
    });
    const r = root.querySelector<HTMLInputElement>('#pr');
    if (r) {
      const upd = (): void => {
        st.a[st.i] = +r.value;
        q<HTMLElement>('#pv').textContent = r.value + ' %';
        nx.disabled = false;
      };
      r.oninput = upd;
      r.onchange = upd;
      r.onclick = upd;
      r.onpointerup = upd;
    }
    q<HTMLElement>('[data-prev]').onclick = prev;
    nx.onclick = next;
    const sk = root.querySelector<HTMLElement>('[data-skip]');
    if (sk)
      sk.onclick = () => {
        st.a[st.i] = null;
        next();
      };
  };
  // Quitter : si des réponses sont déjà données, on demande avant de les perdre
  const answered = (): boolean => st.a.some((v) => !isNil(v));
  const leave = async (): Promise<void> => {
    if (
      answered() &&
      !(await confirmSheet({
        title: t('pmQuitTitle'),
        text: t('pmQuitD'),
        ok: t('pmQuitYes'),
        cancel: t('pmQuitStay'),
        danger: true,
      }))
    )
      return;
    location.hash = '#/home';
  };
  const prev = (): void => {
    if (st.i > 0) {
      st.i--;
      drawAsk();
    } else void leave();
  };
  const next = (): void => {
    if (st.i < def.items.length - 1) {
      st.i++;
      drawAsk();
    } else void finish();
  };

  const finish = async (): Promise<void> => {
    const answers = def.items.map((_, k) => (isNil(st.a[k]) ? null : (st.a[k] as number)));
    const r = M.score(def, answers) as { score: number; valid: boolean; sub?: Record<string, unknown> };
    if (!r.valid) {
      root.innerHTML = `<section class="screen prom-screen" tabindex="-1">${back}<div class="card"><p style="margin:0">${t('pmInvalid')}</p></div><div class="prom-nav"><button class="btn" data-retry>${t('pmRetry')}</button></div></section>`;
      q<HTMLElement>('[data-retry]').onclick = () => {
        st.i = 0;
        st.phase = 'ask';
        draw();
      };
      return;
    }
    const entry: PromLogEntry = { id, ts: Date.now(), answers, score: r.score };
    if (r.sub) entry.sub = r.sub;
    if (def.id === 'activities') entry.acts = def.items.map((x) => tr(x.text));
    const log = [...((profile() as PromProfile | undefined)?.promLog || []), entry];
    try {
      await updateProfile({ promLog: log });
    } catch (e) {
      console.warn(e);
      toast(t('pmSaveErr'));
    }
    try {
      await syncProgress();
    } catch {
      /* le partage du suivi est facultatif : on continue */
    }
    const tn = M.trend(log, id, def) as PromTrend;
    const bd = def.id === 'pgic' ? null : M.band(def, r.score);
    const lab = def.id === 'pgic' ? tr((def.options.labels ?? [])[r.score - o.min]) : null;
    mk(
      () => `<section class="screen prom-screen" tabindex="-1"><div class="topbar"><h1>${esc(nameOf(def))}</h1></div>
      <div class="card prom-result"><span class="eyebrow">${t('pmYourScore')}</span>
        <div class="prom-big tnum">${lab ? esc(lab) : `${num(r.score)}<small> / ${num(def.range[1])}</small>`}</div>
        ${!isNil(bd) && def.kind !== 'custom' ? `<p class="prom-band b${bd}">${t('pmBand' + bd)}</p>` : ''}
        ${
          r.sub
            ? `<div class="small muted">${Object.entries(r.sub as Record<string, unknown>)
                .filter((kv): kv is [string, number] => !isNil(kv[1]) && typeof kv[1] === 'number')
                .map(([k, v]) => `${esc(t('pmSub_' + k) === 'pmSub_' + k ? k : t('pmSub_' + k))} : ${num(v)}`)
                .join(' · ')}</div>`
            : ''
        }
        <p style="margin:10px 0 0">${esc(changeText(tn, def))}</p>
        <p class="small muted" style="margin:8px 0 0">${def.higherIsBetter ? t('pmHigherIsBetter') : t('pmHigherIsWorse')}</p></div>
      <div class="prom-nav"><button class="btn ghost" data-go="#/proms">${t('pmHistory')}</button><button class="btn" data-go="#/home">${t('pmDone')}</button></div></section>`,
    );
  };

  const draw = (): void => {
    if (st.phase === 'setup') {
      drawSetup();
      bindSetup();
    } else drawAsk();
  };
  draw();

  // Clavier : chiffres = réponse, Entrée / flèche suivante = suivant, flèche précédente = retour (inversées en RTL)
  const onKey = (e: KeyboardEvent): void => {
    if (!document.body.contains(root.querySelector('.prom-screen'))) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    const target = e.target as HTMLElement;
    if (
      st.phase !== 'ask' ||
      !root.querySelector('[data-next]') ||
      target.closest?.('input[type=text],input:not([type]),textarea')
    )
      return;
    const rtl = document.documentElement.dir === 'rtl';
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === 'Enter' || e.key === nextKey) {
      const n = root.querySelector<HTMLButtonElement>('[data-next]');
      if (n && !n.disabled && !(e.key === 'Enter' && target.closest('button'))) {
        e.preventDefault();
        n.click();
      }
    } else if (e.key === prevKey && (target as HTMLInputElement).type !== 'range') {
      e.preventDefault();
      root.querySelector<HTMLElement>('[data-prev]')?.click();
    } else if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
    else if (e.key === 'Escape') {
      if (!document.querySelector('.sheet-bg')) void leave();
    }
  };
  // Chiffres : sur une échelle 0–10, « 1 » suivi de « 0 » en moins d'une seconde = 10 ; sinon le chiffre seul vaut sa valeur (« 1 » = 1).
  // Les touches 2–9 sont immédiates ; « 0 » seul = 0.
  let buf: { d: string; at: number } | null = null;
  const pressDigit = (d: string): void => {
    const el = (v: string | number): HTMLElement | null => root.querySelector<HTMLElement>(`[data-v="${v}"]`);
    if (buf && buf.d === '1' && d === '0' && Date.now() - buf.at < 1000 && el(10)) {
      buf = null;
      el(10)!.click();
      return;
    }
    buf = d === '1' && el(10) ? { d, at: Date.now() } : null;
    el(d)?.click();
  };
  document.addEventListener('keydown', onKey);
  keyOff = () => document.removeEventListener('keydown', onKey);
}

// ---------- Historique ----------
export function viewPromHistory($app: Host): void {
  const root = hostOf($app);
  const prof = (profile() || {}) as PromProfile;
  const ctx = ctxOf(prof);
  const log = prof.promLog || [];
  const ids = [...new Set(log.map((l) => l.id))];
  const planned = (prof.promPlan || [])
    .map((p) => p.id)
    .filter((id) => {
      const d = defOf(id, ctx.custom);
      return d && (d.dynamicItems || isAvail(id, ctx));
    });
  const todo = [
    ...new Set([...planned, ...(M.suggestFor(prof.region).general as string[]).filter((id) => !planned.includes(id))]),
  ];
  const rows = ids
    .map((id) => {
      const def = defOf(id, ctx.custom);
      if (!def) return '';
      const tn = M.trend(log, id, def) as PromTrend;
      const series = log
        .filter((l) => l.id === id && typeof l.score === 'number')
        .sort((a, b) => a.ts - b.ts)
        .map((l): [number, number] => [l.ts, l.score as number]);
      return `<div class="card prom-hist"><div class="row between"><b>${esc(nameOf(def))}</b>${tn.mcidReached ? `<span class="chip pos sm">${icon('check', 12)} ${t('pmMcidBadge')}</span>` : ''}</div>
      <div class="row" style="gap:18px;margin:8px 0"><div><div class="small muted">${t('pmLast')}</div><div class="prom-mid tnum">${num(tn.last)}</div></div>
        ${!isNil(tn.delta) ? `<div><div class="small muted">${t('pmVsStart')}</div><div class="prom-mid tnum ${(tn.improvement ?? 0) > 0 ? 'pos' : (tn.improvement ?? 0) < 0 ? 'neg' : ''}">${tn.delta > 0 ? '+' : ''}${num(tn.delta)}</div></div>` : ''}</div>
      <div class="chart">${lineSvg(series, def, { label: nameOf(def) })}</div>
      <div class="small muted">${series
        .map(
          (p) =>
            '<bdi>' +
            new Date(p[0]).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) +
            ' : ' +
            num(p[1]) +
            '</bdi>',
        )
        .slice(-6)
        .join(' · ')}</div></div>`;
    })
    .join('');
  root.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('pmHistory')}</h1></div>
    <h2>${t('pmFillNow')}</h2><div class="stack">${todo.map((id) => `<button class="prom-due" data-prom-go="${esc(id)}"><span class="grow"><b>${esc(nameOf(M.instrumentDef(id, ctx.custom)))}</b></span>${icon('play', 18)}</button>`).join('')}</div>
    <h2>${t('pmResults')}</h2>${rows || `<div class="card muted">${t('pmNone')}</div>`}</section>`;
  bindHomeCardProm(root, (h) => {
    location.hash = h;
  });
}

// ---------- Clinicien : fiche patient ----------
export function clinicPanelProm(part?: { prom?: PromSummaryRow[] } | null): string {
  const list = part?.prom || [];
  if (!list.length) return '';
  return (
    `<h2>${t('pmTitle')}</h2>` +
    list
      .map((p) => {
        const def = { range: p.range || ([0, 100] as [number, number]), higherIsBetter: p.higherIsBetter };
        const arrow = isNil(p.delta)
          ? ''
          : `<span class="prom-delta ${(p.improvement ?? 0) > 0 ? 'pos' : (p.improvement ?? 0) < 0 ? 'neg' : ''}">${p.delta > 0 ? '+' : ''}${num(p.delta)}</span>`;
        return `<div class="card prom-clin"><div class="row between"><b>${esc(tr(p.name))}</b>${p.mcidReached ? `<span class="chip pos sm">${icon('check', 12)} ${t('pmMcidBadge')}</span>` : p.worsened ? `<span class="chip neg sm">${t('pmWorsened')}</span>` : ''}</div>
      <div class="row" style="margin-top:6px;gap:14px"><div><div class="small muted">${t('pmBaseline')}</div><b class="tnum">${num(p.baseline)}</b></div><div><div class="small muted">${t('pmLast')}</div><b class="tnum">${num(p.last)}</b></div>${arrow ? `<div><div class="small muted">${t('pmVsStart')}</div>${arrow}</div>` : ''}
        <div class="grow prom-spark">${lineSvg(p.series || [], def, { w: 120, h: 34, full: false, label: tr(p.name) })}</div></div>
      <div class="small muted" style="margin-top:4px">${p.lastTs ? new Date(p.lastTs).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : ''}${p.higherIsBetter ? ' · ' + t('pmHigherIsBetter') : ' · ' + t('pmHigherIsWorse')}</div></div>`;
      })
      .join('')
  );
}

// ---------- Clinicien : éditeur de programme ----------
const EVERY = [0, 1, 2, 4, 6, 8, 12];
export interface PromSectionRead {
  prom: PromPlanItem[];
  promCustom: CustomProm[];
  promTexts: Record<string, unknown>;
}
export function rxSectionProm(rx: PromRx = {}): {
  html: string;
  bind(root: ParentNode): void;
  read(root: ParentNode): PromSectionRead;
} {
  const plan0: PromPlanItem[] = (rx.prom || []).map((p) => ({
    id: p.id,
    every: +(p.every as number) || 0,
    first: +(p.first as number) || 0,
  }));
  const custom0: CustomProm[] = JSON.parse(JSON.stringify(rx.promCustom || []));
  const region = rx.region;

  const body = (plan: PromPlanItem[], custom: CustomProm[]): string => {
    const ctx = { custom, licenses: mergeLic(rx.promTexts), activities: [] as string[] };
    const taken = new Set(plan.map((p) => p.id));
    const sug: { general: string[]; region: string[] } = M.suggestFor(region);
    const pill = (id: string): string => {
      const def = defOf(id, custom)!;
      const ok = def.kind !== 'licensed' || isAvail(id, ctx);
      return `<button class="pill ${ok ? '' : 'lock'}" data-padd="${id}" ${ok ? '' : 'aria-disabled="true"'}>${esc(tr(def.name))}${ok ? '' : ' · ' + t('pmLicReq')}</button>`;
    };
    const sel = (v: number): string =>
      `<select class="input sm" data-every aria-label="${t('pmEvery')}">${EVERY.map((e) => `<option value="${e}" ${e === v ? 'selected' : ''}>${e === 0 ? t('pmOnce') : e === 1 ? t('pmEvery1') : t('pmEveryN', { n: e })}</option>`).join('')}</select>`;
    const rows = plan
      .map((p) => {
        const def = defOf(p.id, custom);
        if (!def) return '';
        const lic = def.kind === 'licensed' && !isAvail(p.id, ctx);
        return `<div class="prom-row" data-id="${esc(p.id)}"><div class="row between"><b>${esc(tr(def.name))}</b><button class="icon-btn" data-prm="${esc(p.id)}" aria-label="${t('remove')}" style="width:34px;height:34px">${icon('close', 16)}</button></div>
        ${lic ? `<div class="small neg">${t('pmLicReq')} — ${t('pmLicBlocked')}</div>` : ''}
        <div class="row wrap" style="margin-top:6px">${sel(p.every)}<label class="small muted row" style="gap:6px">${t('pmFirstAfter')}<input class="input sm" type="number" min="0" max="365" data-first value="${p.first}" style="width:76px"></label>
        ${isCustomIdLocal(p.id) ? `<button class="link small" data-pedit="${esc(p.id)}">${t('pmEdit')}</button>` : `<span class="small muted">${def.mcid ? t('pmMcidInfo', { v: def.mcid.value }) : ''}</span>`}</div></div>`;
      })
      .join('');
    const instruments = M.INSTRUMENTS as Record<string, { kind?: string; name: unknown }>;
    const lic = Object.keys(instruments).filter((id) => instruments[id]!.kind === 'licensed');
    const rest = ([...M.FREE_ORDER, ...M.LICENSED_ORDER] as string[]).filter(
      (id) => !sug.general.includes(id) && !sug.region.includes(id) && !taken.has(id),
    );
    return `<h2>${t('pmTitle')}</h2><p class="small muted" style="margin:-4px 0 8px">${t('pmRxHelp')}</p>
      <div class="stack">${rows || `<div class="card muted small">${t('pmNoneRx')}</div>`}</div>
      <div class="small muted" style="margin:12px 0 6px">${t('pmSuggested')}</div><div class="pills wrapped">${
        sug.region
          .filter((id) => !taken.has(id))
          .map(pill)
          .join('') || ''
      }${sug.general
        .filter((id) => !taken.has(id))
        .map(pill)
        .join('')}${custom
        .filter((c) => !taken.has(c.id))
        .map((c) => pill(c.id))
        .join('')}</div>
      ${rest.length ? `<details style="margin-top:8px"><summary class="small" style="cursor:pointer;font-weight:700">${t('pmAllInstruments')}</summary><div class="pills wrapped" style="margin-top:8px">${rest.map(pill).join('')}</div></details>` : ''}
      <div class="row wrap" style="margin-top:10px"><button class="btn sm ghost" data-pnew>${icon('plus', 16)} ${t('pmCustom')}</button>
        <button class="btn sm soft" data-plic>${icon('doc', 16)} ${t('pmLicImport')}</button><input type="file" accept="application/json,.json" data-pfile hidden></div>
      <p class="small muted" style="margin:8px 0 0">${t('pmLicHelp')} ${
        lic.some((id) => isAvail(id, ctx))
          ? t('pmLicHave', {
              list: lic
                .filter((id) => isAvail(id, ctx))
                .map((id) => tr(instruments[id]!.name))
                .join(', '),
            })
          : ''
      }</p>`;
  };
  const isCustomIdLocal: (id: string) => boolean = M.isCustomId;

  const html = `<div class="prom-sec" data-prom-sec data-custom="${esc(JSON.stringify(custom0))}" data-plan="${esc(JSON.stringify(plan0))}">${body(plan0, custom0)}</div>`;

  const sec = (root: ParentNode): HTMLElement | null => root.querySelector<HTMLElement>('[data-prom-sec]');
  const readPlan = (root: ParentNode): PromPlanItem[] =>
    [...sec(root)!.querySelectorAll<HTMLElement>('.prom-row')].map((r) => ({
      id: r.dataset['id'] ?? '',
      every: +r.querySelector<HTMLInputElement>('[data-every]')!.value || 0,
      first: Math.max(0, +r.querySelector<HTMLInputElement>('[data-first]')!.value || 0),
    }));
  const readCustom = (root: ParentNode): CustomProm[] => {
    try {
      return JSON.parse(sec(root)!.dataset['custom'] || '[]');
    } catch {
      return [];
    }
  };

  function read(root: ParentNode): PromSectionRead {
    const el = sec(root);
    if (!el) {
      const prom = plan0.filter((p) => isAvail(p.id, { custom: custom0, licenses: mergeLic(rx.promTexts) }));
      return { prom, promCustom: custom0, promTexts: packTexts(prom, rx.promTexts) };
    }
    const custom = readCustom(root);
    const ctx = { custom, licenses: mergeLic(rx.promTexts), activities: [] as string[] };
    const prom = readPlan(root).filter((p) => {
      const d = defOf(p.id, custom);
      return d && (d.kind !== 'licensed' || isAvail(p.id, ctx)) && (d.kind !== 'custom' || M.nItemsOf(d) > 0);
    });
    return {
      prom,
      promCustom: custom.filter((c) => prom.some((p) => p.id === c.id)),
      promTexts: packTexts(prom, rx.promTexts),
    };
  }

  function bind(root: ParentNode): void {
    const el = sec(root);
    if (!el) return;
    const redraw = (plan: PromPlanItem[], custom: CustomProm[]): void => {
      el.dataset['custom'] = JSON.stringify(custom);
      el.innerHTML = body(plan, custom);
      wire();
    };
    const wire = (): void => {
      const plan = readPlan(root);
      const custom = readCustom(root);
      el.querySelectorAll<HTMLElement>('[data-prm]').forEach((b) => {
        b.onclick = () =>
          redraw(
            plan.filter((p) => p.id !== b.dataset['prm']),
            custom,
          );
      });
      el.querySelectorAll<HTMLElement>('[data-padd]').forEach((b) => {
        b.onclick = () => {
          if (b.getAttribute('aria-disabled') === 'true') return toast(t('pmLicReq') + ' — ' + t('pmLicBlocked'));
          const id = b.dataset['padd'] ?? '';
          redraw([...plan, { id, every: 4, first: id === 'pgic' ? 28 : 0 }], custom);
        };
      });
      el.querySelectorAll<HTMLElement>('[data-pedit]').forEach((b) => {
        b.onclick = () =>
          openBuilder(
            custom.find((c) => c.id === b.dataset['pedit']),
            (c) =>
              redraw(
                plan,
                custom.map((x) => (x.id === c.id ? c : x)),
              ),
          );
      });
      el.querySelector<HTMLElement>('[data-pnew]')!.onclick = () =>
        openBuilder(null, (c) => redraw([...plan, { id: c.id, every: 4, first: 0 }], [...custom, c]));
      const file = el.querySelector<HTMLInputElement>('[data-pfile]')!;
      el.querySelector<HTMLElement>('[data-plic]')!.onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files?.[0];
        if (!f) return;
        let txt = '';
        try {
          txt = await f.text();
        } catch {
          /* fichier illisible : texte vide, la validation refusera */
        }
        const v = importPromLicense(txt);
        toast(
          v.ok
            ? t('pmLicOk', { name: tr((M.INSTRUMENTS as Record<string, { name: unknown }>)[v.id ?? '']!.name) })
            : t('pmLicErr'),
          3500,
        );
        if (v.ok) redraw(plan, custom);
      };
    };
    wire();
  }
  return { html, bind, read };
}

// Constructeur de questionnaire personnalisé (feuille). cb(c) avec le questionnaire enregistré.
function openBuilder(existing: CustomProm | null | undefined, cb: (c: CustomProm) => void): void {
  const c: CustomProm = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: 'c_' + Date.now().toString(36),
        title: '',
        questions: [{ text: '' }],
        scale: '0-10',
        score: 'mean',
        higherIsBetter: false,
      };
  const bg = sheet('<div data-bld></div>');
  const box = bg.querySelector<HTMLElement>('[data-bld]')!;
  const seg = (name: string, opts: [string, string][], cur: string): string =>
    `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cur}" data-seg="${name}" data-v="${esc(String(v))}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const draw = (): void => {
    box.innerHTML = `<h2 style="margin-top:0">${t('pmCustom')}</h2>
      <label class="field"><span>${t('pmBTitle')}</span><input class="input" data-title maxlength="80" value="${esc(c.title)}"></label>
      <div class="field"><span>${t('pmBQuestions')}</span><div class="stack">${c.questions.map((q, i) => `<div class="row"><textarea class="input grow" rows="2" data-q="${i}" maxlength="240" aria-label="${t('pmActN', { n: i + 1 })}">${esc(q.text)}</textarea><button type="button" class="icon-btn" data-qrm="${i}" aria-label="${t('remove')}">${icon('close', 16)}</button></div>`).join('')}</div>
        <button type="button" class="btn sm ghost" data-qadd style="margin-top:8px">${icon('plus', 16)} ${t('pmBAddQ')}</button></div>
      <div class="field"><span>${t('pmBScale')}</span>${seg(
        'scale',
        [
          ['0-10', t('pmScale010')],
          ['likert', t('pmScaleLikert')],
          ['yesno', t('pmScaleYesNo')],
        ],
        c.scale,
      )}</div>
      <div class="field"><span>${t('pmBScore')}</span>${seg(
        'score',
        [
          ['sum', t('pmSum')],
          ['mean', t('pmMean')],
          ['pct', t('pmPct')],
        ],
        c.score,
      )}</div>
      <div class="field"><span>${t('pmBDir')}</span>${seg(
        'dir',
        [
          ['better', t('pmHigherBetter')],
          ['worse', t('pmHigherWorse')],
        ],
        c.higherIsBetter ? 'better' : 'worse',
      )}</div>
      <div class="row"><button type="button" class="btn ghost" data-cancel>${t('cancel')}</button><button type="button" class="btn" data-save>${t('pmBSave')}</button></div>`;
    box.querySelector<HTMLInputElement>('[data-title]')!.oninput = (e) => {
      c.title = (e.target as HTMLInputElement).value;
    };
    box.querySelectorAll<HTMLTextAreaElement>('[data-q]').forEach((x) => {
      x.oninput = () => {
        c.questions[+(x.dataset['q'] ?? 0)]!.text = x.value;
      };
    });
    box.querySelectorAll<HTMLElement>('[data-qrm]').forEach((x) => {
      x.onclick = () => {
        c.questions.splice(+(x.dataset['qrm'] ?? 0), 1);
        if (!c.questions.length) c.questions.push({ text: '' });
        draw();
      };
    });
    box.querySelector<HTMLElement>('[data-qadd]')!.onclick = () => {
      c.questions.push({ text: '' });
      draw();
      box.querySelectorAll<HTMLElement>('[data-q]')[c.questions.length - 1]?.focus();
    };
    box.querySelectorAll<HTMLElement>('[data-seg]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset['seg'] ?? '';
        const v = b.dataset['v'] ?? '';
        if (k === 'dir') c.higherIsBetter = v === 'better';
        else c[k] = v;
        draw();
      };
    });
    box.querySelector<HTMLElement>('[data-cancel]')!.onclick = () => bg.remove();
    box.querySelector<HTMLElement>('[data-save]')!.onclick = () => {
      c.questions = c.questions.filter((q) => q.text.trim()).map((q) => ({ text: q.text.trim() }));
      if (!c.questions.length) {
        c.questions = [{ text: '' }];
        draw();
        return toast(t('pmBNeedQ'));
      }
      c.title = c.title.trim() || t('pmCustom');
      bg.remove();
      cb(c);
    };
  };
  draw();
}
