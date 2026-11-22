# Contribuer à Mobilis

Ce document décrit le processus de contribution au dépôt. Le projet est propriétaire (voir `LICENSE`) : les contributions sont réservées aux personnes autorisées par écrit par le titulaire des droits.

## 1. Branches

| Branche | Rôle | Règles |
|---|---|---|
| `main` | Version publiée (v1.15 et versions 1.x) | **Protégée.** Aucune modification directe. Ne jamais la modifier sans confirmation écrite du titulaire. |
| `dev-v2` | Branche d'intégration de la v2 | Reçoit les fusions des branches de travail après revue et `npm run check`. |
| `dev-v2-*` (ex. `dev-v2-docs`, `dev-v2-gait-capture`) | Branches de travail | Créées depuis `dev-v2`, une par sujet. Supprimées après fusion. |

Créer une branche de travail :

```bash
git fetch origin dev-v2
git checkout -B dev-v2-<sujet> origin/dev-v2
```

## 2. Commits conventionnels

Chaque message de commit suit la spécification [Conventional Commits](https://www.conventionalcommits.org/fr/) :

```
<type>(<portée facultative>): <description à l'impératif, en français ou en anglais, sans point final>
```

Types usuels :

- `feat` : nouvelle fonctionnalité visible ;
- `fix` : correction de bogue ;
- `docs` : documentation seulement ;
- `refactor` : restructuration sans changement de comportement ;
- `test` : ajout ou correction de tests ;
- `build` : outillage, dépendances, pré-cache ;
- `ci` : intégration continue ;
- `chore` : maintenance diverse.

Un changement de comportement incompatible est signalé par `!` après le type (ex. `feat(api)!: ...`) et par une section « Changements incompatibles » dans `CHANGELOG.md`.

## 3. Avant toute fusion : `npm run check`

```bash
npm ci
npm run check
```

`npm run check` enchaîne le lint (ESLint, règles de dépendances, Prettier), la vérification des types (TypeScript), les tests (Vitest et scripts v1.15) et la construction web. **Aucune fusion vers `dev-v2` si cette commande échoue.**

Pour les changements qui touchent la caméra, la séance, la superposition ou la marche, lancer aussi les tests de bout en bout :

```bash
npm run test:e2e
```

## 4. Tests

- Tests unitaires : `*.test.ts` (Vitest) à côté du code, ou `tests/*.test.mjs` pour le code v1.15.
- Tests de bout en bout : `tests/*.e2e.mjs` (Playwright).
- Tout bogue corrigé doit être accompagné d'un test qui échoue avant la correction.
- Les tests n'utilisent **jamais** de données réelles de patients. Utiliser des fixtures fictives (`tests/fixtures/`).

## 5. Revue

- Toute fusion vers `dev-v2` passe par une demande de fusion (pull request) relue par au moins une personne désignée dans `CODEOWNERS`.
- L'auteur décrit le changement, les risques (sécurité, données de santé, impact clinique) et les tests exécutés.
- Un changement qui touche une fonction clinique, les données cliniques, la confidentialité ou les règles Firestore demande une revue supplémentaire et la mise à jour des documents de `docs/regulatory/` et `docs/privacy/` si nécessaire.

## 6. Règles de projet

- **Aucun secret dans le dépôt** : pas de clé d'API, de compte de service, de mot de passe ou de jeton. Voir `SECURITY.md`.
- **Données de santé** : aucune donnée personnelle réelle dans le code, les tests, les captures d'écran, les journaux ou les issues.
- **Valeurs cliniques** : chaque norme, règle ou conseil cite sa source. Une valeur non vérifiée est marquée `reference: null, status: "to_verify"`.
- **Dépendances** : ajouter une dépendance de production demande de vérifier sa licence et de la reporter dans `NOTICE`.
- **Décisions d'architecture** : les décisions importantes font l'objet d'une fiche dans `docs/adr/` (format numéroté).
- **Changelog** : toute modification visible est ajoutée à `CHANGELOG.md` sous `[Unreleased]` (ou sous la version en cours).
- **Migration** : suivre `docs/MIGRATION.md` pour déplacer du code de `www/js` vers `src/`.

## 7. Documents liés

- `docs/architecture.md` : architecture et couches
- `docs/spec-v2.md` : spécification v2
- `docs/adr/` : décisions d'architecture
- `docs/regulatory/` : usage prévu, classification, gestion des risques, cycle de vie logiciel
- `docs/privacy/` : registre des données et évaluation des facteurs relatifs à la vie privée
- `SECURITY.md` : signalement de vulnérabilités
