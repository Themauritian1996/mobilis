/**
 * Calculateur d'aide technique (spec v2 §6, décision clinique §10.9) : repères anatomiques (grand trochanter, pli du
 * poignet), côté, séquence de marche, vérification de l'angle du coude par caméra (cible 20–30° en position d'appui) et
 * conseils d'ajustement (monter / descendre de n crans). PAS DE FORMULE PAR LA TAILLE : les formules du fichier source
 * (`formulaFromHeight`) sont signalées `to_verify` et ne sont jamais calculées.
 * Source : docs/gait-literature/assistive-devices.json (copie dans data/) — Bradley 2011, Sehgal 2021, Yi 1996, etc.
 */
import type { Assessment, AssessmentId, PatientId } from '../../core/types/clinical.ts';
import type { IsoDateTime } from '../../core/types/common.ts';
import { angleBetween, LM, planeRatio, type Pt } from '../../vision/goniometry.ts';
import devicesJson from './data/assistive-devices.json';
import type { DeviceKind, Side, TreatmentAction } from './types.ts';

export const DEVICE_KINDS: readonly DeviceKind[] = [
  'cane',
  'axillary_crutches',
  'forearm_crutches',
  'walker',
  'rollator',
];

interface JsonRule {
  readonly rule: string;
  readonly ref: string;
  readonly secondaryRefs?: readonly string[];
  readonly confidence: string;
  readonly cameraCheck?: boolean;
  readonly notes?: string;
}
interface JsonDevice {
  readonly id: string;
  readonly name_fr: string;
  readonly name_en: string;
  readonly rules: readonly JsonRule[];
  readonly indications: readonly string[];
  readonly warnings?: readonly string[];
  readonly refs: readonly string[];
  readonly formulaFromHeight?: { readonly status: string; readonly notes?: string };
}
interface JsonFile {
  readonly devices: readonly JsonDevice[];
  readonly principle: string;
  readonly cameraVerification: {
    readonly targetElbowFlexionDeg: {
      readonly min: number;
      readonly max: number;
      readonly alternativeMin: number;
      readonly refs: readonly string[];
    };
    readonly limits: readonly string[];
  };
}
const DATA = devicesJson as unknown as JsonFile;

const JSON_ID: Record<DeviceKind, string> = {
  cane: 'cane_standard',
  axillary_crutches: 'crutch_axillary',
  forearm_crutches: 'crutch_forearm',
  walker: 'walker',
  rollator: 'walker',
};

export const DEVICE_LABEL: Record<DeviceKind, { fr: string; en: string }> = {
  cane: { fr: 'Canne simple', en: 'Single-point cane' },
  axillary_crutches: { fr: 'Béquilles axillaires', en: 'Axillary crutches' },
  forearm_crutches: { fr: 'Béquilles d’avant-bras (canadiennes)', en: 'Forearm crutches' },
  walker: { fr: 'Déambulateur', en: 'Walker' },
  rollator: { fr: 'Rollator (4 roues)', en: 'Rollator' },
};

/** Cible de flexion du coude en position d'appui (décision clinique §10.9 : 20–30° ; Sehgal 2021, Bradley 2011). */
export const ELBOW_TARGET = Object.freeze({
  min: DATA.cameraVerification.targetElbowFlexionDeg.min,
  max: DATA.cameraVerification.targetElbowFlexionDeg.max,
  /** Borne inférieure alternative de Bradley 2011 (15°). */
  alternativeMin: DATA.cameraVerification.targetElbowFlexionDeg.alternativeMin,
  refs: DATA.cameraVerification.targetElbowFlexionDeg.refs,
});

/** Erreur d'angle du coude par caméra 2D : ordre de grandeur de src/ui/views/rom.ts (± 5°, coude). */
export const CAMERA_ELBOW_ERROR = Object.freeze({
  deg: 5,
  source:
    'Ordre de grandeur de la mesure d’amplitude par caméra de Mobilis (± 5° au coude) ; exactitude en posture statique non vérifiée (to_verify).',
});

export const CAMERA_LIMITS: readonly string[] = DATA.cameraVerification.limits;
export const PRINCIPLE: string = DATA.principle;

export interface Landmark {
  readonly id: 'wrist_crease' | 'greater_trochanter' | 'axilla' | 'olecranon' | 'foot';
  readonly role: 'primary' | 'alternative';
  readonly text: string;
  readonly refs: readonly string[];
}

