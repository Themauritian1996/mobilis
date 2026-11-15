import assert from 'node:assert/strict';
import { t } from '../www/js/i18n.js';
import * as P from '../www/js/program.js';
import { PROTOCOLS, protocolById, protocolPhases, phaseExerciseIds, exerciseEntry, DISCLAIMER } from '../www/js/data/protocols.js';
import { PATHOLOGIES, REGIONS, LAY_NEW, EXTRA_QUESTIONS } from '../www/js/data/pathologies.js';
import { EXERCISES } from '../www/js/data/exercises.js';
import { LAY, QUESTIONS, scoreAnswers, matchDiagnosis } from '../www/js/data/triage.js';
import { homeCardProtocol, summaryPart, rxExtrasProtocol, rxSectionProtocol, protocolViewHtml, confirmedBefore } from '../www/js/protocols-ui.js';

const at = (k, h = 12) => new Date(k + `T${String(h).padStart(2, '0')}:00`).getTime();
const addDays = (k, n) => P.todayKey(at(k) + n * 86400000);
const bi = (o) => o && typeof o.fr === 'string' && o.fr.trim() && typeof o.en === 'string' && o.en.trim();
const S0 = '2026-01-05'; // date de chirurgie des tests
const prof = (o = {}) => ({ pathology: null, baseLevel: 2, days: [1, 3, 5], ...o });
const withP = (id, variant, extra = {}) => prof({ protocol: { id, variant, surgeryDate: S0, ...extra } });
const day = (n) => at(addDays(S0, n));

// ---- 1. Contenu des protocoles
const WANT = ['acl', 'cuff_repair', 'tka', 'tha', 'bankart', 'achilles_repair', 'meniscus', 'lumbar_surgery', 'distal_radius', 'carpal_release'];
for (const id of WANT) assert.ok(protocolById(id), 'protocole manquant ' + id);
assert.ok(bi(DISCLAIMER));
const ROM = new Set(['sh_flex', 'sh_abd', 'sh_er', 'elbow_flex', 'elbow_ext', 'wrist_flex', 'wrist_ext', 'hip_flex', 'knee_flex', 'knee_ext', 'ankle_df', 'cerv_rot', 'lumb_flex']);
const REG = new Set(REGIONS.map((r) => r.id));
for (const p of PROTOCOLS) {
  assert.ok(bi(p.name) && bi(p.surgery), p.id + ' : nom / chirurgie');
  assert.ok(REG.has(p.region), p.id + ' : région');
  assert.ok(p.redFlags.length >= 5 && p.redFlags.every(bi), p.id + ' : drapeaux rouges');
  assert.ok(p.phases.length >= 3, p.id + ' : au moins 3 phases');
  for (const v of p.variants || [{ id: null }]) {
    const ph = protocolPhases(p, v.id);
    assert.equal(ph[0].weeks[0], 0, `${p.id}/${v.id} : commence à 0`);
    ph.forEach((x, i) => {
      assert.ok(x.id && x.goals.length && x.goals.every(bi), `${p.id}/${v.id}/${x.id} : objectifs`);
      assert.ok(x.precautions.length && x.precautions.every(bi), `${x.id} : précautions`);
      assert.ok(x.progressionCriteria.length && x.progressionCriteria.every(bi), `${x.id} : critères`);
      assert.ok(x.exercises.length >= 2, `${x.id} : exercices`);
      for (const e of x.exercises) assert.ok(EXERCISES[exerciseEntry(e).id], `${x.id} : exercice inconnu ${exerciseEntry(e).id}`);
      for (const r of x.romTargets) assert.ok(ROM.has(r.test) && Number.isFinite(r.deg), `${x.id} : test ${r.test}`);
      if (i > 0) assert.equal(x.weeks[0], ph[i - 1].weeks[1], `${p.id}/${v.id}/${x.id} : phases contiguës`);
      if (i < ph.length - 1) assert.ok(x.weeks[1] > x.weeks[0], `${x.id} : durée positive`); else assert.equal(x.weeks[1], null, `${x.id} : dernière phase ouverte`);
    });
  }
}
// Les variantes changent bien le contenu
const thaP = protocolPhases(protocolById('tha'), 'posterior'), thaA = protocolPhases(protocolById('tha'), 'anterior');
assert.ok(thaP[0].precautions.some((x) => /90/.test(x.fr)));
assert.ok(!thaA[0].precautions.some((x) => /90°/.test(x.fr)));
assert.notDeepEqual(thaP[0].precautions, thaA[0].precautions);
const crS = protocolPhases(protocolById('cuff_repair'), 'small_med'), crL = protocolPhases(protocolById('cuff_repair'), 'large');
assert.equal(crS[2].weeks[0], 12); assert.equal(crL[2].weeks[0], 16);
const aclB = protocolPhases(protocolById('acl'), 'btb'), aclH = protocolPhases(protocolById('acl'), 'hamstring');
assert.ok(aclH[0].precautions.some((x) => /ischio|hamstring/i.test(x.fr + x.en)) && !aclB[0].precautions.some((x) => /Hamstring graft/.test(x.en)));
assert.equal(protocolPhases(protocolById('meniscus'), 'partial')[1].weeks[0], 1);
assert.equal(protocolPhases(protocolById('meniscus'), 'repair')[1].weeks[0], 6);
// Variante inconnue ou absente : première variante
assert.deepEqual(protocolPhases(protocolById('tha'), 'xx').map((x) => x.weeks), thaP.map((x) => x.weeks));
assert.deepEqual(protocolPhases(protocolById('tka')).map((x) => x.id), ['tka1', 'tka2', 'tka3', 'tka4']);

