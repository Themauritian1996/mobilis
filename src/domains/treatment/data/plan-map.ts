/**
 * Table de correspondance défaut / déterminant → actions du plan (spec v2 §6). DONNÉE SOURCÉE.
 *
 * Sources : les énoncés de prise en charge (`management`) de docs/gait-literature/findings.json et les
 * `exercises` / `suggestions_prosthetist` de prosthetic-findings.json, avec leurs références (ids de references.json).
 * Chaque lien exercice porte le `managementText` dont il découle, copié du catalogue. Le CHOIX de l'exercice de la
 * bibliothèque (src/domains/rehab/data/exercises.ts) pour illustrer cet énoncé est une proposition de conception,
 * à valider par le clinicien : aucune de ces sources ne nomme d'exercice de la bibliothèque. Un énoncé sans
 * exercice équivalent est signalé `exerciseId: null` (lacune de la bibliothèque, à combler ou à remplacer).
 */
import type { DeterminantId, DeviceSuggestion, ExerciseLink, FindingPlanEntry, TextSuggestion } from '../types.ts';

type D = DeterminantId;
const ex = (
  exerciseId: string,
  managementText: string,
  determinants: readonly D[],
  side?: 'affected' | 'both',
): ExerciseLink => ({
  exerciseId,
  managementText,
  determinants,
  ...(side ? { side } : {}),
});
const gap = (fr: string, en: string, managementText: string, determinants: readonly D[]): ExerciseLink => ({
  exerciseId: null,
  gapLabel: { fr, en },
  managementText,
  determinants,
});
const txt = (label: string, refs: readonly string[], condition?: string): TextSuggestion => ({
  label,
  refs,
  ...(condition ? { condition } : {}),
});
const dev = (
  label: string,
  kinds: DeviceSuggestion['kinds'],
  holdSide: DeviceSuggestion['holdSide'],
  refs: readonly string[],
  condition?: string,
): DeviceSuggestion => ({ label, kinds, holdSide, refs, ...(condition ? { condition } : {}) });

const AFO_TYSON =
  'Orthèse tibio-pédieuse (ankle-foot orthosis, AFO) : améliore vitesse et paramètres de marche après AVC (tyson2013)';

