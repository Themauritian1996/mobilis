/**
 * #/plan/<patientId> — éditeur du plan de traitement (clinicien) et vue patient en lecture (spec v2 §6, §10.8).
 * Clinicien : suggestions cochables (littérature, à valider), ajout / retrait / modification, durée, objectifs,
 * statut brouillon / actif / clos, révisions, suivi des objectifs avec marge d'erreur, pont vers l'éditeur `rx`.
 * Patient : exercices et aides techniques validés d'un plan actif seulement (toxine, chirurgie, orthèse et ajustements
 * de prothèse ne sont jamais montrés).
 */
import { getLang } from '../../../../www/js/i18n.js';
import type { Assessment, Patient } from '../../../core/types/clinical.ts';
import type { IsoDate } from '../../../core/types/common.ts';
import {
  BANNER,
  SUGGESTION_NOTICE,
  defaultCatalogues,
  defaultExerciseCatalogue,
  planSourceOf,
  proposePlan,
  referenceLabel,
  referenceStatus,
  trackGoals,
  type DeviceKind,
  type GoalProgress,
  type PlanProposal,
  type PlanSource,
  type Side,
  type TreatmentAction,
  type TreatmentGoal,
  type TreatmentPlan,
} from '../../../domains/treatment/index.ts';
import {
  acceptActions,
  acceptGoals,
  activate,
  addGoal,
  addManualAction,
  canActivate,
  close,
  editAction,
  isEditable,
  newPlan,
  patientView,
  removeAction,
  removeGoal,
  revise,
  setDuration,
  setNotes,
  supersede,
} from '../../../domains/treatment/plan.ts';
import { DEVICE_KINDS, DEVICE_LABEL } from '../../../domains/treatment/devices.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { profile } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { makeT } from '../i18n.ts';
import { ensureCss } from './css.ts';
import {
  currentPlan,
  currentUid,
  listPatients,
  loadAssessments,
  loadPatient,
  loadPlans,
  savePlan,
  selfPatientId,
} from './data.ts';
import { listPrograms, openRxEditor, pathologiesOf, prefillOf, type ProgramRef } from './rx-bridge.ts';
import { STRINGS } from './strings.ts';

const t = makeT(STRINGS);
const CAT = defaultCatalogues();
const EX = defaultExerciseCatalogue();
const lang = (): 'fr' | 'en' => (getLang() === 'fr' ? 'fr' : 'en');

/** Métriques proposées pour un objectif ajouté à la main (identifiant, libellé, unité, côté ?). */
const METRICS: readonly { id: string; label: string; unit: string; sided: boolean }[] = [
  { id: 'ankle_msw', label: 'Cheville en oscillation moyenne', unit: '°', sided: true },
  { id: 'ankle_ic', label: 'Cheville au contact initial', unit: '°', sided: true },
  { id: 'peak_ankle_dorsiflexion_stance', label: 'Dorsiflexion maximale en appui', unit: '°', sided: true },
  { id: 'knee_flexion_loading', label: 'Flexion du genou en réponse à la charge', unit: '°', sided: true },
  { id: 'knee_min_stance', label: 'Extension du genou en appui', unit: '°', sided: true },
  { id: 'peak_knee_flexion_swing', label: 'Flexion maximale du genou en oscillation', unit: '°', sided: true },
  { id: 'peak_hip_flexion_swing', label: 'Flexion maximale de la hanche en oscillation', unit: '°', sided: true },
  { id: 'peak_hip_extension', label: 'Extension maximale de la hanche', unit: '°', sided: true },
  { id: 'pelvic_obliquity_swing', label: 'Obliquité du bassin en oscillation', unit: '°', sided: true },
  { id: 'gait_speed', label: 'Vitesse de marche', unit: 'm/s', sided: false },
  { id: 'cadence', label: 'Cadence', unit: 'pas/min', sided: false },
  { id: 'step_length', label: 'Longueur de pas', unit: 'm', sided: true },
  { id: 'step_width_mean', label: 'Largeur de base', unit: 'm', sided: false },
];

interface State {
  patientId: string;
  patient: Patient | null;
  assessments: Assessment[];
  sources: PlanSource[];
  plans: TreatmentPlan[];
  planId: string | null;
  proposal: PlanProposal | null;
  checkedA: Set<string>;
  checkedG: Set<string>;
  programs: ProgramRef[];
  preview: boolean;
  rxPathology: string;
}

const dateFr = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang() === 'fr' ? 'fr-CA' : 'en-CA');
};
const sideName = (s: Side | undefined): string => (s ? t(s === 'L' ? 'side_L' : 'side_R') : '');
const exName = (id: string | undefined, fallback: string): string => {
  const e = id ? EX[id] : undefined;
  return e ? e.name[lang()] : fallback;
};
const chip = (text: string, cls = ''): string => `<span class="tx-chip ${cls}">${esc(text)}</span>`;
const num = (n: number): string => String(Math.round(n * 100) / 100).replace('.', lang() === 'fr' ? ',' : '.');

