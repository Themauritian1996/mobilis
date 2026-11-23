/**
 * Volet « marche » — superposition plein écran de capture : caméra + MediaPipe Pose (modules `vision/pose.ts`,
 * `vision/overlay.ts`, `vision/placement.ts`, voix `platform/speech.ts`, réutilisés sans modification).
 * Par vue : guide de placement (visuel + vocal) → vérification en direct par la pose → station debout immobile 2 s
 * → enregistrement des TRAMES DE POSE (aucune vidéo, aucune image) pendant la marche, compteur de cycles en direct,
 * fin automatique ou manuelle → revue (fréquence d'images réelle, cycles) avant validation.
 * Nettoyage garanti : `destroy()` arrête la caméra, la boucle, la voix, le verrou d'écran et retire la superposition.
 */
import type { GaitPatientInput, GaitPoseFrame, GaitView } from '../../../domains/gait/index.ts';
import { loadPose, drawSkeleton, type NormLandmark } from '../../../vision/pose.ts';
import { canvasSize, projectLandmarks } from '../../../vision/overlay.ts';
import { speak, stopSpeech } from '../../../platform/speech.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { toast } from '../../components/toast.ts';
import {
  CueGate,
  FPS_MIN,
  FPS_RECOMMENDED,
  FpsMeter,
  HoldGate,
  PreRoll,
  StillnessDetector,
  averageFps,
  countCycles,
  fpsLevel,
  liveCheck,
  rebase,
  stopDecision,
  toPoseFrame,
  torsoSample,
  walkingDirectionIssue,
  type CycleCount,
  type LiveCheck,
  type RawWorldLandmark,
  type StopReason,
  type TorsoSample,
} from './live.ts';
import { GUIDE_ITEMS, guideSvg } from './guide.ts';
import type { CaptureSettings } from './model.ts';
import { isSagittalView } from './model.ts';
import type { ViewRecording } from './analysis.ts';

export type TFn = (key: string, vars?: Readonly<Record<string, string | number>>) => string;

export interface FinishedView extends ViewRecording {
  readonly fps: number;
  readonly cycles: CycleCount | null;
}

export interface OverlayOptions {
  readonly views: readonly GaitView[];
  readonly settings: CaptureSettings;
  readonly patient: GaitPatientInput;
  readonly t: TFn;
  /** Toutes les vues validées : le parent analyse puis ferme la superposition. */
  readonly onFinished: (recs: FinishedView[]) => void;
  /** L'utilisateur quitte la capture (croix) : le parent navigue ; la superposition est déjà détruite. */
  readonly onExit: () => void;
}

export interface OverlayHandle {
  destroy(): void;
  /** Message plein écran (ex. « Analyse en cours ») ; null l'efface. */
  busy(msg: string | null): void;
}

type Stage = 'guide' | 'check' | 'stand' | 'walk' | 'review' | 'busy';

interface PoseHandle {
  detectForVideo(
    src: CanvasImageSource,
    ts: number,
  ): { landmarks?: NormLandmark[][]; worldLandmarks?: RawWorldLandmark[][] } | null | undefined;
}

const STAND_MS = 2000;
const COUNT_EVERY_MS = 1500;

function sampleLuma(video: HTMLVideoElement, cv: HTMLCanvasElement): { mean: number; center: number; edges: number } | null {
  try {
    const w = 32;
    const h = 24;
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(video, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0;
    let c = 0;
    let cn = 0;
    let e = 0;
    let en = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = 0.299 * (d[i] as number) + 0.587 * (d[i + 1] as number) + 0.114 * (d[i + 2] as number);
        sum += l;
        const inner = x >= w / 4 && x < (3 * w) / 4 && y >= h / 4 && y < (3 * h) / 4;
        if (inner) {
          c += l;
          cn++;
        } else {
          e += l;
          en++;
        }
      }
    return { mean: sum / (w * h), center: c / Math.max(1, cn), edges: e / Math.max(1, en) };
  } catch {
    return null;
  }
}

