// Registre des écrans des nouveaux volets (marche, prothèses, traitement, recherche, dossier patient).
// Chaque volet déclare ses routes et ses entrées de navigation dans src/ui/features/<volet>/routes.ts,
// sans modifier le routeur : router.ts consulte ce registre avant l'écran d'accueil.
import type { FlagName } from '../../core/flags.ts';

export interface FeatureRouteContext {
  /** Segments après le nom de route : #/nom/arg/arg2 */
  arg: string | undefined;
  arg2: string | undefined;
  /** Élément racine de l'application */
  root: HTMLElement;
  /** Fonctions de nettoyage appelées au prochain changement de route (caméra, minuteries…) */
  cleanup: (() => void)[];
}

export interface FeatureRoute {
  /** Premier segment du hash, ex. 'marche' pour #/marche */
  name: string;
  /** Drapeau requis (ex. 'gait') ; la route est ignorée si le drapeau est désactivé */
  flag?: FlagName;
  /** Rôles autorisés ; absent = tous */
  roles?: readonly ('patient' | 'clinician')[];
  render(ctx: FeatureRouteContext): unknown;
}

export interface FeatureNavItem {
  id: string;
  /** Clé i18n du libellé */
  labelKey: string;
  /** Hash cible, ex. '#/marche' */
  href: string;
  flag?: FlagName;
  roles?: readonly ('patient' | 'clinician')[];
  /** Où afficher l'entrée */
  place: 'clinic' | 'home' | 'profile';
  order?: number;
}

const routes = new Map<string, FeatureRoute>();
const nav: FeatureNavItem[] = [];

export function registerRoute(r: FeatureRoute): void {
  if (routes.has(r.name)) throw new Error(`Route déjà enregistrée : ${r.name}`);
  routes.set(r.name, r);
}

export function registerNav(item: FeatureNavItem): void {
  nav.push(item);
}

interface Gate {
  isEnabled(flag: FlagName): boolean;
}

const allowed = (x: { flag?: FlagName; roles?: readonly string[] }, flags: Gate, role: string | undefined): boolean =>
  (!x.flag || flags.isEnabled(x.flag)) && (!x.roles || (role !== undefined && x.roles.includes(role)));

export function findRoute(name: string, flags: Gate, role: string | undefined): FeatureRoute | undefined {
  const r = routes.get(name);
  return r && allowed(r, flags, role) ? r : undefined;
}

export function navItems(place: FeatureNavItem['place'], flags: Gate, role: string | undefined): FeatureNavItem[] {
  return nav
    .filter((n) => n.place === place && allowed(n, flags, role))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Pour les tests uniquement. */
export function _resetRegistry(): void {
  routes.clear();
  nav.length = 0;
}
