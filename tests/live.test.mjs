// Coach IA en direct : CHECK déclenchés par évènements (écart minimal, pas de chevauchement), état de suivi et dernières remarques dans le texte,
// rien après stop() ni en pause, audio PCM (longueur impaire, tampon contigu, stopAll), anti-répétition. Sans réseau : WebSocket et AudioContext simulés.
let T = 1000, seq = 0; const timers = new Map();
Date.now = () => T;
globalThis.setTimeout = (f, ms = 0) => { const id = ++seq; timers.set(id, { f, at: T + ms, every: 0 }); return id; };
globalThis.setInterval = (f, ms = 0) => { const id = ++seq; timers.set(id, { f, at: T + ms, every: ms }); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
const advance = (ms) => {
  const end = T + ms;
  for (;;) {
    let best = null, bid = 0;
    for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best.at)) { best = t; bid = id; }
    if (!best) break;
    T = Math.max(T, best.at);
    if (best.every) best.at += best.every; else timers.delete(bid);
    best.f();
  }
  T = end;
};

const store = { 'mobilis.settings': JSON.stringify({ geminiKey: 'k', voice: 'gemini', imageConsent: true }) };
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem(k, v) { store[k] = v; } };
globalThis.window = globalThis;
globalThis.document = { documentElement: {}, addEventListener() {}, createElement: () => ({ getContext: () => ({}), width: 0, height: 0 }) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr' }, configurable: true });

// --- AudioContext simulé ---
const sources = [];
class Param { constructor() { this.value = 1; this.calls = []; } setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; } linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]); } cancelScheduledValues(t) { this.calls.push(['cancel', t]); } }
class Node { connect() {} }
globalThis.AudioContext = class {
  constructor() { this.state = 'suspended'; this.destination = new Node(); }
  get currentTime() { return (T - 1000) / 1000; }
  resume() { this.state = 'running'; }
  createGain() { const n = new Node(); n.gain = new Param(); return n; }
  createBuffer(c, n, r) { const d = new Float32Array(n); return { duration: n / r, length: n, getChannelData: () => d, copyToChannel: (f) => d.set(f) }; }
  createBufferSource() { const s = new Node(); s.stops = []; s.start = (t) => { s.startAt = t; }; s.stop = (t) => { s.stops.push(t); }; sources.push(s); return s; }
};

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ÉCHEC :', m); } };

const audio = await import('../www/js/audio.js');
const { startLiveCoach, similar, MIN_GAP, FALLBACK_MS } = await import('../www/js/live.js');

const pcm = (n) => Buffer.from(new Uint8Array(n).fill(7)).toString('base64');

// ---------- Audio ----------
{
  audio.primeAudio();
  const odd = pcm(4801); // 4801 octets : l'octet en trop est ignoré (2400 échantillons = 0,1 s)
  ok(audio.pcmToFloat(odd).length === 2400, 'PCM de longueur impaire : floor(len/2) échantillons');
  ok(audio.pcmToFloat(pcm(1)).length === 0, 'un seul octet → aucun échantillon');
  const lead = audio.pushLive(odd);
  ok(Math.abs(lead - (audio.TURN_LEAD + 0.1)) < 1e-6, `1er morceau : avance ${audio.TURN_LEAD}s + durée (obtenu ${lead})`);
  const s0 = sources[0];
  ok(Math.abs(s0.startAt - audio.TURN_LEAD) < 1e-6, 'le tour démarre ~150 ms en avance');
  audio.pushLive(pcm(4800));
  const s1 = sources[1];
  ok(Math.abs(s1.startAt - (s0.startAt + 0.1)) < 1e-9, 'morceaux contigus, sans chevauchement');
  ok(s0.gain === undefined, 'source sans gain direct');
  advance(500); // t = 0,5 s : tout est fini ou presque → sous-alimentation
  audio.pushLive(pcm(4800));
  const s2 = sources[2], nowS = (T - 1000) / 1000;
  ok(s2.startAt >= nowS + audio.UNDERRUN_LEAD - 1e-9, 'sous-alimentation : on repart avec une petite avance');
  ok(s2.startAt >= s1.startAt + 0.1, 'jamais de chevauchement après sous-alimentation');
  audio.pushLive(pcm(48000)); audio.pushLive(pcm(48000));
  const n = audio.stopAll({ fade: true });
  const started = sources.filter((s) => s.startAt !== undefined);
  ok(n >= 3 && started.every((s) => s.stops.length > 0), 'stopAll arrête toutes les sources programmées');
  ok(started.slice(-2).every((s) => s.stops[0] > nowS), 'arrêt en fondu (après maintenant)');
  ok(!audio.isPlaying(), 'plus rien en lecture après stopAll');
  ok(audio.liveLead() === 0, 'plus de file en direct');
  // voix riche : coupe le flux en direct avant de démarrer
  audio.pushLive(pcm(48000));
  const before = sources.length; audio.playRich(pcm(4800));
  ok(sources[before - 1].stops.length > 0, 'playRich coupe d\'abord la voix en direct');
  ok(sources[before].startAt >= (T - 1000) / 1000 + audio.STOP_FADE, 'playRich démarre après le fondu de sortie');
  audio.stopAll({ fade: false });
}

