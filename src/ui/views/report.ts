// Rapports (affichage) : carte d'accueil, vue #/rapport, section de l'éditeur de programme, bouton PDF de la fiche patient.
// La logique pure est dans src/domains/outcomes/report.ts ; le PDF est dessiné par report-pdf.ts (jsPDF vendu en local).
// Code de www/js/report.js (v1.15) ; l'état de l'application (state.js) et ui.js restent ceux de v1.15 jusqu'à leur migration.
import { getLang, locale, t, tr, type Localized } from '../../core/i18n/engine.ts';
import {
  buildReportData,
  dataFromSummary,
  lastReportTs,
  reportDue,
  reportPeriod,
  summaryPart,
  REPORT_EVERY,
  type ReportOptions,
  type SharedSummary,
} from '../../domains/outcomes/report.ts';
import * as P from '../../domains/rehab/program.ts';
import type { JournalEntry, PatientData, Profile } from '../../domains/rehab/types.ts';
import { EXERCISES as RAW_EXERCISES } from '../../../www/js/data/exercises.js';
import {
  go as stateGo,
  profile as legacyProfile,
  sessions as stateSessions,
  state,
  updateProfile,
} from '../../../www/js/state.js';
import { pdfLang, renderPdf, sharePdf } from '../compat/reportpdf.ts';
import type * as Ui from '../../../www/js/ui.js';

const EXERCISES = RAW_EXERCISES as unknown as Readonly<Record<string, { name: Localized<string> }>>;
const profile = (): Profile | null | undefined => legacyProfile() as unknown as Profile | null | undefined;
const patientData = (): PatientData | null | undefined => (state as unknown as { data?: PatientData | null }).data;

// ui.js touche document à l'import : chargé à la demande pour que la logique reste testable sous node
let UI: typeof Ui | null = null;
import('../../../www/js/ui.js').then(
  (m) => {
    UI = m;
  },
  () => undefined,
);
const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
const icon = (n: string, s = 18): string => (UI ? UI.icon(n, s) : '');
const toast = (m: string, ms?: number): void => {
  if (UI) UI.toast(m, ms);
};
type RootLike = HTMLElement | null | undefined | (() => HTMLElement | null | undefined);
const rootOf = ($app: RootLike): HTMLElement | null | undefined => (typeof $app === 'function' ? $app() : $app);

