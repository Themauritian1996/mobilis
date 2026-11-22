/**
 * Métriques (spec v2 §4.4) à partir des cycles valides : spatio-temporelles calibrées, angles sagittaux aux phases clés,
 * courbes moyennes ± ET, mesures frontales/postérieures (estimations). Chaque métrique porte une cote de confiance 0–1 et
 * `estimate: true` quand aucune validation 2D n'est publiée.
 */
import { normalizeCycle, phaseWindow } from './cycles.ts';
import { normFor } from './data/norms.ts';
import { isSagittal, nearSide } from './events.ts';
import { idx, LM } from './landmarks.ts';
import type { Track } from './preprocess.ts';
import { derivative, mean, sd } from './signal.ts';
import type {
  CycleCurve,
  GaitCycle,
  GaitEvent,
  GaitMetric,
  GaitPatientInput,
  GaitView,
  NormComparison,
  ScaleEstimate,
  Side,
} from './types.ts';
import type { FrontalAngles, SagittalAngles } from './kinematics.ts';

export const OTHER: Record<Side, Side> = { L: 'R', R: 'L' };

export interface MetricContext {
  readonly track: Track;
  readonly view: GaitView;
  readonly patient: GaitPatientInput;
  readonly scale: ScaleEstimate;
  readonly direction: 1 | -1 | 0;
  readonly events: readonly GaitEvent[];
  readonly cycles: readonly GaitCycle[];
  readonly sagittal?: { L: SagittalAngles; R: SagittalAngles };
  readonly frontal?: FrontalAngles;
  /** Obliquité pelvienne et tronc en station debout (offsets frontaux). */
  readonly frontalOffsets?: { obliquity: number; trunk: number; fppa: { L: number; R: number }; heel: { L: number; R: number } };
}

/** Comparaison à la norme : z si l'ET est publiée, sinon % de la moyenne. */
export function compareToNorm(metricId: string, value: number | null, patient: GaitPatientInput): NormComparison | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  const n = normFor(metricId, patient);
  if (!n) return undefined;
  return {
    normId: n.normId,
    mean: n.mean,
    sd: n.sd,
    unit: n.unit,
    z: n.sd ? (value - n.mean) / n.sd : null,
    pctOfMean: (value / n.mean) * 100,
    ref: n.ref,
    status: n.status,
    population: n.population,
  };
}

function valid(ctx: MetricContext, side?: Side): GaitCycle[] {
  return ctx.cycles.filter((c) => !c.rejected && (side === undefined || c.side === side));
}

/** Confiance de base d'un côté : vue, visibilité moyenne des repères du membre, nombre de cycles. */
function sideConfidence(ctx: MetricContext, side: Side, n: number): number {
  const near = nearSide(ctx.view);
  const viewF = near === null ? 0.6 : side === near ? 1 : 0.7;
  const ks = (['hip', 'knee', 'ankle', 'heel', 'toe'] as const).map((j) => idx(side, j));
  let s = 0;
  let c = 0;
  for (const k of ks)
    for (const v of ctx.track.vis[k]!) {
      s += v;
      c++;
    }
  const vis = c ? s / c : 0;
  const cyc = Math.min(1, n / 3);
  return Math.max(0, Math.min(1, viewF * vis * cyc));
}

function metric(
  ctx: MetricContext,
  id: string,
  values: readonly number[],
  unit: string,
  opts: { side?: Side; estimate?: boolean; conf?: number; warning?: string; normId?: string } = {},
): GaitMetric {
  const v = values.filter((x) => Number.isFinite(x));
  const value = v.length ? mean(v) : null;
  const base = opts.side ? sideConfidence(ctx, opts.side, v.length) : Math.min(1, v.length / 3) * 0.8;
  const confidence = Math.max(0, Math.min(1, (opts.conf ?? 1) * base * (opts.estimate ? 0.6 : 1)));
  const norm = compareToNorm(opts.normId ?? id, value, ctx.patient);
  return {
    id,
    ...(opts.side ? { side: opts.side } : {}),
    value,
    ...(v.length > 1 ? { sd: sd(v) } : {}),
    unit,
    view: ctx.view,
    confidence,
    estimate: opts.estimate ?? false,
    n: v.length,
    ...(norm ? { norm } : {}),
    ...(opts.warning ? { warning: opts.warning } : {}),
  };
}

