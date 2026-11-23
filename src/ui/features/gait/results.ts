/**
 * Volet « marche » — écran de résultats `#/marche-res/<assessmentId>` : lisible par un physiatre, sans score global.
 * Qualité et confiance, spatio-temporel (vitesse en % de la norme et z), six déterminants (affecté / préservé /
 * incertain), articulations × phases de Perry, courbes ± ET sur la bande normale, défauts probables, estimations
 * frontales (en avant seulement si facteur limitant), mesures personnalisées, annotations, exports.
 */
import type { Assessment } from '../../../core/types/clinical.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { go, navRole } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { readStoredResult, type StoredResult } from './model.ts';
import {
  dateLabel,
  determinantViews,
  estimateViews,
  findingViews,
  insufficientFindings,
  jointCharts,
  jointPhaseTable,
  spatioRows,
  speedSummary,
} from './present.ts';
import {
  curvesSection,
  determinantsSection,
  estimatesSection,
  findingsSection,
  jointPhaseSection,
  qualitySection,
  spatioSection,
} from './sections.ts';
import { exportJson, exportPdf } from './export.ts';
import { currentUid, listAnnotations, listGaitAssessments, loadAssessment, saveAnnotation } from './store.ts';
import { banner, ensureCss, errorCard, langId, loc, metricLabel, spinner, t, viewLabel } from './ui.ts';
import { fromCoreView } from './model.ts';

const kv = (k: string, v: string): string => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : '');

/** En-tête : date, vues, conditions de capture (aide technique, chaussures/prothèse, vitesse, consigne, modification). */
function headerCard(a: Assessment): string {
  const c = a.conditions ?? {};
  const views = (a.views ?? []).map((v) => viewLabel(fromCoreView(v))).join(' · ');
  const foot = c['footwear'] ? t(`foot_${c['footwear']}`) : '';
  const prost = c['prosthesisLevel']
    ? `${t(`lvl_${c['prosthesisLevel']}`)} — ${c['prosthesisSide'] === 'R' ? t('side_right') : t('side_left')}`
    : '';
  return `<div class="card gc-head"><div class="row wrap" style="gap:6px"><span class="chip ink">${esc(a.kind === 'prosthetic_gait' ? t('kind_prosthetic') : t('kind_gait'))}</span><span class="chip">${esc(dateLabel(a.performedAt, loc()))}</span><span class="chip">${esc(t('engine', { v: a.engineVersion ?? '–' }))}</span></div>
    <dl class="gc-kv">${kv(t('f_views'), views)}${kv(t('f_height'), c['heightCm'] ? `${c['heightCm']} cm` : '')}${kv(t('f_affected'), c['affectedSide'] ? t(`aff_${c['affectedSide']}`) : '')}${kv(t('f_device'), c['assistiveDevice'] ? t(`dev_${c['assistiveDevice']}`) : '')}${kv(t('f_footwear'), foot)}${kv(t('f_prosthesis'), prost)}${kv(t('f_speed'), c['speed'] ? t(`spd_${c['speed']}`) : '')}${kv(t('f_instruction'), c['instruction'] ?? '')}${kv(t('f_modification'), c['modification'] ?? '')}</dl></div>`;
}

function customSection(a: Assessment): string {
  const cm = a.customMeasures;
  if (!cm || !Object.keys(cm).length) return '';
  const rows = Object.entries(cm)
    .map(
      ([id, m]) =>
        `<tr><th scope="row">${esc(metricLabel(id.split(':')[0] ?? id))}${id.includes(':') ? ` <small class="muted">(${esc(id.endsWith(':R') ? t('side_right') : t('side_left'))})</small>` : ''}</th><td class="num"><b>${esc(String(m.value))}</b> ${esc(m.unit)}</td><td class="small muted">${esc(t('conf_short'))} ${Math.round(m.confidence * 100)} %</td></tr>`,
    )
    .join('');
  return `<section class="gc-sec" aria-labelledby="gc-h-custom"><h2 id="gc-h-custom">${esc(t('sec_custom'))}</h2><div class="gc-scroll"><table class="gc-table"><tbody>${rows}</tbody></table></div></section>`;
}