function refsHtml(refs: readonly string[]): string {
  if (!refs.length) return '';
  return `<span class="tx-refs">${t('refs')} : ${refs
    .map((r) => {
      const unverified = referenceStatus(r) === 'to_verify';
      return `<span class="tx-ref${unverified ? ' tbv' : ''}" title="${esc(r)}">${esc(referenceLabel(r))}${unverified ? ` <i>(${t('toVerify')})</i>` : ''}</span>`;
    })
    .join(' · ')}</span>`;
}

const current = (S: State): TreatmentPlan | undefined => S.plans.find((p) => p.id === S.planId) ?? currentPlan(S.plans);

function recompute(S: State): void {
  const plan = current(S);
  const gaitSources = S.sources.filter((s) => s.kind === 'gait' || s.kind === 'prosthetic_gait');
  const full = proposePlan(gaitSources, CAT, EX, { patientId: S.patientId });
  const haveA = new Set(plan?.actions.map((a) => a.id) ?? []);
  const haveG = new Set(plan?.goals.map((g) => g.id) ?? []);
  S.proposal = {
    ...full,
    actions: full.actions.filter((a) => !haveA.has(a.id)),
    goals: full.goals.filter((g) => !haveG.has(g.id)),
  };
  for (const id of [...S.checkedA]) if (!S.proposal.actions.some((a) => a.id === id)) S.checkedA.delete(id);
  for (const id of [...S.checkedG]) if (!S.proposal.goals.some((g) => g.id === id)) S.checkedG.delete(id);
}

// ------------------------------------------------------------------------------------------------ Rendu clinicien

function actionLabel(a: TreatmentAction): string {
  if (a.kind === 'exercise' && a.exerciseId) return exName(a.exerciseId, a.label);
  return a.label;
}

function metaChips(a: TreatmentAction): string {
  const finding = a.fromFindingId ? CAT.findings[a.fromFindingId]?.name_fr : undefined;
  return [
    chip(t(`kind_${a.kind}`), `k-${a.kind}`),
    a.side ? chip(`${t('side')} ${sideName(a.side)}`) : '',
    finding ? chip(`${t('defect')} : ${finding}`) : '',
    a.determinantId ? chip(`${t('determinant')} : ${CAT.determinantNames[a.determinantId]}`) : '',
    a.audience === 'clinician' ? chip(t('clinicianOnly'), 'warn') : '',
    a.libraryGap ? chip(t('libraryGap'), 'warn') : '',
    a.clinicianEdited && a.origin === 'suggested' ? chip(t('edited')) : '',
    a.origin === 'manual' ? chip(t('manual')) : '',
    a.unvalidatedThreshold ? chip(t('unvalidatedThreshold'), 'soft') : '',
    a.condition ? chip(`${t('condition')} : ${a.condition}`, 'soft') : '',
  ].join('');
}

function suggestionRow(a: TreatmentAction, checked: boolean): string {
  return `<li class="tx-sug"><label class="tx-check"><input type="checkbox" data-sa="${esc(a.id)}" ${checked ? 'checked' : ''}>
    <span class="tx-sug-body"><b>${esc(actionLabel(a))}</b>
    <span class="tx-chips">${metaChips(a)}${a.priority ? chip(t(`prio_${a.priority}`), `p-${a.priority}`) : ''}</span>
    ${a.rationale ? `<small class="muted">${esc(a.rationale)}</small>` : ''}
    ${refsHtml(a.refs)}</span></label></li>`;
}

function goalRow(g: TreatmentGoal, checked: boolean | null): string {
  const check =
    checked === null
      ? ''
      : `<input type="checkbox" data-sg="${esc(g.id)}" ${checked ? 'checked' : ''} aria-label="${esc(g.label)}">`;
  const finding = g.fromFindingId ? CAT.findings[g.fromFindingId]?.name_fr : undefined;
  return `<li class="tx-sug"><label class="tx-check">${check}<span class="tx-sug-body"><b>${esc(g.label)}</b>
    <span class="tx-chips">${chip(`${g.metricId} ${g.comparator} ${num(g.target)} ${g.unit}`, 'mono')}
    ${finding ? chip(`${t('defect')} : ${finding}`) : ''}
    ${g.determinantId ? chip(`${t('determinant')} : ${CAT.determinantNames[g.determinantId]}`) : ''}
    ${g.thresholdType === 'proposed_heuristic' || g.thresholdType === 'to_verify' ? chip(t('unvalidatedThreshold'), 'soft') : ''}</span>
    ${g.note ? `<small class="muted">${esc(g.note)}</small>` : ''}${refsHtml(g.refs)}</span></label></li>`;
}

