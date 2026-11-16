// Coach IA en direct : Gemini regarde la vidéo de la caméra pendant la série et corrige à voix haute.
// 1) API Live de Gemini (WebSocket) : 1 image/s en continu + un « CHECK » déclenché par les ÉVÈNEMENTS de la séance
//    (répétition terminée, défaut mesuré, main perdue / retrouvée ; écart minimal 3 s) avec une image fraîche ;
//    une minuterie lente (8 s) ne sert que de repli. Réponse vocale (PCM 24 kHz) + transcription.
// 2) Repli : une image analysée par Gemini (generateContent) sur les mêmes évènements, lue par la voix de l'appareil.
// Nécessite la clé Gemini personnelle (Profil → Coach IA). Les images vont à Google ; Mobilis n'en garde aucune.
import { CONFIG } from './config.js';
import { settings, aiKey, aiCount, PROXY_KEY } from './store.js';
import { aiLangInfo, getAiLang } from './i18n.js';
import { speakAI, geminiDirect, setLiveTalking } from './coach.js';
import { planeText, fineKind } from './ai-coach.js';
import { primeAudio, pushLive, endLiveTurn, stopAll } from './audio.js';

export { primeAudio };
export const MIN_GAP = 3000, FALLBACK_MS = 8000, FIRST_MS = 2500, FRAME_MS = 1000;

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
// Coach IA disponible (précis ou en direct) : une clé, ou l'accès partagé du clinicien (clé ou relais)
export const liveAvailable = () => !!aiKey();
// Le mode « direct » (WebSocket Gemini Live) exige une vraie clé : impossible par le relais HTTP → le coach précis le remplace
export const liveSocketAvailable = () => !!aiKey() && aiKey() !== PROXY_KEY && typeof WebSocket !== 'undefined';

const REGISTER = {
  fr: 'French (Canada): ALWAYS address the patient informally with "tu" / "ton" / "ta", NEVER "vous" (the app itself says "tu")',
  es: 'Spanish: informal "tú", never "usted"', pt: 'Portuguese (Brazil): informal "você"/"tu", never "o senhor/a senhora"',
};
const speakLang = () => REGISTER[getAiLang()] || `${aiLangInfo().label}, informal and friendly register (the way you would talk to a friend, never formal)`;

// Similarité de deux remarques (mots normalisés en commun / le plus long) : > 0.7 → même idée
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
export function similar(a, b) {
  const A = new Set(norm(a)), B = new Set(norm(b)); if (!A.size || !B.size) return false;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size) > 0.7;
}

function systemPrompt(c) {
  return `You are a live musculoskeletal rehab coach supervised by a physiatrist, watching the patient through their phone's front camera (the image may be mirrored).
Exercise: ${c.exercise}. Condition: ${c.condition}. Target: ${c.target}. Pain limit during exercise: ${c.painLimit}/10.
Correct technique: ${c.steps.join(' ')} Key points: ${c.keys.join('; ')}.
When you get a "CHECK" message, look at the latest video frame and reply with ONE very short spoken sentence (max 12 words) about the movement TECHNIQUE: the single most important correction you can actually see (use the technique steps and key points above), or, if the form is right, a short varied encouragement. NEVER repeat or rephrase an idea from the "last remarks" listed in the CHECK: say something new.
VISIBILITY: the CHECK says "Hand/Body visible and tracked by the app: yes/no". If yes, NEVER mention visibility, framing, or ask the patient to show/move/step back; the app's tracker is right, not your impression of the image. Only if it says no, briefly ask them to bring it back into view.
Camera: ${planeText(c)}.
The app also measures the movement with validated tracking and tells you its measurements in each CHECK: TRUST THEM over your visual impression.
Only give corrections that are part of the correct technique above; if you are not sure, encourage instead. The skeleton overlay (red joints = measured fault${c.ex && fineKind(c.ex) === 'hand' ? '; 21-point hand skeleton' : ''}) is drawn on the frames.${c.ex && fineKind(c.ex) ? ` Never ask the patient to show their ${fineKind(c.ex)} unless the CHECK says it is not tracked.` : ''}
Never count repetitions (the app counts). Never diagnose, never change the program. If they look in pain, tell them to ease off.
Always speak ${speakLang()}. Warm and simple, no jargon.`;
}