// ---- 2. Phase selon la semaine (bornes : [de, à[ )
const phaseAt = (pr, n) => P.protocolPhase({ protocol: { ...pr, confirmed: Object.fromEntries(protocolPhases(protocolById(pr.id), pr.variant).map((x) => [x.id, true])) } }, day(n))?.id;
const tka = { id: 'tka', surgeryDate: S0 };
assert.equal(phaseAt(tka, 0), 'tka1');
assert.equal(phaseAt(tka, 13), 'tka1'); // dernier jour de la semaine 2 écoulée
assert.equal(phaseAt(tka, 14), 'tka2'); // 2 semaines écoulées
assert.equal(phaseAt(tka, 41), 'tka2');
assert.equal(phaseAt(tka, 42), 'tka3');
assert.equal(phaseAt(tka, 83), 'tka3');
assert.equal(phaseAt(tka, 84), 'tka4');
assert.equal(phaseAt(tka, 900), 'tka4');
let st = P.protocolStatus(withP('tka'), day(0));
assert.equal(st.week, 1); assert.equal(st.phaseIndex, 0); assert.equal(st.nextPhaseInWeeks, 2); assert.equal(st.daysSince, 0);
st = P.protocolStatus(withP('tka'), day(10));
assert.equal(st.week, 2); assert.equal(st.nextPhaseInWeeks, 1); assert.equal(st.precautions.length, st.phase.precautions.length);
assert.ok(st.criteria.length >= 3);
st = P.protocolStatus(withP('tka'), day(7));
assert.equal(st.week, 2);
// avant la chirurgie : première phase, marqué préopératoire
st = P.protocolStatus(withP('tka'), day(-3));
assert.equal(st.preop, true); assert.equal(st.daysToSurgery, 3); assert.equal(st.phaseIndex, 0);
// Variantes : coiffe grande déchirure → phase 3 à 16 semaines
assert.equal(phaseAt({ id: 'cuff_repair', variant: 'small_med', surgeryDate: S0 }, 12 * 7), 'cr3');
assert.equal(phaseAt({ id: 'cuff_repair', variant: 'large', surgeryDate: S0 }, 12 * 7), 'cr2');
assert.equal(phaseAt({ id: 'cuff_repair', variant: 'large', surgeryDate: S0 }, 16 * 7), 'cr3');
// Pas de protocole / invalide
assert.equal(P.protocolPhase(prof(), day(0)), null);
assert.equal(P.protocolStatus(prof({ protocol: { id: 'nope', surgeryDate: S0 } }), day(0)), null);
assert.equal(P.protocolStatus(prof({ protocol: { id: 'tka', surgeryDate: 'abc' } }), day(0)), null);

