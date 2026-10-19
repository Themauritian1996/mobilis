// Coach vocal : consignes instantanées (voix de l'appareil) + commentaires de fin de série par Gemini.
import { CONFIG, coachUrl } from './config.js';
import { CUES, getLang, tr, t, langInfo } from './i18n.js';
import { settings } from './store.js';

// ---------- Voix de l'appareil (latence quasi nulle, idéal pour corriger en direct) ----------
let voices = [];
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch (_) { voices = []; } };
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice() {
  const pref = langInfo().voice;
  for (const p of pref) { const v = voices.find((x) => x.lang && x.lang.replace('_', '-').startsWith(p)); if (v) return v; }
  return null;
}

export function speak(text, { interrupt = false } = {}) {
  if (settings().voice === 'off' || !('speechSynthesis' in window) || !text) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = langInfo().voice[0];
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (_) {}
}

// Anti-répétition des consignes
const lastSaid = {}; let lastAny = 0;
// Pendant que le coach IA en direct parle, les consignes locales se taisent (sauf le comptage).
let liveTalking = false;
export const setLiveTalking = (v) => { liveTalking = v; if (v) { try { speechSynthesis.cancel(); } catch (_) {} } };
export function cue(key) {
  const now = Date.now();
  if (liveTalking) return false;
  if (now - lastAny < 2200 || now - (lastSaid[key] || 0) < 5000) return false;
  lastAny = now; lastSaid[key] = now;
  speak(tr(CUES[key]));
  return true;
}
export const cueText = (key) => (CUES[key] ? tr(CUES[key]) : t('cue_' + key));

const NUM = {
  fr: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt'],
};
export function countAloud(n) {
  if (!settings().countAloud) return;
  speak(NUM[getLang()]?.[n] || String(n));
}

// ---------- Gemini ----------
// Consignes en anglais (meilleure fiabilité), réponse demandée dans la langue du patient.
const SYS = {
  set: 'You are a musculoskeletal rehab coach supervised by a physiatrist. Speak directly to the patient, 2 sentences max (40 words), warm and concrete, no jargon. From the JSON set data (full reps, camera-detected faults, quality 0-1, filmed plane), give ONE priority correction and ONE encouragement. If an image is provided, use the visible posture. Never diagnose or change the program. If pain exceeds the limit, advise easing off or stopping and talking to their clinician.',
  week: 'You are an MSK rehab coach supervised by a physiatrist. Write a weekly review for the patient in max 3 sentences from the JSON data (sessions done/planned, mean pain, movement quality, pain change, patient comments). Highlight one real gain and one priority for next week, no diagnosis, no jargon.',
  reply: 'You are an MSK rehab coach supervised by a physiatrist. The patient just finished an exercise and left a comment (JSON: exercise, condition, pain 0-10, pain limit, difficulty 1-5, comment). Answer the comment in max 2 short sentences (35 words): acknowledge it, give one safe practical tip. Never diagnose or change the program. If the comment suggests worsening pain, numbness, weakness, swelling or anything unusual, tell them to ease off and contact their clinician. No jargon.',
};
const langLine = () => `Always answer in ${langInfo().label}.`;
export const aiAvailable = () => !!(settings().geminiKey || CONFIG.coachEndpoint);

// Appel Gemini direct (clé personnelle). Rapide par défaut : modèle « lite », sans réflexion, limite de temps stricte.
// Si le modèle rapide ou l'option de réflexion est refusé, on réessaie avec le modèle standard / sans l'option (mémorisé).
const flags = { noThinkCfg: false, fastBroken: false };
export async function gemini({ key = settings().geminiKey, sys, parts, maxTokens = 180, temperature = 0.5, schema = null, timeout = 8000, fast = true }) {
  const model = fast && !flags.fastBroken ? CONFIG.geminiFastModel || CONFIG.geminiModel : CONFIG.geminiModel;
  const gen = { temperature, maxOutputTokens: maxTokens };
  if (schema) { gen.responseMimeType = 'application/json'; gen.responseSchema = schema; }
  if (!flags.noThinkCfg) gen.thinkingConfig = { thinkingBudget: 0 };
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: ctl.signal,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts }], generationConfig: gen }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if (r.status === 400 && !flags.noThinkCfg && /thinking/i.test(body)) { flags.noThinkCfg = true; return gemini({ key, sys, parts, maxTokens, temperature, schema, timeout, fast }); }
      if ((r.status === 404 || r.status === 400) && model !== CONFIG.geminiModel) { flags.fastBroken = true; return gemini({ key, sys, parts, maxTokens, temperature, schema, timeout, fast: false }); }
      throw new Error('gemini ' + r.status);
    }
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  } finally { clearTimeout(tm); }
}
export const geminiDirect = (key, sys, parts, maxTokens = 180) => gemini({ key, sys, parts, maxTokens });

