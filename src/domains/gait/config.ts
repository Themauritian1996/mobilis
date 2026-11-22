/**
 * Configuration clinique du moteur (décisions validées par le physiatre le 22 nov. 2026 ; valeurs par défaut
 * modifiables). Toute valeur sans source publiée est marquée dans `docs`/README comme choix de conception.
 */

export interface GaitConfig {
  /** Norme de vitesse par défaut (< 70 ans). Bohannon 1997 (avec ET) : % de la norme ET score z sont rapportés. */
  readonly speedNorm: 'bohannon1997';
  /** Anomalie au-delà de ± zThreshold ET (dépistage). */
  readonly zThreshold: number;
  /** Convention de la hanche : angle cuisse–verticale (Perry). */
  readonly hipConvention: 'thigh_vertical';
  /** Nombre minimal de cycles valides par côté pour retenir un défaut. */
  readonly minCyclesPerSide: number;
  /** Fraction minimale des cycles où le critère est présent (défaut 2/3). */
  readonly minCycleAgreement: number;
  /** Âges : Hollman 2011 à partir de `hollmanFromAge` ; vitesse Bohannon & Andrews 2011 seule à partir de `bohannon2011SpeedFromAge`. */
  readonly olderAdults: { readonly hollmanFromAge: number; readonly bohannon2011SpeedFromAge: number };
  /** Pied tombant : cheville en oscillation moyenne < anomalyBelow° = anomalie ; < confidentBelow° = « confiant ». */
  readonly footDrop: { readonly anomalyBelowDeg: number; readonly confidentBelowDeg: number };
  /**
   * Largeur de la bande « doute » des critères angulaires sans bande explicite : erreur absolue moyenne 2D
   * (Stenum 2021 : hanche 4,0°, genou 5,6°, cheville 7,4°).
   */
  readonly doubtBandDeg: { readonly hip: number; readonly knee: number; readonly ankle: number; readonly frontal: number };
}

export const DEFAULT_GAIT_CONFIG: GaitConfig = Object.freeze({
  speedNorm: 'bohannon1997',
  zThreshold: 2,
  hipConvention: 'thigh_vertical',
  minCyclesPerSide: 3,
  minCycleAgreement: 2 / 3,
  olderAdults: Object.freeze({ hollmanFromAge: 70, bohannon2011SpeedFromAge: 80 }),
  footDrop: Object.freeze({ anomalyBelowDeg: 0, confidentBelowDeg: -5 }),
  doubtBandDeg: Object.freeze({ hip: 4.0, knee: 5.6, ankle: 7.4, frontal: 3 }),
}) as GaitConfig;

export function withConfig(partial: Partial<GaitConfig> = {}): GaitConfig {
  return { ...DEFAULT_GAIT_CONFIG, ...partial };
}