// ---- 3. Critères non confirmés : la phase est maintenue et signalée
st = P.protocolStatus(withP('tka'), day(30));
assert.equal(st.phaseIndex, 0); assert.equal(st.blocked, true); assert.equal(st.nextPhaseInWeeks, 0); assert.equal(st.timeIndex, 1);
assert.equal(P.protocolPhase(withP('tka'), day(30)).blocked, true);
st = P.protocolStatus(withP('tka', undefined, { confirmed: { tka1: 1 } }), day(30));
assert.equal(st.phaseIndex, 1); assert.equal(st.blocked, false);
// Confirmer tôt n'avance pas avant la fin du temps
st = P.protocolStatus(withP('tka', undefined, { confirmed: { tka1: 1, tka2: 1, tka3: 1 } }), day(5));
assert.equal(st.phaseIndex, 0); assert.equal(st.blocked, false);
// Confirmer seulement la phase 2 ne suffit pas si la 1 est bloquée
st = P.protocolStatus(withP('tka', undefined, { confirmed: { tka2: 1 } }), day(50));
assert.equal(st.phaseIndex, 0); assert.equal(st.blocked, true);
// Dernière phase : pas de suivante
st = P.protocolStatus(withP('tka', undefined, { confirmed: { tka1: 1, tka2: 1, tka3: 1 } }), day(400));
assert.equal(st.last, true); assert.equal(st.nextPhaseInWeeks, null); assert.equal(st.nextPhase, null);

// ---- 4. Programme du jour
const noProto = prof({ pathology: 'neck_mech', phase: 1 });
const beforeIds = P.todaysProgram(noProto).map((x) => x.id);
assert.deepEqual(beforeIds, ['chin_tuck', 'cerv_rot', 'dnf']); // inchangé sans protocole
const origNow = Date.now; Date.now = () => day(3); // todaysProgram utilise l'heure actuelle
try {
  const pr = P.todaysProgram(withP('acl', 'btb'));
  assert.deepEqual(pr.map((x) => x.id), ['slr', 'tke', 'knee_ext_sit']);
  assert.ok(pr.every((x) => x.dose.sets >= 1));
  assert.equal(P.levelOf(withP('acl', 'btb'), 'knee_ext_sit'), 2); // niveau plafonné en phase protégée
  assert.equal(P.levelOf({ ...withP('acl', 'btb'), levels: { knee_ext_sit: 5 } }, 'knee_ext_sit'), 2);
  assert.equal(P.levelOf({ ...withP('acl', 'btb'), levels: { slr: 4 } }, 'slr'), 4);
  // exerciseIds avec phase explicite : ancien comportement
  assert.deepEqual(P.exerciseIds({ pathology: 'neck_mech' }, 2), ['dnf', 'chin_tuck', 'row_band', 'thor_ext']);
  // le protocole l'emporte sur le plan du clinicien et la pathologie
  const mix = P.todaysProgram({ ...withP('acl', 'btb'), pathology: 'neck_mech', plan: { phase: 1, ids: ['chin_tuck'] } });
  assert.deepEqual(mix.map((x) => x.id), ['slr', 'tke', 'knee_ext_sit']);
  // remplacement d'exercice (matériel) respecté
  assert.ok(P.todaysProgram({ ...withP('acl', 'btb'), swaps: { slr: 'glute_bridge' } }).some((x) => x.id === 'glute_bridge'));
  // la douleur max du protocole s'applique à la progression : 4/10 > 3
  const it = { id: 'slr', level: 3, sets: [{ quality: 0.9 }], pain: 4, difficulty: 2, ts: day(3) };
  assert.equal(P.adjustLevel(withP('acl', 'btb'), it, []).reason, 'pain');
  // plafond de niveau d'un exercice protégé : pas de montée au-dessus
  const e1 = { id: 'knee_ext_sit', level: 2, sets: [{ quality: 0.9 }], pain: 0, difficulty: 1, ts: day(2) };
  const e2 = { ...e1, ts: day(3) };
  const r = P.adjustLevel(withP('acl', 'btb'), e2, [{ id: 's', date: e1.ts, items: [e1] }]);
  assert.equal(r.change, 0); assert.equal(r.reason, 'max');
} finally { Date.now = origNow; }
// phase 2 : exercices de la phase 2
Date.now = () => day(20);
try {
  assert.deepEqual(P.todaysProgram(withP('acl', 'btb')).map((x) => x.id), ['slr', 'tke', 'knee_ext_sit']); // critères de la phase 1 non confirmés : phase maintenue
  assert.deepEqual(P.todaysProgram(withP('acl', 'btb', { confirmed: { acl1: 1 } })).map((x) => x.id), ['slr', 'tke', 'sit_stand', 'wall_sit', 'heel_raise', 'glute_bridge']); }