export interface SequenceStep {
  readonly text: string;
  readonly refs: readonly string[];
  readonly status: 'sourced' | 'to_verify';
}

export interface DeviceGuide {
  readonly kind: DeviceKind;
  readonly name: { readonly fr: string; readonly en: string };
  readonly landmarks: readonly Landmark[];
  /** Règles du fichier source, avec leur référence et leur niveau de confiance. */
  readonly rules: readonly JsonRule[];
  readonly sequence: readonly SequenceStep[];
  readonly indications: readonly string[];
  readonly warnings: readonly string[];
  readonly refs: readonly string[];
  /** Vérification de l'angle du coude par caméra applicable à cette aide. */
  readonly elbowCheck: boolean;
  /** Une formule par la taille existe dans la littérature mais n'est PAS calculée (to_verify). */
  readonly formulaNotice: string | null;
}

const LANDMARKS: Record<DeviceKind, readonly Landmark[]> = {
  cane: [
    {
      id: 'wrist_crease',
      role: 'primary',
      text: 'Debout, chaussé, bras relâché : la poignée est à la hauteur du pli distal du poignet.',
      refs: ['bradley2011'],
    },
    {
      id: 'greater_trochanter',
      role: 'alternative',
      text: 'Alternative : la poignée à la hauteur du grand trochanter.',
      refs: ['yi1996', 'kim2011'],
    },
  ],
  walker: [
    {
      id: 'wrist_crease',
      role: 'primary',
      text: 'Debout, bras relâchés : les poignées sont à la hauteur du pli du poignet.',
      refs: ['bradley2011'],
    },
    {
      id: 'greater_trochanter',
      role: 'alternative',
      text: 'Alternative : à la hauteur du grand trochanter.',
      refs: ['yi1996'],
    },
  ],
  rollator: [
    {
      id: 'wrist_crease',
      role: 'primary',
      text: 'Debout, bras relâchés : les poignées sont à la hauteur du pli du poignet.',
      refs: ['bradley2011'],
    },
    {
      id: 'greater_trochanter',
      role: 'alternative',
      text: 'Alternative : à la hauteur du grand trochanter.',
      refs: ['yi1996'],
    },
  ],
  axillary_crutches: [
    {
      id: 'axilla',
      role: 'primary',
      text: 'Haut de la béquille environ 4–5 cm (1,5–2 po) sous l’aisselle : l’appui se fait sur les poignées, jamais sur l’aisselle.',
      refs: ['bradley2011', 'sehgal2021'],
    },
    {
      id: 'foot',
      role: 'primary',
      text: 'Embout environ 5 cm en dehors et 15 cm en avant du pied.',
      refs: ['bradley2011'],
    },
  ],
  forearm_crutches: [
    {
      id: 'olecranon',
      role: 'primary',
      text: 'Manchette environ 2,5–4 cm sous l’olécrâne (Bradley) ou 5 cm sous le coude (Sehgal).',
      refs: ['bradley2011', 'sehgal2021'],
    },
    {
      id: 'foot',
      role: 'primary',
      text: 'Embout environ 5 cm en dehors et 15 cm en avant du pied.',
      refs: ['bradley2011'],
    },
  ],
};

const SEQUENCE: Record<DeviceKind, readonly SequenceStep[]> = {
  cane: [
    {
      text: 'Tenir la canne du côté opposé au membre faible ou douloureux.',
      refs: ['sehgal2021', 'bradley2011'],
      status: 'sourced',
    },
    {
      text: 'Avancer la canne en même temps que le membre atteint, puis avancer le membre sain.',
      refs: ['sehgal2021', 'bradley2011'],
      status: 'sourced',
    },
  ],
  axillary_crutches: [
    {
      text: 'Avancer les deux béquilles, puis le membre atteint, puis le membre sain (séquence classique à trois temps).',
      refs: ['bradley2011'],
      status: 'to_verify',
    },
    { text: 'Charger les poignées, jamais l’aisselle.', refs: ['bradley2011', 'sehgal2021'], status: 'sourced' },
  ],
  forearm_crutches: [
    {
      text: 'Avancer les deux cannes, puis le membre atteint, puis le membre sain (séquence classique à trois temps).',
      refs: ['sehgal2021'],
      status: 'to_verify',
    },
  ],
  walker: [
    {
      text: 'Avancer le déambulateur, puis le membre atteint, puis le membre sain (séquence classique).',
      refs: ['bradley2011'],
      status: 'to_verify',
    },
    { text: 'Garder les deux pieds entre les pattes arrière.', refs: ['bradley2011'], status: 'sourced' },
  ],
  rollator: [
    {
      text: 'Pousser le rollator devant soi sans s’y appuyer fortement ; freins engagés pour s’asseoir.',
      refs: ['sehgal2021'],
      status: 'sourced',
    },
    { text: 'Garder les deux pieds entre les roues arrière.', refs: ['bradley2011'], status: 'sourced' },
  ],
};

