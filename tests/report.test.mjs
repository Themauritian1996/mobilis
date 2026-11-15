// Rapports : échéance, période, données du rapport (filtre de période, adhérence, gains, DMCI), résumé clinicien, rendu PDF (jsPDF sous node).
import { reportDue, reportPeriod, buildReportData, dataFromSummary, summaryPart, rxExtrasReport, rxSectionReport, lastReportTs } from '../www/js/report.js';
import { renderPdfDetailed, latin, pdfLang } from '../www/js/reportpdf.js';
import { progressSummary, todayKey } from '../www/js/program.js';
import { summaryPart as romPart } from '../www/js/rom.js';
import { summaryPart as promPart } from '../www/js/data/proms.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ÉCHEC', m); } else console.log('  ok ', m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; console.log('  ÉCHEC', m, '— obtenu', JSON.stringify(a), 'attendu', JSON.stringify(b)); } else console.log('  ok ', m); };

const DAY = 86400000;
const noon = (k) => new Date(k + 'T12:00').getTime();
const NOW = noon('2026-11-15'); // dimanche
const at = (n) => NOW - n * DAY; // n jours avant

console.log('Échéance');
const base = { joinedAt: at(30), startDate: at(30) };
ok(!reportDue({ ...base }, NOW), 'sans plan : jamais dû');
ok(!reportDue({ ...base, reportPlan: { every: 0 } }, NOW), 'every 0 : pas dû');
ok(!reportDue({ ...base, reportPlan: null }, NOW), 'plan null : pas dû');
ok(reportDue({ ...base, reportPlan: { every: 4 } }, NOW), 'every 4, arrivé il y a 30 j : dû');
ok(!reportDue({ ...base, reportPlan: { every: 6 } }, NOW), 'every 6, arrivé il y a 30 j : pas encore dû');
ok(reportDue({ ...base, reportPlan: { every: 6 } }, at(-12)), 'every 6 : dû 12 jours plus tard (42 j)');
ok(!reportDue({ ...base, reportPlan: { every: 4 }, reportLog: [{ ts: at(10), fields: {}, pdfName: 'a.pdf' }] }, NOW), 'rapport il y a 10 j : pas dû');
ok(reportDue({ ...base, reportPlan: { every: 2 }, reportLog: [{ ts: at(15), fields: {} }, { ts: at(20), fields: {} }] }, NOW), 'dernier rapport il y a 15 j, every 2 : dû');
eq(lastReportTs({ reportLog: [{ ts: 5 }, { ts: 9 }, { ts: 7 }] }), 9, 'dernier rapport = le plus récent');
ok(!reportDue({ reportPlan: { every: 2 } }, NOW), 'sans date de départ : pas dû');
ok(reportDue({ startDate: at(20), reportPlan: { every: 2 } }, NOW), 'repli sur startDate');
eq(reportPeriod({ ...base, reportLog: [{ ts: at(9) }] }, [], NOW), { from: at(9), to: NOW }, 'période : depuis le dernier rapport');
eq(reportPeriod({ ...base }, [], NOW), { from: at(30), to: NOW }, 'période : depuis le départ');

