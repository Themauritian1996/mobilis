// Mode clinicien : préparer un programme, l'envoyer par code / QR / lien, suivre et ajuster la progression du patient
// (reprise de www/js/clinic.js, v1.15). La logique pure (formulaire, dose, charge utile, partage, QR) est dans
// domains/clinic/rx.ts.
import { t, tp, locale, LANGS, langInfo, dowNarrow } from '../../../www/js/i18n.js';
import { tr } from '../components/l10n.ts';
import { REGIONS as REGION_DATA } from '../../../www/js/data/pathologies.js';
import { EXERCISES as EXERCISE_DATA, EQUIP as EQUIP_DATA } from '../../../www/js/data/exercises.js';
import { EQUIP_IDS, missing, alternatives } from '../../../www/js/equip.js';
import * as store from '../../../www/js/store.js';
import { featureNavHtml } from '../features/patients/nav-entries.ts';
import { patientCsv, toggleDay, canToggleDay } from '../../../www/js/longterm.js';
import * as P from '../../../www/js/program.js';
import type * as Report from '../../../www/js/report.js';
import {
  type DoseKey,
  type RxAi,
  type RxForm,
  type StoredRx,
  type WatchedPatient,
  DAYS_BY_FREQ,
  cleanSharedAi,
  levelIn,
  linkOf,
  moveId,
  newRxForm,
  pathologyOf,
  patientFileBase,
  PATHOLOGY_LIST,
  qrSvg,
  regionExercises,
  replaceExercise,
  rxPayload,
  rxRef,
  setLevel,
  shareMessage,
  shownDose,
  steppedDose,
  stepMaxLevel,
  toggleDefaultOn,
  toggleEquip,
  trialRx,
  watchCount,
} from '../../domains/clinic/rx.ts';
import { doseText } from '../../domains/rehab/training.ts';
import { clinicPanelRom, rxSectionRom } from './rom.ts';
import { suggestFor, testInfo } from '../../domains/outcomes/rom.ts';
import { state, go, profile, type Profile } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { nav } from '../components/nav.ts';
import { mountFigs, figSvg } from '../components/figures.ts';
import { sheet, confirmSheet } from '../components/sheet.ts';
import { copyText, shareText, saveFile } from '../components/files.ts';
import { ds } from '../components/design.ts';
import { weekOrder } from '../components/week.ts';
import { layName, startTrial } from './onboarding.ts';
import { rxSectionProm, clinicPanelProm } from './proms.ts';
import { rxSectionProtocol } from './protocol.ts';
import { isNil } from '../util.ts';

interface Named {
  readonly id: string;
  readonly name: unknown;
}
const REGIONS = REGION_DATA as unknown as readonly Named[];
const EXERCISES = EXERCISE_DATA as unknown as Record<string, { name: unknown; track?: boolean } | undefined>;
const EQUIP = EQUIP_DATA as unknown as Record<string, unknown>;
const EQUIPS = EQUIP_IDS as unknown as readonly string[];

type ReportModule = typeof Report;
// report.js (rapports PDF) : chargé à la demande, l'interface reste utilisable s'il manque
let reportMod: ReportModule | null | undefined;
const loadReport = async (): Promise<ReportModule | null> =>
  reportMod !== undefined ? reportMod : (reportMod = await import('../../../www/js/report.js').catch(() => null));

const $app = (): HTMLElement => document.getElementById('app') as HTMLElement;
const fmtDate = (ts: number): string => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const tk = (k: string, fb: unknown): string => {
  const v = t(k);
  return v === k ? tr(fb) : v;
};
const RX_PARTIAL = { fr: 'Compter les répétitions partielles', en: 'Count partial reps' };
const RX_PARTIAL_D = {
  fr: "Désactive pour exiger l'amplitude complète (≥ 60 %) pour cet exercice.",
  en: 'Turn off to require near-full range (≥ 60%) for this exercise.',
};
const dsv = (el: HTMLElement, k: string): string => el.dataset[k] ?? '';

/** Zone de saisie lue par un champ de formulaire. */
const valueOf = (e: Event): string => (e.target as HTMLInputElement).value;

// ---------- Partage de l'accès IA (désactivé par défaut) ----------
// rx.ai = { mode: 'proxy' | 'key', proxy?, token?, key?, until?, cap } — enregistré dans le programme (code Firestore), jamais dans l'URL si on a un compte.
// Les derniers réglages sont mémorisés sur l'appareil du clinicien (settings().clinAI) pour ne pas les ressaisir.
function rxSectionAI(f: RxForm): { html: string; read: (root: ParentNode) => void } {
  const a = f.ai;
  const html = `<h2>${t('aiShTitle')}</h2><div class="list"><div class="toggle"><span><b>${t('aiShTitle')}</b><br><small class="muted">${t('aiShD')}</small></span><button class="switch ${a ? 'on' : ''}" id="ai-on" role="switch" aria-checked="${!!a}"></button></div></div>
    ${
      a
        ? `<div id="ai-box" style="margin-top:10px"><div class="seg">${['proxy', 'key'].map((m) => `<button data-aim="${m}" class="${a.mode === m ? 'on' : ''}">${t(m === 'proxy' ? 'aiShProxy' : 'aiShKey')}</button>`).join('')}</div>
      ${
        a.mode === 'proxy'
          ? `<label class="field" style="margin-top:10px"><span>${t('aiShProxyUrl')}</span><input class="input" id="ai-url" type="url" value="${esc(a.proxy || '')}" placeholder="https://…pages.dev/api/coach" autocomplete="off"></label>
        <label class="field"><span>${t('aiShToken')}</span><input class="input" id="ai-token" type="text" value="${esc(a.token || '')}" autocomplete="off" autocapitalize="off"></label>
        <p class="note">${t('aiShProxyD')}</p>`
          : `<label class="field" style="margin-top:10px"><span>${t('aiShKeyLbl')}</span><input class="input" id="ai-key" type="password" value="${esc(a.key || '')}" placeholder="AIza…" autocomplete="off"></label>
        <div class="banner neg">${icon('shield', 20)}<div>${t('aiShKeyWarn')}</div></div>`
      }
      <label class="field" style="margin-top:10px"><span>${t('aiShUntil')}</span><input class="input" type="date" id="ai-until" value="${esc(a.until || '')}"></label>
      <label class="field"><span>${t('aiShCap')}</span><input class="input tnum" type="number" min="1" max="1000" id="ai-cap" value="${a.cap || 40}"></label></div>`
        : ''
    }`;
  const read = (root: ParentNode): void => {
    const ai = f.ai;
    if (!ai) return;
    const g = (id: string): HTMLInputElement | null => root.querySelector<HTMLInputElement>(id);
    const url = g('#ai-url');
    const token = g('#ai-token');
    const key = g('#ai-key');
    const until = g('#ai-until');
    const cap = g('#ai-cap');
    if (url) ai.proxy = url.value.trim();
    if (token) ai.token = token.value.trim();
    if (key) ai.key = key.value.trim();
    if (until) ai.until = until.value;
    if (cap) ai.cap = Math.max(1, Math.min(1000, Math.round(+cap.value) || 40));
  };
  return { html, read };
}

