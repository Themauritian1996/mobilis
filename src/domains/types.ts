import type { FlagName } from '../core/flags.ts';

/** Descripteur commun : chaque domaine déclare le drapeau qui le contrôle (null = toujours actif). */
export interface DomainDescriptor {
  readonly id: string;
  readonly featureFlag: FlagName | null;
}
