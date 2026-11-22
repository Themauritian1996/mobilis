/**
 * Domaine « clinic » — programmes cliniciens, partage, patients.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Code actuel : www/js/clinic.js (logique de partage / rx) (docs/MIGRATION.md).
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'clinic',
  featureFlag: null,
} as const satisfies DomainDescriptor;
