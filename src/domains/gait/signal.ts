/**
 * Traitement du signal pur : filtre de Butterworth passe-bas du 2e ordre appliqué aller-retour (phase nulle, ordre
 * effectif 4), interpolation des trous, statistiques et rééchantillonnage.
 *
 * Fréquence de coupure par défaut : 6 Hz, valeur usuelle pour la cinématique de la marche (Winter DA, *Biomechanics and
 * Motor Control of Human Movement*, 4e éd., 2009, ch. 3 — `winter2009`). Le passage aller-retour décale la coupure
 * effective : on corrige la fréquence par le facteur 1 / (√2 − 1)^(1/4) ≈ 1,247 (Winter 2009) pour garder −3 dB à `fc`.
 */

export interface BiquadCoefficients {
  readonly b: readonly [number, number, number];
  readonly a: readonly [number, number, number];
}

/** Coefficients d'un Butterworth passe-bas du 2e ordre (transformation bilinéaire avec pré-distorsion). */
export function butterworthLowPass(cutoffHz: number, sampleHz: number): BiquadCoefficients {
  const fc = Math.min(cutoffHz, sampleHz * 0.45);
  const wc = Math.tan((Math.PI * fc) / sampleHz);
  const k1 = Math.SQRT2 * wc;
  const k2 = wc * wc;
  const a0 = 1 + k1 + k2;
  const b0 = k2 / a0;
  return {
    b: [b0, 2 * b0, b0],
    a: [1, (2 * (k2 - 1)) / a0, (1 - k1 + k2) / a0],
  };
}

function lfilter(c: BiquadCoefficients, x: readonly number[]): number[] {
  const [b0, b1, b2] = c.b;
  const [, a1, a2] = c.a;
  const y = new Array<number>(x.length);
  // Conditions initiales en régime permanent pour la première valeur (réduit le transitoire).
  const x0 = x[0] ?? 0;
  let x1 = x0;
  let x2 = x0;
  let y1 = x0;
  let y2 = x0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return y;
}

/** Filtrage aller-retour (phase nulle) d'une série finie, avec prolongement par réflexion impaire aux bords. */
export function filtfilt(c: BiquadCoefficients, x: readonly number[]): number[] {
  const n = x.length;
  if (n < 4) return [...x];
  const pad = Math.min(n - 1, 3 * 6);
  const first = x[0]!;
  const last = x[n - 1]!;
  const ext: number[] = [];
  for (let i = pad; i >= 1; i--) ext.push(2 * first - x[i]!);
  ext.push(...x);
  for (let i = n - 2; i >= n - 1 - pad; i--) ext.push(2 * last - x[i]!);
  const fwd = lfilter(c, ext);
  const back = lfilter(c, fwd.reverse()).reverse();
  return back.slice(pad, pad + n);
}

/**
 * Filtre passe-bas de Butterworth aller-retour sur une série pouvant contenir des NaN : chaque segment fini contigu
 * est filtré séparément, les NaN sont conservés.
 */
export function lowPass(x: readonly number[], cutoffHz: number, sampleHz: number): number[] {
  // Correction de la coupure pour le double passage (Winter 2009).
  const corrected = cutoffHz / 0.802;
  const c = butterworthLowPass(Math.min(corrected, sampleHz * 0.45), sampleHz);
  const out = [...x];
  let i = 0;
  while (i < x.length) {
    if (!Number.isFinite(x[i]!)) {
      i++;
      continue;
    }
    let j = i;
    while (j < x.length && Number.isFinite(x[j]!)) j++;
    const seg = filtfilt(c, x.slice(i, j));
    for (let k = 0; k < seg.length; k++) out[i + k] = seg[k]!;
    i = j;
  }
  return out;
}

/**
 * Interpolation linéaire des trous (NaN) d'au plus `maxGap` échantillons. Renvoie la série et un masque des
 * échantillons reconstruits. Les trous plus longs et les bords restent NaN.
 */
export function interpolateGaps(x: readonly number[], maxGap: number): { values: number[]; filled: boolean[] } {
  const values = [...x];
  const filled = x.map(() => false);
  let i = 0;
  while (i < x.length) {
    if (Number.isFinite(x[i]!)) {
      i++;
      continue;
    }
    let j = i;
    while (j < x.length && !Number.isFinite(x[j]!)) j++;
    const gap = j - i;
    if (i > 0 && j < x.length && gap <= maxGap) {
      const a = x[i - 1]!;
      const b = x[j]!;
      for (let k = i; k < j; k++) {
        const f = (k - i + 1) / (gap + 1);
        values[k] = a + (b - a) * f;
        filled[k] = true;
      }
    }
    i = j;
  }
  return { values, filled };
}

