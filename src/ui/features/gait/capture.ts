/**
 * Volet « marche » — assistant de capture `#/marche/<patientId>[/<évaluationDeRéférence>]`.
 * Étape 1 : formulaire (taille OBLIGATOIRE, côté atteint, aide technique, chaussures ou prothèse, vitesse, consigne,
 * cycles visés). Étape 2 : choix des vues (les trois recommandées). Étape 3 : pour chaque vue, la superposition de
 * capture (camera.ts). Ensuite : analyse (analysis.ts), enregistrement dans `assessments` puis ouverture des résultats ;
 * en mode « refaire après une modification », ouverture de la comparaison A/B avec la mesure de référence.
 */
import type { GaitView } from '../../../domains/gait/index.ts';
import { getActiveMeasures } from '../../../domains/research/active-measures.ts';
import type { Assessment, MeasureDefinition, Patient, PatientId } from '../../../core/types/clinical.ts';
import { getRecordsDb } from '../../../services/db/records.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { go } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import { analyzeCapture } from './analysis.ts';
import { openCaptureOverlay, type FinishedView, type OverlayHandle } from './camera.ts';
import {
  ASSISTIVE_DEVICES,
  AMPUTATION_LEVELS,
  MAX_TARGET_CYCLES,
  MIN_TARGET_CYCLES,
  VIEW_ORDER,
  buildAssessmentDoc,
  defaultsFromPatient,
  formFromAssessment,
  orderViews,
  patientInput,
  recommendedViews,
  validateForm,
  parseCaptureArgs,
  fromCoreView,
  type CaptureFormState,
  type CaptureSettings,
  type FormErrors,
} from './model.ts';
import { currentUid, loadAssessment, loadPatient, newId, nowIso, saveAssessment } from './store.ts';
import { banner, ensureCss, errorCard, spinner, t } from './ui.ts';

type Step = 'form' | 'views';

const opt = (value: string, label: string, cur: string): string =>
  `<option value="${esc(value)}"${value === cur ? ' selected' : ''}>${esc(label)}</option>`;

