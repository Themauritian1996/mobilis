# Plan de migration v1.15 → v2 (`www/js` → `src/`)

> Stratégie : [ADR 0005 « strangler »](adr/0005-strangler.md). Architecture : [architecture.md](architecture.md).
> Inventaire produit à partir du graphe réel (`npx depcruise www/js --no-config --output-type json`) au commit de départ
> de `dev-v2` ; tailles en lignes et Kio (1 Kio = 1024 octets) des fichiers v1.15.

Il n'y a pas de dossier `data/` à la racine : les données cliniques v1.15 sont dans `www/js/data/` (8 fichiers, inclus
ci-dessous). Les paquets de langue `www/js/lang/*.js` sont générés par `scripts/build-lang.mjs` depuis `i18n-src/`.

## 1. Règles communes à toutes les tranches

1. **Un fichier migré garde son chemin legacy** : `www/js/x.js` devient exactement
   `export * from '@src/<cible>.ts';` (ajouter `export { default } from '…';` si le module avait un export par défaut).
   Plusieurs cibles → plusieurs lignes `export * from`. Aucun importeur legacy n'est modifié.
2. **Noms exportés identiques** : `tests/legacy-exports.spec.ts` doit rester vert sans régénérer l'instantané.
   Les signatures et comportements restent ceux de la v1.15 (on déplace et on type ; on ne « corrige » pas en passant —
   noter les anomalies dans la section 6).
3. **TypeScript strict**, syntaxe effaçable (`erasableSyntaxOnly`), imports relatifs **avec** l'extension `.ts`.
   Pas de `any` (utiliser `unknown` + garde de type) ; `// @ts-expect-error` interdit sans commentaire justificatif.
