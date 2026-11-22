# ADR 0001 — TypeScript strict + Vite (+ Vitest)

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §1 et §3

## Contexte
La v1.15 est un ensemble d'ES modules JavaScript (~13 000 lignes dans `www/js`) servis tels quels, sans étape de build,
testés par 22 scripts Node autonomes. Le volet marche/prothèses/recherche ajoute des modèles de données riches (évaluations,
plans, protocoles) et des calculs dont les erreurs de type (unités, côtés, indices de repères) seraient cliniquement
dangereuses. Le code doit être lisible et vérifiable par un ingénieur externe.

## Décision
* **TypeScript 6** en mode `strict` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`)
  pour tout le code de `src/`. Le legacy est inclus avec `allowJs: true`, `checkJs: false` : il est analysé (imports,
  exports) sans être vérifié ; chaque fichier sera converti en `.ts` à sa migration.
* Imports relatifs avec extension `.ts` explicite (`allowImportingTsExtensions`) et syntaxe « effaçable » uniquement
  (pas d'`enum`, pas de propriétés de paramètres) : le même fichier est exécutable par Vite, Vitest **et** Node ≥ 22.18
  (retrait natif des types), ce qui permet aux scripts de test v1.15 d'exécuter du code migré.
* **Vite 8** (Rolldown) pour le serveur de développement et le build web (`dist/`, webDir de Capacitor). Pas de
  minification ni de hachage pendant la migration (voir ADR 0005).
* **Vitest 5** comme exécuteur de tests (projets `unit` et `legacy`).
* ESLint 10 (typescript-eslint `strict` + `stylistic`), Prettier (nouveau code seulement), `.editorconfig`.
* TypeScript 7 (portage natif) n'est pas retenu pour l'instant : typescript-eslint ne le prend pas encore en charge.

## Conséquences
* `npm run check` = lint + types + tests + build : un seul critère « vert ».
* Un build est désormais nécessaire pour l'APK et le site (`npm run build` avant `npx cap sync`).
* Le style compact du legacy est conservé jusqu'à sa migration (Prettier l'ignore), pour garder des diffs lisibles.
