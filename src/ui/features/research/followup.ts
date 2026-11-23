// Suivi post-intervention (#/suivi/<patientId>) : chronologie d'interventions, suivis ancrés sur une intervention,
// calendrier des échéances (fonction pure followUpSchedule) et lancement de la bonne mesure au bon moment.
// - Patient : « Mes mesures de suivi » (son dossier : id = uid). Questionnaire → #/prom/<id>, amplitude → #/rom/<test>/<côté>,
//   marche → #/marche/<patientId>, douleur → saisie ici. Les écrans existants ne renvoient pas l'id du résultat : au
//   retour ici, les lignes du journal du profil sont reliées par date et par type (domains/research/link.ts).
// - Clinicien : choix du patient, interventions, suivis (gabarit ou protocole d'étude), saisie manuelle, liaison d'une analyse.
import type { IsoDate } from '../../../core/types/common.ts';
import type { Assessment, FollowUp, Intervention, MeasureDefinition } from '../../../core/types/clinical.ts';
import {
  completedMeasures,
  createFollowUp,
  ensurePatient,
  followUpSchedule,
  isGaitMeasure,
  markDone,
  PAIN_METRIC_ID,
  PROTOCOL_TEMPLATES,
  reconcilePatient,
  recordMeasure,
  saveIntervention,
  templateById,
  templateForIntervention,
  toGaitSide,
  type PatientFollowUpData,
  type PromLogRow,
  type RomLogRow,
  type ScheduleItem,
} from '../../../domains/research/index.ts';
import { profile } from '../../app-state.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { draftProblem, mountProtocolEditor, type ProtocolDraft } from './editor.ts';
import {
  banner,
  bi,
  ctx,
  db,
  describeMeasure,
  ensureCss,
  errMsg,
  esc,
  fmtDate,
  isClinician,
  newId,
  statusChip,
  t,
  today,
  topbar,
  uid,
} from './shared.ts';

const IV_TYPES: readonly Intervention['type'][] = [
  'botulinum_toxin',
  'medication',
  'surgery',
  'prosthetic_adjustment',
  'orthosis',
  'other',
];

function logsOfProfile(): { promLog: PromLogRow[]; romLog: RomLogRow[] } {
  const p = (profile() ?? {}) as { promLog?: unknown; romLog?: unknown };
  return {
    promLog: Array.isArray(p.promLog) ? (p.promLog as PromLogRow[]) : [],
    romLog: Array.isArray(p.romLog) ? (p.romLog as RomLogRow[]) : [],
  };
}

/** Lien vers l'écran qui fait la mesure (null : saisie ici). */
export function measureHref(m: MeasureDefinition, patientId: string): string | null {
  if (isGaitMeasure(m)) return `#/marche/${encodeURIComponent(patientId)}`;
  if (m.kind === 'prom' && m.metricId && m.metricId !== PAIN_METRIC_ID) return `#/prom/${m.metricId}`;
  if (m.kind === 'rom' && m.metricId) return `#/rom/${m.metricId}/${toGaitSide(m.side) ?? '-'}`;
  return null;
}

export async function viewFollowUp(root: HTMLElement, arg: string | undefined): Promise<void> {
  ensureCss();
  const clin = isClinician();
  const patientId = clin ? arg : uid();
  if (!patientId) return viewPickPatient(root);
  root.innerHTML = `<section class="screen rs"><div class="card muted">${esc(t('rs_loading'))}</div></section>`;
  try {
    const patient = await ensurePatient(
      db(),
      ctx(),
      patientId,
      clin ? {} : { displayName: String(profile()?.['name'] ?? '') },
    );
    // Patient : relie son journal (questionnaires, amplitudes) ; clinicien : relie les analyses de marche par date.
    const data = await reconcilePatient(db(), ctx(), patientId, clin ? {} : logsOfProfile(), today());
    render(root, { ...data, patient }, clin);
  } catch (e) {
    root.innerHTML = `<section class="screen rs">${topbar(t('rs_followTitle'), '#/home')}<div class="card neg">${esc(t('rs_error', { msg: errMsg(e) }))}</div></section>`;
  }
}

