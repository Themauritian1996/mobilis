// Vérifie que les schémas de démonstration sont anatomiques et lisibles :
//  - pas de membre sous le sol, articulations dans leurs amplitudes (genou, coude) ;
//  - tout le schéma reste dans le cadre (aucune partie coupée), à chaque instant de l'animation ;
//  - aucune coordonnée invalide (NaN).
import { pose, interpParams, figFit } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
const norm = (a) => ((a + 540) % 360) - 180;
const ang = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI; // 0 = haut, 90 = droite
const issues = [];
// Couché sur le côté (vu de face ou du dessus) : le contrôle d'amplitude sagittale ne s'applique pas
const NON_SAGITTAL = new Set(['clamshell', 'open_book']);
const pts = (o, out = []) => {
  if (Array.isArray(o)) { if (typeof o[0] === 'number') out.push(o); else o.forEach((x) => pts(x, out)); }
  return out;
};
for (const [id, ex] of Object.entries(EXERCISES)) {
  const fig = ex.fig, v = fig.view || 'side';
  const f = fig.frames;
  const pairs = f.length > 1 ? f.slice(0, -1).map((a, i) => [a, f[i + 1]]) : [[f[0], f[0]]];
  const { z, cx: ax, cy: ay } = figFit(fig);
  const scr = (p) => [ax + (p[0] - ax) * z, ay + (p[1] - ay) * z];
  let done = false;
  for (const [A, B] of pairs) {
    if (done) break;
    for (let k = 0; k <= 10 && !done; k++) {
      const t = k / 10, j = pose(fig, interpParams(A, B, t)), bad = [];
      for (const [n, p] of Object.entries(j)) {
        for (const q of pts(p)) {
          if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) { bad.push(`${n} invalide`); continue; }
          if (n === 'knee' && v === 'foot') continue; // la jambe sort volontairement du cadre (vue rapprochée du pied)
          if (n === 'knee' && v === 'footBack') continue;
          if (n === 'elbow' && v === 'hand') continue; // avant-bras qui entre par le bord
          if (fig.crop && !fig.crop.includes(n)) continue; // vue rapprochée (tête, cou…) : seules ces parties doivent rester visibles
          const [x, y] = scr(q), m = (n === 'head' ? 7 : 3) * z;
          if (x - m < -0.5 || x + m > 240.5 || y - m < -0.5 || y + m > 200.5) bad.push(`${n} hors cadre (${x.toFixed(0)},${y.toFixed(0)})`);
        }
      }
      if ((v === 'side' || v === 'front') && fig.ground !== false) {
        for (const [n, p] of Object.entries(j)) if (Array.isArray(p) && typeof p[0] === 'number' && p[1] > 184.5) bad.push(`${n} sous le sol (${p[1].toFixed(0)})`);
      }
      if (v === 'side' && !NON_SAGITTAL.has(id)) {
        const flex = (a, b, c) => norm(ang(j[b], j[c]) - ang(j[a], j[b])); // rotation du segment distal
        for (const s of ['', '2']) {
          // genou : la jambe tourne vers l'arrière par rapport à la cuisse (sens de la flexion) — face à droite
          const kn = flex('pelvis', 'knee' + s, 'ankle' + s);
          if (kn < -12) bad.push(`genou${s} en hyperextension (${kn.toFixed(0)}°)`);
          if (kn > 160) bad.push(`genou${s} trop fléchi (${kn.toFixed(0)}°)`);
          const el = flex('shoulder', 'elbow' + s, 'wrist' + s);
          if (el > 12) bad.push(`coude${s} plié à l'envers (${el.toFixed(0)}°)`);
          if (el < -160) bad.push(`coude${s} trop fléchi (${el.toFixed(0)}°)`);
        }
      }
      if (bad.length) { issues.push(`${id} t=${t}: ${bad.slice(0, 4).join(', ')}`); done = true; }
    }
  }
}
console.log(issues.length ? issues.join('\n') : 'Schémas OK');
console.log(`${issues.length} schéma(s) à revoir`);
if (issues.length) process.exit(1);