console.log('Données : profil synthétique');
// Plan : lundi / mercredi / vendredi. Période : 2026-11-01 (dimanche) → 2026-11-14 (samedi) = 2 semaines = 6 jours prévus.
const FROM = noon('2026-11-01'), TO = noon('2026-11-14') + 6 * 3600e3;
const prof = {
  name: 'Alex Test', pathology: 'frozen', phase: 2, days: [1, 3, 5], startDate: noon('2026-10-01'), joinedAt: noon('2026-10-01'), levels: { }, clinician: 'Dre Test',
  badges: { first: noon('2026-10-05'), streak3: noon('2026-11-05'), prom: noon('2026-11-10') },
  romLog: [
    { test: 'sh_flex', side: 'L', ts: noon('2026-10-02'), deg: 90, conf: 0.9, method: 'camera' },
    { test: 'sh_flex', side: 'L', ts: noon('2026-10-20'), deg: 110, conf: 0.9, method: 'camera' },
    { test: 'sh_flex', side: 'L', ts: noon('2026-11-10'), deg: 130, conf: 0.9, method: 'manual' },
    { test: 'sh_flex', side: 'R', ts: noon('2026-10-02'), deg: 170, conf: 0.9, method: 'camera' },
    { test: 'sh_flex', side: 'L', ts: noon('2026-11-14') + 18 * 3600e3, deg: 150, conf: 0.9, method: 'camera' }, // après la période : ignoré
  ],
  promLog: [
    { id: 'nprs', ts: noon('2026-10-02'), answers: [7], score: 7 },
    { id: 'nprs', ts: noon('2026-11-10'), answers: [3], score: 3 },
    { id: 'sane', ts: noon('2026-10-02'), answers: [40], score: 40 },
    { id: 'sane', ts: noon('2026-11-10'), answers: [41], score: 41 },
  ],
};
const mk = (day, items) => ({ id: 's' + day, date: noon(day), items, checkin: null });
const it = (id, level, pain, difficulty, reps, full, partial, change = 0, note) => ({ id, level, pain, difficulty, change, note, ts: 0, sets: [{ reps, full, partial, quality: 0.8 }, { reps, full, partial, quality: 0.8 }] });
const sessions = [
  mk('2026-10-30', [it('pendulum', 1, 5, 2, 10, 10, 0)]), // avant la période
  mk('2026-11-02', [it('pendulum', 2, 4, 3, 10, 8, 2, 1, 'ça tire un peu'), it('wall_slide', 1, 5, 4, 8, 8, 0)]), // lundi
  mk('2026-11-04', [it('pendulum', 2, 3, 3, 10, 10, 0)]), // mercredi
  mk('2026-11-07', [it('pendulum', 3, 2, 2, 12, 12, 0, 1)]), // samedi (non prévu)
  mk('2026-11-09', [it('pendulum', 3, 2, 2, 12, 12, 0)]), // lundi
  mk('2026-11-16', [it('pendulum', 3, 1, 1, 12, 12, 0)]), // après
];
const journal = [{ day: '2026-11-03', pain: 6, ts: noon('2026-11-03') }, { day: '2026-10-25', pain: 9, ts: noon('2026-10-25') }, { day: '2026-11-12', pain: 2, ts: noon('2026-11-12') }];
const fields = { global: 1, pain: 3, goalsProgress: 2, goals: 'Me coiffer seul', hardEx: ['pendulum', 'inexistant'], difficulties: 'Le soir', comment: 'Merci', extra: 'ignoré' };
const D = buildReportData(prof, sessions, journal, { from: FROM, to: TO, fields, now: TO });

ok(D.version === 1 && D.source === 'full', 'structure de base');
eq(D.period.from, FROM, 'période : début'); eq(D.period.to, TO, 'période : fin');
eq(D.patient.name, 'Alex Test', 'nom du patient');
eq(buildReportData(prof, sessions, journal, { from: FROM, to: TO, now: TO, includeName: false }).patient.name, '', 'nom exclu sur demande');
ok(D.condition.pathology && D.condition.pathology.fr && D.condition.pathology.en, 'pathologie bilingue');
eq(D.condition.protocol, null, 'pas de protocole');

console.log('Données : période, séances, adhérence');
eq(D.sessionsCount, 4, '4 séances dans la période (les séances avant / après sont exclues)');
eq(D.log.map((s) => new Date(s.ts).getDate()), [2, 4, 7, 9], 'journal des séances filtré et trié');
eq(D.adherence, { planned: 6, done: 3, pct: 50 }, 'adhérence : 3 jours prévus faits sur 6 (le samedi hors plan ne compte pas)');
{
  const A = buildReportData({ ...prof, calSkip: ['2026-11-13'] }, sessions, journal, { from: FROM, to: TO, now: TO });
  eq(A.adherence.planned, 5, 'adhérence : un repos volontaire retire un jour prévu');
  const B = buildReportData(prof, sessions, journal, { from: noon('2026-11-09'), to: noon('2026-11-09') + 3600e3, now: noon('2026-11-09') + 3600e3 });
  eq(B.adherence, { planned: 1, done: 1, pct: 100 }, 'adhérence sur un seul jour');
  const Z = buildReportData(prof, [], [], { from: FROM, to: TO, now: TO });
  eq(Z.sessionsCount, 0, 'aucune séance'); eq(Z.adherence.pct, 0, 'adhérence 0 % sans séance'); ok(Z.pain.avg === null && Z.pain.series.length === 0, 'pas de douleur');
}
{
  // aujourd'hui non encore fait ne compte pas comme manqué
  const today = noon('2026-11-14'); // samedi, non prévu : on teste lundi
  const mon = noon('2026-11-09');
  const C = buildReportData(prof, [], [], { from: mon - 3600e3, to: mon + 3600e3, now: mon + 3600e3 });
  eq(C.adherence.planned, 0, "aujourd'hui (prévu, pas encore fait) n'est pas compté comme manqué");
  ok(today > 0, 'ok');
}

console.log('Données : douleur');
eq(D.pain.series.map((p) => [new Date(p.ts).getDate(), p.v, p.src]), [[2, 4.5, 's'], [3, 6, 'j'], [4, 3, 's'], [7, 2, 's'], [9, 2, 's'], [12, 2, 'j']], 'séries : moyenne par séance + journal, période seulement');
ok(Math.abs(D.pain.avg - 3.25) < 0.06, 'douleur moyenne 3,25');
eq([D.pain.first, D.pain.last, D.pain.delta, D.pain.min, D.pain.max], [4.5, 2, -2.5, 2, 6], 'première, dernière, variation, min, max');