export async function renderCapture(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const root = ctx.root;
  const { patientId, baselineId, study } = parseCaptureArgs(ctx.arg, ctx.arg2);
  root.innerHTML = spinner(t('loading'));
  let patient: Patient | null = null;
  let baseline: Assessment | null = null;
  let measures: MeasureDefinition[] = [];
  try {
    patient = patientId ? await loadPatient(patientId) : null;
    baseline = baselineId ? await loadAssessment(baselineId) : null;
    if (patient) measures = await getActiveMeasures(getRecordsDb(), patientId as PatientId).catch(() => []);
  } catch (e) {
    console.error(e);
  }
  if (!location.hash.startsWith('#/marche/')) return; // l'utilisateur est déjà parti
  if (!patient) {
    root.innerHTML = errorCard(t('cap_title'), t('cap_noPatient'));
    return;
  }
  if (baselineId && (!baseline || baseline.patientId !== patientId)) {
    root.innerHTML = errorCard(t('cap_title'), t('cap_noBaseline'), `#/patient/${patientId}`);
    return;
  }
  const redo = !!baseline;
  const base = defaultsFromPatient(patient);
  const F: CaptureFormState = baseline ? formFromAssessment(baseline, base) : base;
  let step: Step = 'form';
  let errors: FormErrors = {};
  let settings: CaptureSettings | null = null;
  let views: GaitView[] = baseline?.views?.length
    ? orderViews(baseline.views.map(fromCoreView))
    : recommendedViews({
        affectedSide: F.affectedSide,
        ...(F.prostheticMode && F.prosthesisLevel && F.prosthesisSide
          ? { prosthesis: { level: F.prosthesisLevel, side: F.prosthesisSide } }
          : {}),
      });
  let overlay: OverlayHandle | null = null;
  const destroyOverlay = (): void => {
    overlay?.destroy();
    overlay = null;
  };
  ctx.cleanup.push(destroyOverlay);

  const err = (k: keyof FormErrors): string =>
    errors[k]
      ? `<small class="gc-err" id="gc-e-${k}" role="alert">${esc(t(`err_${errors[k]}`, { min: MIN_TARGET_CYCLES, max: MAX_TARGET_CYCLES }))}</small>`
      : '';
  const inv = (k: keyof FormErrors): string => (errors[k] ? ` aria-invalid="true" aria-describedby="gc-e-${k}"` : '');

  // ---------------------------------------------------------------- Étape 1 : formulaire
  function formHtml(): string {
    const prost = F.prostheticMode;
    return `<section class="screen gc-screen"><div class="topbar"><button class="icon-btn" data-go="#/patient/${esc(patientId)}" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(redo ? t('cap_redoTitle') : t('cap_title'))}</h1></div>
      ${banner()}
      <ol class="gc-steps" aria-label="${esc(t('cap_steps'))}"><li class="on" aria-current="step">1. ${esc(t('cap_step1'))}</li><li>2. ${esc(t('cap_step2'))}</li><li>3. ${esc(t('cap_step3'))}</li></ol>
      ${redo ? `<div class="card gc-redo" role="note"><p class="small">${esc(t('cap_redoNote'))}</p><label class="field"><span>${esc(t('f_modificationNeeded'))} *</span><textarea class="input" data-f="modificationNote" rows="2" maxlength="500"${inv('modificationNote')} placeholder="${esc(t('f_modificationPh'))}">${esc(F.modificationNote)}</textarea>${err('modificationNote')}</label></div>` : ''}
      <form class="card" data-form novalidate>
        <label class="field"><span>${esc(t('f_heightCm'))} *</span><input class="input" data-f="heightCm" inputmode="decimal" autocomplete="off" value="${esc(F.heightCm)}"${inv('heightCm')} required><small class="muted">${esc(t('f_heightHelp'))}</small>${err('heightCm')}</label>
        <label class="field"><span>${esc(t('f_affected'))}</span><select class="input" data-f="affectedSide"${prost ? ' disabled' : ''}>${(['none', 'L', 'R', 'both'] as const).map((v) => opt(v, t(`aff_${v}`), F.affectedSide)).join('')}</select></label>
        <label class="field"><span>${esc(t('f_device'))}</span><select class="input" data-f="assistiveDevice">${ASSISTIVE_DEVICES.map((v) => opt(v, t(`dev_${v}`), F.assistiveDevice)).join('')}</select></label>
        <label class="row gc-check"><input type="checkbox" data-f="prostheticMode"${prost ? ' checked' : ''}> <span><b>${esc(t('f_prostheticMode'))}</b><br><small class="muted">${esc(t('f_prostheticHelp'))}</small></span></label>
        ${
          prost
            ? `<div class="gc-sub"><label class="field"><span>${esc(t('f_level'))} *</span><select class="input" data-f="prosthesisLevel"${inv('prosthesisLevel')}><option value="">${esc(t('f_choose'))}</option>${AMPUTATION_LEVELS.map((v) => opt(v, t(`lvl_${v}`), F.prosthesisLevel)).join('')}</select>${err('prosthesisLevel')}</label>
               <label class="field"><span>${esc(t('f_prosthesisSide'))} *</span><select class="input" data-f="prosthesisSide"${inv('prosthesisSide')}><option value="">${esc(t('f_choose'))}</option>${opt('L', t('side_left'), F.prosthesisSide)}${opt('R', t('side_right'), F.prosthesisSide)}</select>${err('prosthesisSide')}</label></div>`
            : `<label class="field"><span>${esc(t('f_footwear'))}</span><select class="input" data-f="footwear">${(['shoes', 'barefoot'] as const).map((v) => opt(v, t(`foot_${v}`), F.footwear)).join('')}</select></label>`
        }
        <label class="field"><span>${esc(t('f_speed'))}</span><select class="input" data-f="speed">${(['comfortable', 'fast'] as const).map((v) => opt(v, t(`spd_${v}`), F.speed)).join('')}</select></label>
        <label class="field"><span>${esc(t('f_instruction'))}</span><textarea class="input" data-f="instruction" rows="2" maxlength="500" placeholder="${esc(t('f_instructionPh'))}">${esc(F.instruction)}</textarea></label>
        <label class="field"><span>${esc(t('f_targetCycles'))}</span><input class="input" data-f="targetCycles" inputmode="numeric" value="${esc(F.targetCycles)}"${inv('targetCycles')}><small class="muted">${esc(t('f_targetHelp'))}</small>${err('targetCycles')}</label>
        <button class="btn" type="submit">${esc(t('cap_next'))}</button></form></section>`;
  }

  // ---------------------------------------------------------------- Étape 2 : choix des vues
  function viewsHtml(): string {
    const s = settings as CaptureSettings;
    const rec = recommendedViews(s);
    const items = VIEW_ORDER.map((v) => {
      const recommended = rec.includes(v);
      return `<label class="gc-view card"><input type="checkbox" data-v="${v}"${views.includes(v) ? ' checked' : ''}> <span><b>${esc(t(`view_${v}`))}</b>${recommended ? ` <span class="chip pos">${esc(t('views_recommended'))}</span>` : ''}<br><small class="muted">${esc(t(`viewdesc_${v}`))}</small></span></label>`;
    }).join('');
    return `<section class="screen gc-screen"><div class="topbar"><button class="icon-btn" data-g="back-form" aria-label="${esc(t('back'))}">${icon('back', 20)}</button><h1>${esc(redo ? t('cap_redoTitle') : t('cap_title'))}</h1></div>
      ${banner()}
      <ol class="gc-steps" aria-label="${esc(t('cap_steps'))}"><li>1. ${esc(t('cap_step1'))}</li><li class="on" aria-current="step">2. ${esc(t('cap_step2'))}</li><li>3. ${esc(t('cap_step3'))}</li></ol>
      <p class="small">${esc(t('views_intro'))}</p>
      <div data-g="views">${items}</div>
      <p class="small muted" data-g="views-note" role="status">${esc(views.length >= 3 ? t('views_all') : t('views_fewer'))}</p>
      ${measures.length ? `<p class="small muted">${esc(t('cap_customActive', { n: measures.length }))}</p>` : ''}
      <ul class="small muted gc-prep"><li>${esc(t('cap_prep_fps', { rec: 60, min: 30 }))}</li><li>${esc(t('cap_prep_privacy'))}</li></ul>
      <button class="btn" data-g="start" ${views.length ? '' : 'disabled'}>${icon('cam', 18)} ${esc(t('cap_start'))}</button></section>`;
  }

  function show(): void {
    root.innerHTML = step === 'form' ? formHtml() : viewsHtml();
    wire();
  }

  function wire(): void {
    const form = root.querySelector<HTMLFormElement>('[data-form]');
    // Saisie : mise à jour de l'état sans re-rendre (le focus reste), sauf bascule du mode prothèse.
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-f]').forEach((el) => {
      const key = el.dataset['f'] as keyof CaptureFormState;
      const set = (): void => {
        if (el instanceof HTMLInputElement && el.type === 'checkbox') (F[key] as boolean) = el.checked;
        else (F[key] as string) = el.value;
      };
      el.addEventListener('input', set);
      el.addEventListener('change', () => {
        set();
        if (key === 'prostheticMode') {
          if (F.prostheticMode) {
            F.footwear = 'prosthesis';
            if (F.prosthesisSide === '' && (F.affectedSide === 'L' || F.affectedSide === 'R'))
              F.prosthesisSide = F.affectedSide;
          } else if (F.footwear === 'prosthesis') F.footwear = 'shoes';
          errors = {};
          show();
        }
      });
    });
    if (form)
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = validateForm(F, { requireModificationNote: redo });
        if (!r.ok) {
          errors = r.errors;
          show();
          const first = root.querySelector<HTMLElement>('[aria-invalid="true"]');
          first?.focus();
          return;
        }
        errors = {};
        settings = r.settings;
        views = views.length ? views : recommendedViews(r.settings);
        step = 'views';
        show();
      });
    root.querySelector<HTMLElement>('[data-g="back-form"]')?.addEventListener('click', () => {
      step = 'form';
      show();
    });
    root.querySelectorAll<HTMLInputElement>('[data-v]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const v = cb.dataset['v'] as GaitView;
        views = orderViews(cb.checked ? [...views, v] : views.filter((x) => x !== v));
        const start = root.querySelector<HTMLButtonElement>('[data-g="start"]');
        if (start) start.disabled = views.length === 0;
        const note = root.querySelector<HTMLElement>('[data-g="views-note"]');
        if (note) note.textContent = views.length >= 3 ? t('views_all') : t('views_fewer');
      });
    });
    root.querySelector<HTMLElement>('[data-g="start"]')?.addEventListener('click', () => launch());
  }

  // ---------------------------------------------------------------- Étape 3 : capture, analyse, enregistrement
  function launch(): void {
    if (!settings || !views.length) return;
    const s = settings;
    const pin = patientInput(s, patient, new Date().getFullYear());
    destroyOverlay();
    overlay = openCaptureOverlay({
      views,
      settings: s,
      patient: pin,
      t,
      onExit: () => {
        overlay = null;
        step = 'views';
        show();
      },
      onFinished: (recs) => void finish(recs, s),
    });
  }

  async function finish(recs: FinishedView[], s: CaptureSettings): Promise<void> {
    overlay?.busy(t('cap_analyzing'));
    await new Promise((r) => setTimeout(r, 60)); // laisse le message s'afficher avant le calcul
    try {
      const out = analyzeCapture(recs, s, patient, new Date().getFullYear(), measures);
      const doc = buildAssessmentDoc({
        id: newId(),
        patientId,
        ownerUid: currentUid(),
        nowIso: nowIso(),
        settings: s,
        views: recs.map((r) => r.view),
        assessment: out.assessment,
        ...(out.prosthetic ? { prosthetic: out.prosthetic } : {}),
        customMeasures: out.customMeasures,
        fps: out.fps,
        durationsS: out.durationsS,
        ...(baselineId ? { baselineId } : {}),
        study,
      });
      await saveAssessment(doc);
      destroyOverlay();
      go(redo && baselineId ? `#/marche-ab/${baselineId}/${doc.id}` : `#/marche-res/${doc.id}`);
    } catch (e) {
      console.error(e);
      destroyOverlay();
      toast(e instanceof RangeError ? t('err_height') : t('err_analysis'), 6000);
      step = 'views';
      show();
    }
  }

  show();
}
