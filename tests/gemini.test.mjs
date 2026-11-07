// Appel Gemini : repli de modèle (modèle retiré) et de réglage de réflexion (option refusée), JSON entouré de texte.
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.window = globalThis; globalThis.document = { documentElement: {}, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr' } });
const calls = [];
globalThis.fetch = async (url, o) => {
  const model = url.match(/models\/([^:]+):/)[1], body = JSON.parse(o.body), th = body.generationConfig.thinkingConfig;
  calls.push(`${model} ${JSON.stringify(th || null)}`);
  if (model === 'gemini-flash-lite-latest') return { ok: false, status: 404, text: async () => 'models/gemini-flash-lite-latest is not found' };
  if (th && th.thinkingLevel) return { ok: false, status: 400, text: async () => 'Thinking level is not supported for this model.' };
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Voici : ```json\n{"cue":"none","confidence":0.8}\n```' }] }, finishReason: 'STOP' }] }) };
};
const { gemini, parseJSON } = await import('../www/js/coach.js');
const out = parseJSON(await gemini({ key: 'k', sys: 's', parts: [{ text: 'x' }], schema: { type: 'OBJECT' } }));
console.log(calls.join('\n'));
if (out.cue !== 'none') { console.log('ÉCHEC'); process.exit(1); }
// 2e appel : les replis sont mémorisés (un seul appel)
calls.length = 0; await gemini({ key: 'k', sys: 's', parts: [{ text: 'x' }] });
if (calls.length !== 1) { console.log('ÉCHEC mémorisation', calls); process.exit(1); }
console.log('Gemini : replis OK');
