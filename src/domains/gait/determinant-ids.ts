/**
 * Les six déterminants de la marche — Saunders JB, Inman VT, Eberhart HD (1953) « The major determinants in normal
 * and pathological gait », J Bone Joint Surg Am 35-A(3):543-558 (`saunders1953`). Cadre d'interprétation retenu par le
 * physiatre : « se rapprocher le plus possible d'une marche normale », y compris chez les patients et les amputés.
 * Leur rôle dans la réduction de l'excursion du centre de masse est discuté (Della Croce 2001, Gard & Childress 1997,
 * Kuo 2007 : voir README) ; ils servent ici de grille de lecture clinique, pas de modèle mécanique.
 */
export type DeterminantId =
  | 'pelvic_rotation'
  | 'pelvic_list'
  | 'stance_knee_flexion'
  | 'foot_ankle_rockers'
  | 'knee_ankle_interaction'
  | 'lateral_pelvic_displacement';

export interface DeterminantInfo {
  readonly id: DeterminantId;
  readonly n: number;
  readonly name_fr: string;
  readonly name_en: string;
  readonly plane: 'transverse' | 'frontal' | 'sagittal';
  /** Objectif de restauration (suggestion orientée vers le déterminant). */
  readonly restoration_fr: string;
}

export const DETERMINANTS: readonly DeterminantInfo[] = [
  {
    id: 'pelvic_rotation',
    n: 1,
    name_fr: 'Rotation pelvienne (plan transverse)',
    name_en: 'Pelvic rotation',
    plane: 'transverse',
    restoration_fr:
      'Restaurer la rotation pelvienne et la dissociation bassin–tronc (mobilité lombopelvienne, longueur de pas symétrique).',
  },
  {
    id: 'pelvic_list',
    n: 2,
    name_fr: 'Bascule pelvienne frontale (chute controlatérale ≈ 5°)',
    name_en: 'Pelvic list (frontal pelvic tilt)',
    plane: 'frontal',
    restoration_fr:
      'Restaurer une bascule pelvienne frontale physiologique (≈ 5°) : contrôle des abducteurs de hanche en appui unipodal, dégagement du membre oscillant sans élévation du bassin.',
  },
  {
    id: 'stance_knee_flexion',
    n: 3,
    name_fr: 'Flexion du genou en appui (≈ 15–20° en réponse à la charge)',
    name_en: 'Stance-phase knee flexion',
    plane: 'sagittal',
    restoration_fr:
      'Restaurer la flexion du genou en réponse à la charge (≈ 15–20°) puis son extension en mi-appui : contrôle excentrique du quadriceps, amortissement.',
  },
  {
    id: 'foot_ankle_rockers',
    n: 4,
    name_fr: 'Mécanismes pied–cheville (bascules du talon, de la cheville et de l’avant-pied)',
    name_en: 'Foot and ankle mechanisms (heel, ankle and forefoot rockers)',
    plane: 'sagittal',
    restoration_fr:
      'Restaurer les trois bascules : contact par le talon, dorsiflexion progressive en appui (bascule de cheville), décollement du talon et poussée de l’avant-pied.',
  },
  {
    id: 'knee_ankle_interaction',
    n: 5,
    name_fr: 'Interaction genou–cheville',
    name_en: 'Knee–ankle interaction',
    plane: 'sagittal',
    restoration_fr:
      'Restaurer l’interaction genou–cheville : extension du genou en appui terminal avec décollement du talon, flexion du genou en pré-oscillation et dégagement du pied en oscillation.',
  },
  {
    id: 'lateral_pelvic_displacement',
    n: 6,
    name_fr: 'Déplacement latéral du bassin (base étroite, valgus physiologique)',
    name_en: 'Lateral pelvic displacement',
    plane: 'frontal',
    restoration_fr:
      'Restaurer un déplacement latéral du bassin modéré sur une base étroite : équilibre médiolatéral, alignement frontal du genou, transfert de poids.',
  },
];

export function determinantInfo(id: DeterminantId): DeterminantInfo {
  return DETERMINANTS.find((d) => d.id === id)!;
}

/** Suggestions de restauration pour une liste de déterminants. */
export function restorationGoals(ids: readonly DeterminantId[]): string[] {
  return ids.map((id) => `Déterminant ${determinantInfo(id).n} — ${determinantInfo(id).restoration_fr}`);
}