/** Plan d'action par défaut de marche (ids de findings.json). */
export const GAIT_PLAN: readonly FindingPlanEntry[] = [
  {
    findingId: 'foot_drop_steppage',
    exercises: [
      gap(
        'Renforcement des releveurs du pied (tibial antérieur)',
        'Dorsiflexor (tibialis anterior) strengthening',
        'Renforcement des releveurs si atteinte partielle ; étirement du triceps sural',
        ['foot_ankle_rockers', 'knee_ankle_interaction'],
      ),
      ex('calf_stretch', 'Renforcement des releveurs si atteinte partielle ; étirement du triceps sural', [
        'foot_ankle_rockers',
      ]),
    ],
    gaitTraining: txt('Entraînement à la marche, prévention des chutes', ['tyson2013', 'perry2010']),
    orthosis: [
      txt(AFO_TYSON, ['tyson2013']),
      txt('Stimulation électrique fonctionnelle (FES) du nerf fibulaire à discuter', ['stewart2008', 'pirker2017']),
    ],
    referral: [txt('EMG/ENG pour localiser la lésion', ['stewart2008'])],
    injection: txt(
      'Toxine botulique : évaluer seulement si composante spastique associée',
      ['simpson2016'],
      'Composante spastique associée',
    ),
  },
  {
    findingId: 'foot_slap',
    exercises: [
      gap(
        'Renforcement excentrique des releveurs du pied',
        'Eccentric dorsiflexor strengthening',
        'Renforcement excentrique des releveurs',
        ['foot_ankle_rockers'],
      ),
    ],
    orthosis: [txt('AFO légère ou à butée postérieure selon la sévérité', ['perry2010', 'stewart2008'])],
    referral: [txt('Exploration électrodiagnostique si nouveau', ['stewart2008'], 'Apparition récente')],
  },
  {
    findingId: 'circumduction',
    exercises: [
      ex('slr', 'Étirements, renforcement des fléchisseurs de hanche', ['knee_ankle_interaction']),
      gap(
        'Entraînement de la flexion du genou en pré-oscillation',
        'Pre-swing knee flexion training',
        'Entraînement de la flexion de genou en pré-oscillation',
        ['knee_ankle_interaction'],
      ),
    ],
    gaitTraining: txt('Entraînement de la flexion de genou en pré-oscillation (marche)', ['kerrigan2000', 'perry2010']),
    orthosis: [txt('AFO si pied tombant', ['kerrigan2000', 'tyson2013'], 'Pied tombant associé')],
    injection: txt(
      'Toxine botulique du droit fémoral si genou raide spastique (à évaluer)',
      ['kerrigan2000'],
      'Genou raide spastique',
    ),
  },
  {
    findingId: 'vaulting',
    exercises: [],
    gaitTraining: txt('Entraînement à la marche avec rétroaction visuelle', ['perry2010', 'aapmr_normal_gait']),
    referral: [
      txt(
        'Traiter la cause du membre long : mesurer l’inégalité de longueur, référence en orthèse/podiatrie au besoin',
        ['perry2010'],
      ),
    ],
  },
  {
    findingId: 'hip_hiking',
    exercises: [ex('slr', 'Renforcement des fléchisseurs de hanche', ['pelvic_list', 'knee_ankle_interaction'])],
    gaitTraining: txt('Entraînement à la marche', ['kerrigan2000']),
    orthosis: [txt('Traiter la cause : AFO (pied tombant) ou ajustement de longueur', ['kerrigan2000', 'tyson2013'])],
    injection: txt('Toxine botulique si spasticité (à évaluer)', ['kerrigan2000'], 'Spasticité associée'),
  },
  {
    findingId: 'trendelenburg',
    exercises: [
      ex('hip_abd_stand', 'Renforcement des abducteurs de hanche', ['pelvic_list', 'lateral_pelvic_displacement']),
      ex('clamshell', 'Renforcement des abducteurs de hanche', ['pelvic_list']),
      ex('iso_hip_abd', 'Renforcement des abducteurs de hanche', ['pelvic_list']),
    ],
    device: dev('Canne du côté controlatéral', ['cane'], 'contralateral', ['sehgal2021', 'bradley2011']),
    referral: [
      txt(
        'Investigation de la hanche (imagerie) et du nerf glutéal si nouveau',
        ['hardcastle1985', 'perry2010'],
        'Apparition récente',
      ),
      txt('Chirurgie à discuter selon la cause (réparation tendineuse, arthroplastie) : référence en orthopédie', [
        'hardcastle1985',
      ]),
    ],
  },
  {
    findingId: 'trendelenburg_compensated',
    exercises: [
      ex('hip_abd_stand', 'Renforcement des abducteurs', ['pelvic_list', 'lateral_pelvic_displacement']),
      ex('clamshell', 'Renforcement des abducteurs', ['pelvic_list']),
    ],
    device: dev('Canne controlatérale', ['cane'], 'contralateral', ['sehgal2021', 'bradley2011']),
    referral: [txt('Traitement de la douleur de hanche', ['perry2010'])],
  },
  {
    findingId: 'reduced_hip_flexion',
    exercises: [ex('slr', 'Renforcement des fléchisseurs de hanche', ['pelvic_rotation', 'knee_ankle_interaction'])],
    gaitTraining: txt('Entraînement à la marche', ['perry2010']),
    referral: [txt('Évaluer douleur et amplitude passive de la hanche', ['perry2010'])],
  },
  {
    findingId: 'reduced_hip_extension',
    exercises: [
      ex('hip_flex_stretch', 'Étirement des fléchisseurs de hanche (test de Thomas)', ['pelvic_rotation']),
      ex('heel_raise', 'Renforcement du triceps sural et des fessiers', ['foot_ankle_rockers']),
      ex('glute_bridge', 'Renforcement du triceps sural et des fessiers', ['pelvic_rotation']),
    ],
    gaitTraining: txt('Entraînement à la marche avec pas plus longs', ['perry2010']),
  },
  {
    findingId: 'stiff_knee',
    exercises: [
      gap('Étirements du quadriceps', 'Quadriceps stretching', 'Étirements du quadriceps', ['knee_ankle_interaction']),
      ex('slr', 'Renforcement des fléchisseurs de hanche et du triceps sural', ['knee_ankle_interaction']),
      ex('heel_raise', 'Renforcement des fléchisseurs de hanche et du triceps sural', [
        'foot_ankle_rockers',
        'knee_ankle_interaction',
      ]),
    ],
    injection: txt(
      'Toxine botulique du droit fémoral à évaluer (bloc diagnostique possible)',
      ['simpson2016'],
      'Composante spastique',
    ),
    referral: [
      txt(
        'Chirurgie de transfert du droit fémoral à discuter (surtout paralysie cérébrale) : référence en orthopédie',
        ['perry2010'],
      ),
    ],
  },
  {
    findingId: 'genu_recurvatum',
    exercises: [
      ex('wall_sit', 'Renforcement du quadriceps et des ischio-jambiers', ['stance_knee_flexion']),
      ex('bridge_long', 'Renforcement du quadriceps et des ischio-jambiers', ['stance_knee_flexion']),
      ex('step_down', 'Rétroaction (biofeedback), renforcement du quadriceps et des ischio-jambiers', [
        'stance_knee_flexion',
      ]),
    ],
    gaitTraining: txt('Rétroaction (biofeedback) sur le contrôle du genou en appui', ['bleyenheuft2010']),
    orthosis: [txt('AFO limitant la flexion plantaire (butée) ou orthèse de genou', ['bleyenheuft2010'])],
    injection: txt(
      'Toxine botulique du triceps sural si équin spastique (à évaluer)',
      ['simpson2016', 'bleyenheuft2010'],
      'Équin spastique',
    ),
  },
  {
    findingId: 'crouch',
    exercises: [
      ex('wall_sit', 'Renforcement du quadriceps et du triceps', ['stance_knee_flexion']),
      ex('sit_stand', 'Renforcement du quadriceps et du triceps', ['stance_knee_flexion']),
      ex('heel_raise', 'Renforcement du quadriceps et du triceps', ['foot_ankle_rockers']),
    ],
    orthosis: [txt('Orthèse de réaction au sol (GRAFO) à discuter', ['rodda2001'])],
    injection: txt('Toxine botulique des ischio-jambiers à évaluer', ['rodda2001'], 'Ischio-jambiers spastiques'),
    referral: [txt('Chirurgie multiniveau à discuter (paralysie cérébrale) : référence en orthopédie', ['rodda2001'])],
  },
  {
    findingId: 'antalgic',
    exercises: [],
    device: dev('Aide technique controlatérale (canne) pour décharger', ['cane'], 'contralateral', ['sehgal2021']),
    referral: [txt('Évaluer et traiter la douleur', ['perry2010']), txt('Imagerie selon la clinique', ['perry2010'])],
  },
  {
    findingId: 'dynamic_equinus_equinovarus',
    exercises: [
      ex('calf_stretch', 'AFO (tyson2013), plâtres sériés, étirements', ['foot_ankle_rockers']),
      ex('knee_to_wall', 'AFO (tyson2013), plâtres sériés, étirements', ['foot_ankle_rockers']),
    ],
    orthosis: [txt(AFO_TYSON, ['tyson2013']), txt('Plâtres sériés', ['simpson2016', 'rodda2001'])],
    injection: txt(
      'Toxine botulique (gastrocnémiens, soléaire, tibial postérieur) à évaluer',
      ['simpson2016'],
      'Spasticité du membre inférieur',
    ),
    referral: [
      txt('Chirurgie (allongement, transfert du tibial antérieur) à discuter : référence en orthopédie', ['rodda2001']),
    ],
  },
  {
    findingId: 'dynamic_knee_valgus_varus',
    exercises: [
      ex('clamshell', 'Renforcement de la hanche et contrôle neuromusculaire', ['lateral_pelvic_displacement']),
      ex('hip_abd_stand', 'Renforcement de la hanche et contrôle neuromusculaire', ['lateral_pelvic_displacement']),
      ex('step_down', 'Renforcement de la hanche et contrôle neuromusculaire', ['lateral_pelvic_displacement']),
    ],
    orthosis: [txt('Orthèses plantaires, genouillère de décharge (gonarthrose) à discuter', ['willson2008'])],
    referral: [txt('Évaluation orthopédique si thrust varus important', ['willson2008'], 'Thrust varus important')],
  },
  {
    findingId: 'asymmetric_stance',
    exercises: [],
    gaitTraining: txt('Entraînement à la marche symétrique (métronome, tapis)', ['perry2010']),
  },
  {
    findingId: 'reduced_speed_fall_risk',
    exercises: [
      ex(
        'sl_balance',
        'Exercices d’équilibre et de renforcement progressifs',
        ['lateral_pelvic_displacement', 'foot_ankle_rockers'],
        'both',
      ),
      ex('sit_stand', 'Exercices d’équilibre et de renforcement progressifs', ['stance_knee_flexion'], 'both'),
      ex('step_up', 'Exercices d’équilibre et de renforcement progressifs', ['stance_knee_flexion'], 'both'),
    ],
    device: dev('Aide technique adaptée (voir calculateur)', ['cane', 'walker', 'rollator'], 'either', [
      'sehgal2021',
      'bradley2011',
    ]),
    referral: [
      txt('Évaluation multifactorielle du risque de chute', ['monteroodasso2022']),
      txt('Révision des médicaments, vision, chaussures, domicile', ['monteroodasso2022']),
    ],
  },
  {
    findingId: 'wide_base_ataxia',
    exercises: [ex('sl_balance', 'Rééducation de l’équilibre', ['lateral_pelvic_displacement'], 'both')],
    device: dev('Canne simple si ataxie légère ; déambulateur si ataxie cérébelleuse', ['cane', 'walker'], 'either', [
      'sehgal2021',
    ]),
    referral: [txt('Bilan neurologique étiologique', ['stolze2002', 'pirker2017'])],
  },
];

