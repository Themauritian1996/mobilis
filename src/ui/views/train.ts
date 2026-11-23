// Séance d'un exercice : caméra (pose 2D, 2 plans) ou mode guidé, résumé, rétroaction et ajustement du niveau
// (reprise de www/js/train.js, v1.15). La logique pure (bilan de série, séries valides, niveau) est dans
// domains/rehab/training.ts.
import { t, aiLangInfo, CUES } from '../../../www/js/i18n.js';
import { tr, trList } from '../components/l10n.ts';
import { EXERCISES as EXERCISE_DATA, UNILATERAL, EQUIP as EQUIP_DATA } from '../../../www/js/data/exercises.js';
import * as P from '../../../www/js/program.js';
import * as store from '../../../www/js/store.js';
import {
  loadPose,
  detect,
  toPx,
  Tracker,
  drawSkeleton,
  FAULT_JOINTS,
  detectPlane,
  bodyVisible,
} from '../../../www/js/pose.js';
import {
  speak,
  speakAI,
  stopSpeech,
  cue,
  cueText,
  countAloud,
  coachComment,
  coachReply,
  speakRich,
  grabFrame,
  startDictation,
  dictationMode,
  aiAvailable,
  geminiDirect,
} from '../../../www/js/coach.js';
import { startLiveCoach, liveAvailable, liveSocketAvailable, primeAudio } from '../../../www/js/live.js';
import { isPlaying } from '../../../www/js/audio.js';
import { createPreciseCoach, fineKind } from '../../../www/js/ai-coach.js';
import { loadHands, detectHands, pickHand, handPx, drawHand, handInFrame, HandSideVote } from '../../../www/js/hand.js';
import {
  canvasSize,
  fitRect,
  projectLandmarks,
  LandmarkSmoother,
  SubjectGuard,
  Pacer,
} from '../../../www/js/overlay.js';
import { MoveMatcher, drawGuides, hintKey } from '../../../www/js/movematch.js';
import { haveList, missing } from '../../../www/js/equip.js';
import {
  assessPlacement,
  PlacementGate,
  scopeOf,
  palmNeed,
  guideRect,
  subjectBox,
  measurementsText,
  issueIcon,
  ICON_SVG,
} from '../../../www/js/placement.js';
import {
  type DoseLike,
  type SetRecord,
  type SetSummary,
  applyMoveMismatch,
  doseText,
  finishItem,
  guidedSummary,
  isEmptySet,
  levelToastText,
  localSetComment,
  manualBounds,
  manualSummary,
  moveMatchPct,
  nextAfterSave,
  partialItem,
  setSummaryData,
  sortedFaults,
  validSets as validSetsOf,
} from '../../domains/rehab/training.ts';
import {
  type Profile,
  type SessionItem,
  type SessionRecord,
  state,
  go,
  profile,
  sessions,
  todaySession,
  nextExercise,
  syncProgress,
  updateProfile,
} from '../app-state.ts';
import { esc, sleep } from '../components/html.ts';
import { icon, IC } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { mountFigs, figSvg, figureBlock } from '../components/figures.ts';

/** Séance du jour (créée au besoin). */
type DaySession = SessionRecord & { items: SessionItem[] };
type Timer = ReturnType<typeof setTimeout> | undefined;
type Interval = ReturnType<typeof setInterval> | undefined;

/** Exercice du catalogue (champs lus par la séance). */
interface ExerciseDef {
  readonly name: { readonly en?: string };
  readonly keys: readonly unknown[];
  readonly steps: { readonly en?: readonly string[] };
  readonly fig: { readonly view?: string };
  readonly track?: {
    readonly kind?: string;
    readonly cam?: unknown;
    readonly planes: Record<string, { readonly metric: string }>;
  };
}
const EXERCISES = EXERCISE_DATA as unknown as Record<string, ExerciseDef | undefined>;
const EQUIP = EQUIP_DATA as unknown as Record<string, unknown>;

// Placement déjà fait (ou passé) pendant cette session : exercice → pas de nouvelle vérification aux séries suivantes (bouton « Recadrer » pour la rouvrir)
const PLACED = new Set<string>();
const PLACE_MAX_MS = 25000; // au bout de ce délai on commence quand même (jamais de blocage)

const RING = 276.5;
// Cadence d'analyse (images / s) : assez pour compter juste, sans saturer le téléphone
const HZ = { hand: 18, body: 25, guided: 15 };
const FRAME_MAX = 960; // plus grand côté de l'image analysée et affichée (pixels)

interface Luma {
  mean: number;
  center: number;
  edges: number;
}
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
interface Pt {
  x: number;
  y: number;
}
type Landmarks = readonly (Pt & { visibility?: number })[];
type TrackerT = InstanceType<typeof Tracker>;
type MatcherT = InstanceType<typeof MoveMatcher>;
interface LiveCoach {
  stop: () => void;
  event?: (name: string, data?: unknown) => void;
  review?: (frame: string | null, meas: unknown, recent?: unknown[]) => unknown;
}
type PlaceArgs = NonNullable<Parameters<typeof assessPlacement>[0]>;
interface Placement {
  on: boolean;
  t0: number;
  gate: InstanceType<typeof PlacementGate>;
  kind: NonNullable<PlaceArgs['kind']>;
  plane: NonNullable<PlaceArgs['plane']>;
  metric: string;
  scope: Parameters<typeof guideRect>[2];
  palm: PlaceArgs['palm'];
  luma: Luma | null;
  lumaT: number;
  tilt: { beta: number; gamma: number } | null;
  spokenKey: string | null;
  spokenT: number;
  aiBusy: boolean;
  aiN: number;
  shownKey: string | null;
  top: Parameters<typeof issueIcon>[0];
  last: ReturnType<typeof assessPlacement> | null;
  box: unknown;
  onOri?: ((e: DeviceOrientationEvent) => void) | null | undefined;
  timer?: Timer;
  hideT?: Timer;
}
interface TrainState {
  set: number;
  sets: SetRecord[];
  stream: MediaStream | null;
  raf: number;
  tracker: TrackerT | null;
  mode: 'camera' | 'guided';
  facing: string;
  active: boolean;
  guidedTimer: Interval;
  restTimer: Interval | 0;
  selfView: boolean;
  guides: boolean;
  liveAI: boolean;
  live: LiveCoach | null;
  liveState: string;
  closed: boolean;
  camGen: number;
  tok: number;
  saved: boolean;
  discard: boolean;
  paused: boolean;
  mirror: boolean | null;
  drawn: unknown;
  handPrev: ReturnType<typeof pickHand> | null;
  wrongHandMs: number;
  wrongHandT: number;
  lastLm: Landmarks | null;
  lastHand: Landmarks | null;
  lastFj: Set<number> | null;
  lastSt: StepState | null;
  handInfo: { label: unknown; score: unknown; world: boolean } | null;
  ticks: number;
  cost: number;
  place: Placement | null;
  mm: MatcherT | null;
  mvKey: string | null;
  mvWrongMs: number;
  mvLastT: number;
  mvSaid: number;
  lastRepT: number;
  recentFaults: Map<string, number> | null;
  mkTracker: (() => TrackerT) | null;
  frame: unknown;
  kf: string | null;
  kfP: number;
  kfT: number;
  aiNotes: string[];
  aiAnnounced: boolean;
  aiTimer: Interval;
  aiCueT: Timer;
  liveWatchT: Interval;
  liveLost: boolean;
  liveFaultT: number;
  liveSeen: StepState | null;
  liveSeenT: number;
  liveStartT: number;
  guidedEl: (() => { el: number; reps: number }) | null;
  gpRun: boolean;
}
/** État rendu par le suivi à chaque image. */
interface StepState {
  phase?: string;
  reps?: number;
  holdSec?: number;
  progress?: number;
  value?: number | null;
  range?: unknown;
  checks?: { cue: string; value: unknown; kind: string; limit: unknown }[];
  faults?: unknown;
  guard?: boolean;
}

export { doseText };