async function callProxy(body) {
  if (!CONFIG.coachEndpoint) throw new Error('no endpoint');
  const r = await fetch(coachUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: getLang(), langLabel: langInfo().label, ...body }) });
  if (!r.ok) throw new Error('proxy ' + r.status);
  const j = await r.json();
  return (j.text || '').trim();
}

async function ask(kind, d, imageB64) {
  const key = settings().geminiKey;
  if (!navigator.onLine) throw new Error('offline');
  if (key) {
    const parts = [{ text: JSON.stringify(d) }];
    if (imageB64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageB64 } });
    return gemini({ key, sys: `${SYS[kind]} ${langLine()}`, parts, maxTokens: 160, timeout: kind === 'week' ? 15000 : 8000 });
  }
  return callProxy({ data: d, image: imageB64 || null, kind });
}

// Repli local (hors ligne / sans clé) : phrase construite à partir des métriques
export function localComment(d) {
  if (d.kind === 'week') return localWeek(d);
  if (d.mode === 'hold' ? !d.holdSec : !d.reps) return t('lcNone');
  const top = Object.entries(d.faults || {}).sort((a, b) => b[1] - a[1])[0];
  const fix = top ? cueText(top[0]) + '.' : t('lcClean');
  const lead = d.mode === 'hold' ? t('lcHold', { n: d.holdSec }) : t('lcReps', { full: d.full, reps: d.reps });
  return `${lead} ${fix}`;
}
function localWeek(d) {
  const trend = d.painDelta < -0.5 ? t('lwDown') : d.painDelta > 0.5 ? t('lwUp') : t('lwSame');
  return `${t('lwLine', { w: d.week, s: d.sessions, p: d.planned, trend })} ${d.sessions >= d.planned ? t('lwGood') : t('lwMore')}`;
}

export async function coachComment(d, imageB64) {
  try {
    const txt = await ask(d.kind === 'week' ? 'week' : 'set', d, imageB64);
    if (txt) return { text: txt, source: 'gemini' };
  } catch (_) { /* repli local */ }
  return { text: localComment(d), source: 'local' };
}

// Réponse du coach au commentaire écrit / dicté du patient
export async function coachReply(d) {
  try {
    const txt = await ask('reply', d);
    if (txt) return { text: txt, source: 'gemini' };
  } catch (_) {}
  return { text: t('lcReplyLocal'), source: 'local' };
}