export function openCaptureOverlay(o: OverlayOptions): OverlayHandle {
  const { t, settings } = o;
  const root = document.createElement('div');
  root.className = 'train gait-cap';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('cap_title'));
  root.innerHTML = `<div class="stage"><video playsinline muted hidden></video><canvas class="overlay" aria-hidden="true"></canvas>
    <div class="hud-top"><button class="icon-btn" data-g="close" aria-label="${esc(t('cap_close'))}">${icon('close', 20)}</button>
      <div class="hud-title"><b data-g="title"></b><small data-g="sub"></small></div>
      <div class="hud-btns"><button class="icon-btn" data-g="flip" aria-label="${esc(t('cap_flip'))}">${icon('flip', 20)}</button></div></div>
    <div class="gc-chips" data-g="chips" hidden></div>
    <div class="gc-checks" data-g="checks" hidden></div>
    <div class="cue" aria-live="polite"><span data-g="cue"></span></div>
    <div class="gc-bar" data-g="barwrap" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-g="bar"></i></div>
    <div class="center-msg" data-g="msg" hidden role="status"></div>
    <div class="setup" data-g="card"></div></div>
    <div class="bottom"><button class="btn ghost" data-g="skip" hidden></button><button class="btn" data-g="finish" hidden></button></div>`;
  document.body.appendChild(root);
  const $ = <E extends HTMLElement = HTMLElement>(s: string): E => root.querySelector<E>(`[data-g="${s}"]`) as E;
  const video = root.querySelector('video') as HTMLVideoElement;
  const canvas = root.querySelector('canvas.overlay') as HTMLCanvasElement;
  const g2d = canvas.getContext('2d') as CanvasRenderingContext2D;
  const lumaCv = document.createElement('canvas');

  const S = {
    idx: 0,
    stage: 'guide' as Stage,
    stream: null as MediaStream | null,
    facing: 'environment' as 'environment' | 'user',
    mirror: false,
    pose: null as PoseHandle | null,
    closed: false,
    gen: 0,
    raf: 0,
    vfc: 0,
    wake: null as WakeLockSentinel | null,
    lastTs: 0,
    W: 0,
    H: 0,
    fw: 0,
    fh: 0,
    luma: null as ReturnType<typeof sampleLuma>,
    lumaAt: 0,
    fps: new FpsMeter(),
    cues: new CueGate(),
    hold: new HoldGate(1000, 300),
    still: new StillnessDetector(STAND_MS, 0.08),
    moveStill: new StillnessDetector(1500, 0.1),
    pre: new PreRoll(STAND_MS + 1500),
    frames: [] as GaitPoseFrame[],
    walkT0: 0,
    first: null as TorsoSample | null,
    moving: false,
    movingAt: 0,
    dirChecked: false,
    lostSince: null as number | null,
    cycles: null as CycleCount | null,
    countAt: 0,
    lastCue: '',
    recs: [] as FinishedView[],
    pending: null as FinishedView | null,
    standSaid: false,
  };
  const view = (): GaitView => o.views[S.idx] as GaitView;
  const say = (txt: string, interrupt = true): void => {
    try {
      speak(txt, { interrupt });
    } catch {
      /* la voix est facultative */
    }
  };

  // ---------------------------------------------------------------- Fermeture (caméra arrêtée, écouteurs retirés)
  const onVis = (): void => {
    if (document.visibilityState === 'visible') void keepAwake();
  };
  document.addEventListener('visibilitychange', onVis);
  async function keepAwake(): Promise<void> {
    try {
      if (document.visibilityState === 'visible' && !S.wake) {
        const w = await navigator.wakeLock.request('screen');
        S.wake = w;
        w.addEventListener('release', () => {
          S.wake = null;
        });
      }
    } catch {
      /* verrou d'écran indisponible */
    }
  }
  function stopStream(): void {
    S.gen++;
    const cancelVfc = (video as unknown as { cancelVideoFrameCallback?: (h: number) => void }).cancelVideoFrameCallback;
    try {
      if (S.vfc && cancelVfc) cancelVfc.call(video, S.vfc);
    } catch {
      /* déjà annulé */
    }
    cancelAnimationFrame(S.raf);
    S.vfc = 0;
    S.stream?.getTracks().forEach((tk) => tk.stop());
    S.stream = null;
    try {
      video.srcObject = null;
    } catch {
      /* élément détaché */
    }
  }
  function destroy(): void {
    if (S.closed) return;
    S.closed = true;
    stopStream();
    document.removeEventListener('visibilitychange', onVis);
    try {
      if (S.wake) void S.wake.release();
    } catch {
      /* déjà relâché */
    }
    S.wake = null;
    try {
      stopSpeech();
    } catch {
      /* voix déjà coupée */
    }
    S.frames = [];
    S.pre.clear();
    root.remove();
  }
  const leave = (): void => {
    destroy();
    o.onExit();
  };
  $('close').onclick = leave;

  // ---------------------------------------------------------------- Caméra
  async function openCam(): Promise<boolean> {
    const gen = ++S.gen;
    const dead = (): boolean => S.closed || gen !== S.gen;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: S.facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: FPS_RECOMMENDED },
      },
    });
    if (dead()) {
      stream.getTracks().forEach((tk) => tk.stop());
      return false;
    }
    S.stream = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      if (dead()) {
        stream.getTracks().forEach((tk) => tk.stop());
        S.stream = null;
        return false;
      }
      throw e;
    }
    if (dead()) {
      stream.getTracks().forEach((tk) => tk.stop());
      if (S.stream === stream) S.stream = null;
      return false;
    }
    video.hidden = false;
    let fm: string | null = null;
    try {
      fm = stream.getVideoTracks()[0]?.getSettings?.().facingMode ?? null;
    } catch {
      fm = null;
    }
    S.mirror = (fm === 'user' || fm === 'environment' ? fm : S.facing) === 'user';
    video.classList.toggle('mirror', S.mirror);
    return true;
  }

  function startLoop(): void {
    const gen = S.gen;
    const v = video as unknown as {
      requestVideoFrameCallback?: (cb: (now: number) => void) => number;
    };
    const next = (): void => {
      if (S.closed || gen !== S.gen) return;
      if (v.requestVideoFrameCallback) S.vfc = v.requestVideoFrameCallback(tick);
      else S.raf = requestAnimationFrame(tick);
    };
    const tick = (): void => {
      if (S.closed || gen !== S.gen) return;
      if (!root.isConnected) {
        destroy();
        return;
      }
      next();
      try {
        frame(performance.now());
      } catch (e) {
        console.warn('gait frame', e);
      }
    };
    next();
  }

  $('flip').onclick = async () => {
    S.facing = S.facing === 'user' ? 'environment' : 'user';
    const was = S.stream !== null;
    if (!was) return;
    stopStream();
    try {
      if (await openCam()) startLoop();
    } catch {
      if (!S.closed) toast(t('cap_camErr'), 4000);
    }
  };

  // ---------------------------------------------------------------- Affichage
  function setCue(text: string, kind: '' | 'bad' | 'good' = ''): void {
    const el = $('cue');
    if (el.textContent !== text) el.textContent = text;
    el.className = kind;
  }
  function setBar(p: number): void {
    const w = $('barwrap');
    w.hidden = false;
    $('bar').style.width = `${Math.round(p * 100)}%`;
    w.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }
  const hideBar = (): void => {
    $('barwrap').hidden = true;
  };
  function setTitle(sub = ''): void {
    $('title').textContent = `${t('view_' + view())} · ${S.idx + 1}/${o.views.length}`;
    $('sub').textContent = sub;
  }
  const chip = (ok: boolean | null, label: string): string =>
    `<span class="rchip ${ok === null ? '' : ok ? 'ok' : 'no'}"><i aria-hidden="true">${ok === null ? '·' : ok ? '✓' : '✗'}</i>${esc(label)}</span>`;
  function renderChecks(c: LiveCheck | null): void {
    const box = $('checks');
    box.hidden = false;
    box.innerHTML =
      chip(c ? c.fullBody : null, t('chk_fullBody')) +
      chip(c ? c.feetVisible : null, t('chk_feet')) +
      (isSagittalView(view()) ? '' : chip(c ? c.centered : null, t('chk_centered'))) +
      chip(c ? c.orientationOk : null, t(isSagittalView(view()) ? 'chk_profile' : 'chk_facing'));
  }
  function renderChips(): void {
    const box = $('chips');
    box.hidden = false;
    const f = S.fps.fps;
    const lvl = fpsLevel(f);
    const fpsTxt = f > 0 ? `${Math.round(f)} ${t('unit_fps')}` : `– ${t('unit_fps')}`;
    let html = `<span class="gc-chip fps-${f > 0 ? lvl : 'none'}" title="${esc(t('cap_fpsHint', { rec: FPS_RECOMMENDED, min: FPS_MIN }))}">${icon('cam', 14)} ${esc(fpsTxt)}</span>`;
    if (S.stage === 'walk') {
      const c = S.cycles;
      const tgt = settings.targetCycles;
      html += `<span class="gc-chip">${esc(t('cap_cyclesL', { n: c?.L ?? 0, target: tgt }))}</span><span class="gc-chip">${esc(t('cap_cyclesR', { n: c?.R ?? 0, target: tgt }))}</span>`;
      html += `<span class="gc-chip">${icon('timer', 14)} ${((performance.now() - S.walkT0) / 1000).toFixed(0)} s</span>`;
    }
    if (box.dataset['sig'] !== html) {
      box.dataset['sig'] = html;
      box.innerHTML = html;
    }
  }
  function busy(msg: string | null): void {
    const el = $('msg');
    el.hidden = msg === null;
    el.innerHTML = msg === null ? '' : `<div><div class="spinner" aria-hidden="true"></div>${esc(msg)}</div>`;
  }

  // ---------------------------------------------------------------- Étape : guide de placement
  function showGuide(): void {
    S.stage = 'guide';
    setTitle(t('cap_stageGuide'));
    $('checks').hidden = true;
    $('chips').hidden = S.stream === null;
    hideBar();
    setCue('');
    $('skip').hidden = true;
    $('finish').hidden = true;
    g2d.clearRect(0, 0, canvas.width, canvas.height);
    const v = view();
    const side = v === 'sagittal-left' ? t('side_left') : v === 'sagittal-right' ? t('side_right') : '';
    const items = GUIDE_ITEMS.map((k) => `<li><b>${esc(t('gi_' + k))}</b> ${esc(t('gid_' + k))}</li>`).join('');
    const direction = t('dir_' + v);
    $('card').hidden = false;
    $('card').innerHTML = `<h2 style="margin:0 0 6px">${esc(t('view_' + v))}</h2>
      <p class="muted small" style="margin:0 0 8px">${esc(t('guide_intro_' + v, { side }))}</p>
      ${guideSvg(v, { camera: t('gg_camera'), distance: t('gg_distance'), corridor: t('gg_corridor'), patient: t('gg_patient'), alt: t('gg_alt_' + v) })}
      <ul class="gc-guide-list">${items}</ul>
      <p class="small"><b>${esc(t('gi_direction'))}</b> ${esc(direction)}</p>
      <p class="small muted">${esc(t('cap_fpsAdvice', { rec: FPS_RECOMMENDED, min: FPS_MIN }))}</p>
      <div class="row" style="gap:8px"><button class="btn ghost sm" data-g="speak">${icon('volume', 16)} ${esc(t('cap_readAloud'))}</button><button class="btn" data-g="go">${icon('cam', 18)} ${esc(t('cap_ready'))}</button></div>`;
    const spoken = `${t('view_' + v)}. ${t('guide_intro_' + v, { side })} ${GUIDE_ITEMS.map((k) => t('gi_' + k) + ' ' + t('gid_' + k)).join(' ')} ${direction}`;
    say(spoken);
    ($('card').querySelector('[data-g="speak"]') as HTMLButtonElement).onclick = () => say(spoken);
    ($('card').querySelector('[data-g="go"]') as HTMLButtonElement).onclick = () => void beginCheck();
  }

  async function ensureCamera(): Promise<boolean> {
    if (S.stream && S.pose) return true;
    busy(t('cap_loading'));
    try {
      if (!S.stream && !(await openCam())) return false;
      if (!S.pose) S.pose = (await loadPose()) as unknown as PoseHandle;
    } catch (e) {
      if (S.closed) return false;
      console.error(e);
      busy(null);
      stopStream();
      toast(e instanceof Error && e.name === 'NotAllowedError' ? t('cap_camDenied') : t('cap_modelErr'), 5000);
      return false;
    }
    busy(null);
    if (S.closed) return false;
    void keepAwake();
    startLoop();
    return true;
  }

  // ---------------------------------------------------------------- Étape : vérification du placement
  async function beginCheck(): Promise<void> {
    if (!(await ensureCamera())) return;
    stopSpeech();
    S.stage = 'check';
    S.hold.reset();
    S.still.reset();
    S.cues.reset();
    S.pre.clear();
    S.fps.reset();
    S.standSaid = false;
    setTitle(t('cap_stageCheck'));
    $('card').hidden = true;
    renderChecks(null);
    renderChips();
    setCue(t('cap_checking'));
    const sk = $('skip');
    sk.hidden = false;
    sk.textContent = t('cap_skipCheck');
    sk.onclick = () => beginStand();
    $('finish').hidden = true;
  }

  // ---------------------------------------------------------------- Étape : station debout (calibration par la taille)
  function beginStand(): void {
    S.stage = 'stand';
    S.still.reset();
    S.pre.clear();
    S.cues.reset();
    setTitle(t('cap_stageStand'));
    $('skip').hidden = true;
    setCue(t('cap_standPrompt'));
    say(t('cap_standPrompt'));
    setBar(0);
  }

  // ---------------------------------------------------------------- Étape : enregistrement de la marche
  function beginWalk(now: number, lm: readonly NormLandmark[] | null): void {
    S.stage = 'walk';
    const t0 = S.still.since;
    S.frames = t0 === null ? [] : S.pre.since(t0);
    S.walkT0 = now;
    S.first = lm ? torsoSample(lm, S.fw / S.fh) : null;
    S.moving = false;
    S.movingAt = 0;
    S.dirChecked = false;
    S.lostSince = null;
    S.cycles = null;
    S.countAt = now;
    S.moveStill.reset();
    setTitle(t('cap_stageWalk'));
    hideBar();
    const go = t(settings.speed === 'fast' ? 'cap_walkGoFast' : 'cap_walkGo');
    setCue(go, 'good');
    say(go);
    const fin = $('finish');
    fin.hidden = false;
    fin.textContent = t('cap_stop');
    fin.onclick = () => endWalk('manual');
    $('skip').hidden = true;
  }

  function endWalk(reason: StopReason | 'manual'): void {
    if (S.stage !== 'walk') return;
    const frames = S.frames;
    if (frames.length < 30) {
      toast(t('cap_tooShort'), 3000);
      if (reason === 'manual') return;
    }
    S.stage = 'review';
    const cycles = countCycles(rebase(frames), view(), o.patient, S.fw / S.fh) ?? S.cycles;
    S.pending = {
      view: view(),
      frames: rebase(frames),
      aspect: S.fw / S.fh,
      fps: averageFps(frames),
      cycles,
    };
    S.frames = [];
    g2d.clearRect(0, 0, canvas.width, canvas.height);
    setCue('');
    $('finish').hidden = true;
    $('checks').hidden = true;
    showReview(reason);
  }

  function showReview(reason: StopReason | 'manual'): void {
    const p = S.pending as FinishedView;
    setTitle(t('cap_stageReview'));
    const lvl = fpsLevel(p.fps);
    const tgt = settings.targetCycles;
    const L = p.cycles?.L ?? 0;
    const R = p.cycles?.R ?? 0;
    const short = L < tgt || R < tgt;
    const done = t('cap_done');
    const warn: string[] = [];
    if (lvl === 'low') warn.push(t('cap_fpsLow', { min: FPS_MIN }));
    else if (lvl === 'ok') warn.push(t('cap_fpsOk', { rec: FPS_RECOMMENDED }));
    if (short) warn.push(t('cap_cyclesShort', { target: tgt }));
    const last = S.idx === o.views.length - 1;
    $('card').hidden = false;
    $('card').innerHTML = `<h2 style="margin:0 0 6px">${esc(t('cap_reviewTitle'))}</h2>
      <p class="small muted" style="margin:0 0 8px">${esc(t('stop_' + reason))}</p>
      <dl class="gc-kv"><div><dt>${esc(t('cap_fpsReal'))}</dt><dd class="gc-fps-${lvl}">${Math.round(p.fps)} ${esc(t('unit_fps'))}</dd></div>
      <div><dt>${esc(t('cap_frames'))}</dt><dd>${p.frames.length}</dd></div>
      <div><dt>${esc(t('cap_duration'))}</dt><dd>${(((p.frames[p.frames.length - 1]?.t ?? 0) - (p.frames[0]?.t ?? 0)) / 1000).toFixed(1)} s</dd></div>
      <div><dt>${esc(t('cap_cyclesDetected'))}</dt><dd>${esc(t('cap_cyclesLR', { l: L, r: R }))}</dd></div></dl>
      ${warn.length ? `<ul class="gc-warn">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="row" style="gap:8px"><button class="btn ghost" data-g="redo">${esc(t('cap_redo'))}</button><button class="btn" data-g="ok">${esc(last ? t('cap_finish') : t('cap_nextView'))}</button></div>`;
    say(`${done} ${t('cap_cyclesLR', { l: L, r: R })}`);
    ($('card').querySelector('[data-g="redo"]') as HTMLButtonElement).onclick = () => {
      S.pending = null;
      $('card').hidden = true;
      void beginCheck();
    };
    ($('card').querySelector('[data-g="ok"]') as HTMLButtonElement).onclick = () => {
      S.recs.push(p);
      S.pending = null;
      $('card').hidden = true;
      if (S.idx < o.views.length - 1) {
        S.idx++;
        showGuide();
      } else {
        S.stage = 'busy';
        stopStream();
        o.onFinished(S.recs);
      }
    };
  }

  // ---------------------------------------------------------------- Boucle par trame
  function size(): void {
    const r = (root.querySelector('.stage') as HTMLElement).getBoundingClientRect();
    const { W, H } = canvasSize(r.width, r.height, window.devicePixelRatio || 1);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    S.W = W;
    S.H = H;
    S.fw = video.videoWidth;
    S.fh = video.videoHeight;
  }

  function voiceCue(key: string, text: string, now: number): void {
    if (S.cues.offer(key, now)) say(text);
  }

  function frame(now: number): void {
    if (S.stage === 'guide' || S.stage === 'review' || S.stage === 'busy') return;
    if (!S.pose || video.readyState < 2 || !video.videoWidth) return;
    if (!(now > S.lastTs)) return;
    S.lastTs = now;
    size();
    const res = S.pose.detectForVideo(video, now);
    const lm = res?.landmarks?.[0] ?? null;
    const world = res?.worldLandmarks?.[0] ?? null;
    S.fps.push(now);
    if (lm) {
      const proj = projectLandmarks(lm, S.fw, S.fh, S.W, S.H);
      drawSkeleton(g2d, proj, S.W, S.H, new Set(), S.mirror);
    } else g2d.clearRect(0, 0, S.W, S.H);
    renderChips();
    const aspect = S.fw / S.fh;
    if (S.stage === 'check' || S.stage === 'stand') {
      if (now - S.lumaAt > 400) {
        S.lumaAt = now;
        S.luma = sampleLuma(video, lumaCv);
      }
      const c = liveCheck({ lm, view: view(), frameW: S.fw, frameH: S.fh, mirror: S.mirror, luma: S.luma });
      renderChecks(c);
      const key = c.cue;
      if (S.stage === 'check') {
        setCue(key === 'ok' ? t('cue_ok') : t('cue_' + key), key === 'ok' ? 'good' : 'bad');
        if (key !== 'ok') voiceCue(key, t('cue_' + key), now);
        const h = S.hold.push(c.ok, now);
        setBar(h.progress);
        if (h.stable) {
          say(t('cue_ok'));
          beginStand();
        }
        return;
      }
      // station debout
      const bodyOk = c.fullBody && c.feetVisible;
      if (lm) S.pre.push(toPoseFrame(now, lm, world));
      const st = S.still.push(now, lm, aspect, bodyOk);
      setBar(st.progress);
      if (!bodyOk) {
        setCue(t('cue_' + (key === 'ok' ? 'showBody' : key)), 'bad');
        voiceCue(key, t('cue_' + (key === 'ok' ? 'showBody' : key)), now);
      } else if (st.progress > 0.4) {
        setCue(t('cap_standHold'), 'good');
        if (!S.standSaid) {
          S.standSaid = true;
          say(t('cap_standHold'), false);
        }
      } else setCue(t('cap_standPrompt'));
      if (st.still) beginWalk(now, lm);
      return;
    }
    // marche
    if (S.stage !== 'walk') return;
    if (lm) S.frames.push(toPoseFrame(now, lm, world));
    const ts = lm ? torsoSample(lm, aspect) : null;
    const ankles = lm ? [27, 28].every((k) => (lm[k]?.visibility ?? 1) >= 0.35) : false;
    if (lm && ts && ankles) S.lostSince = null;
    else if (S.lostSince === null) S.lostSince = now;
    if (!S.moving && ts && S.first) {
      const d = Math.hypot(ts.cx - S.first.cx, ts.cy - S.first.cy) / S.first.torso;
      if (d > 0.4 || Math.abs(ts.torso / S.first.torso - 1) > 0.06) {
        S.moving = true;
        S.movingAt = now;
      }
    }
    if (S.moving && !S.dirChecked && ts && S.first && now - S.movingAt > 1000) {
      S.dirChecked = true;
      const issue = walkingDirectionIssue(view(), S.first, ts);
      if (issue) {
        const msg = t('walkdir_' + issue);
        setCue(msg, 'bad');
        say(msg);
      } else setCue('');
    }
    const st2 = S.moving ? S.moveStill.push(now, lm, aspect, true) : { progress: 0 };
    if (now - S.countAt >= (S.frames.length > 900 ? COUNT_EVERY_MS * 2 : COUNT_EVERY_MS)) {
      S.countAt = now;
      S.cycles = countCycles(rebase(S.frames), view(), o.patient, aspect) ?? S.cycles;
    }
    const why = stopDecision({
      elapsedMs: now - S.walkT0,
      cycles: S.cycles,
      target: settings.targetCycles,
      lostMs: S.lostSince === null ? 0 : now - S.lostSince,
      stillMs: S.moving ? st2.progress * 1500 : 0,
    });
    if (why) endWalk(why);
  }

  // ---------------------------------------------------------------- Départ
  setTitle(t('cap_stageGuide'));
  showGuide();
  return { destroy, busy };
}
