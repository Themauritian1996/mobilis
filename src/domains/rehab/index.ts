/**
 * Domaine « rehab » — exercices, programmes, séance, calendrier, progression, matériel.
 * Dépend uniquement de core, vision et des PORTS de services (jamais de ui ni de Firebase) : voir .dependency-cruiser.cjs.
 * Code actuel : www/js/program.js, longterm.js, calendar.js, session.js, train.js, equip.js, data/exercises.js… (docs/MIGRATION.md).
 */
import type { DomainDescriptor } from '../types.ts';

export const DOMAIN = {
  id: 'rehab',
  featureFlag: null,
} as const satisfies DomainDescriptor;