export function mean(x: readonly number[]): number {
  let s = 0;
  let n = 0;
  for (const v of x)
    if (Number.isFinite(v)) {
      s += v;
      n++;
    }
  return n ? s / n : NaN;
}

/** Écart-type d'échantillon (n − 1). */
export function sd(x: readonly number[]): number {
  const m = mean(x);
  let s = 0;
  let n = 0;
  for (const v of x)
    if (Number.isFinite(v)) {
      s += (v - m) ** 2;
      n++;
    }
  return n > 1 ? Math.sqrt(s / (n - 1)) : 0;
}

export function median(x: readonly number[]): number {
  const v = x.filter((e) => Number.isFinite(e)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** Écart absolu médian (MAD), non normalisé. */
export function mad(x: readonly number[]): number {
  const m = median(x);
  return median(x.map((v) => Math.abs(v - m)));
}

/** Dérivée par différences centrées (unités par seconde) ; `dt` en secondes. */
export function derivative(x: readonly number[], dt: number): number[] {
  const n = x.length;
  return x.map((_, i) => {
    if (n < 2) return 0;
    const a = x[Math.max(0, i - 1)]!;
    const b = x[Math.min(n - 1, i + 1)]!;
    const span = Math.min(n - 1, i + 1) - Math.max(0, i - 1);
    return (b - a) / (span * dt);
  });
}

/** Rééchantillonne `x` (temps `t`) sur `points` instants également répartis entre t0 et t1 (interpolation linéaire). */
export function resample(t: readonly number[], x: readonly number[], t0: number, t1: number, points = 101): number[] {
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < points; k++) {
    const tk = t0 + ((t1 - t0) * k) / (points - 1);
    while (j < t.length - 2 && t[j + 1]! < tk) j++;
    const ta = t[j]!;
    const tb = t[j + 1] ?? ta;
    const xa = x[j]!;
    const xb = x[j + 1] ?? xa;
    const f = tb > ta ? Math.min(1, Math.max(0, (tk - ta) / (tb - ta))) : 0;
    out.push(xa + (xb - xa) * f);
  }
  return out;
}

/**
 * Indices des extremums locaux (maximums si `kind = 'max'`) séparés d'au moins `minDistance` échantillons et
 * dont la proéminence dépasse `minProminence`. Les plateaux renvoient leur premier indice.
 */
export function findPeaks(
  x: readonly number[],
  kind: 'max' | 'min',
  minDistance: number,
  minProminence: number,
): number[] {
  const s = kind === 'max' ? x : x.map((v) => -v);
  const cands: number[] = [];
  for (let i = 1; i < s.length - 1; i++) {
    const v = s[i]!;
    if (!Number.isFinite(v)) continue;
    const p = s[i - 1]!;
    if (!Number.isFinite(p) || v <= p) continue;
    let j = i + 1;
    while (j < s.length && s[j] === v) j++;
    if (j >= s.length || !Number.isFinite(s[j]!) || s[j]! >= v) continue;
    // Proéminence : descente minimale de part et d'autre jusqu'à un point plus haut ou la fenêtre.
    const w = Math.max(minDistance, 3);
    let leftMin = v;
    for (let k = i - 1; k >= Math.max(0, i - 3 * w); k--) {
      const sk = s[k]!;
      if (!Number.isFinite(sk) || sk > v) break;
      leftMin = Math.min(leftMin, sk);
    }
    let rightMin = v;
    for (let k = j; k < Math.min(s.length, j + 3 * w); k++) {
      const sk = s[k]!;
      if (!Number.isFinite(sk) || sk > v) break;
      rightMin = Math.min(rightMin, sk);
    }
    if (v - Math.max(leftMin, rightMin) < minProminence) continue;
    cands.push(i);
  }
  // Suppression des pics trop proches : on garde le plus haut.
  const sorted = [...cands].sort((a, b) => s[b]! - s[a]!);
  const kept: number[] = [];
  for (const c of sorted) if (kept.every((k) => Math.abs(k - c) >= minDistance)) kept.push(c);
  return kept.sort((a, b) => a - b);
}

/** Angle (degrés) au sommet `b` formé par a-b-c, dans le plan de l'image. */
export function angle3(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!d) return NaN;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}

export const RAD2DEG = 180 / Math.PI;
