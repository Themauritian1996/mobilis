// Coach IA en direct : Gemini regarde la vidéo de la caméra pendant la série et corrige à voix haute.
// 1) API Live de Gemini (WebSocket) : 1 image/s + un point d'étape toutes les ~7 s → réponse vocale (PCM 24 kHz) + transcription.
// 2) Repli : une image toutes les 8 s analysée par Gemini (generateContent), lue par la voix de l'appareil.
// Nécessite la clé Gemini personnelle (Profil → Coach IA). Les images vont à Google ; Mobilis n'en garde aucune.
import { CONFIG } from './config.js';
import { settings } from './store.js';
import { langInfo } from './i18n.js';
import { speak, geminiDirect, setLiveTalking } from './coach.js';

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export const liveAvailable = () => !!settings().geminiKey && typeof WebSocket !== 'undefined';

// ---------- Audio (doit être « débloqué » par un geste de l'utilisateur) ----------
let ctx = null;
export function primeAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (_) {}
}

function systemPrompt(c) {
  return `You are a live musculoskeletal rehab coach supervised by a physiatrist, watching the patient through their phone's front camera (the image may be mirrored).
Exercise: ${c.exercise}. Condition: ${c.condition}. Target: ${c.target}. Pain limit during exercise: ${c.painLimit}/10.
Correct technique: ${c.steps.join(' ')} Key points: ${c.keys.join('; ')}.
When you get a "CHECK" message, look at the latest video frames and reply with ONE very short spoken sentence (max 12 words): the single most important correction you can actually see, or brief encouragement if the form looks right. If the patient is not visible, ask them to step back so their whole body is in view.
The app also measures the movement with validated pose tracking and tells you its measurements in each CHECK: TRUST THEM over your visual impression. ${c.plane === 'side' ? 'Side view: do not comment on knee valgus or left/right symmetry (not visible).' : c.plane === 'front' ? 'Front view: do not comment on forward trunk lean, squat depth or low-back arch (not visible).' : 'Fine movement: only comment on gross posture.'}
Only give corrections that are part of the correct technique above; if you are not sure, encourage instead. The skeleton overlay (red joints = measured fault) is drawn on the frames.
Never count repetitions (the app counts). Never diagnose, never change the program. If they look in pain, tell them to ease off.
Always speak ${langInfo().label}, warm and simple, no jargon.`;
}

/**
 * Démarre le coach en direct.
 * @param {object} o  video, mirror(bool), context {exercise, condition, target, painLimit, steps[], keys[]},
 *                    getState() → {reps, target, holdSec, faults[]}, onText(text, final), onState(state)
 *                    state : 'connecting' | 'live' | 'snapshot' | 'error' | 'off'
 * @returns {{stop: Function}}
 */
