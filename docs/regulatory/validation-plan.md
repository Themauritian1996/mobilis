# Plan de validation (gabarit)

> **Plan à établir. Aucun essai n'a été réalisé.** Les critères d'acceptation, les effectifs et les protocoles sont à définir avant toute collecte de données. Un essai impliquant des personnes requiert une approbation d'un comité d'éthique de la recherche avant le recrutement.

Statut : plan provisoire. Date : 2026-11-22.

## 1. Objectif

Démontrer que les mesures produites par Mobilis (amplitude articulaire, métriques de marche) sont exactes et reproductibles suffisamment pour l'usage prévu (voir `intended-use.md`), et connaître leurs limites.

## 2. Validation de l'amplitude articulaire par caméra contre goniomètre

| Élément | Plan provisoire |
|---|---|
| Référence | Goniomètre universel ou inclinomètre, mesure par un évaluateur formé |
| Mesure à l'étude | Angle calculé par Mobilis (`rom.js`) à partir du squelette |
| Articulations | [à choisir, par exemple épaule en élévation, genou en flexion, cheville en dorsiflexion] |
| Participants | [effectif à déterminer par calcul de puissance ou par convention documentée] ; sujets sains et patients, selon le protocole approuvé |
| Conditions | Éclairage, distance, hauteur de caméra et vêtements fixés et documentés |
| Répétitions | Deux évaluateurs ou deux répétitions par participant, pour la fidélité inter- et intra-évaluateur |
| Analyse | Coefficient de corrélation intraclasse (CCI), erreur absolue moyenne, graphique de Bland-Altman, limites d'accord |
| Critères d'acceptation | [à définir a priori, avant la collecte] |

## 3. Validation de la marche contre un laboratoire

| Élément | Plan provisoire |
|---|---|
| Référence | [à choisir : système de capture de mouvement en trois dimensions, plateforme de force, ou chronométrie et mesure de pas au tapis ou au sol selon ce qui est disponible] |
| Mesure à l'étude | Cadence, longueur de pas, vitesse, angles du genou et de la cheville aux phases clés |
| Vues | Latérale, frontale, postérieure (trois enregistrements indépendants, voir `spec-v2.md`, section 4.1) |
| Calibration | Taille du patient saisie ; mesure de l'échelle par objet de référence, à comparer |
| Participants | [effectif à déterminer] ; au minimum sujets sains, puis patients si l'usage l'exige |
| Analyse | CCI, erreur absolue moyenne, Bland-Altman ; comparaison selon la vue et la vitesse de marche |
| Critères d'acceptation | [à définir a priori] |

## 4. Validation de l'usage (utilisabilité)

- Essai avec des patients et des cliniciens réels ou simulés, sur les tâches de placement de la caméra et de lecture des résultats.
- Mesures : taux de réussite de la mise en place, temps, erreurs, compréhension des avertissements.
- Résultat attendu : les avertissements (placement, confiance faible) sont compris et suivis.

## 5. Éléments à documenter pour chaque essai

- Protocole approuvé (référence du comité d'éthique : [à compléter]).
- Versions du logiciel et des modèles (voir `NOTICE`).
- Matériel (modèle de téléphone, système d'exploitation, navigateur ou APK).
- Données : anonymisées, sans vidéo conservée par défaut, avec consentement écrit.
- Écarts au protocole et leur traitement.

## 6. Limites connues à décrire dans le rapport de validation

- Une seule caméra : perte d'information sur les mouvements hors du plan de la caméra.
- Dépendance à la qualité de la détection de pose (éclairage, vêtements, occlusion).
- Calibration par la taille : erreur liée à la perspective et à la pose du sujet.
- Les résultats ne valent que pour les conditions testées.

## 7. Rapport de validation

Produire un rapport qui regroupe protocole, données brutes agrégées, analyses, écarts et conclusion. Il est référencé dans le dossier de gestion des risques et dans le cycle de vie logiciel.