const at = (curve: readonly number[], pct: number): number => curve[Math.max(0, Math.min(100, Math.round(pct)))]!;
const slice = (curve: readonly number[], a: number, b: number): number[] =>
  curve.slice(Math.max(0, Math.round(a)), Math.min(101, Math.round(b) + 1));
const maxOf = (x: number[]): number => (x.length ? Math.max(...x) : NaN);
const minOf = (x: number[]): number => (x.length ? Math.min(...x) : NaN);

/** Symétrie : |G − D| / moyenne(G, D) × 100. */
export function symmetryIndex(l: number | null, r: number | null): number | null {
  if (l === null || r === null || !Number.isFinite(l) || !Number.isFinite(r)) return null;
  const m = (Math.abs(l) + Math.abs(r)) / 2;
  return m ? (Math.abs(l - r) / m) * 100 : 0;
}

function addSymmetry(ctx: MetricContext, out: GaitMetric[], baseId: string): void {
  const l = out.find((m) => m.id === baseId && m.side === 'L');
  const r = out.find((m) => m.id === baseId && m.side === 'R');
  if (!l || !r) return;
  const si = symmetryIndex(l.value, r.value);
  out.push({
    id: `symmetry_index_${baseId}`,
    value: si,
    unit: '%',
    view: ctx.view,
    confidence: Math.min(l.confidence, r.confidence),
    estimate: l.estimate || r.estimate,
  });
}

// ------------------------------------------------------------------------------------------------ Spatio-temporel