export function deviceGuide(kind: DeviceKind): DeviceGuide {
  const d = DATA.devices.find((x) => x.id === JSON_ID[kind]);
  if (!d) throw new Error(`assistive-devices.json : aide « ${kind} » introuvable`);
  // Le déambulateur et le rollator partagent une entrée : on ne garde que les règles qui concernent le type choisi.
  const rules = kind === 'walker' ? d.rules.filter((r) => !/^Rollator/i.test(r.rule)) : d.rules;
  return {
    kind,
    name: DEVICE_LABEL[kind],
    landmarks: LANDMARKS[kind],
    rules,
    sequence: SEQUENCE[kind],
    indications: d.indications,
    warnings: d.warnings ?? [],
    refs: d.refs,
    elbowCheck: rules.some((r) => r.cameraCheck === true),
    formulaNotice: d.formulaFromHeight
      ? 'Des formules par la taille existent dans la littérature mais ne sont pas validées (to_verify) : Mobilis ne les utilise pas. Régler sur le patient debout, chaussé, puis vérifier l’angle du coude.'
      : null,
  };
}

// ------------------------------------------------------------------------------------------------ Côté

export type AffectedSide = 'left' | 'right' | 'bilateral' | 'none' | undefined;
export interface HoldSide {
  /** 'L' / 'R' : côté de la main qui tient l'aide ; 'both' : deux mains ; 'either' : indifférent / à décider. */
  readonly side: Side | 'both' | 'either';
  readonly text: string;
  readonly refs: readonly string[];
}

/** Côté de la main : canne controlatérale au membre atteint ; béquilles et déambulateur à deux mains (Sehgal 2021, Bradley 2011). */
export function holdSide(kind: DeviceKind, affected: AffectedSide): HoldSide {
  if (kind === 'walker' || kind === 'rollator')
    return { side: 'both', text: 'Les deux mains sur les poignées.', refs: ['bradley2011'] };
  if (kind === 'axillary_crutches' || kind === 'forearm_crutches') {
    const contra: Side | null = affected === 'left' ? 'R' : affected === 'right' ? 'L' : null;
    return {
      side: 'both',
      text: contra
        ? `Deux béquilles ; si une seule béquille est prescrite (décharge partielle), du côté ${contra === 'R' ? 'droit' : 'gauche'} (controlatéral au membre atteint).`
        : 'Deux béquilles ; si une seule béquille est prescrite, du côté controlatéral au membre atteint.',
      refs: ['sehgal2021', 'bradley2011'],
    };
  }
  if (affected === 'left')
    return {
      side: 'R',
      text: 'Canne dans la main DROITE (controlatérale au membre gauche atteint).',
      refs: ['sehgal2021', 'bradley2011'],
    };
  if (affected === 'right')
    return {
      side: 'L',
      text: 'Canne dans la main GAUCHE (controlatérale au membre droit atteint).',
      refs: ['sehgal2021', 'bradley2011'],
    };
  return {
    side: 'either',
    text: 'Côté atteint non précisé ou bilatéral : la canne se tient du côté opposé au membre le plus faible ou douloureux.',
    refs: ['sehgal2021', 'bradley2011'],
  };
}

// ------------------------------------------------------------------------------------------------ Angle du coude

export interface ElbowFrame {
  readonly lm: readonly { readonly x: number; readonly y: number; readonly z?: number; readonly visibility?: number }[];
  readonly w: number;
  readonly h: number;
}

export interface ElbowSample {
  /** Flexion du coude : 0° = bras tendu, 90° = angle droit. */
  readonly flexionDeg: number;
  readonly visibility: number;
  readonly upperArmPx: number;
  readonly forearmPx: number;
}

