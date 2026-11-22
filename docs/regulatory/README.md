# Dossier réglementaire — Mobilis

> **Ce dossier n'est pas un avis juridique ou réglementaire.** Les gabarits ci-dessous structurent le travail à faire. Chaque conclusion (classe, règle applicable, obligations) doit être confirmée par un conseiller en affaires réglementaires des dispositifs médicaux et, pour les questions de droit, par un avocat.

Date de l'état : 2026-11-22. Responsable : Christophe Ah-Yan.

## Contenu

| Document | Objet | Statut |
|---|---|---|
| [intended-use.md](intended-use.md) | Énoncé d'usage prévu ; choix entre bien-être et instrument médical | Brouillon, décision en attente |
| [samd-classification.md](samd-classification.md) | Classification du logiciel (SaMD) selon Santé Canada | Proposition, à confirmer |
| [risk-management-iso14971.md](risk-management-iso14971.md) | Gestion des risques (ISO 14971) : tableau de dangers | Squelette, évaluation non faite |
| [software-lifecycle-iec62304.md](software-lifecycle-iec62304.md) | Cycle de vie logiciel (IEC 62304) : classe de sécurité et processus | Squelette, classe non déterminée |
| [validation-plan.md](validation-plan.md) | Plan de validation : amplitude contre goniomètre, marche contre laboratoire | Plan à établir, aucun essai réalisé |

## Principes

1. **Le libellé d'usage suit la voie réglementaire choisie.** Tant que la voie n'est pas choisie, les fonctions de marche, d'amputés et de recherche (drapeau `gait`, désactivé par défaut) portent la mention « outil d'évaluation clinique — non homologué Santé Canada ». Voir `docs/spec-v2.md`, section 2.
2. **Aucune allégation non étayée.** Le produit ne prétend pas diagnostiquer, ni prescrire ou ajuster un traitement de façon autonome. Les conseils sont des suggestions fondées sur la littérature, à valider par un clinicien.
3. **Traçabilité.** Chaque exigence, chaque risque et chaque test de validation doit pouvoir être relié à un élément du code ou de la documentation (ADR, CHANGELOG, tests).
4. **Mise à jour.** Ce dossier est révisé à chaque changement de fonction clinique, à chaque changement de voie réglementaire et avant toute version destinée à des utilisateurs externes.

## Questions à soumettre à un conseiller réglementaire

- Quelle classe pour chaque fonction (exercices guidés, mesure d'amplitude, analyse de marche, suggestions de plan de traitement, coach IA) ?
- Quelle règle de classification s'applique à chaque fonction, et le logiciel relève-t-il de la règle applicable aux logiciels ?
- Faut-il une licence d'instrument médical, et quel est le parcours (demande, délais, documents) ?
- Une fonction bien-être peut-elle coexister avec une fonction clinique dans la même application, et comment séparer les deux ?
- Quelles exigences s'appliquent si l'application est distribuée au Canada hors Québec, et aux États-Unis ou en Europe ?
