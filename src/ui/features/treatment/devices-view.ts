/**
 * #/aides/<patientId> — calculateur d'aide technique : repères anatomiques (grand trochanter, pli du poignet), côté,
 * séquence de marche, VÉRIFICATION PAR CAMÉRA de l'angle du coude (20–30°) avec consignes vocales, conseils
 * d'ajustement (monter / descendre de n crans) et enregistrement dans le dossier (évaluation « custom » + action de plan).
 * Pas de formule par la taille. L'image de la caméra n'est ni enregistrée ni envoyée : seul l'angle l'est.
 */
import { getLang } from '../../../../www/js/i18n.js';
import type { Patient } from '../../../core/types/clinical.ts';
import { acceptActions, newPlan, revise } from '../../../domains/treatment/plan.ts';
import {
  BANNER,
  adviseAdjustment,
  buildDeviceAction,
  buildDeviceAssessment,
  CAMERA_ELBOW_ERROR,
  CAMERA_LIMITS,
  DEFAULT_NOTCH_CM,
  DEVICE_KINDS,
  DEVICE_LABEL,
  deviceGuide,
  elbowFlexion,
  ElbowSampler,
  ELBOW_TARGET,
  holdSide,
  PRINCIPLE,
  referenceLabel,
  viewOf,
  type Adjustment,
  type AffectedSide,
  type DeviceKind,
  type Side,
} from '../../../domains/treatment/index.ts';
import { speak } from '../../../platform/speech.ts';
import { projectLandmarks } from '../../../vision/overlay.ts';
import { detect, drawSkeleton, loadPose, type NormLandmark } from '../../../vision/pose.ts';
import { profile } from '../../app-state.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import type { FeatureRouteContext } from '../registry.ts';
import { makeT } from '../i18n.ts';
import { ensureCss } from './css.ts';
import {
  currentPlan,
  currentUid,
  listPatients,
  loadPatient,
  loadPlans,
  newId,
  saveAssessment,
  savePlan,
  selfPatientId,
} from './data.ts';
import { STRINGS } from './strings.ts';

const t = makeT(STRINGS);
const lang = (): 'fr' | 'en' => (getLang() === 'fr' ? 'fr' : 'en');
const num = (n: number, d = 0): string => n.toFixed(d).replace('.', lang() === 'fr' ? ',' : '.');

const affectedOf = (p: Patient | null): AffectedSide => {
  const s = p?.affectedSide;
  return s === 'left' || s === 'right' || s === 'bilateral' || s === 'none' ? s : undefined;
};

interface Result {
  readonly flexionDeg: number;
  readonly confidence: number;
  readonly source: 'camera' | 'manual';
  readonly sdDeg: number | null;
}

interface State {
  patientId: string;
  patient: Patient | null;
  device: DeviceKind;
  affected: AffectedSide;
  arm: Side;
  facing: 'user' | 'environment';
  notchCm: number;
  result: Result | null;
  saved: boolean;
}

const refList = (refs: readonly string[]): string =>
  refs.length ? `<span class="tx-refs">${refs.map((r) => esc(referenceLabel(r))).join(' · ')}</span>` : '';

