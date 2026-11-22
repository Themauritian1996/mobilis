/**
 * Déviations de la marche prothétique (spec v2 §5) : catalogue prosthetic-findings.json (copie de
 * docs/gait-literature/prosthetic-findings.json) + critères mesurables encodés ici. Décisions cliniques :
 * TOUTES les déviations du catalogue produisent une sortie ; celles qui ne sont pas mesurables de façon fiable en 2D
 * (fouets médial/latéral, pistonnage, rotation du pied, hyperlordose) sont rendues en « à observer » (`observe`,
 * estimate, faible confiance) plutôt qu'omises. Audience : clinicien. Les amputés sont comparés à la norme générale ;
 * la symétrie reste rapportée comme métrique. Toujours « à valider par l'équipe (prothésiste, physiatre) ».
 */
import {
  evaluateFindings,
  pick,
  sideDelta,
  sideRatioPct,
  threshold,
  DEFAULT_GAIT_CONFIG,
  type AmputationLevel,
  type CriterionSpec,
  type DeterminantId,
  type FindingDefinition,
  type FindingResult,
  type GaitAnalysis,
  type GaitConfig,
  type ProsthesisInput,
} from '../gait/index.ts';
import prostheticJson from './data/prosthetic-findings.json';

interface JsonDeviation {
  readonly id: string;
  readonly name_fr: string;
  readonly name_en: string;
  readonly levels: readonly string[];
  readonly causes: Readonly<Record<string, readonly string[]>>;
  readonly suggestions_prosthetist: readonly string[];
  readonly exercises: readonly string[];
  readonly assistiveDevice: string | null;
  readonly confidence: string;
  readonly refs: readonly string[];
  readonly camera2dLimits?: string | null;
  readonly measurableByCamera?: boolean | null;
  readonly notes?: string | null;
  readonly safety?: string | null;
}

interface ProstheticFile {
  readonly causeCategories: Readonly<Record<string, string>>;
  readonly deviations: readonly JsonDeviation[];
  readonly disclaimer: string;
}

export const PROSTHETIC_CATALOG = prostheticJson as unknown as ProstheticFile;

interface Def {
  readonly id: string;
  readonly determinants: readonly DeterminantId[];
  readonly criteria: readonly CriterionSpec[];
  readonly observeOnly?: boolean;
}

const H = 'proposed_heuristic' as const;