export function spatiotemporal(ctx: MetricContext): GaitMetric[] {
  const { track } = ctx;
  const out: GaitMetric[] = [];
  const sag = isSagittal(ctx.view);
  const d = ctx.direction || 1;
  const scaleAt = (i: number): number => ctx.scale.series[i] ?? ctx.scale.metersPerUnit;
  const tempConf = sag ? 1 : 0.6;
  for (const side of ['L', 'R'] as const) {
    const cyc = valid(ctx, side);
    const strideT = cyc.map((c) => c.endT - c.startT);
    out.push(metric(ctx, 'stride_time', strideT, 's', { side, conf: tempConf, estimate: !sag }));
    const stance = cyc.map((c) => c.stancePct ?? NaN);
    out.push(metric(ctx, 'stance_pct', stance, '%', { side, conf: tempConf, estimate: !sag }));
    out.push(metric(ctx, 'swing_pct', stance.map((s) => 100 - s), '%', { side, conf: tempConf, estimate: !sag }));
    const pct = (c: GaitCycle, f: number | null): number =>
      f === null ? NaN : ((track.t[f]! - c.startT) / (c.endT - c.startT)) * 100;
    out.push(
      metric(
        ctx,
        'double_support_pct',
        cyc.map((c) => pct(c, c.oppositeToFrame) + ((c.stancePct ?? NaN) - pct(c, c.oppositeIcFrame))),
        '%',
        { side, conf: tempConf, estimate: !sag },
      ),
    );
    out.push(
      metric(
        ctx,
        'single_support_pct',
        cyc.map((c) => pct(c, c.oppositeIcFrame) - pct(c, c.oppositeToFrame)),
        '%',
        { side, conf: tempConf, estimate: !sag },
      ),
    );
    out.push(
      metric(
        ctx,
        'single_support_time',
        cyc.map((c) =>
          c.oppositeIcFrame !== null && c.oppositeToFrame !== null
            ? track.t[c.oppositeIcFrame]! - track.t[c.oppositeToFrame]!
            : NaN,
        ),
        's',
        { side, conf: tempConf, estimate: !sag },
      ),
    );
    out.push(
      metric(
        ctx,
        'stance_time',
        cyc.map((c) => (c.toFrame === null ? NaN : track.t[c.toFrame]! - c.startT)),
        's',
        { side, conf: tempConf, estimate: !sag },
      ),
    );
    // Temps de pas : contact controlatéral → contact de ce côté.
    const ics = ctx.events.filter((e) => e.type === 'IC');
    const stepT: number[] = [];
    const stepL: number[] = [];
    for (const c of valid(ctx)) {
      if (c.side !== side) continue;
      for (const f of [c.startFrame, c.endFrame]) {
        const prev = [...ics].reverse().find((e) => e.side === OTHER[side] && e.frame < f);
        if (prev && !stepT.includes(track.t[f]! - prev.t)) stepT.push(track.t[f]! - prev.t);
      }
    }
    out.push(metric(ctx, 'step_time', stepT, 's', { side, conf: tempConf, estimate: !sag }));
    if (sag) {
      // Longueur de pas : distance horizontale talon–talon au contact initial de ce côté.
      const seen = new Set<number>();
      for (const c of cyc)
        for (const f of [c.startFrame, c.endFrame]) {
          if (seen.has(f)) continue;
          seen.add(f);
          const dx = d * (track.X[idx(side, 'heel')]![f]! - track.X[idx(OTHER[side], 'heel')]![f]!);
          stepL.push(dx * scaleAt(f));
        }
      out.push(
        metric(ctx, 'step_length', stepL, 'm', {
          side,
          conf: ctx.scale.confidence,
          warning: 'Calibrée par la taille ; erreur 2D ≈ 4,9 cm par pas (stenum2021).',
        }),
      );
      const strideL = cyc.map((c) => {
        const k = idx(side, 'heel');
        return d * (track.X[k]![c.endFrame]! - track.X[k]![c.startFrame]!) * scaleAt(c.startFrame);
      });
      out.push(metric(ctx, 'stride_length', strideL, 'm', { side, conf: ctx.scale.confidence }));
      out.push(
        metric(
          ctx,
          'step_length_height_ratio',
          stepL.map((x) => x / (ctx.patient.heightCm / 100)),
          'ratio',
          { side, conf: ctx.scale.confidence, warning: 'Descriptif : aucune norme vérifiée (norms.json).' },
        ),
      );
      // Variabilité (ataxie, stolze2002) : coefficient de variation.
      out.push(metric(ctx, 'step_length_cv', stepL.length > 2 ? [(sd(stepL) / mean(stepL)) * 100] : [], '%', { side }));
    }
    out.push(metric(ctx, 'step_time_cv', stepT.length > 2 ? [(sd(stepT) / mean(stepT)) * 100] : [], '%', { side }));
  }
  // Cadence et vitesse (globales).
  const allStride = valid(ctx).map((c) => c.endT - c.startT);
  const cad = allStride.map((s) => 120 / s);
  out.push(metric(ctx, 'cadence', cad, 'pas/min', { conf: tempConf, estimate: !sag }));
  if (sag) {
    const speeds = valid(ctx).map((c) => {
      const k1 = idx(c.side, 'heel');
      return (d * (track.X[k1]![c.endFrame]! - track.X[k1]![c.startFrame]!) * scaleAt(c.startFrame)) / (c.endT - c.startT);
    });
    out.push(
      metric(ctx, 'gait_speed', speeds, 'm/s', {
        conf: ctx.scale.confidence,
        warning: 'Erreur 2D < 0,10 m/s si l’échelle est correcte (stenum2021) ; l’erreur d’échelle s’ajoute.',
      }),
    );
  }
  for (const id of ['step_length', 'step_time', 'stance_time', 'stance_pct', 'single_support_time', 'stride_time'])
    addSymmetry(ctx, out, id);
  return out;
}

// ------------------------------------------------------------------------------------------------ Sagittal

type JointCurveId = 'hip' | 'knee' | 'ankle' | 'trunk' | 'foot';

export function sagittalCurves(ctx: MetricContext): CycleCurve[] {
  if (!ctx.sagittal) return [];
  const out: CycleCurve[] = [];
  for (const side of ['L', 'R'] as const) {
    const cyc = valid(ctx, side);
    if (!cyc.length) continue;
    for (const j of ['hip', 'knee', 'ankle', 'trunk'] as const) {
      const curves = cyc.map((c) => normalizeCycle(ctx.track, ctx.sagittal![side][j], c));
      out.push(meanCurve(`${j}_angle`, side, '°', curves));
    }
  }
  return out;
}