async function viewPickPatient(root: HTMLElement): Promise<void> {
  root.innerHTML = `<section class="screen rs">${topbar(t('rs_pickPatientTitle'), '#/recherche')}${banner()}<div id="rs-pts"><div class="card muted">${esc(t('rs_loading'))}</div></div>
    <div class="card rs-mt"><label class="field"><span>${esc(t('rs_newPatient'))}</span><input class="input" id="rs-newname" autocomplete="off"></label><button class="btn sm" id="rs-create">${icon('plus', 16)} ${esc(t('rs_createPatient'))}</button></div></section>`;
  const pts = (await db().query('patients')).sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
  root.querySelector<HTMLElement>('#rs-pts')!.innerHTML = pts.length
    ? `<div class="list">${pts.map((p) => `<button class="ex-item" data-go="#/suivi/${esc(p.id)}"><span class="meta"><b>${esc(p.displayName ?? p.id)}</b><small>${esc(p.researchId ?? '')}</small></span>${icon('chev', 16)}</button>`).join('')}</div>`
    : `<div class="card small muted">${esc(t('rs_noPatient'))}</div>`;
  root.querySelector<HTMLElement>('#rs-create')!.onclick = async () => {
    const name = root.querySelector<HTMLInputElement>('#rs-newname')!.value.trim();
    if (!name) return toast(t('rs_badValue'));
    const id = newId('pt');
    await ensurePatient(db(), ctx(), id, { displayName: name });
    location.hash = `#/suivi/${id}`;
  };
}

function itemHtml(
  fu: FollowUp,
  it: ScheduleItem,
  clin: boolean,
  patientId: string,
  conditions: readonly string[],
): string {
  const when =
    it.daysUntil > 0
      ? t('rs_inDays', { n: it.daysUntil })
      : it.daysUntil < 0
        ? t('rs_daysAgo', { n: -it.daysUntil })
        : '';
  const head = `<div class="row between"><div><b>${esc(it.timepoint.label)}</b> ${statusChip(it.status)}<br><small class="muted">${esc(t('rs_dueOn', { date: fmtDate(it.dueDate), from: fmtDate(it.windowStart), to: fmtDate(it.windowEnd) }))}${when ? ` · ${esc(when)}` : ''}</small></div><small class="muted tnum">${esc(t('rs_measuresDone', { a: it.doneMeasureIds.length, b: fu.measures.length }))}</small></div>`;
  const actionable = it.status !== 'upcoming' || clin;
  const rows = fu.measures
    .map((m) => {
      const done = it.doneMeasureIds.includes(m.id);
      const href = measureHref(m, patientId);
      let act = '';
      if (!done && actionable) {
        if (m.kind === 'prom' && m.metricId === PAIN_METRIC_ID)
          act = `<div class="rs-pain" role="group" aria-label="${esc(t('rs_painQ'))}">${Array.from({ length: 11 }, (_, v) => `<button class="rs-pain-b" data-pain="${v}" data-fu="${esc(fu.id)}" data-tp="${esc(it.timepoint.id)}" data-m="${esc(m.id)}">${v}</button>`).join('')}</div>`;
        else if (href)
          act = `<button class="btn sm ${clin ? 'ghost' : ''}" data-go="${esc(href)}">${esc(isGaitMeasure(m) ? t('rs_doGait') : t('rs_doMeasure'))}</button>`;
        if (clin && !isGaitMeasure(m) && m.metricId !== PAIN_METRIC_ID)
          act += `<span class="row rs-manual"><input class="input tnum" type="number" step="any" inputmode="decimal" placeholder="${esc(t('rs_valuePlaceholder'))}" aria-label="${esc(m.label)}" data-val="${esc(m.id)}"><button class="btn sm" data-enter="${esc(m.id)}" data-fu="${esc(fu.id)}" data-tp="${esc(it.timepoint.id)}">${esc(t('rs_enterValue'))}</button></span>`;
      }
      return `<li class="rs-mrow${done ? ' done' : ''}"><div class="grow"><span>${done ? icon('check', 14) + ' ' : ''}<b>${esc(m.label)}</b></span>${clin ? `<br><small class="muted">${esc(describeMeasure(m))}</small>` : ''}</div>${act ? `<div class="rs-act">${act}</div>` : ''}</li>`;
    })
    .join('');
  const cond =
    clin && conditions.length && it.status !== 'done'
      ? `<label class="field rs-mt"><span>${esc(t('rs_condition'))}</span><select class="input" data-cond="${esc(fu.id)}|${esc(it.timepoint.id)}"><option value="">—</option>${conditions.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>`
      : '';
  return `<div class="rs-item rs-${it.status}">${head}<ul class="list-plain rs-ms">${rows}</ul>${cond}</div>`;
}