/**
 * Plan d'action par déviation prothétique (ids de prosthetic-findings.json). Les suggestions d'ajustement
 * (emboîture, alignement, composants) et l'aide technique viennent du catalogue lui-même.
 */
export const PROSTHETIC_PLAN: readonly FindingPlanEntry[] = [
  {
    findingId: 'abducted_gait',
    exercises: [
      ex('hip_abd_stand', 'Renforcement des adducteurs et abducteurs de hanche', ['lateral_pelvic_displacement']),
      ex('sl_balance', 'Transfert de poids sur la prothèse, équilibre', ['lateral_pelvic_displacement']),
    ],
    device: dev(
      'Canne controlatérale temporaire si insécurité',
      ['cane'],
      'contralateral',
      ['physiopedia_amputee_gait'],
      'Insécurité',
    ),
  },
  {
    findingId: 'prosthetic_circumduction',
    exercises: [
      ex('slr', 'Renforcement des fléchisseurs de hanche', ['knee_ankle_interaction']),
      gap(
        'Entraînement à la flexion du genou prothétique en pré-oscillation',
        'Prosthetic pre-swing knee flexion training',
        'Entraînement à la flexion du genou prothétique en pré-oscillation',
        ['knee_ankle_interaction'],
      ),
    ],
  },
  {
    findingId: 'prosthetic_vaulting',
    exercises: [
      ex('slr', 'Entraînement à l’initiation de l’oscillation par les fléchisseurs de hanche', [
        'knee_ankle_interaction',
      ]),
    ],
    gaitTraining: txt('Rétroaction vidéo', ['physiopedia_amputee_gait']),
  },
  {
    findingId: 'prosthetic_hip_hiking',
    exercises: [ex('slr', 'Renforcement des fléchisseurs de hanche, contrôle du bassin', ['pelvic_list'])],
  },
  {
    findingId: 'lateral_trunk_bending',
    exercises: [
      ex('hip_abd_stand', 'Renforcement des abducteurs de hanche (côté amputé)', [
        'pelvic_list',
        'lateral_pelvic_displacement',
      ]),
      ex('sl_balance', 'Équilibre unipodal sur la prothèse', ['lateral_pelvic_displacement']),
    ],
    device: dev(
      'Canne du côté sain si faiblesse importante des abducteurs',
      ['cane'],
      'contralateral',
      ['gailey2008', 'physiopedia_amputee_gait'],
      'Faiblesse importante des abducteurs',
    ),
  },
  {
    findingId: 'prosthetic_foot_slap',
    exercises: [
      ex('glute_bridge', 'Contrôle de l’extension de hanche au contact initial (TF)', ['foot_ankle_rockers']),
    ],
  },
  {
    findingId: 'terminal_swing_impact',
    exercises: [],
    gaitTraining: txt(
      'Entraînement du contrôle de la hanche en fin d’oscillation, confiance dans la stabilité du genou',
      ['physiopedia_amputee_gait'],
    ),
  },
  {
    findingId: 'medial_whip',
    exercises: [
      gap(
        'Rééducation du contrôle rotatoire de la hanche',
        'Hip rotational control training',
        'Rééducation du contrôle rotatoire de la hanche',
        ['knee_ankle_interaction'],
      ),
    ],
  },
  {
    findingId: 'lateral_whip',
    exercises: [
      gap('Contrôle rotatoire de la hanche', 'Hip rotational control', 'Contrôle rotatoire de la hanche', [
        'knee_ankle_interaction',
      ]),
    ],
  },
  { findingId: 'uneven_heel_rise', exercises: [] },
  {
    findingId: 'drop_off',
    exercises: [
      ex('wall_sit', 'Renforcement du quadriceps et des extenseurs de hanche', ['stance_knee_flexion']),
      ex('glute_bridge', 'Renforcement du quadriceps et des extenseurs de hanche', ['stance_knee_flexion']),
    ],
  },
  {
    findingId: 'tt_knee_hyperextension',
    exercises: [
      ex('step_down', 'Renforcement excentrique du quadriceps', ['stance_knee_flexion']),
      ex('wall_sit', 'Contrôle de la flexion du genou en mise en charge', ['stance_knee_flexion']),
    ],
  },
  {
    findingId: 'knee_instability',
    exercises: [
      ex('glute_bridge', 'Renforcement des extenseurs de hanche et du quadriceps', ['stance_knee_flexion']),
      ex('wall_sit', 'Renforcement des extenseurs de hanche et du quadriceps', ['stance_knee_flexion']),
      ex('hip_flex_stretch', 'Étirement des fléchisseurs de hanche', ['stance_knee_flexion']),
    ],
    device: dev(
      'Aide bilatérale (déambulateur, 2 cannes) tant que le genou n’est pas sécuritaire',
      ['walker', 'cane'],
      'bilateral',
      ['physiopedia_amputee_gait', 'burris_prosthetic_gait'],
      'Genou non sécuritaire',
    ),
  },
  {
    findingId: 'tt_mediolateral_thrust',
    exercises: [
      ex('wall_sit', 'Renforcement du quadriceps et des abducteurs', ['lateral_pelvic_displacement']),
      ex('hip_abd_stand', 'Renforcement du quadriceps et des abducteurs', ['lateral_pelvic_displacement']),
    ],
  },
  {
    findingId: 'lumbar_hyperlordosis',
    exercises: [
      ex('hip_flex_stretch', 'Étirement des fléchisseurs de hanche', ['pelvic_rotation']),
      ex('glute_bridge', 'Renforcement des extenseurs de hanche et du tronc', ['pelvic_rotation']),
      ex('bird_dog', 'Renforcement des extenseurs de hanche et du tronc', ['pelvic_rotation']),
    ],
  },
  {
    findingId: 'uneven_step_length_timing',
    exercises: [
      ex('sl_balance', 'Transfert de poids sur la prothèse', ['pelvic_rotation']),
      ex('hip_flex_stretch', 'Étirement des fléchisseurs de hanche', ['pelvic_rotation']),
    ],
    gaitTraining: txt('Entraînement à la marche symétrique (métronome)', [
      'physiopedia_amputee_gait',
      'burris_prosthetic_gait',
    ]),
    device: dev('Aide technique selon l’équilibre', ['cane', 'walker'], 'either', ['physiopedia_amputee_gait']),
  },
  {
    findingId: 'foot_rotation',
    exercises: [
      gap('Contrôle rotatoire de la hanche', 'Hip rotational control', 'Contrôle rotatoire de la hanche', [
        'knee_ankle_interaction',
      ]),
    ],
  },
  { findingId: 'pistoning', exercises: [] },
];

