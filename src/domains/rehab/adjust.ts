// Réglage permanent de la dose d'un exercice depuis « Ajuster mon programme » (reprise de www/js/app.js).

export type AdjustKey = 'sets' | 'reps' | 'hold' | 'rest';

/** Bornes et pas de chaque réglage : [min, max, pas]. */
export const ADJ_LIM: Record<AdjustKey, readonly [number, number, number]> = {
  sets: [1, 6, 1],
  reps: [3, 30, 1],
  hold: [5, 120, 5],
  rest: [0, 180, 15],
};

export interface AdjustDose {
  sets?: number | undefined;
  reps?: number | undefined;
  hold?: number | undefined;
  rest?: number | null | undefined;
}

/**
 * Dose réglée après un appui sur « − » (dir = -1) ou « + » (dir = 1) ; `null` si la valeur ne change pas (déjà à la borne).
 * Le résultat porte les quatre valeurs de la dose, la clé réglée étant remplacée.
 */
export function adjustDose(dose: AdjustDose, key: AdjustKey, dir: number): AdjustDose | null {
  const [lo, hi, step] = ADJ_LIM[key];
  const v = Math.max(lo, Math.min(hi, (dose[key] ?? 0) + step * dir));
  if (v === dose[key]) return null;
  return { sets: dose.sets, reps: dose.reps, hold: dose.hold, rest: dose.rest, [key]: v };
}

/** Plafond de niveau d'un exercice : celui du clinicien si la phase est verrouillée, sinon 5. */
export function levelCap(
  lockPhase: boolean | undefined,
  maxLevel: Record<string, number | undefined> | undefined,
  id: string,
): number {
  return lockPhase ? Math.max(1, maxLevel?.[id] ?? 5) : 5;
}