console.log('Données : exercices');
const pend = D.exercises.find((e) => e.id === 'pendulum');
ok(pend && pend.sessions === 4, 'pendule : 4 séances');
eq([pend.levelStart, pend.level], [2, 3], 'pendule : niveau 2 au début de la période, niveau actuel 3');
ok(Math.abs(pend.difficulty - 2.5) < 0.01 && Math.abs(pend.pain - 2.8) < 0.1, 'difficulté et douleur moyennes');
eq(pend.trend, 'up', 'tendance à la hausse (changements de niveau)');
ok(D.exercises.every((e) => e.name && e.name.fr), 'noms bilingues');

console.log('Données : amplitudes');
eq(D.rom.length, 2, 'deux lignes (flexion épaule G et D)');
const romL = D.rom.find((r) => r.side === 'L'), romR = D.rom.find((r) => r.side === 'R');
eq([romL.baseline, romL.last, romL.gain, romL.n], [90, 130, 40, 3], 'G : départ 90, dernière 130 (la mesure postérieure à la période est ignorée), gain 40');
ok(romL.pctNormal > 60 && romL.pctNormal < 100, `% de la norme G (${romL.pctNormal})`);
eq([romR.baseline, romR.last, romR.gain], [170, 170, 0], 'D : une seule mesure');
eq(romL.series.map((p) => p[1]), [90, 110, 130], 'série pour la courbe');
ok(romL.name.fr && romL.normal && 'ref' in romL.normal, 'nom bilingue et normes');

console.log('Données : questionnaires');
const nprs = D.prom.find((p) => p.id === 'nprs'), sane = D.prom.find((p) => p.id === 'sane');
eq([nprs.baseline, nprs.last, nprs.delta], [7, 3, -4], 'NPRS 7 → 3');
ok(nprs.mcidReached === true, 'NPRS : DMCI atteinte (amélioration de 4 points)');
eq([sane.baseline, sane.last, sane.delta], [40, 41, 1], 'SANE 40 → 41');
ok(sane.mcidReached === false, 'SANE : variation de 1 point sous la DMCI');
ok(D.prom.every((p) => p.name), 'noms des questionnaires');

console.log('Données : badges, champs, commentaires');
eq(D.badges, { total: 3, inPeriod: 2 }, 'badges : total et gagnés dans la période');
eq(D.fields.global, 1, 'champ global'); eq(D.fields.pain, 3, 'douleur actuelle'); eq(D.fields.goalsProgress, 2, 'objectifs');
eq(D.fields.hardExIds, ['pendulum'], 'exercices difficiles : identifiants inconnus retirés');
ok(D.fields.hardEx[0].fr && !('extra' in D.fields), 'noms bilingues, champs inconnus retirés');
eq(buildReportData(prof, sessions, journal, { from: FROM, to: TO, now: TO }).fields, null, 'sans champs : null (PDF ad hoc)');
eq(buildReportData(prof, sessions, journal, { from: FROM, to: TO, now: TO, fields: { global: 9, pain: 99, goalsProgress: -4 } }).fields, { global: 2, pain: 10, goalsProgress: 0 }, 'valeurs bornées');
eq(D.notes.map((n) => n.text), ['ça tire un peu'], 'commentaires de la période');
{
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 'm' + i, date: FROM + (i % 13) * DAY + i * 1000, items: [it('pendulum', 2, 3, 3, 10, 10, 0)], checkin: null }));
  const M = buildReportData(prof, many, [], { from: FROM, to: TO, now: TO });
  eq([M.log.length, M.logTruncated], [60, true], 'journal plafonné à 60 séances');
  eq(M.sessionsCount, 80, 'le total de séances reste exact');
}

console.log('Protocole post-opératoire');
{
  const pr = { ...prof, protocol: { id: 'acl', surgeryDate: '2026-09-15' } };
  const P2 = buildReportData(pr, sessions, journal, { from: FROM, to: TO, now: TO });
  ok(P2.condition.protocol && P2.condition.protocol.name.fr && P2.condition.protocol.week >= 1 && P2.condition.protocol.phases >= 2, 'protocole : nom, semaine, phases');
}

