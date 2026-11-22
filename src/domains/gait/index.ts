/**
 * Domaine « gait » — NOUVEAU : capture 3 vues, événements, cycles, métriques, normes, règles, résultats.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Outil d'évaluation clinique — non homologué Santé Canada. Données cliniques : data/gait-norms, data/gait-findings (fichiers typés, sourcés).
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'gait',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;
