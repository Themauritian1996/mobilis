/**
 * Domaine « research » — NOUVEAU : protocoles de mesure, chronologie d'interventions, comparaisons, exports.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Exports CSV/JSON/PDF avec anonymisation possible ; aucune vidéo conservée.
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'research',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;
