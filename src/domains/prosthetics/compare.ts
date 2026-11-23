/**
 * Comparaison « avant / après ajustement » de deux évaluations prothétiques (spec §5, §10.11).
 * Fonctions PURES : entrée = deux `ProstheticAssessment` (sortie de `assessProstheticGait`), sortie = résumé comparé.
 * Un statut « retenu » = déviation `probable` ou `possible` (alerte). `observe` (non mesurable en 2D) et
 * `insufficient_data` ne permettent PAS de conclure à une résolution : elles sont rapportées à part (`unassessable`).
 * Suggestion fondée sur la littérature — à valider par l'équipe (prothésiste, physiatre).
 */
import type { FindingStatus } from '../gait/index.ts';
import type { ProstheticAssessment } from './deviations.ts';

/** Statut simplifié d'une déviation pour l'affichage. */
export type DeviationState = 'present' | 'possible' | 'observe' | 'absent' | 'insufficient';

export const stateOf = (status: FindingStatus): DeviationState => {
  switch (status) {
    case 'probable':
      return 'present';
    case 'possible':
      return 'possible';
    case 'observe':
      return 'observe';
    case 'absent':
      return 'absent';
    case 'insufficient_data':
      return 'insufficient';
  }
};

/** Déviation retenue (alerte) : présente ou possible. */
export const isRetained = (s: DeviationState): boolean => s === 'present' || s === 'possible';

export type DeviationChange = 'appeared' | 'resolved' | 'persistent' | 'unassessable' | 'absent_both';

export interface DeviationDelta {
  readonly id: string;
  readonly name_fr: string;
  readonly name_en: string;
  readonly a: DeviationState;
  readonly b: DeviationState;
  readonly change: DeviationChange;
  /** Score B − score A (0–1, confiance du défaut ; PAS un score global). `null` si non applicable. */
  readonly scoreDelta: number | null;
  /** Pour une déviation persistante : plus marquée, moins marquée ou équivalente en B (écart de score ≥ 0,1). */
  readonly trend: 'worse' | 'better' | 'same' | null;
}

export type ComparisonWarning = 'level_differs' | 'side_differs' | 'catalog_differs';

export interface ProstheticComparison {
  readonly appeared: readonly DeviationDelta[];
  readonly resolved: readonly DeviationDelta[];
  readonly persistent: readonly DeviationDelta[];
  /** Au moins un des deux états est « à observer » ou « données insuffisantes » : aucune conclusion automatique. */
  readonly unassessable: readonly DeviationDelta[];
  readonly absentBoth: number;
  /** Mises en garde (niveau ou côté différents, déviations propres à une seule évaluation). */
  readonly warnings: readonly ComparisonWarning[];
  readonly requiresClinicianValidation: true;
}

/** Écart de score à partir duquel une déviation persistante est jugée plus ou moins marquée. */
export const TREND_MIN_DELTA = 0.1;

const changeOf = (a: DeviationState, b: DeviationState): DeviationChange => {
  const ra = isRetained(a);
  const rb = isRetained(b);
  if (ra && rb) return 'persistent';
  if (!ra && rb) return a === 'absent' ? 'appeared' : 'unassessable';
  if (ra && !rb) return b === 'absent' ? 'resolved' : 'unassessable';
  if (a === 'absent' && b === 'absent') return 'absent_both';
  return 'unassessable';
};

/**
 * Compare deux évaluations prothétiques (A = avant, B = après). Déviations appariées par identifiant ; une déviation
 * absente d'une des deux listes (niveau différent) est traitée comme « données insuffisantes ».
 */
export function compareProstheticAssessments(a: ProstheticAssessment, b: ProstheticAssessment): ProstheticComparison {
  const ma = new Map(a.deviations.map((d) => [d.id, d]));
  const mb = new Map(b.deviations.map((d) => [d.id, d]));
  const ids = [...new Set([...a.deviations.map((d) => d.id), ...b.deviations.map((d) => d.id)])];

  const warnings: ComparisonWarning[] = [];
  if (a.prosthesis.level !== b.prosthesis.level) warnings.push('level_differs');
  if (a.prosthesis.side !== b.prosthesis.side) warnings.push('side_differs');
  if (ids.some((id) => !ma.has(id) || !mb.has(id))) warnings.push('catalog_differs');

  const deltas: DeviationDelta[] = ids.map((id) => {
    const da = ma.get(id);
    const db = mb.get(id);
    const sa: DeviationState = da ? stateOf(da.status) : 'insufficient';
    const sb: DeviationState = db ? stateOf(db.status) : 'insufficient';
    const change = changeOf(sa, sb);
    const scoreDelta = change === 'persistent' && da && db ? Math.round((db.score - da.score) * 100) / 100 : null;
    const trend =
      scoreDelta === null
        ? null
        : scoreDelta >= TREND_MIN_DELTA
          ? 'worse'
          : scoreDelta <= -TREND_MIN_DELTA
            ? 'better'
            : 'same';
    const ref = db ?? da;
    return {
      id,
      name_fr: ref?.name_fr ?? id,
      name_en: ref?.name_en ?? id,
      a: sa,
      b: sb,
      change,
      scoreDelta,
      trend,
    };
  });

  const pick = (c: DeviationChange): DeviationDelta[] => deltas.filter((d) => d.change === c);
  return {
    appeared: pick('appeared'),
    resolved: pick('resolved'),
    persistent: pick('persistent'),
    unassessable: pick('unassessable'),
    absentBoth: pick('absent_both').length,
    warnings,
    requiresClinicianValidation: true,
  };
}