const MIN_VIS = 0.5;

/** Flexion du coude (180° − angle épaule–coude–poignet), en pixels carrés ; null si un repère est peu visible. */
export function elbowFlexion(f: ElbowFrame, side: Side): ElbowSample | null {
  const pt = (i: number): (Pt & { v: number }) | null => {
    const l = f.lm[i];
    return l ? { x: l.x * f.w, y: l.y * f.h, v: l.visibility ?? 1 } : null;
  };
  const sh = pt(LM.sh[side]);
  const el = pt(LM.el[side]);
  const wr = pt(LM.wr[side]);
  if (!sh || !el || !wr) return null;
  const v = Math.min(sh.v, el.v, wr.v);
  if (v < MIN_VIS) return null;
  const u = { x: sh.x - el.x, y: sh.y - el.y };
  const w = { x: wr.x - el.x, y: wr.y - el.y };
  const upper = Math.hypot(u.x, u.y);
  const fore = Math.hypot(w.x, w.y);
  if (upper < 1 || fore < 1) return null;
  return { flexionDeg: 180 - angleBetween(u, w), visibility: v, upperArmPx: upper, forearmPx: fore };
}

/** Vue : l'angle du coude n'est fiable qu'en vue de profil (bras dans le plan sagittal, assistive-devices.json). */
export function viewOf(f: ElbowFrame): 'profile' | 'frontal' | 'unknown' {
  const r = planeRatio(f.lm, f.w, f.h);
  if (r === null) return 'unknown';
  return r < 0.35 ? 'profile' : 'frontal';
}

export interface ElbowEstimate {
  readonly flexionDeg: number;
  readonly sdDeg: number;
  readonly n: number;
  readonly visibility: number;
  readonly upperArmPx: number;
  readonly forearmPx: number;
}

/**
 * Stabilise la mesure : fenêtre glissante de `windowMs` ; l'estimation est « stable » quand elle compte assez
 * d'échantillons et que leur écart-type reste faible (la médiane est retenue, jamais une image isolée).
 */
export class ElbowSampler {
  private readonly buf: { t: number; s: ElbowSample }[] = [];
  private readonly windowMs: number;
  private readonly minSamples: number;
  private readonly maxSdDeg: number;
  constructor(windowMs = 1500, minSamples = 12, maxSdDeg = 2.5) {
    this.windowMs = windowMs;
    this.minSamples = minSamples;
    this.maxSdDeg = maxSdDeg;
  }
  reset(): void {
    this.buf.length = 0;
  }
  add(t: number, s: ElbowSample | null): void {
    if (!s) {
      this.buf.length = 0; // repère perdu : on repart de zéro
      return;
    }
    this.buf.push({ t, s });
    while (this.buf.length && t - this.buf[0]!.t > this.windowMs) this.buf.shift();
  }
  /** Estimation courante (null s'il manque des échantillons). `stable` : prête à être enregistrée. */
  estimate(): (ElbowEstimate & { stable: boolean }) | null {
    const n = this.buf.length;
    if (n < 3) return null;
    const xs = this.buf.map((b) => b.s.flexionDeg).sort((a, b) => a - b);
    const med = xs.length % 2 ? xs[(xs.length - 1) / 2]! : (xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const span = this.buf[n - 1]!.t - this.buf[0]!.t;
    const med2 = (k: 'upperArmPx' | 'forearmPx'): number => {
      const v = this.buf.map((b) => b.s[k]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)]!;
    };
    return {
      flexionDeg: med,
      sdDeg: sd,
      n,
      visibility: Math.min(...this.buf.map((b) => b.s.visibility)),
      upperArmPx: med2('upperArmPx'),
      forearmPx: med2('forearmPx'),
      stable: n >= this.minSamples && span >= this.windowMs * 0.6 && sd <= this.maxSdDeg,
    };
  }
}

// ------------------------------------------------------------------------------------------------ Ajustement

export type ElbowStatus = 'ok' | 'borderline' | 'too_flexed' | 'too_extended';