function suggestionsCard(S: State, plan: TreatmentPlan): string {
  const p = S.proposal;
  if (!p || !isEditable(plan)) return '';
  const sources = S.sources.filter((s) => s.kind === 'gait' || s.kind === 'prosthetic_gait').length;
  if (!sources)
    return `<section class="card tx-card"><h2>${t('suggestions')}</h2><p class="muted">${t('noAssessment')} <a href="#/marche/${esc(S.patientId)}">${t('newCapture')}</a></p></section>`;
  const unmapped = p.unmapped.length
    ? `<p class="small muted">${t('unmapped')} : ${p.unmapped.map((id) => esc(CAT.findings[id]?.name_fr ?? id)).join(', ')}</p>`
    : '';
  return `<section class="card tx-card" aria-labelledby="tx-sug-h"><h2 id="tx-sug-h">${t('suggestions')}</h2>
    <p class="tx-notice" role="note">${icon('shield', 16)} ${esc(SUGGESTION_NOTICE)}</p>
    ${
      p.actions.length
        ? `<ul class="tx-list">${p.actions.map((a) => suggestionRow(a, S.checkedA.has(a.id))).join('')}</ul>
      <div class="row wrap tx-btns"><button class="btn sm" data-act="add-sel">${icon('plus', 16)} ${t('addSelected')}</button>
      <button class="btn sm ghost" data-act="sel-ex">${t('selectExercises')}</button>
      <button class="btn sm ghost" data-act="sel-none">${t('selectNone')}</button></div>`
        : `<p class="muted">${t('noSuggestions')}</p>`
    }
    ${
      p.goals.length
        ? `<h3>${t('suggestedGoals')}</h3><ul class="tx-list">${p.goals.map((g) => goalRow(g, S.checkedG.has(g.id))).join('')}</ul>
      <div class="row wrap tx-btns"><button class="btn sm" data-act="add-goals">${icon('plus', 16)} ${t('addSelectedGoals')}</button></div>`
        : ''
    }${unmapped}</section>`;
}

function actionRow(a: TreatmentAction, editable: boolean, patientId: string): string {
  const lib = a.kind === 'exercise' && a.exerciseId;
  return `<li class="tx-act" data-aid="${esc(a.id)}"><div class="tx-act-head"><b>${esc(actionLabel(a))}</b>
    ${editable ? `<button class="icon-btn" data-act="rm" aria-label="${t('remove')}">${icon('close', 18)}</button>` : ''}</div>
    <div class="tx-chips">${metaChips(a)}</div>
    ${a.rationale ? `<small class="muted">${esc(a.rationale)}</small>` : ''}${refsHtml(a.refs)}
    ${
      editable
        ? `<div class="tx-fields"><label><span>${t('detail')}</span><input class="input" data-f="detail" value="${esc(a.detail ?? '')}" placeholder="${t('detailPh')}"></label>
      <label><span>${t('weeks')}</span><input class="input" type="number" inputmode="numeric" min="1" max="104" data-f="weeks" value="${a.durationWeeks ?? ''}"></label></div>`
        : `${a.detail ? `<p class="small">${esc(a.detail)}</p>` : ''}${a.durationWeeks ? `<p class="small">${a.durationWeeks} ${t('weeksShort')}</p>` : ''}`
    }
    ${lib ? `<a class="link small" href="#/ex/${esc(a.exerciseId ?? '')}">${t('seeExercise')}</a>` : ''}
    ${a.deviceKind ? `<a class="link small" href="#/aides/${esc(patientId)}">${t('openCalculator')}</a>` : ''}</li>`;
}

const KINDS: readonly TreatmentAction['kind'][] = [
  'exercise',
  'gait_training',
  'assistive_device',
  'orthosis',
  'prosthetic_adjustment',
  'referral',
  'injection_evaluation',
  'other',
];

