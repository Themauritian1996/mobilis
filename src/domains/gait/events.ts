/**
 * Détection des événements de la marche.
 *
 * Vue latérale — méthode de Zeni JA Jr, Richards JG, Higginson JS (2008) « Two simple methods for determining gait
 * events during treadmill and overground walking using kinematic data », Gait & Posture 27(4):710-714 (`zeni2008`) :
 * contact initial (IC) = maximum de la position antéropostérieure du talon par rapport au bassin ; décollement des
 * orteils (TO) = minimum de la position de l'orteil par rapport au bassin. Le sens de marche est détecté par la vitesse
 * médiane du bassin (les allers-retours ne sont pas gérés : un seul sens par enregistrement).
 *
 * Vues frontale/postérieure — adaptation (non validée, confiance plus basse) : la caméra étant fixe, un pied en appui
 * est immobile dans l'image alors qu'il se déplace vite en oscillation. La vitesse du talon (et de l'orteil) dans l'image,
 * rapportée à la taille apparente (longueur du tronc), délimite des plages d'immobilité : début de plage du talon = IC,
 * fin de plage de l'orteil = TO. Les mouvements verticaux du pied en oscillation se confondant avec la profondeur dans
 * ces vues, l'extremum de type Zeni n'y est pas utilisé.
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

/**
 * Signaux « type Zeni » (talon et orteil relatifs au bassin) pour un côté.
 *
 * Vue frontale/postérieure : avec R = (Y_pied − Y_bassin) / longueur du tronc, et la caméra à hauteur de hanche,
 * R ≈ k · Z_bassin / Z_pied (k = hauteur de caméra / longueur du tronc, estimé par la médiane de R). Le décalage
 * antéropostérieur pied–bassin vaut alors Z_bassin · (1 − k / R), et Z_bassin ∝ 1 / longueur apparente du tronc ;
 * le signal (1 − k / R) / tronc est donc proportionnel à ce décalage, sans la dérive due à l'approche de la caméra.
 */
export function eventSignals(
  track: Track,
  view: GaitView,
  side: Side,
  direction: 1 | -1 | 0,
): { heel: number[]; toe: number[] } {
  const n = track.t.length;
  const hk = idx(side, 'heel');
  const tk = idx(side, 'toe');
  if (isSagittal(view)) {
    const d = direction || 1;
    const heel: number[] = [];
    const toe: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = mid(track, LM.leftHip, LM.rightHip, i);
      heel.push(d * (track.X[hk]![i]! - p.x));
      toe.push(d * (track.X[tk]![i]! - p.x));
    }
    return { heel, toe };
  }
  const trunk = track.t.map((_, i) => {
    const p = mid(track, LM.leftHip, LM.rightHip, i);
    const s = mid(track, LM.leftShoulder, LM.rightShoulder, i);
    return Math.hypot(s.x - p.x, s.y - p.y) || NaN;
  });
  const ratio = (k: number): number[] =>
    track.t.map((_, i) => (track.Y[k]![i]! - mid(track, LM.leftHip, LM.rightHip, i).y) / trunk[i]!);
  // k : médiane des rapports des deux talons (pieds en moyenne à l'aplomb du bassin).
  const kk = median([...ratio(idx('L', 'heel')), ...ratio(idx('R', 'heel'))]);
  const sign = view === 'frontal' ? 1 : -1;
  const sig = (r: number[]): number[] => r.map((v, i) => (sign * (1 - kk / v)) / trunk[i]!);
  return { heel: sig(ratio(hk)), toe: sig(ratio(tk)) };
}

/**
 * Plages d'immobilité d'un repère dans l'image (vitesse < 15 % du 90e centile de la vitesse), d'au moins 15 % de la
 * période de foulée. Renvoie le début (`start`) ou la dernière trame (`end`) de chaque plage. Seuils de conception.
 */
export function stationaryRuns(
  speed: readonly number[],
  periodFrames: number,
  edge: 'start' | 'end',
): number[] {
  const finite = speed.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const p90 = finite[Math.floor(finite.length * 0.9)] ?? 0;
  const ok = speed.map((x) => Number.isFinite(x) && x < 0.3 * p90);
  const minLen = Math.max(2, Math.round(periodFrames * 0.15));
  const out: number[] = [];
  let i = 0;
  while (i < ok.length) {
    if (!ok[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < ok.length && ok[j]) j++;
    if (j - i >= minLen && i > 0 && j < ok.length) out.push(edge === 'start' ? i : j - 1);
    i = j;
  }
  return out;
}

/** Vitesse d'un repère dans l'image, en longueurs de tronc par seconde. */
export function imageSpeed(track: Track, k: number): number[] {
  const dt = 1 / track.fps;
  const vx = derivative(track.X[k]!, dt);
  const vy = derivative(track.Y[k]!, dt);
  return vx.map((x, i) => {
    const p = mid(track, LM.leftHip, LM.rightHip, i);
    const s = mid(track, LM.leftShoulder, LM.rightShoulder, i);
    return Math.hypot(x, vy[i]!) / (Math.hypot(s.x - p.x, s.y - p.y) || NaN);
  });
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
    const ics = isSagittal(view)
      ? findPeaks(heel, 'max', minDist, promH)
      : stationaryRuns(imageSpeed(track, idx(side, 'heel')), period, 'start');
    const tos = isSagittal(view)
      ? findPeaks(toe, 'min', minDist, promT)
      : stationaryRuns(imageSpeed(track, idx(side, 'toe')), period, 'end');
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
  // Nettoyage : un même type d'événement d'un même pied ne peut se répéter à moins de 0,6 période ; IC et TO d'un
  // même pied doivent alterner (on garde le premier de deux événements consécutifs de même type).
  const kept: GaitEvent[] = [];
  for (const e of events) {
    const prevSame = [...kept].reverse().find((k) => k.side === e.side && k.type === e.type);
    if (prevSame && e.frame - prevSame.frame < minDist) continue;
    const prevSide = [...kept].reverse().find((k) => k.side === e.side);
    if (prevSide && prevSide.type === e.type) continue;
    kept.push(e);
  }
  return { events: kept, direction, stridePeriodS: period / fps };
}