/** Exercices de restauration par déterminant altéré (cadre des six déterminants de Saunders 1953, spec §10). */
export const DETERMINANT_PLAN: Readonly<
  Record<DeterminantId, { exercises: readonly { exerciseId: string; why: string }[]; refs: readonly string[] }>
> = {
  pelvic_rotation: {
    exercises: [
      { exerciseId: 'open_book', why: 'mobilité lombopelvienne et dissociation bassin–tronc' },
      { exerciseId: 'hip_flex_stretch', why: 'longueur du pas (extension de hanche)' },
    ],
    refs: ['saunders1953'],
  },
  pelvic_list: {
    exercises: [
      { exerciseId: 'hip_abd_stand', why: 'contrôle des abducteurs en appui unipodal' },
      { exerciseId: 'clamshell', why: 'contrôle des abducteurs en appui unipodal' },
      { exerciseId: 'side_plank', why: 'stabilité frontale du bassin' },
    ],
    refs: ['saunders1953'],
  },
  stance_knee_flexion: {
    exercises: [
      { exerciseId: 'step_down', why: 'contrôle excentrique du quadriceps (réponse à la charge)' },
      { exerciseId: 'wall_sit', why: 'contrôle du quadriceps en flexion contrôlée du genou' },
    ],
    refs: ['saunders1953', 'oberg1994'],
  },
  foot_ankle_rockers: {
    exercises: [
      { exerciseId: 'heel_raise', why: 'poussée de l’avant-pied (bascule de l’avant-pied)' },
      { exerciseId: 'knee_to_wall', why: 'dorsiflexion progressive en appui (bascule de cheville)' },
      { exerciseId: 'calf_stretch', why: 'longueur du triceps sural' },
    ],
    refs: ['saunders1953', 'physiopedia_gait_cycle'],
  },
  knee_ankle_interaction: {
    exercises: [
      { exerciseId: 'slr', why: 'flexion de hanche et dégagement du pied en oscillation' },
      { exerciseId: 'tke', why: 'extension du genou en appui terminal' },
    ],
    refs: ['saunders1953'],
  },
  lateral_pelvic_displacement: {
    exercises: [
      { exerciseId: 'sl_balance', why: 'équilibre médiolatéral, transfert de poids' },
      { exerciseId: 'hip_abd_stand', why: 'contrôle frontal du bassin' },
    ],
    refs: ['saunders1953'],
  },
};