function actionsCard(S: State, plan: TreatmentPlan): string {
  const editable = isEditable(plan);
  const groups = KINDS.map((k) => ({ k, list: plan.actions.filter((a) => a.kind === k) })).filter((g) => g.list.length);
  const exOptions = Object.entries(EX)
    .sort((a, b) => a[1].name[lang()].localeCompare(b[1].name[lang()], lang()))
    .map(([id, e]) => `<option value="${esc(id)}">${esc(e.name[lang()])}</option>`)
    .join('');
  const add = editable
    ? `<details class="tx-add"><summary>${icon('plus', 16)} ${t('addAction')}</summary>
      <div class="tx-fields">
        <label><span>${t('kind')}</span><select class="input" id="tx-new-kind">${KINDS.map((k) => `<option value="${k}">${t(`kind_${k}`)}</option>`).join('')}</select></label>
        <label id="tx-new-ex-wrap"><span>${t('exerciseLib')}</span><select class="input" id="tx-new-ex">${exOptions}</select></label>
        <label id="tx-new-dev-wrap" hidden><span>${t('device')}</span><select class="input" id="tx-new-dev">${DEVICE_KINDS.map((d) => `<option value="${d}">${esc(DEVICE_LABEL[d][lang()])}</option>`).join('')}</select></label>
        <label id="tx-new-label-wrap" hidden><span>${t('label')}</span><input class="input" id="tx-new-label"></label>
        <label><span>${t('side')}</span><select class="input" id="tx-new-side"><option value="">${t('sideNone')}</option><option value="L">${t('side_L')}</option><option value="R">${t('side_R')}</option></select></label>
        <label><span>${t('detail')}</span><input class="input" id="tx-new-detail" placeholder="${t('detailPh')}"></label>
      </div><button class="btn sm" data-act="add-manual">${t('add')}</button></details>`
    : '';
  return `<section class="card tx-card" aria-labelledby="tx-act-h"><h2 id="tx-act-h">${t('planActions')} (${plan.actions.length})</h2>
    ${
      groups.length
        ? groups
            .map(
              (g) =>
                `<h3>${t(`kind_${g.k}`)}</h3><ul class="tx-list">${g.list.map((a) => actionRow(a, editable, S.patientId)).join('')}</ul>`,
            )
            .join('')
        : `<p class="muted">${t('noActions')}</p>`
    }${add}</section>`;
}

function goalsCard(plan: TreatmentPlan): string {
  const editable = isEditable(plan);
  const rows = plan.goals
    .map(
      (g) =>
        `<li class="tx-goal" data-gid="${esc(g.id)}">${goalRow(g, null)}${
          editable
            ? `<button class="icon-btn" data-act="rm-goal" aria-label="${t('remove')}">${icon('close', 18)}</button>`
            : ''
        }</li>`,
    )
    .join('');
  const add = editable
    ? `<details class="tx-add"><summary>${icon('plus', 16)} ${t('addGoal')}</summary><div class="tx-fields">
      <label><span>${t('metric')}</span><select class="input" id="tx-g-metric">${METRICS.map((m) => `<option value="${m.id}">${esc(m.label)} (${m.unit})</option>`).join('')}</select></label>
      <label><span>${t('side')}</span><select class="input" id="tx-g-side"><option value="">${t('sideNone')}</option><option value="L">${t('side_L')}</option><option value="R">${t('side_R')}</option></select></label>
      <label><span>${t('comparator')}</span><select class="input" id="tx-g-cmp"><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option></select></label>
      <label><span>${t('target')}</span><input class="input" id="tx-g-target" type="number" step="any" inputmode="decimal"></label>
      <label><span>${t('dueDate')}</span><input class="input" id="tx-g-due" type="date"></label></div>
      <button class="btn sm" data-act="add-goal">${t('add')}</button></details>`
    : '';
  return `<section class="card tx-card" aria-labelledby="tx-goal-h"><h2 id="tx-goal-h">${t('goals')} (${plan.goals.length})</h2>
    ${rows ? `<ul class="tx-list">${rows}</ul>` : `<p class="muted">${t('noGoals')}</p>`}${add}</section>`;
}

function statusChip(p: GoalProgress): string {
  const cls: Record<GoalProgress['status'], string> = {
    achieved: 'pos',
    in_progress: 'info',
    not_achieved: 'neg',
    no_data: 'soft',
  };
  return chip(t(`goal_${p.status}`), cls[p.status]);
}

