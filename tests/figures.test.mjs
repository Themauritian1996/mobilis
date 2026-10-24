// Vérifie que les schémas de démonstration sont anatomiques : pas de membre sous le sol, articulations dans leurs amplitudes.
import { pose, interpParams } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
const norm = (a) => ((a + 540) % 360) - 180;
const ang = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI; // 0 = haut, 90 = droite
const issues = [];
// Couché sur le côté (vu de face ou du dessus) : le contrôle d'amplitude sagittale ne s'applique pas
const NON_SAGITTAL = new Set(['clamshell', 'open_book']);
for (const [id, ex] of Object.entries(EXERCISES)) {
  const fig = ex.fig, v = fig.view || 'side';
  const f = fig.frames, B = f[1] || f[0];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10, j = pose(fig, interpParams(f[0], B, t)), bad = [];
    if (v === 'side' || v === 'front') {
      for (const [n, p] of Object.entries(j)) if (Array.isArray(p) && p[1] > 184.5) bad.push(`${n} sous le sol (${p[1].toFixed(0)})`);
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
    if (bad.length) { issues.push(`${id} t=${t}: ${bad.join(', ')}`); break; }
  }
}
console.log(issues.length ? issues.join('\n') : 'Schémas OK');
console.log(`${issues.length} schéma(s) à revoir`);
if (issues.length) process.exit(1);
