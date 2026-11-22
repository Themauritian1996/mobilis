/**
 * Segmentation en cycles (foulées), phases de Perry, rejet des cycles aberrants et normalisation 0–100 % (101 points).
 *
 * Phases (Perry J, Burnfield JM, *Gait Analysis*, 2010 — `perry2010` ; pourcentages de `norms.json > phases`,
 * réf. `aapmr_normal_gait`) : IC 0–2 %, LR 2–12 %, MSt 12–31 %, TSt 31–50 %, PSw 50–62 %, ISw 62–75 %, MSw 75–87 %,
 * TSw 87–100 %. Les limites sont recalées sur les événements mesurés : fin de LR = décollement controlatéral, fin de
 * TSt = contact controlatéral, fin de PSw = décollement homolatéral ; MSt/TSt et les tiers de l'oscillation sont
 * répartis selon les proportions normales.
 */
import { PHASES } from './data/norms.ts';
import { mad, median, resample } from './signal.ts';
import type { Track } from './preprocess.ts';
import type { GaitCycle, GaitEvent, PhaseWindow, Side } from './types.ts';

const pctOf = (start: number, end: number, f: number): number => ((f - start) / (end - start)) * 100;

/** Fenêtres des phases de Perry à partir des pourcentages d'événements (null = valeur normale). */
export function perryPhases(toPct: number | null, oppToPct: number | null, oppIcPct: number | null): PhaseWindow[] {
  const norm = (id: string, k: 'startPct' | 'endPct'): number => PHASES.find((p) => p.id === id)![k];
  const to = toPct ?? norm('PSw', 'endPct');
  const oto = oppToPct !== null && oppToPct < to ? oppToPct : norm('LR', 'endPct');
  const oic = oppIcPct !== null && oppIcPct > oto && oppIcPct < to ? oppIcPct : Math.min(norm('TSt', 'endPct'), to);
  const ic = Math.min(norm('IC', 'endPct'), oto);
  const mstEnd = oto + (oic - oto) * ((31 - 12) / (50 - 12));
  const sw = 100 - to;
  return [
    { id: 'IC', startPct: 0, endPct: ic },
    { id: 'LR', startPct: ic, endPct: oto },
    { id: 'MSt', startPct: oto, endPct: mstEnd },
    { id: 'TSt', startPct: mstEnd, endPct: oic },
    { id: 'PSw', startPct: oic, endPct: to },
    { id: 'ISw', startPct: to, endPct: to + (sw * 13) / 38 },
    { id: 'MSw', startPct: to + (sw * 13) / 38, endPct: to + (sw * 25) / 38 },
    { id: 'TSw', startPct: to + (sw * 25) / 38, endPct: 100 },
  ];
}

export function segmentCycles(track: Track, events: readonly GaitEvent[]): GaitCycle[] {
  const cycles: GaitCycle[] = [];
  for (const side of ['L', 'R'] as const) {
    const opp: Side = side === 'L' ? 'R' : 'L';
    const ics = events.filter((e) => e.type === 'IC' && e.side === side);
    for (let k = 0; k + 1 < ics.length; k++) {
      const a = ics[k]!.frame;
      const b = ics[k + 1]!.frame;
      const within = (type: 'IC' | 'TO', s: Side): number | null =>
        events.find((e) => e.type === type && e.side === s && e.frame > a && e.frame < b)?.frame ?? null;
      const to = within('TO', side);
      const oto = within('TO', opp);
      const oic = within('IC', opp);
      const ta = track.t[a]!;
      const tb = track.t[b]!;
      const p = (f: number | null): number | null => (f === null ? null : pctOf(ta, tb, track.t[f]!));
      let filledCount = 0;
      for (let i = a; i <= b; i++) if (!track.usable[i] || track.filled.some((row) => row[i])) filledCount++;
      cycles.push({
        side,
        startFrame: a,
        endFrame: b,
        startT: ta,
        endT: tb,
        toFrame: to,
        oppositeToFrame: oto,
        oppositeIcFrame: oic,
        phases: perryPhases(p(to), p(oto), p(oic)),
        stancePct: p(to),
        interpolatedFraction: filledCount / (b - a + 1),
        rejected: false,
      });
    }
  }
  return rejectOutliers(cycles);
}

/**
 * Rejet des cycles aberrants : durée hors médiane ± max(3 × 1,4826 × MAD, 15 %), appui hors 40–85 % du cycle,
 * décollement non détecté, > 30 % de trames reconstruites. Seuils de conception (proposed_heuristic).
 */
export function rejectOutliers(cycles: readonly GaitCycle[]): GaitCycle[] {
  return cycles.map((c) => {
    const same = cycles.filter((o) => o.side === c.side);
    const durs = same.map((o) => o.endT - o.startT);
    const med = median(durs);
    const tol = Math.max(3 * 1.4826 * mad(durs), 0.15 * med);
    const d = c.endT - c.startT;
    let reason: string | undefined;
    if (Math.abs(d - med) > tol) reason = 'durée aberrante';
    else if (c.toFrame === null) reason = 'décollement des orteils non détecté';
    else if (c.stancePct !== null && (c.stancePct < 40 || c.stancePct > 85)) reason = 'proportion d’appui aberrante';
    else if (c.interpolatedFraction > 0.3) reason = 'trop de trames reconstruites';
    return reason ? { ...c, rejected: true, rejectReason: reason } : c;
  });
}

/** Normalise une série (indexée par trame) sur un cycle : 101 points de 0 à 100 %. */
export function normalizeCycle(track: Track, series: readonly number[], c: GaitCycle, points = 101): number[] {
  const t = track.t.slice(c.startFrame, c.endFrame + 1);
  const x = series.slice(c.startFrame, c.endFrame + 1);
  return resample(t, x, c.startT, c.endT, points);
}

/** Fenêtre d'une phase dans un cycle. */
export function phaseWindow(c: GaitCycle, id: PhaseWindow['id']): PhaseWindow {
  return c.phases.find((p) => p.id === id)!;
}
