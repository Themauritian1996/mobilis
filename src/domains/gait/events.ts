/**
 * Détection des événements de la marche.
 *
 * Vue latérale — méthode de Zeni JA Jr, Richards JG, Higginson JS (2008) « Two simple methods for determining gait
 * events during treadmill and overground walking using kinematic data », Gait & Posture 27(4):710-714 (`zeni2008`) :
 * contact initial (IC) = maximum de la position antéropostérieure du talon par rapport au bassin ; décollement des
 * orteils (TO) = minimum de la position de l'orteil par rapport au bassin. Le sens de marche est détecté par la vitesse
 * médiane du bassin (les allers-retours ne sont pas gérés : un seul sens par enregistrement).
 *
 * Vues frontale/postérieure — adaptation (non validée, confiance plus basse) : avec une caméra à hauteur de hanche, un
 * point au sol plus proche de la caméra apparaît plus bas dans l'image. La position verticale du talon par rapport au
 * bassin, normalisée par la taille apparente (longueur du tronc), joue donc le rôle de la position antéropostérieure :
 * IC = maximum (vue frontale) ou minimum (vue postérieure) ; TO = extremum opposé du signal de l'orteil.
 */
import { idx, LM } from './landmarks.ts';
import { mid, type Track } from './preprocess.ts';
import { derivative, findPeaks, median } from './signal.ts';
import type { GaitEvent, GaitView, Side } from './types.ts';

export interface EventDetection {
  readonly events: readonly GaitEvent[];
  readonly direction: 1 | -1 | 0;
  /** Durée de foulée estimée (s) par autocorrélation. */
  readonly stridePeriodS: number;
}

export function isSagittal(view: GaitView): boolean {
  return view === 'sagittal-left' || view === 'sagittal-right';
}

/** Membre le plus proche de la caméra en vue latérale. */
export function nearSide(view: GaitView): Side | null {
  if (view === 'sagittal-left') return 'L';
  if (view === 'sagittal-right') return 'R';
  return null;
}

/** Sens de marche (+1 vers les X croissants, −1 sinon) à partir de la vitesse médiane du bassin. */
export function walkingDirection(track: Track): 1 | -1 | 0 {
  const px = track.t.map((_, i) => mid(track, LM.leftHip, LM.rightHip, i).x);
  const v = derivative(px, 1 / track.fps).filter((e) => Number.isFinite(e));
  const moving = v.filter((e) => Math.abs(e) > 0.02);
  if (moving.length < v.length * 0.2) return 0;
  const m = median(moving);
  return m > 0 ? 1 : m < 0 ? -1 : 0;
}

/** Période dominante (en échantillons) d'un signal par autocorrélation, entre minLag et maxLag. */
export function dominantPeriod(x: readonly number[], minLag: number, maxLag: number): number {
  const v = x.map((e) => (Number.isFinite(e) ? e : NaN));
  const finite = v.filter((e) => Number.isFinite(e));
  const m = finite.reduce((a, b) => a + b, 0) / Math.max(1, finite.length);
  const c = v.map((e) => (Number.isFinite(e) ? e - m : 0));
  let best = minLag;
  let bestR = -Infinity;
  const r = (lag: number): number => {
    let s = 0;
    let n = 0;
    for (let i = 0; i + lag < c.length; i++) {
      s += c[i]! * c[i + lag]!;
      n++;
    }
    return n ? s / n : -Infinity;
  };
  const vals: number[] = [];
  for (let lag = minLag; lag <= Math.min(maxLag, c.length - 2); lag++) vals.push(r(lag));
  // Premier maximum local marqué (évite les multiples de la période).
  const globalMax = Math.max(...vals);
  for (let k = 1; k < vals.length - 1; k++) {
    if (vals[k]! >= vals[k - 1]! && vals[k]! >= vals[k + 1]! && vals[k]! > 0.6 * globalMax) {
      return minLag + k;
    }
  }
  vals.forEach((rv, k) => {
    if (rv > bestR) {
      bestR = rv;
      best = minLag + k;
    }
  });
  return best;
}

function range(x: readonly number[]): number {
  const v = x.filter((e) => Number.isFinite(e)).sort((a, b) => a - b);
  if (v.length < 2) return 0;
  return v[Math.floor(v.length * 0.95)]! - v[Math.floor(v.length * 0.05)]!;
}

function visibilityAt(track: Track, ks: number[], i: number): number {
  return ks.reduce((s, k) => s + (track.vis[k]![i] ?? 0), 0) / ks.length;
}

/** Signaux « type Zeni » (talon et orteil relatifs au bassin) pour un côté. */
export function eventSignals(track: Track, view: GaitView, side: Side, direction: 1 | -1 | 0): { heel: number[]; toe: number[] } {
  const n = track.t.length;
  const heel: number[] = [];
  const toe: number[] = [];
  const hk = idx(side, 'heel');
  const tk = idx(side, 'toe');
  for (let i = 0; i < n; i++) {
    const p = mid(track, LM.leftHip, LM.rightHip, i);
    if (isSagittal(view)) {
      const d = direction || 1;
      heel.push(d * (track.X[hk]![i]! - p.x));
      toe.push(d * (track.X[tk]![i]! - p.x));
    } else {
      const s = mid(track, LM.leftShoulder, LM.rightShoulder, i);
      const trunk = Math.hypot(s.x - p.x, s.y - p.y) || NaN;
      const sign = view === 'frontal' ? 1 : -1;
      heel.push((sign * (track.Y[hk]![i]! - p.y)) / trunk);
      toe.push((sign * (track.Y[tk]![i]! - p.y)) / trunk);
    }
  }
  return { heel, toe };
}

export function detectEvents(track: Track, view: GaitView): EventDetection {
  const direction = isSagittal(view) ? walkingDirection(track) : 0;
  const fps = track.fps;
  const sig = { L: eventSignals(track, view, 'L', direction), R: eventSignals(track, view, 'R', direction) };
  // Période de foulée : autocorrélation du signal talon (0,7–2,5 s).
  const periods = (['L', 'R'] as const).map((s) =>
    dominantPeriod(sig[s].heel, Math.round(0.7 * fps), Math.round(2.5 * fps)),
  );
  const period = median(periods);
  const minDist = Math.max(2, Math.round(period * 0.6));
  const events: GaitEvent[] = [];
  const near = nearSide(view);
  const viewFactor = (side: Side): number => (near === null ? 0.5 : side === near ? 0.9 : 0.65);
  for (const side of ['L', 'R'] as const) {
    const { heel, toe } = sig[side];
    const promH = range(heel) * 0.25;
    const promT = range(toe) * 0.25;
    // Vue postérieure : le pied en avant est plus loin → plus haut dans l'image ; le signe a déjà été inversé.
    const ics = findPeaks(heel, 'max', minDist, promH);
    const tos = findPeaks(toe, 'min', minDist, promT);
    for (const i of ics)
      events.push({
        type: 'IC',
        side,
        frame: i,
        t: track.t[i]!,
        confidence: viewFactor(side) * visibilityAt(track, [idx(side, 'heel'), idx(side, 'ankle')], i),
      });
    for (const i of tos)
      events.push({
        type: 'TO',
        side,
        frame: i,
        t: track.t[i]!,
        confidence: viewFactor(side) * visibilityAt(track, [idx(side, 'toe'), idx(side, 'ankle')], i),
      });
  }
  events.sort((a, b) => a.frame - b.frame);
  return { events, direction, stridePeriodS: period / fps };
}
