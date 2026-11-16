// Séance d'un exercice : caméra (pose 2D, 2 plans) ou mode guidé, résumé, rétroaction et ajustement du niveau.
import { t, tr, aiLangInfo } from './i18n.js';
import { EXERCISES, UNILATERAL } from './data/exercises.js';
import * as P from './program.js';
import * as store from './store.js';
import { loadPose, detect, toPx, Tracker, drawSkeleton, FAULT_JOINTS, detectPlane, bodyVisible } from './pose.js';
import { speak, speakAI, stopSpeech, cue, cueText, countAloud, coachComment, localComment, coachReply, speakRich, grabFrame, startDictation, dictationMode, aiAvailable, geminiDirect } from './coach.js';
import { state, go, profile, sessions, todaySession, nextExercise, syncProgress, updateProfile } from './state.js';
import { esc, icon, IC, toast, mountFigs, figSvg, figureBlock, sleep } from './ui.js';
import { startLiveCoach, liveAvailable, liveSocketAvailable, primeAudio } from './live.js';
import { isPlaying } from './audio.js';
import { createPreciseCoach, fineKind } from './ai-coach.js';
import { loadHands, detectHands, pickHand, handPx, drawHand, handInFrame, HandSideVote } from './hand.js';
import { canvasSize, fitRect, projectLandmarks, LandmarkSmoother, SubjectGuard, Pacer } from './overlay.js';
import { MoveMatcher, drawGuides, hintKey } from './movematch.js';
import { haveList, missing } from './equip.js';
import { EQUIP } from './data/exercises.js';
import { CUES } from './i18n.js';
import { assessPlacement, PlacementGate, scopeOf, palmNeed, guideRect, subjectBox, measurementsText, issueIcon, ICON_SVG } from './placement.js';

// Placement déjà fait (ou passé) pendant cette session : exercice → pas de nouvelle vérification aux séries suivantes (bouton « Recadrer » pour la rouvrir)
const PLACED = new Set();
const PLACE_MAX_MS = 25000; // au bout de ce délai on commence quand même (jamais de blocage)

const RING = 276.5;
// Cadence d'analyse (images / s) : assez pour compter juste, sans saturer le téléphone
const HZ = { hand: 18, body: 25, guided: 15 };
const FRAME_MAX = 960; // plus grand côté de l'image analysée et affichée (pixels)

export function doseText(d) {
  if (d.type === 'hold') return `${d.sets > 1 ? d.sets + ' × ' : ''}${d.reps > 1 ? d.reps + ' × ' : ''}${d.hold} ${t('sec')}`;
  return `${d.sets} × ${d.reps}${d.holdTop ? ` · ${t('hold')} ${d.holdTop} ${t('sec')}` : ''}`;
}

