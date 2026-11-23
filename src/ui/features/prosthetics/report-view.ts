// #/prothese-res/<assessmentId> : rapport prothétique (toutes les déviations du niveau) ;
// #/prothese-liste/<assessmentId> : liste de vérification imprimable pour le prothésiste.
import type { Assessment } from '../../../core/types/clinical.ts';
import {
  buildChecklist,
  buildProstheticReport,
  parseProstheticAssessment,
  type ChecklistItem,
  type DeviationReport,
  type ProstheticAssessment,
} from '../../../domains/prosthetics/index.ts';
import { esc } from '../../components/html.ts';
import { hostOf, type Host } from '../../util.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { db, ensureCss, errMsg, fmtDate, lang, notice, refText, screen, topbar } from './shared.ts';
import { t } from './strings.ts';

const STATE_CLS: Record<string, string> = {
  present: 'neg',
  possible: 'warn',
  observe: 'warn',
  absent: 'pos',
  insufficient: '',
};

const ul = (items: readonly string[]): string =>
  `<ul class="list-plain">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

const causesHtml = (e: { causes: DeviationReport['causes'] }): string =>
  e.causes
    .map((g) => {
      const label = t(`cat_${g.category}`);
      return `<div class="pros-cause"><b>${esc(label.startsWith('cat_') ? g.label : label)}</b>${ul(g.items)}</div>`;
    })
    .join('');

function measuredHtml(e: DeviationReport): string {
  if (e.observeNote !== null)
    return `<div class="pros-observe"><b>${esc(t('observeClin'))}</b> <span class="chip sm warn">${esc(t('estimate'))}</span><p class="small">${esc(e.observeNote)}</p></div>`;
  if (!e.measured.length) return '';
  return `<div class="pros-measured"><b>${esc(t('measured'))}</b><ul class="list-plain">${e.measured
    .map(
      (m) =>
        `<li>${esc(m.text)} : <b>${esc(m.value ?? t('notMeasured'))}</b>${m.threshold ? ` <span class="muted small">(${esc(t('threshold'))} ${esc(m.threshold)})</span>` : ''}${m.estimate ? ` <span class="chip sm warn">${esc(t('estimate'))}</span>` : ''}${m.unvalidated ? ` <span class="muted small pros-unval">${esc(t('unvalidatedThr'))}</span>` : ''}</li>`,
    )
    .join('')}</ul></div>`;
}

function entryHtml(e: DeviationReport): string {
  const full = e.state === 'present' || e.state === 'possible' || e.state === 'observe';
  const body = `${e.safety ? `<p class="banner neg" role="note"><b>${esc(t('safetyLbl'))} :</b> ${esc(e.safety)}</p>` : ''}
    ${measuredHtml(e)}
    ${e.determinants.length ? `<div><b>${esc(t('determinants'))}</b>${ul(e.determinants)}</div>` : ''}
    ${e.causes.length ? `<div><b>${esc(t('causes'))}</b>${causesHtml(e)}</div>` : ''}
    ${e.adjustments.length ? `<div><b>${esc(t('adjustments'))}</b>${ul(e.adjustments)}</div>` : ''}
    ${e.exercises.length ? `<div><b>${esc(t('exercises'))}</b>${ul(e.exercises)}</div>` : ''}
    ${e.assistiveDevice ? `<div><b>${esc(t('device'))}</b><p class="small">${esc(e.assistiveDevice)}</p></div>` : ''}
    ${e.refs.length ? `<div class="pros-refs"><b>${esc(t('refs'))}</b><ul class="list-plain small muted">${e.refs.map((r) => `<li>${esc(refText(r))}</li>`).join('')}</ul></div>` : ''}
    <p class="small muted">${esc(t('literature'))}</p>`;
  return `<details class="card pros-entry st-${e.state}"${full ? ' open' : ''}>
    <summary><span class="pros-name">${esc(e.name)}</span>
      <span class="chip sm ${STATE_CLS[e.state] ?? ''}">${esc(t(`st_${e.state}`))}</span>
      <span class="chip sm">${esc(t('conf'))} : ${esc(t(`conf_${e.confidence}`))}</span>${e.estimate ? `<span class="chip sm warn">${esc(t('estimate'))}</span>` : ''}</summary>
    <div class="pros-body">${body}</div></details>`;
}

async function load(
  ctx: FeatureRouteContext,
): Promise<{ root: HTMLElement; a: Assessment; p: ProstheticAssessment } | null> {
  ensureCss();
  const root = hostOf(ctx.root as Host);
  const hash = location.hash;
  const fail = (msg: string, back = '#/patients'): null => {
    if (location.hash === hash) root.innerHTML = screen(`${topbar(t('report'), back)}${notice(msg)}`);
    return null;
  };
  if (!ctx.arg) return fail(t('notFound'));
  let a: Assessment | null;
  try {
    a = await db().get('assessments', ctx.arg);
  } catch (e) {
    return fail(t('loadError', { msg: errMsg(e) }));
  }
  if (location.hash !== hash) return null;
  if (!a) return fail(t('notFound'));
  const back = `#/prothese/${a.patientId}`;
  const p = parseProstheticAssessment(a.result);
  if (!p) return fail(t('noReport'), back);
  return { root, a, p };
}