function trackingCard(S: State, plan: TreatmentPlan): string {
  const goals = plan.goals.filter((g) => g.validated);
  if (!goals.length) return '';
  const tracked = trackGoals(goals, S.sources, plan.startedAt);
  const rows = goals
    .map((g, i) => {
      const p = tracked[i]!;
      const unit = g.unit;
      const series = p.points
        .map(
          (x) =>
            `<li><span>${esc(dateFr(x.performedAt))}</span><b class="tnum">${num(x.value)} ${esc(unit)}</b>${x.estimate ? ` <small class="muted">${t('estimate')}</small>` : ''}</li>`,
        )
        .join('');
      const margin =
        p.error !== null
          ? `<small class="muted">${t('errorMargin')} ± ${num(p.error)} ${esc(unit)}${p.errorSource ? ` (${esc(p.errorSource)})` : ''}</small>`
          : '';
      const summary =
        p.latest === null
          ? ''
          : `<p class="small">${t('latest')} <b class="tnum">${num(p.latest)} ${esc(unit)}</b> · ${t('goalWord')} ${esc(g.comparator)} ${num(g.target)} ${esc(unit)}${
              p.improvement !== null && p.points.length > 1
                ? ` · ${t('change')} <b class="tnum">${p.improvement >= 0 ? '+' : ''}${num(p.improvement)} ${esc(unit)}</b>`
                : ''
            }</p>`;
      return `<li class="tx-track"><div class="tx-act-head"><b>${esc(g.label)}</b>${statusChip(p)}</div>
        ${p.withinError && p.status !== 'no_data' ? `<p class="tx-notice small">${t('withinError')}</p>` : ''}${summary}${margin}
        ${series ? `<ol class="tx-series">${series}</ol>` : `<p class="small muted">${t('noMeasure')}</p>`}</li>`;
    })
    .join('');
  return `<section class="card tx-card" aria-labelledby="tx-trk-h"><h2 id="tx-trk-h">${t('tracking')}</h2>
    <p class="small muted">${t('trackingHint')}</p><ul class="tx-list">${rows}</ul></section>`;
}

function rxCard(S: State, plan: TreatmentPlan): string {
  const pre = prefillOf(plan);
  const paths = pathologiesOf(pre.region);
  const progOpts = S.programs
    .map(
      (p) =>
        `<option value="${esc(p.ref)}" ${plan.rxCode === p.ref ? 'selected' : ''}>${esc(p.label)} (${esc(p.ref)})</option>`,
    )
    .join('');
  return `<section class="card tx-card" aria-labelledby="tx-rx-h"><h2 id="tx-rx-h">${t('rxTitle')}</h2>
    <p class="small">${pre.ids.length ? t('rxCount', { n: pre.ids.length }) : t('rxNone')}</p>
    ${pre.skippedGaps.length ? `<p class="small muted">${t('rxGaps')} : ${pre.skippedGaps.map(esc).join(' ; ')}</p>` : ''}
    <label class="field"><span>${t('rxExisting')}</span><select class="input" id="tx-rx-ref"><option value="">${t('rxNew')}</option>${progOpts}</select></label>
    ${
      paths.length
        ? `<label class="field"><span>${t('rxPathology')}</span><select class="input" id="tx-rx-path"><option value="">${t('rxPathologyNone')}</option>${paths
            .map(
              (p) => `<option value="${esc(p.id)}" ${S.rxPathology === p.id ? 'selected' : ''}>${esc(p.name)}</option>`,
            )
            .join('')}</select><small class="muted">${t('rxPathologyHint')}</small></label>`
        : ''
    }
    <button class="btn" data-act="open-rx" ${pre.ids.length ? '' : 'disabled'}>${icon('stetho', 18)} ${t('rxButton')}</button>
    ${plan.rxCode ? `<p class="small muted">${t('rxLinked')} : <b class="tnum">${esc(plan.rxCode)}</b></p>` : ''}</section>`;
}

function headerCard(S: State, plan: TreatmentPlan | undefined): string {
  const name = S.patient?.displayName || S.patientId;
  const sel = S.plans.length
    ? `<label class="field tx-rev"><span>${t('versions')}</span><select class="input" id="tx-rev">${S.plans
        .slice()
        .reverse()
        .map(
          (p) =>
            `<option value="${esc(p.id)}" ${plan?.id === p.id ? 'selected' : ''}>${t('revision')} ${p.revision} — ${t(`status_${p.status}`)} (${esc(dateFr(p.updatedAt))})</option>`,
        )
        .join('')}</select></label>`
    : '';
  if (!plan)
    return `<section class="card tx-card"><h2>${esc(name)}</h2><p class="muted">${t('noPlan')}</p>
      <button class="btn" data-act="create">${icon('plus', 18)} ${t('createPlan')}</button></section>`;
  const editable = isEditable(plan);
  return `<section class="card tx-card"><div class="tx-act-head"><h2>${esc(name)}</h2>${chip(t(`status_${plan.status}`), `st-${plan.status}`)}</div>
    ${sel}
    <div class="tx-fields">
      <label><span>${t('duration')}</span><input class="input" id="tx-dur" type="number" inputmode="numeric" min="1" max="104" value="${plan.durationWeeks ?? ''}" ${editable ? '' : 'disabled'}></label>
    </div>
    <label class="field"><span>${t('notes')}</span><textarea class="input" id="tx-notes" ${editable ? '' : 'disabled'}>${esc(plan.notes ?? '')}</textarea></label>
    <div class="row wrap tx-btns">
      ${plan.status === 'draft' ? `<button class="btn" data-act="activate" ${canActivate(plan) ? '' : 'disabled'}>${t('activate')}</button>` : ''}
      ${plan.status !== 'closed' ? `<button class="btn ghost" data-act="close">${t('closePlan')}</button>` : ''}
      <button class="btn ghost" data-act="revise">${t('newRevision')}</button>
      <button class="btn ghost" data-act="preview">${icon('eye', 16)} ${t('patientPreview')}</button>
    </div>
    ${plan.status === 'draft' && !canActivate(plan) ? `<p class="small muted">${t('activateHint')}</p>` : ''}
    ${plan.startedAt ? `<p class="small muted">${t('startedAt')} ${esc(dateFr(plan.startedAt))}</p>` : ''}</section>`;
}

