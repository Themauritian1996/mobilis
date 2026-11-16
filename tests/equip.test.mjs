// Matériel de remplacement : classement par charge, avis local, avis IA (fetch simulé), alternatives conservées.
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.window = globalThis; globalThis.document = { documentElement: {}, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr' } });
const { EXERCISES, EQUIP } = await import('../www/js/data/exercises.js');
const E = await import('../www/js/equip.js');
const S = await import('../www/js/data/substitutes.js');

// Données : chaque matériel a au moins un remplacement ; kg/fits/FR+EN valides
for (const id of Object.keys(EQUIP)) assert.ok(S.subsOf(id).length >= 1, 'remplacement manquant : ' + id);
for (const s of S.SUBSTITUTES) {
  assert.ok(EQUIP[s.equip], s.id); assert.ok(s.name.fr && s.name.en && s.grip.fr && s.grip.en && s.safety.fr && s.safety.en, s.id);
  assert.ok(Array.isArray(s.fits) && s.fits.length, s.id);
}
// Chaque exercice avec matériel remplaçable donne au moins un remplacement
for (const [id, ex] of Object.entries(EXERCISES)) if ((ex.equip || []).length) assert.ok(E.substitutesFor(id, 3, null).length, 'aucun remplacement : ' + id);

// Charge visée : monte avec le niveau
assert.ok(S.targetKg('elbow_curl', 1) < S.targetKg('elbow_curl', 5));
assert.equal(S.targetKg('chin_tuck', 3), null);

// Classement : curl niveau 5 (3 kg) -> sac à dos ou 2 L devant le téléphone ; niveau 1 (0,5 kg) -> 500 ml devant 2 L
const top = (id, lv) => E.substitutesFor(id, lv, ['mat']).map((x) => x.sub.id);
const hi = top('elbow_curl', 5), lo = top('elbow_curl', 1);
assert.ok(['backpack', 'bottle2', 'detergent'].includes(hi[0]), hi.join());
assert.ok(['bottle500', 'can', 'phone', 'sock', 'book'].includes(lo[0]), lo.join());
assert.ok(hi.indexOf('phone') > hi.indexOf('bottle2'));
assert.ok(lo.indexOf('bottle2') > lo.indexOf('bottle500'));
// Sac à dos réglable : kg utilisé = cible
const bp = E.substitutesFor('elbow_curl', 3, ['mat']).find((x) => x.sub.id === 'backpack');
assert.equal(bp.useKg, 1.5); assert.equal(bp.match, 'ok');
// Étiquettes de charge
const l1 = E.substitutesFor('ecc_wrist_ext', 1, ['mat']);
assert.equal(l1.find((x) => x.sub.id === 'bottle2'), undefined, '2 L jamais proposé pour le poignet');
assert.equal(E.substitutesFor('elbow_curl', 1, ['mat']).find((x) => x.sub.id === 'bottle2').match, 'heavy');
// Marteau : levier
assert.ok(E.substitutesFor('pron_sup', 3, ['mat']).every((x) => x.sub.fits.includes('lever')));
// Sans matériel manquant : rien ; sans liste : tout le matériel de l'exercice
assert.equal(E.substitutesFor('elbow_curl', 3, ['dumbbell', 'table']).length, 0);
assert.ok(E.substitutesFor('elbow_curl', 3, null).length > 0);
// Exercice avec élastique : serviette
assert.ok(top('er_band', 3).includes('band_towel'));
// Genou assis avec poids de cheville
assert.ok(top('knee_ext_sit', 3).some((x) => x.startsWith('ank_') || x.startsWith('bottle') || x === 'backpack'));

// Règle locale
const V = (ex, lv, txt) => E.localVerdict(ex, lv, txt);
assert.equal(V('ecc_wrist_ext', 2, 'bouteille 500 ml').verdict, 'ok');
assert.equal(V('ecc_wrist_ext', 1, 'sac de farine 2 kg').verdict, 'no');
assert.ok(['caution', 'no'].includes(V('ecc_wrist_flex', 1, 'sac de farine 2 kg').verdict));
assert.equal(V('elbow_curl', 3, 'une bouteille de 1 litre').verdict, 'ok');
assert.equal(V('elbow_curl', 3, 'a 2 lb dumbbell').verdict, 'ok');
assert.equal(V('elbow_curl', 3, 'un verre en cristal').verdict, 'no');
assert.equal(V('elbow_curl', 3, 'couteau').verdict, 'no');
assert.equal(V('elbow_curl', 3, 'brique').verdict, 'caution');
assert.equal(V('elbow_curl', 3, 'cellulaire').verdict, 'no');
assert.equal(V('pron_sup', 3, 'une poêle').verdict, 'caution');
assert.equal(V('pron_sup', 3, 'louche').verdict, 'caution');
assert.equal(V('pron_sup', 3, 'bouteille 500 ml').verdict, 'ok');
assert.equal(V('pron_sup', 3, 'poêle en fonte').verdict, 'no');
assert.equal(V('er_band', 3, 'une serviette').verdict, 'ok');
assert.equal(V('er_band', 3, 'une balle de tennis').verdict, 'caution');
assert.equal(V('step_up', 3, 'la première marche').verdict, 'ok');
assert.equal(V('elbow_curl', 3, 'machin truc').verdict, 'caution');
assert.equal(V('elbow_curl', 3, '   '), null);
assert.equal(V('elbow_curl', 3, 'machin 1,5 kg').kgEstimate, 1.5);
assert.ok(V('elbow_curl', 3, 'bouteille').reason.length > 10);
assert.equal(E.parseKg('750 ml'), 0.75); assert.equal(E.parseKg('500 g'), 0.5); assert.equal(E.parseKg('rien'), null);

// Anciennes fonctions toujours là
assert.deepEqual(E.missing('elbow_curl', ['mat']), ['dumbbell']);
assert.deepEqual(E.missing('elbow_curl', null), []);
assert.ok(E.alternatives('elbow_curl', ['mat']).every((x) => E.missing(x, ['mat']).length === 0));
assert.ok(E.EQUIP_IDS.includes('hammer')); assert.ok(E.HOUSE.includes('chair')); assert.equal(E.haveList({}), null);

// Avis IA (fetch simulé) puis repli local si l'IA échoue
const U = await import('../www/js/equipui.js');
let body = null, mode = 'ok';
globalThis.fetch = async (url, o) => {
  body = JSON.parse(o.body);
  if (mode === 'fail') return { ok: false, status: 500, text: async () => 'boom' };
  const j = mode === 'bad' ? '{"verdict":"super","reason":""}' : '{"verdict":"caution","kgEstimate":2,"reason":"Un peu lourd pour ton poignet. Tiens-le bien."}';
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: j }] }, finishReason: 'STOP' }] }) };
};
let r = await U.judgeObject('ecc_wrist_ext', 1, 'sac de farine 2 kg', { ai: true });
assert.deepEqual([r.verdict, r.kgEstimate, r.source], ['caution', 2, 'ai']);
assert.match(body.contents[0].parts[0].text, /sac de farine/); assert.match(body.contents[0].parts[0].text, /0\.3 kg/);
assert.equal(body.generationConfig.responseSchema.properties.verdict.enum.length, 3);
assert.match(body.systemInstruction.parts[0].text, /Always answer in/);
r = await U.judgeObject('elbow_curl', 3, 'couteau', { ai: true }); assert.equal(r.verdict, 'no');
mode = 'bad'; r = await U.judgeObject('ecc_wrist_ext', 2, 'bouteille 500 ml', { ai: true }); assert.equal(r.source, 'local');
mode = 'fail'; r = await U.judgeObject('ecc_wrist_ext', 2, 'bouteille 500 ml', { ai: true }); assert.deepEqual([r.verdict, r.source], ['ok', 'local']);
r = await U.judgeObject('ecc_wrist_ext', 2, 'bouteille 500 ml', { ai: false }); assert.equal(r.source, 'local');

// HTML
const prof = { equipment: ['mat'], equipChoice: { elbow_curl: { name: 'Bouteille 1 L', kg: 1 } }, baseLevel: 3 };
const html = U.equipHelpHtml('elbow_curl', 3, prof);
assert.match(html, /data-eqhelp="elbow_curl"/); assert.equal((html.match(/data-eq-pick/g) || []).length, 3); assert.match(html, /Ton objet/);
assert.equal(U.equipHelpHtml('chin_tuck', 3, prof), '');
assert.match(U.equipChipHtml('elbow_curl', prof), /Bouteille 1 L/);
assert.match(U.equipChipHtml('scaption', { equipment: ['mat'], baseLevel: 3 }), /Remplacement/);
assert.equal(U.equipChipHtml('scaption', { equipment: ['dumbbell'] }), '');
console.log('Matériel de remplacement : OK');