export function viewTrain(id, cleanup) {
  const ex = EXERCISES[id]; if (!ex) return go('#/home');
  const prof = profile();
  const item = P.todaysProgram(prof).find((x) => x.id === id);
  const level = item ? item.level : P.levelOf(prof, id);
  const dose = item ? item.dose : P.doseFor(id, level, P.inFlare(prof));
  const path = P.pathologyById(prof.pathology) || { name: { fr: 'Exercice libre', en: 'Free exercise' }, painMax: 4 };
  const planes = ex.track ? Object.keys(ex.track.planes) : [];
  const handEx = ex.track?.kind === 'hand'; // poignet / main / pouce : suivi des 21 points de la main
  const fine = fineKind(ex);
  const baseSets = dose.type === 'hold' ? dose.sets * (dose.reps || 1) : dose.sets;
  // Côté travaillé (exercices unilatéraux) : gauche, droit ou les deux (séries alternées)
  const uni = UNILATERAL.has(id);
  let sideMode = uni ? (prof.sides?.[id] || prof.side || 'both') : null;
  let totalSets = sideMode === 'both' ? baseSets * 2 : baseSets;
  const curSide = () => (!uni ? null : sideMode === 'both' ? (T.set % 2 === 0 ? 'L' : 'R') : sideMode);
  const setIdx = () => (sideMode === 'both' ? Math.floor(T.set / 2) : T.set);
  const T = { set: 0, sets: [], stream: null, raf: 0, tracker: null, mode: ex.track ? 'camera' : 'guided', facing: store.settings().camera, active: false, guidedTimer: null, selfView: store.settings().selfView !== false, guides: store.settings().guides !== false, liveAI: !!store.settings().liveAI && liveAvailable(), live: null, liveState: 'off', closed: false, camGen: 0, tok: 0, saved: false, discard: false };
  const planeFor = (i) => planes[i % planes.length];
  const holdTarget = dose.type === 'hold' ? dose.hold : 0;

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
  document.getElementById('app').innerHTML = '';
  const $ = (s) => root.querySelector(s);
  const video = $('video'), canvas = $('canvas.overlay'), g = canvas.getContext('2d');
  mountFigs(root);

  // ---------- Image analysée = image affichée ----------
  // L'analyse (MediaPipe) prend 30–80 ms sur un téléphone : si on dessinait le squelette par-dessus la vidéo en direct,
  // il serait toujours en retard sur l'image (doigts « à la traîne »). On copie donc l'image de la caméra dans `frame`,
  // on analyse CETTE copie, puis on la dessine dans le canevas (même cadrage « cover » et même miroir que la vidéo)
  // avec le squelette par-dessus : l'image et le squelette viennent toujours du même instant.
  const frame = document.createElement('canvas'), fctx = frame.getContext('2d', { alpha: false });
  const V = { W: 0, H: 0, fw: 0, fh: 0, t: 0 };
  // miroir = caméra avant (celle que le téléphone a réellement ouverte, pas seulement celle demandée)
  const isMirror = () => (T.mirror != null ? T.mirror : T.facing === 'user');
  function sizeCanvas() {
    const { W, H } = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    V.W = W; V.H = H;
  }
  function grab(now) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;
    const k = Math.min(1, FRAME_MAX / Math.max(vw, vh)), fw = Math.round(vw * k), fh = Math.round(vh * k);
    if (frame.width !== fw || frame.height !== fh) { frame.width = fw; frame.height = fh; }
    fctx.drawImage(video, 0, 0, fw, fh);
    V.fw = fw; V.fh = fh; V.t = now;
    return true;
  }
  // Fond du canevas : l'image analysée (vidéo selfie activée) ou rien (vidéo masquée : squelette seul)
  function paintFrame() {
    sizeCanvas();
    const { W, H } = V;
    g.setTransform(1, 0, 0, 1, 0, 0); g.setLineDash([]);
    g.clearRect(0, 0, W, H);
    if (!T.selfView || !V.fw) return;
    const r = fitRect(V.fw, V.fh, W, H, 'cover');
    g.save(); if (isMirror()) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(frame, r.ox, r.oy, r.w, r.h); g.restore();
  }
  const project = (lm) => projectLandmarks(lm, V.fw, V.fh, V.W, V.H, 'cover');
  function clearOverlay() { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); T.drawn = null; }
  // Lissage d'affichage seulement (le compteur reçoit les points bruts), garde-fou « quelqu'un passe derrière », main suivie
  const smooth = new LandmarkSmoother(), guard = new SubjectGuard(), sideVote = new HandSideVote();
  function resetTrack() { smooth.reset(); guard.reset(); sideVote.reset(); T.handPrev = null; T.wrongHandMs = 0; T.drawn = null; }
  // État de la superposition (tests de bout en bout : tests/overlay.e2e.mjs)
  root.__overlay = () => ({ drawn: T.drawn, W: V.W, H: V.H, fw: V.fw, fh: V.fh, mirror: isMirror(), selfView: T.selfView, lm: T.lastLm, hand: T.lastHand, handInfo: T.handInfo, ticks: T.ticks || 0, cost: T.cost || 0, reps: T.tracker?.reps, calibrated: !!T.tracker?.calibrated });

  // Écran toujours allumé pendant la séance (sinon le téléphone se met en veille au milieu d'une série)
  let wake = null;
  const keepAwake = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible' && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (_) {} };
  const onVis = () => { if (document.visibilityState === 'visible') keepAwake(); else if (T.active && !T.paused) setPause(true); };
  document.addEventListener('visibilitychange', onVis); keepAwake();
  function close() {
    if (T.closed) return;
    T.closed = true; T.tok++; T.camGen++; // annule l'ouverture de la caméra et le compte à rebours en cours
    document.removeEventListener('visibilitychange', onVis); try { wake && wake.release(); } catch (_) {}
    T.active = false; cancelAnimationFrame(T.raf); clearInterval(T.guidedTimer); clearInterval(T.restTimer);
    try { stopLive(); stopPlacementListeners(); } catch (e) { console.error('close', e); }
    if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop());
    stopSpeech();
    root.remove();
    if (!T.saved && !T.discard) autosavePartial(); // sorti autrement que par « Abandonner » : on garde les séries terminées
  }
  cleanup.push(close);
  // Séries réellement faites (une série à 0 répétition / 0 s ne compte pas, sauf saisie manuelle)
  const validSets = () => T.sets.filter((x) => !x.empty && (x.manual || (x.mode === 'hold' ? x.holdSec > 0 : x.reps > 0)));
  const inProgress = () => {
    if (!T.active) return false;
    if (T.mode === 'camera') return (T.tracker?.reps || 0) > 0 || (T.tracker?.holdSec || 0) > 0.5;
    const gd = T.guidedEl ? T.guidedEl() : { el: 0, reps: 0 };
    return dose.type === 'hold' ? gd.el > 0 : gd.reps > 0;
  };
  // Enregistrement automatique des séries terminées quand on quitte sans confirmation possible (retour système, changement d'écran)
  async function autosavePartial() {
    try {
      const sets = validSets(); if (!sets.length) return;
      const sess = todaySession(true);
      const prev = sess.items.find((i) => i.id === id);
      if (prev && !prev.partial) return; // un exercice déjà terminé aujourd'hui n'est pas écrasé
      const it = { id, level, sets, partial: true, ts: Date.now() };
      sess.items = sess.items.filter((i) => i.id !== id).concat(it);
      await store.saveSession(sess);
      state.data = await store.loadData();
      syncProgress();
    } catch (e) { console.warn('autosave', e); }
  }
  function confirmQuit() {
    if (root.querySelector('.quit-sheet') || root.querySelector('.sheet-bg')) return;
    if (T.saved || (!validSets().length && !inProgress())) return go('#/home');
    const frozen = T.active && !T.paused; if (frozen) T.paused = true; // le compteur s'arrête pendant la question
    const bg = document.createElement('div'); bg.className = 'sheet-bg quit-sheet';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="quit-h"><div class="grab"></div><h3 id="quit-h">${t('quitTitle')}</h3><p class="muted" style="margin:6px 0 14px">${t('quitBody')}</p>
      <div class="stack" style="gap:8px"><button class="btn" data-q="save">${t('quitSave')}</button><button class="btn soft" data-q="continue">${t('quitContinue')}</button><button class="btn ghost" data-q="discard">${t('quitDiscard')}</button></div></div>`;
    root.appendChild(bg);
    const resume = () => { bg.remove(); if (frozen) { T.paused = false; if (T.tracker) T.tracker.lastT = 0; } };
    bg.querySelector('[data-q="continue"]').onclick = resume;
    bg.addEventListener('click', (e) => { if (e.target === bg) resume(); });
    bg.querySelector('[data-q="discard"]').onclick = () => { T.discard = true; go('#/home'); };
    bg.querySelector('[data-q="save"]').onclick = () => {
      bg.remove();
      if (inProgress()) { T.paused = false; T.mode === 'camera' ? endSet() : endGuided(); } // la série en cours est terminée, puis bilan
      else { clearInterval(T.restTimer); T.restTimer = 0; T.active = false; center(''); feedbackSheet(); }
    };
  }
  $('[data-t="close"]').onclick = confirmQuit;

  // Vidéo selfie (on/off) : l'image du patient en direct ; l'analyse continue même si elle est masquée.
  function paintVideoBtn() {
    const b = $('[data-t="video"]');
    b.innerHTML = icon(T.selfView ? 'eye' : 'eyeOff', 20);
    b.setAttribute('aria-pressed', String(T.selfView)); b.setAttribute('aria-label', t(T.selfView ? 'videoOff' : 'videoOn')); b.title = b.getAttribute('aria-label');
    b.classList.toggle('dim', !T.selfView);
    video.classList.toggle('off', !T.selfView);
    $('[data-t="flip"]').hidden = !T.stream && T.mode !== 'camera'; // aussi quand la vidéo selfie est masquée
    $('.vid-off').hidden = !(T.stream && !T.selfView && T.mode === 'camera' && T.active);
    const sw = root.querySelector('[data-t="selfview"]'); if (sw) { sw.classList.toggle('on', T.selfView); sw.setAttribute('aria-checked', String(T.selfView)); }
  }
  async function setSelfView(on) {
    T.selfView = on; store.saveSettings({ selfView: on });
    // Mode guidé : la vidéo sert de miroir (sans analyse) ; on ouvre / ferme la caméra selon le choix.
    if (T.mode === 'guided' && T.active) { if (on) await mirrorOn(); else { if (!T.liveAI) stopCam(); guidedLayout(); } }
    paintVideoBtn();
  }
  $('[data-t="video"]').onclick = () => setSelfView(!T.selfView);

  // Démonstration : schéma animé + points clés + étapes, par-dessus la séance
  function openDemo() {
    const d = $('.demo');
    d.innerHTML = `<div class="demo-card"><div class="row between"><span class="eyebrow">${t('demoTitle')}</span><button class="icon-btn" data-t="demo-x" aria-label="${t('close')}">${icon('close', 18)}</button></div>
      <h3 style="margin:4px 0 6px">${esc(tr(ex.name))}</h3>${figureBlock(id)}
      <ul class="keylist small">${ex.keys.map((k, i) => `<li><span class="n">${i + 1}</span><span>${esc(tr(k))}</span></li>`).join('')}</ul>
      <ol class="steplist small" style="margin:6px -16px 0">${tr(ex.steps).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <button class="btn" data-t="demo-ok" style="margin-top:12px">${t(T.active ? 'demoBack' : 'close')}</button></div>`;
    d.hidden = false; mountFigs(d);
    const shut = () => { d.hidden = true; d.innerHTML = ''; };
    d.querySelector('[data-t="demo-x"]').onclick = shut; d.querySelector('[data-t="demo-ok"]').onclick = shut;
    d.onclick = (e) => { if (e.target === d) shut(); };
  }
  $('[data-t="demo"]').onclick = openDemo;

  // Coach IA en direct (Gemini regarde la vidéo) : on/off pendant la séance, sur l'écran de préparation et dans Profil
  function paintAI() {
    const b = $('[data-t="ai"]'); const st = T.liveAI ? T.liveState : 'off';
    b.dataset.state = st; b.setAttribute('aria-pressed', String(T.liveAI));
    b.title = `${t('liveAI')} · ${t('live_' + st)}`; b.setAttribute('aria-label', b.title);
    const sw = root.querySelector('[data-t="liveai"]'); if (sw) { sw.classList.toggle('on', T.liveAI); sw.setAttribute('aria-checked', String(T.liveAI)); }
  }
  const liveCtx = () => ({
    ex, exercise: ex.name.en, condition: path.name.en || tr(path.name), target: dose.type === 'hold' ? holdTarget : dose.reps,
    painLimit: path.painMax ?? 4, steps: ex.steps.en || [], keys: (ex.keys || []).map((k) => k.en || tr(k)), plane: T.mode === 'camera' ? planeFor(setIdx()) : 'guided',
  });
  // Visibilité vue par le suivi de l'app (et non par l'impression de l'IA) : la dernière analyse comptée date de moins de 1,5 s
  const subject = () => (fine === 'hand' ? 'hand' : fine === 'foot' ? 'foot' : 'body');
  const isTracked = () => {
    if (T.mode !== 'camera') return fine === 'hand' ? !!T.lastHand : true;
    if (T.lastSt !== T.liveSeen) { T.liveSeen = T.lastSt; T.liveSeenT = performance.now(); }
    return performance.now() - (T.liveSeenT || T.liveStartT || 0) < 1500 && (fine !== 'hand' || !!T.lastHand);
  };
  // Évènements pour le coach en direct : défaut mesuré, sujet perdu > 1,5 s, sujet retrouvé (les répétitions arrivent par onRep)
  function liveWatch() {
    if (!T.live?.event || !T.active || T.paused) return;
    const tr_ = isTracked();
    if (!tr_ && !T.liveLost) { T.liveLost = true; T.live.event('lost', { subject: subject(), sec: 1.5 }); }
    else if (tr_ && T.liveLost) { T.liveLost = false; T.live.event('back', { subject: subject() }); }
    for (const [k, ts] of T.recentFaults || []) if (ts > (T.liveFaultT || 0)) { T.liveFaultT = ts; T.live.event('fault', { fault: CUES[k]?.en || k }); }
  }
  function liveState() {
    const base = { tracked: isTracked(), subject: subject(), paused: !!T.paused, phase: T.mode === 'camera' ? T.lastSt?.phase || 'calibrating' : 'guided' };
    if (T.mode === 'camera' && T.tracker) {
      const now = performance.now();
      const faults = [...(T.recentFaults || new Map())].filter(([, ts]) => now - ts < 6000).map(([k]) => CUES[k]?.en || k);
      const last = T.tracker.repLog.slice(-1)[0];
      const measures = [last?.meas ? `last rep reached ${last.meas.romPct}% of range in ${last.dur}s` : '', ...(T.lastSt?.checks || []).map((c) => `${c.cue} ${c.value} (limit ${c.kind === 'max' ? '≤' : '≥'}${c.limit})`)].filter(Boolean).join('; ');
      return { ...base, lastRomPct: last?.meas?.romPct ?? null, reps: T.tracker.reps, target: dose.reps, holdSec: dose.type === 'hold' ? Math.floor(T.lastSt?.holdSec || 0) : null, faults, measures };
    }
    const g = T.guidedEl ? T.guidedEl() : { el: 0, reps: 0 };
    return dose.type === 'hold' ? { ...base, holdSec: g.el, target: holdTarget, faults: [] } : { ...base, reps: g.reps, target: dose.reps, faults: [] };
  }
  // Contrôle « bon mouvement » vs démonstration + consigne précise quand ça ne correspond pas
  const figView = ex.fig.view || 'side';
  function moveCheck(p, now, camPlane) {
    if (!T.mm || !T.mm.usable) return null;
    if (camPlane && camPlane !== figView) return null; // filmé dans l'autre plan : angles 2D non comparables
    const progressing = (T.lastSt && T.lastSt.phase === 'moving') || now - (T.lastRepT || 0) < 10000 || (T.mode === 'guided' && (dose.type === 'hold' || !!dose.holdTop));
    const st = T.mm.update(p, now, { progressing });
    const dtm = T.mvLastT ? Math.min(200, now - T.mvLastT) : 0; T.mvLastT = now;
    if (st.status === 'wrong') {
      T.mvWrongMs = (T.mvWrongMs || 0) + dtm; // temps « mauvais mouvement » pendant la répétition en cours
      const k = hintKey(st.issues[0], figView);
      if (now - (T.mvSaid || 0) > 6000 || T.mvKey !== k) {
        T.mvSaid = now; T.mvKey = k;
        const txt = `${t('mv_wrong')} ${t(k)}`;
        showCue(txt, 'bad'); setTimeout(() => { if ($('.cue span').textContent === txt) showCue(''); }, 4000);
        speak(txt, { interrupt: true });
      }
    } else if (T.mvKey && st.status === 'ok') { T.mvKey = null; if (cue('good')) { showCue(cueText('good'), 'good'); setTimeout(() => showCue(''), 1500); } }
    return st;
  }
  function startLive() {
    if (!T.liveAI || T.live || !T.stream || !T.active) return;
    if ((store.settings().aiMode || 'precise') === 'live' && liveSocketAvailable()) {
      T.liveStartT = performance.now(); T.liveLost = false; T.liveFaultT = performance.now(); T.liveSeen = T.lastSt; T.liveSeenT = T.liveStartT;
      T.live = startLiveCoach({
        video, mirror: isMirror(), context: liveCtx(), getState: liveState, frame: () => annotated(512),
        onText: (txt, final) => aiText(txt, final),
        onState: (st) => { if (st === 'error' && T.liveState !== 'error') toast(t('liveErr'), 4500); T.liveState = st; paintAI(); },
      });
      clearInterval(T.liveWatchT); T.liveWatchT = setInterval(liveWatch, 250);
      return;
    }
    const plane = T.mode === 'camera' ? planeFor(setIdx()) : 'guided';
    if (!T.aiAnnounced) { T.aiAnnounced = true; speak(t('aiOnSpoken')); }
    const c = liveCtx();
    const coach = createPreciseCoach({ ex, exercise: c.exercise, condition: c.condition, steps: c.steps, plane, mode: T.mode === 'camera' ? (dose.type === 'hold' ? 'hold' : 'reps') : 'guided', target: c.target, tempo: dose.tempo || '2-1-2' }, {
      onResult: (v) => { aiText(v.text, true, v.seen); speakAI(v.text); },
      onState: (st) => { if (st === 'error' && T.liveState !== 'error') toast(t('liveErr'), 4500); T.liveState = st; paintAI(); },
    });
    T.live = { stop: () => { clearInterval(T.aiTimer); coach.stop(); }, review: coach.review };
    // Maintien : un point toutes les 6 s ; guidé : toutes les 8 s (pas de mesures fines, posture seulement)
    if (T.mode === 'camera' && dose.type === 'hold') T.aiTimer = setInterval(() => {
      const st = T.lastSt; if (!st || st.phase === 'calibrating' || T.paused) return;
      if (T.mm?.state.status === 'wrong') return;
      coach.review(annotated(), { move: T.mm?.describe(), holdSec: Math.floor(st.holdSec || 0), value: st.value != null ? +st.value.toFixed(1) : null, range: st.range, checks: st.checks, faults: st.faults, metric: null });
    }, 6000);
    if (T.mode === 'guided') {
      T.aiTimer = setInterval(() => { if (!T.paused && T.mm?.state.status !== 'wrong') coach.review(annotated(), { move: T.mm?.describe(), faults: [] }); }, 8000);
      guidedPose();
    }
  }
  function aiText(txt, final, seen) {
    if (final === 'drop') { clearTimeout(T.aiCueT); if ($('.cue span').className === 'ai') showCue(''); return; } // remarque identique à la précédente : on ne la ré-affiche pas
    showCue(txt, 'ai'); clearTimeout(T.aiCueT);
    if (final) { T.aiNotes = [...(T.aiNotes || []), seen ? `${txt} (${seen})` : txt].slice(-6); T.aiCueT = setTimeout(() => { if ($('.cue span').className === 'ai') showCue(''); }, 4500); }
  }
  // Image annotée envoyée à l'IA : vidéo + squelette (articulations fautives en rouge) + angle principal
  const shot = document.createElement('canvas');
  function annotated(w = 384) {
    if (!video.videoWidth) return null;
    // image analysée la plus récente (celle des points) ; à défaut (pas d'analyse en cours) : la vidéo, sans squelette
    const fresh = V.fw && performance.now() - V.t < 400, src = fresh ? frame : video;
    const sw = fresh ? V.fw : video.videoWidth, sh = fresh ? V.fh : video.videoHeight;
    shot.width = w; shot.height = Math.round((sh / sw) * w);
    const g2 = shot.getContext('2d'), mirror = isMirror();
    g2.save(); if (mirror) { g2.translate(w, 0); g2.scale(-1, 1); } g2.drawImage(src, 0, 0, w, shot.height); g2.restore();
    if (!fresh) { /* points d'une autre image : on ne les dessine pas */ }
    else if (handEx || fine === 'hand') { if (T.lastHand) drawHand(g2, T.lastHand, w, shot.height, mirror, { keep: true, bad: !!T.lastFj?.size }); }
    else if (T.lastLm && fine !== 'foot') drawSkeleton(g2, T.lastLm, w, shot.height, T.lastFj || new Set(), mirror, true);
    if (T.lastSt?.value != null && T.mode === 'camera') {
      g2.fillStyle = 'rgba(0,0,0,.6)'; g2.fillRect(0, 0, w, 22); g2.fillStyle = '#fff'; g2.font = '13px sans-serif';
      g2.fillText(`${ex.track.planes[planeFor(setIdx())].metric}: ${Math.round(T.lastSt.value * 100) / 100}`, 6, 15);
    }
    return shot.toDataURL('image/jpeg', 0.7).split(',')[1];
  }
  // ---------- Assistant de placement (avant la calibration) ----------
  // Vérifie distance, cadrage, orientation, hauteur / inclinaison du téléphone et lumière (placement.js), affiche et dit le problème principal,
  // puis laisse la calibration normale prendre la suite. Jamais bloquant : bouton « Passer » et limite de PLACE_MAX_MS.
  // Désactivé dans les tests de bout en bout : adresse avec « noplace » (…/index.html?noplace#/train/…) ou window.__noPlacement = true.
  const placementWanted = () => T.mode === 'camera' && !!ex.track && !PLACED.has(id) && !/noplace/.test(location.href) && !window.__noPlacement;
  const placeText = (k) => (k.startsWith('wrongHand') ? t(k) : t('pl_' + k));
  const placeKey = () => store.aiKey();
  const lumaCv = document.createElement('canvas');
  // Luminance (0–255) sur une image réduite à 64 px : moyenne, centre (boîte du sujet, sinon milieu) et bords (hors sujet)
  function sampleLuma(box) {
    try {
      if (!V.fw) return null;
      const w = 64, h = Math.max(8, Math.round((V.fh / V.fw) * 64)); lumaCv.width = w; lumaCv.height = h;
      const c = lumaCv.getContext('2d', { willReadFrequently: true }); c.drawImage(frame, 0, 0, w, h);
      const d = c.getImageData(0, 0, w, h).data;
      const b = box ? { x0: Math.max(0, box.x0 - 0.04), x1: Math.min(1, box.x1 + 0.04), y0: Math.max(0, box.y0 - 0.04), y1: Math.min(1, box.y1 + 0.04) } : { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 };
      let sa = 0, na = 0, sc = 0, nc = 0, se = 0, ne = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], u = (x + 0.5) / w, v = (y + 0.5) / h;
        sa += l; na++;
        if (u >= b.x0 && u <= b.x1 && v >= b.y0 && v <= b.y1) { sc += l; nc++; }
        else if (u < 0.15 || u > 0.85 || v < 0.15 || v > 0.85) { se += l; ne++; }
      }
      const mean = sa / na;
      return { mean, center: nc ? sc / nc : mean, edges: ne ? se / ne : mean };
    } catch (_) { return null; }
  }
  function stopPlacementListeners() {
    const P = T.place; if (!P) return;
    clearTimeout(P.timer); clearTimeout(P.hideT);
    if (P.onOri) { try { window.removeEventListener('deviceorientation', P.onOri); } catch (_) {} P.onOri = null; }
  }
  function drawGuideBox(P, ok) {
    const r = guideRect(P.kind, P.plane, P.scope), k = Math.max(1, V.W / 400), X = r.x * V.W, Y = r.y * V.H, w = r.w * V.W, h = r.h * V.H, rad = Math.min(w, h) * 0.12;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineWidth = 3 * k; g.setLineDash([10 * k, 8 * k]); g.strokeStyle = ok ? '#3ccf7b' : '#ffb020';
    g.beginPath(); if (g.roundRect) g.roundRect(X, Y, w, h, rad); else g.rect(X, Y, w, h); g.stroke(); g.restore();
  }
  function renderPlace(P, key, kind) {
    const box = $('.place'), txt = key ? (kind === 'ok' ? t('pl_perfect') : placeText(key)) : t('pl_checking');
    box.hidden = false; box.dataset.state = kind;
    if (P.shownKey !== key + kind) {
      P.shownKey = key + kind;
      $('.place-ico').innerHTML = ICON_SVG[kind === 'ok' ? 'ok' : key ? issueIcon(P.top) : 'eye'];
      $('.place-txt').textContent = txt;
    }
  }
  function startPlacement() {
    if (T.mode !== 'camera' || !ex.track) return;
    stopPlacementListeners();
    const pl = planeFor(setIdx()), spec = ex.track.planes[pl];
    const P = T.place = { on: true, t0: performance.now(), gate: new PlacementGate(), kind: handEx ? 'hand' : 'body', plane: pl, metric: spec.metric, scope: scopeOf(spec.metric), palm: handEx ? palmNeed(spec.metric) : null,
      luma: null, lumaT: 0, tilt: null, spokenKey: null, spokenT: 0, aiBusy: false, aiN: 0, shownKey: null, top: null, last: null, box: null };
    // Inclinaison du téléphone : capteur d'orientation (Android / WebView : pas de permission ; iOS l'exige → on ne s'en sert pas)
    try {
      if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        P.onOri = (e) => { if (e.beta != null && e.gamma != null) P.tilt = { beta: e.beta, gamma: e.gamma }; };
        window.addEventListener('deviceorientation', P.onOri);
      }
    } catch (_) {}
    P.timer = setTimeout(() => { if (T.place === P && P.on) { toast(t('pl_timeout'), 3500); finishPlacement('timeout'); } }, PLACE_MAX_MS);
    $('[data-t="replace"]').hidden = true; $('.place-ai').hidden = true; $('[data-t="place-ai"]').hidden = !placeKey();
    showCue(''); renderPlace(P, null, 'wait');
    resetTrack(); T.lastSt = null;
  }
  function finishPlacement(how) {
    const P = T.place; if (!P || !P.on) return;
    P.on = false; PLACED.add(id);
    if (P.onOri) { try { window.removeEventListener('deviceorientation', P.onOri); } catch (_) {} P.onOri = null; }
    clearTimeout(P.timer);
    if (how === 'ok') { renderPlace(P, 'ok', 'ok'); speak(t('pl_perfect'), { interrupt: true }); P.hideT = setTimeout(() => { $('.place').hidden = true; }, 1300); }
    else $('.place').hidden = true;
    resetTrack(); if (T.tracker && T.tracker.reps === 0) T.tracker.lastT = 0;
    $('[data-t="replace"]').hidden = false;
  }
  function placeStep(now, d) {
    const P = T.place; if (!P || !P.on) return;
    if (now - P.lumaT > 300) {
      P.lumaT = now;
      let bx = null;
      if (d.lm) bx = subjectBox(d.lm, P.scope); else if (d.hand) { const xs = d.hand.map((p) => p.x), ys = d.hand.map((p) => p.y); bx = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }
      P.luma = sampleLuma(bx);
    }
    const a = assessPlacement({ kind: P.kind, plane: P.plane, side: curSide(), metric: P.metric, scope: P.scope, lm: d.lm, hand: d.hand, wrongHand: d.wrongHand, palm: P.palm,
      frameW: V.fw, frameH: V.fh, mirror: isMirror(), luma: P.luma, tilt: P.tilt });
    P.last = a;
    const r = P.gate.push(a, now);
    P.top = r.issue;
    drawGuideBox(P, a.ok);
    $('.place-bar i').style.width = `${Math.round(r.progress * 100)}%`;
    if (r.stable) return finishPlacement('ok');
    const key = r.issue ? r.issue.key : null;
    renderPlace(P, key, key ? 'bad' : 'wait');
    // voix : seulement quand le problème change, au moins 3 s après la dernière phrase
    if (key && key !== P.spokenKey && now - P.spokenT >= 3000) { P.spokenKey = key; P.spokenT = now; if (t('pl_' + key) !== 'pl_' + key || key.startsWith('wrongHand')) speak(placeText(key), { interrupt: true }); }
    if (!key) P.spokenKey = null;
    // coach IA : seul, avec « coach IA » activé et une clé (3,5 s puis 12 s si ça ne s'arrange pas) ; sinon sur demande (bouton)
    if (!a.ok && store.settings().liveAI && placeKey() && !P.aiBusy && ((P.aiN === 0 && now - P.t0 > 3500) || (P.aiN === 1 && now - P.t0 > 12000))) placeAdvice(false);
  }
  async function placeAdvice(manual) {
    const P = T.place, key = placeKey();
    if (!P || !P.on || P.aiBusy || !key || !P.last) return;
    P.aiBusy = true; P.aiN++;
    try {
      const img = annotated(512); if (!img) return;
      const lang = aiLangInfo();
      const sys = `You help a patient place their phone camera so that an exercise-tracking app can see them well. Answer in ${lang.label}, informal register (in French use "tu"), maximum 2 short concrete sentences, spoken style, no greeting, no markdown. ` +
        `Only talk about camera placement: distance, camera height, angle, left/right position, lighting, cluttered background, clothing that blends with the background. Never contradict the local measurements given; if they list no issue, give at most one small tip.`;
      const cam = ex.track.cam ? tr(ex.track.cam) : t(P.plane === 'side' ? 'setupSide' : 'setupFront');
      const text = `Exercise: ${ex.name.en || tr(ex.name)}. Wanted camera setup: ${cam}\n${measurementsText({ plane: P.plane, kind: P.kind }, P.last.info, P.last.issues, P.luma)}`;
      const r = await geminiDirect(key, sys, [{ text }, { inline_data: { mime_type: 'image/jpeg', data: img } }], 90);
      if (!r || T.place !== P || !P.on) return;
      const el = $('.place-ai'); el.textContent = r; el.hidden = false;
      const now = performance.now(); if (now - P.spokenT >= 3000 || manual) { P.spokenT = now; speakAI(r, { interrupt: true }); }
    } catch (e) { /* silencieux : les consignes locales continuent */ } finally { P.aiBusy = false; }
  }
  $('[data-t="place-skip"]').onclick = () => finishPlacement('skip');
  $('[data-t="place-ai"]').onclick = () => placeAdvice(true);
  $('[data-t="replace"]').onclick = () => { if (!T.active || !T.tracker || T.place?.on) return; T.tracker = T.mkTracker(); PLACED.delete(id); startPlacement(); };

  // Mode guidé + coach IA : squelette sur le miroir (si le modèle de pose est disponible) pour des images annotées
  async function guidedPose() {
    if (T.gpRun) return;
    if (fine === 'foot') return; // gros plan du pied : le squelette du corps n'a pas de sens
    if (fine === 'hand') return guidedHands();
    T.gpRun = true;
    try { await loadPose(); } catch (_) { T.gpRun = false; return; }
    T.mm = new MoveMatcher(ex); T.mvKey = null;
    let lastTurn = 0; const pace = new Pacer(HZ.guided); resetTrack();
    const tick = () => {
      if (!T.active || T.mode !== 'guided' || !T.stream) { T.gpRun = false; clearOverlay(); return; }
      requestAnimationFrame(tick);
      const now = performance.now();
      if (T.paused || !pace.due(now) || !grab(now)) return;
      const gd = guard.check(detect(frame, now), now, V.fw / V.fh), lm = gd.lm; T.lastLm = lm;
      pace.done(now, performance.now());
      paintFrame();
      if (!lm) { smooth.reset(); T.drawn = null; return; }
      const p = toPx(lm, V.fw, V.fh);
      if (bodyVisible(p) && !gd.jumped) {
        const dp = detectPlane(p), plane = dp === 'side' || dp === 'front' ? dp : null;
        if (plane && plane !== figView && now - lastTurn > 9000 && T.mm.usable) { lastTurn = now; const k = figView === 'side' ? 'turnSide' : 'turnFront'; cue(k); showCue(t(k), 'bad'); }
        moveCheck(p, now, plane);
      }
      if (T.selfView) {
        const proj = project(smooth.apply(lm, now));
        T.drawn = drawSkeleton(g, proj, V.W, V.H, new Set(), isMirror(), true);
        if (T.guides) drawGuides(g, proj, V.W, V.H, T.mm, isMirror());
      }
    };
    requestAnimationFrame(tick);
  }
  // Mode guidé d'un exercice de la main (ex. glissements tendineux) : squelette de la main sur le miroir et dans les images de l'IA
  async function guidedHands() {
    if (T.gpRun) return; T.gpRun = true;
    try { await loadHands(); } catch (_) { T.gpRun = false; return; }
    const pace = new Pacer(HZ.guided); resetTrack();
    const tick = () => {
      if (!T.active || T.mode !== 'guided' || !T.stream) { T.gpRun = false; clearOverlay(); return; }
      requestAnimationFrame(tick);
      const now = performance.now();
      if (T.paused || !pace.due(now) || !grab(now)) return;
      const hd = pickHand(detectHands(frame, now), curSide(), T.handPrev);
      pace.done(now, performance.now());
      T.handPrev = hd; T.lastHand = hd ? hd.lm : null;
      paintFrame();
      if (hd && T.selfView) T.drawn = drawHand(g, project(smooth.apply(hd.lm, now)), V.W, V.H, isMirror(), { keep: true });
      else { T.drawn = null; if (!hd) smooth.reset(); }
    };
    requestAnimationFrame(tick);
  }
  // Retourne true si la voix du coach en direct jouait encore (elle s'éteint en fondu de 60 ms)
  function stopLive() {
    clearInterval(T.aiTimer); clearInterval(T.liveWatchT);
    const was = !!T.live && isPlaying('live');
    if (T.live) { T.live.stop(); T.live = null; } T.liveState = 'off'; paintAI();
    return was;
  }
  const afterLive = (was, fn) => { const f = () => { if (!T.closed) fn(); }; return was ? setTimeout(f, 90) : f(); }; // laisse finir le fondu avant de parler : jamais deux voix
  function setLiveAI(on) {
    if (on && !liveAvailable()) { toast(t('liveNeedKey'), 5000); return; }
    primeAudio();
    T.liveAI = on; store.saveSettings({ liveAI: on });
    if (on) { if (T.mode === 'guided' && T.active && !T.stream) mirrorOn(); else startLive(); } else stopLive();
    paintAI();
  }
  $('[data-t="ai"]').onclick = () => setLiveAI(!T.liveAI);
  $('.mini-fig').onclick = openDemo;

  function setLabel() {
    $('#setlbl').textContent = `${t('set')} ${T.set + 1} ${t('of')} ${totalSets} · ${doseText(dose)}${curSide() ? ' · ' + t(curSide() === 'L' ? 'sideL' : 'sideR') : ''}${item?.flare ? ' · ' + t('flareShort') : ''}`;
    if (T.mode === 'camera') {
      const pl = planeFor(setIdx());
      const k = pl === 'hand' ? 'Hand' : pl === 'side' ? 'Side' : 'Front';
      $('#pbadge').innerHTML = `<span class="plane-badge">${icon(pl === 'hand' ? 'hand' : pl === 'side' ? 'side' : 'front', 14)} ${t('plane' + k)} · ${t('plane' + k + 'D')}</span>`;
    } else $('#pbadge').innerHTML = '';
  }
  function showCue(text, kind) { const c = $('.cue'); c.hidden = !text; c.querySelector('span').textContent = text || ''; c.querySelector('span').className = kind || ''; }
  function center(html) { const c = $('.center-msg'); c.hidden = !html; c.innerHTML = html || ''; }

  function setup() {
    $('.bottom').hidden = false;
    setLabel(); showCue(''); center('');
    { const c = $('#cnt'), r = $('#ring'); if (c) c.textContent = '0'; if (r) r.style.strokeDashoffset = RING; } // affichage seulement : repart à 0 à chaque série
    $('[data-t="end"]').hidden = true; $('[data-t="pause"]').hidden = true; $('.counter').hidden = true; $('.depth').hidden = true; $('.mini-fig').hidden = true;
    const s = $('.setup'); s.hidden = false;
    if (T.mode === 'camera') {
      const pl = planeFor(setIdx());
      s.innerHTML = `<span class="eyebrow">${t('setupTitle')}</span><h3 style="margin:6px 0 4px">${pl === 'hand' ? esc(tr(ex.track.cam)) : t(pl === 'side' ? 'setupSide' : 'setupFront')}</h3>
        ${sideRow()}${eqNote()}${figureBlock(id, { keys: false })}<p class="small muted">${t(pl === 'hand' ? 'setupHandTip' : 'setupTip')}</p>
        ${selfRow('selfViewD')}${liveRow()}
        <button class="btn" data-t="go">${icon('cam', 20)} ${t('camStart')}</button>`;
      $('[data-t="guided"]').hidden = false;
    } else {
      s.innerHTML = `<h3>${esc(tr(ex.name))}</h3>${sideRow()}${eqNote()}${figureBlock(id)}
        <ol class="steplist small" style="margin:6px -16px">${tr(ex.steps).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        ${navigator.mediaDevices?.getUserMedia ? selfRow('mirrorD') + liveRow() : ''}
        <button class="btn" data-t="go">${IC.play.replace('<svg', '<svg width="18" height="18"')} ${t('start')}</button>`;
      $('[data-t="guided"]').hidden = true;
    }
    mountFigs(s);
    const sv = s.querySelector('[data-t="selfview"]'); if (sv) sv.onclick = () => setSelfView(!T.selfView);
    const la = s.querySelector('[data-t="liveai"]'); if (la) la.onclick = () => setLiveAI(!T.liveAI);
    s.querySelectorAll('[data-side]').forEach((b) => (b.onclick = () => {
      sideMode = b.dataset.side; totalSets = sideMode === 'both' ? baseSets * 2 : baseSets;
      updateProfile({ sides: { ...(profile().sides || {}), [id]: sideMode }, side: profile().side || sideMode });
      setup();
    }));
    s.querySelector('[data-t="go"]').addEventListener('click', () => { if (curSide()) speak(t(curSide() === 'L' ? 'sideLSpoken' : 'sideRSpoken'), { interrupt: true }); });
    paintVideoBtn(); paintAI();
    s.querySelector('[data-t="go"]').addEventListener('click', primeAudio);
    s.querySelector('[data-t="go"]').onclick = () => (T.mode === 'camera' ? startCamera() : startGuided());
  }
  // Choix du côté : modifiable avant la 1re série ; ensuite on affiche le côté de la série en cours
  const sideRow = () => {
    if (!uni) return '';
    if (T.sets.length) return `<div class="side-now">${icon('user', 16)} ${t(curSide() === 'L' ? 'sideL' : 'sideR')}${sideMode === 'both' ? ` · ${t('sideBothNote')}` : ''}</div>`;
    return `<div class="toggle selfrow" style="display:block"><span><b>${t('sideLbl')}</b></span><div class="seg" style="margin-top:8px">${['L', 'R', 'both'].map((v) => `<button data-side="${v}" class="${sideMode === v ? 'on' : ''}">${t(v === 'L' ? 'sideLeft' : v === 'R' ? 'sideRight' : 'sideBoth')}</button>`).join('')}</div>${sideMode === 'both' ? `<small class="muted">${t('sideBothD', { n: baseSets })}</small>` : ''}</div>`;
  };
  const eqNote = () => { const m = missing(id, haveList(prof)); return m.length ? `<div class="banner neg small" style="margin:4px 0 8px">${icon('shield', 18)}<div>${m.map((e) => `<b>${esc(tr(EQUIP[e]))}</b> → ${t('sub_' + e)}`).join('<br>')}</div></div>` : ''; };
  const liveRow = () => `<div class="toggle selfrow"><span><b>${icon('spark', 16)} ${t('liveAI')}</b><br><small class="muted">${t(liveAvailable() ? 'liveAID' : 'liveNeedKey')}</small></span><button class="switch ${T.liveAI ? 'on' : ''}" data-t="liveai" role="switch" aria-checked="${T.liveAI}" aria-label="${t('liveAI')}"></button></div>`;
  const selfRow = (d) => `<div class="toggle selfrow"><span><b>${icon('eye', 16)} ${t('selfView')}</b><br><small class="muted">${t(d)}</small></span><button class="switch ${T.selfView ? 'on' : ''}" data-t="selfview" role="switch" aria-checked="${T.selfView}" aria-label="${t('selfView')}"></button></div>`;
  $('[data-t="guided"]').onclick = () => { T.tok++; T.mode = 'guided'; stopCam(); setup(); };
  $('[data-t="flip"]').onclick = async () => {
    T.facing = T.facing === 'user' ? 'environment' : 'user'; store.saveSettings({ camera: T.facing });
    if (T.stream) { stopCam(); try { await openCam(); } catch (e) { if (T.closed) return; console.warn(e); toast(t('mirrorErr'), 4000); } }
  };
  function stopCam() { T.camGen++; stopLive(); if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop()); T.stream = null; video.srcObject = null; video.hidden = true; V.fw = 0; clearOverlay(); paintVideoBtn(); }
  // Retourne false si la séance a été fermée (ou la caméra arrêtée) pendant l'ouverture : le flux est alors coupé aussitôt
  async function openCam() {
    const gen = T.camGen;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: T.facing, width: { ideal: 960 }, height: { ideal: 720 } } });
    if (T.closed || gen !== T.camGen) { stream.getTracks().forEach((tk) => tk.stop()); return false; }
    T.stream = stream;
    video.srcObject = stream;
    try { await video.play(); } catch (e) { if (T.closed || gen !== T.camGen) { stream.getTracks().forEach((tk) => tk.stop()); if (T.stream === stream) T.stream = null; return false; } throw e; }
    if (T.closed || gen !== T.camGen) { stream.getTracks().forEach((tk) => tk.stop()); if (T.stream === stream) T.stream = null; return false; }
    video.hidden = false;
    // caméra réellement ouverte (un téléphone peut donner l'autre caméra que celle demandée) : le miroir suit la vraie caméra
    let fm = null; try { fm = T.stream.getVideoTracks()[0]?.getSettings?.().facingMode || null; } catch (_) {}
    T.mirror = (fm === 'user' || fm === 'environment' ? fm : T.facing) === 'user';
    video.classList.toggle('mirror', T.mirror);
    resetTrack();
    paintVideoBtn();
    return true;
  }
  // Mode guidé avec vidéo : le patient se voit en miroir, le schéma passe en vignette
  async function mirrorOn() {
    try { if (!T.stream && !(await openCam())) return; } catch (e) { if (T.closed) return; console.warn(e); toast(e && e.name === 'NotAllowedError' ? t('camDenied') : t('mirrorErr'), 4000); T.selfView = false; }
    if (T.closed) return;
    guidedLayout(); startLive(); if (T.stream && T.active) guidedPose();
  }
  function guidedLayout() {
    if (T.mode !== 'guided' || !T.active) return;
    const live = !!(T.stream && T.selfView);
    $('.mini-fig').hidden = !live;
    if (live) center(''); else { center(`<div class="guided-fig">${figSvg(id, { keys: true })}</div>`); mountFigs(root.querySelector('.center-msg')); }
  }

  async function startCamera() {
    $('.setup').hidden = true; center(`<div><div class="spinner"></div>${t('loadingModel')}</div>`);
    const tok = ++T.tok, gone = () => T.closed || tok !== T.tok;
    try {
      if (!T.stream && !(await openCam())) { if (!T.closed && tok === T.tok) { center(''); T.mode = 'guided'; setup(); } return; }
      await (handEx ? loadHands() : loadPose());
      if (gone()) return;
    } catch (e) {
      if (gone()) return;
      console.error(e); center(''); stopCam();
      toast(e && e.name === 'NotAllowedError' ? t('camDenied') : t('modelErr'), 4500);
      T.mode = 'guided'; return setup();
    }
    const willPlace = placementWanted();
    if (!willPlace) { for (const n of [3, 2, 1]) { if (gone()) return; center(`<div class="bignum">${n}</div>`); speak(String(n), { interrupt: true }); await sleep(900); } if (gone()) return; center(''); speak(cueText('go')); }
    if (gone()) return;
    runSet();
    if (willPlace) startPlacement(); // l'assistant de placement remplace le compte à rebours : on compte (calibration) quand le cadrage est bon
  }

  function runSet() {
    const pl = planeFor(setIdx());
    const recentFaults = new Map(); T.recentFaults = recentFaults;
    T.mm = new MoveMatcher(ex); T.mvKey = null; T.mvWrongMs = 0; T.mvLastT = 0;
    T.frame = null; resetTrack(); T.ticks = 0;
    const mkTracker = () => new Tracker(ex, pl, { side: curSide(),
      romFactor: dose.romFactor,
      onCue: (k) => { if (cue(k)) { showCue(cueText(k), k === 'holdIt' || k === 'depth' ? '' : 'bad'); recentFaults.set(k, performance.now()); setTimeout(() => showCue(''), 2200); } },
      onRep: (rep) => {
        T.lastRepT = performance.now();
        countAloud(T.tracker.reps);
        if (store.settings().vibrate !== false) try { navigator.vibrate?.(rep.full ? 35 : [20, 60, 20]); } catch (_) {}
        // répétition jugée « mauvais mouvement » seulement si le mouvement ne correspondait pas pendant ≥ 35 % de sa durée
        if ((T.mvWrongMs || 0) >= 350 * rep.dur) { T.tracker.flagRep('wrongMove'); rep = T.tracker.repLog[T.tracker.repLog.length - 1]; }
        T.mvWrongMs = 0;
        T.live?.event?.('rep', { n: T.tracker.reps, romPct: rep.meas?.romPct ?? null, faults: (rep.faults || []).map((k) => CUES[k]?.en || k) });
        if (T.live?.review && !rep.faults.includes('wrongMove')) {
          T.live.review(T.kf || annotated(), { ...rep.meas, dur: rep.dur, faults: rep.faults, move: T.mm?.describe() }, T.tracker.repLog.slice(-4, -1).map((r) => ({ n: r.n, romPct: r.meas?.romPct, faults: r.faults })));
          T.kf = null; T.kfP = 0;
        }
        if (rep.full && !rep.faults.length && T.tracker.full % 3 === 0 && cue('great')) { showCue(cueText('great'), 'good'); setTimeout(() => showCue(''), 1500); }
        if (dose.type !== 'hold' && T.tracker.reps === dose.reps - 1) setTimeout(() => cue('lastRep'), 600);
        if (store.settings().sendFrame && (!T.frame || rep.faults.length)) T.frame = grabFrame(video, isMirror());
        if (dose.type !== 'hold' && T.tracker.reps >= dose.reps) setTimeout(endSet, 900);
      },
    });
    T.tracker = mkTracker(); T.mkTracker = mkTracker;
    $('.counter').hidden = false; $('.depth').hidden = dose.type === 'hold'; $('.mini-fig').hidden = false; paintVideoBtn();
    $('[data-t="end"]').hidden = false; $('[data-t="guided"]').hidden = true; $('[data-t="pause"]').hidden = false; $('[data-t="replace"]').hidden = false;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    $('#cnt').textContent = '0'; $('#ring').style.strokeDashoffset = RING;
    T.active = true; T.paused = false; startLive();
    let lastWarn = 0;
    // Compteur, anneau, barre d'amplitude ; retourne true si la série est terminée
    const hud = (st) => {
      if (!$('[data-t="replace"]').hidden && ((st.reps || 0) > 0 || (st.holdSec || 0) > 0.5)) $('[data-t="replace"]').hidden = true; // une fois qu'on compte, plus de recadrage (la calibration serait perdue)
      if (T.live?.review && st.phase === 'moving' && (st.progress || 0) > (T.kfP || 0) + 0.04 && performance.now() - (T.kfT || 0) > 180) { T.kf = annotated(); T.kfP = st.progress; T.kfT = performance.now(); }
      if (st.phase === 'calibrating') showCue(t(handEx ? 'calibratingHand' : 'calibrating'));
      else if ([t('calibrating'), t('calibratingHand')].includes($('.cue span').textContent)) showCue('');
      if (dose.type === 'hold') {
        $('#cnt').textContent = Math.floor(st.holdSec || 0);
        $('#ring').style.strokeDashoffset = RING * (1 - Math.min(1, (st.holdSec || 0) / holdTarget));
        if ((st.holdSec || 0) >= holdTarget) { endSet(); return true; }
      } else {
        $('#cnt').textContent = st.reps || 0;
        $('#ring').style.strokeDashoffset = RING * (1 - Math.min(1, (st.reps || 0) / dose.reps));
        $('.depth i').style.height = `${Math.round((st.progress || 0) * 100)}%`;
      }
      return false;
    };
    const pace = new Pacer(handEx ? HZ.hand : HZ.body);
    const tock = (now) => { pace.done(now, performance.now()); T.ticks = (T.ticks || 0) + 1; T.cost = pace.cost; };
    if (handEx) {
      const loopHand = () => {
        if (!T.active) return;
        T.raf = requestAnimationFrame(loopHand);
        const now = performance.now();
        if (T.paused || !pace.due(now) || !grab(now)) return;
        const side = curSide();
        const hd = pickHand(detectHands(frame, now), side, T.handPrev);
        tock(now);
        T.handPrev = hd;
        paintFrame();
        if (T.place?.on) { // placement : on montre la main, on ne compte pas encore
          if (hd) { T.drawn = drawHand(g, project(smooth.apply(hd.lm, now)), V.W, V.H, isMirror(), { keep: true, bad: !handInFrame(hd.lm) }); T.lastHand = hd.lm; T.handInfo = { label: hd.label, score: hd.score, world: !!hd.world }; } else { smooth.reset(); T.lastHand = null; T.drawn = null; }
          const ws = hd ? sideVote.push(hd, side) : false;
          return placeStep(now, { hand: hd ? hd.lm : null, wrongHand: ws });
        }
        if (!hd) {
          smooth.reset(); T.lastHand = null; T.drawn = null; T.handInfo = null;
          if (now - lastWarn > 3000) { lastWarn = now; cue('handInView'); showCue(cueText('handInView'), 'bad'); }
          return;
        }
        const inFrame = handInFrame(hd.lm);
        T.drawn = drawHand(g, project(smooth.apply(hd.lm, now)), V.W, V.H, isMirror(), { keep: true, bad: !inFrame });
        T.lastHand = hd.lm; T.lastFj = new Set(); T.handInfo = { label: hd.label, score: hd.score, world: !!hd.world };
        if (!inFrame && now - lastWarn > 4000) { lastWarn = now; if (cue('handInView')) showCue(cueText('handInView'), 'bad'); }
        // Avant de commencer à compter : la main montrée est clairement celle de l'autre côté → on le dit (6 s au plus,
        // ensuite on compte quand même : de profil, l'étiquette gauche / droite du modèle peut se tromper)
        const wrongSide = !T.tracker.calibrated && sideVote.push(hd, side);
        if (side && hd.label && !T.tracker.calibrated && !sideVote.ready) return; // 6 premières images : on vérifie d'abord de quelle main il s'agit
        if (wrongSide && (T.wrongHandMs || 0) < 6000) {
          T.wrongHandMs = (T.wrongHandMs || 0) + Math.min(200, now - (T.wrongHandT || now)); T.wrongHandT = now;
          if (now - lastWarn > 4000) { lastWarn = now; const k = side === 'L' ? 'wrongHandL' : 'wrongHandR'; showCue(t(k), 'bad'); speak(t(k), { interrupt: true }); setTimeout(() => { if ($('.cue span').textContent === t(k)) showCue(''); }, 3500); }
          return;
        }
        T.wrongHandT = 0;
        // main qui sort de l'image : points extrapolés, mesures fausses → on ne compte pas ces images
        if (!handInFrame(hd.lm, 0.04)) return;
        const st = T.tracker.update({ hand: handPx(hd.lm, V.fw, V.fh), hand3: hd.world || undefined }, now); T.lastSt = st;
        hud(st);
        // condition de l'exercice non respectée (opposition du pouce faite poing fermé) : ces mouvements ne comptent pas → on le dit
        const gk = st.guard && T.tracker.spec.guard?.cue;
        if (gk && t(gk) !== gk && (st.phase === 'calibrating' || now - lastWarn > 6000)) {
          showCue(t(gk), 'bad');
          if (now - lastWarn > 6000) { lastWarn = now; if (!T.live) speak(t(gk)); else T.live.event?.('fault', { fault: 'closing the hand into a fist instead of touching one fingertip with the thumb (does not count)' }); setTimeout(() => { if ($('.cue span').textContent === t(gk)) showCue(''); }, 3500); }
        }
      };
      T.raf = requestAnimationFrame(loopHand);
      return;
    }
    const loop = () => {
      if (!T.active) return;
      T.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (T.paused || !pace.due(now) || !grab(now)) return;
      const gd = guard.check(detect(frame, now), now, V.fw / V.fh), lm = gd.lm;
      tock(now);
      paintFrame();
      const fj = new Set();
      for (const [k, ts] of recentFaults) if (now - ts < 1500) (FAULT_JOINTS[k] || []).forEach((j) => fj.add(j));
      if (T.place?.on) { // placement : on montre le squelette, on ne compte pas encore
        if (lm) { T.drawn = drawSkeleton(g, project(smooth.apply(lm, now)), V.W, V.H, fj, isMirror(), true); } else { smooth.reset(); T.drawn = null; }
        T.lastLm = lm; T.lastFj = fj;
        return placeStep(now, { lm });
      }
      if (!lm) { smooth.reset(); T.drawn = null; return; }
      const proj = project(smooth.apply(lm, now));
      T.drawn = drawSkeleton(g, proj, V.W, V.H, fj, isMirror(), true);
      T.lastLm = lm; T.lastFj = fj;
      if (gd.jumped) return; // quelqu'un passe derrière : on garde le squelette du patient, on ne compte pas cette image
      const p = toPx(lm, V.fw, V.fh);
      if (!bodyVisible(p)) { if (now - lastWarn > 3000) { lastWarn = now; cue('notVisible'); showCue(t('notVisible'), 'bad'); } return; }
      const dp = detectPlane(p);
      if (dp && dp !== 'between' && dp !== pl && !T.tracker.calibrated) {
        if (now - lastWarn > 3500) { lastWarn = now; const k = pl === 'side' ? 'turnSide' : 'turnFront'; cue(k); showCue(t(k), 'bad'); }
        return;
      }
      const st = T.tracker.update(p, now); T.lastSt = st;
      if (T.tracker.calibrated) { moveCheck(p, now, pl); if (T.guides) drawGuides(g, proj, V.W, V.H, T.mm, isMirror()); }
      // image clé = point le plus avancé de la répétition (dans hud)
      hud(st);
    };
    T.raf = requestAnimationFrame(loop);
  }
  $('[data-t="end"]').onclick = () => { if (T.paused) setPause(false); T.mode === 'camera' ? endSet() : endGuided(); };
  // Pause : le compteur, l'analyse et le coach IA s'arrêtent ; reprise là où on en était
  function setPause(on) {
    if (!T.active || T.paused === on) return;
    T.paused = on;
    const b = $('[data-t="pause"]'); b.innerHTML = `${icon(on ? 'play' : 'pause', 18)} ${t(on ? 'resume' : 'pause')}`; b.classList.toggle('on', on);
    if (on) {
      const was = stopLive(); showCue(''); clearOverlay(); // en pause : la vidéo en direct, sans squelette figé
      center(`<div class="rest-box"><span class="eyebrow">${t('pausedLbl')}</span><p class="small" style="opacity:.8;margin:6px 0 14px">${t('pausedD')}</p><button class="btn sm" data-t="resume">${icon('play', 16)} ${t('resume')}</button></div>`);
      root.querySelector('[data-t="resume"]').onclick = () => setPause(false);
      afterLive(was, () => speak(t('pausedSpoken'), { interrupt: true }));
    } else {
      center(''); if (T.mode === 'guided') guidedLayout();
      if (T.tracker) T.tracker.lastT = 0; // pas de saut de temps au maintien
      speak(cueText('go'), { interrupt: true }); startLive();
    }
  }
  $('[data-t="pause"]').onclick = () => setPause(!T.paused);

  function endSet() {
    if (!T.active) return;
    T.active = false; const was = stopLive(); cancelAnimationFrame(T.raf); clearOverlay(); showCue('');
    const sum = T.tracker.summary();
    const pl = planeFor(setIdx());
    const empty = sum.mode === 'hold' ? !sum.holdSec : !sum.reps;
    T.sets.push({ side: curSide(), plane: pl, mode: sum.mode, reps: sum.reps, full: sum.full, partial: sum.partial, holdSec: sum.holdSec, quality: sum.quality, faults: sum.faults, ...(empty ? { empty: true } : {}) });
    afterLive(was, () => { if (empty) { speak(t('noRepsMsg'), { interrupt: true }); return emptySheet({ ...sum, plane: pl }); } speak(cueText('setDone'), { interrupt: true }); summarySheet({ ...sum, plane: pl }); }); // d'abord la voix en direct s'éteint, ensuite seulement bilan et voix
  }

  function startGuided() {
    $('.setup').hidden = true; $('.counter').hidden = false; $('[data-t="end"]').hidden = false; $('[data-t="guided"]').hidden = true; $('[data-t="pause"]').hidden = false;
    T.active = true; T.paused = false;
    if ((T.selfView || T.liveAI) && navigator.mediaDevices?.getUserMedia) mirrorOn(); else guidedLayout();
    const tempo = (dose.tempo || '2-1-2').split('-').map(Number);
    const repSec = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (dose.holdTop || 0));
    let el = 0, reps = 0;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    $('#cnt').textContent = '0'; $('#ring').style.strokeDashoffset = RING;
    speak(cueText('go'));
    T.guidedTimer = setInterval(() => {
      if (T.paused) return;
      el++;
      if (dose.type === 'hold') {
        $('#cnt').textContent = el; $('#ring').style.strokeDashoffset = RING * (1 - Math.min(1, el / holdTarget));
        const left = holdTarget - el;
        if ([10, 5, 3, 2, 1].includes(left)) speak(String(left), { interrupt: true });
        if (el >= holdTarget) endGuided();
      } else if (el % repSec === 0) {
        reps++; countAloud(reps); $('#cnt').textContent = reps;
        $('#ring').style.strokeDashoffset = RING * (1 - Math.min(1, reps / dose.reps));
        if (reps >= dose.reps) endGuided();
      }
    }, 1000);
    T.guidedEl = () => ({ el, reps });
  }
  function endGuided() {
    if (!T.active) return;
    T.active = false; const was = stopLive(); clearInterval(T.guidedTimer); center(''); $('.mini-fig').hidden = true;
    const { el, reps } = T.guidedEl();
    const sum = dose.type === 'hold' ? { mode: 'hold', holdSec: el, reps: 0, full: 0, partial: 0, quality: null, faults: {} } : { mode: 'reps', reps, full: reps, partial: 0, quality: null, faults: {} };
    const empty = dose.type === 'hold' ? !sum.holdSec : !sum.reps;
    T.sets.push({ side: curSide(), plane: 'guided', ...sum, ...(empty ? { empty: true } : {}) });
    afterLive(was, () => { if (empty) { speak(t('noRepsMsg'), { interrupt: true }); return emptySheet({ ...sum, plane: 'guided' }); } speak(cueText('setDone'), { interrupt: true }); summarySheet({ ...sum, plane: 'guided' }); });
  }

  // Repos entre les séries (réglable dans l'aperçu de la séance)
  function restThen(fn) {
    let left = dose.rest ?? 0;
    if (!left) return fn();
    $('.bottom').hidden = true; $('.setup').hidden = true;
    const done = () => { clearInterval(T.restTimer); T.restTimer = 0; center(''); fn(); };
    center(`<div class="rest-box"><span class="eyebrow">${t('restLbl')}</span><div class="bignum" id="restn">${left}</div><p class="small" style="opacity:.75;margin:0 0 14px">${t('restNext', { n: T.set + 1, tot: totalSets })}</p><button class="btn sm ghost" data-t="skiprest">${t('restSkip')}</button></div>`);
    root.querySelector('[data-t="skiprest"]').onclick = done;
    speak(t('restSpoken', { n: left }), { interrupt: true });
    T.restTimer = setInterval(() => {
      left--; const el = root.querySelector('#restn'); if (el) el.textContent = left;
      if ([3, 2, 1].includes(left)) speak(String(left), { interrupt: true });
      if (left <= 0) done();
    }, 1000);
  }
  // Série sans aucune répétition / seconde détectée : on ne la compte pas ; saisie manuelle ou nouvel essai
  function emptySheet(sum) {
    $('.bottom').hidden = true;
    const hold = sum.mode === 'hold', others = validSets().length > 0;
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><span class="eyebrow">${t('set')} ${T.set + 1}/${totalSets}</span><h3 style="margin-top:4px">${t('noRepsTitle')}</h3>
      <p style="margin:8px 0 16px">${t('noRepsMsg')}</p>
      <div class="stack" style="gap:8px"><button class="btn" data-e="manual">${t('noRepsManual')}</button><button class="btn soft" data-e="redo">${icon('flip', 16)} ${t('redoSet')}</button><button class="btn ghost" data-e="leave">${t(others ? 'finishEx' : 'noRepsLeave')}</button></div></div>`;
    root.appendChild(bg);
    bg.querySelector('[data-e="redo"]').onclick = () => { bg.remove(); T.sets.pop(); setup(); };
    bg.querySelector('[data-e="leave"]').onclick = () => { bg.remove(); T.sets.pop(); if (others) feedbackSheet(); else { T.discard = true; go('#/home'); } };
    bg.querySelector('[data-e="manual"]').onclick = () => {
      let n = hold ? holdTarget : dose.reps; const max = hold ? 600 : 99, step = hold && holdTarget >= 20 ? 5 : 1;
      const sh = bg.querySelector('.sheet');
      sh.innerHTML = `<div class="grab"></div><h3>${t('noRepsManual')}</h3><p class="muted small" style="margin:6px 0 14px">${t(hold ? 'manualHoldLbl' : 'manualRepsLbl')}</p>
        <div class="toggle"><span>${t(hold ? 'manualHoldLbl' : 'manualRepsLbl')}</span><div class="stepper"><button data-m="-1" aria-label="−">−</button><b class="tnum" id="mval">${n}</b><button data-m="1" aria-label="+">+</button></div></div>
        <button class="btn" data-m="ok" style="margin-top:14px">${t('manualOk')}</button>`;
      const paint = () => { sh.querySelector('#mval').textContent = n; };
      sh.querySelectorAll('[data-m="-1"],[data-m="1"]').forEach((b) => (b.onclick = () => { n = Math.max(1, Math.min(max, n + step * +b.dataset.m)); paint(); }));
      sh.querySelector('[data-m="ok"]').onclick = () => {
        bg.remove();
        const ls = T.sets[T.sets.length - 1];
        const m = hold ? { mode: 'hold', holdSec: n, reps: 0, full: 0, partial: 0, quality: null, faults: {} } : { mode: 'reps', reps: n, full: n, partial: 0, holdSec: 0, quality: null, faults: {} };
        if (ls) { Object.assign(ls, m, { manual: true }); delete ls.empty; }
        summarySheet({ ...sum, ...m, manual: true });
      };
    };
  }
  function summarySheet(sum) {
    $('.bottom').hidden = true;
    const last = T.set + 1 >= totalSets;
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    // Mouvement conforme à la démonstration (part du temps), puis remise à zéro pour la série suivante
    const moveOk = !sum.manual && T.mm?.usable && T.mm.totalTime > 3 ? Math.round((1 - T.mm.wrongShare) * 100) : null;
    if (T.mm) T.mm.resetStats();
    if (moveOk != null && moveOk < 70) { sum.faults = { ...(sum.faults || {}), wrongMove: Math.max(1, sum.faults?.wrongMove || 0) }; if (sum.quality != null) sum.quality = Math.min(sum.quality, 0.4); }
    const ls = T.sets[T.sets.length - 1]; if (ls) { ls.faults = sum.faults; ls.quality = sum.quality; ls.moveOk = moveOk; if (sum.manual) ls.manual = true; }
    const faults = Object.entries(sum.faults || {}).sort((a, b) => b[1] - a[1]);
    const reps = (sum.reps_detail || []).slice(-12);
    const data = {
      kind: 'set', exercise: tr(ex.name), condition: tr(path.name), plane: sum.plane, level, target: dose.type === 'hold' ? `${holdTarget}s` : dose.reps,
      mode: sum.mode, reps: sum.reps, full: sum.full, partial: sum.partial, holdSec: sum.holdSec, quality: sum.quality,
      faults: Object.fromEntries(faults.map(([k, v]) => [k, Math.round(v)])), painLimit: path.painMax, set: T.set + 1, totalSets,
      movementMatchesDemoPct: moveOk, perRep: reps.map((r) => ({ n: r.n, rangePct: r.meas?.romPct, sec: r.dur, faults: r.faults })),
      liveCoachRemarks: (T.aiNotes || []).slice(-4),
      ...(sum.plane === 'guided' || sum.manual ? { techniqueNotAnalysed: true } : {}),
    };
    // Pas de « belle exécution » quand la technique n'a pas été analysée (mode guidé, saisie manuelle) ou qu'aucune répétition n'était complète
    const noTech = sum.plane === 'guided' || !!sum.manual, noFull = sum.mode !== 'hold' && sum.reps > 0 && !sum.full;
    const local = moveOk != null && moveOk < 70 ? `${t('mv_wrongSet')} ${t('mv_seeDemo')}`
      : noTech ? (sum.mode === 'hold' ? t('lcGuidedHold', { n: sum.holdSec }) : t('lcGuidedReps'))
      : noFull && !faults.length ? `${t('lcReps', { full: 0, reps: sum.reps })} ${t('lcNoFull')}` : localComment(data);
    const hasAI = aiAvailable();
    bg.innerHTML = `<div class="sheet"><div class="grab"></div><span class="eyebrow">${t('set')} ${T.set + 1}/${totalSets}${sum.manual ? ` · ${t('manualTag')}` : ''}</span><h3 style="margin-top:4px">${t('setSummary')}</h3>
      <div class="list" style="margin:12px 0"><div class="kpis">${sum.mode === 'hold'
        ? `<div><b>${sum.holdSec}s</b><span>${t('holdTime')}</span></div>`
        : `<div><b>${sum.full}</b><span>${t('fullReps')}</span></div><div><b>${sum.partial}</b><span>${t('partialReps')}</span></div>`}
        <div><b>${sum.quality != null ? Math.round(sum.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div>
        ${moveOk != null ? `<div><b class="${moveOk >= 85 ? 'pos' : moveOk < 70 ? 'neg' : ''}">${moveOk}%</b><span>${t('moveMatch')}</span></div>` : ''}</div></div>
      ${faults.length ? `<div class="row wrap" style="gap:6px;margin-bottom:12px">${faults.slice(0, 3).map(([k]) => `<span class="chip neg">${esc(cueText(k))}</span>`).join('')}</div>` : ''}
      ${reps.length ? `<details class="reps-tbl"><summary>${t('repTable')}</summary><table><thead><tr><th>#</th><th>${t('colRange')}</th><th>${t('colTime')}</th><th>${t('colIssues')}</th></tr></thead><tbody>
        ${reps.map((r) => `<tr><td>${r.n}</td><td class="${(r.meas?.romPct ?? 100) >= 90 ? 'pos' : 'neg'}">${r.meas ? Math.min(150, r.meas.romPct) + '%' : '–'}</td><td>${r.dur}s</td><td>${r.faults.length ? r.faults.map((f) => esc(cueText(f))).join(', ') : '✓'}</td></tr>`).join('')}
        </tbody></table></details>` : ''}
      <div class="list"><div class="coach-box"><span class="ai">${icon('spark', 18)}</span><div><b class="small">${t('coachSays')}</b><p id="coachtxt">${esc(local)}</p>${hasAI ? `<small id="aist" class="muted">${t('aiPending')}</small>` : ''}</div></div></div>
      <div class="row" style="margin-top:14px">${last ? `<button class="btn" data-s="finish">${t('finishEx')}</button>` : `<button class="btn ghost" data-s="finish">${t('finishEx')}</button><button class="btn" data-s="next">${t('nextSet')}</button>`}</div>
      <button class="btn soft" data-s="redo" style="margin-top:10px">${icon('flip', 16)} ${t('redoSet')}</button></div>`;
    root.appendChild(bg);
    T.aiNotes = [];
    if (!hasAI || (moveOk != null && moveOk < 70)) { speak(local); bg.querySelector('#aist')?.remove(); }
    else coachComment(data, store.settings().sendFrame ? T.frame : null).then(({ text, source }) => {
      if (!bg.isConnected) return;
      bg.querySelector('#aist')?.remove();
      if (source === 'gemini') { const p = bg.querySelector('#coachtxt'); if (p) p.textContent = text; speakRich(text); }
      else speak(local);
    });
    bg.querySelector('[data-s="finish"]').onclick = () => { bg.remove(); feedbackSheet(); };
    bg.querySelector('[data-s="redo"]').onclick = () => { bg.remove(); T.sets.pop(); setup(); }; // reprendre la même série
    const nx = bg.querySelector('[data-s="next"]');
    if (nx) nx.onclick = () => { bg.remove(); T.set++; restThen(setup); };
  }

  function feedbackSheet() {
    $('.bottom').hidden = true;
    const all = sessions();
    const sess = todaySession(true);
    const needCheckin = !sess.checkin && !sess.items.length && all.length > 0;
    const fb = { pain: Math.min(prof.painBase ?? 2, path.painMax), difficulty: 3, checkin: sess.checkin, note: '' };
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    let dict = null, micState = 'idle', saving = false;
    const micLabel = () => micState === 'listening' ? `${icon('close', 14)} ${t('micStop')}` : micState === 'transcribing' ? `<span class="spinner sm"></span> ${t('micTranscribing')}` : `${icon('mic', 16)} ${t('micStart')}`;
    const draw = () => {
      const over = fb.pain > path.painMax;
      bg.innerHTML = `<div class="sheet"><div class="grab"></div><h3>${t('feedbackTitle')}</h3>
        ${needCheckin ? `<div class="card" style="margin:12px 0"><b class="small">${t('checkinTitle')}</b><p class="small muted" style="margin:2px 0 8px">${t('checkinQ')}</p>
          <div class="seg">${['better', 'same', 'worse'].map((k) => `<button data-ci="${k}" class="${fb.checkin === k ? 'on' : ''}">${t(k)}</button>`).join('')}</div></div>` : ''}
        <div class="card" style="margin:12px 0"><div class="row between"><b>${t('painDuring')}</b><span class="mid ${over ? 'neg' : ''}" id="pv">${fb.pain}</span></div>
        <input type="range" min="0" max="10" value="${fb.pain}" id="pain" aria-label="${t('painDuring')}"><div class="scale"><span>0</span><span>${t('limit')} ${path.painMax}</span><span>10</span></div>
        <div id="pw" class="banner neg" style="margin-top:8px" ${over ? '' : 'hidden'}>${t('painStop')}</div></div>
        <b>${t('difficulty')}</b><div class="seg" style="margin:8px 0 14px">${[1, 2, 3, 4, 5].map((n) => `<button data-df="${n}" class="${fb.difficulty === n ? 'on' : ''}">${t('d' + n)}</button>`).join('')}</div>
        <label class="field comment-box"><span>${t('commentLabel')}</span><textarea class="input" id="note" placeholder="${t('commentPh')}" maxlength="400">${esc(fb.note)}</textarea></label>
        <div class="mic-row" style="margin:-4px 0 16px"><button class="mic-btn ${micState === 'listening' ? 'rec' : ''}" id="mic" type="button" ${micState === 'transcribing' ? 'disabled' : ''}>${micLabel()}</button><small class="muted" id="micmsg">${micState === 'listening' ? t('micListening') : ''}</small></div>
        <button class="btn" data-s="save" ${needCheckin && !fb.checkin ? 'disabled' : ''}>${t('save')}</button></div>`;
      bg.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = () => { fb.checkin = b.dataset.ci; draw(); }));
      bg.querySelectorAll('[data-df]').forEach((b) => (b.onclick = () => { fb.difficulty = +b.dataset.df; draw(); }));
      const r = bg.querySelector('#pain');
      r.oninput = () => { fb.pain = +r.value; const pv = bg.querySelector('#pv'); pv.textContent = r.value; pv.classList.toggle('neg', fb.pain > path.painMax); bg.querySelector('#pw').hidden = fb.pain <= path.painMax; };
      const note = bg.querySelector('#note'); note.oninput = () => { fb.note = note.value; };
      bg.querySelector('#mic').onclick = mic;
      bg.querySelector('[data-s="save"]').onclick = save;
    };
    // Dictée : le texte s'ajoute à ce que le patient a déjà écrit
    async function mic() {
      if (micState === 'listening') { dict && dict.stop(); return; }
      if (!dictationMode()) { toast(t('micKeyboard'), 4000); bg.querySelector('#note').focus(); return; }
      const base = fb.note ? fb.note.trim() + ' ' : '';
      dict = await startDictation({
        onText: (txt, final) => { if (saving) return; fb.note = (base + (txt || '')).slice(0, 400); const n = bg.querySelector('#note'); if (n) n.value = fb.note; },
        onState: (st) => {
          if (saving) return;
          if (st === 'denied') { toast(t('micDenied'), 4500); st = 'idle'; }
          if (st === 'error') { toast(t('micErr'), 4000); st = 'idle'; }
          if (st === 'unavailable') { toast(t('micKeyboard'), 4000); st = 'idle'; }
          micState = st; const y = bg.querySelector('.sheet')?.scrollTop; draw(); const sh = bg.querySelector('.sheet'); if (sh && y != null) sh.scrollTop = y;
        },
      });
    }
    async function save() {
      if (saving) return;
      saving = true;
      const sets = validSets();
      if (!sets.length) { T.discard = true; return go('#/home'); } // rien de réellement fait : ni niveau ni série du jour
      T.saved = true;
      if (dict && micState === 'listening') dict.stop();
      const noteTxt = (fb.note || '').trim();
      const it = { id, level, sets, pain: fb.pain, difficulty: fb.difficulty, ts: Date.now() };
      if (noteTxt) it.note = noteTxt;
      if (needCheckin) sess.checkin = fb.checkin;
      const adj = P.adjustLevel(prof, it, all, sess.checkin);
      it.change = adj.change;
      it.reason = adj.reason;
      const prev = sess.items.find((i) => i.id === id);
      if (prev && !prev.partial) it.redo = (prev.redo || 0) + 1; // exercice refait le même jour : on garde le dernier essai
      sess.items = sess.items.filter((i) => i.id !== id).concat(it);
      await store.saveSession(sess);
      await store.saveProfile({ ...profile(), levels: { ...(profile().levels || {}), [id]: adj.level } });
      state.data = await store.loadData();
      syncProgress();
      if (profile()?.role !== 'clinician') import('./badges.js').then((m) => m.syncBadges()).catch((e) => console.warn('badges', e));
      toast(adj.reason === 'flare' ? t('flareKeep') : adj.change > 0 ? `${t('lvlUp')} ${adj.level}` : adj.change < 0 ? `${t('lvlDown')} ${adj.level}` : `${t('lvlSame')} ${adj.level}`);
      let nxt = nextExercise();
      if (state.redoQueue?.length) { const q = state.redoQueue; const i = q.indexOf(id); const n = q[i + 1]; if (n) nxt = { id: n }; else { state.redoQueue = null; nxt = null; } }
      const leave = () => { bg.remove(); go(nxt ? `#/ex/${nxt.id}` : '#/home'); };
      if (!noteTxt) return leave();
      // Le coach répond au commentaire (Gemini si disponible, sinon accusé de réception)
      bg.innerHTML = `<div class="sheet"><div class="grab"></div><h3>${t('coachReply')}</h3>
        <div class="card small" style="margin:12px 0"><span class="muted">« ${esc(noteTxt)} »</span></div>
        <div class="list"><div class="coach-box"><span class="ai">${icon('spark', 18)}</span><div><p id="rep" class="muted">${aiAvailable() ? t('thinking') : t('lcReplyLocal')}</p></div></div></div>
        <button class="btn" id="go" style="margin-top:14px">${t('next')}</button></div>`;
      bg.querySelector('#go').onclick = leave;
      if (aiAvailable()) {
        const { text } = await coachReply({ exercise: tr(ex.name), condition: tr(path.name), pain: fb.pain, painLimit: path.painMax, difficulty: fb.difficulty, comment: noteTxt });
        const p = bg.querySelector('#rep'); if (p) { p.textContent = text; p.classList.remove('muted'); speakRich(text); }
      }
    }
    draw(); root.appendChild(bg);
    speak(t('feedbackAsk'), { interrupt: true });
  }

  setup();
}
