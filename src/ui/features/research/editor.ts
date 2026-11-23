// Éditeur de protocole réutilisable : mesures × points dans le temps (× conditions). Utilisé par le constructeur d'étude
// (#/recherche) et par la création d'un suivi post-intervention (#/suivi). Rendu par chaînes HTML + délégation d'événements.
import type { MeasureDefinition, Side, Timepoint } from '../../../core/types/clinical.ts';
import {
  CURVE_PREFIX,
  encodePhase,
  GAIT_CURVE_IDS,
  GAIT_METRIC_OPTIONS,
  PAIN_METRIC_ID,
  PERRY_PHASES,
  SKELETON_BONES,
  SKELETON_POINTS,
  validateMeasure,
} from '../../../domains/research/index.ts';
import { TESTS as ROM_TESTS } from '../../../domains/outcomes/data/romtests.ts';
import { FREE_ORDER, INSTRUMENTS, LICENSED_ORDER } from '../../../domains/outcomes/data/proms.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { bi, describeMeasure, esc, newId, promName, t } from './shared.ts';
import { LANDMARK_LABELS, METRIC_LABELS, PHASE_LABELS } from './strings.ts';

export interface ProtocolDraft {
  measures: MeasureDefinition[];
  timepoints: Timepoint[];
  conditions: string[];
}

type UiKind = 'gait_metric_at_phase' | 'gait_curve' | 'rom' | 'prom' | 'pain' | 'custom_angle';

interface MeasureFormState {
  kind: UiKind;
  metric: string; // métrique du moteur ou 'curve'
  curve: string;
  side: Side;
  atMode: 'phase' | 'pct';
  phase: string;
  pct: number;
  rom: string;
  prom: string;
  picks: number[];
  label: string;
}

const freshForm = (): MeasureFormState => ({
  kind: 'gait_metric_at_phase',
  metric: 'ankle_ic',
  curve: 'ankle_angle',
  side: 'left',
  atMode: 'phase',
  phase: 'MSw',
  pct: 50,
  rom: Object.keys(ROM_TESTS)[0] ?? '',
  prom: 'nprs',
  picks: [],
  label: '',
});

const opt = (v: string, label: string, sel: string): string =>
  `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`;

const sideSelect = (cur: Side, allowNone: boolean): string =>
  `<label class="field"><span>${esc(t('rs_side'))}</span><select class="input" data-f="side">${opt('left', t('rs_left'), cur)}${opt('right', t('rs_right'), cur)}${allowNone ? opt('none', t('rs_sideNone'), cur) : ''}</select></label>`;

const momentFields = (f: MeasureFormState): string =>
  `<fieldset class="rs-fieldset"><legend>${esc(t('rs_phaseOrPct'))}</legend>
    <div class="seg" role="group">${(['phase', 'pct'] as const).map((m) => `<button type="button" data-at="${m}" class="${f.atMode === m ? 'on' : ''}" aria-pressed="${f.atMode === m}">${esc(t(m === 'phase' ? 'rs_usePhase' : 'rs_usePct'))}</button>`).join('')}</div>
    ${
      f.atMode === 'phase'
        ? `<label class="field rs-mt"><span>${esc(t('rs_phase'))}</span><select class="input" data-f="phase">${PERRY_PHASES.map((p) => opt(p, `${p} — ${bi(PHASE_LABELS[p])}`, f.phase)).join('')}</select></label>`
        : `<label class="field rs-mt"><span>${esc(t('rs_atPct'))}</span><input class="input tnum" type="number" min="0" max="100" step="1" data-f="pct" value="${f.pct}"></label>`
    }</fieldset>`;

