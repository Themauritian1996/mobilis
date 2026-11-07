// Vérifie que les schémas de démonstration sont anatomiques, réalistes et lisibles :
//  - pas de membre sous le sol ni dans un mur, une marche, une table ; assis = bassin posé sur la chaise ;
//  - articulations dans leurs amplitudes humaines (genou, coude, hanche, épaule, cheville, cou), membres proche et loin ;
//  - mouvement fluide : pas de rotation « par le mauvais côté » (> 180°) ni de saut d'une image à l'autre ;
//  - tout le schéma reste dans le cadre (aucune partie coupée), à chaque instant de l'animation ;
//  - aucune coordonnée invalide (NaN).
import { pose, interpParams, figFit } from '../www/js/figure.js';
import { EXERCISES } from '../www/js/data/exercises.js';
const norm = (a) => ((a + 540) % 360) - 180;
const ang = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI; // 0 = haut, 90 = droite
const issues = [];
// Couché sur le côté (vu de face ou du dessus) : le contrôle d'amplitude sagittale ne s'applique pas
const NON_SAGITTAL = new Set(['clamshell', 'open_book', 'side_plank']); // planche latérale : vue de face (plan frontal)
const pts = (o, out = []) => {
  if (Array.isArray(o)) { if (typeof o[0] === 'number') out.push(o); else o.forEach((x) => pts(x, out)); }
  return out;
};
const ANGLES = /^(trunk|head|uarm|farm|thigh|shank|foot|uarm2|farm2|thigh2|shank2|foot2|shAbd[RL]|elbow[RL]|hipAbd[RL]|shank[RL]|wrist|mcp|pip|dip|thumb|forearmRot|pf|inv)$/;
for (const [id, ex] of Object.entries(EXERCISES)) {
  const fig = ex.fig, v = fig.view || 'side';
  const f = fig.frames;
  // Fluidité : une articulation ne tourne jamais de plus de 180° d'une image clé à l'autre (sinon elle « fait le tour »)
  for (let i = 0; i + 1 < f.length; i++) {
    const A = interpParams(f[i], f[i + 1], 0), B = interpParams(f[i], f[i + 1], 1);
    for (const k of Object.keys(A)) if (ANGLES.test(k) && Math.abs(B[k] - A[k]) > 180) issues.push(`${id} : ${k} tourne de ${Math.round(B[k] - A[k])}° entre les images ${i} et ${i + 1}`);
    // pas de saut : déplacement maximal d'un point entre deux instants proches
    let prev = null, maxStep = 0, sum = 0, n = 0;
    for (let k = 0; k <= 40; k++) {
      const jj = pose(fig, interpParams(f[i], f[i + 1], k / 40));
      const P = Object.entries(jj).filter(([, p]) => Array.isArray(p) && typeof p[0] === 'number');
      if (prev) { const d = Math.max(...P.map(([nm, p]) => (prev[nm] ? Math.hypot(p[0] - prev[nm][0], p[1] - prev[nm][1]) : 0))); maxStep = Math.max(maxStep, d); sum += d; n++; }
      prev = Object.fromEntries(P);
    }
    if (n && maxStep > 9 && maxStep > 5 * (sum / n)) issues.push(`${id} : saut dans l'animation (${maxStep.toFixed(0)} px) entre les images ${i} et ${i + 1}`);
  }
  const pairs = f.length > 1 ? f.slice(0, -1).map((a, i) => [a, f[i + 1]]) : [[f[0], f[0]]];
  const { z, cx: ax, cy: ay } = figFit(fig);
  const scr = (p) => [ax + (p[0] - ax) * z, ay + (p[1] - ay) * z];
  let done = false;
  for (const [A, B] of pairs) {
    if (done) break;
    for (let k = 0; k <= 20 && !done; k++) {
      const t = k / 20, j = pose(fig, interpParams(A, B, t)), bad = [];
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
      // Objets : le corps ne traverse ni mur, ni marche, ni table (contact toléré)
      if (v === 'side' || v === 'front') {
        const body = Object.entries(j).filter(([n, p]) => Array.isArray(p) && typeof p[0] === 'number' && !['nose', 'headRot'].includes(n));
        // points intermédiaires des segments (un avant-bras peut traverser un mur sans qu'une articulation y soit)
        const segs = v === 'side' ? [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'elbow2'], ['elbow2', 'wrist2'], ['pelvis', 'knee'], ['knee', 'ankle'], ['pelvis', 'knee2'], ['knee2', 'ankle2'], ['pelvis', 'shoulder'], ['ankle', 'toe'], ['ankle2', 'toe2']]
          : [['shR', 'elbowR'], ['elbowR', 'wristR'], ['shL', 'elbowL'], ['elbowL', 'wristL'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['hipL', 'kneeL'], ['kneeL', 'ankleL']];
        const all = body.map(([n, p]) => [n, p]);
        for (const [a, b] of segs) if (j[a] && j[b]) for (const u of [0.25, 0.5, 0.75]) all.push([`${a}-${b}`, [j[a][0] + (j[b][0] - j[a][0]) * u, j[a][1] + (j[b][1] - j[a][1]) * u]]);
        for (const pr of fig.props || []) {
          const [name, a = 0, b = 0] = Array.isArray(pr) ? pr : [pr];
          if (name === 'wall') {
            const x0 = a || 196, left = (j.pelvis || j.hipR)[0] < x0;
            for (const [n, p] of all) { const pen = left ? p[0] - x0 : x0 + 10 - p[0]; if (pen > 1.5) bad.push(`${n} dans le mur (${pen.toFixed(0)} px)`); }
          }
          if (name === 'step') { const x0 = a || 90, w = b || 60; for (const [n, p] of all) if (p[0] > x0 + 2 && p[0] < x0 + w - 2 && p[1] > 162 + 2.5 && p[1] < 182) bad.push(`${n} dans la marche`); }
          if (name === 'table' && v === 'side') { const x0 = a || 20, y0 = b || 108; for (const [n, p] of all) if (p[0] > x0 + 2 && p[0] < x0 + 113 && p[1] > y0 + 2.5 && p[1] < y0 + 10) bad.push(`${n} dans la table`); }
          if (name === 'chair' && v === 'side') {
            const x0 = a || 56, y0 = b || 142, pel = j.pelvis;
            for (const [n, p] of all) if (p[0] > x0 + 1 && p[0] < x0 + 43 && p[1] > y0 + 2.5 && p[1] < y0 + 6) bad.push(`${n} dans le siège`);
            // assis (cuisse à l'horizontale au-dessus du siège) : le bassin repose sur la chaise
            const th = Math.abs(norm(ang(j.pelvis, j.knee) - 90));
            if (pel[0] > x0 && pel[0] < x0 + 44 && th < 25 && (pel[1] < y0 - 14 || pel[1] > y0 + 1)) bad.push(`bassin pas posé sur la chaise (${(y0 - pel[1]).toFixed(0)} px)`);
          }
        }
      }
      if (v === 'side' && !NON_SAGITTAL.has(id)) {
        const flex = (a, b, c) => norm(ang(j[b], j[c]) - ang(j[a], j[b])); // rotation du segment distal
        const T = ang(j.pelvis, j.shoulder);
        // cou : la tête reste dans l'axe du tronc à ± 50°
        const nk = norm(ang(j.shoulder, j.head) - T);
        if (Math.abs(nk) > 52) bad.push(`cou trop tourné (${nk.toFixed(0)}°)`);
        for (const s of ['', '2']) {
          // hanche : extension ≤ 35°, flexion ≤ 150° (cuisse par rapport au prolongement du tronc)
          const hf = norm(T + 180 - ang(j.pelvis, j['knee' + s]));
          if (hf < -35 || hf > 150) bad.push(`hanche${s} hors amplitude (${hf.toFixed(0)}°)`);
          // épaule : extension ≤ 65°, flexion ≤ 185° (bras par rapport au prolongement du tronc)
          const sf = ((T + 180 - ang(j.shoulder, j['elbow' + s])) % 360 + 450) % 360 - 90; // de −90° à 270°
          if (sf < -65 || sf > 195) bad.push(`épaule${s} hors amplitude (${sf.toFixed(0)}°)`);
          // cheville : flexion plantaire ≤ 55°, flexion dorsale ≤ 35°
          if (j['toe' + s]) { const af = norm(ang(j['knee' + s], j['ankle' + s]) - ang(j['ankle' + s], j['toe' + s])) - 90; if (af < -60 || af > 38) bad.push(`cheville${s} hors amplitude (${af.toFixed(0)}°)`); }
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
