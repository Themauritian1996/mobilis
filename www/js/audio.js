// Sortie audio PCM partagée (voix Gemini en direct + voix Gemini de fin de série).
// Un seul AudioContext, un gain maître, un fondu de 10 ms à chaque début/fin d'énoncé (pas de « clic »),
// un tampon anti-saccades pour le flux en direct, et stopAll() qui coupe tout ce qui est programmé (jamais deux voix à la fois).
export const FADE_IN = 0.01, FADE_OUT = 0.01, STOP_FADE = 0.06;
export const TURN_LEAD = 0.15;   // avance au début d'un tour de parole (tampon anti-saccades)
export const UNDERRUN_LEAD = 0.06; // avance quand le flux a manqué de données en cours de tour
const RATE = 24000;

let ctx = null, master = null;
const active = new Set(); // { src, g, kind }
let liveNext = 0, liveOpen = false, liveTail = null; // flux en direct : fin programmée, tour ouvert, dernier segment { g, at }

export function getCtx() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
  }
  return ctx;
}
// À appeler dans un geste de l'utilisateur (clic) : débloque le son sur mobile
export function primeAudio() {
  try { const c = getCtx(); if (c && c.state === 'suspended') c.resume(); } catch (_) {}
}

// PCM 16 bits little-endian (base64) → Float32 ; longueur impaire : l'octet en trop est ignoré
export function pcmToFloat(b64) {
  const bin = atob(b64), n = bin.length >> 1, f = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; f[i] = v / 32768; }
  return f;
}

function makeSource(f, kind, t0, fadeIn, fadeOut) {
  const c = ctx, buf = c.createBuffer(1, f.length, RATE);
  if (buf.copyToChannel) buf.copyToChannel(f, 0); else buf.getChannelData(0).set(f);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); src.connect(g); g.connect(master);
  const dur = f.length / RATE, end = t0 + dur;
  if (fadeIn) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + Math.min(FADE_IN, dur)); } else g.gain.setValueAtTime(1, t0);
  let tail = null;
  if (fadeOut) { const at = Math.max(t0, end - FADE_OUT); g.gain.setValueAtTime(1, at); g.gain.linearRampToValueAtTime(0, end); tail = { g, at }; }
  const rec = { src, g, kind };
  active.add(rec); src.onended = () => active.delete(rec);
  src.start(t0);
  return { rec, end, tail, dur };
}

/** Flux en direct : ajoute un morceau PCM. Retourne la durée restante à jouer (s), ou 0. */
export function pushLive(b64) {
  const c = getCtx(); if (!c) return 0;
  const f = pcmToFloat(b64); if (!f.length) return Math.max(0, liveNext - c.currentTime);
  const now = c.currentTime;
  let t0, fadeIn = false;
  if (!liveOpen) { // nouveau tour : on démarre un peu en avance, à la suite de ce qui joue encore
    t0 = Math.max(liveNext, now + TURN_LEAD); fadeIn = true; liveOpen = true;
  } else if (liveNext - now > FADE_OUT + 0.002) { // contigu : on annule le fondu de sortie du segment précédent
    t0 = liveNext;
    if (liveTail) { liveTail.g.gain.cancelScheduledValues(liveTail.at); liveTail.g.gain.setValueAtTime(1, liveTail.at); }
  } else { // le flux a manqué de données : on repart avec une petite avance (jamais de chevauchement)
    t0 = Math.max(liveNext, now + UNDERRUN_LEAD); fadeIn = true;
  }
  const s = makeSource(f, 'live', t0, fadeIn, true);
  liveNext = s.end; liveTail = s.tail;
  return liveNext - now;
}
/** Fin d'un tour de parole : le prochain morceau reprendra avec un fondu et une avance. */
export function endLiveTurn() { liveOpen = false; }
export const liveLead = () => (ctx && liveNext > ctx.currentTime ? liveNext - ctx.currentTime : 0);
export const isPlaying = (kind) => [...active].some((r) => !kind || r.kind === kind);

/** Coupe tout ce qui est programmé ou en cours (option kind : 'live' | 'rich'). Retourne le nombre de sources coupées. */
export function stopAll({ fade = true, kind = null } = {}) {
  let n = 0;
  const c = ctx, now = c ? c.currentTime : 0;
  for (const r of [...active]) {
    if (kind && r.kind !== kind) continue;
    n++;
    try {
      if (fade) {
        const p = r.g.gain;
        p.cancelScheduledValues(now); p.setValueAtTime(p.value ?? 1, now); p.linearRampToValueAtTime(0, now + STOP_FADE);
        r.src.stop(now + STOP_FADE + 0.005);
      } else r.src.stop(now);
    } catch (_) {}
    active.delete(r);
  }
  if (!kind || kind === 'live') { liveNext = 0; liveOpen = false; liveTail = null; }
  return n;
}

/** Joue un énoncé complet (voix Gemini de fin de série) : coupe tout le reste avant, fondu d'entrée et de sortie. */
export function playRich(b64) {
  const c = getCtx(); if (!c) return false;
  const f = pcmToFloat(b64); if (!f.length) return false;
  const had = stopAll({ fade: true });
  const t0 = c.currentTime + (had ? STOP_FADE + 0.02 : 0.03);
  makeSource(f, 'rich', t0, true, true);
  return true;
}
