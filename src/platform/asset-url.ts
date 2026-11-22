/**
 * URL absolue d'un fichier de l'app (modèles MediaPipe, vendor/…) depuis un module de src/.
 * Dans `dist/`, les modules de src/ sont émis sous `js/v2/<chemin>` : la racine de l'app est donc 3 niveaux plus haut
 * (`js/v2/platform/` → `dist/`). Hors build (tests Node, `npm run dev`), la racine est `www/`. Le chemin est calculé
 * (pas de littéral) pour que Vite ne le réécrive pas en copie hachée : le service worker et le pré-cache attendent les
 * chemins d'origine.
 */
const FROM_BUILD = '../../../';
const FROM_SOURCE = '../../www/';

export function assetUrl(path: string): string {
  const built = import.meta.url.includes('/js/v2/');
  return new URL((built ? FROM_BUILD : FROM_SOURCE) + path, import.meta.url).href;
}
