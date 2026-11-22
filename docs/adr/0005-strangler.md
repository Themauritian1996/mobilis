# ADR 0005 — Migration progressive « strangler »

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §2 (« Ne pas régresser : tous les tests v1.15 passent tout au long de la migration »)

## Contexte
Réécrire 13 000 lignes d'un coup bloquerait toute livraison et rendrait impossible la preuve de non-régression.

## Décision
1. **Le build sert d'abord l'app existante, inchangée.** `vite.config.ts` :
   * passe le graphe de `www/js/app.js` dans Rolldown avec `preserveModules` : chaque module garde son chemin
     (`js/app.js`, `js/data/exercises.js`…), sans minification ni hachage ; la liste de pré-cache de `sw.js`, les
     `new URL('../x', import.meta.url)` (protégés par un plugin) et les imports dynamiques fonctionnent tels quels ;
   * laisse `www/vendor/**` (Firebase, Capacitor, QR, MediaPipe) et `node:*` externes : copiés octet pour octet ;
   * copie le reste de `www/` à l'identique dans `dist/` ;
   * compile `src/main.ts` et tout module de `src/` importé par le legacy sous `dist/js/v2/**` (chemins stables) ;
   * ajoute au pré-cache de `dist/sw.js` les modules `js/v2/**` atteignables depuis `app.js` (et suffixe le nom du cache),
     pour que le hors-ligne reste complet.
   `scripts/check-dist.mjs` vérifie ces invariants à chaque build ; `tests/parity.e2e.mjs` compare l'écran rendu par
   la référence et par `dist/`, route par route.
2. **Migration fichier par fichier.** Le code passe en TypeScript dans `src/<cible>` ; `www/js/x.js` devient
   `export * from '@src/<cible>.ts';` (module de réexportation). Aucun importeur ne change. `tests/legacy-exports.spec.ts`
   garantit que les noms exportés restent ceux de la v1.15.
3. **Alias `@src`** commun à Vite, Vitest, TypeScript et Node (`scripts/register-src-alias.mjs`).
4. Le nouveau code qui dépend d'un module pas encore migré importe son chemin legacy (`www/js/…`) : avertissement
   `new-code-not-legacy`, à corriger à l'intégration. Un même module n'est donc jamais chargé deux fois.
5. **Fin de migration** : `index.html` charge `js/v2/main.js`, les modules de réexportation sont supprimés, la règle
   `new-code-not-legacy` passe en erreur, `www/` ne garde que les fichiers statiques.

## Conséquences
* Dès le premier module de réexportation, `www/` n'est plus servable seul (il importe `@src/…`) : on sert `dist/`
  (`npm run build && npm run serve:dist` ou `npm run dev`) et les e2e tournent sur `dist/` (`npm run test:e2e:dist`).
  La parité se mesure alors contre une copie de `main` (`MOBILIS_BASE=…/www npm run test:parity`).
* `capacitor.config.json` : `webDir` = `dist`. `android.yml` et `pages.yml` construisent `dist/` (sans effet tant que
  `dev-v2` n'est pas fusionnée dans `main`).
* Les utilitaires du bundler (`js/v2/_shared/preload-helper.js`, etc.) apparaissent dans `dist/` et sont pré-cachés.
