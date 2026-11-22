# ADR 0004 — Schéma de données versionné et migrations testées

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §3 (« Modèle de données versionné (`schemaVersion`) avec migrations testées »), §7

## Contexte
Les données des patients vivent à la fois sur l'appareil (localStorage) et dans Firestore, et des versions différentes de
l'app (web, APK pas à jour) lisent les mêmes documents. La v1.15 migre les profils de façon ad hoc
(`longterm.js` : `migrateProfile`, `migrateSessions`, `migrateJournal`).

## Décision
* Tout document persistant étend `Versioned { schemaVersion: number }` ; les interfaces de `src/core/types/clinical.ts`
  fixent la version courante par un type littéral (`schemaVersion: 1`).
* `src/core/schema.ts` : une `SchemaDefinition` par collection (`current` + liste de migrations pures `n → n+1`) et
  `migrate()` qui amène un document à la version courante. Un document sans `schemaVersion` (v1.15) est en version 0.
* Un document **plus récent** que l'app est refusé (`schema_too_new`) au lieu d'être tronqué.
* `assertCompleteChain()` est appelé dans les tests de chaque collection ; chaque migration a un test avec un document
  réel anonymisé de la version précédente.
* Les migrations ne suppriment jamais de données cliniques : elles les déplacent ou les conservent sous un champ `legacy`.

## Conséquences
* Les migrations de `longterm.js` deviennent des `Migration` 0 → 1 à la tranche T2.
* Les règles Firestore pourront vérifier `schemaVersion` à l'écriture.
