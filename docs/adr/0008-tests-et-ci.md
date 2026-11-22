# ADR 0008 — Stratégie de tests et CI de `dev-v2`

* Statut : acceptée — 2026-11-22

## Décision
* **Vitest** exécute : les tests unitaires du nouveau code (`src/**/*.test.ts`) ; un **adaptateur** qui lance chacun des
  22 scripts v1.15 (`tests/*.test.mjs`, liste unique dans `tests/legacy-suite.mjs`) dans un processus Node séparé
  (ils appellent `process.exit`) ; le contrat des exports legacy (`tests/legacy-exports.spec.ts`).
  Les scripts sont convertis en vrais tests Vitest au fil de la migration de leur module.
* **Playwright** : e2e v1.15 inchangés (variable `MOBILIS_WWW`), plus `tests/parity.e2e.mjs` (référence ↔ `dist`).
* **CI** `ci-v2.yml` (branches `dev-v2`, `dev-v2-*`, PR) : `check` (lint, types, tests, build, artefact web),
  `e2e` (Chromium, ffmpeg, modèles, parité + e2e sur `dist`), `apk` (APK debug en artefact, rétention 7 jours).
  `permissions: contents: read`, aucun secret, aucune Release, aucune publication.
* La CI de `main` (`android.yml`, `pages.yml`) garde ses déclencheurs et sa logique de Release ; elle construit `dist/`
  (nécessaire au nouveau `webDir`) et `pages.yml` refuse toute branche autre que `main`.

## Conséquences
* `movematch.test.mjs` (diagnostic statistique) reste hors de la suite, comme en v1.15.
* Les e2e qui téléchargent des modèles MediaPipe ou des photos sont ignorés (code 0) quand le réseau les bloque ; la CI
  GitHub dispose du réseau.
