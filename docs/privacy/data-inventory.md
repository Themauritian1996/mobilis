# Registre des renseignements personnels — Mobilis

> **Premier inventaire, à valider.** Il est établi à partir de `README.md`, `docs/spec-v2.md` et de la structure du code. Les champs marqués « à vérifier » doivent être confirmés dans le code et dans la configuration Firebase avant utilisation. Ce document n'est pas un avis juridique.

Date : 2026-11-22. Responsable : Christophe Ah-Yan. Dernière revue : [à compléter].

## Légende

- **Local** : stockage sur l'appareil de l'utilisateur (navigateur ou APK), sans envoi.
- **Firestore (Montréal)** : base de données Firebase dans la région `northamerica-northeast1`, avec authentification Firebase.
- **Gemini** : envoi à l'API Gemini de Google, uniquement avec consentement de l'utilisateur.

## 1. Inventaire

| # | Catégorie | Exemples de champs | Source | Où stocké | Finalité | Base (consentement ou autre) | Durée de conservation | Accès | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Identité et compte | Nom affiché, courriel, identifiant de compte (Google ou courriel) | Utilisateur | Firestore (Montréal) et Firebase Auth | Authentification, rattachement aux données | Exécution du service | Tant que le compte est actif, puis suppression à la demande [délai à fixer] | Utilisateur ; clinicien lié par programme | Authentification gérée par Firebase |
| 2 | Profil de santé | Pathologie, région du corps, date de début, drapeaux rouges du dépistage, limite de douleur | Utilisateur, clinicien | Local et Firestore | Choix et sécurité du programme | Consentement à l'inscription (à confirmer) | [à fixer] | Utilisateur ; clinicien lié | Données de santé |
| 3 | Programme et prescription | Exercices, niveaux, phases, répétitions, maintien, amplitude visée, calendrier | Clinicien, système | Local et Firestore | Exécution de la prescription | Exécution du service | [à fixer] | Utilisateur ; clinicien lié | Données de santé |
| 4 | Séances et mesures | Répétitions, qualité, durée, douleur après séance, mesure d'amplitude (angles) | Système (sur l'appareil) | Local et Firestore | Suivi de la progression, rapports | Exécution du service | [à fixer] | Utilisateur ; clinicien lié | Données de santé ; pas de vidéo |
| 5 | Questionnaires et retours | Réponses aux questionnaires (PROMs), commentaire écrit ou dicté après un exercice | Utilisateur | Local et Firestore | Suivi clinique | Exécution du service | [à fixer] | Utilisateur ; clinicien lié | La dictée peut passer par le service de reconnaissance vocale du téléphone ou du navigateur (à vérifier) |
| 6 | Marche (v2, drapeau `gait`) | Taille (cm), poids facultatif, côté atteint, aide technique, métriques de marche, cycles | Utilisateur, clinicien, système | Local et Firestore (v2) | Évaluation clinique | Consentement spécifique à définir | [à fixer] | Utilisateur ; clinicien lié | Données de santé et de mouvement corporel ; qualification à faire |
| 7 | Amputés et prothèses (v2) | Niveau d'amputation, côté, type de prothèse, emboîture, suspension | Utilisateur, clinicien | Firestore (v2) | Évaluation et plan de traitement | Consentement spécifique à définir | [à fixer] | Utilisateur ; clinicien lié | Données de santé sensibles |
| 8 | Plans de traitement (v2) | Actions proposées, objectifs mesurables, historique de versions | Clinicien, système | Firestore (v2) | Traitement | Exécution du service | [à fixer] | Utilisateur ; clinicien | Suggestions à valider par le clinicien |
| 9 | Recherche (v2) | Protocoles, chronologie d'interventions, identifiant de recherche | Clinicien | Firestore (v2) | Recherche clinique, comparaisons | Consentement de recherche (à définir) | [à fixer] | Clinicien chercheur | Anonymisation à définir ; approbation éthique requise |
| 10 | Vidéo de la caméra | Images de l'utilisateur pendant l'exercice | Caméra | **Non conservée, non transmise** (traitement sur l'appareil) | Analyse du mouvement | — | Aucune | — | Voir `docs/adr/0007-aucune-video.md` |
| 11 | Points du squelette | Coordonnées des points de repère (corps, main) | Traitement sur l'appareil | Mémoire de l'appareil pendant la séance | Analyse du mouvement | — | Durée de la séance | — | À vérifier : aucune transmission des coordonnées brutes |
| 12 | Image fixe envoyée à Gemini | Image-clé de la répétition, avec squelette dessiné | Système | Gemini (transmise) | Commentaire du coach IA | **Consentement explicite** (option dans Profil) | Selon la politique de Google pour l'API [à vérifier] | Google (fournisseur) | Désactivée par défaut |
| 13 | Métriques envoyées à Gemini | Angles, pourcentages d'amplitude, durée, qualité | Système | Gemini (transmises) | Commentaire du coach IA | **Consentement explicite** | Selon la politique de Google pour l'API [à vérifier] | Google (fournisseur) | Transfert hors Québec à évaluer |
| 14 | Rapports PDF | Rapport de suivi (données des catégories 2 à 5) | Système | Généré sur l'appareil ; partagé par l'utilisateur | Remise au clinicien ou au patient | Choix de l'utilisateur | Selon la gestion de l'appareil | Personne qui reçoit le rapport | Aucun envoi automatique (à vérifier) |
| 15 | Journaux techniques | Erreurs, versions, identifiants techniques | Système | À inventorier | Diagnostic | [à définir] | [à fixer] | Équipe | À vérifier : aucun outil d'analytique identifié dans les dépendances de production |

## 2. Points à vérifier avant publication

1. Confirmer, dans le code, ce qui est stocké localement et ce qui est synchronisé vers Firestore.
2. Confirmer l'état de la région Firestore (Montréal) et des sauvegardes.
3. Confirmer si les dictées passent par un service tiers (reconnaissance vocale du téléphone, du navigateur ou Gemini).
4. Confirmer si des journaux ou un service d'analytique envoient des données à l'extérieur.
5. Fixer les durées de conservation pour chaque catégorie.
6. Qualifier les données de mouvement corporel (catégories 6 et 7) au regard de la Loi 25.
7. Identifier les sous-traitants (Google, pour Firebase et Gemini) et leurs ententes.
