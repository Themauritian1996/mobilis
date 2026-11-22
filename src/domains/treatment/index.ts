/**
 * Domaine « treatment » — NOUVEAU : plans de traitement issus des défauts, aides techniques.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Le clinicien ajoute / retire / modifie chaque action ; rien n'est appliqué automatiquement.
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'treatment',
  featureFlag: 'gait',
} as const satisfies DomainDescriptor;