finally { Date.now = origNow; }
// dose imposée par le protocole (entrée avec dose) : même mécanique que rxDose
const custom = protocolPhases(protocolById('tka'))[0];
assert.ok(custom.exercises.length);

// ---- 5. Revue hebdomadaire : jamais d'avance au-delà du temps
const heavy = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 's' + n, date: day(40 - n), items: [{ id: 'slr', pain: 1, difficulty: 2 }] }));
let rv = P.weeklyReview(withP('tka'), heavy, day(10));
assert.equal(rv.phase, 1); assert.equal(rv.week, 2); assert.equal(rv.protocol, true);
rv = P.weeklyReview(withP('tka'), heavy, day(30)); // temps écoulé mais critères non confirmés : reste en phase 1
assert.equal(rv.phase, 1);
rv = P.weeklyReview(withP('tka', undefined, { confirmed: { tka1: 1 } }), heavy, day(30));
assert.equal(rv.phase, 2);
rv = P.weeklyReview(withP('tka', undefined, { confirmed: { tka1: 1, tka2: 1, tka3: 1 } }), heavy, day(5));
assert.equal(rv.phase, 1);
// sans protocole : comportement d'avant
rv = P.weeklyReview(prof({ pathology: 'neck_mech', startDate: day(-28), phase: 1 }), heavy, day(0));
assert.ok(rv.phase >= 1 && !rv.protocol);
// nextPhaseInfo
let npi = P.nextPhaseInfo(withP('tka'), [], day(30));
assert.equal(npi.protocol, true); assert.equal(npi.blocked, true); assert.equal(npi.locked, true);
npi = P.nextPhaseInfo(withP('tka'), [], day(7));
assert.equal(npi.weeksLeft, 1);

// ---- 6. Pathologies
const ids = PATHOLOGIES.map((p) => p.id);
assert.equal(new Set(ids).size, ids.length, 'ids de pathologies uniques');
assert.ok(PATHOLOGIES.length >= 41 + 10, 'au moins 10 pathologies ajoutées');
assert.ok(PATHOLOGIES.filter((p) => p.lay).length >= 10);
for (const p of PATHOLOGIES) {
  assert.ok(REG.has(p.region), p.id + ' région');
  assert.ok(bi(p.name), p.id + ' nom'); assert.ok(Number.isFinite(p.painMax) && p.painMax >= 1 && p.painMax <= 10);
  for (const n of [1, 2, 3]) {
    assert.ok(Array.isArray(p.phases[n]) && p.phases[n].length >= 1, `${p.id} phase ${n}`);
    for (const e of p.phases[n]) assert.ok(EXERCISES[e], `${p.id} : exercice inconnu ${e}`);
  }
  assert.ok(p.edu && p.edu.fr.length === p.edu.en.length && p.edu.fr.length >= 1, p.id + ' éducation fr/en alignée');
  if (p.avoid) assert.equal(p.avoid.fr.length, p.avoid.en.length, p.id + ' avoid aligné');
}
// Triage : chaque pathologie atteignable (liste complète de la région) et nom simple pour toutes
Object.assign(LAY, LAY_NEW);
for (const p of PATHOLOGIES) { assert.ok(LAY[p.id], p.id + ' : nom simple'); assert.ok(bi(LAY[p.id].name) && LAY[p.id].kw.length >= 3, p.id + ' mots-clés'); }
for (const p of PATHOLOGIES) assert.ok(PATHOLOGIES.filter((x) => x.region === p.region).some((x) => x.id === p.id));
// Questions supplémentaires : chaque pathologie ajoutée est gagnante pour au moins une réponse
const newIds = PATHOLOGIES.filter((p) => p.lay).map((p) => p.id);
for (const [reg, qs] of Object.entries(EXTRA_QUESTIONS)) {
  const all = [...(QUESTIONS[reg] || []), ...qs];
  for (const o of qs[0].opts) for (const id of Object.keys(o.s)) assert.ok(PATHOLOGIES.find((p) => p.id === id && p.region === reg), `${reg} : ${id} dans la région`);
  qs.forEach((q) => { assert.ok(bi(q.q)); q.opts.forEach((o) => assert.ok(bi(o.t))); });
  // sans casser le score existant
  const ans = {}; (QUESTIONS[reg] || []).forEach((_, i) => (ans[i] = 0));
  assert.ok(scoreAnswers(reg, ans, PATHOLOGIES).length > 0);
  all.forEach((q) => assert.ok(q.opts.length >= 1));
}
for (const id of newIds) {
  const p = PATHOLOGIES.find((x) => x.id === id), qs = EXTRA_QUESTIONS[p.region] || [];
  const hit = qs.some((q) => q.opts.some((o) => o.s[id]));
  const dx = matchDiagnosis(LAY[id].kw[0], PATHOLOGIES).some((m) => m.id === id);
  assert.ok(hit || dx, `${id} : non atteignable par le triage (question ou mots-clés)`);
}
// Reconnaissance d'un diagnostic écrit
assert.equal(matchDiagnosis('doigt à ressaut', PATHOLOGIES)[0]?.id, 'trigger_finger');
assert.equal(matchDiagnosis('tassement vertébral ostéoporotique', PATHOLOGIES)[0]?.id, 'vertebral_fx');
// Programme avec une pathologie ajoutée
assert.deepEqual(P.exerciseIds({ pathology: 'trigger_finger' }, 2), ['tendon_glides', 'grip_putty']);