function annotationsHtml(list: readonly { text: string; createdAt: string; authorRole: string }[]): string {
  return list.length
    ? `<ul class="gc-annots">${list.map((x) => `<li><small class="muted">${esc(dateLabel(x.createdAt, loc()))} · ${esc(t(`role_${x.authorRole}`))}</small><p>${esc(x.text)}</p></li>`).join('')}</ul>`
    : `<p class="muted small">${esc(t('annot_none'))}</p>`;
}

export async function renderResults(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const root = ctx.root;
  const id = ctx.arg ?? '';
  root.innerHTML = spinner(t('loading'));
  let a: Assessment | null = null;
  try {
    a = id ? await loadAssessment(id) : null;
  } catch (e) {
    console.error(e);
  }
  if (!location.hash.startsWith('#/marche-res/')) return; // l'utilisateur est déjà parti
  if (!a) {
    root.innerHTML = errorCard(t('res_title'), t('res_notFound'));
    return;
  }
  const role = navRole() === 'clinician' ? 'clinician' : 'patient';
  if (role === 'patient' && a.patientId !== currentUid()) {
    root.innerHTML = errorCard(t('res_title'), t('res_denied'), '#/home');
    return;
  }
  const r: StoredResult | null = readStoredResult(a);
  if (!r) {
    root.innerHTML = errorCard(t('res_title'), t('res_notGait'), `#/patient/${a.patientId}`);
    return;
  }
  const L = langId();
  const locale = loc();
  const analyses = r.analyses;
  const backHref = role === 'clinician' ? `#/patient/${a.patientId}` : '#/home';
  const findings = findingViews(r.findings, L, locale);
  const prosth = r.prosthetic;
  const prosthViews = prosth ? findingViews(prosth.deviations, L, locale) : [];
  const [annots, others] = await Promise.all([
    listAnnotations(a.patientId, [a.id]).catch(() => []),
    role === 'clinician' ? listGaitAssessments(a.patientId).catch(() => []) : Promise.resolve([] as Assessment[]),
  ]);
  if (!location.hash.startsWith('#/marche-res/')) return;
  const otherOpts = others
    .filter((o) => o.id !== a.id)
    .map((o) => `<option value="${esc(o.id)}">${esc(dateLabel(o.performedAt, locale))} — ${esc(o.conditions?.['modification'] ?? o.conditions?.['instruction'] ?? t(o.kind === 'prosthetic_gait' ? 'kind_prosthetic' : 'kind_gait'))}</option>`)
    .join('');

  const actions =
    role === 'clinician'
      ? `<div class="gc-actions" role="group" aria-label="${esc(t('act_group'))}">
        <button class="btn" data-a="redo">${icon('cam', 18)} ${esc(t('act_redo'))}</button>
        <div class="gc-compare"><label class="field" style="margin:0"><span>${esc(t('act_compareWith'))}</span><select class="input" data-a="cmp-sel" ${otherOpts ? '' : 'disabled'}><option value="">${esc(otherOpts ? t('act_choose') : t('act_noOther'))}</option>${otherOpts}</select></label><button class="btn ghost" data-a="cmp" disabled>${icon('trend', 18)} ${esc(t('act_compare'))}</button></div>
        <button class="btn ghost" data-go="#/plan/${esc(a.patientId)}">${icon('clip', 18)} ${esc(t('act_plan'))}</button>
        ${a.kind === 'prosthetic_gait' ? `<button class="btn ghost" data-go="#/prothese/${esc(a.patientId)}">${esc(t('act_prosthesis'))}</button>` : ''}
        <button class="btn ghost" data-a="pdf">${icon('doc', 18)} ${esc(t('act_pdf'))}</button>
        <button class="btn ghost" data-a="json">${icon('share', 18)} ${esc(t('act_json'))}</button></div>`
      : `<div class="gc-actions"><button class="btn ghost" data-a="pdf">${icon('doc', 18)} ${esc(t('act_pdf'))}</button><button class="btn ghost" data-a="json">${icon('share', 18)} ${esc(t('act_json'))}</button></div>`;

  root.innerHTML = `<section class="screen gc-screen gc-results"><div class="topbar"><button class="icon-btn" data-go="${esc(backHref)}" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(t('res_title'))}</h1></div>
    ${banner()}${headerCard(a)}
    ${qualitySection(analyses)}
    ${spatioSection(spatioRows(analyses, locale), speedSummary(analyses, locale))}
    ${determinantsSection(determinantViews(r.determinants, L, locale))}
    ${jointPhaseSection(jointPhaseTable(r.jointPhases, locale))}
    ${curvesSection(jointCharts(analyses))}
    ${findingsSection(findings, insufficientFindings(r.findings).length)}
    ${prosth ? findingsSection(prosthViews, insufficientFindings(prosth.deviations).length, 'sec_prosthetic') : ''}
    ${estimatesSection(estimateViews(analyses, locale))}
    ${customSection(a)}
    <section class="gc-sec" aria-labelledby="gc-h-annot"><h2 id="gc-h-annot">${esc(t('sec_annotations'))}</h2><div data-a="annots">${annotationsHtml(annots)}</div>
      <label class="field"><span>${esc(t('annot_label'))}</span><textarea class="input" data-a="annot-text" rows="3" maxlength="4000"></textarea></label>
      <button class="btn ghost" data-a="annot-save">${esc(t('annot_save'))}</button></section>
    ${actions}
    <p class="gc-disclaimer small muted">${esc(r.disclaimer)}</p></section>`;

  const $ = <E extends HTMLElement>(s: string): E | null => root.querySelector<E>(`[data-a="${s}"]`);

  // Annotation (document `annotations`)
  const saveBtn = $<HTMLButtonElement>('annot-save');
  if (saveBtn)
    saveBtn.onclick = async () => {
      const ta = $<HTMLTextAreaElement>('annot-text');
      const text = ta?.value.trim() ?? '';
      if (!text) return;
      saveBtn.disabled = true;
      try {
        await saveAnnotation(a.patientId, [a.id], text, role);
        const list = await listAnnotations(a.patientId, [a.id]);
        const box = $('annots');
        if (box) box.innerHTML = annotationsHtml(list);
        if (ta) ta.value = '';
        toast(t('annot_saved'));
      } catch (e) {
        console.error(e);
        toast(t('err_save'), 4000);
      } finally {
        saveBtn.disabled = false;
      }
    };

  // Comparer avec… (A = la plus ancienne, B = la plus récente)
  const sel = $<HTMLSelectElement>('cmp-sel');
  const cmp = $<HTMLButtonElement>('cmp');
  if (sel && cmp) {
    sel.onchange = () => {
      cmp.disabled = !sel.value;
    };
    cmp.onclick = () => {
      const other = others.find((o) => o.id === sel.value);
      if (!other) return;
      const [x, y] = other.performedAt <= a.performedAt ? [other, a] : [a, other];
      go(`#/marche-ab/${x.id}/${y.id}`);
    };
  }

  // Refaire après une modification : même réglages, note de modification, puis comparaison A/B
  const redo = $<HTMLButtonElement>('redo');
  if (redo) redo.onclick = () => go(`#/marche/${a.patientId}/${a.id}`);

  const pdf = $<HTMLButtonElement>('pdf');
  if (pdf)
    pdf.onclick = async () => {
      pdf.disabled = true;
      try {
        await exportPdf(a, r, t, locale, L, root);
      } catch (e) {
        console.error(e);
        toast(t('err_pdf'), 4000);
      } finally {
        pdf.disabled = false;
      }
    };
  const js = $<HTMLButtonElement>('json');
  if (js) js.onclick = () => void exportJson(a, `mobilis-marche-${a.id}.json`);
}
