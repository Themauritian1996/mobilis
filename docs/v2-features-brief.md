# Brief commun — volets v2 (marche, prothèses, traitement, recherche, dossier patient)

À lire par chaque agent avant de coder. Lis aussi : `docs/spec-v2.md` (surtout §4–§7 et §10 « Décisions cliniques »), `docs/architecture.md`, `src/domains/gait/README.md`, `src/domains/gait/index.ts` (API du moteur), `src/core/types/clinical.ts`.

## Règles
- Branche : `git fetch origin dev-v2 && git checkout -B dev-v2-<volet> origin/dev-v2 && npm ci`. Jamais `main`, jamais pousser vers `dev-v2`. Pousse `git push -u origin dev-v2-<volet>`.
- **Ne touche qu'aux fichiers de ton volet** (liste dans ton brief). Besoin d'un changement ailleurs → décris-le dans ton compte rendu.
- Écrans : enregistre tes routes et entrées de navigation dans `src/ui/features/<volet>/routes.ts` avec `registerRoute` / `registerNav` (`src/ui/features/registry.ts`). Ne modifie pas `src/ui/router.ts`. Routes du volet clinique : `flag: 'gait'` (désactivé par défaut ; activable par `?flags=gait` ou par le réglage du dossier patient).
- Données : TOUJOURS `getRecordsDb()` (`src/services/db/records.ts`, interface `DatabasePort`) avec les collections de `CollectionMap` (`patients`, `assessments`, `plans`, `studies`, `interventions`, `annotations`, `followups`). Jamais Firestore directement. Chaque document a `schemaVersion: 1`, `createdAt`, `updatedAt`, `ownerUid` (voir `common.ts`). Aucune vidéo ni image stockée (`videoRetained: false`).
- Textes : chaînes de ton volet dans `src/ui/features/<volet>/strings.ts` au format `FeatureStrings` (fr + en obligatoires), utilisées via `makeT` (`src/ui/features/i18n.ts`). Pas de modification de `i18n-src/`. Français d'abord ; termes médicaux en français avec l'anglais entre parenthèses quand utile.
- Style visuel : réutilise les classes CSS et composants existants (`src/ui/components/*`, `www/css/*`, regarde `src/ui/views/rom.ts` et `clinic.ts`). Nouveau CSS : un seul fichier `www/css/<volet>.css` à toi, chargé dynamiquement par ton volet (ajoute un `<link>` au premier rendu) — ne modifie pas `www/index.html` ni `www/sw.js`.
- Sécurité clinique : toute suggestion porte « Suggestion fondée sur la littérature — à valider par le clinicien » ; affiche les références (`refs`) ; mesures `estimate` libellées « estimation » ; seuils `unvalidatedThresholds` signalés discrètement. Bandeau du volet : « Outil d'évaluation clinique — non homologué Santé Canada ».
- Qualité : TypeScript strict, pas d'`any`, fonctions pures dans `src/domains/<volet>/` avec tests Vitest ; écrans dans `src/ui/features/<volet>/`. `npm run check` vert, `npm run test:legacy` vert. Accessibilité : libellés, contraste, tailles tactiles ≥ 44 px, `aria-live` pour les consignes.
- Commits conventionnels terminés par :
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EasPwGujV5kGyCbNZF4uLK
  ```
  Commite tôt et souvent (une limite d'utilisation peut t'interrompre ; tu seras relancé).
- Compte rendu final court en français : ce qui est fait, fichiers, vérifications et résultats, écarts, changements partagés demandés.

## Volets et propriétaires
| Volet | Dossiers | Dépend de |
|---|---|---|
| patients (dossier patient) | `src/ui/features/patients/**`, `src/domains/clinic/**` (nouveaux fichiers), `src/services/db/**`, `firestore.rules`, `src/ui/views/{clinic,home,profile}.ts`, `www/css/patients.css` | — |
| gait (capture + résultats + A/B) | `src/ui/features/gait/**`, `www/css/gait.css` | moteur `src/domains/gait` |
| prosthetics | `src/ui/features/prosthetics/**`, `src/domains/prosthetics/**` (ajouts), `www/css/prosthetics.css` | gait (lit les évaluations `prosthetic_gait`) |
| treatment | `src/ui/features/treatment/**`, `src/domains/treatment/**`, `www/css/treatment.css` | lit les évaluations |
| research | `src/ui/features/research/**`, `src/domains/research/**`, `www/css/research.css` | lit les évaluations |

## Contrats entre volets (à respecter sans attendre les autres)
- **Patient courant** : route `#/<volet>/<patientId>` ; `patientId` = id du document `patients`. Un patient connecté (rôle patient) a un document `patients` dont l'id est son uid (`ensureSelfPatient` du volet patients ; d'ici là, crée-le toi-même si absent avec le même id = uid).
- **Évaluation de marche** : document `assessments` `kind: 'gait'` ou `'prosthetic_gait'`, `views`, `conditions` (aide technique, chaussures/prothèse, consigne, note « modification en direct »), `metrics` (résumé), `findings`, `engineVersion: 'gait-1'`, `result` = sortie sérialisable de `assessGait` (et de `assessProstheticGait` sous `result.prosthetic`), `customMeasures` calculées à la capture via `getActiveMeasures` (`src/domains/research/active-measures.ts`) + `measureCustomAngle`.
- **Liens d'écran** (ouvrir un autre volet) : `#/marche/<patientId>` (nouvelle capture), `#/marche-res/<assessmentId>` (résultat), `#/marche-ab/<idA>/<idB>` (comparaison), `#/prothese/<patientId>`, `#/plan/<patientId>`, `#/aides/<patientId>`, `#/recherche`, `#/suivi/<patientId>`, `#/patients`, `#/patient/<patientId>`.
