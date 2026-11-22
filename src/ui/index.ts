/**
 * ui : routeur, écrans (vues), composants, styles. Seule couche qui touche le DOM de l'app.
 * Code actuel : www/js/app.js (routeur + accueil), ui.js (composants), *-ui.js et vues des modules (docs/MIGRATION.md).
 */
import type { FeatureFlags } from '../core/flags.ts';
import type { DomainDescriptor } from '../domains/types.ts';

export interface Route {
  readonly path: string; // ex. « #/gait/capture »
  readonly domain: DomainDescriptor['id'];
}

export interface View {
  render(root: HTMLElement): void | Promise<void>;
  dispose?(): void;
}

/** Une route est visible si son domaine n'a pas de drapeau ou si le drapeau est actif. */
export function routeVisible(domain: DomainDescriptor, flags: FeatureFlags): boolean {
  return domain.featureFlag === null || flags.isEnabled(domain.featureFlag);
}
