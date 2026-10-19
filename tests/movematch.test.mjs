// Test : le contrôle du mouvement reconnaît l'exercice prescrit et signale un autre mouvement
// (ex. flexion du biceps à la place du pendule de Codman).
import { pose, interpParams } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
import { toPx } from '../www/js/pose.js';
import { MoveMatcher, hintKey } from '../www/js/movematch.js';

const lerpP = interpParams;
function toLm(fig, prm) {
  const j = pose(fig, prm); const L = new Array(33).fill(null).map(() => ({ x: 0, y: 0, visibility: 1 }));
  const set = (i, p, dx = 0, dy = 0) => { L[i] = { x: (p[0] + dx) / 240, y: (p[1] + dy) / 200, visibility: 1 }; };
  if ((fig.view || 'side') === 'side') {
    set(0, j.head, 8, 0); set(7, j.head, -2, 0); set(8, j.head, -1, 0);
    set(11, j.shoulder); set(12, j.shoulder, 1, 0); set(13, j.elbow); set(14, j.elbow2); set(15, j.wrist); set(16, j.wrist2);
    set(23, j.pelvis); set(24, j.pelvis, 1, 0); set(25, j.knee); set(26, j.knee2); set(27, j.ankle); set(28, j.ankle2);
  } else {
    set(0, j.head, 0, 1); set(7, j.head, 6, 0); set(8, j.head, -6, 0);
    set(11, j.shL); set(12, j.shR); set(13, j.elbowL); set(14, j.elbowR); set(15, j.wristL); set(16, j.wristR);
    set(23, j.hipL); set(24, j.hipR); set(25, j.kneeL); set(26, j.kneeR); set(27, j.ankleL); set(28, j.ankleR);
  }
  return L;
}
// anime l'exercice `doId` et juge avec la référence de `refId`
function judge(refId, doId, cycles = 4) {
  const m = new MoveMatcher(EXERCISES[refId]); if (!m.usable) return null;
  const fig = EXERCISES[doId].fig; const [A, B] = [fig.frames[0], fig.frames[1] || fig.frames[0]];
  let t = 0; const seen = { wrong: 0, ok: 0, total: 0 };
  const step = (prm) => { t += 50; const s = m.update(toPx(toLm(fig, prm), 240, 200), t); if (t > 3000) { seen.total++; if (s.status === 'wrong') seen.wrong++; if (s.status === 'ok') seen.ok++; } return s; };
  let last;
  for (let c = 0; c < cycles; c++) { for (let i = 0; i <= 30; i++) last = step(lerpP(A, B, i / 30)); for (let i = 0; i <= 30; i++) last = step(lerpP(B, A, i / 30)); }
  return { wrongPct: Math.round((100 * seen.wrong) / seen.total), last, hint: hintKey(last.issues[0]) };
}
const ids = Object.keys(EXERCISES).filter((id) => ['side', 'front'].includes(EXERCISES[id].fig.view || 'side'));
const self = ids.map((id) => ({ id, ...judge(id, id) })).filter((r) => r.wrongPct != null);
const falseAlarm = self.filter((r) => r.wrongPct > 10);
console.log(`Bon exercice reconnu : ${self.length - falseAlarm.length}/${self.length}`);
if (falseAlarm.length) console.table(falseAlarm.map((r) => ({ id: r.id, wrong: r.wrongPct + '%', issues: r.last.issues.map((i) => `${i.k}:${i.kind} ${i.live}/${i.expected}`).join(' ') })));
const curl = judge('pendulum', 'elbow_curl');
console.log('Biceps au lieu du pendule →', curl.last.status, `(${curl.wrongPct}% du temps)`, curl.last.issues.map((i) => `${i.k}:${i.kind} ${i.live}°/${i.expected}°`).join(', '), '→', curl.hint);
// matrice : un autre exercice est-il signalé ?
let pairs = 0, caught = 0;
for (const a of ids) for (const b of ids) if (a !== b && EXERCISES[a].region !== EXERCISES[b].region) { const r = judge(a, b, 2); if (!r) continue; pairs++; if (r.wrongPct > 30) caught++; }
console.log(`Autre exercice (autre région) signalé : ${caught}/${pairs} (${Math.round((100 * caught) / pairs)} %)`);
if (curl.last.status !== 'wrong' || falseAlarm.length > 2) process.exit(1);
