/**
 * Catalogue des défauts de marche : textes, causes, prise en charge et références issus de findings.json (copie de
 * docs/gait-literature/findings.json) ; critères MESURABLES encodés ici à partir des seuils de ce fichier. Les seuils
 * `proposed_heuristic` / `norm_relative` / `published` sont repris tels quels ; les bandes « doute » ajoutées sont
 * l'erreur 2D de Stenum 2021 (config.doubtBandDeg) ou la décision clinique (pied tombant : 0 / −5°).
 * Le champ `determinants` (déterminants de Saunders 1953 altérés) est une proposition de correspondance à valider.
 */
import findingsJson from './findings.json';
import type { DeterminantId } from '../determinant-ids.ts';
import {
  normZ,
  pick,
  sideDelta,
  sideRatioPct,
  threshold,
  type CriterionSpec,
  type FindingDefinition,
} from '../rules.ts';

interface JsonFinding {
  readonly id: string;
  readonly name_fr: string;
  readonly name_en: string;
  readonly causes: readonly string[];
  readonly differentials: readonly string[];
  readonly management: readonly string[];
  readonly refs: readonly string[];
  readonly evidenceLevel: string;
  readonly camera2dLimits: string | null;
}

export const FINDINGS_JSON = (findingsJson as unknown as { findings: JsonFinding[] }).findings;

const kneeBand = (c: { doubtBandDeg: { knee: number } }): number => c.doubtBandDeg.knee;

/** Signes compensatoires d'un défaut de dégagement du pied (vues sagittale ET frontale/postérieure). */
const clearanceCompensations: CriterionSpec[] = [
  {
    id: 'comp_steppage_hip',
    role: 'compensation',
    text: 'Steppage : flexion de hanche en oscillation > côté opposé + 10°',
    metric: 'peak_hip_flexion_swing',
    thresholdType: 'proposed_heuristic',
    refs: ['perry2010'],
    evaluate: sideDelta('peak_hip_flexion_swing', 'above', 5, 10),
  },
  {
    id: 'comp_steppage_knee',
    role: 'compensation',
    text: 'Steppage : flexion maximale du genou en oscillation > moyenne + 2 ET (Oberg 1994)',
    metric: 'peak_knee_flexion_swing',
    thresholdType: 'norm_relative',
    refs: ['oberg1994'],
    evaluate: normZ(pick.self('peak_knee_flexion_swing'), 'above', kneeBand),
  },
  {
    id: 'comp_circumduction',
    role: 'compensation',
    text: 'Circumduction : arc latéral du pied en oscillation > 3 cm (vue frontale/postérieure)',
    metric: 'foot_lateral_excursion_swing',
    thresholdType: 'proposed_heuristic',
    refs: ['kerrigan2000'],
    evaluate: threshold(pick.self('foot_lateral_excursion_swing'), 'above', 0.03, 0.05),
  },
  {
    id: 'comp_hip_hiking',
    role: 'compensation',
    text: 'Élévation du bassin du côté oscillant (hip hiking) > 3° (vue frontale/postérieure)',
    metric: 'pelvic_obliquity_swing',
    thresholdType: 'proposed_heuristic',
    refs: ['kerrigan2000'],
    evaluate: threshold(pick.self('pelvic_obliquity_swing'), 'below', -1.5, -3),
  },
  {
    id: 'comp_vaulting',
    role: 'compensation',
    text: 'Vaulting : décollement précoce du talon controlatéral (< 31 % du cycle)',
    metric: 'heel_rise_pct',
    thresholdType: 'norm_relative',
    refs: ['aapmr_normal_gait'],
    evaluate: threshold(pick.other('heel_rise_pct'), 'below', 31, 25),
  },
];

interface Def {
  readonly id: string;
  readonly determinants: readonly DeterminantId[];
  readonly criteria: readonly CriterionSpec[];
  readonly global?: boolean;
}

