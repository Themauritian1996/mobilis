# Gestion des risques — ISO 14971 (gabarit)

> **Gabarit à remplir.** ISO 14971 décrit un processus de gestion des risques des dispositifs médicaux. Il n'est pas une autorisation réglementaire. Les cotations de gravité et de probabilité sont à établir par l'équipe, avec un conseiller, et non ici.

Statut : squelette, aucune cotation faite. Date : 2026-11-22.

## 1. Processus (ISO 14971)

1. Analyse des risques : identifier les dangers, les situations dangereuses et les préjudices possibles.
2. Évaluation des risques : coter la gravité et la probabilité (échelle à définir et à justifier).
3. Maîtrise des risques : définir les mesures de contrôle (conception, protection, information), par ordre de préférence.
4. Évaluation du risque résiduel : le risque est-il acceptable après contrôle ?
5. Revue globale et suivi après mise en marché.

## 2. Échelles (à établir)

- **Gravité** : [niveaux à définir, par exemple négligeable, mineure, grave, critique, mortelle].
- **Probabilité** : [niveaux à définir, avec justification].
- **Critère d'acceptation** : [à définir avant l'évaluation].

## 3. Tableau de dangers

| ID | Danger | Situation dangereuse | Préjudice possible | Contrôles proposés (à valider) | Gravité initiale | Probabilité initiale | Risque résiduel | Vérification |
|---|---|---|---|---|---|---|---|---|
| R-01 | Mesure erronée | La mesure d'amplitude ou de marche est fausse (caméra mal placée, éclairage, vue de côté non perpendiculaire, vêtements amples). | Décision clinique basée sur une mesure fausse ; progression trop rapide ou trop lente. | Guide de placement et vérification de la visibilité ; indice de confiance par mesure ; avertissement affiché ; validation (`validation-plan.md`). | à évaluer | à évaluer | à évaluer | Essai de validation (à réaliser) |
| R-02 | Conseil inadapté | Le coach suggère un exercice ou une correction qui ne convient pas à la pathologie, à la phase ou à la douleur du patient. | Aggravation de la lésion ou douleur accrue. | Liste fermée de corrections valides ; rejet des corrections contredites par les mesures ; règle de douleur ; validation du clinicien. | à évaluer | à évaluer | à évaluer | Tests de règles (à réaliser) ; revue clinique (à réaliser) |
| R-03 | Chute pendant l'exercice | Le patient perd l'équilibre pendant un exercice debout ou pendant la marche, l'application ne le signale pas. | Blessure, fracture. | Consigne de sécurité avant l'exercice (surface, appui) ; exercices assis ou avec appui proposés aux patients à risque ; consigne d'arrêt en cas de douleur ou de déséquilibre ; mention de la sécurité dans la documentation. | à évaluer | à évaluer | à évaluer | Revue des consignes ; essais en conditions réelles (à réaliser) |
| R-04 | Fuite de données | Accès non autorisé aux données de santé (compte, base de données, sauvegarde, journal). | Atteinte à la vie privée, préjudice moral, obligation de notification (Loi 25). | Règles Firestore « chaque patient voit seulement ses données » ; pas de vidéo conservée ; chiffrement en transit et au repos (Firebase) ; aucun secret versionné ; revue des règles. | à évaluer | à évaluer | à évaluer | Tests des règles de sécurité (à réaliser) ; revue de `docs/privacy/` |
| R-05 | Mauvaise identification du patient | Des mesures ou des séances sont attribuées au mauvais patient, ou un clinicien voit les données d'un autre patient. | Décision basée sur les données d'un autre patient ; atteinte à la vie privée. | Authentification (Google ou courriel) ; liaison explicite programme-patient ; affichage du nom dans les rapports ; contrôle d'accès clinicien par programme partagé. | à évaluer | à évaluer | à évaluer | Tests de contrôle d'accès (à réaliser) |

## 4. Risques à ajouter

- Mise à jour d'un modèle d'apprentissage ou d'une bibliothèque qui change le comportement de mesure (voir `NOTICE`).
- Réponse de l'IA générative (Gemini) hors des listes fermées, malgré les contrôles.
- Perte de connexion pendant une séance (mode hors ligne, synchronisation).
- Erreur d'interprétation des métriques de marche par un clinicien (confusion entre mesure en deux dimensions et mesure en trois dimensions).
- Erreur de saisie de la taille du patient, qui fausse la calibration.

## 5. Revue

- Revue par : [à compléter].
- Date de la prochaine revue : [à compléter].
- Lien avec `software-lifecycle-iec62304.md` : chaque contrôle est une exigence logicielle ou une étape du cycle de vie.
