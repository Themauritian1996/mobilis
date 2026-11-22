# ADR 0002 — Ports/adaptateurs ; Firebase isolé dans `services/*/firebase`

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §3 (« Firebase uniquement dans `services/*/firebase` (remplaçable) »), §8

## Contexte
En v1.15, Firebase (Auth, Firestore), Capacitor et Gemini sont appelés depuis `store.js`, `coach.js`, `live.js` et
quelques vues. Une future compagnie privée pourrait devoir changer d'hébergeur (résidence des données au Québec, Loi 25),
de fournisseur d'IA, ou faire valider la logique clinique indépendamment de l'infrastructure (IEC 62304).

## Décision
* `src/services/<x>/port.ts` définit une **interface** par service : `AuthPort`, `DatabasePort`, `AiPort`, `StoragePort`.
* Les adaptateurs vivent à côté : `memory/` (tests, démonstration), `firebase/` (production), `gemini/` (IA).
* Les domaines n'importent **que** les ports (types). L'assemblage se fait dans `src/main.ts` (racine de composition).
* Les dépendances appareil (Capacitor, caméra, voix, fichiers) passent par `src/platform/`.
* Règles automatiques (dependency-cruiser + ESLint) :
  `firebase-only-in-adapters`, `capacitor-only-in-platform`, `domains-only-service-ports`, `domains-not-platform`,
  `domains-not-ui`, `no-circular`, `core-is-pure`, `lower-layers-not-up`, `domains-internal-private`.
* Les adaptateurs Firebase et Gemini sont des squelettes (`NotImplementedError`) jusqu'à la tranche T2 de
  `docs/MIGRATION.md`, qui y déplace le code de `store.js`, `coach.js` et `live.js`.

## Conséquences
* Les tests de domaine utilisent les adaptateurs mémoire : rapides, sans réseau ni compte.
* Les règles de garde (consentement image pour l'IA, refus des types `video/*` pour le stockage) sont testées sur les
  adaptateurs mémoire et devront l'être sur chaque adaptateur de production.
* Les règles Firestore restent la seconde barrière (propriétaire seulement), indépendamment du code client.