// =====================================================================================================================
// Éditeur de programme (clinicien)
// =====================================================================================================================
export function rxSectionReport(rx: { report?: { every?: unknown } | null } = {}): {
  html: string;
  bind(): void;
  read(root: ParentNode | null | undefined): { report: { every: number } | { every?: unknown } | null };
} {
  const cur = +(rx?.report?.every as number) > 0 ? +(rx?.report?.every as number) : 0;
  const html = `<h2>${esc(t('rp_secTitle'))}</h2><div class="card" data-rp-sec>
    <p class="muted small" style="margin:0 0 10px">${esc(t('rp_secD'))}</p>
    <label class="field" style="margin:0"><span>${esc(t('rp_freq'))}</span><select class="input" data-rp-every>${REPORT_EVERY.map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${esc(n === 1 ? t('rp_every1') : n ? t('rp_everyN', { n }) : t('rp_none'))}</option>`).join('')}</select></label></div>`;
  return {
    html,
    bind() {
      /* rien à brancher */
    },
    /** → { report: { every } | null } */
    read(root) {
      const sel = root?.querySelector?.('[data-rp-every]') as HTMLSelectElement | null | undefined;
      if (!sel) return { report: rx?.report || null };
      const n = +sel.value || 0;
      return { report: n > 0 ? { every: n } : null };
    },
  };
}

// =====================================================================================================================
// Accueil patient
// =====================================================================================================================
export function homeCardReport(prof: Profile | null | undefined, now: number = Date.now()): string {
  if (!prof || !reportDue(prof, now)) return '';
  return `<div class="card rp-card" data-rp-card><div class="row between"><span class="eyebrow">${esc(t('rp_dueTitle'))}</span></div>
    <button class="rp-due" data-rp-go><span class="grow"><b>${esc(t('rp_title'))}</b><small class="muted">${esc(t('rp_dueD'))}</small></span>${icon('doc', 20)}</button></div>`;
}
export function bindHomeCardReport(root: ParentNode | null | undefined, go: (hash: string) => void = stateGo): void {
  root?.querySelectorAll?.('[data-rp-go]').forEach((b) => {
    (b as HTMLElement).onclick = () => go('#/rapport');
  });
}

// =====================================================================================================================
// Vue patient : #/rapport
// =====================================================================================================================
const dateLong = (ts: number): string =>
  new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const pdfFileName = (now: number = Date.now()): string => `Mobilis-rapport-${P.todayKey(now)}.pdf`;
const GLOBAL = [-2, -1, 0, 1, 2];

interface FormFields {
  global: number | null;
  pain: number | null;
  goalsProgress: number | null;
  goals: string;
  hardEx: string[];
  difficulties: string;
  comment: string;
  includeName: boolean;
  sendClin: boolean;
  [key: string]: unknown;
}

async function makePdf(
  prof: Profile,
  fields: ReportOptions['fields'],
  includeName: boolean,
): Promise<{ data: ReturnType<typeof buildReportData>; blob: Blob }> {
  const sess = stateSessions() as unknown as PatientData['sessions'],
    journal: JournalEntry[] = patientData()?.journal || [];
  const data = buildReportData(prof, sess, journal, { fields, includeName });
  const blob = await renderPdf(data, pdfLang(getLang()));
  return { data, blob };
}
async function shareResult(blob: Blob, name: string): Promise<string> {
  const how = await sharePdf(blob, name, { title: t('rp_shareTitle') });
  if (how === 'download') toast(t('rp_downloaded'));
  return how;
}

export function viewPatientReport($app: RootLike): void {
  const maybeRoot = rootOf($app);
  if (!maybeRoot) return;
  const root: HTMLElement = maybeRoot;
  const maybeProf = profile();
  if (!maybeProf) return stateGo('#/home');
  const prof: Profile = maybeProf;
  const sess = stateSessions() as unknown as PatientData['sessions'];
  const per = reportPeriod(prof, sess);
  const last = lastReportTs(prof);
  const f: FormFields = {
    global: null,
    pain: null,
    goalsProgress: null,
    goals: '',
    hardEx: [],
    difficulties: '',
    comment: '',
    includeName: true,
    sendClin: false,
  };
  let busy = false,
    done: { blob: Blob; name: string } | null = null;
  const progIds = ((): string[] => {
    try {
      return P.exerciseIds(prof);
    } catch {
      return [];
    }
  })().filter((id) => EXERCISES[id]);
  const canSend = !!prof.rxCode;

  const seg = (name: string, vals: number[], cur: number | null, label: (v: number) => string): string =>
    `<div class="rp-seg" role="radiogroup" aria-label="${esc(name)}">${vals.map((v) => `<button type="button" role="radio" aria-checked="${cur === v}" class="${cur === v ? 'on' : ''}" data-rp-${name}="${v}">${label(v)}</button>`).join('')}</div>`;

  function draw(): void {
    root.innerHTML = `<section class="screen rp-screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(t('rp_title'))}</h1></div>
      <p class="muted small">${esc(t('rp_intro'))}</p>
      <div class="card rp-meta"><div class="row between"><span class="small muted">${esc(t('rp_period'))}</span><b class="small"><bdi>${esc(dateLong(per.from))}</bdi> – <bdi>${esc(dateLong(per.to))}</bdi></b></div>
        <div class="row between" style="margin-top:6px"><span class="small muted">${esc(t('rp_lastReport'))}</span><b class="small">${last ? `<bdi>${esc(dateLong(last))}</bdi>` : esc(t('rp_never'))}</b></div></div>
      ${
        done
          ? `<div class="card rp-done" role="status"><b>${icon('check', 18)} ${esc(t('rp_done'))}</b><p class="small muted" style="margin:6px 0 12px">${esc(t('rp_doneD'))}</p>
        <div class="row wrap"><button class="btn" data-rp-again>${icon('share', 18)} ${esc(t('rp_shareAgain'))}</button><button class="btn ghost" data-go="#/home">${esc(t('done'))}</button></div></div>`
          : `
      <h2>${esc(t('rp_global'))}</h2>${seg('g', GLOBAL, f.global, (v) => esc(t('rp_g' + (v < 0 ? 'm' + -v : v))))}
      <h2>${esc(t('rp_painNow'))}</h2><p class="small muted" style="margin:-4px 0 8px">${esc(t('rp_painD'))}</p>
      <div class="rp-scale" dir="ltr" role="radiogroup" aria-label="${esc(t('rp_painNow'))}">${Array.from({ length: 11 }, (_, i) => `<button type="button" role="radio" aria-checked="${f.pain === i}" class="${f.pain === i ? 'on' : ''}" data-rp-p="${i}">${i}</button>`).join('')}</div>
      <h2>${esc(t('rp_goalsProg'))}</h2>${seg('gp', [0, 1, 2, 3], f.goalsProgress, (v) => esc(t('rp_gp' + v)))}
      <label class="field" style="margin-top:10px"><span>${esc(t('rp_goals'))}</span><textarea class="input" rows="2" data-rp-f="goals" placeholder="${esc(t('rp_goalsPh'))}">${esc(f.goals)}</textarea></label>
      ${progIds.length ? `<h2>${esc(t('rp_hardEx'))}</h2><div class="pills wrapped">${progIds.map((id) => `<button type="button" class="pill ${f.hardEx.includes(id) ? 'on' : ''}" aria-pressed="${f.hardEx.includes(id)}" data-rp-ex="${id}">${esc(tr(EXERCISES[id]?.name))}</button>`).join('')}</div>` : ''}
      <label class="field" style="margin-top:12px"><span>${esc(t('rp_diff'))}</span><textarea class="input" rows="3" data-rp-f="difficulties" placeholder="${esc(t('rp_diffPh'))}">${esc(f.difficulties)}</textarea></label>
      <label class="field"><span>${esc(t('rp_comment'))}</span><textarea class="input" rows="3" data-rp-f="comment">${esc(f.comment)}</textarea></label>
      <div class="list">
        ${prof.name ? `<div class="toggle"><span>${esc(t('rp_includeName'))}</span><button type="button" class="switch ${f.includeName ? 'on' : ''}" role="switch" aria-checked="${f.includeName}" data-rp-sw="includeName"></button></div>` : ''}
        ${canSend ? `<div class="toggle"><span>${esc(t('rp_sendClin'))}<br><small class="muted">${esc(t('rp_sendClinD'))}</small></span><button type="button" class="switch ${f.sendClin ? 'on' : ''}" role="switch" aria-checked="${f.sendClin}" data-rp-sw="sendClin"></button></div>` : ''}
      </div>
      <div class="stack" style="margin-top:16px"><button class="btn" data-rp-make ${busy ? 'disabled' : ''}>${icon('doc', 18)} ${esc(busy ? t('rp_working') : t('rp_make'))}</button>
        <button class="btn ghost" data-rp-adhoc ${busy ? 'disabled' : ''}>${esc(t('rp_adhoc'))}</button></div>
      <p class="note" style="margin-top:12px">${esc(t('rp_privacy'))}</p>`
      }
    </section>${UI ? UI.nav('progress', 'patient') : ''}`;
    wire();
  }

  function wire(): void {
    const q = (s: string): NodeListOf<HTMLElement> => root.querySelectorAll<HTMLElement>(s);
    q('[data-rp-g]').forEach(
      (b) =>
        (b.onclick = () => {
          f.global = +(b.dataset['rpG'] as string);
          draw();
        }),
    );
    q('[data-rp-gp]').forEach(
      (b) =>
        (b.onclick = () => {
          f.goalsProgress = +(b.dataset['rpGp'] as string);
          draw();
        }),
    );
    q('[data-rp-p]').forEach(
      (b) =>
        (b.onclick = () => {
          f.pain = +(b.dataset['rpP'] as string);
          draw();
        }),
    );
    q('[data-rp-ex]').forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset['rpEx'] as string;
          f.hardEx = f.hardEx.includes(id) ? f.hardEx.filter((x) => x !== id) : [...f.hardEx, id];
          draw();
        }),
    );
    q('[data-rp-f]').forEach(
      (el) =>
        ((el as HTMLInputElement).oninput = () => {
          f[el.dataset['rpF'] as string] = (el as HTMLInputElement).value;
        }),
    );
    q('[data-rp-sw]').forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset['rpSw'] as string;
          f[k] = !f[k];
          draw();
        }),
    );
    const mk = root.querySelector<HTMLElement>('[data-rp-make]'),
      ad = root.querySelector<HTMLElement>('[data-rp-adhoc]'),
      again = root.querySelector<HTMLElement>('[data-rp-again]');
    if (mk) mk.onclick = () => void run(true);
    if (ad) ad.onclick = () => void run(false);
    if (again) again.onclick = () => void (done && shareResult(done.blob, done.name));
  }

  async function run(withForm: boolean): Promise<void> {
    if (busy) return;
    busy = true;
    draw();
    try {
      const p0 = profile() as Profile;
      const fields = withForm
        ? {
            global: f.global,
            pain: f.pain,
            goalsProgress: f.goalsProgress,
            goals: f.goals,
            hardEx: f.hardEx,
            difficulties: f.difficulties,
            comment: f.comment,
          }
        : null;
      const { data, blob } = await makePdf(p0, fields, f.includeName);
      const name = pdfFileName();
      if (withForm) {
        const ts = Date.now();
        await updateProfile({ reportLog: [...(p0.reportLog || []), { ts, fields: data.fields || {}, pdfName: name }] });
        try {
          (await import('../../../www/js/badges.js')).syncBadges();
        } catch {
          /* badges facultatifs */
        }
        if (f.sendClin) sendToClinician().catch(() => undefined);
      }
      done = { blob, name };
      busy = false;
      draw();
      await shareResult(blob, name);
    } catch (e) {
      console.warn('rapport', e);
      busy = false;
      draw();
      toast(t('rp_err'), 4000);
    }
  }
  async function sendToClinician(): Promise<void> {
    const store = await import('../../services/db/store.ts');
    const p = profile();
    if (!store.isCloud() || !p?.rxCode) {
      toast(t('shareNeedsAccount'));
      return;
    }
    await store.pushProgress(p.rxCode, {
      ...P.progressSummary(p, stateSessions() as unknown as PatientData['sessions']),
      ...summaryPart(p),
    });
    toast(t('rp_sentOk'));
  }
  draw();
}

// =====================================================================================================================
// Clinicien : PDF depuis le résumé du patient
// =====================================================================================================================
export function clinicPdfButton(summary: unknown): string {
  if (!summary) return '';
  return `<div class="rp-clin"><button class="btn ghost sm" data-rp-clinpdf>${icon('doc', 16)} ${esc(t('rp_pdfClin'))}</button><small class="muted" style="display:block;margin-top:4px">${esc(t('rp_pdfClinD'))}</small></div>`;
}
/** extra : { pathology (id | { fr, en }), surgeryDate } facultatifs, connus de la fiche patient. */
export function bindClinicPdf(
  root: ParentNode | null | undefined,
  summary: SharedSummary,
  extra: Parameters<typeof dataFromSummary>[1] = {},
): void {
  const b = root?.querySelector?.<HTMLButtonElement>('[data-rp-clinpdf]');
  if (!b) return;
  b.onclick = async () => {
    b.disabled = true;
    try {
      const data = dataFromSummary(summary, extra);
      const blob = await renderPdf(data, pdfLang(getLang()));
      await sharePdf(blob, `Mobilis-rapport-patient-${P.todayKey()}.pdf`, { title: t('rp_shareTitle') });
    } catch (e) {
      console.warn('pdf clinicien', e);
      toast(t('rp_err'), 4000);
    }
    b.disabled = false;
  };
}