const DEFS: readonly Def[] = [
  {
    id: 'abducted_gait',
    determinants: ['lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'step_width_high',
        role: 'primary',
        text: 'Largeur de base > norme + 2 ET (norme générale ; < 70 ans : seuil proposé 15 cm)',
        metric: 'step_width_mean',
        thresholdType: H,
        refs: ['hollman2011'],
        evaluate: (src, side) => {
          const m = src.get('step_width_mean');
          if (m?.norm?.sd)
            return threshold(
              pick.global('step_width_mean'),
              'above',
              m.norm.mean + 2 * m.norm.sd,
              m.norm.mean + 2.5 * m.norm.sd,
            )(src, side);
          return threshold(pick.global('step_width_mean'), 'above', 0.15, 0.18)(src, side);
        },
      },
    ],
  },
  {
    id: 'prosthetic_circumduction',
    determinants: ['knee_ankle_interaction', 'lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'lateral_arc_vs_sound',
        role: 'primary',
        text: 'Arc latéral du pied prothétique en oscillation > côté sain × 2 (doute > × 1,6)',
        metric: 'foot_lateral_excursion_swing',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideRatioPct('foot_lateral_excursion_swing', 'above', 60, 100),
      },
      {
        id: 'lateral_arc_abs',
        role: 'required',
        text: 'Arc latéral > 3 cm',
        metric: 'foot_lateral_excursion_swing',
        thresholdType: H,
        refs: [],
        evaluate: threshold(pick.self('foot_lateral_excursion_swing'), 'above', 0.03, 0.05),
      },
    ],
  },
  {
    id: 'prosthetic_vaulting',
    determinants: ['foot_ankle_rockers', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'sound_heel_rise_early',
        role: 'primary',
        text: 'Décollement du talon sain avant 31 % de son cycle pendant l’oscillation prothétique',
        metric: 'heel_rise_pct',
        thresholdType: H,
        refs: ['aapmr_normal_gait'],
        evaluate: threshold(pick.other('heel_rise_pct'), 'below', 31, 25),
      },
    ],
  },
  {
    id: 'prosthetic_hip_hiking',
    determinants: ['pelvic_list'],
    criteria: [
      {
        id: 'prosthetic_hemipelvis_higher',
        role: 'primary',
        text: 'Hémibassin prothétique plus haut que le sain en oscillation, > 3° (doute > 1,5°)',
        metric: 'pelvic_obliquity_swing',
        thresholdType: H,
        refs: ['kerrigan2000'],
        evaluate: threshold(pick.self('pelvic_obliquity_swing'), 'below', -1.5, -3),
      },
    ],
  },
  {
    id: 'lateral_trunk_bending',
    determinants: ['pelvic_list', 'lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'lean_toward_prosthesis',
        role: 'primary',
        text: 'Inclinaison vers le côté prothétique en appui > inclinaison vers le côté sain + 5° (doute + 2,5°)',
        metric: 'trunk_lateral_lean_toward_stance',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideDelta('trunk_lateral_lean_toward_stance', 'above', 2.5, 5),
      },
    ],
  },
  {
    id: 'prosthetic_foot_slap',
    determinants: ['foot_ankle_rockers'],
    criteria: [
      {
        id: 'foot_flat_fast',
        role: 'primary',
        text: 'Pied à plat atteint en < 50 % du temps du côté sain',
        metric: 'foot_flat_pct',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideRatioPct('foot_flat_pct', 'below', -35, -50),
      },
    ],
  },
  {
    id: 'terminal_swing_impact',
    determinants: ['knee_ankle_interaction'],
    criteria: [
      {
        id: 'knee_ext_velocity_high',
        role: 'primary',
        text: 'Vitesse d’extension du genou prothétique en fin d’oscillation > côté sain × 2 (proxy de la décélération brutale)',
        metric: 'knee_extension_velocity_tsw',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideRatioPct('knee_extension_velocity_tsw', 'above', 60, 100),
      },
    ],
  },
  { id: 'medial_whip', determinants: ['knee_ankle_interaction'], criteria: [], observeOnly: true },
  { id: 'lateral_whip', determinants: ['knee_ankle_interaction'], criteria: [], observeOnly: true },
  {
    id: 'uneven_heel_rise',
    determinants: ['knee_ankle_interaction'],
    criteria: [
      {
        id: 'knee_swing_excess',
        role: 'primary',
        text: 'Flexion maximale du genou prothétique en oscillation > côté sain + 15° (doute + 10°)',
        metric: 'peak_knee_flexion_swing',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideDelta('peak_knee_flexion_swing', 'above', 10, 15),
      },
    ],
  },
  {
    id: 'drop_off',
    determinants: ['foot_ankle_rockers', 'knee_ankle_interaction'],
    criteria: [
      {
        id: 'early_heel_off',
        role: 'primary',
        text: 'Décollement du talon prothétique précoce (< 40 % du cycle) et < côté sain − 8 %',
        metric: 'heel_rise_pct',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideDelta('heel_rise_pct', 'below', -8, -12),
      },
      {
        id: 'heel_off_abs',
        role: 'required',
        text: 'Décollement du talon < 40 % du cycle',
        metric: 'heel_rise_pct',
        thresholdType: H,
        refs: [],
        evaluate: threshold(pick.self('heel_rise_pct'), 'below', 40, 35),
      },
    ],
  },
  {
    id: 'tt_knee_hyperextension',
    determinants: ['stance_knee_flexion'],
    criteria: [
      {
        id: 'knee_lr_low',
        role: 'primary',
        text: 'Flexion du genou < 5° en réponse à la charge (norme ≈ 10–20°) ou extension au-delà de 0°',
        metric: 'knee_flexion_loading',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: threshold(pick.self('knee_flexion_loading'), 'below', 8, 5),
      },
    ],
  },
  {
    id: 'knee_instability',
    determinants: ['stance_knee_flexion'],
    criteria: [
      {
        id: 'knee_lr_high',
        role: 'primary',
        text: 'Flexion du genou > 25° en réponse à la charge (TT) — risque de chute : prioritaire',
        metric: 'knee_flexion_loading',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: threshold(pick.self('knee_flexion_loading'), 'above', 25, 30),
      },
    ],
  },
  {
    id: 'tt_mediolateral_thrust',
    determinants: ['lateral_pelvic_displacement'],
    criteria: [
      {
        id: 'fppa_vs_sound',
        role: 'primary',
        text: 'Déplacement frontal du genou en appui > côté sain + 5° (FPPA estimé)',
        metric: 'fppa_peak_stance',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideDelta('fppa_peak_stance', 'above', 2.5, 5, Math.abs),
      },
    ],
  },
  { id: 'lumbar_hyperlordosis', determinants: ['pelvic_rotation'], criteria: [], observeOnly: true },
  {
    id: 'uneven_step_length_timing',
    determinants: ['pelvic_rotation', 'foot_ankle_rockers'],
    criteria: [
      {
        id: 'si_step_length',
        role: 'primary',
        text: '|prothèse − sain| / moyenne de la longueur de pas > 10 % (doute > 5 %)',
        metric: 'symmetry_index_step_length',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: threshold(pick.global('symmetry_index_step_length'), 'above', 5, 10),
      },
      {
        id: 'prosthetic_stance_shorter',
        role: 'primary',
        text: 'Appui prothétique plus court que l’appui sain de > 10 % (doute > 5 %)',
        metric: 'stance_time',
        thresholdType: H,
        refs: ['physiopedia_amputee_gait'],
        evaluate: sideRatioPct('stance_time', 'below', -5, -10),
      },
    ],
  },
  { id: 'foot_rotation', determinants: ['pelvic_rotation'], criteria: [], observeOnly: true },
  { id: 'pistoning', determinants: ['stance_knee_flexion'], criteria: [], observeOnly: true },
];

