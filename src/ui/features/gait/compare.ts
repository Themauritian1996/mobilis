/**
 * Volet « marche » — comparaison A/B `#/marche-ab/<idA>/<idB>` (avant/après une modification : canne, orthèse, prothèse,
 * consigne…). Utilise `compareAssessments` du moteur sur les analyses enregistrées : deltas, marge d'erreur,
 * significatif ou non, vers la norme ou non, changements de statut des déterminants et des défauts, courbes
 * superposées. Annotation de la comparaison (document `annotations` avec les deux identifiants).
 */
import { compareAssessments, GAIT_FINDINGS, DETERMINANTS } from '../../../domains/gait/index.ts';
import type { Assessment } from '../../../core/types/clinical.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { navRole } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { readStoredResult, type StoredResult } from './model.ts';
import { dateLabel, deltaRows, determinantChanges, findingChanges, overlayCharts } from './present.ts';
import { changesSection, deltaSection, overlaySection } from './sections.ts';
import { mountAnnotations } from '../patients/annotations-ui.ts';
import { currentUid, loadAssessment } from './store.ts';
import { banner, ensureCss, errorCard, langId, loc, spinner, statusLabel, t } from './ui.ts';
import { exportJson } from './export.ts';

const label = (a: Assessment): string => {
  const c = a.conditions ?? {};
  const note = c['modification'] ?? c['instruction'];
  return `${dateLabel(a.performedAt, loc())}${note ? ` — ${note}` : ''}`;
};

function sideBySide(a: Assessment, b: Assessment): string {
  const col = (tag: string, x: Assessment): string => {
    const c = x.conditions ?? {};
    const rows = [
      [t('f_device'), c['assistiveDevice'] ? t(`dev_${c['assistiveDevice']}`) : ''],
      [t('f_footwear'), c['footwear'] ? t(`foot_${c['footwear']}`) : ''],
      [t('f_speed'), c['speed'] ? t(`spd_${c['speed']}`) : ''],
      [t('f_instruction'), c['instruction'] ?? ''],
      [t('f_modification'), c['modification'] ?? ''],
    ].filter(([, v]) => v);
    return `<div class="card"><h3>${tag} — ${esc(dateLabel(x.performedAt, loc()))}</h3><dl class="gc-kv">${rows.map(([k, v]) => `<div><dt>${esc(k ?? '')}</dt><dd>${esc(v ?? '')}</dd></div>`).join('')}</dl><a href="#/marche-res/${esc(x.id)}">${esc(t('cmp_openResult'))}</a></div>`;
  };
  return `<div class="gc-ab">${col('A', a)}${col('B', b)}</div>`;
}

export async function renderCompare(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const root = ctx.root;
  const idA = ctx.arg ?? '';
  const idB = ctx.arg2 ?? '';
  root.innerHTML = spinner(t('loading'));
  let A: Assessment | null = null;
  let B: Assessment | null = null;
  try {
    [A, B] = await Promise.all([idA ? loadAssessment(idA) : null, idB ? loadAssessment(idB) : null]);
  } catch (e) {
    console.error(e);
  }
  if (!location.hash.startsWith('#/marche-ab/')) return;
  if (!A || !B) {
    root.innerHTML = errorCard(t('cmp_title'), t('res_notFound'));
    return;
  }
  const role = navRole() === 'clinician' ? 'clinician' : 'patient';
  if (role === 'patient' && (A.patientId !== currentUid() || B.patientId !== currentUid())) {
    root.innerHTML = errorCard(t('cmp_title'), t('res_denied'), '#/home');
    return;
  }
  if (A.patientId !== B.patientId) {
    root.innerHTML = errorCard(t('cmp_title'), t('cmp_differentPatients'), `#/patient/${A.patientId}`);
    return;
  }
  const ra: StoredResult | null = readStoredResult(A);
  const rb: StoredResult | null = readStoredResult(B);
  if (!ra || !rb) {
    root.innerHTML = errorCard(t('cmp_title'), t('res_notGait'), `#/patient/${A.patientId}`);
    return;
  }
  const cmp = compareAssessments(ra.analyses, rb.analyses);
  const L = langId();
  const findName = (id: string): string => {
    const f = GAIT_FINDINGS.find((x) => x.id === id);
    return f ? (L === 'fr' ? f.name_fr : f.name_en) : id;
  };
  const detName = (id: string): string => {
    const d = DETERMINANTS.find((x) => x.id === id);
    return d ? `${d.n}. ${L === 'fr' ? d.name_fr : d.name_en}` : id;
  };
  const findStatus = (s: string): string => t(`fst_${s}`);
  const pairIds = [A.id, B.id];
  if (!location.hash.startsWith('#/marche-ab/')) return;
  const rows = deltaRows(cmp, loc());
  const nSig = rows.filter((r) => r.significant).length;
  const back = role === 'clinician' ? `#/patient/${A.patientId}` : '#/home';
  root.innerHTML = `<section class="screen gc-screen gc-compare-screen"><div class="topbar"><button class="icon-btn" data-go="${esc(back)}" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(t('cmp_title'))}</h1></div>
    ${banner()}${sideBySide(A, B)}
    <p class="card flat" role="status">${esc(t('cmp_summary', { n: nSig, total: rows.length }))}</p>
    ${deltaSection(rows)}
    ${changesSection(
      'sec_detChanges',
      determinantChanges(cmp),
      (c) => detName(c.id),
      (s) => statusLabel(s as 'affected' | 'preserved' | 'uncertain'),
    )}
    ${changesSection('sec_findChanges', findingChanges(cmp), (c) => findName(c.id), findStatus)}
    ${overlaySection(overlayCharts(ra.analyses, rb.analyses), label(A), label(B))}
    <section class="gc-sec" aria-labelledby="gc-h-annot"><h2 id="gc-h-annot">${esc(t('sec_annotations'))}</h2>
      <div data-a="annots"></div></section>
    <div class="gc-actions">${role === 'clinician' ? `<button class="btn ghost" data-go="#/plan/${esc(A.patientId)}">${icon('clip', 18)} ${esc(t('act_plan'))}</button>` : ''}<button class="btn ghost" data-a="print">${icon('doc', 18)} ${esc(t('act_pdf'))}</button><button class="btn ghost" data-a="json">${icon('share', 18)} ${esc(t('act_json'))}</button></div>
    <p class="gc-disclaimer small muted">${esc(t('cmp_disclaimer'))}</p></section>`;

  const $ = <E extends HTMLElement>(s: string): E | null => root.querySelector<E>(`[data-a="${s}"]`);
  // Annotations : composant commun du dossier patient (document `annotations` portant les deux identifiants)
  const annotHost = $('annots');
  if (annotHost) void mountAnnotations(annotHost, { patientId: A.patientId, assessmentIds: pairIds });
  const pr = $<HTMLButtonElement>('print');
  if (pr)
    pr.onclick = () => {
      const closed = [...root.querySelectorAll('details')].filter((d) => !d.open);
      closed.forEach((d) => (d.open = true));
      const restore = (): void => {
        closed.forEach((d) => (d.open = false));
        window.removeEventListener('afterprint', restore);
      };
      window.addEventListener('afterprint', restore);
      window.print();
    };
  const js = $<HTMLButtonElement>('json');
  if (js)
    js.onclick = () => void exportJson({ comparison: cmp, a: A.id, b: B?.id }, `mobilis-marche-ab-${idA}-${idB}.json`);
}