/** Classe l'angle mesuré par rapport à la bande cible, en tenant compte de l'erreur de mesure. */
export function elbowStatus(
  flexionDeg: number,
  errorDeg: number = CAMERA_ELBOW_ERROR.deg,
  target = ELBOW_TARGET,
): ElbowStatus {
  if (flexionDeg >= target.min && flexionDeg <= target.max) return 'ok';
  const gap = flexionDeg > target.max ? flexionDeg - target.max : target.min - flexionDeg;
  if (gap <= errorDeg) return 'borderline';
  return flexionDeg > target.max ? 'too_flexed' : 'too_extended';
}

/**
 * Proportions des segments du membre supérieur (fractions de la taille) : Winter 2009, `winter2009` — valeurs
 * `to_verify` (non incluses dans norms.json). Servent UNIQUEMENT à convertir un écart d'angle en centimètres.
 */
export const ARM_PROPORTIONS = Object.freeze({
  ref: 'winter2009',
  status: 'to_verify' as const,
  upperArm: 0.186,
  forearm: 0.146,
  hand: 0.108,
});
/** Espacement typique des crans de réglage (cm) : valeur par défaut modifiable ; dépend du modèle (to_verify). */
export const DEFAULT_NOTCH_CM = 2.5;
/** Taille supposée quand elle est inconnue (cm) : l'avis le signale. */
export const ASSUMED_HEIGHT_CM = 170;

export interface AdjustmentInput {
  /** Flexion mesurée (°). */
  readonly flexionDeg: number;
  readonly errorDeg?: number;
  readonly heightCm?: number | undefined;
  /** Espacement des crans (cm). */
  readonly notchCm?: number;
  readonly target?: { readonly min: number; readonly max: number };
}

export interface Adjustment {
  readonly status: ElbowStatus;
  readonly direction: 'up' | 'down' | 'none';
  /** Variation de hauteur de la poignée (cm ; positive = monter). */
  readonly deltaCm: number;
  /** Nombre de crans entiers (≥ 1 si un réglage est conseillé). */
  readonly notches: number;
  readonly notchCm: number;
  readonly targetDeg: number;
  readonly uncertain: boolean;
  readonly assumedHeight: boolean;
  readonly message: string;
}

/** Distance épaule–poignée pour une flexion donnée (loi des cosinus), longueurs en cm. */
export const shoulderToGrip = (upperCm: number, foreCm: number, flexionDeg: number): number =>
  Math.sqrt(upperCm ** 2 + foreCm ** 2 + 2 * upperCm * foreCm * Math.cos((flexionDeg * Math.PI) / 180));

/**
 * Conseil d'ajustement : de combien de crans faut-il monter ou descendre la poignée pour ramener le coude au milieu
 * de la bande cible (25°). Plus de flexion = main plus proche de l'épaule = poignée trop haute → DESCENDRE ; moins de
 * flexion (bras tendu) = poignée trop basse → MONTER. Conversion angle → cm par la géométrie du bras (loi des cosinus,
 * segments en fraction de la taille, Winter 2009 : estimation). Dans la marge d'erreur : mesurer à nouveau, pas de réglage.
 */
export function adviseAdjustment(input: AdjustmentInput): Adjustment {
  const target = input.target ?? ELBOW_TARGET;
  const err = input.errorDeg ?? CAMERA_ELBOW_ERROR.deg;
  const notch = input.notchCm && input.notchCm > 0 ? input.notchCm : DEFAULT_NOTCH_CM;
  const status = elbowStatus(input.flexionDeg, err, { ...ELBOW_TARGET, ...target });
  const targetDeg = (target.min + target.max) / 2;
  const assumedHeight = !input.heightCm || input.heightCm < 100;
  const H = assumedHeight ? ASSUMED_HEIGHT_CM : input.heightCm!;
  const upper = ARM_PROPORTIONS.upperArm * H;
  // Du coude au centre de la prise : avant-bras + la moitié de la main.
  const fore = (ARM_PROPORTIONS.forearm + ARM_PROPORTIONS.hand / 2) * H;
  const delta =
    Math.round((shoulderToGrip(upper, fore, input.flexionDeg) - shoulderToGrip(upper, fore, targetDeg)) * 10) / 10;
  // delta = (distance épaule–main mesurée) − (distance cible) : > 0 = main trop loin de l'épaule (bras trop tendu) → MONTER ;
  // < 0 = main trop près (coude trop fléchi) → DESCENDRE.
  if (status === 'ok')
    return {
      status,
      direction: 'none',
      deltaCm: 0,
      notches: 0,
      notchCm: notch,
      targetDeg,
      uncertain: false,
      assumedHeight,
      message: `Angle du coude dans la cible (${target.min}–${target.max}°) : aucun réglage.`,
    };
  if (status === 'borderline')
    return {
      status,
      direction: 'none',
      deltaCm: 0,
      notches: 0,
      notchCm: notch,
      targetDeg,
      uncertain: true,
      assumedHeight,
      message: `Angle proche de la cible (${target.min}–${target.max}°) et dans la marge d’erreur de la caméra (± ${err}°) : refaire la mesure avant de régler.`,
    };
  const direction: 'up' | 'down' = delta > 0 ? 'up' : 'down';
  const notches = Math.max(1, Math.round(Math.abs(delta) / notch));
  const words =
    status === 'too_flexed' ? 'Coude trop fléchi : poignée trop haute' : 'Coude trop tendu : poignée trop basse';
  const assumed = assumedHeight ? ` Taille non renseignée : conversion estimée avec ${ASSUMED_HEIGHT_CM} cm.` : '';
  return {
    status,
    direction,
    deltaCm: delta,
    notches,
    notchCm: notch,
    targetDeg,
    uncertain: false,
    assumedHeight,
    message: `${words}. ${direction === 'up' ? 'Monter' : 'Descendre'} la poignée de ${notches} cran${notches > 1 ? 's' : ''} (≈ ${Math.abs(delta).toFixed(1)} cm ; crans de ${notch} cm), puis refaire la mesure.${assumed}`,
  };
}

