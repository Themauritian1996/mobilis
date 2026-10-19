// Séance d'un exercice : caméra (pose 2D, 2 plans) ou mode guidé, résumé, rétroaction et ajustement du niveau.
import { t, tr } from './i18n.js';
import { EXERCISES } from './data/exercises.js';
import * as P from './program.js';
import * as store from './store.js';
import { loadPose, detect, toPx, Tracker, drawSkeleton, FAULT_JOINTS, detectPlane, bodyVisible } from './pose.js';
import { speak, cue, cueText, countAloud, coachComment, coachReply, speakRich, grabFrame, startDictation, dictationMode, aiAvailable } from './coach.js';
import { state, go, profile, sessions, todaySession, nextExercise, syncProgress } from './state.js';
import { esc, icon, IC, toast, mountFigs, figSvg, figureBlock, sleep } from './ui.js';

const RING = 276.5;

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
  const totalSets = dose.type === 'hold' ? dose.sets * (dose.reps || 1) : dose.sets;
  const T = { set: 0, sets: [], stream: null, raf: 0, tracker: null, mode: ex.track ? 'camera' : 'guided', facing: store.settings().camera, active: false, guidedTimer: null, selfView: store.settings().selfView !== false };
  const planeFor = (i) => planes[i % planes.length];
  const holdTarget = dose.type === 'hold' ? dose.hold : 0;

  const root = document.createElement('div');
  root.className = 'train';
  root.innerHTML = `<div class="stage"><video playsinline muted hidden poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><canvas class="overlay"></canvas>
    <div class="hud-top"><button class="icon-btn" data-t="close" aria-label="${t('close')}">${icon('close', 20)}</button>
      <div class="hud-title"><b>${esc(tr(ex.name))}</b><small id="setlbl"></small><div id="pbadge"></div></div>
      <div class="hud-btns"><button class="icon-btn" data-t="demo" aria-label="${t('exDemoBtn')}" title="${t('exDemoBtn')}">${icon('demo', 20)}</button>
      <button class="icon-btn" data-t="video" aria-pressed="true"></button>
      <button class="icon-btn" data-t="flip" aria-label="${t('camSwitch')}" title="${t('camSwitch')}">${icon('flip', 20)}</button></div></div>
    <div class="vid-off" hidden>${icon('eyeOff', 18)} <span>${t('videoOffNote')}</span></div>
    <div class="depth" hidden><i style="height:0"></i></div>
    <div class="counter" hidden><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.18)" stroke-width="5" fill="none"/><circle id="ring" cx="50" cy="50" r="44" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><div class="val"><div><b id="cnt">0</b><small id="cntlbl"></small></div></div></div>
    <button class="mini-fig" hidden aria-label="${t('exDemoBtn')}">${figSvg(id)}<span>${icon('demo', 12)} ${t('demoShort')}</span></button>
    <div class="demo" hidden></div>
    <div class="cue" hidden><span></span></div>
    <div class="center-msg" hidden></div>
    <div class="setup" hidden></div></div>
    <div class="bottom"><button class="btn ghost" data-t="guided">${t('doGuided')}</button><button class="btn" data-t="end" hidden>${t('endSet')}</button></div>`;
  document.body.appendChild(root);
  document.getElementById('app').innerHTML = '';
  const $ = (s) => root.querySelector(s);
  const video = $('video'), canvas = $('canvas.overlay'), g = canvas.getContext('2d');
  mountFigs(root);

  function close() {
    T.active = false; cancelAnimationFrame(T.raf); clearInterval(T.guidedTimer);
    if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop());
    try { speechSynthesis.cancel(); } catch (_) {}
    root.remove();
  }
  cleanup.push(close);
  $('[data-t="close"]').onclick = () => go('#/home');

  // Vidéo selfie (on/off) : l'image du patient en direct ; l'analyse continue même si elle est masquée.
  function paintVideoBtn() {
    const b = $('[data-t="video"]');
    b.innerHTML = icon(T.selfView ? 'eye' : 'eyeOff', 20);
    b.setAttribute('aria-pressed', String(T.selfView)); b.setAttribute('aria-label', t(T.selfView ? 'videoOff' : 'videoOn')); b.title = b.getAttribute('aria-label');
    b.classList.toggle('dim', !T.selfView);
    video.classList.toggle('off', !T.selfView);
    $('[data-t="flip"]').hidden = !T.stream || !T.selfView;
    $('.vid-off').hidden = !(T.stream && !T.selfView && T.mode === 'camera' && T.active);
    const sw = root.querySelector('[data-t="selfview"]'); if (sw) { sw.classList.toggle('on', T.selfView); sw.setAttribute('aria-checked', String(T.selfView)); }
  }
  async function setSelfView(on) {
    T.selfView = on; store.saveSettings({ selfView: on });
    // Mode guidé : la vidéo sert de miroir (sans analyse) ; on ouvre / ferme la caméra selon le choix.
    if (T.mode === 'guided' && T.active) { if (on) await mirrorOn(); else { stopCam(); guidedLayout(); } }
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
  $('.mini-fig').onclick = openDemo;

  function setLabel() {
    $('#setlbl').textContent = `${t('set')} ${T.set + 1} ${t('of')} ${totalSets} · ${doseText(dose)}${item?.flare ? ' · ' + t('flareShort') : ''}`;
    if (T.mode === 'camera') {
      const pl = planeFor(T.set);
      $('#pbadge').innerHTML = `<span class="plane-badge">${icon(pl === 'side' ? 'side' : 'front', 14)} ${t(pl === 'side' ? 'planeSide' : 'planeFront')} · ${t(pl === 'side' ? 'planeSideD' : 'planeFrontD')}</span>`;
    } else $('#pbadge').innerHTML = '';
  }
  function showCue(text, kind) { const c = $('.cue'); c.hidden = !text; c.querySelector('span').textContent = text || ''; c.querySelector('span').className = kind || ''; }
  function center(html) { const c = $('.center-msg'); c.hidden = !html; c.innerHTML = html || ''; }

  function setup() {
    $('.bottom').hidden = false;
    setLabel(); showCue(''); center('');
    $('[data-t="end"]').hidden = true; $('.counter').hidden = true; $('.depth').hidden = true; $('.mini-fig').hidden = true;
    const s = $('.setup'); s.hidden = false;
    if (T.mode === 'camera') {
      const pl = planeFor(T.set);
      s.innerHTML = `<span class="eyebrow">${t('setupTitle')}</span><h3 style="margin:6px 0 4px">${t(pl === 'side' ? 'setupSide' : 'setupFront')}</h3>
        ${figureBlock(id, { keys: false })}<p class="small muted">${t('setupTip')}</p>
        ${selfRow('selfViewD')}
        <button class="btn" data-t="go">${icon('cam', 20)} ${t('camStart')}</button>`;
      $('[data-t="guided"]').hidden = false;
    } else {
      s.innerHTML = `<h3>${esc(tr(ex.name))}</h3>${figureBlock(id)}
        <ol class="steplist small" style="margin:6px -16px">${tr(ex.steps).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        ${navigator.mediaDevices?.getUserMedia ? selfRow('mirrorD') : ''}
        <button class="btn" data-t="go">${IC.play.replace('<svg', '<svg width="18" height="18"')} ${t('start')}</button>`;
      $('[data-t="guided"]').hidden = true;
    }
    mountFigs(s);
    const sv = s.querySelector('[data-t="selfview"]'); if (sv) sv.onclick = () => setSelfView(!T.selfView);
    paintVideoBtn();
    s.querySelector('[data-t="go"]').onclick = () => (T.mode === 'camera' ? startCamera() : startGuided());
  }
  const selfRow = (d) => `<div class="toggle selfrow"><span><b>${icon('eye', 16)} ${t('selfView')}</b><br><small class="muted">${t(d)}</small></span><button class="switch ${T.selfView ? 'on' : ''}" data-t="selfview" role="switch" aria-checked="${T.selfView}" aria-label="${t('selfView')}"></button></div>`;
  $('[data-t="guided"]').onclick = () => { T.mode = 'guided'; stopCam(); setup(); };
  $('[data-t="flip"]').onclick = async () => {
    T.facing = T.facing === 'user' ? 'environment' : 'user'; store.saveSettings({ camera: T.facing });
    if (T.stream) { stopCam(); await openCam(); }
  };
  function stopCam() { if (T.stream) T.stream.getTracks().forEach((tk) => tk.stop()); T.stream = null; video.srcObject = null; video.hidden = true; paintVideoBtn(); }
  async function openCam() {
    T.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: T.facing, width: { ideal: 960 }, height: { ideal: 720 } } });
    video.srcObject = T.stream; await video.play();
    video.hidden = false;
    video.classList.toggle('mirror', T.facing === 'user');
    paintVideoBtn();
  }
  // Mode guidé avec vidéo : le patient se voit en miroir, le schéma passe en vignette
  async function mirrorOn() {
    try { if (!T.stream) await openCam(); } catch (e) { console.warn(e); toast(e && e.name === 'NotAllowedError' ? t('camDenied') : t('mirrorErr'), 4000); T.selfView = false; }
    guidedLayout();
  }
  function guidedLayout() {
    if (T.mode !== 'guided' || !T.active) return;
    const live = !!(T.stream && T.selfView);
    $('.mini-fig').hidden = !live;
    if (live) center(''); else { center(`<div class="guided-fig">${figSvg(id, { keys: true })}</div>`); mountFigs(root.querySelector('.center-msg')); }
  }

  async function startCamera() {
    $('.setup').hidden = true; center(`<div><div class="spinner"></div>${t('loadingModel')}</div>`);
    try {
      if (!T.stream) await openCam();
      await loadPose();
    } catch (e) {
      console.error(e); center(''); stopCam();
      toast(e && e.name === 'NotAllowedError' ? t('camDenied') : t('modelErr'), 4500);
      T.mode = 'guided'; return setup();
    }
    for (const n of [3, 2, 1]) { center(`<div class="bignum">${n}</div>`); speak(String(n), { interrupt: true }); await sleep(900); }
    center(''); speak(cueText('go'));
    runSet();
  }

  function runSet() {
    const pl = planeFor(T.set);
    const recentFaults = new Map();
    T.frame = null;
    T.tracker = new Tracker(ex, pl, {
      romFactor: dose.romFactor,
      onCue: (k) => { if (cue(k)) { showCue(cueText(k), k === 'holdIt' || k === 'depth' ? '' : 'bad'); recentFaults.set(k, performance.now()); setTimeout(() => showCue(''), 2200); } },
      onRep: (rep) => {
        countAloud(T.tracker.reps);
        if (rep.full && !rep.faults.length && T.tracker.full % 3 === 0 && cue('great')) { showCue(cueText('great'), 'good'); setTimeout(() => showCue(''), 1500); }
        if (dose.type !== 'hold' && T.tracker.reps === dose.reps - 1) setTimeout(() => cue('lastRep'), 600);
        if (store.settings().sendFrame && (!T.frame || rep.faults.length)) T.frame = grabFrame(video, T.facing === 'user');
        if (dose.type !== 'hold' && T.tracker.reps >= dose.reps) setTimeout(endSet, 900);
      },
    });
    $('.counter').hidden = false; $('.depth').hidden = dose.type === 'hold'; $('.mini-fig').hidden = false; paintVideoBtn();
    $('[data-t="end"]').hidden = false; $('[data-t="guided"]').hidden = true;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    T.active = true;
    let lastWarn = 0;
    const loop = () => {
      if (!T.active) return;
      const now = performance.now();
      const lm = detect(video, now);
      const W = canvas.width = canvas.clientWidth * devicePixelRatio, H = canvas.height = canvas.clientHeight * devicePixelRatio;
      const fj = new Set();
      for (const [k, ts] of recentFaults) if (now - ts < 1500) (FAULT_JOINTS[k] || []).forEach((j) => fj.add(j));
      if (lm) {
        const vw = video.videoWidth, vh = video.videoHeight;
        const sc = Math.max(W / vw, H / vh), ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2;
        const proj = lm.map((l) => ({ x: (l.x * vw * sc + ox) / W, y: (l.y * vh * sc + oy) / H, visibility: l.visibility }));
        drawSkeleton(g, proj, W, H, fj, T.facing === 'user');
        const p = toPx(lm, vw, vh);
        if (!bodyVisible(p)) { if (now - lastWarn > 3000) { lastWarn = now; cue('notVisible'); showCue(t('notVisible'), 'bad'); } }
        else {
          const dp = detectPlane(p);
          if (dp && dp !== 'between' && dp !== pl && !T.tracker.calibrated) {
            if (now - lastWarn > 3500) { lastWarn = now; const k = pl === 'side' ? 'turnSide' : 'turnFront'; cue(k); showCue(t(k), 'bad'); }
          } else {
            const st = T.tracker.update(p, now);
            if (st.phase === 'calibrating') showCue(t('calibrating'));
            else if ($('.cue span').textContent === t('calibrating')) showCue('');
            if (dose.type === 'hold') {
              $('#cnt').textContent = Math.floor(st.holdSec || 0);
              $('#ring').style.strokeDashoffset = RING * (1 - Math.min(1, (st.holdSec || 0) / holdTarget));
              if ((st.holdSec || 0) >= holdTarget) { endSet(); return; }
            } else {
              $('#cnt').textContent = st.reps || 0;
              $('#ring').style.strokeDashoffset = RING * (1 - Math.min(1, (st.reps || 0) / dose.reps));
              $('.depth i').style.height = `${Math.round((st.progress || 0) * 100)}%`;
            }
          }
        }
      } else g.clearRect(0, 0, W, H);
      T.raf = requestAnimationFrame(loop);
    };
    T.raf = requestAnimationFrame(loop);
  }
  $('[data-t="end"]').onclick = () => (T.mode === 'camera' ? endSet() : endGuided());

  function endSet() {
    if (!T.active) return;
    T.active = false; cancelAnimationFrame(T.raf); g.clearRect(0, 0, canvas.width, canvas.height); showCue('');
    const sum = T.tracker.summary();
    const pl = planeFor(T.set);
    T.sets.push({ plane: pl, mode: sum.mode, reps: sum.reps, full: sum.full, partial: sum.partial, holdSec: sum.holdSec, quality: sum.quality, faults: sum.faults });
    speak(cueText('setDone'), { interrupt: true });
    summarySheet({ ...sum, plane: pl });
  }

  function startGuided() {
    $('.setup').hidden = true; $('.counter').hidden = false; $('[data-t="end"]').hidden = false; $('[data-t="guided"]').hidden = true;
    T.active = true;
    if (T.selfView && navigator.mediaDevices?.getUserMedia) mirrorOn(); else guidedLayout();
    const tempo = (dose.tempo || '2-1-2').split('-').map(Number);
    const repSec = Math.max(3, tempo.reduce((a, b) => a + b, 0) + (dose.holdTop || 0));
    let el = 0, reps = 0;
    $('#cntlbl').textContent = dose.type === 'hold' ? `/ ${holdTarget} ${t('sec')}` : `/ ${dose.reps}`;
    speak(cueText('go'));
    T.guidedTimer = setInterval(() => {
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
    T.active = false; clearInterval(T.guidedTimer); center(''); $('.mini-fig').hidden = true;
    const { el, reps } = T.guidedEl();
    const sum = dose.type === 'hold' ? { mode: 'hold', holdSec: el, reps: 0, full: 0, partial: 0, quality: null, faults: {} } : { mode: 'reps', reps, full: reps, partial: 0, quality: null, faults: {} };
    T.sets.push({ plane: 'guided', ...sum });
    speak(cueText('setDone'), { interrupt: true });
    summarySheet({ ...sum, plane: 'guided' });
  }

  function summarySheet(sum) {
    $('.bottom').hidden = true;
    const last = T.set + 1 >= totalSets;
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    const faults = Object.entries(sum.faults || {}).sort((a, b) => b[1] - a[1]);
    bg.innerHTML = `<div class="sheet"><div class="grab"></div><span class="eyebrow">${t('set')} ${T.set + 1}/${totalSets}</span><h3 style="margin-top:4px">${t('setSummary')}</h3>
      <div class="list" style="margin:12px 0"><div class="kpis">${sum.mode === 'hold'
        ? `<div><b>${sum.holdSec}s</b><span>${t('holdTime')}</span></div>`
        : `<div><b>${sum.full}</b><span>${t('fullReps')}</span></div><div><b>${sum.partial}</b><span>${t('partialReps')}</span></div>`}
        <div><b>${sum.quality != null ? Math.round(sum.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div></div></div>
      ${faults.length ? `<div class="row wrap" style="gap:6px;margin-bottom:12px">${faults.slice(0, 3).map(([k]) => `<span class="chip neg">${esc(cueText(k))}</span>`).join('')}</div>` : ''}
      <div class="list"><div class="coach-box"><span class="ai">${icon('spark', 18)}</span><div><b class="small">${t('coachSays')}</b><p id="coachtxt" class="muted">${t('thinking')}</p></div></div></div>
      <div class="row" style="margin-top:14px">${last ? `<button class="btn" data-s="finish">${t('finishEx')}</button>` : `<button class="btn ghost" data-s="finish">${t('finishEx')}</button><button class="btn" data-s="next">${t('nextSet')}</button>`}</div></div>`;
    root.appendChild(bg);
    const data = {
      kind: 'set', exercise: tr(ex.name), condition: tr(path.name), plane: sum.plane, level, target: dose.type === 'hold' ? `${holdTarget}s` : dose.reps,
      mode: sum.mode, reps: sum.reps, full: sum.full, partial: sum.partial, holdSec: sum.holdSec, quality: sum.quality,
      faults: Object.fromEntries(faults.map(([k, v]) => [k, Math.round(v)])), painLimit: path.painMax, set: T.set + 1, totalSets,
    };
    coachComment(data, store.settings().sendFrame ? T.frame : null).then(({ text }) => {
      const p = bg.querySelector('#coachtxt'); if (p) { p.textContent = text; p.classList.remove('muted'); }
      speakRich(text);
    });
    bg.querySelector('[data-s="finish"]').onclick = () => { bg.remove(); feedbackSheet(); };
    const nx = bg.querySelector('[data-s="next"]');
    if (nx) nx.onclick = () => { bg.remove(); T.set++; setup(); };
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
      if (dict && micState === 'listening') dict.stop();
      const noteTxt = (fb.note || '').trim();
      const it = { id, level, sets: T.sets, pain: fb.pain, difficulty: fb.difficulty, ts: Date.now() };
      if (noteTxt) it.note = noteTxt;
      if (needCheckin) sess.checkin = fb.checkin;
      const adj = P.adjustLevel(prof, it, all, sess.checkin);
      it.change = adj.change;
      sess.items = sess.items.filter((i) => i.id !== id).concat(it);
      await store.saveSession(sess);
      await store.saveProfile({ ...profile(), levels: { ...(profile().levels || {}), [id]: adj.level } });
      state.data = await store.loadData();
      syncProgress();
      toast(adj.reason === 'flare' ? t('flareKeep') : adj.change > 0 ? `${t('lvlUp')} ${adj.level}` : adj.change < 0 ? `${t('lvlDown')} ${adj.level}` : `${t('lvlSame')} ${adj.level}`);
      const nxt = nextExercise();
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