4. **Couches** : respecter `.dependency-cruiser.cjs` (`npm run lint:deps` sans erreur). Une dépendance vers un module
   **pas encore migré** (de n'importe quelle tranche) s'importe par son chemin legacy (`../../../www/js/x.js`) :
   avertissement `new-code-not-legacy` toléré, résolu à l'intégration. Ne jamais importer la cible TypeScript d'une
   autre tranche avant son intégration (les tranches restent indépendantes).
5. **Ne pas toucher** aux fichiers d'une autre tranche, ni à : `package.json`, `package-lock.json`, `vite.config.ts`,
   `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `.dependency-cruiser.cjs`, `www/sw.js`, `www/index.html`,
   `src/core/**` (sauf T2 : `src/core/config.ts`, `src/core/i18n*`), `src/main.ts`, `src/domains/*/index.ts`,
   `.github/**`, `docs/gait-literature/**`. Besoin d'un changement partagé → le noter dans le compte rendu de la tranche.
6. **Fichiers privés** d'un domaine dans `src/domains/<d>/internal/` ; tout le reste du domaine est son API publique.
7. **Tests** : les scripts `tests/*.test.mjs` ne sont pas modifiés (ils importent les chemins legacy, donc testent le
   nouveau code à travers les modules de réexportation). Chaque tranche ajoute des tests Vitest `*.test.ts` à côté de
   ses nouveaux modules (au minimum : un test par fonction pure exportée qui n'est pas couverte par un script v1.15).
8. **Aucun changement visible** : textes, styles, routes, clés de stockage (`mobilis.*`), forme des documents Firestore,
   et pré-cache du service worker (géré automatiquement par le build) restent identiques.
9. Branche `dev-v2-t1`, `dev-v2-t2` ou `dev-v2-t3` créée depuis `dev-v2` ; commits conventionnels
   (`refactor(vision): migrer overlay.js vers src/vision/overlay.ts`) ; un commit par fichier migré.

### Critères d'acceptation communs (chaque tranche, avant fusion dans `dev-v2`)

| # | Commande | Attendu |
|---|---|---|
| A1 | `npm run check` | vert (lint, dépendances, Prettier, types, Vitest, build + `verify:dist`) |
| A2 | `npm run test:legacy` | « 22 scripts de test v1.15 : OK » |
| A3 | `npx vitest run tests/legacy-exports.spec.ts` | vert, `tests/fixtures/legacy-exports.json` **inchangé** (`git diff --exit-code tests/fixtures`) |
| A4 | `git worktree add ../mobilis-v115 main && MOBILIS_BASE=../mobilis-v115/www npm run test:parity` | « Parité www/dist : OK » |
| A5 | `npm run test:e2e:dist` | mêmes résultats qu'avant la tranche (avec modèles MediaPipe : tout « ok ») |
| A6 | `npx depcruise src --config .dependency-cruiser.cjs` | 0 erreur ; avertissements `new-code-not-legacy` listés dans le compte rendu |
| A7 | `git diff --stat dev-v2...HEAD` | ne touche que les fichiers de la tranche (tableau §2) + leurs cibles `src/` + nouveaux tests |
| A8 | Grep | aucun `firebase` hors `src/services/*/firebase/`, aucun `@capacitor` hors `src/platform/`, aucun `any` explicite |

## 2. Inventaire exact et cibles

« Importé par » = nombre de modules `www/js` qui l'importent (statique ou dynamique). « Ordre » = tranche.rang
(migrer dans l'ordre croissant à l'intérieur d'une tranche : feuilles d'abord).

| Fichier v1.15 | Cible dans src/ | Domaine / couche | Lignes | Kio | Dépendances (statiques ; dynamiques) | Importé par (nb) | Tests v1.15 (import direct) | Ordre |
|---|---|---|---:|---:|---|---:|---|---|
| `www/js/data/anatomy.js` | `src/domains/rehab/data/anatomy.ts` | rehab (données) | 68 | 7.9 | — | 3 | — | **T1.1** |
| `www/js/data/exercises.js` | `src/domains/rehab/data/exercises.ts` | rehab (données) | 931 | 72.0 | — | 13 | equip, figures, hand, movematch, partial, protocols, realism, tracker | **T1.2** |
| `www/js/data/pathologies.js` | `src/domains/rehab/data/pathologies.ts` | rehab (données) | 304 | 40.3 | — | 6 | protocols | **T1.3** |
| `www/js/data/triage.js` | `src/domains/rehab/data/triage.ts` | rehab (données) | 246 | 22.8 | data/pathologies.js | 2 | protocols | **T1.4** |
| `www/js/data/substitutes.js` | `src/domains/rehab/data/substitutes.ts` | rehab (données) | 81 | 15.2 | — | 2 | equip | **T1.5** |
| `www/js/data/proms.js` | `src/domains/outcomes/data/proms.ts (catalogue) + src/domains/outcomes/proms.ts (scores, échéances)` | outcomes | 396 | 27.9 | — | 4 | proms, report | **T1.6** |
| `www/js/data/protocols.js` | `src/domains/outcomes/data/protocols.ts (+ src/domains/outcomes/protocols.ts : phases)` | outcomes | 466 | 65.0 | — | 4 | longterm, protocols | **T1.7** |
| `www/js/data/romtests.js` | `src/domains/outcomes/data/romtests.ts (catalogue) + src/vision/goniometry.ts (calcul des angles)` | outcomes + vision | 445 | 42.8 | — | 4 | rom | **T1.8** |
| `www/js/overlay.js` | `src/vision/overlay.ts` | vision | 128 | 7.0 | — | 4 | overlay | **T1.9** |
| `www/js/placement.js` | `src/vision/placement.ts` | vision | 257 | 17.8 | — | 2 | placement | **T1.10** |
| `www/js/figure.js` | `src/vision/figure/kinematics.ts (pose, interpParams) + src/ui/components/figure-svg.ts (rendu)` | vision + ui | 594 | 32.0 | data/anatomy.js, i18n.js | 2 | figures, hand, movematch, partial, realism, tracker | **T1.11** |
| `www/js/pose.js` | `src/vision/pose.ts (MediaPipe) + src/vision/rep-tracker.ts (Tracker, métriques)` | vision | 566 | 36.4 | config.js, overlay.js | 4 | hand, movematch, partial, realism, tracker | **T1.12** |
| `www/js/hand.js` | `src/vision/hand.ts` | vision | 120 | 6.4 | config.js, overlay.js | 2 | overlay | **T1.13** |
| `www/js/movematch.js` | `src/vision/movematch.ts` | vision | 264 | 16.6 | figure.js | 1 | movematch, realism | **T1.14** |
| `www/js/config.js` | `src/core/config.ts (valeurs) + src/platform/assets.ts (URL modèles/MediaPipe via import.meta.url)` | core + platform | 46 | 3.2 | — | 7 | — | **T2.1** |
| `www/js/i18n.js` | `src/core/i18n/engine.ts (t, tp, tr, langues) + src/core/i18n/messages.fr-en.ts (textes)` | core | 404 | 107.5 | — ; dyn. : lang/<code>.js (gabarit) | 19 | ailang, protocols, rom | **T2.2** |
| `www/js/audio.js` | `src/platform/audio.ts` | platform | 100 | 4.9 | — | 3 | live | **T2.3** |
| `www/js/offline.js` | `src/platform/offline.ts` | platform | 30 | 2.2 | — | 1 | — | **T2.4** |
| `www/js/program.js` | `src/domains/rehab/program.ts` | rehab | 407 | 21.8 | data/exercises.js, data/pathologies.js, data/proms.js, data/protocols.js | 13 | badges, calendar, longterm, maint, partial, program, protocols, report | **T2.5** |
| `www/js/longterm.js` | `src/domains/rehab/longterm.ts (migrations → core/schema.ts, sauvegarde/restauration)` | rehab | 206 | 14.0 | program.js | 7 | longterm, maint | **T2.6** |
| `www/js/equip.js` | `src/domains/rehab/equipment.ts` | rehab | 140 | 9.4 | data/anatomy.js, data/exercises.js, data/pathologies.js, data/substitutes.js, i18n.js | 4 | equip | **T2.7** |
| `www/js/store.js` | `src/services/auth/firebase/ + src/services/db/firebase/ + src/services/db/local/ + src/platform/files.ts (Capacitor)` | services + platform | 410 | 21.6 | config.js, longterm.js ; dyn. : vendor/capacitor.js, vendor/firebase.js | 16 | longterm, maint, sharedai | **T2.8** |
| `www/js/coach.js` | `src/services/ai/gemini/index.ts (gemini, parseJSON) + src/platform/speech.ts (TTS, dictée) + src/domains/rehab/coach.ts (consignes)` | services + platform + rehab | 356 | 20.2 | audio.js, config.js, i18n.js, store.js ; dyn. : vendor/capacitor.js | 7 | ailang, gemini, maint, sharedai | **T2.9** |
| `www/js/ai-coach.js` | `src/domains/rehab/ai-coach.ts (prompts ; via AiPort)` | rehab | 153 | 9.9 | coach.js, i18n.js, pose.js, store.js | 2 | — | **T2.10** |
| `www/js/live.js` | `src/services/ai/gemini/live.ts (API Live, WebSocket)` | services | 262 | 16.4 | ai-coach.js, audio.js, coach.js, config.js, i18n.js, store.js | 1 | ailang, live, sharedai | **T2.11** |
| `www/js/reportpdf.js` | `src/domains/outcomes/report-pdf.ts (jsPDF chargé par src/platform)` | outcomes | 400 | 25.4 | data/romtests.js ; dyn. : store.js | 1 | report | **T2.12** |
| `www/js/report.js` | `src/domains/outcomes/report.ts (logique) + src/ui/views/report.ts (carte, #/rapport)` | outcomes + ui | 370 | 25.5 | data/exercises.js, data/proms.js, data/protocols.js, data/romtests.js, i18n.js, program.js, reportpdf.js, rom.js, state.js ; dyn. : badges.js, store.js, ui.js | 2 | report | **T2.13** |
| `www/js/lang/ar.js` | `inchangé (généré par scripts/build-lang.mjs) ; déplacé en src/core/i18n/lang/ à l'intégration` | core (généré) | 2 | 235.5 | — | 1 (i18n.js, import dynamique par gabarit) | — | **—** |
| `www/js/lang/es.js` | `idem` | core (généré) | 2 | 193.5 | — | 1 (i18n.js, import dynamique par gabarit) | — | **—** |
| `www/js/lang/pt.js` | `idem` | core (généré) | 2 | 192.1 | — | 1 (i18n.js, import dynamique par gabarit) | — | **—** |
| `www/js/lang/zh.js` | `idem` | core (généré) | 2 | 172.4 | — | 1 (i18n.js, import dynamique par gabarit) | — | **—** |
| `www/js/state.js` | `src/ui/app-state.ts (état, go/render) — casser le cycle state → rom` | ui | 44 | 2.0 | program.js, store.js ; dyn. : rom.js | 13 | — | **T3.1** |
| `www/js/ui.js` | `src/ui/components/*.ts (icônes, feuilles, toasts, nav)` | ui | 268 | 21.1 | data/anatomy.js, data/exercises.js, figure.js, i18n.js, longterm.js, store.js ; dyn. : coach.js | 11 | — | **T3.2** |
| `www/js/protocols-ui.js` | `src/ui/views/protocol.ts` | ui | 130 | 10.7 | data/exercises.js, data/protocols.js, i18n.js, program.js, state.js | 3 | protocols | **T3.3** |
| `www/js/badges.js` | `src/domains/outcomes/badges.ts (évaluation pure) + src/ui/views/badges.ts` | outcomes + ui | 199 | 10.0 | i18n.js, program.js ; dyn. : state.js, ui.js | 3 | badges | **T3.4** |
| `www/js/questionnaires.js` | `src/ui/views/proms.ts` | ui | 367 | 29.3 | data/proms.js, i18n.js, state.js, store.js, ui.js | 3 | — | **T3.5** |
| `www/js/equipui.js` | `src/ui/views/equipment-help.ts` | ui | 111 | 8.8 | coach.js, data/exercises.js, data/substitutes.js, equip.js, i18n.js, program.js, store.js ; dyn. : state.js | 2 | equip | **T3.6** |
| `www/js/history.js` | `src/ui/views/history.ts` | ui | 179 | 15.8 | data/exercises.js, data/proms.js, data/romtests.js, i18n.js, longterm.js, program.js, state.js, store.js, ui.js | 2 | — | **T3.7** |
| `www/js/calendar.js` | `src/ui/views/calendar.ts (+ src/domains/rehab/calendar.ts : ICS, rappels) — casser le cycle onboarding ↔ calendar` | ui + rehab | 255 | 18.3 | data/exercises.js, history.js, i18n.js, longterm.js, onboarding.js, program.js, state.js, store.js, ui.js | 2 | — | **T3.8** |
| `www/js/onboarding.js` | `src/ui/views/onboarding.ts` | ui | 332 | 26.1 | data/exercises.js, data/pathologies.js, data/protocols.js, data/triage.js, i18n.js, longterm.js, program.js, protocols-ui.js, questionnaires.js, rom.js, state.js, store.js, train.js, ui.js ; dyn. : calendar.js | 3 | — | **T3.9** |
| `www/js/session.js` | `src/ui/views/session.ts` | ui | 146 | 11.9 | data/exercises.js, data/triage.js, equip.js, equipui.js, i18n.js, program.js, state.js, train.js, ui.js | 1 | — | **T3.10** |
| `www/js/rom.js` | `src/domains/outcomes/rom.ts (logique pure) + src/ui/views/rom.ts (flux de mesure, historique)` | outcomes + ui | 848 | 69.6 | data/romtests.js, hand.js, i18n.js, overlay.js, placement.js, pose.js, state.js, store.js ; dyn. : coach.js, ui.js | 5 | report, rom | **T3.11** |
| `www/js/train.js` | `src/ui/views/train.ts (+ src/domains/rehab/training.ts : résumé, ajustement de niveau)` | ui + rehab | 1014 | 74.2 | ai-coach.js, audio.js, coach.js, data/exercises.js, equip.js, hand.js, i18n.js, live.js, movematch.js, overlay.js, placement.js, pose.js, program.js, state.js, store.js, ui.js ; dyn. : badges.js | 4 | — | **T3.12** |
| `www/js/clinic.js` | `src/ui/views/clinic.ts (+ src/domains/clinic/rx.ts : partage, code, QR)` | ui + clinic | 352 | 35.2 | config.js, data/exercises.js, data/pathologies.js, equip.js, i18n.js, longterm.js, onboarding.js, program.js, protocols-ui.js, questionnaires.js, rom.js, state.js, store.js, train.js, ui.js ; dyn. : vendor/qrcode.js, report.js | 1 | — | **T3.13** |
| `www/js/app.js` | `src/ui/router.ts + src/ui/views/home.ts, library.ts, profile.ts… ; src/main.ts devient le point d'entrée` | ui | 633 | 54.2 | badges.js, calendar.js, clinic.js, coach.js, config.js, data/exercises.js, data/pathologies.js, equipui.js, history.js, i18n.js, longterm.js, onboarding.js, pose.js, program.js, protocols-ui.js, questionnaires.js, rom.js, session.js, state.js, store.js, train.js, ui.js ; dyn. : offline.js, report.js | 0 | — | **T3.14** |


Totaux : **T1** 14 fichiers, 4 866 lignes (dont ~2 900 de données) ; **T2** 13 fichiers de code, 3 284 lignes
(+ 4 paquets de langue générés, non migrés à la main) ; **T3** 14 fichiers, 4 878 lignes. Total : 45 fichiers, 13 028 lignes.

### Cycles existants (à casser par la tranche propriétaire)

| Cycle (legacy) | Nature | Tranche | Piste |
|---|---|---|---|
| `state.js → rom.js → state.js` | `state.fullSummary()` importe dynamiquement `rom.summaryPart` | T3 | extraire `summaryPart` dans `src/domains/outcomes/rom.ts` (pur), importé par `app-state.ts` |
| `calendar.js → onboarding.js → calendar.js` | `onboarding` importe dynamiquement `calendar.scheduleReminders` | T3 | déplacer les rappels dans `src/domains/rehab/calendar.ts` (pur) ou passer par le bus (`core/events`) |

## 3. Les trois tranches (fichiers disjoints, exécutables en parallèle)

Les tranches ne partagent **aucun** fichier legacy ni aucun fichier cible. Les dépendances entre tranches passent par
les chemins legacy (règle 4), stables grâce aux modules de réexportation : l'ordre de fusion des tranches est libre.

### T1 — Vision et données cliniques (pur, très couvert par les tests)
* **Fichiers** : `data/anatomy.js`, `data/exercises.js`, `data/pathologies.js`, `data/triage.js`, `data/substitutes.js`,
  `data/proms.js`, `data/protocols.js`, `data/romtests.js`, `overlay.js`, `placement.js`, `figure.js`, `pose.js`,
  `hand.js`, `movematch.js`.
* **Cibles** : `src/domains/rehab/data/`, `src/domains/outcomes/data/` (+ `proms.ts`, `protocols.ts`),
  `src/vision/` (`overlay.ts`, `placement.ts`, `figure/kinematics.ts`, `pose.ts`, `rep-tracker.ts`, `hand.ts`,
  `movematch.ts`, `goniometry.ts`), `src/ui/components/figure-svg.ts`.
* **Scripts v1.15 qui couvrent la tranche** : tracker, hand, thumb, figures, realism, overlay, partial, placement,
  proms, protocols, equip (données), rom (données), movematch (hors suite, à lancer à la main) ; e2e overlay, rom.
* **Points d'attention** :
  * Données : interfaces dans `src/domains/<d>/data/types.ts`, exports `as const satisfies …` ; ne PAS ajouter de
    références inventées : les sources existantes dans les commentaires sont reprises telles quelles, le reste est noté
    `to_verify` dans un fichier `SOURCES.md` du dossier (ADR 0003) — pas de changement de valeurs.
  * `pose.js`/`hand.js` chargent MediaPipe via `CONFIG.mediapipeBase` (T2) : importer `../../www/js/config.js` jusqu'à
    l'intégration ; garder l'import dynamique non analysable (`/* @vite-ignore */`).
  * `figure.js` dépend de `i18n.js` (T2) pour `tr` : chemin legacy.
* **Acceptation spécifique** : A1–A8 ; `node tests/movematch.test.mjs` → « Bon exercice reconnu : 41/41 » inchangé ;
  e2e overlay/rom (avec modèles) : tous « ok ».

### T2 — Services, plateforme, logique métier et rapports
* **Fichiers** : `config.js`, `i18n.js`, `audio.js`, `offline.js`, `program.js`, `longterm.js`, `equip.js`, `store.js`,
  `coach.js`, `ai-coach.js`, `live.js`, `reportpdf.js`, `report.js` (et propriété de `lang/*.js` + `scripts/build-lang.mjs`
  si son chemin de sortie doit changer — sinon inchangé).
* **Cibles** : `src/core/config.ts`, `src/core/i18n/`, `src/platform/` (`assets.ts`, `audio.ts`, `offline.ts`,
  `speech.ts`, `files.ts`), `src/services/{auth,db,storage}/firebase/`, `src/services/db/local/`,
  `src/services/ai/gemini/` (`index.ts`, `live.ts`), `src/domains/rehab/` (`program.ts`, `longterm.ts`,
  `equipment.ts`, `coach.ts`, `ai-coach.ts`), `src/domains/outcomes/` (`report.ts`, `report-pdf.ts`),
  `src/ui/views/report.ts`.
* **Scripts v1.15** : gemini, ailang, live, sharedai, program, calendar (logique), longterm, maint, equip, badges
  (logique de programme), report.
* **Points d'attention** :
  * Implémenter réellement `AuthPort`/`DatabasePort`/`StoragePort` (Firebase) et `AiPort` (Gemini direct + relais) en
    remplaçant les squelettes `NotImplementedError` ; `store.js` (réexportation) garde ses fonctions publiques, qui
    délèguent aux adaptateurs. Firebase reste chargé depuis `www/vendor/firebase.js` (pas de nouvelle dépendance npm).
  * Migrations de `longterm.js` → `Migration` 0 → 1 (`src/core/schema.ts`), sans changer la forme stockée en v1.15.
  * `i18n.js` détient un état (langue courante) : un seul module chargé (chemins legacy partout ailleurs).
  * `reportpdf.js` garde sa branche Node (`node:fs`, `node:vm`) pour le test.
  * Aucun secret : la clé Gemini reste saisie par l'utilisateur ou fournie par le relais.
* **Acceptation spécifique** : A1–A8 ; tests unitaires Vitest des adaptateurs avec Firebase/Gemini simulés
  (aucun appel réseau) ; consentement image vérifié sur `createGeminiAi`.

### T3 — Interface : routeur, vues, composants, outcomes UI
* **Fichiers** : `state.js`, `ui.js`, `protocols-ui.js`, `badges.js`, `questionnaires.js`, `equipui.js`, `history.js`,
  `calendar.js`, `onboarding.js`, `session.js`, `rom.js`, `train.js`, `clinic.js`, `app.js`.
* **Cibles** : `src/ui/` (`app-state.ts`, `router.ts`, `components/`, `views/`), `src/domains/outcomes/`
  (`badges.ts`, `rom.ts`), `src/domains/rehab/` (`calendar.ts`, `training.ts`), `src/domains/clinic/rx.ts`.
* **Scripts v1.15** : badges, protocols (UI), rom, report (rom), equip (equipui) ; e2e camera, overlay (train), rom.
* **Points d'attention** :
  * Casser les deux cycles (tableau ci-dessus) ; extraire la logique pure des vues vers les domaines.
  * `app.js` reste chargé par `index.html` (`js/app.js`) : le module de réexportation **doit** garder ses effets de
    bord (démarrage) → `import '@src/ui/router.ts';` + `export * from …`.
  * Ne pas changer le DOM produit (la parité compare le texte de chaque écran) ni les sélecteurs utilisés par les e2e
    (`data-t`, `data-r`, `.bignum`, `#cnt`…).
* **Acceptation spécifique** : A1–A8 ; `npm run test:e2e:dist` : camera.e2e identique (1 échec connu sans modèles :
  « compte à rebours affiché », voir §6) ; parité étendue si de nouvelles routes sont touchées.

## 4. Intégration (orchestrateur, séquentielle, après les 3 tranches)

1. Remplacer dans `src/` les imports de chemins legacy par les cibles TypeScript ; `new-code-not-legacy` → `error`.
2. Exporter les API publiques depuis `src/domains/*/index.ts` ; brancher les adaptateurs dans `src/main.ts`.
3. `index.html` charge `js/v2/main.js` ; supprimer les modules de réexportation de `www/js` (mettre à jour
   `www/sw.js` : liste CORE et nom du cache) ; déplacer `www/js/lang` → `src/core/i18n/lang` (`scripts/build-lang.mjs`).
4. Convertir les scripts `tests/*.test.mjs` en tests Vitest (même assertions), retirer `tests/legacy.test.ts`.
5. Activer `checkJs`/retirer `allowJs` ; supprimer `tests/legacy-exports.spec.ts` et son instantané.
6. Activer minification + hachage dans `vite.config.ts` seulement après une nouvelle ADR (pré-cache généré).

## 5. Volets nouveaux (après T1–T3, derrière le drapeau `gait`)

`src/domains/gait`, `prosthetics`, `treatment`, `research` : nouveaux fichiers seulement (aucun conflit avec la
migration) ; données de `docs/gait-literature/` transcrites dans `src/domains/gait/data/` (ADR 0003).

## 6. Anomalies v1.15 relevées (ne pas corriger pendant la migration sans décision)

* `www/js/reportpdf.js` l. 50 : clé `' '` (espace fine) en double dans la table de remplacement des caractères
  (même valeur ; sans effet) — signalée par ESLint (`no-dupe-keys`, avertissement).
* `tests/camera.e2e.mjs` : « compte à rebours affiché » échoue quand les modèles MediaPipe sont absents et que le réseau
  bloque `storage.googleapis.com` (environnement de l'assistant) — identique sur `www` et `dist`.
* `tests/movematch.test.mjs` n'est pas dans la suite `npm test` (déjà le cas en v1.15).
