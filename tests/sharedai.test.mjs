// Accès IA partagé par le clinicien : priorité des clés, date de fin / retrait, plafond quotidien, routage par relais (fetch simulé),
// jeton du relais, et la clé ne figure jamais dans l'URL quand le programme est enregistré par code.
import assert from 'node:assert/strict';
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem(k, v) { mem[k] = String(v); }, removeItem(k) { delete mem[k]; } };
globalThis.window = globalThis;
globalThis.document = { documentElement: {}, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr', onLine: true }, configurable: true });
const events = []; globalThis.dispatchEvent = (e) => { events.push(e.type); return true; };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

const S = await import('../www/js/store.js');
const C = await import('../www/js/coach.js');
const setS = (o) => { mem['mobilis.settings'] = JSON.stringify(o); };
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plus = (n) => day(new Date(Date.now() + n * 86400000));
let n = 0; const ok = (m) => { n++; };

// --- priorité de la clé : personnelle > partagée ; relais = clé factice ; rien = vide
setS({}); assert.equal(S.aiKey(), '');
setS({ sharedAI: { key: 'SHARED', from: 'Dr X' } }); assert.equal(S.aiKey(), 'SHARED');
setS({ geminiKey: 'MINE', sharedAI: { key: 'SHARED' } }); assert.equal(S.aiKey(), 'MINE'); assert.equal(S.aiProxy(), null);
setS({ sharedAI: { proxy: 'https://r.example/api/coach', token: 'tok' } }); assert.equal(S.aiKey(), S.PROXY_KEY); assert.deepEqual(S.aiProxy(), { url: 'https://r.example/api/coach', token: 'tok' });
setS({ geminiKey: 'MINE', sharedAI: { proxy: 'https://r.example/api/coach' } }); assert.equal(S.aiKey(), 'MINE'); assert.equal(S.aiProxy(), null);
ok('priorité');

// --- date de fin : valable jusqu'à la fin de la journée indiquée, ignoré après
setS({ sharedAI: { key: 'K', until: plus(0) } }); assert.equal(S.aiKey(), 'K');
setS({ sharedAI: { key: 'K', until: plus(-1) } }); assert.equal(S.aiKey(), ''); assert.equal(S.sharedAIInfo(), null);
setS({ sharedAI: { key: 'K', until: plus(30), from: 'Dr X' } }); assert.equal(S.sharedAIInfo().from, 'Dr X');
ok('until');

// --- application / retrait à partir du programme
setS({});
let sh = S.applySharedAI({ code: 'ABC234', clinician: 'Dr Y', ai: { mode: 'key', key: ' KK ', cap: 12, until: '2099-01-01' } });
assert.deepEqual([sh.key, sh.from, sh.cap, sh.until, sh.rxCode], ['KK', 'Dr Y', 12, '2099-01-01', 'ABC234']); assert.equal(S.aiKey(), 'KK');
sh = S.applySharedAI({ code: 'ABC234', clinician: 'Dr Y', ai: { mode: 'proxy', proxy: 'https://r.example/api/coach', token: 't' } });
assert.equal(sh.key, undefined); assert.equal(S.aiKey(), S.PROXY_KEY);
assert.equal(S.applySharedAI({ code: 'ABC234', ai: { mode: 'proxy', proxy: 'http://insecure.example' } }), null); assert.equal(S.aiKey(), ''); // relais non https refusé
S.applySharedAI({ clinician: 'Dr Y', ai: { mode: 'key', key: 'KK' } }); assert.equal(S.aiKey(), 'KK');
assert.equal(S.applySharedAI({ clinician: 'Dr Y', ai: null }), null); assert.equal(S.aiKey(), ''); assert.equal(S.sharedAIInfo(), null); // le clinicien retire l'accès
ok('apply/revoke');

// --- plafond quotidien → clé vide (coach local), message une seule fois, remis à zéro le lendemain
mem['mobilis.aiUse'] = undefined; delete mem['mobilis.aiUse']; events.length = 0;
setS({ sharedAI: { key: 'K', cap: 3 } });
S.aiCount(); S.aiCount(); assert.equal(S.aiKey(), 'K'); assert.equal(S.aiUsed(), 2);
S.aiCount(); assert.equal(S.aiKey(), ''); assert.equal(S.aiCapReached(), true); assert.deepEqual(events, ['mobilis:aicap']);
S.aiCount(); assert.equal(events.length, 1);
assert.equal(C.aiCapped(), true);
mem['mobilis.aiUse'] = JSON.stringify({ day: plus(-1), n: 99 }); assert.equal(S.aiKey(), 'K'); assert.equal(S.aiUsed(), 0);
setS({ geminiKey: 'MINE', sharedAI: { key: 'K', cap: 1 } }); mem['mobilis.aiUse'] = JSON.stringify({ day: plus(0), n: 50 }); assert.equal(S.aiKey(), 'MINE'); // la clé personnelle n'est jamais plafonnée
const before = S.aiUsed(); S.aiCount(); assert.equal(S.aiUsed(), before);
// repli : sans clé ni relais, le commentaire de série est local et signale le plafond
setS({ sharedAI: { key: 'K', cap: 1 } }); mem['mobilis.aiUse'] = JSON.stringify({ day: plus(0), n: 1 });
globalThis.fetch = async () => { throw new Error('ne doit pas être appelé'); };
const cc = await C.coachComment({ kind: 'set', mode: 'reps', reps: 5, full: 5, faults: {} });
assert.equal(cc.source, 'local'); assert.equal(cc.capped, true);
ok('plafond');

// --- routage : relais (texte) ; clé directe ; la clé n'est jamais envoyée au relais
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Bravo' }] } }] }), text: async () => '' }; };
setS({ sharedAI: { proxy: 'https://r.example/api/coach', token: 'tok123', cap: 0 } }); delete mem['mobilis.aiUse'];
let out = await C.gemini({ sys: 'S', parts: [{ text: 'hi' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAA' } }] });
assert.equal(out, 'Bravo');
assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://r.example/api/coach');
assert.equal(calls[0].init.headers['x-mobilis-token'], 'tok123');
let b = JSON.parse(calls[0].init.body);
assert.equal(b.kind, 'gen'); assert.match(b.model, /^gemini-/); assert.equal(b.contents[0].parts[1].inline_data.data, 'AAA'); assert.equal(b.systemInstruction.parts[0].text, 'S');
assert.ok(!JSON.stringify(calls[0]).includes('googleapis'));
assert.equal(S.aiUsed(), 1);
// voix (TTS) par le même relais
calls.length = 0;
await C.genFetch('gemini-3.8-flash-lite-tts', { contents: [{ parts: [{ text: 'x' }] }], generationConfig: { responseModalities: ['AUDIO'] } }, S.aiKey());
assert.equal(calls[0].url, 'https://r.example/api/coach'); assert.equal(JSON.parse(calls[0].init.body).model, 'gemini-3.8-flash-lite-tts');
// clé personnelle : direct chez Google, aucun relais
calls.length = 0; setS({ geminiKey: 'MINE', sharedAI: { proxy: 'https://r.example/api/coach', token: 'tok123' } });
await C.gemini({ sys: 'S', parts: [{ text: 'hi' }] });
assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//); assert.equal(calls[0].init.headers['x-goog-api-key'], 'MINE'); assert.equal(calls[0].init.headers['x-mobilis-token'], undefined);
// accès par clé partagée : direct chez Google avec cette clé
calls.length = 0; setS({ sharedAI: { key: 'SHAREDK' } });
await C.gemini({ sys: 'S', parts: [{ text: 'hi' }] });
assert.equal(calls[0].init.headers['x-goog-api-key'], 'SHAREDK');
// Live (WebSocket) : jamais en mode relais
const L = await import('../www/js/live.js');
setS({ sharedAI: { proxy: 'https://r.example/api/coach' } }); assert.equal(L.liveAvailable(), true); assert.equal(L.liveSocketAvailable(), false);
setS({ sharedAI: { key: 'K' } }); globalThis.WebSocket = class {}; assert.equal(L.liveSocketAvailable(), true);
ok('routage');

// --- programme : la clé n'est dans l'URL que sans compte (et le clinicien en est averti)
const rxAI = { mode: 'key', key: 'SECRETKEY123', cap: 20, junk: 'x' };
assert.deepEqual(S.cleanAI({ mode: 'key', key: ' k ', cap: 5000, junk: 1 }), { mode: 'key', cap: 1000, until: '', key: 'k' });
assert.equal(S.cleanAI({ mode: 'proxy', proxy: '' }), null); assert.equal(S.cleanAI(null), null);
assert.deepEqual(S.rxShareInfo({ ai: rxAI }, true), { channel: 'code', keyInLink: false });
assert.deepEqual(S.rxShareInfo({ ai: rxAI }, false), { channel: 'link', keyInLink: true });
assert.equal(S.rxShareInfo({ ai: { mode: 'proxy', proxy: 'https://r', token: 't' } }, false).keyInLink, false);
assert.ok(!S.rxLink('ABC234', 'fr').includes('SECRETKEY123')); // lien par code : seulement le code
S.signInLocal(() => {});
const base = { clinician: 'Dr X', region: 'shoulder', pathology: 'neck_mech', phase: 1, ids: ['chin_tuck'], levels: {}, lang: 'fr' };
let res = await S.saveRx({ ...base, ai: rxAI });
assert.equal(res.keyInLink, true); assert.equal(res.code, null);
const packed = decodeURIComponent(escape(atob(res.link.split('#/rx/')[1].split('/')[0].slice(1).replace(/-/g, '+').replace(/_/g, '/'))));
assert.equal(JSON.parse(packed).ai.key, 'SECRETKEY123'); assert.equal(JSON.parse(packed).ai.junk, undefined);
res = await S.saveRx({ ...base, ai: { mode: 'proxy', proxy: 'https://r.example/api/coach', token: 'tt' } });
assert.equal(res.keyInLink, false); assert.ok(!res.link.includes('SECRETKEY123'));
const rt = await S.getRx(res.link.split('#/rx/')[1].split('/')[0]); assert.equal(rt.ai.proxy, 'https://r.example/api/coach');
res = await S.saveRx({ ...base, ai: null }); assert.equal(res.data.ai, null);
ok('rx');

// --- relais (Cloudflare) : jeton, modèles, plafond de taille, transfert
const R = await import('../functions/api/coach.js');
const up = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { up.push({ url: String(url), init }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }); };
const post = (body, token, env) => R.onRequestPost({ request: new Request('https://x/api/coach', { method: 'POST', headers: token ? { 'x-mobilis-token': token } : {}, body: JSON.stringify(body) }), env });
const gen = { kind: 'gen', model: 'gemini-flash-lite-latest', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 99999 } };
let r = await post(gen, '', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'a,b' }); assert.equal(r.status, 401);
r = await post(gen, 'zz', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'a,b' }); assert.equal(r.status, 401);
r = await post(gen, 'b', { GEMINI_API_KEY: 'G' }); assert.equal(r.status, 401); // aucun jeton configuré : relais fermé
r = await post(gen, 'b', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'a,b' }); assert.equal(r.status, 200);
assert.equal(up[0].init.headers['x-goog-api-key'], 'G'); assert.equal(JSON.parse(up[0].init.body).generationConfig.maxOutputTokens, 1500); assert.match(up[0].url, /models\/gemini-flash-lite-latest:generateContent$/);
assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*'); assert.match(r.headers.get('Access-Control-Allow-Headers'), /x-mobilis-token/);
r = await post({ ...gen, model: 'gemini-live-x' }, 'b', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'b' }); assert.equal(r.status, 400);
r = await post({ ...gen, model: '../../evil' }, 'b', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'b' }); assert.equal(r.status, 400);
for (const m of ['gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts', 'gemini-flash-latest', 'gemini-3.5-flash-lite']) { r = await post({ ...gen, model: m }, 'b', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'b' }); assert.equal(r.status, 200, m); }
r = await post({ ...gen, contents: [{ parts: [{ text: 'x'.repeat(4600000) }] }] }, 'b', { GEMINI_API_KEY: 'G', PATIENT_TOKENS: 'b' }); assert.equal(r.status, 413);
// jetons signés avec date d'expiration (mode TOKEN_SECRET) : même formule que docs/ai-proxy.md
const { createHmac } = await import('node:crypto');
const sig = (e, s) => createHmac('sha256', s).update(e).digest('base64url').slice(0, 32);
const env = { TOKEN_SECRET: 'sec' };
assert.equal(await R.tokenOk(`2099-01-01.${sig('2099-01-01', 'sec')}`, env), true);
assert.equal(await R.tokenOk(`2099-01-01.${sig('2099-01-01', 'other')}`, env), false);
assert.equal(await R.tokenOk(`2001-01-01.${sig('2001-01-01', 'sec')}`, env), false); // expiré
assert.equal(await R.tokenOk('2099-01-01.', env), false);
globalThis.fetch = realFetch;
ok('relais');

console.log(`sharedai OK (${n} blocs)`);