function skeletonSvg(picks: readonly number[]): string {
  const P = new Map(SKELETON_POINTS.map((p) => [p.index, p]));
  const bones = SKELETON_BONES.map(([a, b]) => {
    const p = P.get(a)!;
    const q = P.get(b)!;
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
  }).join('');
  const sel = picks.length >= 2 ? picks.map((i) => P.get(i)!).filter(Boolean) : [];
  const path =
    sel.length >= 2 ? `<polyline class="rs-sk-sel" points="${sel.map((p) => `${p.x},${p.y}`).join(' ')}"/>` : '';
  const pts = SKELETON_POINTS.map((p) => {
    const k = picks.indexOf(p.index);
    const name = bi(LANDMARK_LABELS[p.key]);
    return `<g class="rs-sk-pt${k >= 0 ? ' on' : ''}" data-lm="${p.index}" role="button" tabindex="0" aria-pressed="${k >= 0}" aria-label="${esc(name)}"><circle class="hit" cx="${p.x}" cy="${p.y}" r="4.6"/><circle cx="${p.x}" cy="${p.y}" r="${k >= 0 ? 2.6 : 1.9}"/>${k >= 0 ? `<text x="${p.x + 3.2}" y="${p.y - 2.4}">${k + 1}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="rs-skeleton" viewBox="0 0 100 100" role="group" aria-label="${esc(t('rs_customHint'))}"><g class="rs-sk-bones">${bones}</g>${path}${pts}</svg>`;
}

function measureFormHtml(f: MeasureFormState): string {
  const kinds: UiKind[] = ['gait_metric_at_phase', 'gait_curve', 'custom_angle', 'rom', 'prom', 'pain'];
  let body = '';
  switch (f.kind) {
    case 'gait_metric_at_phase': {
      const groups = new Map<string, string[]>();
      for (const o of GAIT_METRIC_OPTIONS) {
        const l = groups.get(o.group) ?? [];
        l.push(
          opt(
            o.metricId,
            `${bi(METRIC_LABELS[o.metricId]) || o.metricId}${o.phase ? ` (${o.phase})` : ''} — ${o.unit}`,
            f.metric,
          ),
        );
        groups.set(o.group, l);
      }
      const sided = f.metric === 'curve' || !!GAIT_METRIC_OPTIONS.find((o) => o.metricId === f.metric)?.sided;
      body = `<label class="field"><span>${esc(t('rs_metric'))}</span><select class="input" data-f="metric">${[...groups.entries()].map(([g, os]) => `<optgroup label="${esc(g)}">${os.join('')}</optgroup>`).join('')}<optgroup label="—">${opt('curve', t('rs_curveAtPhase'), f.metric)}</optgroup></select></label>
        ${f.metric === 'curve' ? `<label class="field"><span>${esc(t('rs_curve'))}</span><select class="input" data-f="curve">${GAIT_CURVE_IDS.map((c) => opt(c, bi(METRIC_LABELS[c]), f.curve)).join('')}</select></label>${momentFields(f)}` : ''}
        ${sided ? sideSelect(f.side, false) : ''}`;
      break;
    }
    case 'gait_curve':
      body = `<label class="field"><span>${esc(t('rs_curve'))}</span><select class="input" data-f="curve">${GAIT_CURVE_IDS.map((c) => opt(c, bi(METRIC_LABELS[c]), f.curve)).join('')}</select></label>${sideSelect(f.side, false)}`;
      break;
    case 'custom_angle':
      body = `<p class="small muted">${esc(t('rs_customHint'))}</p>
        <div class="rs-custom">${skeletonSvg(f.picks)}
        <div class="rs-custom-side">${[0, 1, 2].map((k) => `<label class="field"><span>${k + 1}${k === 1 ? ' (sommet / vertex)' : ''}</span><select class="input" data-pick="${k}"><option value="">—</option>${SKELETON_POINTS.map((p) => opt(String(p.index), bi(LANDMARK_LABELS[p.key]), String(f.picks[k] ?? ''))).join('')}</select></label>`).join('')}
        <button type="button" class="btn sm ghost" data-a="picks-reset">${esc(t('rs_customReset'))}</button></div></div>
        ${sideSelect(f.side, false)}${momentFields(f)}
        <p class="small muted">${esc(t('rs_measureAtCapture'))} <span class="chip sm warn">${esc(t('rs_estimate'))}</span></p>`;
      break;
    case 'rom': {
      const sided = !!ROM_TESTS[f.rom]?.sided;
      body = `<label class="field"><span>${esc(t('rs_romTest'))}</span><select class="input" data-f="rom">${Object.values(
        ROM_TESTS,
      )
        .map((x) => opt(x.id, bi(x.name), f.rom))
        .join('')}</select></label>${sided ? sideSelect(f.side, false) : ''}`;
      break;
    }
    case 'prom':
      body = `<label class="field"><span>${esc(t('rs_prom'))}</span><select class="input" data-f="prom">${[
        ...FREE_ORDER,
        ...LICENSED_ORDER,
      ]
        .filter((id) => INSTRUMENTS[id])
        .map((id) => opt(id, promName(id), f.prom))
        .join('')}</select></label>`;
      break;
    case 'pain':
      body = `<p class="small muted">${esc(t('rs_painQ'))}</p>`;
      break;
  }
  return `<div class="rs-mform">
    <label class="field"><span>${esc(t('rs_measureKind'))}</span><select class="input" data-f="kind">${kinds.map((k) => opt(k, t('rs_kind_' + k), f.kind)).join('')}</select></label>
    ${body}
    <label class="field"><span>${esc(t('rs_measureLabel'))}</span><input class="input" data-f="label" value="${esc(f.label)}" placeholder="${esc(autoLabel(f))}"></label>
    <div class="row wrap"><button type="button" class="btn sm" data-a="m-add">${icon('plus', 16)} ${esc(t('rs_add'))}</button><button type="button" class="btn sm ghost" data-a="m-cancel">${esc(t('rs_cancel'))}</button></div></div>`;
}

function toMeasure(f: MeasureFormState): MeasureDefinition {
  const id = newId('m');
  const at = encodePhase(f.atMode === 'phase' ? (f.phase as (typeof PERRY_PHASES)[number]) : f.pct);
  const label = f.label.trim() || autoLabel(f);
  switch (f.kind) {
    case 'gait_metric_at_phase': {
      if (f.metric === 'curve')
        return { id, kind: 'gait_metric_at_phase', label, metricId: CURVE_PREFIX + f.curve, phase: at, side: f.side };
      const o = GAIT_METRIC_OPTIONS.find((x) => x.metricId === f.metric);
      return {
        id,
        kind: 'gait_metric_at_phase',
        label,
        metricId: f.metric,
        ...(o?.phase ? { phase: o.phase } : {}),
        ...(o?.sided ? { side: f.side } : {}),
      };
    }
    case 'gait_curve':
      return { id, kind: 'gait_curve', label, metricId: f.curve, side: f.side };
    case 'custom_angle':
      return {
        id,
        kind: 'custom_angle',
        label,
        landmarks: [f.picks[0] ?? -1, f.picks[1] ?? -1, f.picks[2] ?? -1],
        side: f.side,
        phase: at,
      };
    case 'rom':
      return { id, kind: 'rom', label, metricId: f.rom, ...(ROM_TESTS[f.rom]?.sided ? { side: f.side } : {}) };
    case 'prom':
      return { id, kind: 'prom', label, metricId: f.prom };
    case 'pain':
      return { id, kind: 'pain', label, metricId: PAIN_METRIC_ID };
  }
}

function autoLabel(f: MeasureFormState): string {
  const sd = f.side === 'left' ? ` (${t('rs_sideShortL')})` : f.side === 'right' ? ` (${t('rs_sideShortR')})` : '';
  const at = f.atMode === 'phase' ? bi(PHASE_LABELS[f.phase]) : `${f.pct} %`;
  switch (f.kind) {
    case 'gait_metric_at_phase': {
      if (f.metric === 'curve') return `${bi(METRIC_LABELS[f.curve])} — ${at}${sd}`;
      const o = GAIT_METRIC_OPTIONS.find((x) => x.metricId === f.metric);
      return `${bi(METRIC_LABELS[f.metric]) || f.metric}${o?.sided ? sd : ''}`;
    }
    case 'gait_curve':
      return `${t('rs_curve')} ${bi(METRIC_LABELS[f.curve]).toLowerCase()}${sd}`;
    case 'custom_angle': {
      const names = f.picks.map((i) => bi(LANDMARK_LABELS[SKELETON_POINTS.find((p) => p.index === i)?.key ?? '']));
      return `${t('rs_kind_custom_angle')} ${names.join('–')} — ${at}${sd}`;
    }
    case 'rom':
      return `${bi(ROM_TESTS[f.rom]?.name)}${ROM_TESTS[f.rom]?.sided ? sd : ''}`;
    case 'prom':
      return promName(f.prom);
    case 'pain':
      return t('rs_kind_pain');
  }
}

function measuresListHtml(ms: readonly MeasureDefinition[]): string {
  if (!ms.length) return `<div class="card small muted">${esc(t('rs_noMeasure'))}</div>`;
  return `<ul class="list rs-mlist">${ms
    .map(
      (m, i) =>
        `<li class="rs-mrow"><div class="grow"><b>${esc(m.label)}</b><br><small class="muted">${esc(describeMeasure(m))}${m.kind === 'custom_angle' ? ` · ${esc(t('rs_estimate'))}` : ''}</small></div><button type="button" class="btn sm ghost" data-a="m-del" data-i="${i}" aria-label="${esc(t('rs_remove'))} ${esc(m.label)}">${icon('close', 16)}</button></li>`,
    )
    .join('')}</ul>`;
}

function timepointsHtml(tps: readonly Timepoint[]): string {
  return `<div class="rs-tps">${tps
    .map(
      (tp, i) =>
        `<div class="rs-tp row"><label class="grow"><span class="sr-only">${esc(t('rs_tpLabel'))}</span><input class="input" data-tp-label="${i}" value="${esc(tp.label)}" aria-label="${esc(t('rs_tpLabel'))}"></label><label class="rs-tp-off"><span class="sr-only">${esc(t('rs_tpOffset'))}</span><input class="input tnum" type="number" step="1" data-tp-off="${i}" value="${tp.offsetDays}" aria-label="${esc(t('rs_tpOffset'))}"></label><span class="small muted">${esc(t('rs_days'))}</span><button type="button" class="btn sm ghost" data-a="tp-del" data-i="${i}" aria-label="${esc(t('rs_remove'))} ${esc(tp.label)}">${icon('close', 16)}</button></div>`,
    )
    .join(
      '',
    )}<button type="button" class="btn sm ghost" data-a="tp-add">${icon('plus', 16)} ${esc(t('rs_addTimepoint'))}</button></div>`;
}

function conditionsHtml(cs: readonly string[]): string {
  return `<p class="small muted">${esc(t('rs_conditionsHint'))}</p><div class="row wrap rs-conds">${cs
    .map(
      (c, i) =>
        `<span class="chip">${esc(c)} <button type="button" class="rs-x" data-a="c-del" data-i="${i}" aria-label="${esc(t('rs_remove'))} ${esc(c)}">${icon('close', 12)}</button></span>`,
    )
    .join(
      '',
    )}</div><div class="row rs-mt"><input class="input grow" data-c-new placeholder="${esc(t('rs_addCondition'))}" aria-label="${esc(t('rs_addCondition'))}"><button type="button" class="btn sm ghost" data-a="c-add">${icon('plus', 16)}</button></div>`;
}

/**
 * Monte l'éditeur dans `host` ; `draft` est modifié en place, `onChange` est appelé après chaque modification.
 */
export function mountProtocolEditor(
  host: HTMLElement,
  draft: ProtocolDraft,
  opts: { conditions: boolean; onChange?: () => void },
): void {
  let form: MeasureFormState | null = null;
  const draw = (): void => {
    host.innerHTML = `<h2>${esc(t('rs_measures'))}</h2>${measuresListHtml(draft.measures)}
      <div class="rs-mt">${form ? measureFormHtml(form) : `<button type="button" class="btn sm soft" data-a="m-new">${icon('plus', 16)} ${esc(t('rs_addMeasure'))}</button>`}</div>
      <h2>${esc(t('rs_timepoints'))}</h2>${timepointsHtml(draft.timepoints)}
      ${opts.conditions ? `<h2>${esc(t('rs_conditions'))}</h2>${conditionsHtml(draft.conditions)}` : ''}`;
  };
  const changed = (): void => {
    opts.onChange?.();
    draw();
  };
  draw();
  host.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a],[data-lm],[data-at]');
    if (!el || !host.contains(el)) return;
    const i = Number(el.dataset['i']);
    if (el.dataset['lm'] !== undefined && form) {
      const lm = Number(el.dataset['lm']);
      const k = form.picks.indexOf(lm);
      if (k >= 0) form.picks.splice(k, 1);
      else if (form.picks.length < 3) form.picks.push(lm);
      draw();
      return;
    }
    if (el.dataset['at'] && form) {
      form.atMode = el.dataset['at'] === 'pct' ? 'pct' : 'phase';
      draw();
      return;
    }
    switch (el.dataset['a']) {
      case 'm-new':
        form = freshForm();
        draw();
        break;
      case 'm-cancel':
        form = null;
        draw();
        break;
      case 'picks-reset':
        if (form) form.picks = [];
        draw();
        break;
      case 'm-add': {
        if (!form) return;
        if (form.kind === 'custom_angle' && new Set(form.picks).size !== 3) {
          toast(t('rs_customIncomplete'));
          return;
        }
        const m = toMeasure(form);
        if (validateMeasure(m).length) {
          toast(t('rs_invalidMeasure'));
          return;
        }
        draft.measures.push(m);
        form = null;
        changed();
        break;
      }
      case 'm-del':
        draft.measures.splice(i, 1);
        changed();
        break;
      case 'tp-add': {
        const last = draft.timepoints[draft.timepoints.length - 1];
        const off = last ? last.offsetDays + 14 : 0;
        draft.timepoints.push({ id: newId('tp'), label: off ? `T+${off / 7} sem` : 'T0', offsetDays: off });
        changed();
        break;
      }
      case 'tp-del':
        draft.timepoints.splice(i, 1);
        changed();
        break;
      case 'c-add': {
        const inp = host.querySelector<HTMLInputElement>('[data-c-new]');
        const v = inp?.value.trim();
        if (v && !draft.conditions.includes(v)) {
          draft.conditions.push(v);
          changed();
        }
        break;
      }
      case 'c-del':
        draft.conditions.splice(i, 1);
        changed();
        break;
    }
  });
  host.addEventListener('keydown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-lm]');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  host.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (form && el.dataset['f']) {
      const k = el.dataset['f'];
      if (k === 'kind') {
        const kind = el.value as UiKind;
        form = { ...freshForm(), kind, side: form.side };
      } else if (k === 'pct') form.pct = Math.max(0, Math.min(100, Math.round(Number(el.value) || 0)));
      else if (k === 'side') form.side = el.value as Side;
      else if (k === 'metric' || k === 'curve' || k === 'phase' || k === 'rom' || k === 'prom' || k === 'label')
        form[k] = el.value;
      if (k !== 'label') draw();
      return;
    }
    if (form && el.dataset['pick'] !== undefined) {
      const k = Number(el.dataset['pick']);
      const v = el.value === '' ? undefined : Number(el.value);
      const picks = [form.picks[0], form.picks[1], form.picks[2]];
      picks[k] = v;
      form.picks = picks.filter((x): x is number => x !== undefined);
      draw();
      return;
    }
    if (el.dataset['tpLabel'] !== undefined) {
      const tp = draft.timepoints[Number(el.dataset['tpLabel'])];
      if (tp) draft.timepoints[Number(el.dataset['tpLabel'])] = { ...tp, label: el.value.trim() || tp.label };
      opts.onChange?.();
    }
    if (el.dataset['tpOff'] !== undefined) {
      const idx = Number(el.dataset['tpOff']);
      const tp = draft.timepoints[idx];
      const v = Math.round(Number(el.value));
      if (tp && Number.isFinite(v)) draft.timepoints[idx] = { ...tp, offsetDays: v };
      opts.onChange?.();
    }
  });
  host.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (form && el.dataset['f'] === 'label') form.label = el.value;
  });
}

/** Contrôle avant enregistrement : message d'erreur ou null. */
export function draftProblem(d: ProtocolDraft): string | null {
  if (!d.measures.length) return t('rs_noMeasure');
  if (!d.timepoints.length) return t('rs_noTimepoint');
  return null;
}