export function meanCurve(id: string, side: Side, unit: string, curves: readonly number[][]): CycleCurve {
  const m: number[] = [];
  const s: number[] = [];
  for (let k = 0; k < 101; k++) {
    const col = curves.map((c) => c[k]!);
    m.push(mean(col));
    s.push(sd(col));
  }
  return { id, side, unit, mean: m, sd: s, n: curves.length };
}

export function sagittalMetrics(ctx: MetricContext): GaitMetric[] {
  if (!ctx.sagittal) return [];
  const out: GaitMetric[] = [];
  const { track } = ctx;
  for (const side of ['L', 'R'] as const) {
    const cyc = valid(ctx, side);
    const ang = ctx.sagittal[side];
    const per = (j: JointCurveId, f: (curve: number[], c: GaitCycle) => number): number[] =>
      cyc.map((c) => f(normalizeCycle(track, ang[j], c), c));
    const ph = (c: GaitCycle, id: Parameters<typeof phaseWindow>[1]) => phaseWindow(c, id);
    const to = (c: GaitCycle): number => c.stancePct ?? 62;
    const add = (id: string, vals: number[], unit = '°', normId?: string): void => {
      out.push(metric(ctx, id, vals, unit, { side, ...(normId ? { normId } : {}) }));
    };
    // Cheville.
    add('ankle_ic', per('ankle', (cv) => at(cv, 0)));
    add('ankle_lr_min', per('ankle', (cv, c) => minOf(slice(cv, 0, ph(c, 'LR').endPct + 2))));
    add('ankle_msw', per('ankle', (cv, c) => mean(slice(cv, ph(c, 'MSw').startPct, ph(c, 'MSw').endPct))));
    add('peak_ankle_dorsiflexion_stance', per('ankle', (cv, c) => maxOf(slice(cv, 0, to(c)))));
    add('ankle_mst', per('ankle', (cv, c) => mean(slice(cv, ph(c, 'MSt').startPct, ph(c, 'MSt').endPct))));
    add('ankle_pf_preswing', per('ankle', (cv, c) => minOf(slice(cv, ph(c, 'PSw').startPct, ph(c, 'ISw').endPct))));
    // Genou.
    add('knee_ic', per('knee', (cv) => at(cv, 0)));
    add(
      'knee_flexion_loading',
      per('knee', (cv, c) => maxOf(slice(cv, 0, ph(c, 'MSt').endPct))),
      '°',
      'knee_flexion_loading',
    );
    add('knee_min_stance', per('knee', (cv, c) => minOf(slice(cv, ph(c, 'LR').endPct, ph(c, 'TSt').endPct))));
    add('knee_at_toe_off', per('knee', (cv, c) => at(cv, to(c))));
    add('peak_knee_flexion_swing', per('knee', (cv, c) => maxOf(slice(cv, to(c) - 5, 100))), '°', 'peak_knee_flexion_swing');
    add(
      'time_to_peak_knee_flexion',
      per('knee', (cv, c) => {
        const s = slice(cv, to(c) - 5, 100);
        return Math.round(to(c) - 5) + s.indexOf(Math.max(...s));
      }),
      '%',
    );
    // Hanche.
    add('hip_ic', per('hip', (cv) => at(cv, 0)));
    add('peak_hip_extension', per('hip', (cv, c) => minOf(slice(cv, 0, to(c)))));
    add('peak_hip_flexion_swing', per('hip', (cv, c) => maxOf(slice(cv, to(c), 100))));
    add('hip_rom', per('hip', (cv) => maxOf(cv) - minOf(cv)), '°', 'hip_rom');
    add('trunk_inclination', per('trunk', (cv) => mean(cv)));

    // Décollement du talon (% du cycle) : talon > 2 % de la taille au-dessus de son niveau d'appui.
    const hk = idx(side, 'heel');
    const H = ctx.patient.heightCm / 100;
    const heelRise = cyc.map((c) => {
      const scale = ctx.scale.series[c.startFrame] ?? ctx.scale.metersPerUnit;
      const ff = c.startFrame + Math.round((c.endFrame - c.startFrame) * 0.1);
      const ground = Math.max(...track.Y[hk]!.slice(c.startFrame, ff + 1));
      const end = c.toFrame ?? c.endFrame;
      for (let i = ff; i <= end; i++)
        if ((ground - track.Y[hk]![i]!) * scale > 0.02 * H)
          return ((track.t[i]! - c.startT) / (c.endT - c.startT)) * 100;
      return NaN;
    });
    add('heel_rise_pct', heelRise, '%');
    // Pied à plat : premier instant après le contact où |angle du pied| < 5° (% du cycle).
    const footFlat = per('foot', (cv) => {
      for (let k = 0; k < 40; k++) if (Math.abs(cv[k]!) < 5) return k;
      return NaN;
    });
    add('foot_flat_pct', footFlat, '%');
    // Vitesse angulaire maximale de flexion plantaire en réponse à la charge (°/s).
    const dt = 1 / track.fps;
    const vel = derivative(ang.ankle, dt);
    add(
      'ankle_pf_velocity_lr',
      cyc.map((c) => {
        const endF = c.oppositeToFrame ?? c.startFrame + Math.round((c.endFrame - c.startFrame) * 0.12);
        return -Math.min(...vel.slice(c.startFrame, endF + 1));
      }),
      '°/s',
    );
    // Vitesse angulaire d'extension du genou en oscillation terminale (°/s) : impact en fin d'oscillation.
    const kv = derivative(ang.knee, dt);
    add(
      'knee_extension_velocity_tsw',
      cyc.map((c) => {
        const a = c.startFrame + Math.round(((c.endFrame - c.startFrame) * phaseWindow(c, 'MSw').startPct) / 100);
        return -Math.min(...kv.slice(a, c.endFrame + 1));
      }),
      '°/s',
    );
  }
  for (const id of ['peak_knee_flexion_swing', 'knee_flexion_loading', 'peak_hip_extension', 'heel_rise_pct'])
    addSymmetry(ctx, out, id);
  return out;
}