// ---- 7. Interface : hooks purs (sans DOM)
const sp = summaryPart(withP('acl', 'btb'), day(30));
assert.equal(sp.protocol.id, 'acl'); assert.equal(sp.protocol.blocked, true); assert.equal(sp.protocol.week, 5);
assert.deepEqual(summaryPart(prof()), {});
assert.equal(homeCardProtocol(prof()), '');
const card = homeCardProtocol(withP('tha', 'posterior'), day(10));
assert.ok(card.includes('data-go="#/protocole"') && !card.includes('undefined'));
const vh = protocolViewHtml(withP('tha', 'anterior'), day(10));
assert.ok(vh.includes('data-phase="tha1"') && vh.includes('open') && vh.includes('proto-flags'));
assert.ok(protocolViewHtml(prof(), day(1)).includes(t('pr_noProtocol')));
// confirmations : rejet par rxExtras quand la date change, conservation sinon
const rx = { protocol: { id: 'tka', surgeryDate: S0, confirmed: { tka1: 1 } } };
assert.deepEqual(rxExtrasProtocol(rx).protocol.confirmed, { tka1: 1 });
assert.deepEqual(rxExtrasProtocol(rx, { protocol: { id: 'tka', surgeryDate: S0, confirmed: { tka2: 2 } } }).protocol.confirmed, { tka1: 1, tka2: 2 });
assert.deepEqual(rxExtrasProtocol(rx, { protocol: { id: 'tka', surgeryDate: '2025-01-01', confirmed: { tka2: 2 } } }).protocol.confirmed, { tka1: 1 });
assert.equal(rxExtrasProtocol({}).protocol, null);
assert.equal(rxExtrasProtocol({ protocol: { id: 'zzz', surgeryDate: S0 } }).protocol, null);
assert.deepEqual(Object.keys(confirmedBefore('tka', null, S0, day(60))).sort(), ['tka1', 'tka2']);
assert.deepEqual(Object.keys(confirmedBefore('tka', null, S0, day(5))), []);
// éditeur : lecture depuis un faux DOM
const fake = (vals) => ({ querySelector: (s) => (s === '#pr-root' ? null : { '#pr-id': { value: vals.id }, '#pr-date': { value: vals.date }, '#pr-variant': { value: vals.variant }, '#pr-past': { checked: vals.past } }[s] || null) });
const sec = rxSectionProtocol(null);
assert.ok(sec.html.includes('pr-id') && sec.html.includes('pr-date'));
assert.equal(sec.read(fake({ id: '' })).protocol, null);
assert.equal(sec.read(fake({ id: 'tha', date: '', variant: 'anterior' })).error, 'surgeryDate');
const got = sec.read(fake({ id: 'tha', date: S0, variant: 'anterior', past: false })).protocol;
assert.deepEqual([got.id, got.variant, got.surgeryDate, got.pastOk], ['tha', 'anterior', S0, false]); assert.deepEqual(got.confirmed, {});
const got2 = sec.read(fake({ id: 'tka', date: P.todayKey(Date.now() - 100 * 86400000), past: true })).protocol;
assert.equal(got2.variant, undefined); assert.deepEqual(Object.keys(got2.confirmed).sort(), ['tka1', 'tka2', 'tka3']);

console.log('protocols : tout est bon (' + PROTOCOLS.length + ' protocoles, ' + PATHOLOGIES.length + ' pathologies)');