export function startLiveCoach(o) {
  const key = settings().geminiKey;
  let stopped = false, ws = null, frameTimer = 0, checkTimer = 0, modelIdx = 0, ready = false, busy = false, text = '';
  let nextAt = 0, endTimer = 0, lastCheck = 0, snapTimer = 0, reconnects = 0;
  const cv = document.createElement('canvas');
  primeAudio();

  const frame = (w = 512) => {
    if (o.frame) return o.frame(w); // image annotée (squelette) fournie par la séance
    const v = o.video; if (!v.videoWidth) return null;
    cv.width = w; cv.height = Math.round((v.videoHeight / v.videoWidth) * w);
    const g = cv.getContext('2d'); g.save();
    if (o.mirror) { g.translate(cv.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0, cv.width, cv.height); g.restore();
    return cv.toDataURL('image/jpeg', 0.6).split(',')[1];
  };
  const checkText = () => {
    const s = o.getState ? o.getState() : {};
    const f = ((s.faults || []).length ? ` App-detected issues: ${s.faults.join(', ')}.` : ' No fault measured by the app.') + (s.measures ? ` Measurements: ${s.measures}.` : '');
    return `CHECK. ${s.holdSec != null ? `Holding ${s.holdSec}s of ${s.target}s.` : `Rep ${s.reps || 0} of ${s.target}.`}${f}`;
  };

  // --- lecture du PCM 16 bits 24 kHz ---
  function play(b64) {
    if (!ctx) return;
    const bin = atob(b64), n = bin.length >> 1, buf = ctx.createBuffer(1, n, 24000), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; ch[i] = v / 32768; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    const t0 = Math.max(ctx.currentTime + 0.03, nextAt); src.start(t0); nextAt = t0 + buf.duration;
    setLiveTalking(true); clearTimeout(endTimer);
    endTimer = setTimeout(() => setLiveTalking(false), (nextAt - ctx.currentTime) * 1000 + 150);
  }

  function clearTimers() { clearInterval(frameTimer); clearInterval(checkTimer); clearInterval(snapTimer); }

  function connect() {
    if (stopped) return;
    const model = CONFIG.geminiLiveModels[modelIdx];
    if (!model) return snapshotMode();
    ready = false; o.onState('connecting');
    try { ws = new WebSocket(`${WS}?key=${encodeURIComponent(key)}`); } catch (_) { return snapshotMode(); }
    const sock = ws;
    sock.onopen = () => sock.send(JSON.stringify({
      setup: {
        model: `models/${model}`,
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: systemPrompt(o.context) }] },
        outputAudioTranscription: {},
      },
    }));
    sock.onmessage = async (e) => {
      let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()); } catch (_) { return; }
      if (m.setupComplete) {
        ready = true; reconnects = 0; o.onState('live');
        frameTimer = setInterval(() => { const d = frame(); if (d && sock.readyState === 1) sock.send(JSON.stringify({ realtimeInput: { video: { data: d, mimeType: 'image/jpeg' } } })); }, 1000);
        checkTimer = setInterval(() => {
          if (busy || sock.readyState !== 1 || Date.now() - lastCheck < 6500) return;
          lastCheck = Date.now(); busy = true; text = '';
          sock.send(JSON.stringify({ realtimeInput: { text: checkText() } }));
          setTimeout(() => { busy = false; }, 9000); // garde-fou si turnComplete n'arrive pas
        }, 1000);
        return;
      }
      const sc = m.serverContent;
      if (sc) {
        for (const p of sc.modelTurn?.parts || []) {
          if (p.inlineData?.data) play(p.inlineData.data);
          else if (p.text && !sc.outputTranscription) { text += p.text; o.onText(text.trim(), false); }
        }
        if (sc.outputTranscription?.text) { text += sc.outputTranscription.text; o.onText(text.trim(), false); }
        if (sc.turnComplete || sc.generationComplete) { busy = false; if (text.trim()) o.onText(text.trim(), true); }
        if (sc.interrupted) busy = false;
      }
      if (m.goAway) { try { sock.close(); } catch (_) {} }
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      clearTimers();
      if (stopped || sock !== ws) return;
      if (!ready) { modelIdx++; return connect(); } // modèle refusé → modèle suivant
      if (++reconnects <= 5) setTimeout(connect, 300); // limite de 2 min par session vidéo → nouvelle session
      else snapshotMode();
    };
  }

  // --- Repli : image toutes les 8 s, réponse lue par la voix de l'appareil ---
  function snapshotMode() {
    if (stopped) return;
    clearTimers(); o.onState('snapshot');
    const sys = `${systemPrompt(o.context)}\nYou receive one still frame at a time instead of video.`;
    let pending = false;
    const tick = async () => {
      if (stopped || pending) return;
      const d = frame(448); if (!d) return;
      pending = true;
      try {
        const r = await geminiDirect(key, sys, [{ text: checkText() }, { inline_data: { mime_type: 'image/jpeg', data: d } }], 60);
        if (!stopped && r) { o.onText(r, true); setLiveTalking(true); speak(r, { interrupt: true }); setTimeout(() => setLiveTalking(false), 2500); }
      } catch (e) { console.warn('live snapshot', e); if (!stopped) o.onState('error'); }
      pending = false;
    };
    setTimeout(tick, 2500);
    snapTimer = setInterval(tick, 8000);
  }

  connect();
  return {
    stop() {
      stopped = true; clearTimers(); clearTimeout(endTimer); setLiveTalking(false);
      try { ws && ws.close(); } catch (_) {}
      o.onState('off');
    },
  };
}
