# ADR 0007 — Aucune vidéo conservée ni envoyée

* Statut : acceptée — 2026-11-22
* Contexte : spec v2 §2, §7 ; Loi 25 (minimisation)

## Contexte
La v1.15 traite la caméra sur l'appareil ; seules des images ponctuelles peuvent être envoyées à Gemini, avec consentement.
L'analyse de la marche en 3 vues pourrait inciter à enregistrer des vidéos pour revoir les cycles.

## Décision
* Aucune vidéo n'est enregistrée, stockée (local ou nuage) ni transmise. Seules des **mesures dérivées** (repères,
  métriques, résultats) sont conservées.
* Garde-fous dans les types et les ports : `Assessment.videoRetained: false` (type littéral) ; `StoragePort` refuse
  tout type `video/*` (`isForbiddenMime`) ; `AiPort` refuse les images sans `imageConsent: true`.
* Les rapports et exports (CSV/JSON/PDF) ne contiennent pas d'image de la personne.

## Conséquences
* Les revues visuelles se font en direct (superposition) ou sur des courbes ; un éventuel mode « enregistrement » futur
  exigerait une nouvelle ADR, une EFVP (évaluation des facteurs relatifs à la vie privée) et un consentement explicite.
