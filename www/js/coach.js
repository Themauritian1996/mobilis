// Coach vocal : consignes instantanées (voix de l'appareil) + commentaires de fin de série par Gemini.
import { CONFIG, coachUrl } from './config.js';
import { CUES, getLang, tr } from './i18n.js';
import { settings } from './store.js';

// ---------- Voix de l'appareil (latence quasi nulle, idéal pour corriger en direct) ----------
let voices = [];
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch (_) { voices = []; } };
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice(lang) {
  const pref = lang === 'fr' ? ['fr-CA', 'fr-FR', 'fr'] : ['en-CA', 'en-US', 'en-GB', 'en'];
  for (const p of pref) { const v = voices.find((x) => x.lang && x.lang.replace('_', '-').startsWith(p)); if (v) return v; }
  return null;
}

export function speak(text, { interrupt = false } = {}) {
  if (settings().voice === 'off' || !('speechSynthesis' in window) || !text) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const lang = getLang();
    u.lang = lang === 'fr' ? 'fr-CA' : 'en-CA';
    const v = pickVoice(lang); if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (_) {}
}

// Anti-répétition des consignes
const lastSaid = {}; let lastAny = 0;
export function cue(key) {
  const now = Date.now();
  if (now - lastAny < 2200 || now - (lastSaid[key] || 0) < 5000) return false;
  lastAny = now; lastSaid[key] = now;
  speak(tr(CUES[key]));
  return true;
}
export const cueText = (key) => tr(CUES[key]);

const NUM = {
  fr: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt'],
};
export function countAloud(n) {
  if (!settings().countAloud) return;
  speak(getLang() === 'fr' ? (NUM.fr[n] || String(n)) : String(n));
}

// ---------- Gemini ----------
function buildPrompt(d) {
  const fr = getLang() === 'fr';
  const sys = fr
    ? 'Tu es un coach de réadaptation musculo-squelettique, supervisé par un physiatre. Tu parles au patient, en français québécois neutre, en 2 phrases maximum (40 mots), ton chaleureux et concret. Donne UNE correction prioritaire et UN encouragement. Ne pose jamais de diagnostic, ne change pas le programme. Si la douleur dépasse la limite, recommande d’alléger ou d’arrêter et d’en parler à son clinicien.'
    : 'You are a musculoskeletal rehab coach supervised by a physiatrist. Speak to the patient in plain English, 2 sentences max (40 words), warm and concrete. Give ONE priority correction and ONE encouragement. Never diagnose or change the program. If pain exceeds the limit, advise easing off or stopping and talking to their clinician.';
  return { sys, user: JSON.stringify(d) };
}

async function callGeminiDirect(key, d, imageB64) {
  const { sys, user } = buildPrompt(d);
  const parts = [{ text: user }];
  if (imageB64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageB64 } });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 160 } }),
  });
  if (!r.ok) throw new Error('gemini ' + r.status);
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

async function callProxy(d, imageB64) {
  if (!CONFIG.coachEndpoint) throw new Error('no endpoint');
  const r = await fetch(coachUrl(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: getLang(), data: d, image: imageB64 || null, kind: d.kind || 'set' }),
  });
  if (!r.ok) throw new Error('proxy ' + r.status);
  const j = await r.json();
  return (j.text || '').trim();
}

// Repli local (hors ligne / sans clé) : phrase construite à partir des métriques
function localComment(d) {
  const fr = getLang() === 'fr';
  if (d.kind === 'week') return localWeek(d);
  const top = Object.entries(d.faults || {}).sort((a, b) => b[1] - a[1])[0];
  const fix = top ? tr(CUES[top[0]]) + '.' : (fr ? 'Belle exécution, garde ce contrôle.' : 'Clean technique, keep that control.');
  let lead;
  if (d.mode === 'hold') lead = fr ? `Tu as tenu ${d.holdSec} secondes.` : `You held for ${d.holdSec} seconds.`;
  else lead = fr ? `${d.full} répétitions complètes sur ${d.reps}.` : `${d.full} of ${d.reps} reps were full range.`;
  return `${lead} ${fix}`;
}
function localWeek(d) {
  const fr = getLang() === 'fr';
  const trend = d.painDelta < -0.5 ? (fr ? 'ta douleur diminue' : 'your pain is easing') : d.painDelta > 0.5 ? (fr ? 'ta douleur a augmenté un peu' : 'your pain went up a little') : (fr ? 'ta douleur est stable' : 'your pain is stable');
  return fr
    ? `Semaine ${d.week} : ${d.sessions} séance(s) sur ${d.planned}, ${trend}. ${d.sessions >= d.planned ? 'Bravo pour la régularité !' : 'Vise une séance de plus la semaine prochaine.'}`
    : `Week ${d.week}: ${d.sessions} of ${d.planned} sessions, ${trend}. ${d.sessions >= d.planned ? 'Great consistency!' : 'Aim for one more session next week.'}`;
}

export async function coachComment(d, imageB64) {
  const key = settings().geminiKey;
  try {
    if (!navigator.onLine) throw new Error('offline');
    const txt = key ? await callGeminiDirect(key, d, imageB64) : await callProxy(d, imageB64);
    if (txt) return { text: txt, source: 'gemini' };
  } catch (_) { /* repli local */ }
  return { text: localComment(d), source: 'local' };
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
      r = await fetch(coachUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'tts', text, lang: getLang() }) });
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