export async function viewProsthesisReport(ctx: FeatureRouteContext): Promise<void> {
  const d = await load(ctx);
  if (!d) return;
  const { root, a, p } = d;
  const rep = buildProstheticReport(p, lang());
  const c = rep.counts;
  const shown = rep.entries.filter((e) => e.state !== 'absent' && e.state !== 'insufficient');
  const rest = rep.entries.filter((e) => e.state === 'absent' || e.state === 'insufficient');
  root.innerHTML = screen(`${topbar(t('report'), `#/prothese/${a.patientId}`)}
    <div class="card"><b>${esc(t('reportFor', { level: t(`lvl_${rep.level}`), side: t(`side_${rep.side}`) }))}</b>
      <p class="muted small">${esc(fmtDate(a.performedAt))} · ${esc(t('counts', { p: c.present, q: c.possible, o: c.observe, a: c.absent, i: c.insufficient }))}</p>
      <div class="row wrap no-print"><button class="btn sm" data-go="#/prothese-liste/${esc(a.id)}">${esc(t('checklistOpen'))}</button>
        <button class="btn sm ghost" data-go="#/marche/${esc(a.patientId)}">${esc(t('newAnalysis'))}</button></div></div>
    <p class="banner" role="note">${esc(t('validate'))}</p>
    ${shown.length ? shown.map(entryHtml).join('') : `<p class="muted">${esc(t('noEntries'))}</p>`}
    ${rest.length ? `<h2>${esc(t('absentSection'))}</h2>${rest.map(entryHtml).join('')}` : ''}
    <p class="muted small">${esc(rep.disclaimer)}</p>`);
}

function checkItem(i: ChecklistItem): string {
  return `<section class="pros-ck-item"><h3><span class="pros-box" aria-hidden="true"></span> ${esc(i.name)} <span class="chip sm ${STATE_CLS[i.state] ?? ''}">${esc(t(`st_${i.state}`))}</span></h3>
    ${i.safety ? `<p class="small"><b>${esc(t('safetyLbl'))} :</b> ${esc(i.safety)}</p>` : ''}
    ${i.basis ? `<p class="small muted">${esc(i.basis)}</p>` : ''}
    ${i.causes.length ? `<b class="small">${esc(t('ckCauses'))}</b><ul class="pros-ck-list">${i.causes.flatMap((g) => g.items.map((x) => `<li><span class="pros-box" aria-hidden="true"></span> <i>${esc(t(`cat_${g.category}`).startsWith('cat_') ? g.label : t(`cat_${g.category}`))}</i> : ${esc(x)}</li>`)).join('')}</ul>` : ''}
    ${i.adjustments.length ? `<b class="small">${esc(t('ckAdjust'))}</b><ul class="pros-ck-list">${i.adjustments.map((x) => `<li><span class="pros-box" aria-hidden="true"></span> ${esc(x)}</li>`).join('')}</ul>` : ''}</section>`;
}

export async function viewProsthesisChecklist(ctx: FeatureRouteContext): Promise<void> {
  const d = await load(ctx);
  if (!d) return;
  const { root, a, p } = d;
  const ck = buildChecklist(p, lang());
  root.innerHTML = screen(`${topbar(t('checklist'), `#/prothese-res/${a.id}`)}
    <div class="row between no-print"><button class="btn" data-pros-print>${esc(t('print'))}</button></div>
    <article class="card pros-checklist">
      <header><h2 style="margin-top:0">${esc(t('checklist'))}</h2>
        <p class="small">${esc(t('reportFor', { level: t(`lvl_${p.prosthesis.level}`), side: t(`side_${p.prosthesis.side === 'L' ? 'left' : 'right'}`) }))} · ${esc(t('ckDate', { date: fmtDate(a.performedAt) }))}</p>
        <p class="small">${esc(t('ckPatient', { id: a.patientId }))}</p></header>
      <h2>${esc(t('ckRetained'))}</h2>
      ${ck.retained.length ? ck.retained.map(checkItem).join('') : `<p class="muted">${esc(t('ckNone'))}</p>`}
      ${ck.toObserve.length ? `<h2>${esc(t('ckObserve'))}</h2>${ck.toObserve.map(checkItem).join('')}` : ''}
      <h2>${esc(t('ckNotes'))}</h2>
      <label class="field"><span class="sr-only">${esc(t('ckNotes'))}</span><textarea class="input pros-notes" rows="6" aria-label="${esc(t('ckNotes'))}"></textarea></label>
      <div class="pros-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <p class="small pros-sign">${esc(t('ckSign'))} : ______________________</p>
      <p class="small muted">${esc(t('validate'))} ${esc(ck.disclaimer)}</p>
    </article>`);
  root.querySelector('[data-pros-print]')?.addEventListener('click', () => window.print());
}