console.log('Résumé clinicien');
eq(summaryPart({}), {}, 'sans rapport : {}');
{
  const sp = summaryPart({ reportPlan: { every: 4 }, reportLog: [{ ts: 100, fields: { pain: 2 } }, { ts: 300, fields: { pain: 5 } }] });
  eq([sp.report.ts, sp.report.fields.pain, sp.report.every, sp.report.n], [300, 5, 4, 2], 'dernier rapport du patient');
}
eq(rxExtrasReport({ report: { every: 6 } }), { reportPlan: { every: 6 } }, 'rx.report → reportPlan');
eq(rxExtrasReport({}), { reportPlan: null }, 'sans plan : null');
eq(rxExtrasReport({ report: { every: 0 } }), { reportPlan: null }, 'every 0 : null');
{
  const sec = rxSectionReport({ report: { every: 4 } });
  ok(sec.html.includes('data-rp-every') && /option value="4" selected/.test(sec.html), 'éditeur : sélecteur avec la valeur actuelle');
  eq(rxSectionReport({}).read({ querySelector: () => ({ value: '8' }) }), { report: { every: 8 } }, 'éditeur : lecture 8 semaines');
  eq(rxSectionReport({}).read({ querySelector: () => ({ value: '0' }) }), { report: null }, 'éditeur : aucune');
  eq(sec.read({ querySelector: () => null }), { report: { every: 4 } }, 'éditeur : section absente = valeur conservée');
}

console.log('Résumé -> données (côté clinicien)');
{
  const p2 = { ...prof, rxCode: 'ABC', reportLog: [{ ts: NOW, fields: { global: 0, pain: 4 } }] };
  const sum = { ...progressSummary(p2, sessions, NOW), ...romPart(p2), ...promPart(p2), ...summaryPart(p2) };
  const DS = dataFromSummary(sum, { pathology: 'frozen', now: NOW });
  eq(DS.source, 'summary', 'source résumé');
  ok(DS.condition.pathology?.fr, 'pathologie fournie par la fiche');
  eq(DS.rom.length, 2, 'amplitudes issues du résumé'); ok(DS.rom.every((r) => r.series.length && r.name.fr), 'séries et noms');
  ok(DS.prom.length === 2 && DS.prom.find((p) => p.id === 'nprs').mcidReached, 'questionnaires et DMCI issus du résumé');
  eq(DS.fields.pain, 4, 'champs du dernier rapport du patient');
  ok(Array.isArray(DS.log) && DS.log.every((l) => !l.items), 'journal réduit (date, nombre, douleur) : lacune documentée');
  ok(DS.exercises.length > 0, 'exercices du résumé');
}

console.log('Texte sûr pour le PDF');
eq(latin('Éé ça va ? œuvre « test » – 5° ’'), 'Éé ça va ? œuvre « test » – 5° ’', 'français conservé');
eq(latin('−3 → 5'), '-3 -> 5', 'signes remplacés');
eq(latin('Привет'), null, 'cyrillique refusé');
eq(latin('مرحبا'), null, 'arabe refusé');
eq(latin('你好'), null, 'chinois refusé');
eq(latin('ok 😀'), null, 'emoji refusé');
eq([pdfLang('fr'), pdfLang('en'), pdfLang('ar'), pdfLang('zh'), pdfLang('es')], ['fr', 'en', 'en', 'en', 'en'], 'langue du PDF : fr / en, sinon en');

console.log('Rendu PDF (jsPDF)');
{
  const t0 = Date.now();
  const r = await renderPdfDetailed(D, 'fr');
  const buf = Buffer.from(await r.blob.arrayBuffer());
  ok(buf.length > 2000, `PDF non vide (${buf.length} octets)`);
  ok(buf.subarray(0, 5).toString() === '%PDF-', 'commence par %PDF');
  ok(buf.subarray(-8).toString().includes('%%EOF'), 'se termine par %%EOF');
  ok(r.pages >= 1 && r.pages <= 6, `${r.pages} page(s)`);
  ok(buf.length < 150 * 1024, 'petit fichier (< 150 Ko)');
  ok(Date.now() - t0 < 5000, 'rendu rapide');
  const en = await renderPdfDetailed(D, 'zh'); ok(en.pages >= 1, 'langue non prise en charge : PDF en anglais');
  const big = { ...D, fields: { ...D.fields, comment: 'مرحبا بك', goals: 'x'.repeat(900) }, patient: { name: '张伟' }, log: Array.from({ length: 60 }, (_, i) => ({ ts: FROM + i * 3600e3, items: D.log[0].items.concat(D.log[0].items), pain: 3, difficulty: 2 })) };
  const rb = await renderPdfDetailed(big, 'fr'); ok(rb.pages >= 3, `long journal : ${rb.pages} pages, texte non latin sans erreur`);
  const empty = await renderPdfDetailed(buildReportData({}, [], [], { now: NOW }), 'en'); ok(empty.pages === 1, 'profil vide : 1 page');
  const sm = await renderPdfDetailed(dataFromSummary({ ...progressSummary({ ...prof }, sessions, NOW), ...romPart(prof), ...promPart(prof) }, { now: NOW }), 'fr'); ok(sm.pages >= 1, 'PDF depuis un résumé');
}

if (fails) { console.log(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nTous les tests de rapport passent.');