function guideHtml(S: State): string {
  const g = deviceGuide(S.device);
  const hold = holdSide(S.device, S.affected);
  return `<section class="card tx-card" aria-labelledby="ad-guide-h"><h2 id="ad-guide-h">${esc(g.name[lang()])}</h2>
    <p class="small muted">${esc(PRINCIPLE)}</p>
    <h3>${t('adLandmarks')}</h3>
    <ul class="tx-list">${g.landmarks
      .map(
        (l) =>
          `<li class="tx-act"><div class="tx-act-head"><b>${t(`lm_${l.id}`)}</b><span class="tx-chip ${l.role === 'primary' ? 'info' : 'soft'}">${t(l.role === 'primary' ? 'adPrimary' : 'adAlternative')}</span></div><p class="small">${esc(l.text)}</p>${refList(l.refs)}</li>`,
      )
      .join('')}</ul>
    <h3>${t('adSide')}</h3>
    <p class="tx-callout"><b>${esc(hold.text)}</b> ${refList(hold.refs)}</p>
    <h3>${t('adSequence')}</h3>
    <ol class="tx-steps">${g.sequence
      .map(
        (s) =>
          `<li>${esc(s.text)} ${refList(s.refs)}${s.status === 'to_verify' ? ` <span class="tx-chip soft">${t('toVerify')}</span>` : ''}</li>`,
      )
      .join('')}</ol>
    <details class="tx-more"><summary>${t('adRules')}</summary><ul class="tx-list">${g.rules
      .map(
        (r) =>
          `<li class="small">${esc(r.rule)} <span class="tx-refs">${esc(referenceLabel(r.ref))} · ${t('adConfidence')} ${esc(r.confidence)}</span></li>`,
      )
      .join('')}</ul>
      ${g.warnings.length ? `<h3>${t('adWarnings')}</h3><ul class="tx-list">${g.warnings.map((w) => `<li class="small">${esc(w)}</li>`).join('')}</ul>` : ''}
      <h3>${t('adIndications')}</h3><ul class="tx-list">${g.indications.map((w) => `<li class="small">${esc(w)}</li>`).join('')}</ul></details>
    ${g.formulaNotice ? `<p class="tx-notice small">${icon('shield', 16)} ${esc(g.formulaNotice)}</p>` : ''}</section>`;
}

function adviceOf(S: State): Adjustment | null {
  if (!S.result) return null;
  return adviseAdjustment({
    flexionDeg: S.result.flexionDeg,
    errorDeg: S.result.source === 'camera' ? CAMERA_ELBOW_ERROR.deg : 2,
    heightCm: S.patient?.heightCm,
    notchCm: S.notchCm,
  });
}

function resultHtml(S: State, canSave: boolean): string {
  const r = S.result;
  const a = adviceOf(S);
  if (!r || !a) return '';
  const cls = a.status === 'ok' ? 'pos' : a.status === 'borderline' ? 'soft' : 'neg';
  return `<section class="card tx-card" aria-labelledby="ad-res-h"><h2 id="ad-res-h">${t('adResult')}</h2>
    <p class="tx-big"><b class="tnum">${num(r.flexionDeg)}°</b> <span class="tx-chip ${cls}">${t(`el_${a.status}`)}</span></p>
    <p class="small">${t('adTarget')} ${ELBOW_TARGET.min}–${ELBOW_TARGET.max}° · ${t('errorMargin')} ± ${r.source === 'camera' ? CAMERA_ELBOW_ERROR.deg : 2}° ${r.source === 'camera' ? `<span class="tx-chip soft">${t('estimate')}</span>` : `<span class="tx-chip">${t('adManual')}</span>`}</p>
    <p class="tx-callout" role="status"><b>${esc(a.message)}</b></p>
    <label class="field"><span>${t('adNotch')}</span><input class="input" id="ad-notch" type="number" step="0.25" min="0.5" max="10" inputmode="decimal" value="${S.notchCm}"><small class="muted">${t('adNotchHint', { n: DEFAULT_NOTCH_CM })}</small></label>
    <div class="row wrap tx-btns">
      <button class="btn" data-act="save" ${S.saved ? 'disabled' : ''}>${icon('check', 18)} ${S.saved ? t('adSaved') : t('adSave')}</button>
      <button class="btn ghost" data-act="measure">${icon('cam', 18)} ${t('adRemeasure')}</button></div>
    <p class="small muted">${canSave ? t('adSaveHintClin') : t('adSaveHintPatient')}</p>
    <details class="tx-more"><summary>${t('adLimits')}</summary><ul class="tx-list">${CAMERA_LIMITS.map((l) => `<li class="small">${esc(l)}</li>`).join('')}
    <li class="small">${esc(CAMERA_ELBOW_ERROR.source)}</li></ul></details></section>`;
}

