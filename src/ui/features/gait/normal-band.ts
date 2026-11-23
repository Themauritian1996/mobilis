/**
 * Bande normale INDICATIVE des courbes articulaires sagittales (hanche, genou, cheville) sur le cycle 0–100 %.
 *
 * Source : valeurs de manuel aux phases de Perry de `docs/gait-literature/norms.json > sagittalKinematics.byPhase`
 * (hanche = angle cuisse–verticale, Perry 2010 `perry2010`, plus `degheldere_normal_gait`, `physiopedia_gait_cycle`,
 * `aapmr_normal_gait` ; confiance « medium »). Ces valeurs sont des plages de manuel, PAS une moyenne ± ET de
 * cohorte : la bande est donc un repère visuel (statut `to_verify`), à ne jamais lire comme un seuil. Les courbes de
 * Oberg 1994 (moyenne ± ET) ne sont pas dans le fichier de normes. La station debout est le zéro, comme dans le moteur.
 *
 * Interpolation linéaire entre les centres des phases de Perry (positions : `PHASES` du moteur).
 */
import { PHASES } from '../../../domains/gait/index.ts';

export type BandJoint = 'hip' | 'knee' | 'ankle';

type Range = readonly [lo: number, hi: number];
type PhaseRanges = Readonly<Record<'IC' | 'LR' | 'MSt' | 'TSt' | 'PSw' | 'ISw' | 'MSw' | 'TSw', Range>>;

/** Plages (°) par phase de Perry, lues dans le champ `byPhase` de norms.json (voir l'en-tête). */
const RANGES: Readonly<Record<BandJoint, PhaseRanges>> = {
  hip: {
    IC: [15, 30], // « 20–30 (flexion) » ; 20° cuisse–verticale (Perry)
    LR: [15, 30], // « ≈ 20–30 »
    MSt: [-5, 15], // « → 0 (neutre) » : extension progressive
    TSt: [-20, 0], // « ≈ −10 (extension maximale) ; −20° apparent selon Perry »
    PSw: [-10, 10], // « retour vers 0 »
    ISw: [10, 25], // « flexion croissante (≈ 15–20) »
    MSw: [20, 35], // « ≈ 25–30 »
    TSw: [20, 35], // « ≈ 25–30 »
  },
  knee: {
    IC: [0, 8], // « 0–5 (quasi extension) »
    LR: [8, 22], // « 10–20 »
    MSt: [0, 12], // « extension progressive vers ≈ 5 »
    TSt: [0, 10], // « ≈ 0–5 »
    PSw: [25, 45], // « ≈ 35–40 »
    ISw: [45, 70], // « ≈ 60 (flexion maximale) »
    MSw: [15, 45], // « ≈ 25–30 » (to_verify dans le fichier)
    TSw: [0, 10], // « ≈ 0–5 »
  },
  ankle: {
    IC: [-5, 5], // « 0 (neutre) »
    LR: [-15, -3], // « ≈ −10 »
    MSt: [0, 10], // « ≈ +5 »
    TSt: [5, 15], // « ≈ +10 »
    PSw: [-25, -10], // « ≈ −20 »
    ISw: [-20, 0], // « de ≈ −20 vers 0 »
    MSw: [-5, 5], // « 0 »
    TSw: [-5, 5], // « 0 »
  },
};

export interface NormalBand {
  readonly joint: BandJoint;
  /** 101 points (0–100 % du cycle). */
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  /** Toujours `to_verify` : plages de manuel, pas une moyenne ± ET. */
  readonly status: 'to_verify';
  readonly ref: 'perry2010';
}

const bandCache = new Map<BandJoint, NormalBand>();

export function normalBand(joint: string): NormalBand | null {
  if (joint !== 'hip' && joint !== 'knee' && joint !== 'ankle') return null;
  const cached = bandCache.get(joint);
  if (cached) return cached;
  const anchors = PHASES.map((p) => ({
    pct: (p.startPct + p.endPct) / 2,
    range: RANGES[joint][p.id as keyof PhaseRanges],
  }));
  const at = (pct: number, k: 0 | 1): number => {
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    if (!first || !last) return 0;
    if (pct <= first.pct) return first.range[k];
    if (pct >= last.pct) return last.range[k];
    for (let i = 1; i < anchors.length; i++) {
      const b = anchors[i] as (typeof anchors)[number];
      const a = anchors[i - 1] as (typeof anchors)[number];
      if (pct <= b.pct) return a.range[k] + ((b.range[k] - a.range[k]) * (pct - a.pct)) / (b.pct - a.pct);
    }
    return last.range[k];
  };
  const lo: number[] = [];
  const hi: number[] = [];
  for (let p = 0; p <= 100; p++) {
    lo.push(Math.round(at(p, 0) * 10) / 10);
    hi.push(Math.round(at(p, 1) * 10) / 10);
  }
  const band: NormalBand = { joint, lo, hi, status: 'to_verify', ref: 'perry2010' };
  bandCache.set(joint, band);
  return band;
}
