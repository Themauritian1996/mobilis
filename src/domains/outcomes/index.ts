/**
 * Domaine « outcomes » — questionnaires PROMs, amplitude ROM, rapports PDF, badges, protocoles post-op.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Code actuel : www/js/questionnaires.js, rom.js, report.js, reportpdf.js, badges.js, data/proms.js… (docs/MIGRATION.md).
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'outcomes',
  featureFlag: null,
} as const satisfies DomainDescriptor;