function html(S: State, canSave: boolean): string {
  const hold = holdSide(S.device, S.affected);
  const arms: readonly Side[] = ['L', 'R'];
  return `<section class="screen tx"><div class="topbar"><button class="icon-btn" data-go="${canSave ? `#/plan/${esc(S.patientId)}` : '#/home'}" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('adTitle')}</h1></div>
    <div class="tx-banner" role="note">${icon('shield', 18)} <span>${esc(BANNER)}</span></div>
    <section class="card tx-card"><h2>${t('adChoose')}</h2>
      <div class="pills" role="group" aria-label="${t('adChoose')}">${DEVICE_KINDS.map((d) => `<button class="pill ${S.device === d ? 'on' : ''}" data-dev="${d}" aria-pressed="${S.device === d}">${esc(DEVICE_LABEL[d][lang()])}</button>`).join('')}</div>
      <label class="field"><span>${t('adAffected')}</span><select class="input" id="ad-aff">${(
        ['left', 'right', 'bilateral', 'none'] as const
      )
        .map((v) => `<option value="${v}" ${S.affected === v ? 'selected' : ''}>${t(`aff_${v}`)}</option>`)
        .join(
          '',
        )}<option value="" ${S.affected === undefined ? 'selected' : ''}>${t('aff_unknown')}</option></select></label></section>
    ${guideHtml(S)}
    <section class="card tx-card" aria-labelledby="ad-cam-h"><h2 id="ad-cam-h">${t('adCamera')}</h2>
      <p class="small">${t('adCameraIntro', { min: ELBOW_TARGET.min, max: ELBOW_TARGET.max })}</p>
      <div class="tx-fields"><label><span>${t('adArm')}</span><select class="input" id="ad-arm">${arms.map((a) => `<option value="${a}" ${S.arm === a ? 'selected' : ''}>${t(a === 'L' ? 'side_L' : 'side_R')}</option>`).join('')}</select>
        <small class="muted">${hold.side === 'L' || hold.side === 'R' ? t('adArmHint') : t('adArmHintAny')}</small></label></div>
      <div class="tx-cam" id="ad-cam" hidden><video id="ad-video" playsinline muted></video><canvas id="ad-canvas"></canvas>
        <div class="tx-cam-hud"><p id="ad-live" class="tx-live" aria-live="polite"></p><p id="ad-val" class="tx-big tnum"></p></div></div>
      <div class="row wrap tx-btns"><button class="btn" data-act="measure" id="ad-start">${icon('cam', 18)} ${t('adStart')}</button>
        <button class="btn ghost" data-act="flip" id="ad-flip" hidden>${icon('flip', 18)} ${t('adFlip')}</button>
        <button class="btn ghost" data-act="stop" id="ad-stop" hidden>${t('adStop')}</button></div>
      <details class="tx-more"><summary>${t('adManualTitle')}</summary><div class="tx-fields"><label><span>${t('adManualLabel')}</span>
        <input class="input" id="ad-manual" type="number" step="1" min="0" max="180" inputmode="numeric"></label></div>
        <button class="btn sm ghost" data-act="manual">${t('adManualUse')}</button></details></section>
    <div id="ad-result">${resultHtml(S, canSave)}</div></section>`;
}

export async function renderDevices(ctx: FeatureRouteContext): Promise<void> {
  ensureCss();
  const root = ctx.root as unknown as HTMLElement | (() => HTMLElement);
  const el = (): HTMLElement => (typeof root === 'function' ? root() : root);
  const isClinician = profile()?.role === 'clinician';
  const patientId = ctx.arg || (isClinician ? '' : selfPatientId());
  if (!patientId) {
    const list = await listPatients();
    el().innerHTML = `<section class="screen tx"><div class="topbar"><button class="icon-btn" data-go="#/clinic" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('adTitle')}</h1></div>
      <div class="tx-banner" role="note">${icon('shield', 18)} <span>${esc(BANNER)}</span></div>
      <section class="card tx-card"><h2>${t('choosePatient')}</h2>${
        list.length
          ? `<ul class="tx-list">${list.map((p) => `<li><a class="btn ghost tx-pick" href="#/aides/${esc(p.id)}">${esc(p.displayName || p.researchId || p.id)}</a></li>`).join('')}</ul>`
          : `<p class="muted">${t('noPatients')}</p>`
      }</section></section>`;
    return;
  }
  const patient = await loadPatient(patientId);
  const S: State = {
    patientId,
    patient,
    device: 'cane',
    affected: affectedOf(patient),
    arm: 'R',
    facing: 'environment',
    notchCm: DEFAULT_NOTCH_CM,
    result: null,
    saved: false,
  };
  const syncArm = (): void => {
    const h = holdSide(S.device, S.affected);
    if (h.side === 'L' || h.side === 'R') S.arm = h.side;
  };
  syncArm();

  // ---- caméra
  let stream: MediaStream | null = null;
  let raf = 0;
  let running = false;
  const sampler = new ElbowSampler();
  const lastCue = new Map<string, number>();
  const cue = (key: string, text: string, gapMs = 6000): void => {
    const now = performance.now();
    if (now - (lastCue.get(key) ?? -1e9) < gapMs) return;
    lastCue.set(key, now);
    const live = el().querySelector<HTMLElement>('#ad-live');
    if (live) live.textContent = text;
    speak(text, { interrupt: true });
  };
  const stopCam = (): void => {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((tk) => tk.stop());
    stream = null;
    const v = el().querySelector<HTMLVideoElement>('#ad-video');
    if (v) v.srcObject = null;
    el().querySelector<HTMLElement>('#ad-cam')?.setAttribute('hidden', '');
    el().querySelector<HTMLElement>('#ad-stop')?.setAttribute('hidden', '');
    el().querySelector<HTMLElement>('#ad-flip')?.setAttribute('hidden', '');
    el().querySelector<HTMLElement>('#ad-start')?.removeAttribute('hidden');
  };
  ctx.cleanup.push(() => {
    stopCam();
    const h = el();
    h.onclick = null;
    h.onchange = null;
  });

  const showResult = (): void => {
    const box = el().querySelector<HTMLElement>('#ad-result');
    if (box) box.innerHTML = resultHtml(S, isClinician);
  };

  const finish = (r: Result): void => {
    S.result = r;
    S.saved = false;
    stopCam();
    const a = adviceOf(S)!;
    speak(t('cueDone', { deg: Math.round(r.flexionDeg) }) + ' ' + a.message, { interrupt: true });
    showResult();
    el().querySelector<HTMLElement>('#ad-result')?.scrollIntoView({ block: 'nearest' });
  };

  async function startCam(): Promise<void> {
    stopCam();
    S.result = null;
    showResult();
    const cam = el().querySelector<HTMLElement>('#ad-cam')!;
    const video = el().querySelector<HTMLVideoElement>('#ad-video')!;
    const canvas = el().querySelector<HTMLCanvasElement>('#ad-canvas')!;
    const live = el().querySelector<HTMLElement>('#ad-live')!;
    const val = el().querySelector<HTMLElement>('#ad-val')!;
    cam.hidden = false;
    live.textContent = t('adLoading');
    running = true;
    try {
      await loadPose((s) => {
        live.textContent = s === 'ready' ? '' : t('adLoading');
      });
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: S.facing, width: { ideal: 960 }, height: { ideal: 720 } },
      });
      if (!running) {
        s.getTracks().forEach((tk) => tk.stop());
        return;
      }
      stream = s;
      video.srcObject = s;
      await video.play();
    } catch (e) {
      console.warn('camera', e);
      stopCam();
      toast(t('adCameraError'), 4500);
      return;
    }
    const mirror = S.facing === 'user';
    video.classList.toggle('mirror', mirror);
    el().querySelector<HTMLElement>('#ad-stop')?.removeAttribute('hidden');
    el().querySelector<HTMLElement>('#ad-flip')?.removeAttribute('hidden');
    el().querySelector<HTMLElement>('#ad-start')?.setAttribute('hidden', '');
    sampler.reset();
    lastCue.clear();
    cue('start', t('cueStart'), 0);
    const g = canvas.getContext('2d')!;
    const loop = (): void => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const W = (canvas.width = canvas.clientWidth);
      const H = (canvas.height = canvas.clientHeight);
      const lm: NormLandmark[] | null = detect(video, performance.now());
      if (!lm) {
        sampler.add(performance.now(), null);
        drawSkeleton(g, null, W, H);
        val.textContent = '';
        cue('nobody', t('cueNoBody'), 5000);
        return;
      }
      const frame = { lm, w: vw, h: vh };
      const sample = elbowFlexion(frame, S.arm);
      drawSkeleton(g, projectLandmarks(lm, vw, vh, W, H, 'cover'), W, H, new Set([11, 12, 13, 14, 15, 16]), mirror);
      sampler.add(performance.now(), sample);
      if (!sample) {
        val.textContent = '';
        cue('arm', t('cueArm'), 5000);
        return;
      }
      if (viewOf(frame) === 'frontal') cue('profile', t('cueProfile'), 7000);
      val.textContent = `${num(sample.flexionDeg)}°`;
      const est = sampler.estimate();
      if (est && !est.stable) cue('still', t('cueStill'), 8000);
      if (est?.stable && viewOf(frame) !== 'frontal') {
        finish({
          flexionDeg: est.flexionDeg,
          confidence: Math.min(0.9, est.visibility),
          source: 'camera',
          sdDeg: est.sdDeg,
        });
      }
    };
    raf = requestAnimationFrame(loop);
  }

  async function save(): Promise<void> {
    const r = S.result;
    const a = adviceOf(S);
    if (!r || !a || S.saved) return;
    const now = new Date();
    const hold = holdSide(S.device, S.affected);
    const aid = newId('as');
    try {
      const rec = buildDeviceAssessment({
        id: aid,
        patientId,
        ownerUid: currentUid(),
        now,
        kind: S.device,
        arm: S.arm,
        flexionDeg: r.flexionDeg,
        confidence: r.confidence,
        advice: a,
        source: r.source,
        ...(S.affected ? { affected: S.affected } : {}),
      });
      await saveAssessment(rec);
      if (isClinician) {
        const plans = await loadPlans(patientId);
        let plan = currentPlan(plans);
        if (!plan) plan = newPlan({ patientId, ownerUid: currentUid(), now, revision: 1 });
        else if (plan.status === 'closed') plan = revise(plan, currentUid(), now);
        const action = buildDeviceAction({
          id: newId('act'),
          kind: S.device,
          hold,
          advice: a,
          flexionDeg: r.flexionDeg,
          assessmentId: aid,
        });
        await savePlan(acceptActions(plan, [action], now));
      }
      S.saved = true;
      toast(t('adSavedToast'));
      showResult();
    } catch (e) {
      console.warn(e);
      toast(t('saveError'));
    }
  }

  const draw = (): void => {
    el().innerHTML = html(S, isClinician);
  };
  draw();
  const host = el();
  host.onclick = (ev) => {
    const target = ev.target as HTMLElement;
    const dev = target.closest<HTMLElement>('[data-dev]')?.dataset['dev'] as DeviceKind | undefined;
    if (dev) {
      stopCam();
      S.device = dev;
      S.result = null;
      syncArm();
      draw();
      return;
    }
    const act = target.closest<HTMLElement>('[data-act]')?.dataset['act'];
    if (act === 'measure') void startCam();
    else if (act === 'stop') stopCam();
    else if (act === 'flip') {
      S.facing = S.facing === 'user' ? 'environment' : 'user';
      void startCam();
    } else if (act === 'save') void save();
    else if (act === 'manual') {
      const v = Number(el().querySelector<HTMLInputElement>('#ad-manual')?.value);
      const raw = el().querySelector<HTMLInputElement>('#ad-manual')?.value ?? '';
      if (raw === '' || !Number.isFinite(v) || v < 0 || v > 180) return void toast(t('adManualInvalid'));
      finish({ flexionDeg: v, confidence: 1, source: 'manual', sdDeg: null });
    }
  };
  host.onchange = (ev) => {
    const target = ev.target as HTMLInputElement | HTMLSelectElement;
    if (target.id === 'ad-aff') {
      S.affected = (target.value || undefined) as AffectedSide;
      syncArm();
      draw();
    } else if (target.id === 'ad-arm') S.arm = target.value === 'L' ? 'L' : 'R';
    else if (target.id === 'ad-notch') {
      const v = Number(target.value);
      S.notchCm = Number.isFinite(v) && v > 0 ? v : DEFAULT_NOTCH_CM;
      S.saved = false;
      showResult();
    }
  };
}