function shell(inner: string, title: string, back: string): string {
  return `<section class="screen tx"><div class="topbar"><button class="icon-btn" data-go="${esc(back)}" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(title)}</h1></div>
    <div class="tx-banner" role="note">${icon('shield', 18)} <span>${esc(BANNER)}</span></div>${inner}</section>`;
}

function clinicianHtml(S: State): string {
  const plan = current(S);
  if (S.preview && plan) return patientHtml(plan, S.patientId, true);
  return shell(
    `${headerCard(S, plan)}${
      plan
        ? `${suggestionsCard(S, plan)}${actionsCard(S, plan)}${goalsCard(plan)}${trackingCard(S, plan)}${rxCard(S, plan)}
      <p class="small muted"><a href="#/aides/${esc(S.patientId)}">${t('openCalculator')}</a> · <a href="#/marche/${esc(S.patientId)}">${t('newCapture')}</a></p>`
        : ''
    }`,
    t('title'),
    `#/patient/${S.patientId}`,
  );
}

// ------------------------------------------------------------------------------------------------ Vue patient

function patientHtml(plan: TreatmentPlan | undefined, patientId: string, preview = false): string {
  const items = patientView(plan);
  const rows = items
    .map((a) => {
      const isEx = a.kind === 'exercise';
      const title = isEx
        ? exName(a.exerciseId, a.label)
        : a.deviceKind
          ? DEVICE_LABEL[a.deviceKind as DeviceKind][lang()]
          : a.label;
      return `<li class="tx-act"><div class="tx-act-head"><b>${esc(title)}</b>${chip(t(isEx ? 'kind_exercise' : 'kind_assistive_device'), `k-${a.kind}`)}</div>
        ${a.side ? `<p class="small">${t('side')} ${sideName(a.side)}</p>` : ''}${a.detail ? `<p class="small">${esc(a.detail)}</p>` : ''}
        ${isEx && a.exerciseId ? `<a class="btn sm ghost" href="#/ex/${esc(a.exerciseId)}">${t('seeExercise')}</a>` : ''}
        ${!isEx ? `<a class="btn sm ghost" href="#/aides/${esc(patientId)}">${t('checkDevice')}</a>` : ''}</li>`;
    })
    .join('');
  return shell(
    `${preview ? `<div class="card tx-card"><p class="small">${t('previewNote')}</p><button class="btn sm ghost" data-act="preview">${t('backToEditor')}</button></div>` : ''}
    <section class="card tx-card"><h2>${t('myPlan')}</h2>${
      rows ? `<ul class="tx-list">${rows}</ul>` : `<p class="muted">${t('noActivePlan')}</p>`
    }${plan?.durationWeeks && rows ? `<p class="small muted">${t('planDuration', { n: plan.durationWeeks })}</p>` : ''}</section>`,
    t('myPlan'),
    '#/home',
  );
}

// ------------------------------------------------------------------------------------------------ Contrôleur

async function persist(S: State, plan: TreatmentPlan, others: readonly TreatmentPlan[] = []): Promise<void> {
  for (const p of [plan, ...others]) await savePlan(p);
  const ids = new Set([plan.id, ...others.map((o) => o.id)]);
  S.plans = [...S.plans.filter((p) => !ids.has(p.id)), plan, ...others].sort((a, b) => a.revision - b.revision);
  S.planId = plan.id;
}

function patientChooser(list: readonly Patient[], route: string): string {
  const rows = list
    .map(
      (p) =>
        `<li><a class="btn ghost tx-pick" href="#/${route}/${esc(p.id)}">${esc(p.displayName || p.researchId || p.id)}</a></li>`,
    )
    .join('');
  return shell(
    rows
      ? `<section class="card tx-card"><h2>${t('choosePatient')}</h2><ul class="tx-list">${rows}</ul></section>`
      : `<section class="card tx-card"><p class="muted">${t('noPatients')}</p></section>`,
    t('title'),
    '#/clinic',
  );
}

