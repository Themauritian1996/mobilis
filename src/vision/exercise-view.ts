// Cadrage d'un exercice filmé : mouvements fins (main / pied) et description du plan de caméra, utilisés par le coach IA
// (domains/rehab/ai-coach) et par le coach vocal temps réel (services/ai/gemini/live). Code de www/js/ai-coach.js (v1.15).

export type FineKind = 'hand' | 'foot' | null;

/** Ce qu'il faut savoir d'un exercice pour décider du cadrage. */
export interface ViewedExercise {
  fig?: { view?: string | undefined } | null | undefined;
}

// Exercices fins (main, poignet, pouce, pied, cheville) : filmés de près, analysés sur la main ou le pied
export const fineKind = (ex: ViewedExercise): FineKind => {
  const v = ex.fig?.view || 'side';
  return v === 'hand' || v === 'palm' || v === 'end' ? 'hand' : v === 'foot' || v === 'footBack' ? 'foot' : null;
};

export function planeText(c: { ex?: ViewedExercise | null | undefined; plane?: string | undefined }): string {
  const fine = c.ex ? fineKind(c.ex) : null;
  if (fine === 'hand')
    return 'CLOSE-UP of the hand and wrist (fine movement): judge only the hand, wrist, fingers and thumb against the technique; the forearm should stay still on its support. Never comment on the trunk, legs or general posture.';
  if (fine === 'foot')
    return 'CLOSE-UP of the foot and ankle (fine movement): judge only the foot, toes and ankle against the technique; the leg should stay still. Never comment on the trunk or arms.';
  return c.plane === 'side'
    ? 'SIDE view (sagittal plane): you can judge flexion/extension, trunk lean, depth, heel lift; you CANNOT judge knee valgus or left/right symmetry'
    : c.plane === 'front'
      ? 'FRONT view (frontal plane): you can judge knee valgus, side lean, pelvic level, symmetry, shrugging; you CANNOT judge forward trunk lean, depth or lumbar arch'
      : 'mirror view: only judge gross posture that is clearly visible';
}