function render(root: HTMLElement, data: PatientFollowUpData, clin: boolean): void {
  const patientId = data.patient!.id;
  const byId = new Map(data.assessments.map((a) => [a.id as string, a]));
  const ivById = new Map(data.interventions.map((i) => [i.id as string, i]));
  const studyById = new Map(data.studies.map((s) => [s.id as string, s]));
  const fus = [...data.followups].sort((a, b) => (a.anchorDate < b.anchorDate ? 1 : -1));
  const gaitAssessments = data.assessments
    .filter((a) => a.kind === 'gait' || a.kind === 'prosthetic_gait')
    .sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
  const title = clin ? t('rs_followTitle') : t('rs_myFollowTitle');
  const who = clin
    ? `<p class="muted"><b>${esc(data.patient!.displayName ?? patientId)}</b>${data.patient!.researchId ? ` · ${esc(data.patient!.researchId)}` : ''}</p>`
    : `<p class="muted">${esc(t('rs_myFollowIntro'))}</p>`;
  const fuCards = fus.length
    ? fus
        .map((fu) => {
          const iv = fu.interventionId ? ivById.get(fu.interventionId) : undefined;
          const st = fu.studyId ? studyById.get(fu.studyId) : undefined;
          const sched = followUpSchedule(fu, today(), { completed: completedMeasures(fu, byId) });
          const anchor = iv ? `${t('rs_iv_' + iv.type)} · ${fmtDate(iv.date)}` : fmtDate(fu.anchorDate);
          const link =
            clin && gaitAssessments.length && fu.measures.some(isGaitMeasure)
              ? `<div class="row wrap rs-mt"><select class="input grow" data-link="${esc(fu.id)}" aria-label="${esc(t('rs_linkGait'))}"><option value="">${esc(t('rs_linkGait'))}…</option>${gaitAssessments.map((a) => `<option value="${esc(a.id)}">${esc(fmtDate(a.performedAt))}</option>`).join('')}</select><select class="input" data-link-tp="${esc(fu.id)}" aria-label="${esc(t('rs_timepoints'))}">${fu.timepoints.map((tp) => `<option value="${esc(tp.id)}">${esc(tp.label)}</option>`).join('')}</select><button class="btn sm ghost" data-link-go="${esc(fu.id)}">${icon('check', 14)}</button></div>`
              : '';
          return `<article class="card rs-fu"><header class="row between"><div><h3>${esc(anchor)}</h3><small class="muted">${esc(t(fu.setBy === 'patient' ? 'rs_setByPatient' : 'rs_setByClinician'))}${st ? ` · ${esc(t('rs_studyFollow', { name: st.name }))}` : ''}</small></div>${clin && st ? `<button class="btn sm ghost" data-go="#/etude/${esc(st.id)}">${icon('chart', 14)}</button>` : ''}</header>
            ${sched.map((it) => itemHtml(fu, it, clin, patientId, st?.conditions ?? [])).join('')}${link}
            ${!fu.studyId ? `<button class="btn sm ghost danger rs-mt" data-del-fu="${esc(fu.id)}">${esc(t('rs_deleteFollowUp'))}</button>` : ''}</article>`;
        })
        .join('')
    : `<div class="card small muted">${esc(t('rs_noFollowUp'))}</div>`;
  const ivs = [...data.interventions].sort((a, b) => (a.date < b.date ? 1 : -1));
  const timeline = `<h2>${esc(t('rs_timeline'))}</h2>${
    ivs.length
      ? `<ol class="rs-timeline">${ivs
          .map(
            (i) =>
              `<li><span class="rs-dot" aria-hidden="true"></span><div><b>${esc(t('rs_iv_' + i.type))}</b> · <span class="tnum">${esc(fmtDate(i.date))}</span>${
                i.details
                  ? `<br><small class="muted">${Object.entries(i.details)
                      .map(([k, v]) => `${esc(k)} : ${esc(v)}`)
                      .join(' · ')}</small>`
                  : ''
              }</div></li>`,
          )
          .join('')}</ol>`
      : `<div class="card small muted">${esc(t('rs_noIntervention'))}</div>`
  }`;
  root.innerHTML = `<section class="screen rs">${topbar(title, clin ? '#/suivi' : '#/home')}${banner()}${who}
    <h2>${esc(t('rs_followups'))}</h2><div aria-live="polite">${fuCards}</div>
    <p class="small muted rs-mt">${esc(t('rs_linkNote'))}</p>
    ${timeline}
    <details class="card rs-mt" id="rs-new"><summary><b>${esc(t('rs_newFollowUp'))}</b></summary><div id="rs-new-body"></div></details></section>`;

  const reload = (): void => void viewFollowUp(root, clin ? patientId : undefined);
  const fuOf = (id: string): FollowUp | undefined => data.followups.find((f) => f.id === id);
  const condOf = (fuId: string, tp: string): string =>
    root.querySelector<HTMLSelectElement>(`[data-cond="${CSS.escape(`${fuId}|${tp}`)}"]`)?.value ?? '';

  root.querySelectorAll<HTMLElement>('[data-pain]').forEach((b) => {
    b.onclick = async () => {
      const fu = fuOf(b.dataset['fu']!);
      const m = fu?.measures.find((x) => x.id === b.dataset['m']);
      if (!fu || !m) return;
      const tp = b.dataset['tp']!;
      const cond = condOf(fu.id, tp);
      await recordMeasure(db(), ctx(), fu, tp, {
        measure: m,
        value: Number(b.dataset['pain']),
        source: clin ? 'clinician' : 'patient',
        ...(cond ? { condition: cond } : {}),
      });
      toast(t('rs_saved'));
      reload();
    };
  });
  root.querySelectorAll<HTMLElement>('[data-enter]').forEach((b) => {
    b.onclick = async () => {
      const fu = fuOf(b.dataset['fu']!);
      const m = fu?.measures.find((x) => x.id === b.dataset['enter']);
      const inp = b.parentElement?.querySelector<HTMLInputElement>('[data-val]');
      const v = Number(inp?.value.replace(',', '.'));
      if (!fu || !m || !inp || inp.value === '' || !Number.isFinite(v)) return toast(t('rs_badValue'));
      const tp = b.dataset['tp']!;
      const cond = condOf(fu.id, tp);
      await recordMeasure(db(), ctx(), fu, tp, {
        measure: m,
        value: v,
        source: 'manual',
        ...(cond ? { condition: cond } : {}),
      });
      toast(t('rs_saved'));
      reload();
    };
  });
  root.querySelectorAll<HTMLElement>('[data-link-go]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset['linkGo']!;
      const fu = fuOf(id);
      const aid = root.querySelector<HTMLSelectElement>(`[data-link="${CSS.escape(id)}"]`)?.value;
      const tp = root.querySelector<HTMLSelectElement>(`[data-link-tp="${CSS.escape(id)}"]`)?.value;
      const a: Assessment | undefined = aid ? byId.get(aid) : undefined;
      if (!fu || !a || !tp) return toast(t('rs_linkPick'));
      await markDone(db(), ctx(), fu, tp, a.id);
      toast(t('rs_saved'));
      reload();
    };
  });
  root.querySelectorAll<HTMLElement>('[data-del-fu]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t('rs_confirmDelete'))) return;
      await db().remove('followups', b.dataset['delFu']!);
      reload();
    };
  });
  mountNewFollowUp(root.querySelector<HTMLElement>('#rs-new-body')!, patientId, clin, data.interventions, reload);
}

