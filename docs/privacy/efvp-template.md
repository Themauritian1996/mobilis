# Évaluation des facteurs relatifs à la vie privée (EFVP) — gabarit

> **Gabarit vide.** L'EFVP est requise par la Loi 25 pour certains projets (acquisition, développement ou refonte de système d'information touchant des renseignements personnels) et avant tout communication hors Québec. Ce gabarit ne remplace pas l'avis d'un avocat.

Projet : Mobilis (v2). Date : [à compléter]. Responsable : Christophe Ah-Yan. Responsable de la protection des renseignements personnels : [à désigner].

## 1. Description du projet

- Objet et fonctions : [résumer les fonctions de `intended-use.md`].
- Utilisateurs : [patients, cliniciens, chercheurs].
- Plateformes : navigateur, APK Android, hébergement Firebase (Montréal).
- Changements par rapport à la version 1.15 : [à compléter].

## 2. Renseignements visés

Voir `data-inventory.md`. Résumer ici les catégories touchées par le projet et leur sensibilité (données de santé, données de mouvement, renseignements d'identification).

## 3. Finalités et nécessité

| Finalité | Renseignements nécessaires | Justification de la nécessité | Alternative moins intrusive envisagée |
|---|---|---|---|
| [ex. suivi de la prescription] | [ex. programme, séances] | [à compléter] | [à compléter] |

## 4. Consentement

- Mode d'obtention : [inscription, options dans Profil, consentement distinct pour l'IA générative].
- Retrait : [procédure et effets].
- Consentement pour les données de recherche : [à définir].

## 5. Flux et communications

| Flux | Source | Destination | Lieu (Québec, Canada, hors Canada) | Chiffrement | Sous-traitant | Entente |
|---|---|---|---|---|---|---|
| Synchronisation des données de programme et de séance | Appareil | Firestore | Montréal | En transit et au repos (Firebase) | Google | [à compléter] |
| Métriques et image fixe pour le coach IA (sur consentement) | Appareil | Gemini (Google) | [à évaluer : hors Québec] | [à vérifier] | Google | [à compléter] |
| Rapport PDF partagé | Appareil | [personne désignée par l'utilisateur] | [selon le destinataire] | [à compléter] | Aucun | Choix de l'utilisateur |

**Évaluation du transfert hors Québec** (si applicable) : [à compléter : régime juridique du lieu de destination, mesures contractuelles, sensibilité des données, consentement].

## 6. Mesures de protection

- Minimisation : aucune vidéo conservée ; données agrégées dans les rapports.
- Contrôle d'accès : règles Firestore (chaque patient voit ses données ; le clinicien voit les programmes partagés) ; tests des règles.
- Authentification : Google ou courriel (Firebase Auth).
- Secrets : aucun secret versionné (voir `SECURITY.md`).
- Journalisation et détection des incidents : [à compléter].
- Sauvegarde et restauration : [à compléter].
- Formation et engagements de confidentialité des personnes ayant accès : [à compléter].

## 7. Analyse des risques pour les personnes

| Risque | Probabilité | Gravité | Mesures existantes | Risque résiduel |
|---|---|---|---|---|
| Accès non autorisé à des données de santé | [à évaluer] | [à évaluer] | Règles Firestore, authentification | [à évaluer] |
| Transfert hors Québec sans information suffisante | [à évaluer] | [à évaluer] | Consentement explicite pour Gemini | [à évaluer] |
| Mauvaise identification du patient | [à évaluer] | [à évaluer] | Liaison explicite programme-patient | [à évaluer] |
| Conservation de données au-delà de la finalité | [à évaluer] | [à évaluer] | Durées à fixer (`data-inventory.md`) | [à évaluer] |
| Utilisation secondaire (recherche) sans consentement adéquat | [à évaluer] | [à évaluer] | Consentement de recherche (à définir) | [à évaluer] |

## 8. Conclusion et suivi

- Le projet peut-il se poursuivre tel que prévu : [oui, avec conditions, non].
- Conditions : [à compléter].
- Date de la prochaine revue : [à compléter].

## 9. Approbation

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Responsable du projet | Christophe Ah-Yan | | |
| Responsable de la protection des renseignements personnels | [à désigner] | | |