/** Progression d'un patient suivi (résumé partagé avec le clinicien). */
interface PatientExRow {
  level: number;
  lastDifficulty?: number | null;
  lastPain?: number | null;
  trend?: string;
}
interface Patient extends WatchedPatient {
  uid?: string;
  name?: string;
  updated: number;
  week: number;
  phase: number;
  quality7?: number | null;
  protocol?: { week: number; phase: number; phases: number; preop?: boolean; blocked?: boolean };
  prom?: unknown[];
  rom?: unknown[];
  notes?: { date: number; ex: string; pain?: number | null; text: string }[];
  ex?: Record<string, PatientExRow>;
}
interface RxListItem extends StoredRx {
  patients?: Patient[];
  updated: number;
}
/** Programme tel que lu par les fonctions du magasin (rx stocké, avec ses champs libres). */
const rxArg = (rx: StoredRx): Parameters<typeof store.deleteRx>[0] =>
  rx as unknown as Parameters<typeof store.deleteRx>[0];
const ptKey = (p: Patient): string => String(p.uid || p.updated);

export async function viewClinic(): Promise<void> {
  const prof = profile() as Profile;
  $app().innerHTML = `<section class="screen clin"><div class="topbar"><h1>${t('patients')}</h1><button class="btn sm" data-go="#/clinic/new">${icon('plus', 16)} ${t('newRx')}</button></div>
    ${store.isCloud() ? '' : `<div class="banner" style="margin-bottom:12px">${icon('shield', 20)}<div>${t('clinLocal')}</div></div>`}
    ${featureNavHtml('clinic', prof['role'] as string | undefined)}
    <div id="rxlist"><div class="card muted">${t('loading')}</div></div></section>${nav('clinic', prof['role'] as string | undefined)}`;
  let list: RxListItem[] = [];
  try {
    list = (await store.listMyRx()) as RxListItem[];
  } catch (e) {
    console.warn(e);
  }
  const box = $app().querySelector<HTMLElement>('#rxlist');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = `<div class="card empty"><div class="empty-ic">${icon('stetho', 26)}</div><h3>${t('noRxYet')}</h3><p class="small" style="margin:4px 0 0">${t('noRxYetD')}</p><button class="btn" data-go="#/clinic/new">${icon('plus', 18)} ${t('newRx')}</button></div>`;
    return;
  }
  // Bandeau de synthèse : programmes, patients suivis, patients à surveiller (poussée, douleur au-dessus du seuil, assiduité < 50 %)
  const allPts = list.flatMap((rx) => rx.patients || []);
  const watch = watchCount(list);
  const strip = `<div class="statstrip"><div><b>${list.length}</b><span>${ds('dsRx')}</span></div><div><b>${allPts.length}</b><span>${ds('dsFollow')}</span></div><div class="${watch ? 'watch' : ''}"><b>${watch}</b><span>${ds('dsWatch')}</span></div></div>`;
  const card = (rx: RxListItem): string => {
    const pts = rx.patients || [];
    const painMax = pathologyOf(rx.pathology)?.painMax ?? 4;
    const cols = `<div class="pt-cols"><span>${t('patient')}</span><span>${t('sessions7')}</span><span>${t('avgPain')}</span><span>${t('quality')}</span></div>`;
    return `<article class="card rx-card"><header class="rx-head"><div class="grow"><h3>${esc(tr(pathologyOf(rx.pathology)?.name))}</h3>
        <div class="rx-meta">${rx.code ? `<b class="tnum">${store.fmtCode(rx.code)}</b> · ` : ''}${t('phase')} ${rx.phase}${rx.auto ? '' : ' · ' + t('locked')} · ${tp('nEx', (rx.ids || []).length)}${rx.lang && rx.lang !== 'fr' ? ' · ' + esc(langInfo(rx.lang)?.name) : ''}${rx.label ? '<br>' + esc(rx.label) : ''}</div></div>
        <span class="rx-date">${fmtDate(rx.updated)}</span></header>
      ${
        pts.length
          ? `<div class="pt-table">${cols}${pts
              .map((p) => {
                const adh = p.planned ? Math.round((p.sessions7 / p.planned) * 100) : 0;
                return `<div class="pt" data-pt="${esc(p.uid || p.updated)}"><div class="pt-row"><div class="who"><b>${esc(p.name || t('patient'))}${p.flare ? ` <span class="chip sm neg">${t('flareShort')}</span>` : ''}</b><small>${t('week')} ${p.week} · ${t('phase')} ${p.phase} · ${t('updated')} ${fmtDate(p.updated)}</small></div>
            <span class="v ${adh >= 80 ? 'pos' : adh < 50 ? 'neg' : ''}">${p.sessions7}/${p.planned}</span><span class="v ${!isNil(p.pain7) && p.pain7 > painMax ? 'neg' : ''}">${p.pain7 ?? '–'}</span><span class="v">${!isNil(p.quality7) ? p.quality7 + '%' : '–'}</span></div>
          <div class="pt-x">${p.protocol ? `<div class="toggle"><span class="small"><b>${esc(t('ig_protoWeek', { n: p.protocol.week, a: p.protocol.phase, b: p.protocol.phases }))}</b>${p.protocol.preop ? '' : p.protocol.blocked ? ` · <span class="neg">${t('pr_blocked')}</span>` : ''}</span></div>` : ''}
          ${exProgress(p, rx)}
          ${p.prom?.length || p.rom?.length ? `<details class="clin-more"><summary class="small">${t('ig_clinMore')}</summary>${clinicPanelProm(p as Parameters<typeof clinicPanelProm>[0])}${p.rom?.length ? `<h2>${t('rom_secTitle')}</h2>${clinicPanelRom(p as Parameters<typeof clinicPanelRom>[0])}` : ''}</details>` : ''}
          <div class="row wrap" style="gap:8px;margin:6px 0"><button class="btn sm ghost" data-csv="${esc(ptKey(p))}">${icon('doc', 14)} ${t('csvExport')}</button><span data-pdf="${esc(ptKey(p))}"></span></div>
          ${
            p.notes?.length
              ? `<div class="pt-notes"><b class="small">${t('patientComments')}</b>${p.notes
                  .slice(0, 3)
                  .map(
                    (n) =>
                      `<div class="small"><span class="muted">${fmtDate(n.date)} · ${esc(tr(EXERCISES[n.ex]?.name))}${!isNil(n.pain) ? ' · ' + n.pain + '/10' : ''}</span><br>« ${esc(n.text)} »</div>`,
                  )
                  .join('')}</div>`
              : ''
          }</div></div>`;
              })
              .join('')}</div>`
          : rx.code
            ? `<p class="rx-wait">${t('waitingPatient')}</p>`
            : ''
      }
      <div class="rx-actions"><button class="btn sm ghost grow" data-share="${rxRef(rx)}">${icon('share', 16)} ${t('sendCode')}</button><button class="btn sm ghost grow" data-test="${rxRef(rx)}">${icon('play', 14)} ${t('testRx')}</button><button class="btn sm grow" data-go="#/clinic/rx/${rxRef(rx)}">${t('adjust')}</button></div>
      <div class="rx-actions rx-manage"><button class="btn sm ghost grow" data-dup="${rxRef(rx)}">${t('rxDup')}</button><button class="btn sm ghost grow" data-arc="${rxRef(rx)}">${t(rx.archived ? 'rxUnarchive' : 'rxArchive')}</button><button class="btn sm ghost danger grow" data-rmrx="${rxRef(rx)}">${t('delete')}</button></div></article>`;
  };
  const act = list.filter((x) => !x.archived);
  const arch = list.filter((x) => x.archived);
  box.innerHTML =
    strip +
    act.map(card).join('') +
    (arch.length
      ? `<details class="rx-archived" style="margin-top:14px"><summary class="small">${t('rxShowArchived')} (${arch.length})</summary>${arch.map(card).join('')}</details>`
      : '');
  // Bouton PDF du rapport (report.js) sur chaque fiche patient
  void loadReport().then((R) => {
    if (!R?.clinicPdfButton) return;
    list.forEach((rx) =>
      (rx.patients || []).forEach((p) => {
        const slot = box.querySelector<HTMLElement>(`[data-pdf="${CSS.escape(ptKey(p))}"]`);
        if (!slot) return;
        slot.innerHTML = R.clinicPdfButton(p);
        const protocol = rx['protocol'] as { surgeryDate?: string } | null | undefined;
        R.bindClinicPdf?.(slot, p as unknown as Parameters<NonNullable<typeof R.bindClinicPdf>>[1], {
          pathology: rx.pathology,
          surgeryDate: protocol?.surgeryDate,
        });
      }),
    );
  });
  const find = (ref: string): RxListItem => list.find((x) => rxRef(x) === ref) as RxListItem;
  const each = (sel: string, fn: (b: HTMLElement) => void | Promise<void>): void =>
    box.querySelectorAll<HTMLElement>(sel).forEach((b) => {
      b.onclick = () => fn(b);
    });
  each('[data-share]', (b) => {
    const rx = find(dsv(b, 'share'));
    void shareSheet(rx.code ?? null, linkOf(rx), null, { keyInLink: !rx.code && rx.ai?.mode === 'key' });
  });
  each('[data-test]', (b) => {
    void startTrial(find(dsv(b, 'test')) as unknown as Parameters<typeof startTrial>[0]);
  });
  // Dupliquer / archiver / supprimer un programme
  each('[data-dup]', async (b) => {
    try {
      await store.duplicateRx(rxArg(find(dsv(b, 'dup'))), ' ·2');
      toast(t('rxDupDone'));
      void viewClinic();
    } catch (e) {
      console.warn(e);
      toast(t('rxSaveErr'), 4000);
    }
  });
  each('[data-arc]', async (b) => {
    const rx = find(dsv(b, 'arc'));
    try {
      await store.setRxArchived(rxArg(rx), !rx.archived);
      toast(t('saved'));
      void viewClinic();
    } catch (e) {
      console.warn(e);
      toast(t('rxSaveErr'), 4000);
    }
  });
  each('[data-rmrx]', async (b) => {
    const rx = find(dsv(b, 'rmrx'));
    if (!(await confirmSheet({ title: t('rxDelAsk'), text: t('rxDelAskD'), ok: t('delete'), danger: true }))) return;
    try {
      await store.deleteRx(rxArg(rx));
      toast(t('rxDeleted'));
      void viewClinic();
    } catch (e) {
      console.warn(e);
      toast(t('rxSaveErr'), 4000);
    }
  });
  // Export CSV du résumé d'un patient
  each('[data-csv]', async (b) => {
    const p = list.flatMap((rx) => rx.patients || []).find((x) => ptKey(x) === dsv(b, 'csv'));
    if (!p) return;
    const csv = patientCsv(p as unknown as Parameters<typeof patientCsv>[0], {
      nameOf: (id: string) => tr(EXERCISES[id]?.name) || id,
    });
    const nm = patientFileBase(p.name);
    try {
      await saveFile(csv, `mobilis-${nm}-${P.todayKey()}.csv`, 'text/csv', { title: 'Mobilis CSV' });
      toast(t('fileReady'));
    } catch (e) {
      console.warn(e);
      toast(t('fileErr'), 4000);
    }
  });
}