/** Niveau du catalogue applicable (désarticulation du genou ≈ TF ; Syme/Chopart/partiel ≈ TT, to_verify). */
export function catalogLevel(level: AmputationLevel): 'transtibial' | 'transfemoral' {
  return level === 'transfemoral' || level === 'knee_disarticulation' || level === 'hip_disarticulation'
    ? 'transfemoral'
    : 'transtibial';
}

export const PROSTHETIC_DEVIATIONS: readonly (FindingDefinition & {
  levels: readonly string[];
  safety: string | null;
})[] = DEFS.map((d) => {
  const j = PROSTHETIC_CATALOG.deviations.find((x) => x.id === d.id);
  if (!j) throw new Error(`prosthetic-findings.json : déviation ${d.id} absente`);
  const causes = Object.entries(j.causes).flatMap(([cat, list]) =>
    list.map((c) => `${PROSTHETIC_CATALOG.causeCategories[cat] ?? cat} : ${c}`),
  );
  return {
    id: d.id,
    kind: 'prosthetic' as const,
    name_fr: j.name_fr,
    name_en: j.name_en,
    criteria: d.criteria,
    determinants: d.determinants,
    causes,
    differentials: [],
    management: [
      ...j.suggestions_prosthetist.map((s) => `À discuter avec le prothésiste : ${s}`),
      ...j.exercises,
      ...(j.assistiveDevice ? [`Aide technique : ${j.assistiveDevice}`] : []),
    ],
    refs: j.refs,
    evidenceLevel: j.confidence,
    camera2dLimits:
      j.camera2dLimits ??
      (d.observeOnly ? 'Non mesurable de façon fiable par une caméra 2D : à observer cliniquement.' : null),
    audience: 'clinician' as const,
    levels: j.levels,
    safety: j.safety ?? null,
    ...(d.observeOnly ? { observeOnly: true } : {}),
  };
});

export interface ProstheticAssessment {
  readonly prosthesis: ProsthesisInput;
  readonly catalogLevel: 'transtibial' | 'transfemoral';
  /** Toutes les déviations du niveau, côté prothétique (alerte, à observer, absente ou données insuffisantes). */
  readonly deviations: readonly (FindingResult & { safety: string | null })[];
  readonly disclaimer: string;
  readonly audience: 'clinician';
  readonly requiresClinicianValidation: true;
}

/**
 * Évalue les déviations prothétiques (côté prothétique = `self`, côté sain = `other`). Les amputés sont comparés à
 * la norme générale par `assessGait` ; ce module ajoute les déviations propres à la prothèse.
 */
export function assessProstheticGait(
  analyses: readonly GaitAnalysis[],
  prosthesis: ProsthesisInput,
  config: GaitConfig = DEFAULT_GAIT_CONFIG,
): ProstheticAssessment {
  const lvl = catalogLevel(prosthesis.level);
  const defs = PROSTHETIC_DEVIATIONS.filter((d) => d.levels.includes(lvl));
  const res = evaluateFindings(defs, analyses, config, [prosthesis.side]);
  return {
    prosthesis,
    catalogLevel: lvl,
    deviations: res.map((r) => {
      const d = defs.find((x) => x.id === r.id)!;
      const levelNote =
        prosthesis.level !== lvl
          ? [`Niveau ${prosthesis.level} : déviations extrapolées du niveau ${lvl} (to_verify).`]
          : [];
      return {
        ...r,
        side: prosthesis.side,
        suggestions: [...levelNote, ...r.suggestions],
        safety: d.safety,
      };
    }),
    disclaimer: PROSTHETIC_CATALOG.disclaimer,
    audience: 'clinician',
    requiresClinicianValidation: true,
  };
}
