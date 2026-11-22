/**
 * Domaine « prosthetics » — NOUVEAU : amputés et prothèses (métriques, déviations, causes possibles, conseils).
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Suggestions fondées sur la littérature, à valider par l'équipe (prothésiste, physiatre).
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'prosthetics',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;