// Progression par exercice (niveau, dernière difficulté et douleur, tendance), compacte et repliée
function exProgress(p: Patient, rx: RxListItem): string {
  const ex = p.ex || {};
  const ids = (rx.ids || Object.keys(ex)).filter((id) => ex[id] && EXERCISES[id]);
  if (!ids.length) return '';
  const arrow: Record<string, string> = { up: '↑', down: '↓', steady: '→' };
  return `<details class="ex-prog"><summary class="small">${t('exProgress')}</summary>${ids
    .map((id) => {
      const e = ex[id] as PatientExRow;
      return `<div class="small"><span class="nm">${esc(tr(EXERCISES[id]?.name))}</span><span class="tnum muted">${t('level')} ${e.level} · ${t('diffShort')} ${e.lastDifficulty ?? '–'}/5 · ${e.lastPain ?? '–'}/10</span><b class="${e.trend === 'up' ? 'pos' : e.trend === 'down' ? 'neg' : 'muted'}" title="${t('trend_' + e.trend)}">${arrow[e.trend ?? ''] || '→'}</b></div>`;
    })
    .join('')}</details>`;
}

// Clinicien : tester l'app comme un patient
export async function viewTestStart(): Promise<void> {
  const prof = profile() as Profile;
  $app().innerHTML = `<section class="screen"><div class="topbar"><h1>${t('testTitle')}</h1></div>
    <p class="muted">${t('testD')}</p>
    <h2>${t('testPickRx')}</h2><p class="small muted" style="margin-top:-6px">${t('testPickRxD')}</p><div id="rxt"><div class="card muted">${t('loading')}</div></div>
    <button class="test-opt" data-a="ob"><span class="ic">${icon('search', 20)}</span><span class="grow"><b>${t('testOnboard')}</b><small>${t('testOnboardD')}</small></span></button>
    <button class="test-opt" data-go="#/library"><span class="ic">${icon('cam', 20)}</span><span class="grow"><b>${t('testLibrary')}</b><small>${t('testLibraryD')}</small></span></button>
  </section>${nav('home', prof['role'] as string | undefined)}`;
  const ob = $app().querySelector<HTMLElement>('[data-a="ob"]');
  if (ob)
    ob.onclick = () => {
      state.ob = null;
      state.obTest = true;
      go('#/onboard');
    };
  let list: RxListItem[] = [];
  try {
    list = (await store.listMyRx()) as RxListItem[];
  } catch (e) {
    console.warn(e);
  }
  const box = $app().querySelector<HTMLElement>('#rxt');
  if (!box) return;
  box.innerHTML = list.length
    ? `<div class="list">${list
        .slice(0, 8)
        .map(
          (rx, i) =>
            `<button class="ex-item" data-i="${i}"><span class="ex-thumb">${figSvg(rx.ids?.[0] ?? '', { stat: true })}</span><span class="meta"><b>${esc(layName(rx.pathology ?? ''))}</b><small>${rx.code ? store.fmtCode(rx.code) + ' · ' : ''}${t('phase')} ${rx.phase} · ${(rx.ids || []).length} ${t('exercises').toLowerCase()}${rx.label ? ' · ' + esc(rx.label) : ''}</small></span>${icon('play', 16)}</button>`,
        )
        .join('')}</div>`
    : `<div class="card small muted">${t('noRxToTest')}</div>`;
  mountFigs(box);
  box.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => {
    b.onclick = () => {
      void startTrial(list[+dsv(b, 'i')] as unknown as Parameters<typeof startTrial>[0]);
    };
  });
}

