# ADR 0003 — Données cliniques en fichiers typés, versionnés et sourcés

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §2 (« toute valeur clinique cite sa source »), §3, §4.5

## Contexte
La v1.15 mélange parfois données et logique (`data/proms.js` calcule les scores, `data/romtests.js` les angles). La v2
ajoute des normes de marche, un catalogue de défauts, des règles prothétiques et des conseils, qui doivent être
vérifiables, révisables par un clinicien et traçables (gestion des risques ISO 14971).

## Décision
* Les données cliniques sont des **fichiers de données TypeScript** (`src/domains/<d>/data/*.ts`), séparés de la logique,
  typés par une interface du domaine et exportés `as const satisfies …`.
* Chaque entrée porte `reference: Reference | null` et `status: 'verified' | 'to_verify'` (type `Sourced` de
  `src/core/types/common.ts`). Une valeur sans source retrouvée est `reference: null, status: 'to_verify'` — jamais inventée.
* Chaque catalogue porte une version (`catalogVersion`) et un journal des modifications en tête de fichier ; un test
  vérifie que toute entrée `verified` a une référence complète (auteurs, année, titre).
* La logique (moteur de règles, scores, calculs) vit dans des modules distincts du domaine et ne contient aucune constante
  clinique en dur.
* Les données issues de la littérature pour la marche (normes, défauts) sont produites séparément
  (`docs/gait-literature/`) puis transcrites dans `src/domains/gait/data/`.

## Conséquences
* Revue clinique possible sans lire de code ; diff Git lisible pour chaque valeur.
* Les textes visibles restent traduits par le mécanisme i18n (clés), pas dupliqués dans les données.