export function viewTrain(id: string, cleanup: (() => void)[]): void {
  const exDef = EXERCISES[id];
  if (!exDef) {
    go('#/home');
    return;
  }
  const ex: ExerciseDef = exDef;
  const prof = profile() as Profile;
  const curProfile = (): Profile => profile() as Profile;
  const item = P.todaysProgram(prof).find((x: { id: string }) => x.id === id);
  const level: number = item ? item.level : P.levelOf(prof, id);
  const dose = (item ? item.dose : P.doseFor(id, level, P.inFlare(prof))) as DoseLike;
  const path = P.pathologyById(prof['pathology']) || {
    name: { fr: 'Exercice libre', en: 'Free exercise' },
    painMax: 4,
  };
  const planes = ex.track ? Object.keys(ex.track.planes) : [];
  const handEx = ex.track?.kind === 'hand'; // poignet / main / pouce : suivi des 21 points de la main
  const fine = fineKind(ex);
  const baseSets: number = dose.type === 'hold' ? dose.sets * (dose.reps || 1) : dose.sets;
  // Côté travaillé (exercices unilatéraux) : gauche, droit ou les deux (séries alternées)
  const uni = UNILATERAL.has(id);
  const sidesMap = prof['sides'] as Record<string, string> | undefined;
  let sideMode: string | null = uni ? sidesMap?.[id] || (prof['side'] as string | undefined) || 'both' : null;
  let totalSets = sideMode === 'both' ? baseSets * 2 : baseSets;
  const curSide = (): 'L' | 'R' | null =>
    !uni ? null : sideMode === 'both' ? (T.set % 2 === 0 ? 'L' : 'R') : (sideMode as 'L' | 'R');
  const setIdx = (): number => (sideMode === 'both' ? Math.floor(T.set / 2) : T.set);
  const T: TrainState = {
    set: 0,
    sets: [],
    stream: null,
    raf: 0,
    tracker: null,
    mode: ex.track ? 'camera' : 'guided',
    facing: store.settings().camera,
    active: false,
    guidedTimer: undefined,
    restTimer: 0,
    selfView: store.settings().selfView !== false,
    guides: store.settings().guides !== false,
    liveAI: !!store.settings().liveAI && liveAvailable(),
    live: null,
    liveState: 'off',
    closed: false,
    camGen: 0,
    tok: 0,
    saved: false,
    discard: false,
    paused: false,
    mirror: null,
    drawn: null,
    handPrev: null,
    wrongHandMs: 0,
    wrongHandT: 0,
    lastLm: null,
    lastHand: null,
    lastFj: null,
    lastSt: null,
    handInfo: null,
    ticks: 0,
    cost: 0,
    place: null,
    mm: null,
    mvKey: null,
    mvWrongMs: 0,
    mvLastT: 0,
    mvSaid: 0,
    lastRepT: 0,
    recentFaults: null,
    mkTracker: null,
    frame: null,
    kf: null,
    kfP: 0,
    kfT: 0,
    aiNotes: [],
    aiAnnounced: false,
    aiTimer: undefined,
    aiCueT: undefined,
    liveWatchT: undefined,
    liveLost: false,
    liveFaultT: 0,
    liveSeen: null,
    liveSeenT: 0,
    liveStartT: 0,
    guidedEl: null,
    gpRun: false,
  };
  const hasCam = (): boolean => typeof navigator.mediaDevices?.getUserMedia === 'function';
  const planeFor = (i: number): string => planes[i % planes.length] ?? '';
  const holdTarget: number = dose.type === 'hold' ? dose.hold : 0;

  const root = document.createElement('div');
  root.className = 'train';
  root.innerHTML = `<div class="stage"><video playsinline muted hidden poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><canvas class="overlay"></canvas>
    <div class="hud-top"><button class="icon-btn" data-t="close" aria-label="${t('close')}">${icon('close', 20)}</button>
      <div class="hud-title"><b>${esc(tr(ex.name))}</b><small id="setlbl"></small><div id="pbadge"></div></div>
      <div class="hud-btns"><button class="icon-btn" data-t="demo" aria-label="${t('exDemoBtn')}" title="${t('exDemoBtn')}">${icon('demo', 20)}</button>
      <button class="icon-btn ai-btn" data-t="ai" aria-pressed="false" aria-label="${t('liveAI')}" title="${t('liveAI')}">${icon('spark', 20)}<i></i></button>
      <button class="icon-btn" data-t="replace" hidden aria-label="${t('pl_reframe')}" title="${t('pl_reframe')}">${icon('cam', 20)}</button>
      <button class="icon-btn" data-t="video" aria-pressed="true"></button>
      <button class="icon-btn" data-t="flip" aria-label="${t('camSwitch')}" title="${t('camSwitch')}">${icon('flip', 20)}</button></div></div>
    <div class="vid-off" hidden>${icon('eyeOff', 18)} <span>${t('videoOffNote')}</span></div>
    <div class="depth" hidden><i style="height:0"></i></div>
    <div class="counter" hidden><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.18)" stroke-width="5" fill="none"/><circle id="ring" cx="50" cy="50" r="44" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><div class="val"><div><b id="cnt">0</b><small id="cntlbl"></small></div></div></div>
    <button class="mini-fig" hidden aria-label="${t('exDemoBtn')}">${figSvg(id)}<span>${icon('demo', 12)} ${t('demoShort')}</span></button>
    <div class="demo" hidden></div>
    <div class="cue" hidden><span></span></div>
    <div class="place" hidden role="status" aria-live="polite"><div class="place-ico"></div><div class="place-txt"></div><div class="place-ai" hidden></div><div class="place-bar"><i></i></div>
      <div class="place-btns"><button class="btn sm ghost" data-t="place-ai" hidden>${icon('spark', 14)} ${t('pl_ai')}</button><button class="btn sm ghost" data-t="place-skip">${t('pl_skip')}</button></div></div>
    <div class="center-msg" hidden></div>
    <div class="setup" hidden></div></div>
    <div class="bottom"><button class="btn ghost" data-t="guided">${t('doGuided')}</button><button class="btn ghost" data-t="pause" hidden>${icon('pause', 18)} ${t('pause')}</button><button class="btn" data-t="end" hidden>${t('endSet')}</button></div>`;
  document.body.appendChild(root);
  const appEl = document.getElementById('app');
  if (appEl) appEl.innerHTML = '';
  const $ = <E extends HTMLElement = HTMLElement>(s: string): E => root.querySelector<E>(s) as E;
  const video = $<HTMLVideoElement>('video');
  const canvas = $<HTMLCanvasElement>('canvas.overlay');
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  mountFigs(root);

  // ---------- Image analysée = image affichée ----------
  // L'analyse (MediaPipe) prend 30–80 ms sur un téléphone : si on dessinait le squelette par-dessus la vidéo en direct,
  // il serait toujours en retard sur l'image (doigts « à la traîne »). On copie donc l'image de la caméra dans `frame`,
  // on analyse CETTE copie, puis on la dessine dans le canevas (même cadrage « cover » et même miroir que la vidéo)
  // avec le squelette par-dessus : l'image et le squelette viennent toujours du même instant.
  const frame = document.createElement('canvas');
  const fctx = frame.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  const V = { W: 0, H: 0, fw: 0, fh: 0, t: 0 };
  // miroir = caméra avant (celle que le téléphone a réellement ouverte, pas seulement celle demandée)
  const isMirror = (): boolean => (T.mirror !== null ? T.mirror : T.facing === 'user');
  function sizeCanvas(): void {
    const { W, H } = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    V.W = W;
    V.H = H;
  }
  function grab(now: number): boolean {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;
    const k = Math.min(1, FRAME_MAX / Math.max(vw, vh));
    const fw = Math.round(vw * k);
    const fh = Math.round(vh * k);
    if (frame.width !== fw || frame.height !== fh) {
      frame.width = fw;
      frame.height = fh;
    }
    fctx.drawImage(video, 0, 0, fw, fh);
    V.fw = fw;
    V.fh = fh;
    V.t = now;
    return true;
  }
  // Fond du canevas : l'image analysée (vidéo selfie activée) ou rien (vidéo masquée : squelette seul)
  function paintFrame(): void {
    sizeCanvas();
    const { W, H } = V;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setLineDash([]);
    g.clearRect(0, 0, W, H);
    if (!T.selfView || !V.fw) return;
    const r = fitRect(V.fw, V.fh, W, H, 'cover');
    g.save();
    if (isMirror()) {
      g.translate(W, 0);
      g.scale(-1, 1);
    }
    g.drawImage(frame, r.ox, r.oy, r.w, r.h);
    g.restore();
  }
  const project = (lm: Landmarks): ReturnType<typeof projectLandmarks> =>
    projectLandmarks(lm, V.fw, V.fh, V.W, V.H, 'cover');
  function clearOverlay(): void {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    T.drawn = null;
  }
  // Lissage d'affichage seulement (le compteur reçoit les points bruts), garde-fou « quelqu'un passe derrière », main suivie
  const smooth = new LandmarkSmoother();
  const guard = new SubjectGuard();
  const sideVote = new HandSideVote();
  function resetTrack(): void {
    smooth.reset();
    guard.reset();
    sideVote.reset();
    T.handPrev = null;
    T.wrongHandMs = 0;
    T.drawn = null;
  }
  // État de la superposition (tests de bout en bout : tests/overlay.e2e.mjs)
  (root as HTMLElement & { __overlay?: () => unknown }).__overlay = () => ({
    drawn: T.drawn,
    W: V.W,
    H: V.H,
    fw: V.fw,
    fh: V.fh,
    mirror: isMirror(),
    selfView: T.selfView,
    lm: T.lastLm,
    hand: T.lastHand,
    handInfo: T.handInfo,
    ticks: T.ticks || 0,
    cost: T.cost || 0,
    reps: T.tracker?.reps,
    calibrated: !!T.tracker?.calibrated,
  });

  // Écran toujours allumé pendant la séance (sinon le téléphone se met en veille au milieu d'une série)
  let wake: WakeLockSentinel | null = null;
  const keepAwake = async (): Promise<void> => {
    try {
      if (document.visibilityState === 'visible' && !wake) {
        const w = await navigator.wakeLock.request('screen');
        wake = w;
        w.addEventListener('release', () => {
          wake = null;
        });
      }
    } catch {
      /* écran de veille non disponible */
    }
  };
  const onVis = (): void => {
    if (document.visibilityState === 'visible') void keepAwake();
    else if (T.active && !T.paused) setPause(true);
  };
  document.addEventListener('visibilitychange', onVis);
  void keepAwake();
  function close(): void {
    if (T.closed) return;
    T.closed = true;
    T.tok++;
    T.camGen++; // annule l'ouverture de la caméra et le compte à rebours en cours
    document.removeEventListener('visibilitychange', onVis);
    try {
      if (wake) void wake.release();
    } catch {
      /* déjà relâché */
    }
    T.active = false;
    cancelAnimationFrame(T.raf);
    clearInterval(T.guidedTimer);
    if (T.restTimer) clearInterval(T.restTimer);
    try {
      stopLive();
      stopPlacementListeners();
    } catch (e) {
      console.error('close', e);
    }
    if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop());
    stopSpeech();
    root.remove();
    if (!T.saved && !T.discard) void autosavePartial(); // sorti autrement que par « Abandonner » : on garde les séries terminées
  }
  cleanup.push(close);
  // Séries réellement faites (une série à 0 répétition / 0 s ne compte pas, sauf saisie manuelle)
  const validSets = (): SetRecord[] => validSetsOf(T.sets);
  const inProgress = (): boolean => {
    if (!T.active) return false;
    if (T.mode === 'camera') return (T.tracker?.reps || 0) > 0 || (T.tracker?.holdSec || 0) > 0.5;
    const gd = T.guidedEl ? T.guidedEl() : { el: 0, reps: 0 };
    return dose.type === 'hold' ? gd.el > 0 : gd.reps > 0;
  };
  // Enregistrement automatique des séries terminées quand on quitte sans confirmation possible (retour système, changement d'écran)
  async function autosavePartial(): Promise<void> {
    try {
      if (!validSets().length) return;
      const sess = todaySession(true) as DaySession;
      const it = partialItem(id, level, T.sets, sess.items);
      if (!it) return;
      sess.items = sess.items.filter((i) => i.id !== id).concat(it as unknown as SessionItem);
      await store.saveSession(sess);
      state.data = await store.loadData();
      void syncProgress();
    } catch (e) {
      console.warn('autosave', e);
    }
  }
  function confirmQuit(): void {
    if (root.querySelector('.quit-sheet') || root.querySelector('.sheet-bg')) return;
    if (T.saved || (!validSets().length && !inProgress())) {
      go('#/home');
      return;
    }
    const frozen = T.active && !T.paused;
    if (frozen) T.paused = true; // le compteur s'arrête pendant la question
    const bg = document.createElement('div');
    bg.className = 'sheet-bg quit-sheet';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="quit-h"><div class="grab"></div><h3 id="quit-h">${t('quitTitle')}</h3><p class="muted" style="margin:6px 0 14px">${t('quitBody')}</p>
      <div class="stack" style="gap:8px"><button class="btn" data-q="save">${t('quitSave')}</button><button class="btn soft" data-q="continue">${t('quitContinue')}</button><button class="btn ghost" data-q="discard">${t('quitDiscard')}</button></div></div>`;
    root.appendChild(bg);
    const resume = (): void => {
      bg.remove();
      if (frozen) {
        T.paused = false;
        if (T.tracker) T.tracker.lastT = 0;
      }
    };
    const q = (k: string): HTMLElement => bg.querySelector<HTMLElement>(`[data-q="${k}"]`) as HTMLElement;
    q('continue').onclick = resume;
    bg.addEventListener('click', (e) => {
      if (e.target === bg) resume();
    });
    q('discard').onclick = () => {
      T.discard = true;
      go('#/home');
    };
    q('save').onclick = () => {
      bg.remove();
      if (inProgress()) {
        T.paused = false;
        if (T.mode === 'camera') endSet();
        else endGuided();
      } // la série en cours est terminée, puis bilan
      else {
        if (T.restTimer) clearInterval(T.restTimer);
        T.restTimer = 0;
        T.active = false;
        center('');
        feedbackSheet();
      }
    };
  }
  $('[data-t="close"]').onclick = confirmQuit;

  // Vidéo selfie (on/off) : l'image du patient en direct ; l'analyse continue même si elle est masquée.
  function paintVideoBtn(): void {
    const b = $('[data-t="video"]');
    b.innerHTML = icon(T.selfView ? 'eye' : 'eyeOff', 20);
    b.setAttribute('aria-pressed', String(T.selfView));
    b.setAttribute('aria-label', t(T.selfView ? 'videoOff' : 'videoOn'));
    b.title = b.getAttribute('aria-label') ?? '';
    b.classList.toggle('dim', !T.selfView);
    video.classList.toggle('off', !T.selfView);
    $('[data-t="flip"]').hidden = !T.stream && T.mode !== 'camera'; // aussi quand la vidéo selfie est masquée
    $('.vid-off').hidden = !(T.stream && !T.selfView && T.mode === 'camera' && T.active);
    const sw = root.querySelector('[data-t="selfview"]');
    if (sw) {
      sw.classList.toggle('on', T.selfView);
      sw.setAttribute('aria-checked', String(T.selfView));
    }
  }
  async function setSelfView(on: boolean): Promise<void> {
    T.selfView = on;
    store.saveSettings({ selfView: on });
    // Mode guidé : la vidéo sert de miroir (sans analyse) ; on ouvre / ferme la caméra selon le choix.
    if (T.mode === 'guided' && T.active) {
      if (on) await mirrorOn();
      else {
        if (!T.liveAI) stopCam();
        guidedLayout();
      }
    }
    paintVideoBtn();
  }
  $('[data-t="video"]').onclick = () => void setSelfView(!T.selfView);

  // Démonstration : schéma animé + points clés + étapes, par-dessus la séance
  function openDemo(): void {
    const d = $('.demo');
    d.innerHTML = `<div class="demo-card"><div class="row between"><span class="eyebrow">${t('demoTitle')}</span><button class="icon-btn" data-t="demo-x" aria-label="${t('close')}">${icon('close', 18)}</button></div>
      <h3 style="margin:4px 0 6px">${esc(tr(ex.name))}</h3>${figureBlock(id)}
      <ul class="keylist small">${ex.keys.map((k, i) => `<li><span class="n">${i + 1}</span><span>${esc(tr(k))}</span></li>`).join('')}</ul>
      <ol class="steplist small" style="margin:6px -16px 0">${trList(ex.steps)
        .map((x) => `<li>${esc(x)}</li>`)
        .join('')}</ol>
      <button class="btn" data-t="demo-ok" style="margin-top:12px">${t(T.active ? 'demoBack' : 'close')}</button></div>`;
    d.hidden = false;
    mountFigs(d);
    const shut = (): void => {
      d.hidden = true;
      d.innerHTML = '';
    };
    const dx = d.querySelector<HTMLElement>('[data-t="demo-x"]');
    const dok = d.querySelector<HTMLElement>('[data-t="demo-ok"]');
    if (dx) dx.onclick = shut;
    if (dok) dok.onclick = shut;
    d.onclick = (e) => {
      if (e.target === d) shut();
    };
  }
  $('[data-t="demo"]').onclick = openDemo;

  // Coach IA en direct (Gemini regarde la vidéo) : on/off pendant la séance, sur l'écran de préparation et dans Profil
  function paintAI(): void {
    const b = $('[data-t="ai"]');
    const st = T.liveAI ? T.liveState : 'off';
    b.dataset['state'] = st;
    b.setAttribute('aria-pressed', String(T.liveAI));
    b.title = `${t('liveAI')} · ${t('live_' + st)}`;
    b.setAttribute('aria-label', b.title);
    const sw = root.querySelector('[data-t="liveai"]');
    if (sw) {
      sw.classList.toggle('on', T.liveAI);
      sw.setAttribute('aria-checked', String(T.liveAI));
    }
  }
  const liveCtx = (): {
    ex: ExerciseDef;
    exercise: string;
    condition: string;
    target: number;
    painLimit: number;
    steps: readonly string[];
    keys: string[];
    plane: string;
  } => ({
    ex,
    exercise: ex.name.en ?? '',
    condition: path.name.en || tr(path.name),
    target: dose.type === 'hold' ? holdTarget : dose.reps,
    painLimit: path.painMax ?? 4,
    steps: ex.steps.en || [],
    keys: (ex.keys || []).map((k) => (k as { en?: string }).en || tr(k)),
    plane: T.mode === 'camera' ? planeFor(setIdx()) : 'guided',
  });
  // Visibilité vue par le suivi de l'app (et non par l'impression de l'IA) : la dernière analyse comptée date de moins de 1,5 s
  const subject = (): string => (fine === 'hand' ? 'hand' : fine === 'foot' ? 'foot' : 'body');
  const isTracked = (): boolean => {
    if (T.mode !== 'camera') return fine === 'hand' ? !!T.lastHand : true;
    if (T.lastSt !== T.liveSeen) {
      T.liveSeen = T.lastSt;
      T.liveSeenT = performance.now();
    }
    return performance.now() - (T.liveSeenT || T.liveStartT || 0) < 1500 && (fine !== 'hand' || !!T.lastHand);
  };
  const cues = CUES as unknown as Record<string, { en?: string } | undefined>;
  // Évènements pour le coach en direct : défaut mesuré, sujet perdu > 1,5 s, sujet retrouvé (les répétitions arrivent par onRep)
  function liveWatch(): void {
    if (!T.live?.event || !T.active || T.paused) return;
    const tr_ = isTracked();
    if (!tr_ && !T.liveLost) {
      T.liveLost = true;
      T.live.event('lost', { subject: subject(), sec: 1.5 });
    } else if (tr_ && T.liveLost) {
      T.liveLost = false;
      T.live.event('back', { subject: subject() });
    }
    for (const [k, ts] of T.recentFaults || [])
      if (ts > (T.liveFaultT || 0)) {
        T.liveFaultT = ts;
        T.live.event('fault', { fault: cues[k]?.en || k });
      }
  }
  function liveState(): Record<string, unknown> {
    const base = {
      tracked: isTracked(),
      subject: subject(),
      paused: !!T.paused,
      phase: T.mode === 'camera' ? T.lastSt?.phase || 'calibrating' : 'guided',
    };
    if (T.mode === 'camera' && T.tracker) {
      const now = performance.now();
      const faults = [...(T.recentFaults || new Map<string, number>())]
        .filter(([, ts]) => now - ts < 6000)
        .map(([k]) => cues[k]?.en || k);
      const last = T.tracker.repLog.slice(-1)[0];
      const measures = [
        last?.meas ? `last rep reached ${last.meas.romPct}% of range in ${last.dur}s` : '',
        ...(T.lastSt?.checks || []).map(
          (c) => `${c.cue} ${String(c.value)} (limit ${c.kind === 'max' ? '≤' : '≥'}${String(c.limit)})`,
        ),
      ]
        .filter(Boolean)
        .join('; ');
      return {
        ...base,
        lastRomPct: last?.meas?.romPct ?? null,
        reps: T.tracker.reps,
        target: dose.reps,
        holdSec: dose.type === 'hold' ? Math.floor(T.lastSt?.holdSec || 0) : null,
        faults,
        measures,
      };
    }
    const gd = T.guidedEl ? T.guidedEl() : { el: 0, reps: 0 };
    return dose.type === 'hold'
      ? { ...base, holdSec: gd.el, target: holdTarget, faults: [] }
      : { ...base, reps: gd.reps, target: dose.reps, faults: [] };
  }
  // Contrôle « bon mouvement » vs démonstration + consigne précise quand ça ne correspond pas
  const figView = ex.fig.view || 'side';
  function moveCheck(p: unknown, now: number, camPlane: string | null): unknown {
    if (!T.mm || !T.mm.usable) return null;
    if (camPlane && camPlane !== figView) return null; // filmé dans l'autre plan : angles 2D non comparables
    const progressing =
      (T.lastSt && T.lastSt.phase === 'moving') ||
      now - (T.lastRepT || 0) < 10000 ||
      (T.mode === 'guided' && (dose.type === 'hold' || !!dose.holdTop));
    const st = T.mm.update(p as Parameters<NonNullable<typeof T.mm>['update']>[0], now, { progressing });
    const dtm = T.mvLastT ? Math.min(200, now - T.mvLastT) : 0;
    T.mvLastT = now;
    if (st.status === 'wrong') {
      T.mvWrongMs = (T.mvWrongMs || 0) + dtm; // temps « mauvais mouvement » pendant la répétition en cours
      const k = hintKey(st.issues[0], figView);
      if (now - (T.mvSaid || 0) > 6000 || T.mvKey !== k) {
        T.mvSaid = now;
        T.mvKey = k;
        const txt = `${t('mv_wrong')} ${t(k)}`;
        showCue(txt, 'bad');
        setTimeout(() => {
          if ($('.cue span').textContent === txt) showCue('');
        }, 4000);
        speak(txt, { interrupt: true });
      }
    } else if (T.mvKey && st.status === 'ok') {
      T.mvKey = null;
      if (cue('good')) {
        showCue(cueText('good'), 'good');
        setTimeout(() => showCue(''), 1500);
      }
    }
    return st;
  }
  function startLive(): void {
    if (!T.liveAI || T.live || !T.stream || !T.active) return;
    if ((store.settings().aiMode || 'precise') === 'live' && liveSocketAvailable()) {
      T.liveStartT = performance.now();
      T.liveLost = false;
      T.liveFaultT = performance.now();
      T.liveSeen = T.lastSt;
      T.liveSeenT = T.liveStartT;
      T.live = startLiveCoach({
        video,
        mirror: isMirror(),
        context: liveCtx() as unknown as Parameters<typeof startLiveCoach>[0]['context'],
        getState: liveState,
        frame: () => annotated(512),
        onText: (txt: string, final?: boolean | string) => aiText(txt, final),
        onState: (st: string) => {
          if (st === 'error' && T.liveState !== 'error') toast(t('liveErr'), 4500);
          T.liveState = st;
          paintAI();
        },
      }) as unknown as LiveCoach;
      clearInterval(T.liveWatchT);
      T.liveWatchT = setInterval(liveWatch, 250);
      return;
    }
    const plane = T.mode === 'camera' ? planeFor(setIdx()) : 'guided';
    if (!T.aiAnnounced) {
      T.aiAnnounced = true;
      speak(t('aiOnSpoken'));
    }
    const c = liveCtx();
    const coach = createPreciseCoach(
      {
        ex: ex as unknown as Parameters<typeof createPreciseCoach>[0]['ex'],
        exercise: c.exercise,
        condition: c.condition,
        steps: [...c.steps],
        plane,
        mode: T.mode === 'camera' ? (dose.type === 'hold' ? 'hold' : 'reps') : 'guided',
        target: c.target,
        tempo: dose.tempo || '2-1-2',
      },
      {
        onResult: (v: { text: string; seen?: string }) => {
          aiText(v.text, true, v.seen);
          speakAI(v.text);
        },
        onState: (st: string) => {
          if (st === 'error' && T.liveState !== 'error') toast(t('liveErr'), 4500);
          T.liveState = st;
          paintAI();
        },
      },
    );
    T.live = {
      stop: () => {
        clearInterval(T.aiTimer);
        coach.stop();
      },
      review: coach.review,
    } as unknown as LiveCoach;
    // Maintien : un point toutes les 6 s ; guidé : toutes les 8 s (pas de mesures fines, posture seulement)
    if (T.mode === 'camera' && dose.type === 'hold')
      T.aiTimer = setInterval(() => {
        const st = T.lastSt;
        if (!st || st.phase === 'calibrating' || T.paused) return;
        if (T.mm?.state.status === 'wrong') return;
        coach.review(annotated(), {
          move: T.mm?.describe(),
          holdSec: Math.floor(st.holdSec || 0),
          value: st.value !== null && st.value !== undefined ? +st.value.toFixed(1) : null,
          range: st.range,
          checks: st.checks,
          faults: st.faults,
          metric: null,
        } as unknown as Parameters<typeof coach.review>[1]);
      }, 6000);
    if (T.mode === 'guided') {
      T.aiTimer = setInterval(() => {
        if (!T.paused && T.mm?.state.status !== 'wrong')
          coach.review(annotated(), { move: T.mm?.describe(), faults: [] } as unknown as Parameters<
            typeof coach.review
          >[1]);
      }, 8000);
      void guidedPose();
    }
  }
  function aiText(txt: string, final?: boolean | string, seen?: string): void {
    if (final === 'drop') {
      clearTimeout(T.aiCueT);
      if ($('.cue span').className === 'ai') showCue('');
      return;
    } // remarque identique à la précédente : on ne la ré-affiche pas
    showCue(txt, 'ai');
    clearTimeout(T.aiCueT);
    if (final) {
      T.aiNotes = [...(T.aiNotes || []), seen ? `${txt} (${seen})` : txt].slice(-6);
      T.aiCueT = setTimeout(() => {
        if ($('.cue span').className === 'ai') showCue('');
      }, 4500);
    }
  }
  // Image annotée envoyée à l'IA : vidéo + squelette (articulations fautives en rouge) + angle principal
  const shot = document.createElement('canvas');
  function annotated(w = 384): string | null {
    if (!video.videoWidth) return null;
    // image analysée la plus récente (celle des points) ; à défaut (pas d'analyse en cours) : la vidéo, sans squelette
    const fresh = V.fw && performance.now() - V.t < 400;
    const src = fresh ? frame : video;
    const sw = fresh ? V.fw : video.videoWidth;
    const sh = fresh ? V.fh : video.videoHeight;
    shot.width = w;
    shot.height = Math.round((sh / sw) * w);
    const g2 = shot.getContext('2d') as CanvasRenderingContext2D;
    const mirror = isMirror();
    g2.save();
    if (mirror) {
      g2.translate(w, 0);
      g2.scale(-1, 1);
    }
    g2.drawImage(src, 0, 0, w, shot.height);
    g2.restore();
    if (!fresh) {
      /* points d'une autre image : on ne les dessine pas */
    } else if (handEx || fine === 'hand') {
      if (T.lastHand) drawHand(g2, T.lastHand, w, shot.height, mirror, { keep: true, bad: !!T.lastFj?.size });
    } else if (T.lastLm && fine !== 'foot')
      drawSkeleton(g2, T.lastLm, w, shot.height, T.lastFj || new Set<number>(), mirror, true);
    if (T.lastSt?.value !== null && T.lastSt?.value !== undefined && T.mode === 'camera') {
      g2.fillStyle = 'rgba(0,0,0,.6)';
      g2.fillRect(0, 0, w, 22);
      g2.fillStyle = '#fff';
      g2.font = '13px sans-serif';
      g2.fillText(`${ex.track?.planes[planeFor(setIdx())]?.metric}: ${Math.round(T.lastSt.value * 100) / 100}`, 6, 15);
    }
    return shot.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
  }
  // ---------- Assistant de placement (avant la calibration) ----------
  // Vérifie distance, cadrage, orientation, hauteur / inclinaison du téléphone et lumière (placement.js), affiche et dit le problème principal,
  // puis laisse la calibration normale prendre la suite. Jamais bloquant : bouton « Passer » et limite de PLACE_MAX_MS.
  // Désactivé dans les tests de bout en bout : adresse avec « noplace » (…/index.html?noplace#/train/…) ou window.__noPlacement = true.
  const placementWanted = (): boolean =>
    T.mode === 'camera' &&
    !!ex.track &&
    !PLACED.has(id) &&
    !/noplace/.test(location.href) &&
    !(window as unknown as { __noPlacement?: boolean }).__noPlacement;
  const placeText = (k: string): string => (k.startsWith('wrongHand') ? t(k) : t('pl_' + k));
  const placeKey = (): string | null => store.aiKey();
  const lumaCv = document.createElement('canvas');
  // Luminance (0–255) sur une image réduite à 64 px : moyenne, centre (boîte du sujet, sinon milieu) et bords (hors sujet)
  function sampleLuma(box: Box | null): Luma | null {
    try {
      if (!V.fw) return null;
      const w = 64;
      const h = Math.max(8, Math.round((V.fh / V.fw) * 64));
      lumaCv.width = w;
      lumaCv.height = h;
      const c = lumaCv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      c.drawImage(frame, 0, 0, w, h);
      const d = c.getImageData(0, 0, w, h).data;
      const b = box
        ? {
            x0: Math.max(0, box.x0 - 0.04),
            x1: Math.min(1, box.x1 + 0.04),
            y0: Math.max(0, box.y0 - 0.04),
            y1: Math.min(1, box.y1 + 0.04),
          }
        : { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 };
      let sa = 0;
      let na = 0;
      let sc = 0;
      let nc = 0;
      let se = 0;
      let ne = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const l = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
          const u = (x + 0.5) / w;
          const v = (y + 0.5) / h;
          sa += l;
          na++;
          if (u >= b.x0 && u <= b.x1 && v >= b.y0 && v <= b.y1) {
            sc += l;
            nc++;
          } else if (u < 0.15 || u > 0.85 || v < 0.15 || v > 0.85) {
            se += l;
            ne++;
          }
        }
      const mean = sa / na;
      return { mean, center: nc ? sc / nc : mean, edges: ne ? se / ne : mean };
    } catch {
      return null;
    }
  }
  function stopPlacementListeners(): void {
    const Pl = T.place;
    if (!Pl) return;
    clearTimeout(Pl.timer);
    clearTimeout(Pl.hideT);
    if (Pl.onOri) {
      try {
        window.removeEventListener('deviceorientation', Pl.onOri);
      } catch {
        /* déjà retiré */
      }
      Pl.onOri = null;
    }
  }
  function drawGuideBox(Pl: Placement, ok: boolean): void {
    const r = guideRect(Pl.kind, Pl.plane, Pl.scope);
    const k = Math.max(1, V.W / 400);
    const X = r.x * V.W;
    const Y = r.y * V.H;
    const w = r.w * V.W;
    const h = r.h * V.H;
    const rad = Math.min(w, h) * 0.12;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineWidth = 3 * k;
    g.setLineDash([10 * k, 8 * k]);
    g.strokeStyle = ok ? '#3ccf7b' : '#ffb020';
    g.beginPath();
    if (typeof g.roundRect === 'function') g.roundRect(X, Y, w, h, rad);
    else g.rect(X, Y, w, h);
    g.stroke();
    g.restore();
  }
  const icons = ICON_SVG as unknown as Record<string, string | undefined>;
  function renderPlace(Pl: Placement, key: string | null, kind: string): void {
    const box = $('.place');
    const txt = key ? (kind === 'ok' ? t('pl_perfect') : placeText(key)) : t('pl_checking');
    box.hidden = false;
    box.dataset['state'] = kind;
    if (Pl.shownKey !== key + kind) {
      Pl.shownKey = key + kind;
      $('.place-ico').innerHTML = icons[kind === 'ok' ? 'ok' : key ? issueIcon(Pl.top) : 'eye'] ?? '';
      $('.place-txt').textContent = txt;
    }
  }
  function startPlacement(): void {
    if (T.mode !== 'camera' || !ex.track) return;
    stopPlacementListeners();
    const pl = planeFor(setIdx());
    const spec = ex.track.planes[pl];
    if (!spec) return;
    const Pl: Placement = {
      on: true,
      t0: performance.now(),
      gate: new PlacementGate(),
      kind: handEx ? 'hand' : 'body',
      plane: pl as 'side' | 'front',
      metric: spec.metric,
      scope: scopeOf(spec.metric),
      palm: handEx ? palmNeed(spec.metric) : null,
      luma: null,
      lumaT: 0,
      tilt: null,
      spokenKey: null,
      spokenT: 0,
      aiBusy: false,
      aiN: 0,
      shownKey: null,
      top: null,
      last: null,
      box: null,
    };
    T.place = Pl;
    // Inclinaison du téléphone : capteur d'orientation (Android / WebView : pas de permission ; iOS l'exige → on ne s'en sert pas)
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: unknown };
      if ('DeviceOrientationEvent' in window && typeof DOE.requestPermission !== 'function') {
        Pl.onOri = (e) => {
          if (e.beta !== null && e.gamma !== null) Pl.tilt = { beta: e.beta, gamma: e.gamma };
        };
        window.addEventListener('deviceorientation', Pl.onOri);
      }
    } catch {
      /* capteur d'inclinaison indisponible */
    }
    Pl.timer = setTimeout(() => {
      if (T.place === Pl && Pl.on) {
        toast(t('pl_timeout'), 3500);
        finishPlacement('timeout');
      }
    }, PLACE_MAX_MS);
    $('[data-t="replace"]').hidden = true;
    $('.place-ai').hidden = true;
    $('[data-t="place-ai"]').hidden = !placeKey();
    showCue('');
    renderPlace(Pl, null, 'wait');
    resetTrack();
    T.lastSt = null;
  }
  function finishPlacement(how: string): void {
    const Pl = T.place;
    if (!Pl || !Pl.on) return;
    Pl.on = false;
    PLACED.add(id);
    if (Pl.onOri) {
      try {
        window.removeEventListener('deviceorientation', Pl.onOri);
      } catch {
        /* déjà retiré */
      }
      Pl.onOri = null;
    }
    clearTimeout(Pl.timer);
    if (how === 'ok') {
      renderPlace(Pl, 'ok', 'ok');
      speak(t('pl_perfect'), { interrupt: true });
      Pl.hideT = setTimeout(() => {
        $('.place').hidden = true;
      }, 1300);
    } else $('.place').hidden = true;
    resetTrack();
    if (T.tracker && T.tracker.reps === 0) T.tracker.lastT = 0;
    $('[data-t="replace"]').hidden = false;
  }
  function placeStep(now: number, d: { lm?: Landmarks | null; hand?: Landmarks | null; wrongHand?: boolean }): void {
    const Pl = T.place;
    if (!Pl || !Pl.on) return;
    if (now - Pl.lumaT > 300) {
      Pl.lumaT = now;
      let bx: Box | null = null;
      if (d.lm) bx = subjectBox(d.lm, Pl.scope);
      else if (d.hand) {
        const hp = Array.from(d.hand);
        const xs = hp.map((p) => p.x);
        const ys = hp.map((p) => p.y);
        bx = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      }
      Pl.luma = sampleLuma(bx);
    }
    const a = assessPlacement({
      kind: Pl.kind,
      plane: Pl.plane,
      side: curSide(),
      metric: Pl.metric,
      scope: Pl.scope as string,
      lm: d.lm ?? null,
      hand: d.hand ?? null,
      wrongHand: d.wrongHand as boolean,
      palm: Pl.palm as 'side' | 'front' | null,
      frameW: V.fw,
      frameH: V.fh,
      mirror: isMirror(),
      luma: Pl.luma,
      tilt: Pl.tilt,
    });
    Pl.last = a;
    const r = Pl.gate.push(a, now);
    Pl.top = r.issue;
    drawGuideBox(Pl, a.ok);
    $('.place-bar i').style.width = `${Math.round(r.progress * 100)}%`;
    if (r.stable) {
      finishPlacement('ok');
      return;
    }
    const key: string | null = r.issue ? r.issue.key : null;
    renderPlace(Pl, key, key ? 'bad' : 'wait');
    // voix : seulement quand le problème change, au moins 3 s après la dernière phrase
    if (key && key !== Pl.spokenKey && now - Pl.spokenT >= 3000) {
      Pl.spokenKey = key;
      Pl.spokenT = now;
      if (t('pl_' + key) !== 'pl_' + key || key.startsWith('wrongHand')) speak(placeText(key), { interrupt: true });
    }
    if (!key) Pl.spokenKey = null;
    // coach IA : seul, avec « coach IA » activé et une clé (3,5 s puis 12 s si ça ne s'arrange pas) ; sinon sur demande (bouton)
    if (
      !a.ok &&
      store.settings().liveAI &&
      placeKey() &&
      !Pl.aiBusy &&
      ((Pl.aiN === 0 && now - Pl.t0 > 3500) || (Pl.aiN === 1 && now - Pl.t0 > 12000))
    )
      void placeAdvice(false);
  }
  async function placeAdvice(manual: boolean): Promise<void> {
    const Pl = T.place;
    const key = placeKey();
    if (!Pl || !Pl.on || Pl.aiBusy || !key || !Pl.last) return;
    Pl.aiBusy = true;
    Pl.aiN++;
    try {
      const img = annotated(512);
      if (!img) return;
      const lang = aiLangInfo();
      const sys =
        `You help a patient place their phone camera so that an exercise-tracking app can see them well. Answer in ${lang?.label}, informal register (in French use "tu"), maximum 2 short concrete sentences, spoken style, no greeting, no markdown. ` +
        `Only talk about camera placement: distance, camera height, angle, left/right position, lighting, cluttered background, clothing that blends with the background. Never contradict the local measurements given; if they list no issue, give at most one small tip.`;
      const cam = ex.track?.cam ? tr(ex.track.cam) : t(Pl.plane === 'side' ? 'setupSide' : 'setupFront');
      const text = `Exercise: ${ex.name.en || tr(ex.name)}. Wanted camera setup: ${cam}\n${measurementsText({ plane: Pl.plane, kind: Pl.kind }, Pl.last.info, Pl.last.issues, Pl.luma)}`;
      const r = await geminiDirect(key, sys, [{ text }, { inline_data: { mime_type: 'image/jpeg', data: img } }], 90);
      if (!r || T.place !== Pl || !Pl.on) return;
      const el = $('.place-ai');
      el.textContent = r;
      el.hidden = false;
      const now = performance.now();
      if (now - Pl.spokenT >= 3000 || manual) {
        Pl.spokenT = now;
        speakAI(r, { interrupt: true });
      }
    } catch {
      /* silencieux : les consignes locales continuent */
    } finally {
      Pl.aiBusy = false;
    }
  }
  $('[data-t="place-skip"]').onclick = () => finishPlacement('skip');
  $('[data-t="place-ai"]').onclick = () => void placeAdvice(true);
  $('[data-t="replace"]').onclick = () => {
    if (!T.active || !T.tracker || T.place?.on || !T.mkTracker) return;
    T.tracker = T.mkTracker();
    PLACED.delete(id);
    startPlacement();
  };

  // Mode guidé + coach IA : squelette sur le miroir (si le modèle de pose est disponible) pour des images annotées
  async function guidedPose(): Promise<void> {
    if (T.gpRun) return;
    if (fine === 'foot') return; // gros plan du pied : le squelette du corps n'a pas de sens
    if (fine === 'hand') return guidedHands();
    T.gpRun = true;
    try {
      await loadPose();
    } catch {
      T.gpRun = false;
      return;
    }
    const mm = new MoveMatcher(ex);
    T.mm = mm;
    T.mvKey = null;
    let lastTurn = 0;
    const pace = new Pacer(HZ.guided);
    resetTrack();
    const tick = (): void => {
      if (!T.active || T.mode !== 'guided' || !T.stream) {
        T.gpRun = false;
        clearOverlay();
        return;
      }
      requestAnimationFrame(tick);
      const now = performance.now();
      if (T.paused || !pace.due(now) || !grab(now)) return;
      const gd = guard.check(detect(frame, now), now, V.fw / V.fh);
      const lm = gd.lm;
      T.lastLm = lm ?? null;
      pace.done(now, performance.now());
      paintFrame();
      if (!lm) {
        smooth.reset();
        T.drawn = null;
        return;
      }
      const p = toPx(lm, V.fw, V.fh);
      if (bodyVisible(p) && !gd.jumped) {
        const dp = detectPlane(p);
        const plane = dp === 'side' || dp === 'front' ? dp : null;
        if (plane && plane !== figView && now - lastTurn > 9000 && mm.usable) {
          lastTurn = now;
          const k = figView === 'side' ? 'turnSide' : 'turnFront';
          cue(k);
          showCue(t(k), 'bad');
        }
        moveCheck(p, now, plane);
      }
      if (T.selfView) {
        const proj = project(smooth.apply(lm, now));
        T.drawn = drawSkeleton(g, proj, V.W, V.H, new Set<number>(), isMirror(), true);
        if (T.guides) drawGuides(g, proj, V.W, V.H, T.mm as NonNullable<typeof T.mm>, isMirror());
      }
    };
    requestAnimationFrame(tick);
  }
  // Mode guidé d'un exercice de la main (ex. glissements tendineux) : squelette de la main sur le miroir et dans les images de l'IA
  async function guidedHands(): Promise<void> {
    if (T.gpRun) return;
    T.gpRun = true;
    try {
      await loadHands();
    } catch {
      T.gpRun = false;
      return;
    }
    const pace = new Pacer(HZ.guided);
    resetTrack();
    const tick = (): void => {
      if (!T.active || T.mode !== 'guided' || !T.stream) {
        T.gpRun = false;
        clearOverlay();
        return;
      }
      requestAnimationFrame(tick);
      const now = performance.now();
      if (T.paused || !pace.due(now) || !grab(now)) return;
      const hd = pickHand(detectHands(frame, now), curSide(), T.handPrev);
      pace.done(now, performance.now());
      T.handPrev = hd;
      T.lastHand = hd ? hd.lm : null;
      paintFrame();
      if (hd && T.selfView)
        T.drawn = drawHand(g, project(smooth.apply(hd.lm, now)), V.W, V.H, isMirror(), { keep: true });
      else {
        T.drawn = null;
        if (!hd) smooth.reset();
      }
    };
    requestAnimationFrame(tick);
  }
  // Retourne true si la voix du coach en direct jouait encore (elle s'éteint en fondu de 60 ms)
  function stopLive(): boolean {
    clearInterval(T.aiTimer);
    clearInterval(T.liveWatchT);
    const was = !!T.live && isPlaying('live');
    if (T.live) {
      T.live.stop();
      T.live = null;
    }
    T.liveState = 'off';
    paintAI();
    return was;
  }
  const afterLive = (was: boolean, fn: () => void): void => {
    const f = (): void => {
      if (!T.closed) fn();
    };
    if (was) setTimeout(f, 90);
    else f();
  }; // laisse finir le fondu avant de parler : jamais deux voix
  function setLiveAI(on: boolean): void {
    if (on && !liveAvailable()) {
      toast(t('liveNeedKey'), 5000);
      return;
    }
    primeAudio();
    T.liveAI = on;
    store.saveSettings({ liveAI: on });
    if (on) {
      if (T.mode === 'guided' && T.active && !T.stream) void mirrorOn();
      else startLive();
    } else stopLive();
    paintAI();
  }
  $('[data-t="ai"]').onclick = () => setLiveAI(!T.liveAI);
  $('.mini-fig').onclick = openDemo;

  function setLabel(): void {
    $('#setlbl').textContent =
      `${t('set')} ${T.set + 1} ${t('of')} ${totalSets} · ${doseText(dose)}${curSide() ? ' · ' + t(curSide() === 'L' ? 'sideL' : 'sideR') : ''}${item?.flare ? ' · ' + t('flareShort') : ''}`;
    if (T.mode === 'camera') {
      const pl = planeFor(setIdx());
      const k = pl === 'hand' ? 'Hand' : pl === 'side' ? 'Side' : 'Front';
      $('#pbadge').innerHTML =
        `<span class="plane-badge">${icon(pl === 'hand' ? 'hand' : pl === 'side' ? 'side' : 'front', 14)} ${t('plane' + k)} · ${t('plane' + k + 'D')}</span>`;
    } else $('#pbadge').innerHTML = '';
  }
  function showCue(text: string | null | undefined, kind?: string): void {
    const c = $('.cue');
    c.hidden = !text;
    const sp = c.querySelector('span');
    if (!sp) return;
    sp.textContent = text || '';
    sp.className = kind || '';
  }
  function center(html?: string): void {
    const c = $('.center-msg');
    c.hidden = !html;
    c.innerHTML = html || '';
  }

  function setup(): void {
    $('.bottom').hidden = false;
    setLabel();
    showCue('');
    center('');
    {
      const c = root.querySelector<HTMLElement>('#cnt');
      const r = root.querySelector<HTMLElement>('#ring');
      if (c) c.textContent = '0';
      if (r) r.style.strokeDashoffset = String(RING);
    } // affichage seulement : repart à 0 à chaque série
    $('[data-t="end"]').hidden = true;
    $('[data-t="pause"]').hidden = true;
    $('.counter').hidden = true;
    $('.depth').hidden = true;
    $('.mini-fig').hidden = true;
    const s = $('.setup');
    s.hidden = false;
    if (T.mode === 'camera') {
      const pl = planeFor(setIdx());
      s.innerHTML = `<span class="eyebrow">${t('setupTitle')}</span><h3 style="margin:6px 0 4px">${pl === 'hand' ? esc(tr(ex.track?.cam)) : t(pl === 'side' ? 'setupSide' : 'setupFront')}</h3>
        ${sideRow()}${eqNote()}${figureBlock(id, { keys: false })}<p class="small muted">${t(pl === 'hand' ? 'setupHandTip' : 'setupTip')}</p>
        ${selfRow('selfViewD')}${liveRow()}
        <button class="btn" data-t="go">${icon('cam', 20)} ${t('camStart')}</button>`;
      $('[data-t="guided"]').hidden = false;
    } else {
      s.innerHTML = `<h3>${esc(tr(ex.name))}</h3>${sideRow()}${eqNote()}${figureBlock(id)}
        <ol class="steplist small" style="margin:6px -16px">${trList(ex.steps)
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ol>
        ${hasCam() ? selfRow('mirrorD') + liveRow() : ''}
        <button class="btn" data-t="go">${IC['play']?.replace('<svg', '<svg width="18" height="18"')} ${t('start')}</button>`;
      $('[data-t="guided"]').hidden = true;
    }
    mountFigs(s);
    const sv = s.querySelector<HTMLElement>('[data-t="selfview"]');
    if (sv) sv.onclick = () => void setSelfView(!T.selfView);
    const la = s.querySelector<HTMLElement>('[data-t="liveai"]');
    if (la) la.onclick = () => setLiveAI(!T.liveAI);
    s.querySelectorAll<HTMLElement>('[data-side]').forEach((b) => {
      b.onclick = () => {
        sideMode = b.dataset['side'] ?? null;
        totalSets = sideMode === 'both' ? baseSets * 2 : baseSets;
        void updateProfile({
          sides: { ...(curProfile()['sides'] as Record<string, string> | undefined), [id]: sideMode ?? '' },
          side: curProfile()['side'] || sideMode,
        });
        setup();
      };
    });
    const go_ = s.querySelector<HTMLElement>('[data-t="go"]') as HTMLElement;
    go_.addEventListener('click', () => {
      if (curSide()) speak(t(curSide() === 'L' ? 'sideLSpoken' : 'sideRSpoken'), { interrupt: true });
    });
    paintVideoBtn();
    paintAI();
    go_.addEventListener('click', primeAudio);
    go_.onclick = () => {
      if (T.mode === 'camera') void startCamera();
      else startGuided();
    };
  }
  // Choix du côté : modifiable avant la 1re série ; ensuite on affiche le côté de la série en cours
  const sideRow = (): string => {
    if (!uni) return '';
    if (T.sets.length)
      return `<div class="side-now">${icon('user', 16)} ${t(curSide() === 'L' ? 'sideL' : 'sideR')}${sideMode === 'both' ? ` · ${t('sideBothNote')}` : ''}</div>`;
    return `<div class="toggle selfrow" style="display:block"><span><b>${t('sideLbl')}</b></span><div class="seg" style="margin-top:8px">${['L', 'R', 'both'].map((v) => `<button data-side="${v}" class="${sideMode === v ? 'on' : ''}">${t(v === 'L' ? 'sideLeft' : v === 'R' ? 'sideRight' : 'sideBoth')}</button>`).join('')}</div>${sideMode === 'both' ? `<small class="muted">${t('sideBothD', { n: baseSets })}</small>` : ''}</div>`;
  };
  const eqNote = (): string => {
    const m: string[] = missing(id, haveList(prof));
    return m.length
      ? `<div class="banner neg small" style="margin:4px 0 8px">${icon('shield', 18)}<div>${m.map((e) => `<b>${esc(tr(EQUIP[e]))}</b> → ${t('sub_' + e)}`).join('<br>')}</div></div>`
      : '';
  };
  const liveRow = (): string =>
    `<div class="toggle selfrow"><span><b>${icon('spark', 16)} ${t('liveAI')}</b><br><small class="muted">${t(liveAvailable() ? 'liveAID' : 'liveNeedKey')}</small></span><button class="switch ${T.liveAI ? 'on' : ''}" data-t="liveai" role="switch" aria-checked="${T.liveAI}" aria-label="${t('liveAI')}"></button></div>`;
  const selfRow = (d: string): string =>
    `<div class="toggle selfrow"><span><b>${icon('eye', 16)} ${t('selfView')}</b><br><small class="muted">${t(d)}</small></span><button class="switch ${T.selfView ? 'on' : ''}" data-t="selfview" role="switch" aria-checked="${T.selfView}" aria-label="${t('selfView')}"></button></div>`;
  $('[data-t="guided"]').onclick = () => {
    T.tok++;
    T.mode = 'guided';
    stopCam();
    setup();
  };
  $('[data-t="flip"]').onclick = async () => {
    T.facing = T.facing === 'user' ? 'environment' : 'user';
    store.saveSettings({ camera: T.facing });
    if (T.stream) {
      stopCam();
      try {
        await openCam();
      } catch (e) {
        if (T.closed) return;
        console.warn(e);
        toast(t('mirrorErr'), 4000);
      }
    }
  };
  function stopCam(): void {
    T.camGen++;
    stopLive();
    if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop());
    T.stream = null;
    video.srcObject = null;
    video.hidden = true;
    V.fw = 0;
    clearOverlay();
    paintVideoBtn();
  }
  // Retourne false si la séance a été fermée (ou la caméra arrêtée) pendant l'ouverture : le flux est alors coupé aussitôt
  async function openCam(): Promise<boolean> {
    const gen = T.camGen;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: T.facing, width: { ideal: 960 }, height: { ideal: 720 } },
    });
    if (T.closed || gen !== T.camGen) {
      stream.getTracks().forEach((tk) => tk.stop());
      return false;
    }
    T.stream = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      if (T.closed || gen !== T.camGen) {
        stream.getTracks().forEach((tk) => tk.stop());
        if (T.stream === stream) T.stream = null;
        return false;
      }
      throw e;
    }
    if (T.closed || gen !== T.camGen) {
      stream.getTracks().forEach((tk) => tk.stop());
      if (T.stream === stream) T.stream = null;
      return false;
    }
    video.hidden = false;
    // caméra réellement ouverte (un téléphone peut donner l'autre caméra que celle demandée) : le miroir suit la vraie caméra
    let fm: string | null;
    try {
      fm = T.stream.getVideoTracks()[0]?.getSettings?.().facingMode || null;
    } catch {
      fm = null;
    }
    T.mirror = (fm === 'user' || fm === 'environment' ? fm : T.facing) === 'user';
    video.classList.toggle('mirror', T.mirror);
    resetTrack();
    paintVideoBtn();
    return true;
  }
  // Mode guidé avec vidéo : le patient se voit en miroir, le schéma passe en vignette
  async function mirrorOn(): Promise<void> {
    try {
      if (!T.stream && !(await openCam())) return;
    } catch (e) {
      if (T.closed) return;
      console.warn(e);
      toast(e instanceof Error && e.name === 'NotAllowedError' ? t('camDenied') : t('mirrorErr'), 4000);
      T.selfView = false;
    }
    if (T.closed) return;
    guidedLayout();
    startLive();
    if (T.stream && T.active) void guidedPose();
  }
  function guidedLayout(): void {
    if (T.mode !== 'guided' || !T.active) return;
    const live = !!(T.stream && T.selfView);
    $('.mini-fig').hidden = !live;
    if (live) center('');
    else {
      center(`<div class="guided-fig">${figSvg(id, { keys: true })}</div>`);
      const cm = root.querySelector('.center-msg');
      if (cm) mountFigs(cm);
    }
  }

  async function startCamera(): Promise<void> {
    $('.setup').hidden = true;
    center(`<div><div class="spinner"></div>${t('loadingModel')}</div>`);
    const tok = ++T.tok;
    const gone = (): boolean => T.closed || tok !== T.tok;
    try {
      if (!T.stream && !(await openCam())) {
        if (!T.closed && tok === T.tok) {
          center('');
          T.mode = 'guided';
          setup();
        }
        return;
      }
      await (handEx ? loadHands() : loadPose());
      if (gone()) return;
    } catch (e) {
      if (gone()) return;
      console.error(e);
      center('');
      stopCam();
      toast(e instanceof Error && e.name === 'NotAllowedError' ? t('camDenied') : t('modelErr'), 4500);
      T.mode = 'guided';
      setup();
      return;
    }
    const willPlace = placementWanted();
    if (!willPlace) {
      for (const n of [3, 2, 1]) {
        if (gone()) return;
        center(`<div class="bignum">${n}</div>`);
        speak(String(n), { interrupt: true });
        await sleep(900);
      }
      if (gone()) return;
      center('');
      speak(cueText('go'));
    }
    if (gone()) return;
    runSet();
    if (willPlace) startPlacement(); // l'assistant de placement remplace le compte à rebours : on compte (calibration) quand le cadrage est bon
  }

  function runSet(): void {
    const pl = planeFor(setIdx());
    const recentFaults = new Map<string, number>();
    T.recentFaults = recentFaults;
    T.mm = new MoveMatcher(ex);
    T.mvKey = null;
    T.mvWrongMs = 0;
    T.mvLastT = 0;
    T.frame = null;
    resetTrack();
    T.ticks = 0;
    const mkTracker = (): TrackerT =>
      new Tracker(ex as unknown as ConstructorParameters<typeof Tracker>[0], pl, {
        side: curSide(),
        romFactor: dose.romFactor,
        onCue: (k: string) => {
          if (cue(k)) {
            showCue(cueText(k), k === 'holdIt' || k === 'depth' ? '' : 'bad');
            recentFaults.set(k, performance.now());
            setTimeout(() => showCue(''), 2200);
          }
        },
        onRep: (rep: { full: boolean; dur: number; faults: string[]; meas?: { romPct: number } | null }) => {
          const tk = T.tracker as TrackerT;
          T.lastRepT = performance.now();
          countAloud(tk.reps);
          if (store.settings().vibrate !== false) {
            try {
              navigator.vibrate(rep.full ? 35 : [20, 60, 20]);
            } catch {
              /* vibration indisponible */
            }
          }
          // répétition jugée « mauvais mouvement » seulement si le mouvement ne correspondait pas pendant ≥ 35 % de sa durée
          if ((T.mvWrongMs || 0) >= 350 * rep.dur) {
            tk.flagRep('wrongMove');
            rep = tk.repLog[tk.repLog.length - 1] as typeof rep;
          }
          T.mvWrongMs = 0;
          T.live?.event?.('rep', {
            n: tk.reps,
            romPct: rep.meas?.romPct ?? null,
            faults: (rep.faults || []).map((k) => cues[k]?.en || k),
          });
          if (T.live?.review && !rep.faults.includes('wrongMove')) {
            T.live.review(
              T.kf || annotated(),
              { ...rep.meas, dur: rep.dur, faults: rep.faults, move: T.mm?.describe() },
              tk.repLog.slice(-4, -1).map((r: { n: number; meas?: { romPct: number } | null; faults: string[] }) => ({
                n: r.n,
                romPct: r.meas?.romPct,
                faults: r.faults,
              })),
            );
            T.kf = null;
            T.kfP = 0;
          }
          if (rep.full && !rep.faults.length && tk.full % 3 === 0 && cue('great')) {
            showCue(cueText('great'), 'good');
            setTimeout(() => showCue(''), 1500);
          }
          if (dose.type !== 'hold' && tk.reps === dose.reps - 1) setTimeout(() => cue('lastRep'), 600);
          if (store.settings().sendFrame && (!T.frame || rep.faults.length)) T.frame = grabFrame(video, isMirror());
          if (dose.type !== 'hold' && tk.reps >= dose.reps) setTimeout(endSet, 900);
        },
      } as unknown as ConstructorParameters<typeof Tracker>[2]);
    T.tracker = mkTracker();
    T.mkTracker = mkTracker;
    $('.counter').hidden = false;
    $('.depth').hidden = dose.type === 'hold';
    $('.mini-fig').hidden = false;
    paintVideoBtn();
    $('[data-t="end"]').hidden = false;
    $('[data-t="guided"]').hidden = true;
    $('[data-t="pause"]').hidden = false;
    $('[data-t="replace"]').hidden = false;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    $('#cnt').textContent = '0';
    $('#ring').style.strokeDashoffset = String(RING);
    T.active = true;
    T.paused = false;
    startLive();
    let lastWarn = 0;
    // Compteur, anneau, barre d'amplitude ; retourne true si la série est terminée
    const hud = (st: StepState): boolean => {
      if (!$('[data-t="replace"]').hidden && ((st.reps || 0) > 0 || (st.holdSec || 0) > 0.5))
        $('[data-t="replace"]').hidden = true; // une fois qu'on compte, plus de recadrage (la calibration serait perdue)
      if (
        T.live?.review &&
        st.phase === 'moving' &&
        (st.progress || 0) > (T.kfP || 0) + 0.04 &&
        performance.now() - (T.kfT || 0) > 180
      ) {
        T.kf = annotated();
        T.kfP = st.progress || 0;
        T.kfT = performance.now();
      }
      if (st.phase === 'calibrating') showCue(t(handEx ? 'calibratingHand' : 'calibrating'));
      else if ([t('calibrating'), t('calibratingHand')].includes($('.cue span').textContent ?? '')) showCue('');
      if (dose.type === 'hold') {
        $('#cnt').textContent = String(Math.floor(st.holdSec || 0));
        $('#ring').style.strokeDashoffset = String(RING * (1 - Math.min(1, (st.holdSec || 0) / holdTarget)));
        if ((st.holdSec || 0) >= holdTarget) {
          endSet();
          return true;
        }
      } else {
        $('#cnt').textContent = String(st.reps || 0);
        $('#ring').style.strokeDashoffset = String(RING * (1 - Math.min(1, (st.reps || 0) / dose.reps)));
        $('.depth i').style.height = `${Math.round((st.progress || 0) * 100)}%`;
      }
      return false;
    };
    const pace = new Pacer(handEx ? HZ.hand : HZ.body);
    const tock = (now: number): void => {
      pace.done(now, performance.now());
      T.ticks = (T.ticks || 0) + 1;
      T.cost = pace.cost;
    };
    if (handEx) {
      const loopHand = (): void => {
        if (!T.active) return;
        T.raf = requestAnimationFrame(loopHand);
        const now = performance.now();
        if (T.paused || !pace.due(now) || !grab(now)) return;
        const side = curSide();
        const hd = pickHand(detectHands(frame, now), side, T.handPrev);
        tock(now);
        T.handPrev = hd;
        paintFrame();
        if (T.place?.on) {
          // placement : on montre la main, on ne compte pas encore
          if (hd) {
            T.drawn = drawHand(g, project(smooth.apply(hd.lm, now)), V.W, V.H, isMirror(), {
              keep: true,
              bad: !handInFrame(hd.lm),
            });
            T.lastHand = hd.lm;
            T.handInfo = { label: hd.label, score: hd.score, world: !!hd.world };
          } else {
            smooth.reset();
            T.lastHand = null;
            T.drawn = null;
          }
          const ws = hd ? sideVote.push(hd, side) : false;
          placeStep(now, { hand: hd ? hd.lm : null, wrongHand: ws });
          return;
        }
        if (!hd) {
          smooth.reset();
          T.lastHand = null;
          T.drawn = null;
          T.handInfo = null;
          if (now - lastWarn > 3000) {
            lastWarn = now;
            cue('handInView');
            showCue(cueText('handInView'), 'bad');
          }
          return;
        }
        const inFrame = handInFrame(hd.lm);
        T.drawn = drawHand(g, project(smooth.apply(hd.lm, now)), V.W, V.H, isMirror(), { keep: true, bad: !inFrame });
        T.lastHand = hd.lm;
        T.lastFj = new Set<number>();
        T.handInfo = { label: hd.label, score: hd.score, world: !!hd.world };
        if (!inFrame && now - lastWarn > 4000) {
          lastWarn = now;
          if (cue('handInView')) showCue(cueText('handInView'), 'bad');
        }
        const tk = T.tracker as TrackerT;
        // Avant de commencer à compter : la main montrée est clairement celle de l'autre côté → on le dit (6 s au plus,
        // ensuite on compte quand même : de profil, l'étiquette gauche / droite du modèle peut se tromper)
        const wrongSide = !tk.calibrated && sideVote.push(hd, side);
        if (side && hd.label && !tk.calibrated && !sideVote.ready) return; // 6 premières images : on vérifie d'abord de quelle main il s'agit
        if (wrongSide && (T.wrongHandMs || 0) < 6000) {
          T.wrongHandMs = (T.wrongHandMs || 0) + Math.min(200, now - (T.wrongHandT || now));
          T.wrongHandT = now;
          if (now - lastWarn > 4000) {
            lastWarn = now;
            const k = side === 'L' ? 'wrongHandL' : 'wrongHandR';
            showCue(t(k), 'bad');
            speak(t(k), { interrupt: true });
            setTimeout(() => {
              if ($('.cue span').textContent === t(k)) showCue('');
            }, 3500);
          }
          return;
        }
        T.wrongHandT = 0;
        // main qui sort de l'image : points extrapolés, mesures fausses → on ne compte pas ces images
        if (!handInFrame(hd.lm, 0.04)) return;
        const st: StepState = tk.update({ hand: handPx(hd.lm, V.fw, V.fh), hand3: hd.world || null }, now);
        T.lastSt = st;
        hud(st);
        // condition de l'exercice non respectée (opposition du pouce faite poing fermé) : ces mouvements ne comptent pas → on le dit
        const gk: string | undefined = st.guard ? (tk.spec.guard as { cue?: string } | undefined)?.cue : undefined;
        if (gk && t(gk) !== gk && (st.phase === 'calibrating' || now - lastWarn > 6000)) {
          showCue(t(gk), 'bad');
          if (now - lastWarn > 6000) {
            lastWarn = now;
            if (!T.live) speak(t(gk));
            else
              T.live.event?.('fault', {
                fault: 'closing the hand into a fist instead of touching one fingertip with the thumb (does not count)',
              });
            setTimeout(() => {
              if ($('.cue span').textContent === t(gk)) showCue('');
            }, 3500);
          }
        }
      };
      T.raf = requestAnimationFrame(loopHand);
      return;
    }
    const loop = (): void => {
      if (!T.active) return;
      T.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (T.paused || !pace.due(now) || !grab(now)) return;
      const gd = guard.check(detect(frame, now), now, V.fw / V.fh);
      const lm = gd.lm;
      tock(now);
      paintFrame();
      const fj = new Set<number>();
      const fjoints = FAULT_JOINTS as unknown as Record<string, number[] | undefined>;
      for (const [k, ts] of recentFaults) if (now - ts < 1500) (fjoints[k] || []).forEach((j) => fj.add(j));
      if (T.place?.on) {
        // placement : on montre le squelette, on ne compte pas encore
        if (lm) {
          T.drawn = drawSkeleton(g, project(smooth.apply(lm, now)), V.W, V.H, fj, isMirror(), true);
        } else {
          smooth.reset();
          T.drawn = null;
        }
        T.lastLm = lm ?? null;
        T.lastFj = fj;
        placeStep(now, { lm: lm ?? null });
        return;
      }
      if (!lm) {
        smooth.reset();
        T.drawn = null;
        return;
      }
      const proj = project(smooth.apply(lm, now));
      T.drawn = drawSkeleton(g, proj, V.W, V.H, fj, isMirror(), true);
      T.lastLm = lm ?? null;
      T.lastFj = fj;
      if (gd.jumped) return; // quelqu'un passe derrière : on garde le squelette du patient, on ne compte pas cette image
      const p = toPx(lm, V.fw, V.fh);
      if (!bodyVisible(p)) {
        if (now - lastWarn > 3000) {
          lastWarn = now;
          cue('notVisible');
          showCue(t('notVisible'), 'bad');
        }
        return;
      }
      const tk = T.tracker as TrackerT;
      const dp = detectPlane(p);
      if (dp && dp !== 'between' && dp !== pl && !tk.calibrated) {
        if (now - lastWarn > 3500) {
          lastWarn = now;
          const k = pl === 'side' ? 'turnSide' : 'turnFront';
          cue(k);
          showCue(t(k), 'bad');
        }
        return;
      }
      const st: StepState = tk.update(p, now);
      T.lastSt = st;
      if (tk.calibrated) {
        moveCheck(p, now, pl);
        if (T.guides) drawGuides(g, proj, V.W, V.H, T.mm as NonNullable<typeof T.mm>, isMirror());
      }
      // image clé = point le plus avancé de la répétition (dans hud)
      hud(st);
    };
    T.raf = requestAnimationFrame(loop);
  }
  $('[data-t="end"]').onclick = () => {
    if (T.paused) setPause(false);
    if (T.mode === 'camera') endSet();
    else endGuided();
  };
  // Pause : le compteur, l'analyse et le coach IA s'arrêtent ; reprise là où on en était
  function setPause(on: boolean): void {
    if (!T.active || T.paused === on) return;
    T.paused = on;
    const b = $('[data-t="pause"]');
    b.innerHTML = `${icon(on ? 'play' : 'pause', 18)} ${t(on ? 'resume' : 'pause')}`;
    b.classList.toggle('on', on);
    if (on) {
      const was = stopLive();
      showCue('');
      clearOverlay(); // en pause : la vidéo en direct, sans squelette figé
      center(
        `<div class="rest-box"><span class="eyebrow">${t('pausedLbl')}</span><p class="small" style="opacity:.8;margin:6px 0 14px">${t('pausedD')}</p><button class="btn sm" data-t="resume">${icon('play', 16)} ${t('resume')}</button></div>`,
      );
      const rb = root.querySelector<HTMLElement>('[data-t="resume"]');
      if (rb) rb.onclick = () => setPause(false);
      afterLive(was, () => speak(t('pausedSpoken'), { interrupt: true }));
    } else {
      center('');
      if (T.mode === 'guided') guidedLayout();
      if (T.tracker) T.tracker.lastT = 0; // pas de saut de temps au maintien
      speak(cueText('go'), { interrupt: true });
      startLive();
    }
  }
  $('[data-t="pause"]').onclick = () => setPause(!T.paused);

  function endSet(): void {
    if (!T.active) return;
    T.active = false;
    const was = stopLive();
    cancelAnimationFrame(T.raf);
    clearOverlay();
    showCue('');
    const sum = (T.tracker as TrackerT).summary() as SetSummary;
    const pl = planeFor(setIdx());
    const empty = isEmptySet(sum);
    T.sets.push({
      side: curSide(),
      plane: pl,
      mode: sum.mode,
      reps: sum.reps,
      full: sum.full,
      partial: sum.partial,
      holdSec: sum.holdSec,
      quality: sum.quality,
      faults: sum.faults,
      ...(empty ? { empty: true } : {}),
    });
    afterLive(was, () => {
      if (empty) {
        speak(t('noRepsMsg'), { interrupt: true });
        emptySheet({ ...sum, plane: pl });
        return;
      }
      speak(cueText('setDone'), { interrupt: true });
      summarySheet({ ...sum, plane: pl });
    }); // d'abord la voix en direct s'éteint, ensuite seulement bilan et voix
  }

  function startGuided(): void {
    $('.setup').hidden = true;
    $('.counter').hidden = false;
    $('[data-t="end"]').hidden = false;
    $('[data-t="guided"]').hidden = true;
    $('[data-t="pause"]').hidden = false;
    T.active = true;
    T.paused = false;
    if ((T.selfView || T.liveAI) && hasCam()) void mirrorOn();
    else guidedLayout();
    const tempo = String(dose.tempo || '2-1-2')
      .split('-')
      .map(Number);
    const repSec = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (dose.holdTop || 0));
    let el = 0;
    let reps = 0;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    $('#cnt').textContent = '0';
    $('#ring').style.strokeDashoffset = String(RING);
    speak(cueText('go'));
    T.guidedTimer = setInterval(() => {
      if (T.paused) return;
      el++;
      if (dose.type === 'hold') {
        $('#cnt').textContent = String(el);
        $('#ring').style.strokeDashoffset = String(RING * (1 - Math.min(1, el / holdTarget)));
        const left = holdTarget - el;
        if ([10, 5, 3, 2, 1].includes(left)) speak(String(left), { interrupt: true });
        if (el >= holdTarget) endGuided();
      } else if (el % repSec === 0) {
        reps++;
        countAloud(reps);
        $('#cnt').textContent = String(reps);
        $('#ring').style.strokeDashoffset = String(RING * (1 - Math.min(1, reps / dose.reps)));
        if (reps >= dose.reps) endGuided();
      }
    }, 1000);
    T.guidedEl = () => ({ el, reps });
  }
  function endGuided(): void {
    if (!T.active || !T.guidedEl) return;
    T.active = false;
    const was = stopLive();
    clearInterval(T.guidedTimer);
    center('');
    $('.mini-fig').hidden = true;
    const { el, reps } = T.guidedEl();
    const sum = guidedSummary(dose, el, reps);
    const empty = isEmptySet(sum);
    T.sets.push({ side: curSide(), plane: 'guided', ...sum, ...(empty ? { empty: true } : {}) });
    afterLive(was, () => {
      if (empty) {
        speak(t('noRepsMsg'), { interrupt: true });
        emptySheet({ ...sum, plane: 'guided' });
        return;
      }
      speak(cueText('setDone'), { interrupt: true });
      summarySheet({ ...sum, plane: 'guided' });
    });
  }

  // Repos entre les séries (réglable dans l'aperçu de la séance)
  function restThen(fn: () => void): void {
    let left: number = dose.rest ?? 0;
    if (!left) {
      fn();
      return;
    }
    $('.bottom').hidden = true;
    $('.setup').hidden = true;
    const done = (): void => {
      if (T.restTimer) clearInterval(T.restTimer);
      T.restTimer = 0;
      center('');
      fn();
    };
    center(
      `<div class="rest-box"><span class="eyebrow">${t('restLbl')}</span><div class="bignum" id="restn">${left}</div><p class="small" style="opacity:.75;margin:0 0 14px">${t('restNext', { n: T.set + 1, tot: totalSets })}</p><button class="btn sm ghost" data-t="skiprest">${t('restSkip')}</button></div>`,
    );
    const sk = root.querySelector<HTMLElement>('[data-t="skiprest"]');
    if (sk) sk.onclick = done;
    speak(t('restSpoken', { n: left }), { interrupt: true });
    T.restTimer = setInterval(() => {
      left--;
      const el = root.querySelector('#restn');
      if (el) el.textContent = String(left);
      if ([3, 2, 1].includes(left)) speak(String(left), { interrupt: true });
      if (left <= 0) done();
    }, 1000);
  }
  // Série sans aucune répétition / seconde détectée : on ne la compte pas ; saisie manuelle ou nouvel essai
  function emptySheet(sum: SetSummary): void {
    $('.bottom').hidden = true;
    const hold = sum.mode === 'hold';
    const others = validSets().length > 0;
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><span class="eyebrow">${t('set')} ${T.set + 1}/${totalSets}</span><h3 style="margin-top:4px">${t('noRepsTitle')}</h3>
      <p style="margin:8px 0 16px">${t('noRepsMsg')}</p>
      <div class="stack" style="gap:8px"><button class="btn" data-e="manual">${t('noRepsManual')}</button><button class="btn soft" data-e="redo">${icon('flip', 16)} ${t('redoSet')}</button><button class="btn ghost" data-e="leave">${t(others ? 'finishEx' : 'noRepsLeave')}</button></div></div>`;
    root.appendChild(bg);
    const e = (k: string): HTMLElement => bg.querySelector<HTMLElement>(`[data-e="${k}"]`) as HTMLElement;
    e('redo').onclick = () => {
      bg.remove();
      T.sets.pop();
      setup();
    };
    e('leave').onclick = () => {
      bg.remove();
      T.sets.pop();
      if (others) feedbackSheet();
      else {
        T.discard = true;
        go('#/home');
      }
    };
    e('manual').onclick = () => {
      let n: number = hold ? holdTarget : dose.reps;
      const { max, step } = manualBounds(hold, holdTarget);
      const sh = bg.querySelector<HTMLElement>('.sheet') as HTMLElement;
      sh.innerHTML = `<div class="grab"></div><h3>${t('noRepsManual')}</h3><p class="muted small" style="margin:6px 0 14px">${t(hold ? 'manualHoldLbl' : 'manualRepsLbl')}</p>
        <div class="toggle"><span>${t(hold ? 'manualHoldLbl' : 'manualRepsLbl')}</span><div class="stepper"><button data-m="-1" aria-label="−">−</button><b class="tnum" id="mval">${n}</b><button data-m="1" aria-label="+">+</button></div></div>
        <button class="btn" data-m="ok" style="margin-top:14px">${t('manualOk')}</button>`;
      const paint = (): void => {
        const mv = sh.querySelector('#mval');
        if (mv) mv.textContent = String(n);
      };
      sh.querySelectorAll<HTMLElement>('[data-m="-1"],[data-m="1"]').forEach((b) => {
        b.onclick = () => {
          n = Math.max(1, Math.min(max, n + step * +(b.dataset['m'] ?? 0)));
          paint();
        };
      });
      const ok = sh.querySelector<HTMLElement>('[data-m="ok"]');
      if (ok)
        ok.onclick = () => {
          bg.remove();
          const ls = T.sets[T.sets.length - 1];
          const m = manualSummary(hold, n);
          if (ls) {
            Object.assign(ls, m, { manual: true });
            Reflect.deleteProperty(ls, 'empty');
          }
          summarySheet({ ...sum, ...m, manual: true });
        };
    };
  }
  function summarySheet(sum: SetSummary): void {
    $('.bottom').hidden = true;
    const last = T.set + 1 >= totalSets;
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    // Mouvement conforme à la démonstration (part du temps), puis remise à zéro pour la série suivante
    const moveOk = moveMatchPct(T.mm, sum.manual);
    if (T.mm) T.mm.resetStats();
    applyMoveMismatch(sum, moveOk);
    const ls = T.sets[T.sets.length - 1];
    if (ls) {
      ls.faults = sum.faults;
      ls.quality = sum.quality;
      ls.moveOk = moveOk;
      if (sum.manual) ls.manual = true;
    }
    const faults = sortedFaults(sum);
    const reps = (sum.reps_detail || []).slice(-12);
    const data = setSummaryData({
      exercise: tr(ex.name),
      condition: tr(path.name),
      sum,
      level,
      dose,
      holdTarget,
      painMax: path.painMax as number,
      set: T.set,
      totalSets,
      moveOk,
      aiNotes: T.aiNotes,
    });
    const local = localSetComment(sum, moveOk, data);
    const hasAI = aiAvailable();
    bg.innerHTML = `<div class="sheet"><div class="grab"></div><span class="eyebrow">${t('set')} ${T.set + 1}/${totalSets}${sum.manual ? ` · ${t('manualTag')}` : ''}</span><h3 style="margin-top:4px">${t('setSummary')}</h3>
      <div class="list" style="margin:12px 0"><div class="kpis">${
        sum.mode === 'hold'
          ? `<div><b>${sum.holdSec}s</b><span>${t('holdTime')}</span></div>`
          : `<div><b>${sum.full}</b><span>${t('fullReps')}</span></div><div><b>${sum.partial}</b><span>${t('partialReps')}</span></div>`
      }
        <div><b>${sum.quality !== null ? Math.round(sum.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div>
        ${moveOk !== null ? `<div><b class="${moveOk >= 85 ? 'pos' : moveOk < 70 ? 'neg' : ''}">${moveOk}%</b><span>${t('moveMatch')}</span></div>` : ''}</div></div>
      ${
        faults.length
          ? `<div class="row wrap" style="gap:6px;margin-bottom:12px">${faults
              .slice(0, 3)
              .map(([k]) => `<span class="chip neg">${esc(cueText(k))}</span>`)
              .join('')}</div>`
          : ''
      }
      ${
        reps.length
          ? `<details class="reps-tbl"><summary>${t('repTable')}</summary><table><thead><tr><th>#</th><th>${t('colRange')}</th><th>${t('colTime')}</th><th>${t('colIssues')}</th></tr></thead><tbody>
        ${reps.map((r) => `<tr><td>${r.n}</td><td class="${(r.meas?.romPct ?? 100) >= 90 ? 'pos' : 'neg'}">${r.meas ? Math.min(150, r.meas.romPct) + '%' : '–'}</td><td>${r.dur}s</td><td>${r.faults.length ? r.faults.map((f) => esc(cueText(f))).join(', ') : '✓'}</td></tr>`).join('')}
        </tbody></table></details>`
          : ''
      }
      <div class="list"><div class="coach-box"><span class="ai">${icon('spark', 18)}</span><div><b class="small">${t('coachSays')}</b><p id="coachtxt">${esc(local)}</p>${hasAI ? `<small id="aist" class="muted">${t('aiPending')}</small>` : ''}</div></div></div>
      <div class="row" style="margin-top:14px">${last ? `<button class="btn" data-s="finish">${t('finishEx')}</button>` : `<button class="btn ghost" data-s="finish">${t('finishEx')}</button><button class="btn" data-s="next">${t('nextSet')}</button>`}</div>
      <button class="btn soft" data-s="redo" style="margin-top:10px">${icon('flip', 16)} ${t('redoSet')}</button></div>`;
    root.appendChild(bg);
    T.aiNotes = [];
    if (!hasAI || (moveOk !== null && moveOk < 70)) {
      speak(local);
      bg.querySelector('#aist')?.remove();
    } else
      void coachComment(data, store.settings().sendFrame ? (T.frame as string | null) : null).then(
        ({ text, source }: { text: string; source: string }) => {
          if (!bg.isConnected) return;
          bg.querySelector('#aist')?.remove();
          if (source === 'gemini') {
            const p = bg.querySelector('#coachtxt');
            if (p) p.textContent = text;
            speakRich(text);
          } else speak(local);
        },
      );
    const sb = (k: string): HTMLElement | null => bg.querySelector<HTMLElement>(`[data-s="${k}"]`);
    const fin = sb('finish');
    if (fin)
      fin.onclick = () => {
        bg.remove();
        feedbackSheet();
      };
    const rd = sb('redo');
    if (rd)
      rd.onclick = () => {
        bg.remove();
        T.sets.pop();
        setup();
      }; // reprendre la même série
    const nx = sb('next');
    if (nx)
      nx.onclick = () => {
        bg.remove();
        T.set++;
        restThen(setup);
      };
  }

  function feedbackSheet(): void {
    $('.bottom').hidden = true;
    const all = sessions();
    const sess = todaySession(true) as DaySession;
    const needCheckin = !sess.checkin && !sess.items.length && all.length > 0;
    const painBase = (prof['painBase'] as number | undefined) ?? 2;
    const fb: { pain: number; difficulty: number; checkin: string | undefined; note: string } = {
      pain: Math.min(painBase, path.painMax as number),
      difficulty: 3,
      checkin: sess.checkin as string | undefined,
      note: '',
    };
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    let dict: { stop: () => void } | null = null;
    let micState = 'idle';
    let saving = false;
    const micLabel = (): string =>
      micState === 'listening'
        ? `${icon('close', 14)} ${t('micStop')}`
        : micState === 'transcribing'
          ? `<span class="spinner sm"></span> ${t('micTranscribing')}`
          : `${icon('mic', 16)} ${t('micStart')}`;
    const draw = (): void => {
      const over = fb.pain > (path.painMax as number);
      bg.innerHTML = `<div class="sheet"><div class="grab"></div><h3>${t('feedbackTitle')}</h3>
        ${
          needCheckin
            ? `<div class="card" style="margin:12px 0"><b class="small">${t('checkinTitle')}</b><p class="small muted" style="margin:2px 0 8px">${t('checkinQ')}</p>
          <div class="seg">${['better', 'same', 'worse'].map((k) => `<button data-ci="${k}" class="${fb.checkin === k ? 'on' : ''}">${t(k)}</button>`).join('')}</div></div>`
            : ''
        }
        <div class="card" style="margin:12px 0"><div class="row between"><b>${t('painDuring')}</b><span class="mid ${over ? 'neg' : ''}" id="pv">${fb.pain}</span></div>
        <input type="range" min="0" max="10" value="${fb.pain}" id="pain" aria-label="${t('painDuring')}"><div class="scale"><span>0</span><span>${t('limit')} ${path.painMax}</span><span>10</span></div>
        <div id="pw" class="banner neg" style="margin-top:8px" ${over ? '' : 'hidden'}>${t('painStop')}</div></div>
        <b>${t('difficulty')}</b><div class="seg" style="margin:8px 0 14px">${[1, 2, 3, 4, 5].map((n) => `<button data-df="${n}" class="${fb.difficulty === n ? 'on' : ''}">${t('d' + n)}</button>`).join('')}</div>
        <label class="field comment-box"><span>${t('commentLabel')}</span><textarea class="input" id="note" placeholder="${t('commentPh')}" maxlength="400">${esc(fb.note)}</textarea></label>
        <div class="mic-row" style="margin:-4px 0 16px"><button class="mic-btn ${micState === 'listening' ? 'rec' : ''}" id="mic" type="button" ${micState === 'transcribing' ? 'disabled' : ''}>${micLabel()}</button><small class="muted" id="micmsg">${micState === 'listening' ? t('micListening') : ''}</small></div>
        <button class="btn" data-s="save" ${needCheckin && !fb.checkin ? 'disabled' : ''}>${t('save')}</button></div>`;
      bg.querySelectorAll<HTMLElement>('[data-ci]').forEach((b) => {
        b.onclick = () => {
          fb.checkin = b.dataset['ci'];
          draw();
        };
      });
      bg.querySelectorAll<HTMLElement>('[data-df]').forEach((b) => {
        b.onclick = () => {
          fb.difficulty = +(b.dataset['df'] ?? 0);
          draw();
        };
      });
      const r = bg.querySelector<HTMLInputElement>('#pain') as HTMLInputElement;
      r.oninput = () => {
        fb.pain = +r.value;
        const pv = bg.querySelector<HTMLElement>('#pv') as HTMLElement;
        pv.textContent = r.value;
        pv.classList.toggle('neg', fb.pain > (path.painMax as number));
        (bg.querySelector<HTMLElement>('#pw') as HTMLElement).hidden = fb.pain <= (path.painMax as number);
      };
      const note = bg.querySelector<HTMLTextAreaElement>('#note') as HTMLTextAreaElement;
      note.oninput = () => {
        fb.note = note.value;
      };
      (bg.querySelector<HTMLElement>('#mic') as HTMLElement).onclick = () => void mic();
      (bg.querySelector<HTMLElement>('[data-s="save"]') as HTMLElement).onclick = () => void save();
    };
    // Dictée : le texte s'ajoute à ce que le patient a déjà écrit
    async function mic(): Promise<void> {
      if (micState === 'listening') {
        if (dict) dict.stop();
        return;
      }
      if (!dictationMode()) {
        toast(t('micKeyboard'), 4000);
        bg.querySelector<HTMLElement>('#note')?.focus();
        return;
      }
      const base = fb.note ? fb.note.trim() + ' ' : '';
      dict = await startDictation({
        onText: (txt: string) => {
          if (saving) return;
          fb.note = (base + (txt || '')).slice(0, 400);
          const n = bg.querySelector<HTMLTextAreaElement>('#note');
          if (n) n.value = fb.note;
        },
        onState: (st: string) => {
          if (saving) return;
          if (st === 'denied') {
            toast(t('micDenied'), 4500);
            st = 'idle';
          }
          if (st === 'error') {
            toast(t('micErr'), 4000);
            st = 'idle';
          }
          if (st === 'unavailable') {
            toast(t('micKeyboard'), 4000);
            st = 'idle';
          }
          micState = st;
          const y = bg.querySelector('.sheet')?.scrollTop;
          draw();
          const sh = bg.querySelector('.sheet');
          if (sh && y !== undefined) sh.scrollTop = y;
        },
      });
    }
    async function save(): Promise<void> {
      if (saving) return;
      saving = true;
      const sets = validSets();
      if (!sets.length) {
        T.discard = true;
        go('#/home');
        return;
      } // rien de réellement fait : ni niveau ni série du jour
      T.saved = true;
      if (dict && micState === 'listening') dict.stop();
      const noteTxt = (fb.note || '').trim();
      if (needCheckin) sess.checkin = fb.checkin;
      const { item: it, adj } = finishItem(
        { id, level, sets, pain: fb.pain, difficulty: fb.difficulty, note: fb.note },
        prof,
        all,
        sess.checkin as string | undefined,
        sess.items,
      );
      sess.items = sess.items.filter((i) => i.id !== id).concat(it as unknown as SessionItem);
      await store.saveSession(sess);
      await store.saveProfile({
        ...curProfile(),
        levels: { ...(curProfile()['levels'] as Record<string, number> | undefined), [id]: adj.level },
      });
      state.data = await store.loadData();
      void syncProgress();
      if (curProfile()['role'] !== 'clinician')
        void import('../../../www/js/badges.js')
          .then((m) => m.syncBadges())
          .catch((e: unknown) => console.warn('badges', e));
      toast(levelToastText(adj));
      const nx = nextAfterSave(id, nextExercise(), state.redoQueue);
      if (state.redoQueue?.length && nx.redoQueue === null) state.redoQueue = null;
      const nxt = nx.next;
      const leave = (): void => {
        bg.remove();
        go(nxt ? `#/ex/${nxt.id}` : '#/home');
      };
      if (!noteTxt) {
        leave();
        return;
      }
      // Le coach répond au commentaire (Gemini si disponible, sinon accusé de réception)
      bg.innerHTML = `<div class="sheet"><div class="grab"></div><h3>${t('coachReply')}</h3>
        <div class="card small" style="margin:12px 0"><span class="muted">« ${esc(noteTxt)} »</span></div>
        <div class="list"><div class="coach-box"><span class="ai">${icon('spark', 18)}</span><div><p id="rep" class="muted">${aiAvailable() ? t('thinking') : t('lcReplyLocal')}</p></div></div></div>
        <button class="btn" id="go" style="margin-top:14px">${t('next')}</button></div>`;
      (bg.querySelector<HTMLElement>('#go') as HTMLElement).onclick = leave;
      if (aiAvailable()) {
        const { text } = await coachReply({
          exercise: tr(ex.name),
          condition: tr(path.name),
          pain: fb.pain,
          painLimit: path.painMax,
          difficulty: fb.difficulty,
          comment: noteTxt,
        });
        const p = bg.querySelector('#rep');
        if (p) {
          p.textContent = text;
          p.classList.remove('muted');
          speakRich(text);
        }
      }
    }
    draw();
    root.appendChild(bg);
    speak(t('feedbackAsk'), { interrupt: true });
  }

  setup();
}