const DEFS: readonly Def[] = [
  {
    id: 'foot_drop_steppage',
    determinants: ['foot_ankle_rockers', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'ankle_msw_plantarflexed',
        role: 'primary',
        text: 'Cheville en flexion plantaire en oscillation moyenne (anomalie < 0°, « confiant » < −5°)',
        metric: 'ankle_msw',
        thresholdType: 'proposed_heuristic',
        refs: ['physiopedia_gait_cycle', 'perry2010', 'stenum2021'],
        evaluate: (src, side) =>
          threshold(
            pick.self('ankle_msw'),
            'below',
            src.config.footDrop.anomalyBelowDeg,
            src.config.footDrop.confidentBelowDeg,
          )(src, side),
      },
      {
        id: 'ankle_ic_plantarflexed',
        role: 'supporting',
        text: 'Contact initial par l’avant-pied ou pied à plat (cheville < −5° au contact)',
        metric: 'ankle_ic',
        thresholdType: 'proposed_heuristic',
        refs: ['degheldere_normal_gait'],
        evaluate: threshold(pick.self('ankle_ic'), 'below', -5, -10),
      },
      ...clearanceCompensations,
      {
        id: 'contrary_no_stance_dorsiflexion',
        role: 'contrary',
        text: 'Pas de dorsiflexion en appui (< 0°) : oriente plutôt vers un équin dynamique',
        metric: 'peak_ankle_dorsiflexion_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['rodda2001'],
        evaluate: threshold(pick.self('peak_ankle_dorsiflexion_stance'), 'below', 0, -5),
      },
    ],
  },
  {
    id: 'foot_slap',
    determinants: ['foot_ankle_rockers'],
    criteria: [
      {
        id: 'foot_flat_early',
        role: 'primary',
        text: 'Pied à plat atteint en < 50 % de la durée normale de la réponse à la charge (< 6 % du cycle)',
        metric: 'foot_flat_pct',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: threshold(pick.self('foot_flat_pct'), 'below', 6, 4),
      },
      {
        id: 'pf_velocity_high',
        role: 'supporting',
        text: 'Vitesse de flexion plantaire en réponse à la charge > côté opposé × 1,5',
        metric: 'ankle_pf_velocity_lr',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideRatioPct('ankle_pf_velocity_lr', 'above', 30, 50),
      },
      {
        id: 'heel_contact_present',
        role: 'required',
        text: 'Contact par le talon présent (cheville ≥ −5° au contact), ce qui distingue du pied tombant franc',
        metric: 'ankle_ic',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: threshold(pick.self('ankle_ic'), 'above', -5, -2),
      },
    ],
  },
  {
    id: 'circumduction',
    determinants: ['knee_ankle_interaction', 'lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'foot_lateral_arc',
        role: 'primary',
        text: 'Arc latéral de la cheville en oscillation : anomalie > 3 cm, « confiant » > 5 cm (par rapport à sa ligne d’appui)',
        metric: 'foot_lateral_excursion_swing',
        thresholdType: 'proposed_heuristic',
        refs: ['kerrigan2000'],
        evaluate: threshold(pick.self('foot_lateral_excursion_swing'), 'above', 0.03, 0.05),
      },
      {
        id: 'foot_lateral_arc_vs_other',
        role: 'supporting',
        text: 'Arc latéral > côté opposé × 2',
        metric: 'foot_lateral_excursion_swing',
        thresholdType: 'proposed_heuristic',
        refs: ['kerrigan2000'],
        evaluate: sideRatioPct('foot_lateral_excursion_swing', 'above', 60, 100),
      },
      {
        id: 'comp_reduced_knee_flexion',
        role: 'supporting',
        text: 'Flexion du genou en oscillation diminuée (cause fréquente) : < moyenne − 2 ET',
        metric: 'peak_knee_flexion_swing',
        thresholdType: 'norm_relative',
        refs: ['oberg1994', 'kerrigan2000'],
        evaluate: normZ(pick.self('peak_knee_flexion_swing'), 'below', kneeBand),
      },
    ],
  },
  {
    id: 'vaulting',
    determinants: ['foot_ankle_rockers', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'contralateral_early_heel_rise',
        role: 'primary',
        text: 'Décollement du talon du membre en appui (controlatéral) avant 31 % de son cycle pendant l’oscillation de ce membre',
        metric: 'heel_rise_pct',
        thresholdType: 'norm_relative',
        refs: ['aapmr_normal_gait'],
        evaluate: threshold(pick.other('heel_rise_pct'), 'below', 31, 25),
      },
      {
        id: 'contralateral_ankle_pf_midstance',
        role: 'supporting',
        text: 'Cheville controlatérale en flexion plantaire (< 0°) en mi-appui',
        metric: 'ankle_mst',
        thresholdType: 'proposed_heuristic',
        refs: ['aapmr_normal_gait'],
        evaluate: threshold(pick.other('ankle_mst'), 'below', 0, -5),
      },
    ],
  },
  {
    id: 'hip_hiking',
    determinants: ['pelvic_list'],
    criteria: [
      {
        id: 'swing_hemipelvis_higher',
        role: 'primary',
        text: 'Hémibassin oscillant plus haut que l’hémibassin d’appui en oscillation (anomalie > 1,5°, « confiant » > 3°)',
        metric: 'pelvic_obliquity_swing',
        thresholdType: 'proposed_heuristic',
        refs: ['kerrigan2000'],
        evaluate: threshold(pick.self('pelvic_obliquity_swing'), 'below', -1.5, -3),
      },
    ],
  },
  {
    id: 'trendelenburg',
    determinants: ['pelvic_list', 'lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'contralateral_drop_asymmetry',
        role: 'primary',
        text: 'Chute pelvienne controlatérale en appui de ce côté > côté opposé + 3° (anomalie > + 1,5°)',
        metric: 'contralateral_pelvic_drop',
        thresholdType: 'proposed_heuristic',
        refs: ['hardcastle1985'],
        evaluate: sideDelta('contralateral_pelvic_drop', 'above', 1.5, 3),
      },
      {
        id: 'contrary_trunk_lean',
        role: 'contrary',
        text: 'Inclinaison du tronc vers l’appui > côté opposé + 5° : oriente vers un Trendelenburg compensé',
        metric: 'trunk_lateral_lean_toward_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideDelta('trunk_lateral_lean_toward_stance', 'above', 2.5, 5),
      },
    ],
  },
  {
    id: 'trendelenburg_compensated',
    determinants: ['pelvic_list', 'lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'trunk_lean_toward_stance',
        role: 'primary',
        text: 'Inclinaison latérale du tronc vers le côté d’appui > côté opposé + 5° (anomalie > + 2,5°)',
        metric: 'trunk_lateral_lean_toward_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideDelta('trunk_lateral_lean_toward_stance', 'above', 2.5, 5),
      },
    ],
  },
  {
    id: 'reduced_hip_flexion',
    determinants: ['pelvic_rotation', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'hip_flexion_swing_low',
        role: 'primary',
        text: 'Flexion maximale de hanche en oscillation < 20° (cuisse–verticale ; norme ≈ 25–30°), doute entre 20 et 24°',
        metric: 'peak_hip_flexion_swing',
        thresholdType: 'proposed_heuristic',
        refs: ['physiopedia_gait_cycle', 'degheldere_normal_gait', 'stenum2021'],
        evaluate: (src, side) => threshold(pick.self('peak_hip_flexion_swing'), 'below', 20 + src.config.doubtBandDeg.hip, 20)(src, side),
      },
      {
        id: 'hip_flexion_vs_other',
        role: 'supporting',
        text: 'Flexion de hanche en oscillation < côté opposé − 10°',
        metric: 'peak_hip_flexion_swing',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideDelta('peak_hip_flexion_swing', 'below', -5, -10),
      },
    ],
  },
  {
    id: 'reduced_hip_extension',
    determinants: ['pelvic_rotation', 'foot_ankle_rockers'],
    criteria: [
      {
        id: 'hip_never_extends',
        role: 'primary',
        text: 'Hanche n’atteignant pas 0° en appui terminal (reste en flexion), « confiant » au-delà de + 4°',
        metric: 'peak_hip_extension',
        thresholdType: 'proposed_heuristic',
        refs: ['physiopedia_gait_cycle', 'degheldere_normal_gait'],
        evaluate: (src, side) => threshold(pick.self('peak_hip_extension'), 'above', 0, src.config.doubtBandDeg.hip)(src, side),
      },
      {
        id: 'hip_extension_vs_other',
        role: 'supporting',
        text: 'Extension de hanche < côté opposé − 10°',
        metric: 'peak_hip_extension',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideDelta('peak_hip_extension', 'above', 5, 10),
      },
    ],
  },
  {
    id: 'stiff_knee',
    determinants: ['knee_ankle_interaction'],
    criteria: [
      {
        id: 'knee_swing_low',
        role: 'primary',
        text: 'Flexion maximale du genou en oscillation < moyenne − 2 ET (Oberg 1994) ; « confiant » au-delà de l’erreur 2D (5,6°)',
        metric: 'peak_knee_flexion_swing',
        thresholdType: 'norm_relative',
        refs: ['oberg1994', 'stenum2021'],
        evaluate: normZ(pick.self('peak_knee_flexion_swing'), 'below', kneeBand),
      },
      {
        id: 'knee_swing_vs_other',
        role: 'supporting',
        text: 'Flexion maximale du genou en oscillation < côté opposé − 15°',
        metric: 'peak_knee_flexion_swing',
        thresholdType: 'proposed_heuristic',
        refs: ['oberg1994'],
        evaluate: sideDelta('peak_knee_flexion_swing', 'below', -10, -15),
      },
      {
        id: 'knee_to_low',
        role: 'supporting',
        text: 'Flexion du genou au décollement des orteils < 25° (norme ≈ 35–40°)',
        metric: 'knee_at_toe_off',
        thresholdType: 'proposed_heuristic',
        refs: ['degheldere_normal_gait'],
        evaluate: threshold(pick.self('knee_at_toe_off'), 'below', 25, 20),
      },
      {
        id: 'knee_peak_late',
        role: 'supporting',
        text: 'Pic de flexion retardé au-delà de 75 % du cycle',
        metric: 'time_to_peak_knee_flexion',
        thresholdType: 'proposed_heuristic',
        refs: ['aapmr_normal_gait'],
        evaluate: threshold(pick.self('time_to_peak_knee_flexion'), 'above', 80, 85),
      },
      ...clearanceCompensations.filter((c) => !c.id.startsWith('comp_steppage')),
    ],
  },
  {
    id: 'genu_recurvatum',
    determinants: ['stance_knee_flexion', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'knee_hyperextension_stance',
        role: 'primary',
        text: 'Extension du genou au-delà de 0° en appui (anomalie < 0°, « confiant » ≤ −5°)',
        metric: 'knee_min_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['bleyenheuft2010', 'physiopedia_gait_cycle'],
        evaluate: threshold(pick.self('knee_min_stance'), 'below', 0, -5),
      },
    ],
  },
  {
    id: 'crouch',
    determinants: ['stance_knee_flexion', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'knee_flexion_stance_high',
        role: 'primary',
        text: 'Flexion du genou en appui > moyenne + 2 ET (Oberg 1994)',
        metric: 'knee_flexion_loading',
        thresholdType: 'norm_relative',
        refs: ['oberg1994', 'rodda2001'],
        evaluate: normZ(pick.self('knee_flexion_loading'), 'above', kneeBand),
      },
      {
        id: 'knee_never_extends',
        role: 'required',
        text: 'Le genou reste fléchi pendant tout l’appui (minimum en appui > 10°)',
        metric: 'knee_min_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['rodda2001'],
        evaluate: threshold(pick.self('knee_min_stance'), 'above', 10, 15),
      },
      {
        id: 'ankle_df_stance_high',
        role: 'supporting',
        text: 'Dorsiflexion > 15° en appui (crouch vrai)',
        metric: 'peak_ankle_dorsiflexion_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['rodda2001'],
        evaluate: threshold(pick.self('peak_ankle_dorsiflexion_stance'), 'above', 15, 20),
      },
    ],
  },
  {
    id: 'antalgic',
    determinants: ['stance_knee_flexion', 'foot_ankle_rockers'],
    criteria: [
      {
        id: 'single_support_shorter',
        role: 'primary',
        text: 'Temps d’appui unipodal de ce côté < côté opposé de > 10 % (doute > 5 %)',
        metric: 'single_support_time',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideRatioPct('single_support_time', 'below', -5, -10),
      },
      {
        id: 'contralateral_step_shorter',
        role: 'supporting',
        text: 'Pas du membre opposé (qui atterrit après l’appui de ce côté) plus court de > 10 %',
        metric: 'step_length',
        thresholdType: 'proposed_heuristic',
        refs: ['perry2010'],
        evaluate: sideRatioPct('step_length', 'below', -5, -10, true),
      },
    ],
  },
  {
    id: 'dynamic_equinus_equinovarus',
    determinants: ['foot_ankle_rockers', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'forefoot_contact',
        role: 'primary',
        text: 'Contact par l’avant-pied : cheville < −10° au contact (doute entre −5 et −10°)',
        metric: 'ankle_ic',
        thresholdType: 'proposed_heuristic',
        refs: ['rodda2001'],
        evaluate: threshold(pick.self('ankle_ic'), 'below', -5, -10),
      },
      {
        id: 'no_stance_dorsiflexion',
        role: 'required',
        text: 'Jamais de dorsiflexion en appui (pic < 0° ; norme ≈ +10° en appui terminal), doute < 5°',
        metric: 'peak_ankle_dorsiflexion_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['physiopedia_gait_cycle', 'rodda2001'],
        evaluate: threshold(pick.self('peak_ankle_dorsiflexion_stance'), 'below', 5, 0),
      },
      {
        id: 'hindfoot_varus',
        role: 'supporting',
        text: 'Arrière-pied en varus visible (estimation, vue postérieure : talon médial > 5°)',
        metric: 'heel_alignment_stance',
        thresholdType: 'proposed_heuristic',
        refs: [],
        evaluate: threshold(pick.self('heel_alignment_stance'), 'below', -5, -8),
      },
    ],
  },
  {
    id: 'dynamic_knee_valgus_varus',
    determinants: ['lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'fppa_asymmetry',
        role: 'primary',
        text: 'Variation du FPPA en appui > côté opposé + 5° (valgus si positif, varus si négatif), doute > + 2,5°',
        metric: 'fppa_peak_stance',
        thresholdType: 'proposed_heuristic',
        refs: ['willson2008'],
        evaluate: sideDelta('fppa_peak_stance', 'above', 2.5, 5, Math.abs),
      },
    ],
  },
  {
    id: 'asymmetric_stance',
    determinants: ['pelvic_rotation', 'foot_ankle_rockers'],
    global: true,
    criteria: [
      {
        id: 'si_stance_time',
        role: 'primary',
        text: 'Indice de symétrie du temps d’appui |G − D| / moyenne > 10 % (doute > 5 %)',
        metric: 'symmetry_index_stance_time',
        thresholdType: 'proposed_heuristic',
        refs: [],
        evaluate: threshold(pick.global('symmetry_index_stance_time'), 'above', 5, 10),
      },
      {
        id: 'si_step_length',
        role: 'primary',
        text: 'Indice de symétrie de la longueur de pas > 10 % (doute > 5 %)',
        metric: 'symmetry_index_step_length',
        thresholdType: 'proposed_heuristic',
        refs: [],
        evaluate: threshold(pick.global('symmetry_index_step_length'), 'above', 5, 10),
      },
    ],
  },
  {
    id: 'reduced_speed_fall_risk',
    determinants: ['pelvic_rotation', 'stance_knee_flexion', 'foot_ankle_rockers'],
    global: true,
    criteria: [
      {
        id: 'speed_below_norm',
        role: 'primary',
        text: 'Vitesse < norme par âge/sexe − 2 ET (Bohannon 1997 ; Hollman 2011 ≥ 70 ans)',
        metric: 'gait_speed',
        thresholdType: 'norm_relative',
        refs: ['bohannon1997', 'hollman2011'],
        evaluate: normZ(pick.global('gait_speed'), 'below', () => 0.1),
      },
      {
        id: 'speed_below_0_8',
        role: 'primary',
        text: 'Vitesse < 0,8 m/s : prédicteur d’issues défavorables chez ≥ 70 ans (< 0,6 m/s : déclin fonctionnel)',
        metric: 'gait_speed',
        thresholdType: 'published',
        refs: ['peel2013', 'sralab2024'],
        evaluate: threshold(pick.global('gait_speed'), 'below', 0.8, 0.6),
      },
    ],
  },
  {
    id: 'wide_base_ataxia',
    determinants: ['lateral_pelvic_displacement'],
    global: true,
    criteria: [
      {
        id: 'step_width_high',
        role: 'primary',
        text: 'Largeur de base > norme + 2 ET (Hollman 2011, ≥ 70 ans ; norme < 70 ans à confirmer)',
        metric: 'step_width_mean',
        thresholdType: 'norm_relative',
        refs: ['hollman2011'],
        evaluate: normZ(pick.global('step_width_mean'), 'above', () => 0.02),
      },
      {
        id: 'step_variability',
        role: 'supporting',
        text: 'Variabilité (CV) de la longueur de pas augmentée — seuil non publié (10 %, à définir)',
        metric: 'step_length_cv',
        thresholdType: 'proposed_heuristic',
        status: 'to_verify',
        refs: ['stolze2002'],
        evaluate: threshold(pick.self('step_length_cv'), 'above', 10, 15),
      },
    ],
  },
];


export const GAIT_FINDINGS: readonly FindingDefinition[] = DEFS.map((d) => {
  const j = FINDINGS_JSON.find((f) => f.id === d.id);
  if (!j) throw new Error(`findings.json : défaut ${d.id} absent`);
  return {
    id: d.id,
    kind: 'gait',
    name_fr: j.name_fr,
    name_en: j.name_en,
    criteria: d.criteria,
    determinants: d.determinants,
    causes: j.causes,
    differentials: j.differentials,
    management: j.management,
    refs: j.refs,
    evidenceLevel: j.evidenceLevel,
    camera2dLimits: j.camera2dLimits,
    audience: 'patient_and_clinician',
    ...(d.global ? { global: true } : {}),
  };
});