export async function renderPlan(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const root = ctx.root as unknown as HTMLElement | (() => HTMLElement);
  const el = (): HTMLElement => (typeof root === 'function' ? root() : root);
  const role = profile()?.role;
  const isClinician = role === 'clinician';
  const patientId = ctx.arg || (isClinician ? '' : selfPatientId());
  if (!patientId) {
    el().innerHTML = patientChooser(await listPatients(), 'plan');
    return;
  }
  el().innerHTML = shell(`<div class="card muted">${t('loading')}</div>`, t('title'), '#/home');
  const [patient, assessments, plans, programs] = await Promise.all([
    loadPatient(patientId),
    loadAssessments(patientId),
    loadPlans(patientId),
    isClinician ? listPrograms() : Promise.resolve([]),
  ]);
  const S: State = {
    patientId,
    patient,
    assessments,
    sources: assessments.map(planSourceOf),
    plans,
    planId: null,
    proposal: null,
    checkedA: new Set(),
    checkedG: new Set(),
    programs,
    preview: false,
    rxPathology: '',
  };
  if (!isClinician) {
    el().innerHTML = patientHtml(currentPlan(plans), patientId);
    return;
  }
  recompute(S);
  const draw = (): void => {
    recompute(S);
    el().innerHTML = clinicianHtml(S);
  };
  const uid = currentUid();
  const mutate = async (fn: (p: TreatmentPlan) => TreatmentPlan, redraw = true): Promise<void> => {
    const p = current(S);
    if (!p) return;
    const next = fn(p);
    if (next === p) return;
    try {
      await persist(S, next);
    } catch (e) {
      console.warn(e);
      toast(t('saveError'));
      return;
    }
    if (redraw) draw();
  };
  const scrollKeep = (fn: () => void): void => {
    const y = window.scrollY;
    fn();
    window.scrollTo(0, y);
  };

  const onClick = async (ev: Event): Promise<void> => {
    const target = ev.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-act]');
    if (!btn) return;
    const act = btn.dataset['act'];
    const now = new Date();
    const plan = current(S);
    switch (act) {
      case 'create': {
        const p = newPlan({ patientId, ownerUid: uid, now, revision: (S.plans.at(-1)?.revision ?? 0) + 1 });
        await persist(S, p);
        scrollKeep(draw);
        break;
      }
      case 'sel-none':
        S.checkedA.clear();
        scrollKeep(draw);
        break;
      case 'sel-ex':
        for (const a of S.proposal?.actions ?? []) if (a.kind === 'exercise' && !a.libraryGap) S.checkedA.add(a.id);
        scrollKeep(draw);
        break;
      case 'add-sel': {
        const picked = (S.proposal?.actions ?? []).filter((a) => S.checkedA.has(a.id));
        if (!picked.length) return void toast(t('nothingSelected'));
        S.checkedA.clear();
        await mutate((p) => acceptActions(p, picked, now));
        break;
      }
      case 'add-goals': {
        const picked = (S.proposal?.goals ?? []).filter((g) => S.checkedG.has(g.id));
        if (!picked.length) return void toast(t('nothingSelected'));
        S.checkedG.clear();
        await mutate((p) => acceptGoals(p, picked, now));
        break;
      }
      case 'rm': {
        const id = btn.closest<HTMLElement>('[data-aid]')?.dataset['aid'];
        if (id) await mutate((p) => removeAction(p, id, now));
        break;
      }
      case 'rm-goal': {
        const id = btn.closest<HTMLElement>('[data-gid]')?.dataset['gid'];
        if (id) await mutate((p) => removeGoal(p, id, now));
        break;
      }
      case 'add-manual': {
        const q = <T extends HTMLElement>(sel: string): T => el().querySelector<T>(sel)!;
        const kind = q<HTMLSelectElement>('#tx-new-kind').value as TreatmentAction['kind'];
        const side = q<HTMLSelectElement>('#tx-new-side').value as Side | '';
        const detail = q<HTMLInputElement>('#tx-new-detail').value.trim();
        let label = q<HTMLInputElement>('#tx-new-label').value.trim();
        const exerciseId = kind === 'exercise' ? q<HTMLSelectElement>('#tx-new-ex').value : undefined;
        const deviceKind =
          kind === 'assistive_device' ? (q<HTMLSelectElement>('#tx-new-dev').value as DeviceKind) : undefined;
        if (exerciseId) label = exName(exerciseId, exerciseId);
        else if (deviceKind) label = DEVICE_LABEL[deviceKind].fr;
        if (!label) return void toast(t('labelRequired'));
        await mutate((p) =>
          addManualAction(
            p,
            {
              kind,
              label,
              ...(exerciseId ? { exerciseId } : {}),
              ...(deviceKind ? { deviceKind } : {}),
              ...(side ? { side } : {}),
              ...(detail ? { detail } : {}),
            },
            now,
          ),
        );
        break;
      }
      case 'add-goal': {
        const q = <T extends HTMLElement>(sel: string): T => el().querySelector<T>(sel)!;
        const m = METRICS.find((x) => x.id === q<HTMLSelectElement>('#tx-g-metric').value);
        const target = Number(q<HTMLInputElement>('#tx-g-target').value);
        if (!m || q<HTMLInputElement>('#tx-g-target').value === '' || !Number.isFinite(target))
          return void toast(t('targetRequired'));
        const side = q<HTMLSelectElement>('#tx-g-side').value as Side | '';
        const due = q<HTMLInputElement>('#tx-g-due').value;
        const cmp = q<HTMLSelectElement>('#tx-g-cmp').value as TreatmentGoal['comparator'];
        await mutate((p) =>
          addGoal(
            p,
            {
              metricId: m.id,
              comparator: cmp,
              target,
              unit: m.unit,
              label: `${m.label} ${cmp} ${num(target)} ${m.unit}${side && m.sided ? ` (${sideName(side)})` : ''}`,
              ...(side && m.sided ? { side } : {}),
              ...(due ? { dueDate: due as IsoDate } : {}),
            },
            now,
          ),
        );
        break;
      }
      case 'activate': {
        if (!plan || !canActivate(plan)) return;
        const act2 = activate(plan, now);
        await persist(S, act2, supersede(act2, S.plans, now));
        scrollKeep(draw);
        break;
      }
      case 'close':
        await mutate((p) => close(p, now));
        break;
      case 'revise': {
        if (!plan) return;
        await persist(S, revise(plan, uid, now));
        scrollKeep(draw);
        break;
      }
      case 'preview':
        S.preview = !S.preview;
        scrollKeep(draw);
        break;
      case 'open-rx': {
        if (!plan) return;
        const ref = (el().querySelector<HTMLSelectElement>('#tx-rx-ref')?.value ?? '') || undefined;
        const path = el().querySelector<HTMLSelectElement>('#tx-rx-path')?.value || undefined;
        if (ref && plan.rxCode !== ref)
          await mutate((p) => ({ ...p, rxCode: ref, updatedAt: now.toISOString() as typeof p.updatedAt }), false);
        const ok = await openRxEditor(current(S) ?? plan, { rxRef: ref, pathology: path });
        if (!ok) toast(t('rxFailed'));
        break;
      }
      default:
    }
  };

  const onChange = async (ev: Event): Promise<void> => {
    const el0 = ev.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const now = new Date();
    if (el0.dataset['sa']) {
      const id = el0.dataset['sa'];
      if ((el0 as HTMLInputElement).checked) S.checkedA.add(id);
      else S.checkedA.delete(id);
      return;
    }
    if (el0.dataset['sg']) {
      const id = el0.dataset['sg'];
      if ((el0 as HTMLInputElement).checked) S.checkedG.add(id);
      else S.checkedG.delete(id);
      return;
    }
    if (el0.id === 'tx-rev') {
      S.planId = el0.value;
      S.checkedA.clear();
      draw();
      return;
    }
    if (el0.id === 'tx-new-kind') {
      const k = el0.value;
      el().querySelector<HTMLElement>('#tx-new-ex-wrap')!.hidden = k !== 'exercise';
      el().querySelector<HTMLElement>('#tx-new-dev-wrap')!.hidden = k !== 'assistive_device';
      el().querySelector<HTMLElement>('#tx-new-label-wrap')!.hidden = k === 'exercise' || k === 'assistive_device';
      return;
    }
    if (el0.id === 'tx-rx-path') {
      S.rxPathology = el0.value;
      return;
    }
    if (el0.id === 'tx-dur') {
      const v = Number(el0.value);
      await mutate((p) => setDuration(p, Number.isFinite(v) && v > 0 ? v : undefined, now), false);
      return;
    }
    if (el0.id === 'tx-notes') {
      await mutate((p) => setNotes(p, el0.value, now), false);
      return;
    }
    const row = el0.closest<HTMLElement>('[data-aid]');
    if (row && el0.dataset['f']) {
      const id = row.dataset['aid']!;
      if (el0.dataset['f'] === 'detail')
        await mutate((p) => editAction(p, id, { detail: el0.value.trim() }, now), false);
      if (el0.dataset['f'] === 'weeks') {
        const v = Number(el0.value);
        await mutate(
          (p) => editAction(p, id, { durationWeeks: Number.isFinite(v) && v > 0 ? Math.round(v) : 0 }, now),
          false,
        );
      }
    }
  };

  const host = el();
  host.onclick = (e) => void onClick(e);
  host.onchange = (e) => void onChange(e);
  ctx.cleanup.push(() => {
    host.onclick = null;
    host.onchange = null;
  });
  draw();
}