function mountNewFollowUp(
  host: HTMLElement,
  patientId: string,
  clin: boolean,
  interventions: readonly Intervention[],
  done: () => void,
): void {
  const first = templateById('botox')!;
  const draft: ProtocolDraft = {
    measures: first.measures.map((m) => ({ ...m })),
    timepoints: first.timepoints.map((x) => ({ ...x })),
    conditions: [],
  };
  const opt = (v: string, l: string, sel = false): string =>
    `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  host.innerHTML = `<p class="small muted rs-mt">${esc(t('rs_templatesNote'))}</p>
    <label class="field"><span>${esc(t('rs_followAnchor'))}</span><select class="input" id="rs-anchor-iv">${opt('__new', `+ ${t('rs_addIntervention')}`, true)}${interventions.map((i) => opt(i.id, `${t('rs_iv_' + i.type)} · ${fmtDate(i.date)}`)).join('')}${opt('', t('rs_noAnchor'))}</select></label>
    <div id="rs-iv-new" class="rs-ivform">
      <label class="field"><span>${esc(t('rs_ivType'))}</span><select class="input" id="rs-iv-type">${IV_TYPES.map((x) => opt(x, t('rs_iv_' + x), x === 'botulinum_toxin')).join('')}</select></label>
      <label class="field"><span>${esc(t('rs_ivSite'))}</span><input class="input" id="rs-iv-site" autocomplete="off"></label>
      <label class="field"><span>${esc(t('rs_ivDose'))}</span><input class="input" id="rs-iv-dose" autocomplete="off"></label>
      <label class="field"><span>${esc(t('rs_ivNote'))}</span><input class="input" id="rs-iv-note" autocomplete="off"></label>
      <p class="small muted">${esc(t('rs_ivFreeHint'))}</p></div>
    <label class="field"><span>${esc(t('rs_ivDate'))} (T0)</span><input class="input" type="date" id="rs-iv-date" value="${today()}"></label>
    <label class="field"><span>${esc(t('rs_followTemplate'))}</span><select class="input" id="rs-tpl">${PROTOCOL_TEMPLATES.map((x) => opt(x.id, bi(x.name), x.id === first.id)).join('')}</select></label>
    <div id="rs-fu-editor"></div>
    <button class="btn rs-mt" id="rs-fu-save">${esc(t('rs_save'))}</button>`;
  const $ = <E extends HTMLElement>(s: string): E => host.querySelector<E>(s)!;
  const mountEditor = (): void => {
    const cur = $('#rs-fu-editor');
    const fresh = cur.cloneNode(false) as HTMLElement; // retire les écouteurs précédents
    cur.replaceWith(fresh);
    mountProtocolEditor(fresh, draft, { conditions: false });
  };
  const applyTemplate = (id: string): void => {
    const tpl = templateById(id);
    if (!tpl) return;
    draft.measures = tpl.measures.map((m) => ({ ...m }));
    draft.timepoints = tpl.timepoints.map((x) => ({ ...x }));
    $<HTMLSelectElement>('#rs-tpl').value = id;
    mountEditor();
  };
  mountEditor();
  $<HTMLSelectElement>('#rs-tpl').onchange = (e) => {
    const id = (e.target as HTMLSelectElement).value;
    applyTemplate(id);
    const tpl = templateById(id);
    if (tpl && $<HTMLSelectElement>('#rs-anchor-iv').value === '__new')
      $<HTMLSelectElement>('#rs-iv-type').value = tpl.interventionType;
  };
  $<HTMLSelectElement>('#rs-iv-type').onchange = (e) => {
    const tpl = templateForIntervention((e.target as HTMLSelectElement).value as Intervention['type']);
    if (tpl) applyTemplate(tpl.id);
  };
  $<HTMLSelectElement>('#rs-anchor-iv').onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    $('#rs-iv-new').hidden = v !== '__new';
    const iv = interventions.find((i) => i.id === v);
    if (iv) {
      $<HTMLInputElement>('#rs-iv-date').value = iv.date;
      const tpl = templateForIntervention(iv.type);
      if (tpl) applyTemplate(tpl.id);
    }
  };
  $('#rs-fu-save').onclick = async () => {
    const pb = draftProblem(draft);
    if (pb) return toast(pb);
    const date = $<HTMLInputElement>('#rs-iv-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast(t('rs_badValue'));
    try {
      const sel = $<HTMLSelectElement>('#rs-anchor-iv').value;
      let ivId = sel && sel !== '__new' ? sel : undefined;
      if (sel === '__new') {
        const iv = await saveIntervention(db(), ctx(), {
          patientId,
          type: $<HTMLSelectElement>('#rs-iv-type').value as Intervention['type'],
          date: date as IsoDate,
          details: {
            site: $<HTMLInputElement>('#rs-iv-site').value,
            dose: $<HTMLInputElement>('#rs-iv-dose').value,
            note: $<HTMLInputElement>('#rs-iv-note').value,
          },
        });
        ivId = iv.id;
      }
      await createFollowUp(db(), ctx(), {
        patientId,
        ...(ivId ? { interventionId: ivId as Intervention['id'] } : {}),
        setBy: clin ? 'clinician' : 'patient',
        anchorDate: date as IsoDate,
        measures: draft.measures,
        timepoints: [...draft.timepoints].sort((a, b) => a.offsetDays - b.offsetDays),
      });
      toast(t('rs_saved'));
      done();
    } catch (e) {
      toast(t('rs_error', { msg: errMsg(e) }));
    }
  };
}
