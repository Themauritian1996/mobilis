// Entrées de navigation des volets v2 rendues dans les écrans existants (clinicien, accueil, profil).
// Rien n'est rendu si le drapeau `gait` est désactivé : aucun changement visible par défaut.
import { t } from '../../../../www/js/i18n.js';
import { createBrowserKeyValueStore } from '../../../platform/storage.ts';
import { loadFeatureFlags } from '../../../platform/flags.ts';
import { esc } from '../../components/html.ts';
import { icon } from '../../components/icons.ts';
import { navItems, type FeatureNavItem } from '../registry.ts';

export const gaitOn = (): boolean => {
  try {
    return loadFeatureFlags(createBrowserKeyValueStore(), globalThis.location?.search ?? '').isEnabled('gait');
  } catch {
    return false;
  }
};

const ICONS: Record<string, string> = { patients: 'stetho', 'my-record': 'doc' };

/** Libellé traduit par le volet (`label`) sinon clé i18n commune. */
export const navLabel = (n: FeatureNavItem): string => n.label?.() ?? t(n.labelKey);

/** Liste HTML (style `linklist` existant) des entrées d'un emplacement ; chaîne vide si drapeau inactif ou rien. */
export function featureNavHtml(place: FeatureNavItem['place'], role: string | undefined, title = ''): string {
  if (!gaitOn()) return '';
  let items: FeatureNavItem[];
  try {
    items = navItems(place, loadFeatureFlags(createBrowserKeyValueStore(), globalThis.location?.search ?? ''), role);
  } catch {
    return '';
  }
  if (!items.length) return '';
  return `${title ? `<h2>${esc(title)}</h2>` : ''}<div class="list linklist v2-nav" style="margin-top:12px">${items
    .map(
      (n) =>
        `<button class="toggle" data-go="${esc(n.href)}"><span class="li-ic">${icon(ICONS[n.id] ?? 'layers', 18)}</span><span class="grow"><b>${esc(navLabel(n))}</b></span><span class="chev" aria-hidden="true">${icon('chev', 18)}</span></button>`,
    )
    .join('')}</div>`;
}
