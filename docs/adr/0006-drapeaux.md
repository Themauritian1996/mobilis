# ADR 0006 — Drapeaux de fonctionnalité

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §2 (« Fonctions de marche/amputés/recherche derrière un drapeau `gait` (désactivé par défaut) »)

## Contexte
Les volets marche, prothèses, plans de traitement issus de la marche et recherche sont un outil d'évaluation clinique
**non homologué Santé Canada** tant que la voie réglementaire n'est pas choisie. Ils doivent pouvoir être livrés sur
`dev-v2` sans apparaître pour les patients de la v1.

## Décision
* `src/core/flags.ts` : `DEFAULT_FLAGS = { gait: false }`, `createFeatureFlags(overrides)` pur, noms inconnus ignorés,
  valeurs non booléennes ignorées.
* `src/platform/flags.ts` : surcharges lues dans le stockage local (`mobilis.flags`, JSON) puis dans l'URL
  (`?flags=gait`, `?flags=-gait`). Valeur illisible → défauts.
* Chaque domaine déclare son drapeau (`DOMAIN.featureFlag`) ; `ui/routeVisible()` masque les routes correspondantes ;
  `FeatureDisabledError` pour les appels directs.
* Tant que `gait` est actif, l'interface affiche « outil d'évaluation clinique — non homologué Santé Canada » et
  présente les conseils comme des suggestions à valider par le clinicien.

## Conséquences
* Aucun écran nouveau n'est visible par défaut ; tests unitaires (`src/core/flags.test.ts`, `src/main.test.ts`).
* Un futur mécanisme distant (Remote Config) se branchera comme une source de surcharges supplémentaire dans `platform`.