// ---------- Anti-répétition ----------
ok(similar('Bravo, ton pouce est bien ouvert', 'bravo ton pouce est bien ouvert !'), 'même phrase = similaire');
ok(similar('Continue de former un rond', 'Continue de former un beau rond'), 'recouvrement > 70 %');
ok(!similar('Ouvre bien ton pouce', 'Garde le poignet stable'), 'phrases différentes');

// ---------- Séance en direct ----------
const sockets = [];
globalThis.WebSocket = class { constructor() { this.readyState = 1; this.sent = []; this.closed = false; sockets.push(this); setTimeout(() => this.onopen && this.onopen(), 0); }
  send(d) { this.sent.push({ t: T, m: JSON.parse(d) }); } close() { this.closed = true; this.readyState = 3; } };
const msg = (ws, m) => ws.onmessage && ws.onmessage({ data: JSON.stringify(m) });
const checks = (ws) => ws.sent.filter((x) => x.m.realtimeInput?.text);
const frames = (ws) => ws.sent.filter((x) => x.m.realtimeInput?.video);

const st = { reps: 2, target: 10, faults: [], tracked: true, subject: 'hand', paused: false, phase: 'moving', lastRomPct: 92, measures: '' };
const texts = [];
const coach = startLiveCoach({
  video: {}, mirror: true, context: { exercise: 'Thumb opposition', condition: 'Test', target: 10, painLimit: 4, steps: ['Touch each fingertip'], keys: ['Round O'], ex: null },
  getState: () => st, frame: () => 'JPEGDATA', onText: (t, f) => texts.push([t, f]), onState: () => {},
});
advance(1);
const ws = sockets[0];
ok(!!ws && JSON.parse(JSON.stringify(ws.sent[0].m)).setup, 'setup envoyé à l\'ouverture');
ok(ws.sent[0].m.setup.systemInstruction.parts[0].text.includes('"tu"'), 'prompt : tutoiement en français');
msg(ws, { setupComplete: {} });
advance(1000);
ok(frames(ws).length >= 1 && checks(ws).length === 0, 'images chaque seconde, pas de CHECK avant ~2,5 s');
advance(1700);
ok(checks(ws).length === 1, 'premier CHECK vers 2,5 s');
let c1 = checks(ws)[0];
ok(/Hand visible and tracked by the app: yes/.test(c1.m.realtimeInput.text), 'CHECK : « Hand visible and tracked by the app: yes »');
ok(/Never talk about visibility/.test(c1.m.realtimeInput.text), 'CHECK : interdit de parler de visibilité si suivi');
const iF = ws.sent.indexOf(frames(ws).filter((f) => f.t === c1.t).pop());
ok(iF >= 0 && iF < ws.sent.indexOf(c1), 'image fraîche envoyée juste avant le CHECK');
// réponse (audio impair + transcription) puis fin de tour
msg(ws, { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm(4801) } }] }, outputTranscription: { text: 'Ouvre bien ton pouce.' } } });
msg(ws, { serverContent: { turnComplete: true } });
ok(texts.some((x) => x[1] === true && x[0] === 'Ouvre bien ton pouce.'), 'remarque finale transmise');
// évènement rapide : écart minimal de 3 s
const tc1 = c1.t; const n0 = checks(ws).length;
advance(500); coach.event('rep', { n: 3, romPct: 60, faults: ['Too shallow'] });
advance(1000);
ok(checks(ws).length === n0, 'écart minimal : pas de CHECK < 3 s après le précédent');
advance(2000);
ok(checks(ws).length === n0 + 1, 'CHECK envoyé une fois l\'écart écoulé');
const c2 = checks(ws)[n0];
ok(c2.t - tc1 >= MIN_GAP, `écart ≥ ${MIN_GAP} ms (obtenu ${c2.t - tc1})`);
ok(c2.m.realtimeInput.text.includes('Rep 3 just completed') && c2.m.realtimeInput.text.includes('60%') && c2.m.realtimeInput.text.includes('Too shallow'), 'CHECK contient l\'évènement (amplitude, défauts)');
ok(c2.m.realtimeInput.text.includes('"Ouvre bien ton pouce."') && /do NOT repeat/.test(c2.m.realtimeInput.text), 'CHECK contient la dernière remarque, à ne pas répéter');
// pas de tours qui se chevauchent : tour en cours (pas de turnComplete)
const n1 = checks(ws).length;
advance(100); coach.event('fault', { fault: 'Wrist bends' }); advance(5000);
ok(checks(ws).length === n1, 'pas de nouveau CHECK tant que le tour précédent n\'est pas terminé');
// transcription presque identique → pas ré-affichée
msg(ws, { serverContent: { outputTranscription: { text: 'Ouvre bien ton pouce !' } } });
msg(ws, { serverContent: { turnComplete: true } });
ok(texts[texts.length - 1][1] === 'drop', 'remarque quasi identique : non ré-affichée');
advance(400);
ok(checks(ws).length === n1 + 1, 'évènement en attente envoyé après la fin du tour');
ok(checks(ws)[n1].m.realtimeInput.text.includes('Wrist bends'), 'CHECK contient le défaut mesuré');
// main perdue : tracked = NO
msg(ws, { serverContent: { outputTranscription: { text: 'Garde le poignet droit' } } }); msg(ws, { serverContent: { turnComplete: true } });
st.tracked = false; advance(MIN_GAP + 100); coach.event('lost', { subject: 'hand', sec: 1.5 }); advance(MIN_GAP + 100);
const lost = checks(ws).slice(-1)[0].m.realtimeInput.text;
ok(/tracked by the app: NO/.test(lost) && /lost the hand/.test(lost), 'main perdue : « tracked: NO » + évènement');
msg(ws, { serverContent: { outputTranscription: { text: 'Replace ta main devant la caméra' } } }); msg(ws, { serverContent: { turnComplete: true } });
st.tracked = true;
// encouragement : pas de repli lent si la dernière remarque n'était pas une correction
{
  coach.event('rep', { n: 5, romPct: 98, faults: [] }); advance(FALLBACK_MS + 500);
  msg(ws, { serverContent: { outputTranscription: { text: 'Beau mouvement fluide' } } }); msg(ws, { serverContent: { turnComplete: true } });
  const nn = checks(ws).length; advance(40000);
  ok(checks(ws).length === nn, 'après un encouragement, pas de CHECK de repli sans nouvel évènement');
}
// pause : ni image ni CHECK
{
  st.paused = true; const nf = frames(ws).length, nc = checks(ws).length;
  coach.event('rep', { n: 6, romPct: 40, faults: ['x'] }); advance(30000);
  ok(frames(ws).length === nf && checks(ws).length === nc, 'en pause : aucune image ni CHECK');
  st.paused = false;
}
// stop : plus rien, réponse en attente jamais jouée
{
  coach.event('rep', { n: 7, romPct: 40, faults: ['y'] });
  const nSrc = sources.length, nf = frames(ws).length, nc = checks(ws).length;
  coach.stop();
  ok(ws.closed, 'stop ferme la connexion');
  advance(30000);
  ok(frames(ws).length === nf && checks(ws).length === nc, 'après stop : aucune image ni CHECK');
  ok(ws.onmessage === null, 'après stop : les messages entrants sont ignorés');
  ok(sources.length === nSrc && !audio.isPlaying('live'), 'après stop : aucune voix en direct');
  coach.event('rep', { n: 8, faults: [] }); advance(10000);
  ok(checks(ws).length === nc, 'évènement après stop ignoré');
}
// stop() coupe la voix déjà programmée
{
  const c = startLiveCoach({ video: {}, context: { exercise: 'x', condition: 'y', target: 1, painLimit: 4, steps: [], keys: [] }, getState: () => st, frame: () => 'J', onText() {}, onState() {} });
  advance(1); const w = sockets[sockets.length - 1]; msg(w, { setupComplete: {} });
  msg(w, { serverContent: { modelTurn: { parts: [{ inlineData: { data: pcm(96000) } }] } } });
  ok(audio.isPlaying('live'), 'voix en direct programmée');
  c.stop();
  ok(!audio.isPlaying('live') && sources.filter((s) => s.startAt !== undefined).slice(-1)[0].stops.length > 0, 'stop() arrête la voix programmée (fondu)');
}
if (fails) { console.log(fails, 'échec(s)'); process.exit(1); }
console.log('Coach en direct : OK');
