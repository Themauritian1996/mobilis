# Énoncé d'usage prévu — Mobilis

> **Brouillon à compléter.** Ce document n'est pas un avis réglementaire. Les champs entre crochets sont à remplir par le responsable du projet, après consultation d'un conseiller réglementaire.

Statut : brouillon. Date : 2026-11-22.

## 1. Énoncé d'usage (version provisoire)

Mobilis est une application logicielle qui guide une personne dans la réalisation d'exercices de réadaptation musculo-squelettique prescrits par un professionnel de la santé. L'application utilise la caméra d'un téléphone et un traitement sur l'appareil pour observer le mouvement en deux dimensions, compter les répétitions et donner des rétroactions.

[À compléter : type de personnes visées, par exemple « adultes en réadaptation musculo-squelettique suivis par un professionnel de la santé ».]

## 2. Utilisateurs et environnement

- **Utilisateur principal** : [patient, en domicile ou en clinique].
- **Utilisateur secondaire** : [clinicien (physiatre, physiothérapeute, ergothérapeute), qui crée ou partage des programmes].
- **Environnement** : [domicile, clinique, sans supervision directe, selon les cas].
- **Prérequis** : téléphone ou navigateur avec caméra, connexion facultative (hors ligne possible pour les exercices).

## 3. Bénéfice recherché

[À compléter. Exemple : aider à exécuter le programme prescrit, avec un retour sur la qualité du mouvement, et fournir au clinicien des données de suivi.]

## 4. Limites et exclusions

- Ne remplace pas l'évaluation d'un professionnel de la santé.
- Ne pose pas de diagnostic.
- Ne remplace pas une décision clinique sur la prescription ou l'ajustement d'un traitement.
- Mesures en deux dimensions, avec une seule caméra : erreurs de perspective et dépendance à la qualité de l'image (voir `validation-plan.md`).
- Populations et situations exclues : [à compléter, par exemple douleur au-delà de la limite fixée, drapeaux rouges, mineurs, grossesse].

## 5. Choix de la voie : bien-être ou instrument médical

Le choix conditionne toute la suite du dossier. Il doit être fait avant toute distribution à des utilisateurs externes.

| | Option A : bien-être et entraînement | Option B : instrument médical |
|---|---|---|
| Fonctions | Guidage d'exercices, comptage, rétroaction sur la forme, sans mention clinique | Mesure d'amplitude, analyse de marche, suggestions de traitement, suivi clinique |
| Allégations | Aucune allégation de diagnostic, de traitement ni de suivi clinique | Allégations cliniques autorisées seulement après homologation |
| Réglementation | Hors du régime des instruments médicaux, sous réserve de confirmation | Régime des instruments médicaux de Santé Canada (licence selon la classe) |
| Libellé | « Application d'entraînement, ne remplace pas un professionnel de la santé » | « Outil d'évaluation clinique — non homologué Santé Canada » tant que la voie n'est pas obtenue |
| Impact | Fonctions cliniques retirées ou masquées | Délais, coûts, système de qualité, validation |

**Décision :** [ ] Option A   [ ] Option B   [ ] Mixte (fonctions séparées par drapeau)   *Décision en attente.*

Date de décision : [à compléter]. Décidé par : [à compléter]. Conseil reçu de : [à compléter].

## 6. Fonctions concernées, à classer

| Fonction | Dans le code ou la spec | Donnée produite |
|---|---|---|
| Exercices guidés et comptage | `www/js/` (v1.15), `src/vision/` (v2) | Répétitions, qualité |
| Mesure d'amplitude (ROM) | `rom.js` | Angle, amplitude en pourcentage de la cible |
| Analyse de la marche | `docs/spec-v2.md`, section 4 (`gait`) | Métriques spatio-temporelles et cinématiques |
| Amputés et prothèses | `docs/spec-v2.md`, section 5 (`gait`) | Déviations, causes possibles |
| Plans de traitement et suggestions | `docs/spec-v2.md`, section 6 | Actions proposées au clinicien |
| Coach IA (Gemini) | `www/js/coach.js`, `live.js` | Corrections vocales, commentaires |
| Rapports PDF | `www/js/reportpdf.js` | Document de suivi |