// ------------------------------------------------------------------------------------------------ Enregistrement

export interface DeviceRecordInput {
  readonly id: string;
  readonly patientId: string;
  readonly ownerUid: string;
  readonly now: Date;
  readonly kind: DeviceKind;
  readonly arm: Side;
  readonly flexionDeg: number;
  readonly confidence: number;
  readonly advice: Adjustment;
  readonly affected?: AffectedSide;
  readonly source?: 'camera' | 'manual';
}

/** Document `assessments` (kind 'custom') qui garde la mesure de l'angle du coude et le conseil ; aucune image. */
export function buildDeviceAssessment(i: DeviceRecordInput): Assessment {
  const t = i.now.toISOString() as IsoDateTime;
  return {
    schemaVersion: 1,
    id: i.id as AssessmentId,
    patientId: i.patientId as PatientId,
    ownerUid: i.ownerUid,
    createdAt: t,
    updatedAt: t,
    kind: 'custom',
    performedAt: t,
    conditions: {
      type: 'assistive_device_fit',
      device: i.kind,
      arm: i.arm,
      target: `${ELBOW_TARGET.min}-${ELBOW_TARGET.max}`,
      status: i.advice.status,
      source: i.source ?? 'camera',
      advice: i.advice.message,
      ...(i.affected ? { affectedSide: i.affected } : {}),
    },
    metrics: [
      {
        metricId: 'elbow_flexion_support',
        value: Math.round(i.flexionDeg * 10) / 10,
        unit: '°',
        confidence: i.confidence,
        side: i.arm === 'L' ? 'left' : 'right',
      },
    ],
    findings: [],
    videoRetained: false,
    engineVersion: 'aides-1',
  };
}

/** Action de plan (aide technique) liée à la vérification ; saisie par le clinicien donc déjà validée. */
export function buildDeviceAction(i: {
  readonly id: string;
  readonly kind: DeviceKind;
  readonly hold: HoldSide;
  readonly advice: Adjustment;
  readonly flexionDeg: number;
  readonly assessmentId: string;
}): TreatmentAction {
  const g = DEVICE_LABEL[i.kind].fr;
  const side = i.hold.side === 'L' || i.hold.side === 'R' ? i.hold.side : undefined;
  return {
    id: i.id,
    kind: 'assistive_device',
    label: g,
    deviceKind: i.kind,
    ...(side ? { side } : {}),
    detail: `${i.hold.text} Coude mesuré à ${Math.round(i.flexionDeg)}° (cible ${ELBOW_TARGET.min}–${ELBOW_TARGET.max}°). ${i.advice.message} Mesure enregistrée : ${i.assessmentId}.`,
    clinicianEdited: true,
    validated: true,
    audience: 'patient',
    origin: 'manual',
    refs: [...ELBOW_TARGET.refs],
    sourceAssessmentId: i.assessmentId,
  };
}