// ------------------------------------------------------------------------------------------------ Frontal / postérieur

export function frontalMetrics(ctx: MetricContext): GaitMetric[] {
  const f = ctx.frontal;
  const off = ctx.frontalOffsets;
  if (!f || !off) return [];
  const { track } = ctx;
  const out: GaitMetric[] = [];
  const scaleAt = (i: number): number => ctx.scale.series[i] ?? ctx.scale.metersPerUnit;
  const est = { estimate: true as const };
  const frameAt = (c: GaitCycle, pct: number): number =>
    c.startFrame + Math.round(((c.endFrame - c.startFrame) * pct) / 100);
  const range = (c: GaitCycle, a: number, b: number): number[] => {
    const r: number[] = [];
    for (let i = frameAt(c, a); i <= frameAt(c, b); i++) r.push(i);
    return r;
  };
  for (const side of ['L', 'R'] as const) {
    const cyc = valid(ctx, side);
    const sgn = side === 'L' ? -1 : 1; // obliquityRLow > 0 ⇒ hanche droite basse : chute controlatérale si appui G.
    const oblContra = (i: number): number => -sgn * (f.obliquityRLow[i]! - off.obliquity);
    // Chute pelvienne controlatérale en appui (pic, simple appui).
    out.push(
      metric(
        ctx,
        'contralateral_pelvic_drop',
        cyc.map((c) => maxOf(range(c, phaseWindow(c, 'LR').startPct, phaseWindow(c, 'TSt').endPct).map(oblContra))),
        '°',
        { side, ...est, warning: 'Estimation : aucune validation 2D ni norme de marche vérifiée (to_verify).' },
      ),
    );
    // Obliquité en oscillation moyenne : négatif = hémibassin oscillant plus haut (hip hiking).
    out.push(
      metric(
        ctx,
        'pelvic_obliquity_swing',
        cyc.map((c) =>
          minOf(range(c, phaseWindow(c, 'ISw').startPct, phaseWindow(c, 'MSw').endPct).map((i) => -oblContra(i))),
        ),
        '°',
        { side, ...est },
      ),
    );
    // Inclinaison latérale du tronc vers le côté d'appui.
    const leanToward = (i: number): number => (side === 'L' ? 1 : -1) * (f.trunkLeanLeft[i]! - off.trunk);
    out.push(
      metric(
        ctx,
        'trunk_lateral_lean_toward_stance',
        cyc.map((c) => maxOf(range(c, phaseWindow(c, 'LR').startPct, phaseWindow(c, 'TSt').endPct).map(leanToward))),
        '°',
        { side, ...est },
      ),
    );
    // FPPA : pic de valgus en LR–MSt et variation depuis le contact.
    const fp = (i: number): number => f.fppa[side][i]! - off.fppa[side];
    out.push(
      metric(
        ctx,
        'fppa_peak_stance',
        cyc.map((c) => {
          const w = range(c, 0, phaseWindow(c, 'MSt').endPct).map(fp);
          const mx = maxOf(w);
          const mn = minOf(w);
          return Math.abs(mx) >= Math.abs(mn) ? mx : mn;
        }),
        '°',
        { side, ...est, warning: 'FPPA validé surtout au squat unipodal (willson2008) : estimation à la marche.' },
      ),
    );
    if (ctx.view === 'posterior')
      out.push(
        metric(
          ctx,
          'heel_alignment_stance',
          cyc.map((c) => mean(range(c, phaseWindow(c, 'LR').endPct, phaseWindow(c, 'MSt').endPct).map((i) => f.heel[side][i]! - off.heel[side]))),
          '°',
          { side, ...est, conf: 0.4, warning: 'Alignement du talon : estimation grossière (2 repères MediaPipe).' },
        ),
      );
    // Déplacement latéral du pied en oscillation (circumduction) : écart vers l'extérieur de la cheville par rapport au
    // bassin, en oscillation moyenne, comparé à sa position aux contacts initiaux qui encadrent le cycle (m).
    const outward = side === 'L' ? 1 : -1;
    const latRel = (i: number): number => outward * (f.ankleLat[side][i]! - f.pelvisLat[i]!) * scaleAt(i);
    out.push(
      metric(
        ctx,
        'foot_lateral_excursion_swing',
        cyc.map((c) => {
          const base = (latRel(c.startFrame) + latRel(c.endFrame)) / 2;
          return maxOf(range(c, phaseWindow(c, 'ISw').startPct, phaseWindow(c, 'TSw').startPct).map(latRel)) - base;
        }),
        'm',
        { side, ...est },
      ),
    );
    // Largeur de base au contact initial (m).
    out.push(
      metric(
        ctx,
        'step_width',
        cyc.map((c) => Math.abs(f.heelLat.L[c.startFrame]! - f.heelLat.R[c.startFrame]!) * scaleAt(c.startFrame)),
        'm',
        { side, ...est },
      ),
    );
  }
  // Largeur de base globale.
  const sw = out.filter((m) => m.id === 'step_width' && m.value !== null).map((m) => m.value!);
  if (sw.length)
    out.push(
      metric(ctx, 'step_width_mean', [mean(sw)], 'm', { estimate: true, normId: 'step_width', conf: 0.8 }),
    );
  // Déplacement latéral du bassin (crête à crête par foulée, m).
  const pel = valid(ctx, 'L').map((c) => {
    const vals: number[] = [];
    for (let i = c.startFrame; i <= c.endFrame; i++) vals.push(f.pelvisLat[i]! * scaleAt(i));
    // Retrait de la dérive linéaire (perspective, trajectoire non centrée).
    const n = vals.length;
    const a = vals[0]!;
    const b = vals[n - 1]!;
    const det = vals.map((v, k) => v - (a + ((b - a) * k) / Math.max(1, n - 1)));
    return maxOf(det) - minOf(det);
  });
  out.push(metric(ctx, 'lateral_pelvic_displacement', pel, 'm', { estimate: true, conf: 0.7 }));
  for (const id of ['contralateral_pelvic_drop', 'trunk_lateral_lean_toward_stance', 'foot_lateral_excursion_swing'])
    addSymmetry(ctx, out, id);
  // Rotation pelvienne transverse : uniquement avec les repères « monde » (profondeur z MediaPipe, peu fiable).
  void LM;
  return out;
}