// ---------- Dictée du commentaire ----------
// 1) Reconnaissance vocale du navigateur (Chrome) ; 2) sinon enregistrement + transcription Gemini ; 3) sinon null.
export function dictationMode() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (native) return 'native'; // APK : reconnaissance vocale d'Android (gratuite, sans clé)
  if (SR) return 'browser';
  if (aiAvailable() && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) return 'gemini';
  return null;
}
async function nativeDictation({ onText, onState }) {
  let SpeechRecognition;
  try { ({ SpeechRecognition } = await import('../vendor/capacitor.js')); } catch (_) { return null; }
  try {
    const { available } = await SpeechRecognition.available();
    if (!available) return null;
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') { onState('denied'); return 'done'; }
  } catch (_) { return null; }
  let last = '', ended = false;
  const finish = async () => {
    if (ended) return; ended = true;
    try { await SpeechRecognition.removeAllListeners(); } catch (_) {}
    onText(last.trim(), true); onState('idle');
  };
  await SpeechRecognition.removeAllListeners().catch(() => {});
  await SpeechRecognition.addListener('partialResults', (d) => { if (d.matches && d.matches[0]) { last = d.matches[0]; onText(last, false); } });
  await SpeechRecognition.addListener('listeningState', (d) => { if (d.status === 'stopped') setTimeout(finish, 250); });
  try { speechSynthesis.cancel(); } catch (_) {}
  SpeechRecognition.start({ language: langInfo().voice[0], maxResults: 1, partialResults: true, popup: false })
    .then((r) => { if (r && r.matches && r.matches[0]) last = r.matches[0]; })
    .catch(() => { if (!last) { ended = true; onState('error'); } });
  onState('listening');
  return { stop: () => { SpeechRecognition.stop().catch(() => {}); setTimeout(finish, 600); } };
}
export async function startDictation({ onText, onState }) {
  let mode = dictationMode();
  if (mode === 'native') {
    const r = await nativeDictation({ onText, onState });
    if (r === 'done') return null;
    if (r) return r;
    mode = aiAvailable() && window.MediaRecorder && navigator.mediaDevices?.getUserMedia ? 'gemini' : null;
  }
  if (mode === 'browser') {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = langInfo().voice[0]; rec.continuous = true; rec.interimResults = true;
    let finalTxt = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTxt += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      onText((finalTxt + interim).trim(), false);
    };
    rec.onerror = (e) => onState(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'error');
    rec.onend = () => { onText(finalTxt.trim(), true); onState('idle'); };
    try { speechSynthesis.cancel(); } catch (_) {}
    rec.start(); onState('listening');
    return { stop: () => rec.stop() };
  }
  if (mode === 'gemini') {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (_) { onState('denied'); return null; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((x) => MediaRecorder.isTypeSupported?.(x)) || '';
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((tk) => tk.stop());
      onState('transcribing');
      try {
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        const b64 = await blobB64(blob);
        onText(await transcribe(b64, (mr.mimeType || 'audio/webm').split(';')[0]), true);
        onState('idle');
      } catch (e) { console.warn(e); onState('error'); }
    };
    const timer = setTimeout(() => mr.state === 'recording' && mr.stop(), 60000);
    mr.start(); onState('listening');
    return { stop: () => { clearTimeout(timer); if (mr.state === 'recording') mr.stop(); } };
  }
  onState('unavailable');
  return null;
}
const blobB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
async function transcribe(b64, mime) {
  const sys = `Transcribe the patient's spoken comment verbatim. The patient speaks ${langInfo().label} (they may mix languages). Output only the transcription, no quotes, no notes.`;
  const key = settings().geminiKey;
  if (key) return gemini({ key, sys, parts: [{ inline_data: { mime_type: mime, data: b64 } }], maxTokens: 400, timeout: 20000 });
  return callProxy({ kind: 'transcribe', audio: b64, mime });
}

// ---------- Voix Gemini (TTS) pour les commentaires de fin de série ----------
let audioCtx = null;
export async function speakRich(text) {
  const s = settings();
  if (s.voice === 'off') return;
  if (s.voice !== 'gemini') return speak(text, { interrupt: true });
  try {
    const voiceName = getLang() === 'fr' ? 'Aoede' : 'Kore';
    const body = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } };
    let r;
    if (s.geminiKey) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiTtsModel}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey }, body: JSON.stringify(body),
      });
    } else {
      if (!CONFIG.coachEndpoint) throw new Error('no endpoint');
      r = await fetch(coachUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'tts', text, lang: getLang(), langLabel: langInfo().label }) });
    }
    if (!r.ok) throw new Error('tts');
    const j = await r.json();
    const b64 = j.audio || j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!b64) throw new Error('no audio');
    const bin = atob(b64); const n = bin.length / 2; const f = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; f[i] = v / 32768; }
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const buf = audioCtx.createBuffer(1, n, 24000); buf.copyToChannel(f, 0);
    const src = audioCtx.createBufferSource(); src.buffer = buf; src.connect(audioCtx.destination); src.start();
  } catch (_) {
    speak(text, { interrupt: true });
  }
}

// Capture d'une image réduite (pour le commentaire visuel facultatif)
export function grabFrame(video, mirror) {
  try {
    const w = 384, h = Math.round((video.videoHeight / video.videoWidth) * w) || 288;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(video, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.7).split(',')[1];
  } catch (_) { return null; }
}
