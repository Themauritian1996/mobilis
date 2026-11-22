# Cycle de vie logiciel — IEC 62304 (gabarit)

> **Gabarit.** IEC 62304 décrit les processus de cycle de vie des logiciels de dispositifs médicaux. Ce document n'est pas une certification. La classe de sécurité logicielle dépend de la classification de l'application (voir `samd-classification.md`).

Statut : squelette. Date : 2026-11-22.

## 1. Classe de sécurité logicielle

| Classe | Définition (IEC 62304) | Classe retenue |
|---|---|---|
| A | Aucune blessure ni atteinte à la santé possible | Non déterminée |
| B | Blessure non grave possible | Non déterminée |
| C | Décès ou blessure grave possible | Non déterminée |

**Classe provisoire :** à déterminer après l'analyse des risques (`risk-management-iso14971.md`). Par prudence, traiter les fonctions de mesure clinique comme classe au moins B tant que la classe n'est pas fixée.

## 2. Processus à documenter

| Processus | Contenu attendu | Où dans le dépôt (existant ou à créer) |
|---|---|---|
| Planification du cycle de vie | Méthode de développement, outils, rôles, version | `CONTRIBUTING.md`, `docs/architecture.md` (existant, partiel) |
| Analyse des exigences logicielles | Exigences fonctionnelles et de sécurité, traçables | `docs/spec-v2.md` (existant, partiel) |
| Architecture logicielle | Couches, interfaces, éléments à risque | `docs/architecture.md`, `docs/adr/` (existant) |
| Conception détaillée | Pour les unités de classe B et C | À créer |
| Implémentation et vérification unitaire | Revue, conventions, tests unitaires | `npm run check`, Vitest (existant) |
| Intégration et tests d'intégration | Tests des interfaces entre couches | `tests/` (existant, partiel) |
| Tests du système | Scénarios complets, incluant la validation | `tests/*.e2e.mjs` (existant), `validation-plan.md` (à réaliser) |
| Résolution des problèmes | Suivi des anomalies et corrections | Issues GitHub (à formaliser) |
| Maintenance du logiciel | Mises à jour, correctifs, notifications | `CHANGELOG.md` (existant) |
| Gestion de la configuration | Versions, dépôt, étiquettes, dépendances | Git, `package-lock.json` (existant) |
| Gestion des risques | Lien avec ISO 14971 | `risk-management-iso14971.md` |
| Logiciels de tiers (SOUP) | Inventaire, version, licence, risques | `NOTICE` (existant, partiel) ; à compléter par un inventaire complet |

## 3. Éléments SOUP (logiciels de tiers)

Les composants suivants sont des SOUP (logiciels préexistants non développés pour le dispositif) : MediaPipe Tasks Vision, Firebase, Capacitor, jsPDF, qrcode-generator, les modèles de pose et de main, l'API Gemini. Pour chacun, documenter :

- la version utilisée et la raison de son choix ;
- les fonctions du dispositif qui en dépendent ;
- les anomalies connues et leur surveillance ;
- la procédure de mise à jour et de revalidation.

## 4. Documents à produire

- [ ] Plan de développement logiciel
- [ ] Spécification des exigences logicielles (version complète)
- [ ] Description de l'architecture logicielle
- [ ] Liste des SOUP avec analyse de risques
- [ ] Plan de tests et rapports de test
- [ ] Procédure de résolution des anomalies
- [ ] Procédure de maintenance et de publication

## 5. Revue

- Classe retenue : [à compléter].
- Responsable : Christophe Ah-Yan.
- Date : [à compléter].