/** Section ajoutée à l'éditeur (protocole, questionnaires, amplitude, rapport). */
interface SectionLike {
  html: string;
  bind?(root: ParentNode): void;
  read(root: ParentNode): Record<string, unknown>;
}
interface Sections {
  protocol: SectionLike;
  prom: SectionLike;
  rom: SectionLike;
  report: SectionLike | null;
}

export async function viewRxEditor(code?: string | null): Promise<void> {
  const prof = profile() as Profile;
  let rx: StoredRx | null = null;
  const cur = state.clinic as RxForm | null;
  if (code && !(cur && cur.code === code)) {
    $app().innerHTML = `<section class="screen"><div class="card muted">${t('loading')}</div></section>`;
    try {
      rx = (code.startsWith('L') ? store.getLocalRx(code) : await store.getRx(code)) as StoredRx | null;
    } catch {
      rx = null;
    }
    if (!rx) {
      toast(t('rxNotFound'));
      go('#/clinic');
      return;
    }
  }
  const prevForm = state.clinic as RxForm | null;
  let f: RxForm;
  if (prevForm && prevForm.code === (code || null)) f = prevForm;
  else {
    f = newRxForm(code, rx, prof as { clinicianName?: string; name?: string });
    state.clinic = f;
  }
  const form = f;
  const path = pathologyOf(form.pathology);
  // Exercices déposés par un autre écran (plan de traitement) sans pathologie : la liste reste visible et modifiable.
  // Parcours habituel inchangé : choisir une région efface les exercices, donc sans pathologie la liste est vide.
  const showEx = !!path || form.ids.length > 0;
  const regionEx = regionExercises(form.region);
  const others = regionEx.filter((id) => !form.ids.includes(id));
  // Sections ajoutées (protocole, questionnaires, amplitude, rapport) : lues dans le DOM avant chaque nouveau dessin
  const R = await loadReport();
  const asRx = form as unknown as Parameters<typeof rxSectionProm>[0];
  const secs: Sections | null = path
    ? {
        protocol: rxSectionProtocol(
          form as unknown as Parameters<typeof rxSectionProtocol>[0],
        ) as unknown as SectionLike,
        prom: rxSectionProm(asRx) as unknown as SectionLike,
        rom: rxSectionRom(form) as unknown as SectionLike,
        report: R?.rxSectionReport
          ? (R.rxSectionReport(form as unknown as Parameters<NonNullable<typeof R.rxSectionReport>>[0]) as SectionLike)
          : null,
      }
    : null;
  const aiSec = rxSectionAI(form);
  const collect = (): void => {
    const root = $app();
    if (path) aiSec.read(root);
    if (!secs || !root.querySelector('#pr-root')) return;
    const id = root.querySelector<HTMLInputElement>('#pr-id')?.value;
    if (!id) form.protocol = null;
    else {
      const r = secs.protocol.read(root);
      form.protocol = r['protocol'] || {
        id,
        variant: root.querySelector<HTMLInputElement>('#pr-variant')?.value || undefined,
        surgeryDate: root.querySelector<HTMLInputElement>('#pr-date')?.value || '',
        pastOk: root.querySelector<HTMLInputElement>('#pr-past')?.checked !== false,
      };
    }
    Object.assign(form, secs.prom.read(root), secs.rom.read(root));
    if (secs.report) {
      try {
        Object.assign(form, secs.report.read(root));
      } catch (e) {
        console.warn(e);
      }
    }
  };
  const draw = (): void => {
    collect();
    void viewRxEditor(code);
  };
  // Matériel manquant → remplacement maison ou exercice équivalent proposé au clinicien
  const missEq = (id: string): string => {
    const m: string[] = missing(id, form.equip);
    if (!m.length) return '';
    const alts: string[] = alternatives(id, form.equip, { exclude: form.ids as never[] });
    return `<small class="neg" style="display:block">${t('missingEq')} ${m.map((e) => esc(tr(EQUIP[e]))).join(', ')}${alts.length ? ` · ${alts.map((a) => `<button class="link" data-rep="${id}" data-to="${a}">↔ ${esc(tr(EXERCISES[a]?.name))}</button>`).join(' ')}` : ` · ${t('sub_' + m[0])}`}</small>`;
  };
  const lvOf = (id: string): number => levelIn(form, id);
  // Dose affichée : celle du niveau, remplacée par la dose fixée par le clinicien s'il y en a une
  const shown = (id: string): ReturnType<typeof shownDose> => shownDose(id, lvOf(id), form.dose[id]);
  const exEdit = (id: string): string => {
    const d = shown(id);
    const hold = d.type === 'hold';
    const st = (k: string, label: string, v: number, unit?: string): string =>
      `<div class="toggle"><span>${label}</span><div class="stepper"><button data-dk="${k}" data-id="${id}" data-dir="-1" aria-label="−">−</button><b class="tnum">${v}${unit || ''}</b><button data-dk="${k}" data-id="${id}" data-dir="1" aria-label="+">+</button></div></div>`;
    return `<div class="sess-edit">
      ${st('sets', t('setsLbl'), d.sets)}
      ${hold ? st('hold', t('holdLbl'), d.hold, ' ' + t('sec')) : st('reps', t('repsLbl'), d.reps)}
      ${st('rest', t('restLbl'), d.rest, ' ' + t('sec'))}
      <div class="toggle"><span>${t('rxAutoEx')}<br><small class="muted">${t('rxAutoExD')}</small></span><button class="switch ${form.autoEx[id] === false ? '' : 'on'}" data-aex="${id}" role="switch" aria-checked="${form.autoEx[id] !== false}"></button></div>
      <div class="toggle"><span>${tk('rxPartial', RX_PARTIAL)}<br><small class="muted">${tk('rxPartialD', RX_PARTIAL_D)}</small></span><button class="switch ${form.partial[id] === false ? '' : 'on'}" data-pex="${id}" role="switch" aria-checked="${form.partial[id] !== false}"></button></div>
      <div class="toggle"><span>${t('rxMaxLevel')}<br><small class="muted">${t('rxMaxLevelD')}</small></span><div class="stepper"><button data-mx="${id}" data-dir="-1" aria-label="−">−</button><b class="tnum">${form.maxLevel[id] || 5}</b><button data-mx="${id}" data-dir="1" aria-label="+">+</button></div></div>
      ${form.dose[id] ? `<div class="row" style="padding:10px 12px 12px"><button class="btn sm ghost grow" data-dreset="${id}">${t('rxDoseReset')}</button></div>` : ''}
    </div>`;
  };
  const scroll = (fn: () => void): void => {
    const y = window.scrollY;
    fn();
    draw();
    window.scrollTo(0, y);
  };
  const secHtml = secs
    ? `${secs.protocol.html}${secs.prom.html}${secs.rom.html}${secs.report ? secs.report.html : ''}${aiSec.html}`
    : '';

  $app().innerHTML = `<section class="screen clin"><div class="topbar"><button class="icon-btn" data-go="#/clinic" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${code ? t('adjustRx') : t('newRx')}</h1></div>
    <label class="field"><span>${t('yourName')}</span><input class="input" id="cn" value="${esc(form.clinician)}" placeholder="${t('clinNamePh')}"></label>
    <label class="field"><span>${t('rxLabel')}</span><input class="input" id="lb" value="${esc(form.label)}" placeholder="${t('rxLabelPh')}"></label>
    <h2>${t('region')}</h2><div class="pills">${REGIONS.map((r) => `<button class="pill ${form.region === r.id ? 'on' : ''}" data-r="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>
    <h2>${t('condition')}</h2>${PATHOLOGY_LIST.filter((p) => p.region === form.region)
      .map(
        (p) =>
          `<button class="choice ${form.pathology === p.id ? 'on' : ''}" data-p="${p.id}"><span class="radio"></span><span><b>${esc(tr(p.name))}</b><small>${t('patientSees')} : ${esc(layName(p.id))}</small></span></button>`,
      )
      .join('')}
    ${
      showEx
        ? `
    ${path ? `<h2>${t('phase')}</h2><div class="seg">${[1, 2, 3].map((n) => `<button data-ph="${n}" class="${form.phase === n ? 'on' : ''}">${n} · ${t('phaseName' + n)}</button>`).join('')}</div>` : ''}
    <h2>${t('exercises')} (${form.ids.length})</h2>
    <div class="list">${
      form.ids
        .map(
          (id, i) =>
            `<div class="ex-block"><div class="ex-item"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id]?.name))}</b>${missEq(id)}<small>${EXERCISES[id]?.track ? t('tracked') : t('guidedShort')}</small></span>
      <span class="mv"><button data-mv="${id}" data-dir="-1" aria-label="${t('moveUp')}" ${i === 0 ? 'disabled' : ''}>↑</button><button data-mv="${id}" data-dir="1" aria-label="${t('moveDown')}" ${i === form.ids.length - 1 ? 'disabled' : ''}>↓</button></span>
      <span class="stepper"><small>${t('level')}</small><button data-lv="${id}" data-d="-1" aria-label="-">−</button><b class="tnum">${lvOf(id)}</b><button data-lv="${id}" data-d="1" aria-label="+">+</button></span>
      <button class="icon-btn" data-rm="${id}" aria-label="${t('remove')}">${icon('close', 16)}</button></div>
      <div class="ex-dose"><button class="link" data-dopen="${id}" aria-expanded="${form.open === id}">${doseText(shown(id))} · ${t('restShort')} ${shown(id).rest}${t('sec')}${form.dose[id] ? ' · ' + t('rxDoseSet') : ''}${form.autoEx[id] === false ? ' · ' + t('rxAutoOff') : ''} ▾</button></div>${form.open === id ? exEdit(id) : ''}</div>`,
        )
        .join('') || `<div class="toggle muted">${t('noExSelected')}</div>`
    }</div>
    ${others.length ? `<details class="add-ex" style="margin-top:6px"><summary>${t('addExercise')} (${others.length})</summary><div class="list" style="margin-top:8px">${others.map((id) => `<button class="ex-item" data-add="${id}"><span class="ex-thumb">${figSvg(id, { stat: true })}</span><span class="meta"><b>${esc(tr(EXERCISES[id]?.name))}</b></span>${icon('plus', 18)}</button>`).join('')}</div></details>` : ''}
    <h2>${t('patientEquip')}</h2><p class="small muted" style="margin:-4px 0 8px">${t('patientEquipD')}</p>
    <div class="pills">${EQUIPS.map((e) => `<button class="pill ${!form.equip || form.equip.includes(e) ? 'on' : ''}" data-peq="${e}">${esc(tr(EQUIP[e]))}</button>`).join('')}</div>
    <h2>${t('patientSide')}</h2><div class="seg">${['L', 'R', 'both'].map((v) => `<button data-pside="${v}" class="${(form.side || 'both') === v ? 'on' : ''}">${t(v === 'L' ? 'sideLeft' : v === 'R' ? 'sideRight' : 'sideBoth')}</button>`).join('')}</div>
    <h2>${t('trainDays')}</h2><div class="seg">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-pw="${n}" class="${form.days.length === n ? 'on' : ''}">${n}×</button>`).join('')}</div>
    <div class="field" style="margin-top:10px"><span>${t('rxCustomDays')}</span><div class="days" role="group" aria-label="${t('rxCustomDays')}">${(weekOrder() as number[]).map((d) => `<button data-wd="${d}" class="${form.days.includes(d) ? 'on' : ''}" aria-pressed="${form.days.includes(d)}">${(dowNarrow() as string[])[d]}</button>`).join('')}</div></div>
    <div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('autoProg')}</b><br><small class="muted">${t('autoProgD')}</small></span><button class="switch ${form.auto ? 'on' : ''}" id="auto" role="switch" aria-checked="${form.auto}"></button></div></div>
    <label class="field" style="margin-top:14px"><span>${t('notesForPatient')}</span><textarea class="input" id="nt" placeholder="${t('notesPh')}">${esc(form.notes)}</textarea></label>
    <label class="field"><span>${t('nextVisit')}</span><input class="input" type="date" id="nv" value="${esc(form.nextVisit)}"></label>
    <label class="field"><span>${t('patientLang')}</span><select class="input" id="pl">${LANGS.map((l) => `<option value="${l.id}" ${form.lang === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select><small class="muted">${t('patientLangD')}</small></label>
    ${secHtml}`
        : ''
    }
    <div style="height:96px"></div>
    <div class="sticky-cta"><div class="row"><button class="btn ghost" id="try" style="flex:0 0 auto;width:auto;padding-inline:16px" ${showEx && form.ids.length ? '' : 'disabled'}>${icon('play', 14)} ${t('testRx')}</button><button class="btn grow" id="save" ${showEx && form.ids.length ? '' : 'disabled'}>${code ? t('saveChanges') : t('createSend')}</button></div></div></section>
    <div class="desk-only">${nav('clinic', prof['role'] as string | undefined)}</div>`;
  mountFigs($app());
  if (secs) {
    for (const x of Object.values(secs) as (SectionLike | null)[]) {
      try {
        x?.bind?.($app());
      } catch (e) {
        console.warn(e);
      }
    }
  }
  if (path) romByRegion($app(), form);
  const q = <E extends HTMLElement = HTMLElement>(s: string): E => $app().querySelector<E>(s) as E;
  const qa = (s: string, fn: (b: HTMLElement) => void): void =>
    $app()
      .querySelectorAll<HTMLElement>(s)
      .forEach((b) => {
        b.onclick = () => fn(b);
      });
  q<HTMLInputElement>('#cn').oninput = (e) => {
    form.clinician = valueOf(e);
  };
  q<HTMLInputElement>('#lb').oninput = (e) => {
    form.label = valueOf(e);
  };
  qa('[data-r]', (b) => {
    void (async () => {
      if (dsv(b, 'r') === form.region) return;
      if (form.ids.length && !(await confirmSheet({ title: t('region'), text: t('rxRegionWarn'), ok: t('ok') })))
        return; // la liste d'exercices serait effacée
      form.region = dsv(b, 'r');
      form.pathology = null;
      form.ids = [];
      draw();
    })();
  });
  qa('[data-p]', (b) =>
    scroll(() => {
      form.pathology = dsv(b, 'p');
      form.ids = [...(pathologyOf(form.pathology)?.phases[form.phase] ?? [])];
    }),
  );
  qa('[data-ph]', (b) =>
    scroll(() => {
      form.phase = +dsv(b, 'ph');
      form.ids = [...(path?.phases[form.phase] ?? [])];
    }),
  );
  qa('[data-lv]', (b) => scroll(() => setLevel(form, dsv(b, 'lv'), +dsv(b, 'd'))));
  qa('[data-mv]', (b) => scroll(() => moveId(form.ids, dsv(b, 'mv'), +dsv(b, 'dir'))));
  qa('[data-dopen]', (b) =>
    scroll(() => {
      form.open = form.open === dsv(b, 'dopen') ? null : dsv(b, 'dopen');
    }),
  );
  qa('[data-dk]', (b) =>
    scroll(() => {
      const id = dsv(b, 'id');
      form.dose[id] = steppedDose(shown(id), dsv(b, 'dk') as DoseKey, +dsv(b, 'dir'));
    }),
  );
  qa('[data-dreset]', (b) =>
    scroll(() => {
      Reflect.deleteProperty(form.dose, dsv(b, 'dreset'));
    }),
  );
  qa('[data-aex]', (b) => scroll(() => toggleDefaultOn(form.autoEx, dsv(b, 'aex'))));
  qa('[data-pex]', (b) => scroll(() => toggleDefaultOn(form.partial, dsv(b, 'pex'))));
  qa('[data-mx]', (b) => scroll(() => stepMaxLevel(form, dsv(b, 'mx'), +dsv(b, 'dir'))));
  qa('[data-rm]', (b) =>
    scroll(() => {
      form.ids = form.ids.filter((x) => x !== dsv(b, 'rm'));
    }),
  );
  qa('[data-add]', (b) =>
    scroll(() => {
      form.ids = [...form.ids, dsv(b, 'add')];
    }),
  );
  qa('[data-peq]', (b) =>
    scroll(() => {
      form.equip = toggleEquip(form.equip, dsv(b, 'peq'));
    }),
  );
  qa('[data-pside]', (b) =>
    scroll(() => {
      form.side = dsv(b, 'pside');
    }),
  );
  $app()
    .querySelectorAll<HTMLElement>('[data-rep]')
    .forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        scroll(() => replaceExercise(form, dsv(b, 'rep'), dsv(b, 'to')));
      };
    });
  qa('[data-pw]', (b) =>
    scroll(() => {
      form.days = DAYS_BY_FREQ[+dsv(b, 'pw')] ?? form.days;
    }),
  );
  qa('[data-wd]', (b) => {
    const d = +dsv(b, 'wd');
    if (!canToggleDay(form.days, d)) {
      toast(t('calLastDay'));
      return;
    }
    scroll(() => {
      form.days = toggleDay(form.days, d);
    });
  });
  const aiOn = q('#ai-on');
  if (aiOn)
    aiOn.onclick = () =>
      scroll(() => {
        form.ai = form.ai
          ? null
          : {
              ...((store.settings().clinAI as RxAi | undefined) || {
                mode: 'proxy',
                proxy: '',
                token: '',
                key: '',
                until: '',
                cap: 40,
              }),
            };
      });
  qa('[data-aim]', (b) =>
    scroll(() => {
      if (form.ai) form.ai.mode = dsv(b, 'aim');
    }),
  );
  const au = q('#auto');
  if (au)
    au.onclick = () =>
      scroll(() => {
        form.auto = !form.auto;
      });
  const nt = q('#nt');
  if (nt)
    nt.oninput = (e) => {
      form.notes = valueOf(e);
    };
  const nv = q('#nv');
  if (nv)
    nv.onchange = (e) => {
      form.nextVisit = valueOf(e);
    };
  const pl = q('#pl');
  if (pl)
    pl.onchange = (e) => {
      form.lang = valueOf(e);
    };
  q('#try').onclick = () => {
    void startTrial(trialRx(form) as unknown as Parameters<typeof startTrial>[0]);
  };
  q('#save').onclick = async () => {
    if (secs) {
      const pr = secs.protocol.read($app());
      if (pr['error']) {
        toast(t('ig_protoDate'), 4000);
        return;
      }
      collect();
    }
    q<HTMLButtonElement>('#save').disabled = true;
    const data = rxPayload(form);
    if (form.ai) {
      const ai = cleanSharedAi(form.ai);
      if (!ai) {
        q<HTMLButtonElement>('#save').disabled = false;
        toast(t('aiShBad'), 4500);
        return;
      }
      data.ai = ai;
      store.saveSettings({ clinAI: ai });
    }
    if (form.localId) data.localId = form.localId;
    try {
      const res = (await store.saveRx(data as unknown as Parameters<typeof store.saveRx>[0])) as {
        code?: string;
        link: string;
        keyInLink?: boolean;
      };
      if (form.clinician.trim() && form.clinician.trim() !== prof['clinicianName'])
        await store.saveProfile({ ...(profile() as Profile), clinicianName: form.clinician.trim() });
      state.clinic = null;
      // Point d'extension (volet plan de traitement) : le formulaire déposé peut porter `fromPlanId` ;
      // l'écouteur de « mobilis:rx-saved » relie alors le programme au plan (plan.rxCode). Aucun import du volet.
      const fromPlanId = (form as RxForm & { fromPlanId?: string | null }).fromPlanId;
      try {
        window.dispatchEvent(
          new CustomEvent('mobilis:rx-saved', {
            detail: {
              code: res.code ?? null,
              localId: (res as { data?: { localId?: string | null } }).data?.localId ?? form.localId ?? null,
              planId: fromPlanId ?? null,
            },
          }),
        );
      } catch (e) {
        console.warn(e);
      }
      if (code && res.code) {
        toast(t('rxSaved'));
        go('#/clinic');
        return;
      }
      await shareSheet(res.code ?? null, res.link, () => go('#/clinic'), { keyInLink: res.keyInLink ?? false });
      toast(t('rxCreated'));
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.warn(e);
      toast(t('rxSaveErr') + ' ' + (err.code || err.message), 5000);
      q<HTMLButtonElement>('#save').disabled = false;
    }
  };
}

// Amplitudes : les tests de la région du programme d'abord ; les autres sont repliés. « Suggérer » suit la région (jamais l'épaule par défaut).
function romByRegion(root: HTMLElement, f: RxForm): void {
  const sec = root.querySelector<HTMLElement>('[data-rom-sec]');
  if (!sec) return;
  const list = sec.querySelector<HTMLElement>('.list');
  if (!list) return;
  const rows = [...list.querySelectorAll<HTMLElement>('.rom-row')];
  const rowTest = (r: HTMLElement): string => r.querySelector<HTMLElement>('[data-rom-t]')?.dataset['romT'] ?? '';
  const near = (id: string): boolean =>
    testInfo(id)?.region === f.region ||
    suggestFor({ pathology: f.pathology ?? '', region: f.region }).some((x) => x.test === id);
  const keep = rows.filter((r) => near(rowTest(r)) || r.querySelector('.pill.on'));
  const rest = rows.filter((r) => !keep.includes(r));
  if (rest.length && keep.length) {
    const d = document.createElement('details');
    d.style.marginTop = '8px';
    d.innerHTML = `<summary class="small muted">${esc(t('romOther'))} (${rest.length})</summary><div class="list" style="margin-top:6px"></div>`;
    rest.forEach((r) => d.querySelector('.list')?.appendChild(r));
    list.appendChild(d);
  }
  const sug = sec.querySelector<HTMLElement>('[data-rom-sug]');
  if (sug)
    sug.onclick = () => {
      const items = suggestFor({ pathology: f.pathology ?? '', region: f.region });
      const keys = new Set(items.map((x) => `${x.test}_${x.side || '-'}`));
      sec.querySelectorAll<HTMLElement>('[data-rom-t]').forEach((b) => {
        const v = keys.has(`${b.dataset['romT']}_${b.dataset['romS'] || '-'}`);
        b.classList.toggle('on', v);
        b.setAttribute('aria-pressed', String(v));
      });
    };
}

// Feuille d'envoi : code, QR, lien
export async function shareSheet(
  code: string | null | undefined,
  link: string,
  onClose?: (() => void) | null,
  { keyInLink = false }: { keyInLink?: boolean } = {},
): Promise<void> {
  const svg = await qrSvg(link);
  const bg = sheet(
    `<h3>${t('sendToPatient')}</h3><p class="small muted" style="margin:4px 0 14px">${code ? t('sendCodeD') : t('sendLinkD')}</p>
    ${code ? `<div class="code-big">${store.fmtCode(code)}</div><p class="small muted" style="text-align:center;margin:4px 0 14px">${t('codeHowTo')}</p>` : ''}
    ${keyInLink ? `<div class="banner neg" style="margin-bottom:12px">${icon('shield', 20)}<div>${t('aiShLinkWarn')}</div></div>` : ''}
    ${svg ? `<div class="qr" aria-label="QR">${svg}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn ghost" id="cp">${icon('copy', 18)} ${t('copyLink')}</button><button class="btn" id="sh">${icon('share', 18)} ${t('share')}</button></div>
    <button class="btn soft" id="done" style="margin-top:10px">${t('done')}</button>`,
    onClose ? { onClose } : {},
  );
  const msg = shareMessage(code);
  const on = (id: string, fn: () => void): void => {
    const b = bg.querySelector<HTMLElement>(id);
    if (b) b.onclick = fn;
  };
  on('#cp', () => void copyText(link));
  on('#sh', () => void shareText('Mobilis', msg, link));
  on('#done', () => {
    bg.remove();
    if (onClose) onClose();
  });
}