/**
 * Démarre le coach en direct.
 * @param {object} o  video, mirror(bool), frame(w) → JPEG base64 annoté, context {exercise, condition, target, painLimit, steps[], keys[]},
 *                    getState() → {reps, target, holdSec, faults[], measures, tracked(bool), subject('hand'|'body'|'foot'), paused, phase, lastRomPct},
 *                    onText(text, final | 'drop'), onState(state)
 *                    state : 'connecting' | 'live' | 'snapshot' | 'error' | 'off'
 * @returns {{stop: Function, event: Function}}  event(kind, info) : 'rep' {n, romPct, faults[]} | 'fault' {fault} | 'lost' {subject, sec} | 'back' {subject}
 */
export function startLiveCoach(o) {
  const key = aiKey();
  aiCount(5); // une session Live compte pour 5 appels dans le plafond quotidien du clinicien
  let stopped = false, ws = null, frameTimer = 0, checkTimer = 0, modelIdx = 0, ready = false, busy = false, text = '', busyT = 0, evT = 0;
  let endTimer = 0, lastCheck = 0, snapTimer = 0, reconnects = 0, resumeHandle = null, setupFails = 0, noExtras = false;
  let events = [], lastHadIssue = true, sent = 0, snapSend = null, drop = false;
  const remarks = []; // dernières remarques du coach (2 gardées) : on interdit de les répéter
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
  const state = () => { try { return (o.getState && o.getState()) || {}; } catch (_) { return {}; } };
  const isPaused = () => !!state().paused;
  const evText = (e) => {
    const i = e.info || {};
    if (e.kind === 'rep') return `Rep ${i.n ?? '?'} just completed${i.romPct != null ? `, reached ${i.romPct}% of the target range` : ''}${(i.faults || []).length ? `, faults: ${i.faults.join(', ')}` : ', no fault'}`;
    if (e.kind === 'fault') return `The app just measured a fault: ${i.fault}`;
    if (e.kind === 'lost') return `The app lost the ${i.subject || 'subject'} for ${i.sec != null ? i.sec + 's' : 'a moment'}`;
    if (e.kind === 'back') return `The app tracks the ${i.subject || 'subject'} again`;
    return e.kind;
  };
  const checkText = (evs = []) => {
    const s = state(), subj = s.subject === 'hand' ? 'Hand' : s.subject === 'foot' ? 'Foot' : 'Body';
    const tracked = s.tracked !== false;
    const f = ((s.faults || []).length ? ` App-detected issues: ${s.faults.join(', ')}.` : ' No fault measured by the app.') + (s.measures ? ` Measurements: ${s.measures}.` : '');
    const prog = s.holdSec != null ? `Holding ${s.holdSec}s of ${s.target}s.` : `Rep ${s.reps || 0} of ${s.target}.`;
    const last = s.lastRomPct != null ? ` Last rep range: ${s.lastRomPct}%.` : '';
    const ev = evs.length ? ` Events since last check: ${evs.map(evText).join('; ')}.` : '';
    const rem = remarks.length ? ` Your last remarks (do NOT repeat or rephrase them): ${remarks.map((r) => `"${r}"`).join(' | ')}.` : '';
    return `CHECK. ${subj} visible and tracked by the app: ${tracked ? 'yes' : 'NO'}. ${tracked ? 'Never talk about visibility or framing.' : 'Briefly ask the patient to bring it back into view.'} Phase: ${s.phase || 'unknown'}. Paused: ${s.paused ? 'yes' : 'no'}. ${prog}${last}${f}${ev}${rem} Reply with ONE new short sentence (max 12 words), informal register.`;
  };

  // --- lecture du PCM 16 bits 24 kHz (tampon anti-saccades dans audio.js) ---
  function play(b64) {
    if (stopped || drop) return;
    const lead = pushLive(b64);
    setLiveTalking(true); clearTimeout(endTimer);
    endTimer = setTimeout(() => setLiveTalking(false), Math.max(0, lead) * 1000 + 150);
  }

  function clearTimers() { clearInterval(frameTimer); clearInterval(checkTimer); clearInterval(snapTimer); clearTimeout(evT); clearTimeout(busyT); frameTimer = checkTimer = snapTimer = evT = busyT = 0; }

  // --- Évènements → CHECK (image fraîche, puis texte) ---
  const isIssue = (e) => e.kind === 'fault' || e.kind === 'lost' || e.kind === 'back' || (e.kind === 'rep' && ((e.info?.faults || []).length || (e.info?.romPct != null && e.info.romPct < 85)));
  function event(kind, info) {
    if (stopped || isPaused()) return;
    events.push({ kind, info, t: Date.now() });
    events = events.slice(-4);
    schedule();
  }
  // Envoie si les conditions sont réunies, sinon reprogramme (écart minimal, pas de tours qui se chevauchent)
  function schedule() {
    if (stopped || !(ready || snapSend)) return;
    clearTimeout(evT); evT = 0;
    const now = Date.now(); events = events.filter((e) => now - e.t < 10000);
    if (!events.length) return;
    const since = now - lastCheck, issue = events.some(isIssue);
    // les répétitions réussies ne déclenchent qu'un encouragement espacé (8 s) ; les problèmes, dès que possible
    let wait = Math.max(MIN_GAP - since, issue ? 0 : FALLBACK_MS - since, 0);
    if (busy) wait = Math.max(wait, 400);
    if (wait > 0) { evT = setTimeout(schedule, wait); return; }
    fire(true);
  }
  function fire(fromEvent) {
    if (stopped || isPaused()) return false;
    if (snapSend) return snapSend(fromEvent);
    if (!ws || ws.readyState !== 1 || !ready || busy) return false;
    const evs = events; events = [];
    lastCheck = Date.now(); busy = true; text = ''; drop = false; sent++;
    lastHadIssue = evs.some(isIssue) || (state().faults || []).length > 0;
    const d = frame(); // image fraîche juste avant le texte : le modèle regarde l'état présent
    if (d) ws.send(JSON.stringify({ realtimeInput: { video: { data: d, mimeType: 'image/jpeg' } } }));
    ws.send(JSON.stringify({ realtimeInput: { text: checkText(evs) } }));
    clearTimeout(busyT); busyT = setTimeout(() => { busy = false; }, 9000); // garde-fou si turnComplete n'arrive pas
    return true;
  }
  // Repli lent : seulement si rien ne se passe ET que la dernière remarque était une correction (suivi) ; la première vérification à ~2,5 s
  function fallbackTick() {
    if (stopped || isPaused() || busy) return;
    const since = Date.now() - lastCheck;
    if (!sent) { if (since >= FIRST_MS) fire(false); return; }
    if (since >= FALLBACK_MS && lastHadIssue && !events.length) fire(false);
  }

  function remark(t) {
    const prev = remarks.slice(-2), dup = prev.some((r) => similar(r, t));
    remarks.push(t); if (remarks.length > 2) remarks.shift();
    return !dup;
  }

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
        generationConfig: { responseModalities: ['AUDIO'], ...(noExtras ? {} : { speechConfig: { languageCode: aiLangInfo().voice[0] } }) },
        systemInstruction: { parts: [{ text: systemPrompt(o.context) }] },
        outputAudioTranscription: {},
        // vidéo + audio : sans compression, une session est coupée après ~2 min ; fenêtre glissante + reprise de session
        ...(noExtras ? {} : { contextWindowCompression: { slidingWindow: {} }, sessionResumption: resumeHandle ? { handle: resumeHandle } : {} }),
      },
    }));
    sock.onmessage = async (e) => {
      if (stopped || sock !== ws) return; // série finie / en pause : plus rien n'est dit
      let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()); } catch (_) { return; }
      if (stopped) return;
      if (m.setupComplete) {
        ready = true; setupFails = 0; busy = false; if (!sent) lastCheck = Date.now(); o.onState('live');
        clearInterval(frameTimer); clearInterval(checkTimer);
        frameTimer = setInterval(() => {
          if (stopped || sock.readyState !== 1 || isPaused()) return;
          const d = frame(); if (d) sock.send(JSON.stringify({ realtimeInput: { video: { data: d, mimeType: 'image/jpeg' } } }));
        }, FRAME_MS);
        checkTimer = setInterval(fallbackTick, 500);
        schedule();
        return;
      }
      const sc = m.serverContent;
      if (sc) {
        if (sc.interrupted) { stopAll({ fade: true, kind: 'live' }); setLiveTalking(false); busy = false; text = ''; }
        for (const p of sc.modelTurn?.parts || []) {
          if (p.inlineData?.data) play(p.inlineData.data);
          else if (p.text && !sc.outputTranscription) { text += p.text; if (!drop) o.onText(text.trim(), false); }
        }
        if (sc.outputTranscription?.text) { text += sc.outputTranscription.text; if (!drop) o.onText(text.trim(), false); }
        if (sc.turnComplete) {
          busy = false; clearTimeout(busyT); endLiveTurn();
          const t = text.trim(); text = '';
          if (t) { if (remark(t)) o.onText(t, true); else o.onText('', 'drop'); } // même idée que la remarque précédente : on ne la ré-affiche pas
          schedule();
        }
      }
      if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) resumeHandle = m.sessionResumptionUpdate.newHandle;
      if (m.goAway) { try { sock.close(); } catch (_) {} } // la session va se fermer : on rouvre tout de suite (reprise avec la poignée)
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      clearTimers();
      if (stopped || sock !== ws) return;
      busy = false;
      if (!ready) {
        // refus de la configuration : on réessaie une fois sans les options de session (anciens modèles), puis modèle suivant
        if (resumeHandle) { resumeHandle = null; return connect(); }
        if (!setupFails++ && !noExtras) { noExtras = true; return connect(); }
        setupFails = 0; noExtras = false; modelIdx++; return connect();
      }
      if (++reconnects <= 8) setTimeout(connect, 300); // fin de session (durée maximale) → nouvelle session, avec reprise si possible
      else snapshotMode();
    };
  }

  // --- Repli : une image analysée par Gemini sur les mêmes évènements, réponse lue par la voix de l'appareil ---
  function snapshotMode() {
    if (stopped) return;
    clearTimers(); o.onState('snapshot');
    const sys = `${systemPrompt(o.context)}\nYou receive one still frame at a time instead of video.`;
    let pending = false;
    snapSend = (fromEvent) => {
      if (stopped || pending || isPaused()) return false;
      const d = frame(448); if (!d) return false;
      pending = true;
      const evs = events; events = []; lastCheck = Date.now(); sent++;
      lastHadIssue = evs.some(isIssue) || (state().faults || []).length > 0;
      geminiDirect(key, sys, [{ text: checkText(evs) }, { inline_data: { mime_type: 'image/jpeg', data: d } }], 60).then((r) => {
        if (stopped || isPaused() || !r) return;
        const show = remark(r);
        if (show) { o.onText(r, true); setLiveTalking(true); speakAI(r, { interrupt: true, force: true }); setTimeout(() => setLiveTalking(false), 2500); }
      }).catch((e) => { console.warn('live snapshot', e); if (!stopped) o.onState('error'); }).finally(() => { pending = false; });
      return true;
    };
    const tick = () => {
      if (stopped || pending || isPaused()) return;
      if (!sent || (Date.now() - lastCheck >= FALLBACK_MS && lastHadIssue && !events.length)) snapSend(false);
    };
    setTimeout(tick, FIRST_MS);
    snapTimer = setInterval(tick, 1000);
    schedule();
  }

  connect();
  return {
    event,
    stop() {
      stopped = true; clearTimers(); clearTimeout(endTimer); events = [];
      try { if (ws) { ws.onmessage = null; ws.close(); } } catch (_) {}
      stopAll({ fade: true, kind: 'live' }); // coupe en fondu la voix déjà programmée : la suite (comptage, bilan) ne se chevauche pas
      setLiveTalking(false);
      o.onState('off');
    },
  };
}
