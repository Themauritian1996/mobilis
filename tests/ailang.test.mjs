// Langue du coach IA indépendante de la langue de l'app : app en français, coach en anglais (et « auto » = comme l'app).
const store = { 'mobilis.lang': 'fr', 'mobilis.aiLang': 'en', 'mobilis.settings': JSON.stringify({ geminiKey: 'k', voice: 'local' }) };
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem(k, v) { store[k] = v; } };
globalThis.window = globalThis;
globalThis.document = { documentElement: {}, addEventListener() {}, createElement: () => ({ getContext: () => ({}), width: 0, height: 0 }) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr', onLine: true }, configurable: true });
const spoken = [];
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.speechSynthesis = { getVoices: () => [], cancel() {}, speak: (u) => spoken.push(u), onvoiceschanged: null };
const calls = [];
globalThis.fetch = async (url, o) => { calls.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }) }; };
const sent = [];
globalThis.WebSocket = class { constructor() { setTimeout(() => this.onopen && this.onopen(), 0); } send(m) { sent.push(JSON.parse(m)); } close() {} };

const I = await import('../www/js/i18n.js');
const C = await import('../www/js/coach.js');
const L = await import('../www/js/live.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('ÉCHEC :', m); } };

ok(I.getLang() === 'fr' && I.getAiLang() === 'en' && I.aiLangInfo().label === 'English', 'app fr, coach en');
await C.coachReply({ exercise: 'x', comment: 'ça va' });
const sys = calls.at(-1).systemInstruction.parts[0].text;
ok(/Always answer in English/.test(sys) && !/French/.test(sys), 'prompt de réponse en anglais : ' + sys.slice(-80));
C.speak('bonjour'); C.speakAI('hello');
ok(spoken[0].lang === 'fr-CA' && spoken[1].lang === 'en-CA', `voix : app fr-CA / coach en-CA, reçu ${spoken.map((u) => u.lang)}`);
C.speak('hola', { lang: 'es' }); ok(spoken[2].lang === 'es-MX', 'option {lang}');
I.setAiLang('auto'); ok(I.getAiLang() === 'fr' && /French/.test(C.langLine()) && /"tu"/.test(C.langLine()), 'auto → langue de l\'app, tutoiement');
I.setAiLang('zh'); ok(/Simplified Chinese/.test(C.langLine()) && /informal/.test(C.langLine()), 'chinois : registre familier');
I.setAiLang('xx'); ok(I.getAiLang() === 'fr', 'valeur invalide → auto');
// coach en direct : prompt + languageCode
I.setAiLang('es');
const ctx = { exercise: 'Squat', condition: 'c', target: 't', painLimit: 4, steps: ['a'], keys: ['b'], plane: 'side' };
const h = L.startLiveCoach({ video: { videoWidth: 0 }, mirror: false, context: ctx, getState: () => ({}), onText() {}, onState() {} });
await new Promise((r) => setTimeout(r, 20));
const setup = sent.find((m) => m.setup)?.setup;
ok(setup && /Spanish/.test(setup.systemInstruction.parts[0].text) && /tú/.test(setup.systemInstruction.parts[0].text), 'live : prompt en espagnol');
ok(setup?.generationConfig.speechConfig?.languageCode === 'es-MX', 'live : speechConfig.languageCode');
h.stop();
if (fails) process.exit(1);
console.log('Langue du coach IA : OK');
process.exit(0);
